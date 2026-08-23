import { useEffect, useMemo, useState } from 'react';
import { parseRoster, type ParseResult } from '../../parse/rosterParse';
import type { Player } from '../../types';
import { loadIndex, searchSchools } from '../store';
import type { School } from '../../ohio/stateModel';
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

/** Season + playoffs + slack. Next August this defaults right on its own. */
const defaultPaidThrough = (): string => {
  const now = new Date();
  const seasonYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${seasonYear + 1}-02-01`;
};

const seasonOf = (paidThrough: string): number => Number(paidThrough.slice(0, 4)) - 1;

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
  const [pasted, setPasted] = useState('');
  const [ground, setGround] = useState(existing?.colors?.ground ?? '#04043a');
  const [accent, setAccent] = useState(existing?.colors?.accent ?? '#4fbaf7');
  const [paidThrough, setPaidThrough] = useState(existing?.paid_through ?? defaultPaidThrough());
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndex().then(setSchools).catch(() => setSchools([]));
  }, []);

  const parsed = useMemo(() => (pasted.trim() ? parseRoster(pasted) : null), [pasted]);
  const players = useMemo(() => (parsed ? toPlayers(parsed.rows) : []), [parsed]);
  const skipped = useMemo(() => (parsed ? skippedRows(parsed.rows) : []), [parsed]);
  const hits = useMemo(
    () => (slug ? [] : searchSchools(schools, slugQuery).slice(0, 8)),
    [schools, slugQuery, slug],
  );

  // Editing an existing school keeps its roster unless a new paste replaces
  // it: a save with no paste sends null and the database keeps what it has.
  // That is the renewal flow — new date, new note, roster untouched.
  const canSave = Boolean(slug) && (players.length > 0 || Boolean(existing));

  const save = async (published: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await upsertRoster({
        slug,
        sport: existing?.sport ?? 'football',
        season: existing?.season ?? seasonOf(paidThrough),
        players: players.length ? players : null,
        colors: { ground, accent },
        published,
        paidThrough,
        note,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
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

          <div className="mg-colors">
            <label>
              Ground <input type="color" value={ground} onChange={(e) => setGround(e.target.value)} />
            </label>
            <label>
              Accent <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
            </label>
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
                  .catch((e: Error) => setError(e.message));
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
