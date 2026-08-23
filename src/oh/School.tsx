import { useEffect, useState } from 'react';
import type { SchoolGame, SchoolSeason } from '../ohio/stateModel';
import { LookupTab, TeamTab } from './RosterTabs';
import { loadSchoolRoster, type SchoolRoster } from './rosterStore';
import { applyLook, clearLook } from './look';
import { loadSeason } from './store';

/** "2026-08-21" -> { day: "21", month: "Aug" }, in the reader's own locale —
 * a stacked pair rather than one long string, because a weekday plus a
 * month plus a day was wide enough to overlap the opponent's name on a
 * phone. The weekday drops; the header above each list already says
 * "Coming up" or "Played". */
const fixtureDate = (g: SchoolGame): { day: string; month: string } => {
  const d = new Date(`${g.date}T12:00:00`);
  return {
    day: d.toLocaleDateString(undefined, { day: 'numeric' }),
    month: d.toLocaleDateString(undefined, { month: 'short' }),
  };
};

type SchoolTab = 'lookup' | 'team' | 'schedule';

const SCHOOL_TABS: Array<{ id: SchoolTab; label: string }> = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'team', label: 'Team' },
  { id: 'schedule', label: 'Schedule' },
];

/**
 * One school's season: what is coming, and what has happened.
 *
 * The same order the Schedule tab settled on — next game first, results
 * underneath most recent first — because the two games either side of tonight
 * are the pair anybody is actually comparing.
 *
 * A school with a paid roster gets the tab bar: Lookup, Team and Schedule,
 * themed in the school's own colors. A school without one gets today's
 * single scroll — schedule, scores, and an invitation to add a roster —
 * unchanged, because most schools on this site will never have one.
 */
export function School({ slug, onChange }: { slug: string; onChange: () => void }) {
  const [season, setSeason] = useState<SchoolSeason | null>(null);
  const [failed, setFailed] = useState(false);
  const [roster, setRoster] = useState<SchoolRoster | null>(null);
  const [tab, setTab] = useState<SchoolTab>('lookup');

  useEffect(() => {
    setSeason(null);
    setFailed(false);
    loadSeason(slug)
      .then(setSeason)
      .catch(() => setFailed(true));

    // A roster failure — no signal, no live roster, whatever — must never
    // block the season above it. That's the one thing every school gets.
    setRoster(null);
    setTab('lookup');
    loadSchoolRoster(slug, 'football')
      .then(setRoster)
      .catch(() => setRoster(null));
  }, [slug]);

  // The look lifecycle. Applied to document.documentElement — the wallpaper
  // lives on body::before, outside this component's own tree — so it has to
  // be taken back down again, not just left to be overwritten: the cleanup
  // fires both on unmount and the moment `roster` changes identity, which
  // covers a slug change even on a future Directory that stops routing
  // through its own null step between schools.
  useEffect(() => {
    if (!roster?.colors) return;
    applyLook({ ground: roster.colors.ground, accent: roster.colors.accent, logo: roster.logo ?? undefined });
    return () => clearLook();
  }, [roster]);

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

  const schedule = (
    <>
      {coming.length > 0 && (
        <>
          <div className="group-head">Coming up</div>
          {coming.map((g) => {
            const { day, month } = fixtureDate(g);
            return (
              <div className="fixture" key={`${g.date}-${g.opponent}`}>
                <div className="fixture-row">
                  <span className="fixture-date">
                    <span className="fixture-month">{month}</span>
                    {day}
                  </span>
                  <span className="fixture-team">
                    <span className="fixture-ha">{g.home ? 'vs' : 'at'}</span> {g.opponent}
                    <span className="fixture-sub">{g.opponentCity}</span>
                  </span>
                  <span className="fixture-result">{g.kickoff}</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {played.length > 0 && (
        <>
          <div className="group-head">Played</div>
          {[...played].reverse().map((g) => {
            const { day, month } = fixtureDate(g);
            return (
              <div className="fixture is-played" key={`${g.date}-${g.opponent}`}>
                <div className="fixture-row">
                  <span className="fixture-date">
                    <span className="fixture-month">{month}</span>
                    {day}
                  </span>
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
            );
          })}
        </>
      )}
    </>
  );

  return (
    <div className="screen">
      <div className="oh-school-head">
        {roster?.logo ? (
          <div className="oh-school-head-row">
            <img className="oh-crest" src={roster.logo} alt="" />
            <div>
              <h1 className="next-card-opponent">{season.school.name}</h1>
              <p className="filter-line">
                <span>
                  {season.school.city}
                  {season.record.played > 0 && ` · ${season.record.won}–${season.record.lost}`}
                </span>
              </p>
            </div>
          </div>
        ) : (
          <>
            <h1 className="next-card-opponent">{season.school.name}</h1>
            <p className="filter-line">
              <span>
                {season.school.city}
                {season.record.played > 0 && ` · ${season.record.won}–${season.record.lost}`}
              </span>
            </p>
          </>
        )}
      </div>

      {roster ? (
        <>
          <nav className="tabs oh-school-tabs" aria-label="Sections">
            {SCHOOL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'lookup' && (
            <div className="oh-roster">
              <LookupTab players={roster.players} />
            </div>
          )}
          {tab === 'team' && (
            <div className="oh-roster">
              <TeamTab players={roster.players} />
            </div>
          )}
          {tab === 'schedule' && (
            <>
              {schedule}
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
            </>
          )}

          <button type="button" className="fixture-row is-plain" onClick={onChange}>
            <span className="fixture-team">Follow a different school</span>
          </button>

          <p className="filter-line">
            <span>
              <a href="/oh/?privacy">What this site knows, and doesn&rsquo;t</a>
            </span>
          </p>
        </>
      ) : (
        <>
          {/*
            The reason the directory exists.

            Every school in the state gets a schedule and scores for nothing, and
            the one thing missing is the thing only the school can give — the
            roster. A reader who wanted to know who number seventeen was is the
            best possible person to go and ask for it.
          */}
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

          {schedule}

          <button type="button" className="fixture-row is-plain" onClick={onChange}>
            <span className="fixture-team">Follow a different school</span>
          </button>

          <p className="filter-line">
            <span>
              <a href="/oh/?privacy">What this site knows, and doesn&rsquo;t</a>
            </span>
          </p>
        </>
      )}
    </div>
  );
}
