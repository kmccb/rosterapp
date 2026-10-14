import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { School } from '../../ohio/stateModel';
import { parseRoster } from '../../parse/rosterParse';
import { stripBom } from '../../sync/rosterCheck';
import { loadSchoolRoster } from '../rosterStore';
import { parseSchedule } from '../scheduleParse';
import { searchSchools } from '../store';
import { deleteRoster, setStatsSource, upsertRoster, type RosterRow } from './adminApi';
import {
  currentSeasonYear,
  friendlyError,
  leagueArg,
  rosterSaveArg,
  scheduleSaveArg,
  skippedRows,
  todayIso,
  toPlayers,
} from './saveArgs';
import { loadLeagueSuggestion, type LeagueSuggestion } from './leagueSuggest';
import { capital, rowIsLive, SPORTS } from './schools';
import { Sources } from './SourceLinks';
import { rowProblems } from './sources';

/** One labelled line of a card: what it is on the left, the state of it and
 * whatever changes it on the right. */
function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mg-part">
      <div className="mg-part-label">{label}</div>
      <div className="mg-part-body">{children}</div>
    </div>
  );
}

const MAXPREPS = /^https:\/\/www\.maxpreps\.com\/\S+$/;

/**
 * Where the season's stats come from. Its own control with its own button,
 * because it is its own call: the link is not part of what Save sends, and a
 * seller who pastes one and presses the card's Save would otherwise leave
 * believing it had been set.
 */
function StatsSource({ row, onSaved }: { row: RosterRow; onSaved: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = row.stats_source_url ?? null;

  const run = (next: string | null) => {
    setBusy(true);
    setError(null);
    setStatsSource({ slug: row.school_slug, sport: row.sport, season: row.season, url: next })
      .then(() => {
        setUrl('');
        onSaved();
      })
      .catch((e: unknown) => setError(friendlyError(e)))
      .finally(() => setBusy(false));
  };

  if (current) {
    return (
      <>
        <p className="mg-state">From MaxPreps, checked four mornings a week.</p>
        <p className="mg-hint mg-url">{current}</p>
        <div className="mg-actions">
          <button type="button" className="mg-btn is-small is-quiet" disabled={busy} onClick={() => run(null)}>
            Remove
          </button>
        </div>
        {error && <p className="mg-error">{error}</p>}
      </>
    );
  }

  const clean = url.trim();
  const problem = clean && !MAXPREPS.test(clean) ? 'That isn’t a www.maxpreps.com address.' : null;

  return (
    <>
      <p className="mg-state">No link set.</p>
      <div className="mg-inline">
        <input
          className="mg-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.maxpreps.com/oh/town/school-mascot/football/"
          aria-label="MaxPreps stats link"
        />
        <button
          type="button"
          className="mg-btn is-small"
          disabled={busy || !clean || Boolean(problem)}
          onClick={() => run(clean)}
        >
          {busy ? 'Working…' : 'Set'}
        </button>
      </div>
      <p className="mg-hint">
        Open the team’s football page on MaxPreps and copy its address. Stats appear after the next scheduled run, and
        the conference can then be filled in from MaxPreps too.
      </p>
      {(problem || error) && <p className="mg-error">{problem ?? error}</p>}
    </>
  );
}

/**
 * One sport of one school: its roster, its schedule, where its stats come
 * from, its conference, and whether anybody can see it.
 *
 * This is the old Activate form with the school's own facts taken out of it —
 * colors, crest, the date and the note are the school's now and live on the
 * page above. What is left is what differs sport to sport, and it keeps
 * Activate's rule for every argument it sends: nothing typed means keep what
 * is stored (`saveArgs.ts`).
 *
 * `row` is null for a sport being added; it becomes a row on its first save
 * and the parent hands it back in. The card is not remounted when that
 * happens — saving the school's colors refreshes every row, and a roster
 * pasted here and not yet saved must survive that — so a save clears its own
 * boxes instead.
 */
export function SportCard({
  slug,
  row,
  taken,
  colors,
  billing,
  schoolPaidThrough,
  crest,
  schools,
  open,
  onToggle,
  onSaved,
  onCancel,
}: {
  slug: string;
  row: RosterRow | null;
  /** Sports this school already has, which a new card must not offer again. */
  taken: string[];
  /** The school's colors, for a row that has none of its own; `p_colors` has no "keep", so every save sends some. */
  colors: { ground: string; accent: string; text?: string };
  /** The school's date and note as they stand on the page, for a sport that has no row of its own yet. */
  billing: { paidThrough: string; note: string };
  /** The latest date any of the school's sports is stored as paid to. */
  schoolPaidThrough: string | null;
  /** The school's crest, when the page has it in hand, for a new sport to start with. */
  crest: string | null;
  schools: School[];
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const free = useMemo(() => SPORTS.filter((s) => !taken.includes(s)), [taken]);
  const [newSport, setNewSport] = useState(free[0] ?? 'football');
  const sport = row?.sport ?? newSport;
  const season = row?.season ?? currentSeasonYear();
  const football = sport === 'football';

  const [pasted, setPasted] = useState('');
  const [schedulePasted, setSchedulePasted] = useState('');
  const [scheduleCleared, setScheduleCleared] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [leagueMembers, setLeagueMembers] = useState<string[]>([]);
  const [leagueQuery, setLeagueQuery] = useState('');
  const [leagueCleared, setLeagueCleared] = useState(false);
  const [linked, setLinked] = useState({
    roster: Boolean(row?.roster_source_url),
    schedule: Boolean(row?.schedule_source_url),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The stored conference, so it can be edited rather than retyped. The list
   * the panel is built from only says that one exists; its name and members
   * come back through the fan page's own door, which answers for a published,
   * paid row and for nothing else. So this fills the form in when it can, and
   * when it cannot the form stays empty under a line saying a conference is
   * stored — exactly what it did before. Never over anything already typed.
   */
  const leagueTouched = useRef(false);

  /*
   * The conference as MaxPreps lists it, when the stats job has left one on
   * file for this team. Offered, never applied: the button puts it in the form
   * below, where it is looked at and saved like anything typed there.
   */
  const [suggested, setSuggested] = useState<LeagueSuggestion | null>(null);
  const known = useMemo(() => new Set(schools.map((s) => s.slug)), [schools]);
  useEffect(() => {
    setSuggested(null);
    if (!football || known.size === 0) return;
    let current = true;
    loadLeagueSuggestion(slug, sport, known)
      .then((found) => {
        if (current) setSuggested(found);
      })
      .catch(() => {
        /* no suggestion is the ordinary case */
      });
    return () => {
      current = false;
    };
  }, [slug, sport, football, known]);
  useEffect(() => {
    if (!row?.has_league || !rowIsLive(row, todayIso())) return;
    let current = true;
    loadSchoolRoster(row.school_slug, row.sport)
      .then((stored) => {
        // The door answers for the newest live season; an older season's
        // card must not be handed the newer one's conference to save.
        if (!current || leagueTouched.current || !stored?.league || stored.season !== row.season) return;
        setLeagueName(stored.league.name);
        setLeagueMembers(stored.league.members);
      })
      .catch(() => {
        /* the form stays empty, and an empty form keeps what is stored */
      });
    return () => {
      current = false;
    };
    // Keyed on what decides the answer, not on the row object: every refresh
    // hands in a new one, and this must not ask again each time.
  }, [row?.school_slug, row?.sport, row?.has_league, row?.published, row?.paid_through]);
  const touchLeague = () => {
    leagueTouched.current = true;
    setLeagueCleared(false);
  };

  const parsed = useMemo(() => (pasted.trim() ? parseRoster(pasted) : null), [pasted]);
  const players = useMemo(() => (parsed ? toPlayers(parsed.rows) : []), [parsed]);
  const skipped = useMemo(() => (parsed ? skippedRows(parsed.rows) : []), [parsed]);
  const schedParsed = useMemo(
    () => (!football && schedulePasted.trim() ? parseSchedule(schedulePasted, season) : null),
    [football, schedulePasted, season],
  );

  const leagueHits = useMemo(
    () =>
      searchSchools(schools, leagueQuery)
        .filter((s) => s.slug !== slug && !leagueMembers.includes(s.slug))
        .slice(0, 6),
    [schools, leagueQuery, slug, leagueMembers],
  );
  const schoolName = (memberSlug: string): string =>
    schools.find((s) => s.slug === memberSlug)?.name ?? memberSlug;

  /*
   * What this save is paid to. A row keeps its own date. The exception is a
   * sport that has lapsed at a school that has since been renewed: publishing
   * it means "show this too", so it takes the date the school is paid to
   * rather than being refused for a date nobody can edit from here.
   */
  const paidFor = (published: boolean): string => {
    if (!row) return billing.paidThrough;
    const today = todayIso();
    if (published && row.paid_through < today && schoolPaidThrough && schoolPaidThrough >= today) {
      return schoolPaidThrough;
    }
    return row.paid_through;
  };

  const save = async (published: boolean) => {
    // Publishing past its date would "succeed" and then sit dark — the fetch
    // refuses anything past its date the instant it is asked.
    const paidThrough = paidFor(published);
    if (published && paidThrough < todayIso()) {
      setError('Paid through is already in the past, so the page would publish dark. Renew the school under Billing first.');
      return;
    }
    // The database refuses an empty published roster; say it in a sentence here.
    if (published && !row && players.length === 0) {
      setError('Add a roster before publishing, or save it unpublished and link a Google Sheet.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await upsertRoster({
        slug,
        sport,
        season,
        players: rosterSaveArg(players, linked.roster),
        colors: row?.colors ?? colors,
        // The crest is the school's. Null keeps this row's copy. A new sport
        // starts with the school's when the page has it, because the fan page
        // only borrows a crest from a row that is live — without a copy of
        // its own, this sport would lose it the day football came down.
        theme: row ? null : crest ? { logo: crest } : null,
        schedule: scheduleSaveArg(schedParsed?.rows ?? [], scheduleCleared, linked.schedule),
        // Football only: the fan side draws a conference for nothing else, and
        // invisible dead data is worse than none.
        league: football ? leagueArg(leagueName, leagueMembers, leagueCleared) : null,
        published,
        paidThrough,
        note: row?.note ?? billing.note,
      });
      // What was in the boxes is stored now; left there it would read as
      // unsaved, and ride along again on the next Save.
      setPasted('');
      setSchedulePasted('');
      setScheduleCleared(false);
      setLeagueCleared(false);
      onSaved();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!row) return;
    if (!confirm(`Delete ${capital(row.sport)} ${row.season} for this school? Its roster and schedule go with it.`)) {
      return;
    }
    setBusy(true);
    deleteRoster(row.school_slug, row.sport, row.season)
      .then(onSaved)
      .catch((e: unknown) => {
        setError(friendlyError(e));
        setBusy(false);
      });
  };

  const summary = row
    ? [
        `${row.player_count} ${row.player_count === 1 ? 'player' : 'players'}`,
        row.roster_source_url && 'sheet linked',
        row.schedule_source_url && 'calendar linked',
        row.stats_source_url && 'MaxPreps stats',
        row.has_league && 'conference',
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Not saved yet';
  const problems = row ? rowProblems(row) : [];

  const head = (
    <button type="button" className="mg-card-head" onClick={onToggle} aria-expanded={open}>
      <span className="mg-card-title">
        {row ? capital(sport) : 'Add a sport'}
        {row && row.season !== currentSeasonYear() && <span className="mg-hint"> {row.season}</span>}
      </span>
      <span className="mg-card-summary">{summary}</span>
      {row && (
        <span className={`mg-pill ${rowIsLive(row, todayIso()) ? 'is-live' : row.published ? 'is-expired' : 'is-off'}`}>
          {rowIsLive(row, todayIso()) ? 'Published' : row.published ? 'Expired' : 'Unpublished'}
        </span>
      )}
    </button>
  );

  if (!open) {
    return (
      <section className="mg-card is-closed">
        {head}
        {problems.map((p) => (
          <p className="mg-error" key={p}>
            {p}
          </p>
        ))}
      </section>
    );
  }

  const body = (blocks: { roster: ReactNode; schedule: ReactNode | null }) => (
    <section className="mg-card">
      {head}

      {!row && (
        <Part label="Sport">
          <select className="mg-input" aria-label="Sport" value={newSport} onChange={(e) => setNewSport(e.target.value)}>
            {free.map((s) => (
              <option key={s} value={s}>
                {capital(s)}
              </option>
            ))}
          </select>
        </Part>
      )}

      <Part label="Roster">
        {linked.roster ? (
          <p className="mg-state">Comes from the linked Google Sheet. Edit it there, or unlink it.</p>
        ) : (
          <>
            <p className="mg-state">
              {row ? `${row.player_count} stored. Paste or import to replace them.` : 'Paste the rows, or import a CSV.'}
            </p>
            <label className="mg-btn is-small mg-file">
              Import a CSV
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Into the paste box, so a file gets the same review as a
                  // paste before anything is saved.
                  if (file) {
                    file
                      .text()
                      .then((t) => setPasted(stripBom(t)))
                      .catch((err: unknown) => setError(friendlyError(err)));
                  }
                  // Cleared so picking the same file again, re-exported under
                  // the same name, fires onChange a second time.
                  e.target.value = '';
                }}
              />
            </label>
            <textarea
              className="mg-input mg-paste"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Number, name, position, height, weight, grade — a row per player"
              aria-label="Roster rows"
              rows={4}
            />
            {parsed && (
              <>
                <p className="mg-state">
                  {players.length} players read
                  {skipped.length > 0 && ` · ${skipped.length} rows skipped`}
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
                      <span className="mg-hint">
                        {p.position}
                        {p.grade && ` · ${p.grade}`}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {blocks.roster}
        {!row && <p className="mg-hint">A Google Sheet can be linked once this sport is saved.</p>}
      </Part>

      <Part label="Schedule">
        {football ? (
          <p className="mg-state">From the state directory, with scores. Nothing to do.</p>
        ) : linked.schedule ? (
          <p className="mg-state">Comes from the linked calendar.</p>
        ) : (
          <>
            <p className="mg-state">
              {scheduleCleared && !schedParsed
                ? 'Will be removed when you save.'
                : row?.has_schedule
                  ? 'One is stored. Paste to replace it.'
                  : 'None yet. Paste date, opponent and time, a row per game.'}
            </p>
            <textarea
              className="mg-input mg-paste"
              value={schedulePasted}
              onChange={(e) => setSchedulePasted(e.target.value)}
              placeholder="Sep 3, at Lowellville, 6:30 PM"
              aria-label="Schedule rows"
              rows={4}
            />
            {schedParsed && (
              <>
                <p className="mg-state">
                  {schedParsed.rows.length} games read
                  {schedParsed.skipped.length > 0 && ` · ${schedParsed.skipped.length} rows skipped`}
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
                {/* A count is not a review: the parser reads cells by what
                    they contain, so the seller has to see which one it took
                    for the opponent before publishing. */}
                <div className="mg-review">
                  {schedParsed.rows.slice(0, 60).map((r, i) => {
                    const tail = [r.time, r.score ? `${r.score.us}–${r.score.them}` : null]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <div className="mg-review-row" key={i}>
                        <b>{r.date}</b> · {r.home ? 'vs' : 'at'} {r.opponent}
                        {tail && <span className="mg-hint">{tail}</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {(Boolean(schedParsed?.rows.length) || (row?.has_schedule && !scheduleCleared)) && (
              <div className="mg-actions">
                <button
                  type="button"
                  className="mg-btn is-small is-quiet"
                  onClick={() => {
                    setSchedulePasted('');
                    setScheduleCleared(true);
                  }}
                >
                  Remove schedule
                </button>
              </div>
            )}
          </>
        )}
        {blocks.schedule}
        {!row && !football && <p className="mg-hint">A calendar can be linked once this sport is saved.</p>}
      </Part>

      {football && (
        <Part label="Stats">
          {row ? (
            <StatsSource row={row} onSaved={onSaved} />
          ) : (
            <p className="mg-hint">A MaxPreps link can be set once this sport is saved.</p>
          )}
        </Part>
      )}

      {/* Football only: the standings are folded out of the directory, and the
          directory only knows football. */}
      {football && (
        <Part label="Conference">
          <p className="mg-state">
            {leagueCleared && leagueMembers.length === 0
              ? 'Will be removed when you save.'
              : leagueMembers.length > 0
                ? `${leagueMembers.length} schools, plus this one.`
                : row?.has_league
                  ? 'One is stored. Fill this in to replace it.'
                  : 'None. The page has no League tab.'}
          </p>
          {suggested && (
            <div className="mg-source">
              <p className="mg-state">
                {suggested.source || 'A source'} lists {suggested.name} with {suggested.members.length} other{' '}
                {suggested.members.length === 1 ? 'school' : 'schools'}.
              </p>
              {suggested.unmatched.length > 0 && (
                <p className="mg-hint">
                  Couldn’t place {suggested.unmatched.join(', ')} in the directory — add {suggested.unmatched.length === 1 ? 'it' : 'them'} by hand.
                </p>
              )}
              <div className="mg-actions">
                <button
                  type="button"
                  className="mg-btn is-small"
                  onClick={() => {
                    setLeagueName(suggested.name);
                    setLeagueMembers(suggested.members);
                    setLeagueQuery('');
                    touchLeague();
                  }}
                >
                  Fill from {suggested.source || 'it'}
                </button>
              </div>
              <p className="mg-hint">Check the list, then save the card.</p>
            </div>
          )}
          <input
            className="mg-input"
            type="text"
            value={leagueName}
            onChange={(e) => {
              setLeagueName(e.target.value);
              touchLeague();
            }}
            placeholder="Conference name, as it should head the table"
            aria-label="Conference name"
          />
          <input
            className="mg-input"
            type="search"
            value={leagueQuery}
            onChange={(e) => setLeagueQuery(e.target.value)}
            placeholder="Add the other schools — this one is included automatically"
            aria-label="Search for a school to add to the conference"
          />
          {leagueQuery.trim() !== '' && (
            <div className="mg-hits">
              {leagueHits.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  className="mg-hit"
                  onClick={() => {
                    setLeagueMembers((prev) => [...prev, s.slug]);
                    setLeagueQuery('');
                    touchLeague();
                  }}
                >
                  {s.name} <span className="mg-hint">{s.city}</span>
                </button>
              ))}
            </div>
          )}
          {leagueMembers.length > 0 && (
            <div className="mg-chips">
              {leagueMembers.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="mg-chip"
                  title="Remove from the conference"
                  onClick={() => {
                    setLeagueMembers((prev) => prev.filter((x) => x !== m));
                    touchLeague();
                  }}
                >
                  {schoolName(m)} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
          {/* leagueArg reads a name with nobody in it as an unfilled form. */}
          {leagueName.trim() !== '' && leagueMembers.length === 0 && (
            <p className="mg-hint">Add at least one school, or the conference won’t save.</p>
          )}
          {(leagueMembers.length > 0 || (row?.has_league && !leagueCleared)) && (
            <div className="mg-actions">
              <button
                type="button"
                className="mg-btn is-small is-quiet"
                onClick={() => {
                  leagueTouched.current = true;
                  setLeagueName('');
                  setLeagueMembers([]);
                  setLeagueQuery('');
                  setLeagueCleared(true);
                }}
              >
                Remove conference
              </button>
            </div>
          )}
        </Part>
      )}

      {problems.map((p) => (
        <p className="mg-error" key={p}>
          {p}
        </p>
      ))}
      {error && <p className="mg-error">{error}</p>}

      <div className="mg-card-foot">
        {row ? (
          <button type="button" className="mg-btn is-small is-danger" disabled={busy} onClick={remove}>
            Delete this sport
          </button>
        ) : (
          <button type="button" className="mg-btn is-small is-quiet" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className="mg-spacer" />
        {row?.published ? (
          <>
            <button type="button" className="mg-btn is-quiet" disabled={busy} onClick={() => save(false)}>
              Unpublish
            </button>
            <button type="button" className="mg-btn is-primary" disabled={busy} onClick={() => save(true)}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="mg-btn" disabled={busy} onClick={() => save(false)}>
              {row ? 'Save' : 'Save unpublished'}
            </button>
            <button type="button" className="mg-btn is-primary" disabled={busy} onClick={() => save(true)}>
              {busy ? 'Saving…' : 'Save and publish'}
            </button>
          </>
        )}
      </div>
    </section>
  );

  return row ? (
    <Sources row={row} onLinked={setLinked} onChanged={onSaved}>
      {body}
    </Sources>
  ) : (
    body({ roster: null, schedule: null })
  );
}
