import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { parseRoster, type ParseResult } from '../../parse/rosterParse';
import type { Player } from '../../types';
import { loadIndex, searchSchools } from '../store';
import type { School } from '../../ohio/stateModel';
import { deriveVars, resizeLogo } from '../look';
import { parseSchedule, type ScheduleRow } from '../scheduleParse';
import { deleteRoster, upsertRoster, type RosterRow } from './adminApi';

/**
 * The parser already builds a full `Player` — id, number, name, position,
 * side, height, weight, grade — on `row.player`; this lifts it out of the row
 * wrapper (which also carries `issues` and the raw cells) into the exact
 * shape every card component keys on.
 *
 * A row the parser flagged with an issue (no number, no name, an unreadable
 * height…) is excluded, not merely noted: this screen is paste-once and
 * publish, with nobody editing a row in place the way the root app's Import
 * screen lets a coach do. A hollow player — blank number, blank name —
 * publishing into a paying customer's roster because the seller didn't
 * cross-check a count by eye is worse than the seller re-pasting a fixed
 * line. `skippedRows` below is what tells them which line to fix.
 */
export const toPlayers = (rows: ParseResult['rows']): Player[] =>
  rows.filter((r) => r.issues.length === 0).map((r) => ({ ...r.player }));

/** One row the paste couldn't turn into a player, and why. */
export type SkippedRow = { text: string; issue: string };

/**
 * The rows `toPlayers` left out, in a form the seller can match back to a
 * line in their paste: best-effort name when the parser found one, the raw
 * cells otherwise, plus the first (usually only) reason it was skipped.
 */
export const skippedRows = (rows: ParseResult['rows']): SkippedRow[] =>
  rows
    .filter((r) => r.issues.length > 0)
    .map((r) => {
      const name = [r.player.firstName, r.player.lastName].filter(Boolean).join(' ');
      const raw = r.raw.filter(Boolean).join(' ');
      return { text: name || raw || '(blank row)', issue: r.issues[0] };
    });

/**
 * The football season's own clock: July onward is this year's season, the
 * rest of the year is still last year's (playoffs run into December,
 * renewals happen the following spring). Both the default paid-through
 * date and a new row's season number read this same clock, so a seller who
 * changes the editable date field can never change which season the row
 * files under. Every sport files under the school year that starts that
 * fall, so July onward is the season year for winter and spring sports too
 * — their January games belong to the season labelled with the previous
 * autumn.
 */
const currentSeasonYear = (): number => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
};

/** Season + playoffs + slack. Next August this defaults right on its own. */
const defaultPaidThrough = (): string => `${currentSeasonYear() + 1}-02-01`;

/** "Today", as the plain ISO date the paid-through field itself uses. */
const todayIso = (): string => new Date().toISOString().slice(0, 10);

/**
 * adminApi's signed() throws the bare string "signed-out" for both a dead
 * token and a network blip that kept freshToken from answering — Manage.tsx
 * translates that sentinel before showing it, but Activate showed it
 * verbatim. Same translation here, so a seller mid-paste sees a sentence
 * instead of an internal token.
 */
const friendlyError = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  return message === 'signed-out'
    ? 'Signed out, or no signal — sign in again from the Manage screen and retry.'
    : message;
};

/**
 * The theme half of upsertRoster's contract, pulled out of save() so the
 * three cases can be pinned directly: a fresh upload sends `{logo}`, a
 * cleared logo sends `{}` (wipe the stored one), and neither sends `null`
 * (keep whatever is already stored — the renewal case, same contract as
 * `players`).
 */
export function themeArg(
  logoData: string | null,
  logoCleared: boolean,
): { logo: string } | Record<string, never> | null {
  if (logoData) return { logo: logoData };
  if (logoCleared) return {};
  return null;
}

/**
 * The schedule half of upsertRoster's contract, themeArg's twin: a fresh
 * paste sends the rows, a cleared schedule sends [] (wipe the stored one),
 * and neither sends null (keep whatever is stored — the renewal case).
 */
export function scheduleArg(rows: ScheduleRow[], cleared: boolean): ScheduleRow[] | [] | null {
  if (rows.length) return rows;
  if (cleared) return [];
  return null;
}

/**
 * The whole concierge job on one screen: pick the school, paste the
 * spreadsheet, look at what the parser made of it, set the colors and the
 * paid-through date, publish. The parser is the same one the root app has
 * trusted all season; this screen adds nothing to it but eyes.
 */
export function Activate({ existing, onDone }: { existing: RosterRow | null; onDone: () => void }) {
  const [schools, setSchools] = useState<School[]>([]);
  const [slugQuery, setSlugQuery] = useState('');
  const [slug, setSlug] = useState(existing?.school_slug ?? '');
  const [sport, setSport] = useState(existing?.sport ?? 'football');
  const [pasted, setPasted] = useState('');
  const [schedulePasted, setSchedulePasted] = useState('');
  const [scheduleCleared, setScheduleCleared] = useState(false);
  const [ground, setGround] = useState(existing?.colors?.ground ?? '#04043a');
  const [accent, setAccent] = useState(existing?.colors?.accent ?? '#4fbaf7');
  const [paidThrough, setPaidThrough] = useState(existing?.paid_through ?? defaultPaidThrough());
  const [note, setNote] = useState(existing?.note ?? '');
  // logoData is a fresh upload's data URI; logoCleared marks "drop the
  // stored one". Sent to upsertRoster as: logoData → {logo}; logoCleared →
  // {} (wipe); neither → null (keep whatever is already stored — the
  // renewal case, same contract as `players`).
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoCleared, setLogoCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasStoredLogo = Boolean(existing?.has_logo) && !logoCleared;
  const showRemove = Boolean(logoData) || hasStoredLogo;

  const onLogoFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const resized = await resizeLogo(file);
      setLogoData(resized);
      setLogoCleared(false);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const removeLogo = () => {
    setLogoData(null);
    setLogoCleared(true);
  };

  const previewStyle = useMemo(
    () => deriveVars({ ground, accent, logo: logoData ?? undefined }) as unknown as CSSProperties,
    [ground, accent, logoData],
  );

  useEffect(() => {
    loadIndex().then(setSchools).catch(() => setSchools([]));
  }, []);

  const parsed = useMemo(() => (pasted.trim() ? parseRoster(pasted) : null), [pasted]);
  const players = useMemo(() => (parsed ? toPlayers(parsed.rows) : []), [parsed]);
  const skipped = useMemo(() => (parsed ? skippedRows(parsed.rows) : []), [parsed]);

  const effectiveSport = existing?.sport ?? sport;
  const schedParsed = useMemo(
    () => (effectiveSport !== 'football' && schedulePasted.trim()
      ? parseSchedule(schedulePasted, existing?.season ?? currentSeasonYear())
      : null),
    [effectiveSport, schedulePasted, existing],
  );

  const hits = useMemo(
    () => (slug ? [] : searchSchools(schools, slugQuery).slice(0, 8)),
    [schools, slugQuery, slug],
  );

  // Editing an existing school keeps its roster unless a new paste replaces
  // it: a save with no paste sends null and the database keeps what it has.
  // That is the renewal flow — new date, new note, roster untouched.
  const canSave = Boolean(slug) && (players.length > 0 || Boolean(existing));

  const save = async (published: boolean) => {
    // Publishing with a paid-through date already in the past would "succeed"
    // and then sit dark — the fetch function refuses anything past its date
    // the instant it is asked. Catch that here, in a sentence, rather than
    // let the seller discover it from a fan's text later.
    if (published && paidThrough < todayIso()) {
      setError('Paid through is already in the past — the page would publish dark. Pick a later date first.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await upsertRoster({
        slug,
        sport: effectiveSport,
        season: existing?.season ?? currentSeasonYear(),
        players: players.length ? players : null,
        colors: { ground, accent },
        theme: themeArg(logoData, logoCleared),
        schedule: scheduleArg(schedParsed?.rows ?? [], scheduleCleared),
        published,
        paidThrough,
        note,
      });
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <h1 className="next-card-opponent">{existing ? existing.school_slug : 'Activate a school'}</h1>

      {!existing && !slug && (
        <>
          <input
            className="search"
            type="search"
            value={slugQuery}
            onChange={(e) => setSlugQuery(e.target.value)}
            placeholder="Which school?"
            aria-label="Search for the school"
          />
          {hits.map((s) => (
            <button
              key={s.slug}
              type="button"
              className="fixture-row is-plain"
              onClick={() => setSlug(s.slug)}
            >
              <span className="fixture-team">
                {s.name}
                <span className="fixture-sub">{s.city}</span>
              </span>
            </button>
          ))}
        </>
      )}

      {(slug || existing) && (
        <>
          {!existing && <p className="filter-line"><span>{slug}</span></p>}

          {!existing && (
            <label className="mg-field">
              Sport{' '}
              <select value={sport} onChange={(e) => setSport(e.target.value)}>
                {['football', 'volleyball', 'soccer', 'cross country', 'golf', 'tennis', 'cheer',
                  'basketball', 'wrestling', 'swimming', 'hockey', 'bowling',
                  'baseball', 'softball', 'track', 'lacrosse'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          )}

          <textarea
            className="mg-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={
              existing
                ? 'Paste to replace the roster, or leave empty to keep it'
                : 'Paste the roster rows here'
            }
            rows={6}
          />

          {parsed && (
            <>
              <p className="filter-line">
                <span>
                  {players.length} players read
                  {skipped.length > 0 && ` · ${skipped.length} rows skipped`}
                </span>
              </p>
              {skipped.length > 0 && (
                <div className="mg-skip">
                  {skipped.map((s, i) => (
                    <div className="mg-skip-row" key={i}>
                      {s.text} — {s.issue}
                    </div>
                  ))}
                </div>
              )}
              <div className="mg-review">
                {players.slice(0, 60).map((p) => (
                  <div className="mg-review-row" key={p.id}>
                    <b>#{p.number}</b> {p.firstName} {p.lastName}
                    <span className="fixture-sub">
                      {p.position}
                      {p.grade && ` · ${p.grade}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {effectiveSport !== 'football' && (
            <>
              <textarea
                className="mg-paste"
                value={schedulePasted}
                onChange={(e) => setSchedulePasted(e.target.value)}
                placeholder={
                  existing?.has_schedule
                    ? 'Paste to replace the schedule, or leave empty to keep it'
                    : 'Paste the schedule rows here — date, opponent, time'
                }
                rows={6}
              />

              {schedParsed && (
                <>
                  <p className="filter-line">
                    <span>
                      {schedParsed.rows.length} games read
                      {schedParsed.skipped.length > 0 && ` · ${schedParsed.skipped.length} rows skipped`}
                    </span>
                  </p>
                  {schedParsed.skipped.length > 0 && (
                    <div className="mg-skip">
                      {schedParsed.skipped.map((s, i) => (
                        <div className="mg-skip-row" key={i}>
                          {s.text} — {s.issue}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {existing?.has_schedule && !scheduleCleared && !schedParsed && (
                <span className="fixture-sub">Has a schedule</span>
              )}

              {(Boolean(schedParsed?.rows.length) || (existing?.has_schedule && !scheduleCleared)) && (
                <button
                  type="button"
                  className="fixture-row is-plain"
                  onClick={() => {
                    setSchedulePasted('');
                    setScheduleCleared(true);
                  }}
                >
                  <span className="fixture-team">Remove schedule</span>
                </button>
              )}
            </>
          )}

          <div className="mg-colors">
            <label>
              Ground <input type="color" value={ground} onChange={(e) => setGround(e.target.value)} />
            </label>
            <label>
              Accent <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
            </label>
          </div>

          <div className="mg-logo">
            <label className="mg-field">
              School logo{' '}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  void onLogoFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {logoData && <img className="mg-logo-thumb" src={logoData} alt="New logo" />}
            {!logoData && hasStoredLogo && <span className="fixture-sub">Has a logo</span>}
            {!logoData && !hasStoredLogo && logoCleared && (
              <span className="fixture-sub">Logo removed</span>
            )}
            {showRemove && (
              <button type="button" className="fixture-row is-plain" onClick={removeLogo}>
                <span className="fixture-team">Remove logo</span>
              </button>
            )}
          </div>

          <div className="mg-preview" style={previewStyle}>
            <p className="filter-line"><span>How the page will look</span></p>
            <div className="mg-preview-strip">
              <span className="mg-preview-swatch mg-preview-surface" />
              <span className="mg-preview-swatch mg-preview-accent" />
              <span className="mg-preview-text">Aa</span>
            </div>
          </div>

          <label className="mg-field">
            Paid through{' '}
            <input type="date" value={paidThrough} onChange={(e) => setPaidThrough(e.target.value)} />
          </label>
          <input
            className="search"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Payment note — check #, who paid"
            aria-label="Payment note"
          />

          {error && <p className="empty-text">{error}</p>}

          <button type="button" className="fixture-row is-plain" disabled={busy || !canSave}
            onClick={() => save(true)}>
            <span className="fixture-team">Publish</span>
          </button>
          <button type="button" className="fixture-row is-plain" disabled={busy || !canSave}
            onClick={() => save(false)}>
            <span className="fixture-team">Save unpublished</span>
          </button>
          {existing && (
            <button type="button" className="fixture-row is-plain" disabled={busy}
              onClick={() => {
                if (!confirm(`Delete ${existing.school_slug} ${existing.season} entirely?`)) return;
                deleteRoster(existing.school_slug, existing.sport, existing.season)
                  .then(onDone)
                  .catch((e: Error) => setError(friendlyError(e)));
              }}>
              <span className="fixture-team">Delete this roster</span>
            </button>
          )}
        </>
      )}

      <button type="button" className="fixture-row is-plain" onClick={onDone}>
        <span className="fixture-team">Back</span>
      </button>
    </div>
  );
}
