import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { School } from '../../ohio/stateModel';
import { deriveVars, resizeLogo } from '../look';
import { loadSchoolSports } from '../rosterStore';
import { upsertRoster, type RosterRow } from './adminApi';
import { currentSeasonYear, defaultPaidThrough, friendlyError, themeArg, todayIso } from './saveArgs';
import { capital, longDate, renewedThrough, schoolStatus, STATUS_LABEL } from './schools';
import { SportCard } from './SportCard';

const DEFAULT_COLORS = { ground: '#04043a', accent: '#4fbaf7' };

type Section = 'look' | 'billing';
type Upsert = Parameters<typeof upsertRoster>[0];

/** A row's own facts, sent back unchanged around whichever one is being edited.
 * `p_colors` is the one argument with no "keep", so it is always spelled out. */
const unchanged = (row: RosterRow, colors: { ground: string; accent: string }): Upsert => ({
  slug: row.school_slug,
  sport: row.sport,
  season: row.season,
  players: null,
  colors: row.colors ?? colors,
  theme: null,
  schedule: null,
  league: null,
  published: row.published,
  paidThrough: row.paid_through,
  note: row.note,
});

/**
 * One school: how it looks, what it is paid to, and a card for each sport.
 *
 * The database keeps colors, crest, date and note on every sport's row, and
 * the first panel edited them there, a sport at a time — which is how a school
 * ends up orange in the autumn and navy in the winter. They are the school's.
 * So Look and Billing are edited once here and written to the school's rows,
 * and a sport's own card is left with what really is the sport's.
 *
 * Each section saves itself. One Save for the whole page would be several
 * database calls pretending to be one, and the failure that matters — the
 * third of four rows refused — would leave the page saying something had been
 * saved without being able to say what.
 *
 * A school being activated has no row yet, so there is nothing for Look and
 * Billing to save to: they are shown without their buttons, and what is set in
 * them goes in with the first sport.
 */
export function SchoolPage({
  slug,
  rows,
  schools,
  listError,
  onRefresh,
  onBack,
}: {
  slug: string;
  /** This school's rows, football first. Empty for a school being activated. */
  rows: RosterRow[];
  schools: School[];
  /** Why the last re-read of the list failed, if it did: what is on this page may be out of date. */
  listError: string | null;
  /** Re-reads the list; the page stays where it is and gets fresh `rows`. */
  onRefresh: () => Promise<void>;
  onBack: () => void;
}) {
  const school = schools.find((s) => s.slug === slug);
  const name = school?.name ?? slug;
  const isNew = rows.length === 0;
  const stored = rows.find((r) => r.colors)?.colors ?? null;
  const today = todayIso();

  const [ground, setGround] = useState(stored?.ground ?? DEFAULT_COLORS.ground);
  const [accent, setAccent] = useState(stored?.accent ?? DEFAULT_COLORS.accent);
  // themeArg's three states: a fresh upload sets it, cleared wipes it, neither keeps it.
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoCleared, setLogoCleared] = useState(false);
  // The crest as fans see it now, for the preview and for a new sport to start
  // with. The list only says that one exists; the picture comes through the
  // public door, which answers for a published, paid school and for no other.
  const [storedLogo, setStoredLogo] = useState<string | null>(null);

  /*
   * Only the newest season of each sport is what the school is paying for now.
   * Last year's row is kept for the record and is shadowed on the fan page;
   * moving its date forward along with the rest would bring it back the day
   * this year's was unpublished.
   */
  const current = useMemo(
    () => rows.filter((r) => !rows.some((o) => o.sport === r.sport && o.season > r.season)),
    [rows],
  );
  const latest = current.reduce<string | null>(
    (d, r) => (d === null || r.paid_through > d ? r.paid_through : d),
    null,
  );
  const storedNote = current.find((r) => r.note)?.note ?? '';
  const mixedDates = current.some((r) => r.paid_through !== latest);

  const [paidThrough, setPaidThrough] = useState(latest ?? defaultPaidThrough());
  const [note, setNote] = useState(storedNote);

  const [adding, setAdding] = useState(isNew);
  const [openKey, setOpenKey] = useState<string | null>(
    rows.length === 1 ? `${rows[0].sport}-${rows[0].season}` : null,
  );
  // 'reload' covers the moment after a card's own save, while the list is being
  // read again: Look and Billing send each row's stored published flag, date
  // and note back, and from a list one save behind they would undo that save.
  const [busy, setBusy] = useState<Section | 'reload' | null>(null);
  const [error, setError] = useState<{ where: Section; text: string } | null>(null);
  const [saved, setSaved] = useState<Section | null>(null);

  const hasStoredLogo = rows.some((r) => r.has_logo);
  useEffect(() => {
    if (!hasStoredLogo) return;
    let live = true;
    loadSchoolSports(slug)
      .then((identity) => {
        if (live) setStoredLogo(identity?.logo ?? null);
      })
      .catch(() => {
        /* the preview goes without a crest */
      });
    return () => {
      live = false;
    };
  }, [slug, hasStoredLogo]);

  const shownLogo = logoData ?? (logoCleared ? null : storedLogo);
  const previewStyle = useMemo(
    () => deriveVars({ ground, accent, logo: shownLogo ?? undefined }) as unknown as CSSProperties,
    [ground, accent, shownLogo],
  );

  const lookDirty =
    ground !== (stored?.ground ?? DEFAULT_COLORS.ground) ||
    accent !== (stored?.accent ?? DEFAULT_COLORS.accent) ||
    logoData !== null ||
    logoCleared;
  const dateDirty = paidThrough !== (latest ?? defaultPaidThrough());
  const noteDirty = note !== storedNote;
  const billingDirty = dateDirty || noteDirty;

  const reload = async () => {
    setBusy('reload');
    await onRefresh().catch(() => undefined);
    setBusy(null);
  };

  /** One row after another, stopping at the first refusal and saying how far
   * it got — a school half-painted should be a sentence, not a guess. */
  const toRows = async (
    where: Section,
    targets: RosterRow[],
    change: (row: RosterRow) => Partial<Upsert>,
  ): Promise<boolean> => {
    setBusy(where);
    setError(null);
    setSaved(null);
    let done = 0;
    let ok = false;
    try {
      for (const row of targets) {
        await upsertRoster({ ...unchanged(row, { ground, accent }), ...change(row) });
        done += 1;
      }
      setSaved(where);
      ok = true;
    } catch (e) {
      const sofar =
        done > 0 ? ` ${done} of ${targets.length} sports were saved before it stopped; save again to finish.` : '';
      setError({ where, text: `${friendlyError(e)}${sofar}` });
    } finally {
      await onRefresh().catch(() => undefined);
      setBusy(null);
    }
    return ok;
  };

  const saveLook = () =>
    toRows('look', rows, () => ({ colors: { ground, accent }, theme: themeArg(logoData, logoCleared) })).then((ok) => {
      // A refused save keeps the upload in hand, so saving again sends it again.
      if (!ok) return;
      if (logoData) setStoredLogo(logoData);
      if (logoCleared) setStoredLogo(null);
      setLogoData(null);
      setLogoCleared(false);
    });

  const saveBilling = () => {
    // A date moved into the past switches every published sport off at once.
    if (
      dateDirty &&
      paidThrough < today &&
      current.some((r) => r.published) &&
      !confirm('That date is in the past, so the school’s pages go dark as soon as this saves. Save it anyway?')
    ) {
      return;
    }
    // Only what was changed is sent. A note corrected on a school whose
    // basketball lapsed in March must not bring basketball back by re-dating it.
    void toRows('billing', current, () => ({
      ...(dateDirty ? { paidThrough } : {}),
      ...(noteDirty ? { note } : {}),
    }));
  };

  const takeDown = () => {
    if (
      !confirm(
        `Unpublish every sport for ${name}? Fans go back to the free directory page. Nothing is deleted, and publishing a sport again brings it back.`,
      )
    ) {
      return;
    }
    void toRows('billing', rows, () => ({ published: false }));
  };

  const onLogoFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setLogoData(await resizeLogo(file));
      setLogoCleared(false);
    } catch (e) {
      setError({ where: 'look', text: friendlyError(e) });
    }
  };

  const status = isNew ? 'unpublished' : schoolStatus(rows, today);
  const address = `${location.origin}/oh/?school=${slug}`;
  const firstSport = rows[0]?.sport;
  const season = currentSeasonYear();

  return (
    <>
      <div className="mg-crumbs">
        <button type="button" className="mg-link" onClick={onBack}>
          ‹ Schools
        </button>
      </div>

      <header className="mg-school-head">
        <div>
          <h1 className="mg-h1">{name}</h1>
          <p className="mg-sub">
            {school?.city && `${school.city} · `}
            <a href={address} target="_blank" rel="noreferrer">
              /oh/?school={slug}
            </a>
          </p>
        </div>
        <span className={`mg-pill is-${status}`}>{isNew ? 'New' : STATUS_LABEL[status]}</span>
      </header>

      {listError && (
        <p className="mg-error mg-banner">
          Couldn’t re-read the list, so this page may be behind what is stored: {listError}
        </p>
      )}

      <div className="mg-grid">
        <div className="mg-main">
          <section className="mg-card">
            <h2 className="mg-card-title">Look</h2>
            <div className="mg-look">
              <label className="mg-swatch">
                <input type="color" value={ground} onChange={(e) => setGround(e.target.value)} />
                Ground
              </label>
              <label className="mg-swatch">
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
                Accent
              </label>
              <label className="mg-btn is-small mg-file">
                {hasStoredLogo || logoData ? 'Replace crest' : 'Upload a crest'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    void onLogoFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {(logoData || (hasStoredLogo && !logoCleared)) && (
                <button
                  type="button"
                  className="mg-btn is-small is-quiet"
                  onClick={() => {
                    setLogoData(null);
                    setLogoCleared(!isNew);
                  }}
                >
                  Remove crest
                </button>
              )}
            </div>
            <p className="mg-hint">
              {isNew
                ? 'Saved with the first sport, and used for every sport after it.'
                : logoCleared
                  ? 'The crest will be removed when you save.'
                  : logoData
                    ? 'New crest ready. It replaces the old one when you save.'
                    : 'One look for every sport. Saving writes it to all of them.'}
            </p>
            {error?.where === 'look' && <p className="mg-error">{error.text}</p>}
            {!isNew && (
              <div className="mg-card-foot">
                {saved === 'look' && !lookDirty && <span className="mg-saved">Saved</span>}
                <span className="mg-spacer" />
                <button
                  type="button"
                  className={`mg-btn${lookDirty ? ' is-primary' : ''}`}
                  disabled={busy !== null || !lookDirty}
                  onClick={() => void saveLook()}
                >
                  {busy === 'look' ? 'Saving…' : 'Save look'}
                </button>
              </div>
            )}
          </section>

          {rows.map((row) => {
            const key = `${row.sport}-${row.season}`;
            return (
              <SportCard
                key={key}
                slug={slug}
                row={row}
                taken={[]}
                colors={{ ground, accent }}
                billing={{ paidThrough, note }}
                schoolPaidThrough={latest}
                crest={null}
                schools={schools}
                open={openKey === key}
                onToggle={() => setOpenKey(openKey === key ? null : key)}
                onSaved={() => void reload()}
              />
            );
          })}

          {adding ? (
            <SportCard
              key="new"
              slug={slug}
              row={null}
              // A sport whose only row is a past season's can be added again:
              // that is how next year's roster starts.
              taken={rows.filter((r) => r.season === season).map((r) => r.sport)}
              colors={{ ground, accent }}
              billing={{ paidThrough, note }}
              schoolPaidThrough={latest}
              crest={logoData ?? (logoCleared ? null : storedLogo)}
              schools={schools}
              open
              onToggle={() => undefined}
              onSaved={() => {
                setAdding(false);
                // A first sport carried the crest in with it; it is stored now.
                if (isNew && logoData) {
                  setStoredLogo(logoData);
                  setLogoData(null);
                }
                void reload();
              }}
              onCancel={isNew ? onBack : () => setAdding(false)}
            />
          ) : (
            <div>
              <button type="button" className="mg-btn" onClick={() => setAdding(true)}>
                + Add a sport
              </button>
            </div>
          )}

          <section className="mg-card">
            <h2 className="mg-card-title">Billing</h2>
            <div className="mg-part">
              <div className="mg-part-label">Paid through</div>
              <div className="mg-part-body">
                <div className="mg-inline">
                  <input
                    className="mg-input mg-date"
                    type="date"
                    value={paidThrough}
                    onChange={(e) => setPaidThrough(e.target.value)}
                    aria-label="Paid through"
                  />
                  <button
                    type="button"
                    className="mg-btn is-small"
                    onClick={() => setPaidThrough(renewedThrough(latest, today))}
                  >
                    Renew a year
                  </button>
                </div>
                <p className="mg-hint">
                  {isNew
                    ? 'Saved with the first sport.'
                    : mixedDates
                      ? `Sports are paid to different dates: ${current
                          .map((r) => `${capital(r.sport)} ${longDate(r.paid_through)}`)
                          .join(' · ')}. Changing this date moves all of them.`
                      : latest && latest < today
                        ? `Ran out ${longDate(latest)}. Nothing shows until this moves forward.`
                        : 'Every sport is shown through this date, then goes dark by itself.'}
                </p>
              </div>
            </div>
            <div className="mg-part">
              <div className="mg-part-label">Note</div>
              <div className="mg-part-body">
                <input
                  className="mg-input"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Check number, who paid"
                  aria-label="Payment note"
                />
              </div>
            </div>
            {error?.where === 'billing' && <p className="mg-error">{error.text}</p>}
            {!isNew && (
              <div className="mg-card-foot">
                {rows.some((r) => r.published) && (
                  <button type="button" className="mg-btn is-small is-danger" disabled={busy !== null} onClick={takeDown}>
                    Take this school down
                  </button>
                )}
                {saved === 'billing' && !billingDirty && <span className="mg-saved">Saved</span>}
                <span className="mg-spacer" />
                <button
                  type="button"
                  className={`mg-btn${billingDirty ? ' is-primary' : ''}`}
                  disabled={busy !== null || !billingDirty}
                  onClick={saveBilling}
                >
                  {busy === 'billing' ? 'Saving…' : 'Save billing'}
                </button>
              </div>
            )}
          </section>
        </div>

        <aside className="mg-aside">
          <p className="mg-hint">How the page will look</p>
          {/* The fan page's own variables on a sketch of its header and one
              row — the real arithmetic in these two colors, but only a sketch
              of the page, and the link under it is the page. */}
          <div className="mg-preview" style={previewStyle}>
            <div className="mg-preview-head">
              {shownLogo && <img className="mg-preview-crest" src={shownLogo} alt="" />}
              <div>
                <div className="mg-preview-name">{name}</div>
                <div className="mg-preview-city">{school?.city ?? ''}</div>
              </div>
            </div>
            <div className="mg-preview-tabs">
              <span className="is-on">Lookup</span>
              <span>Team</span>
              <span>Schedule</span>
            </div>
            <div className="mg-preview-row">
              <span className="mg-preview-number">17</span>
              <span>
                <span className="mg-preview-player">Player Name</span>
                <span className="mg-preview-details">WR/DB · 5'10" · Jr</span>
              </span>
            </div>
          </div>
          <a className="mg-link" href={address} target="_blank" rel="noreferrer">
            Open the fan page ↗
          </a>
          {firstSport && status !== 'live' && status !== 'attention' && (
            <p className="mg-hint">
              Fans see only the free directory page until {capital(firstSport)} or another sport is published and paid
              for.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
