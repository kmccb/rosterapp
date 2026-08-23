import { useEffect, useState, type CSSProperties } from 'react';
import type { SchoolGame, SchoolSeason } from '../ohio/stateModel';
import { RosterTabs } from './RosterTabs';
import { loadSchoolRoster, type SchoolRoster } from './rosterStore';
import { loadSeason } from './store';

/** "2026-08-21" -> "Fri 21 Aug", in the reader's own locale. */
const when = (g: SchoolGame) =>
  new Date(`${g.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/**
 * One school's season: what is coming, and what has happened.
 *
 * The same order the Schedule tab settled on — next game first, results
 * underneath most recent first — because the two games either side of tonight
 * are the pair anybody is actually comparing.
 */
export function School({ slug, onChange }: { slug: string; onChange: () => void }) {
  const [season, setSeason] = useState<SchoolSeason | null>(null);
  const [failed, setFailed] = useState(false);
  const [roster, setRoster] = useState<SchoolRoster | null>(null);

  useEffect(() => {
    setSeason(null);
    setFailed(false);
    loadSeason(slug)
      .then(setSeason)
      .catch(() => setFailed(true));

    // A roster failure — no signal, no live roster, whatever — must never
    // block the season above it. That's the one thing every school gets.
    setRoster(null);
    loadSchoolRoster(slug)
      .then(setRoster)
      .catch(() => setRoster(null));
  }, [slug]);

  if (failed) {
    return (
      <div className="screen">
        <p className="empty-text">Couldn’t load that school. Try again with a signal.</p>
        <button type="button" className="fixture-row is-plain" onClick={onChange}>
          Pick another school
        </button>
      </div>
    );
  }

  if (!season) {
    return (
      <div className="screen">
        <p className="empty-text">Loading…</p>
      </div>
    );
  }

  const played = season.games.filter((g) => g.result);
  const coming = season.games.filter((g) => !g.result);

  // A paid school's two colors, scoped to this screen. The accent recolors
  // what the accent already colors; the ground becomes a band behind the
  // school's name rather than the page background, because the page's text
  // contrast is tuned for the default ground and an arbitrary one would
  // break it.
  const themed = roster?.colors
    ? ({ '--accent': roster.colors.accent, '--school-band': roster.colors.ground } as CSSProperties)
    : undefined;

  return (
    <div className="screen" style={themed}>
      <div className="oh-school-head">
        <h1 className="next-card-opponent">{season.school.name}</h1>
        <p className="filter-line">
          <span>
            {season.school.city}
            {season.record.played > 0 && ` · ${season.record.won}–${season.record.lost}`}
          </span>
        </p>
      </div>

      {roster && <RosterTabs roster={roster} />}

      {/*
        The reason the directory exists.

        Every school in the state gets a schedule and scores for nothing, and
        the one thing missing is the thing only the school can give — the
        roster. A reader who wanted to know who number seventeen was is the
        best possible person to go and ask for it.
      */}
      {!roster && (
        <section className="next-card">
          <p className="next-card-label">Roster not added yet</p>
          <p className="next-when">
            {season.school.name} hasn’t published their roster, so there’s no way to look up a
            number yet.
          </p>
          <a
            className="fixture-row is-plain"
            href={`mailto:?subject=${encodeURIComponent(
              `A roster app for ${season.school.name}`,
            )}&body=${encodeURIComponent(
              `I was at the game looking up jersey numbers and found this:\n\n` +
                `${location.origin}/oh/\n\n` +
                `${season.school.name}’s schedule and scores are already on it, but the roster ` +
                `isn’t — that part has to come from the team. Any chance we could get ours added?\n`,
            )}`}
          >
            <span className="fixture-team">Ask the school to add it</span>
          </a>
        </section>
      )}

      {coming.length > 0 && (
        <>
          <div className="group-head">Coming up</div>
          {coming.map((g) => (
            <div className="fixture" key={`${g.date}-${g.opponent}`}>
              <div className="fixture-row">
                <span className="fixture-date">{when(g)}</span>
                <span className="fixture-team">
                  <span className="fixture-ha">{g.home ? 'vs' : 'at'}</span> {g.opponent}
                  <span className="fixture-sub">{g.opponentCity}</span>
                </span>
                <span className="fixture-result">{g.kickoff}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {played.length > 0 && (
        <>
          <div className="group-head">Played</div>
          {[...played].reverse().map((g) => (
            <div className="fixture is-played" key={`${g.date}-${g.opponent}`}>
              <div className="fixture-row">
                <span className="fixture-date">{when(g)}</span>
                <span className="fixture-team">
                  <span className="fixture-ha">{g.home ? 'vs' : 'at'}</span> {g.opponent}
                  <span className="fixture-sub">
                    {g.opponentCity}
                    {g.overtime ? ` · ${g.overtime}` : ''}
                  </span>
                </span>
                <span className="fixture-result">
                  <span className={`form-chip ${g.result!.won ? 'won' : 'lost'}`}>
                    {g.result!.won ? 'W' : 'L'}
                  </span>{' '}
                  {g.result!.us}–{g.result!.them}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {roster && (
        <p className="filter-line">
          <span>
            <a
              href={`mailto:tom@scottforge.ai?subject=${encodeURIComponent(
                `An app of our own — ${season.school.name}`,
              )}`}
            >
              Want your own installable app, like Poland&rsquo;s?
            </a>
          </span>
        </p>
      )}

      <button type="button" className="fixture-row is-plain" onClick={onChange}>
        <span className="fixture-team">Follow a different school</span>
      </button>
    </div>
  );
}
