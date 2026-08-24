import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SchoolGame, SchoolSeason } from '../ohio/stateModel';
import { LookupTab, TeamTab } from './RosterTabs';
import {
  keptSchoolSports,
  loadSchoolRoster,
  loadSchoolSports,
  type SchoolRoster,
} from './rosterStore';
import type { ScheduleRow } from './scheduleParse';
import { applyLook, clearLook } from './look';
import { hubSports, inSeason, sortSportsForNow, sportEmoji, sportLabel } from './sportSeasons';
import { chosenSport, loadSeason, rememberSport } from './store';

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

/**
 * A pasted schedule, in the season list's own clothes.
 *
 * Volleyball and basketball have no scrapeable source, so their fixtures
 * arrive as rows the seller pasted into the panel. They still have to look
 * like football's — same rows, same grouping, same order — because a reader
 * moving between the two tabs shouldn't be able to tell which one came from
 * a scraper. The only thing missing is the opponent's town, which a pasted
 * row never carries.
 *
 * A drawn game renders as an L: ties are near-nonexistent in these sports
 * and the chip has two states, so a third would be a lot of machinery for a
 * row nobody will ever see.
 */
const PastedSchedule = ({ rows }: { rows: ScheduleRow[] }) => {
  const played = rows.filter((r) => r.score).sort((a, b) => b.date.localeCompare(a.date));
  const coming = rows.filter((r) => !r.score).sort((a, b) => a.date.localeCompare(b.date));
  const stack = (date: string) => {
    const d = new Date(`${date}T12:00:00`);
    return {
      day: d.toLocaleDateString(undefined, { day: 'numeric' }),
      month: d.toLocaleDateString(undefined, { month: 'short' }),
    };
  };
  return (
    <>
      {coming.length > 0 && (
        <>
          <div className="group-head">Coming up</div>
          {/* The index rides in the key because a doubleheader — same day,
              same opponent, two games — is a real row a school can paste. */}
          {coming.map((r, i) => {
            const { day, month } = stack(r.date);
            return (
              <div className="fixture" key={`${r.date}-${r.opponent}-${i}`}>
                <div className="fixture-row">
                  <span className="fixture-date">
                    <span className="fixture-month">{month}</span>
                    {day}
                  </span>
                  <span className="fixture-team">
                    <span className="fixture-ha">{r.home ? 'vs' : 'at'}</span> {r.opponent}
                  </span>
                  <span className="fixture-result">{r.time ?? ''}</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {played.length > 0 && (
        <>
          <div className="group-head">Played</div>
          {played.map((r, i) => {
            const { day, month } = stack(r.date);
            const won = r.score!.us > r.score!.them;
            return (
              <div className="fixture is-played" key={`${r.date}-${r.opponent}-${i}`}>
                <div className="fixture-row">
                  <span className="fixture-date">
                    <span className="fixture-month">{month}</span>
                    {day}
                  </span>
                  <span className="fixture-team">
                    <span className="fixture-ha">{r.home ? 'vs' : 'at'}</span> {r.opponent}
                  </span>
                  <span className="fixture-result">
                    <span className={`form-chip ${won ? 'won' : 'lost'}`}>{won ? 'W' : 'L'}</span>{' '}
                    {r.score!.us}–{r.score!.them}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
};

type SchoolTab = 'lookup' | 'team' | 'schedule';

const SCHOOL_TABS: Array<{ id: SchoolTab; label: string }> = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'team', label: 'Team' },
  { id: 'schedule', label: 'Schedule' },
];

/**
 * The frame every state of this page hangs in.
 *
 * The root app's shell, borrowed whole: `.app` is a full-height flex column,
 * `.header` is pinned above it at `flex: none`, and whatever follows takes the
 * rest of the viewport and scrolls inside itself. Until now this page was a
 * single `.screen` sitting in normal document flow, where `.screen`'s `flex: 1`
 * and the keypad's `flex: none` both meant nothing — which is why the keys
 * landed halfway down the page instead of under the reader's thumb.
 *
 * The directory does not share this container: `Directory.tsx` returns its own
 * `.screen` and hands off to this component only when a school is chosen, so
 * wearing `.app` here changes nothing on the picker.
 *
 * `head` is optional because the two waiting states — a failed fetch, a season
 * still in flight — have no school name to pin yet, and an empty bar with a
 * rule under it would just be furniture.
 */
const Frame = ({ head, children }: { head?: ReactNode; children: ReactNode }) => (
  <div className="app">
    {head && <div className="header oh-school-header">{head}</div>}
    {children}
  </div>
);

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
 *
 * A school that sells more than one sport gets a hub in front of all that: a
 * grid of tiles, in-season first, one tap into the sport you came for and one
 * tap back. A school with only football never sees it, which is nearly every
 * school in the state — the hub has to earn its place before it appears.
 */
export function School({ slug, onChange }: { slug: string; onChange: () => void }) {
  const [season, setSeason] = useState<SchoolSeason | null>(null);
  const [failed, setFailed] = useState(false);
  const [roster, setRoster] = useState<SchoolRoster | null>(null);
  const [tab, setTab] = useState<SchoolTab>('lookup');
  // null is not "no sports" — it is "couldn't ask": offline on a first visit,
  // or a deploy running ahead of migration 0006. The site falls back to the
  // football-only page it was, rather than showing a reader a hub built out
  // of a failure.
  const [live, setLive] = useState<string[] | null>(null);
  const [sportsSettled, setSportsSettled] = useState(false);
  const [sport, setSport] = useState<string | null>(null);
  // Whether the roster behind the chosen sport has been asked for yet. A tile
  // tap sets the sport and the effect below clears the roster, so without
  // this the next render is the hub the reader just tapped out of — nothing
  // happens on screen until the network answers.
  const [rosterFetch, setRosterFetch] = useState<'idle' | 'loading' | 'done'>('idle');

  useEffect(() => {
    setSeason(null);
    setFailed(false);
    loadSeason(slug)
      .then(setSeason)
      .catch(() => setFailed(true));

    setSport(null);
    // A reader who has been here before already knows which sports this
    // school sells, so the page draws on that copy at once and lets the
    // network refine it. Only a first visit waits — otherwise every one of
    // the 717 school pages would hold its first paint on a round trip, and
    // hold it on a 404 for the whole window between this deploy and
    // migration 0006.
    const kept = keptSchoolSports(slug);
    setLive(kept);
    setSportsSettled(kept !== null);
    // The catch is belt and braces — loadSchoolSports swallows its own
    // failures — but the invariant lives in another module and the cost of it
    // ever being wrong is every school page stuck on "Loading…" forever. A
    // throw settles as "couldn't ask", which is the football-only fallback.
    loadSchoolSports(slug)
      .then((v) => {
        // null is "couldn't ask", never an answer, so it must not wipe a kept
        // list already on screen. With no kept list `live` is null anyway.
        //
        // An answer that merely agrees with the kept list keeps the kept
        // array. Identity is what the tiles memo and the roster effect below
        // are keyed on, so handing them a fresh array saying the same thing
        // would tear the page the reader is already reading back down to
        // Loading, clear the theme, and fetch the roster a second time.
        if (v !== null) {
          setLive((prev) =>
            prev && prev.length === v.length && prev.every((s, i) => s === v[i]) ? prev : v,
          );
        }
        setSportsSettled(true);
      })
      .catch(() => {
        setSportsSettled(true);
      });
  }, [slug]);

  // In-season sports first, football always present. Recomputed only when the
  // answer changes: the ordering reads the clock, and a tile grid that
  // reshuffled itself on every keystroke elsewhere would be its own bug.
  const tiles = useMemo(() => sortSportsForNow(hubSports(live ?? []), new Date()), [live]);

  // The same normalization hubSports applies to what it draws. A row stored
  // as "Volleyball " becomes the tile "volleyball", and a tile whose name
  // can't be found in the raw list is a tile that could never fetch the
  // roster behind it — a dead tap, forever. Compare like with like. Null
  // stays null: "couldn't ask" is not an empty list.
  const liveSports = useMemo(() => live?.map((s) => s.trim().toLowerCase()) ?? null, [live]);

  // Which sport the reader lands on. One tile is not a choice — go straight
  // in; that is the whole state of the site today and must stay invisible.
  // Otherwise the sport they opened last, if the school still sells it, and
  // failing that the hub.
  useEffect(() => {
    if (!sportsSettled) return;
    const remembered = chosenSport(slug);
    setSport(
      tiles.length === 1
        ? tiles[0]
        : remembered && tiles.includes(remembered)
          ? remembered
          : null,
    );
  }, [slug, sportsSettled, tiles]);

  useEffect(() => {
    // A roster failure — no signal, no live roster, whatever — must never
    // block the season above it. That's the one thing every school gets.
    setRoster(null);
    setTab('lookup');
    // Football is asked for even when the live list is unknown, because that
    // is exactly what the page did before the hub existed. A known-empty list
    // is a different answer: this school sells nothing, so nothing is fetched.
    if (sport && (liveSports?.includes(sport) ?? sport === 'football')) {
      // Two taps on a slow connection — volleyball, then basketball — can
      // land in the order they were asked for or the other one. Without this
      // flag the loser of that race wins the screen: the tab bar says
      // basketball while the players, the pasted schedule and the colors are
      // volleyball's, and it stays that way, because nothing re-renders to
      // correct it. Only the fetch this effect started may answer it.
      let current = true;
      setRosterFetch('loading');
      loadSchoolRoster(slug, sport)
        .then((r) => {
          if (current) {
            setRoster(r);
            setRosterFetch('done');
          }
        })
        .catch(() => {
          if (current) {
            setRoster(null);
            setRosterFetch('done');
          }
        });
      return () => {
        current = false;
      };
    }
    // Nothing to wait for: no sport chosen, or one this school doesn't sell.
    setRosterFetch('done');
  }, [slug, sport, liveSports]);

  // The look lifecycle. Applied to document.documentElement — the wallpaper
  // lives on body::before, outside this component's own tree — so it has to
  // be taken back down again, not just left to be overwritten: the cleanup
  // fires both on unmount and the moment `roster` changes identity, which
  // covers a slug change even on a future Directory that stops routing
  // through its own null step between schools. The hub carries no roster, so
  // it sits in the default look and each sport paints itself on arrival.
  useEffect(() => {
    if (!roster?.colors) return;
    applyLook({ ground: roster.colors.ground, accent: roster.colors.accent, logo: roster.logo ?? undefined });
    return () => clearLook();
  }, [roster]);

  if (failed) {
    return (
      <Frame>
        <div className="screen">
          <p className="empty-text">Couldn’t load that school. Try again with a signal.</p>
          <button type="button" className="fixture-row is-plain" onClick={onChange}>
            Pick another school
          </button>
        </div>
      </Frame>
    );
  }

  // The sports answer gates the first paint too: landing on football and
  // being bounced to a hub a beat later would be worse than waiting for it.
  if (!season || !sportsSettled) {
    return (
      <Frame>
        <div className="screen">
          <p className="empty-text">Loading…</p>
        </div>
      </Frame>
    );
  }

  const headline = (
    <>
      <h1 className="next-card-opponent">{season.school.name}</h1>
      <p className="filter-line">
        <span>
          {season.school.city}
          {season.record.played > 0 && ` · ${season.record.won}–${season.record.lost}`}
        </span>
      </p>
    </>
  );

  const footer = (
    <>
      <button type="button" className="fixture-row is-plain" onClick={onChange}>
        <span className="fixture-team">Follow a different school</span>
      </button>

      <p className="filter-line">
        <span>
          <a href="/oh/?privacy">What this site knows, and doesn&rsquo;t</a>
        </span>
      </p>
    </>
  );

  // A sport in flight looks like the page loading, not like the hub the
  // reader just left. 'idle' counts as in flight too: it is the one render
  // between the tile tap and the effect that starts the fetch, and letting
  // the hub paint in that gap is the flicker this is here to prevent.
  // Football is exempt — its page stands without a roster, so it draws the
  // moment the season is in, exactly as it did before any of this existed.
  if (sport !== null && sport !== 'football' && rosterFetch !== 'done') {
    return (
      <Frame>
        <div className="screen">
          <p className="empty-text">Loading…</p>
        </div>
      </Frame>
    );
  }

  // A sport whose roster came back null — expired between visits, or a cache
  // miss with no signal — has nothing to show and no theme to show it in.
  // The hub is the honest answer; a dead sport page is not one. Football is
  // exempt: its free page stands on the directory's own schedule and scores.
  if (sport === null || (sport !== 'football' && !roster)) {
    return (
      <Frame head={<div className="oh-school-head">{headline}</div>}>
        <div className="screen">
          <div className="oh-sport-grid">
            {tiles.map((s) => (
              <button
                key={s}
                type="button"
                className={`oh-sport-tile${inSeason(s, new Date().getMonth() + 1) ? '' : ' is-off'}`}
                onClick={() => {
                  rememberSport(slug, s);
                  setSport(s);
                }}
              >
                <span className="oh-sport-emoji" aria-hidden="true">
                  {sportEmoji(s)}
                </span>
                <span className="oh-sport-name">{sportLabel(s)}</span>
              </button>
            ))}
          </div>

          {footer}
        </div>
      </Frame>
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

  // Leaving by this row forgets the sport as well as closing it — otherwise
  // the next visit would warp straight back past the hub the reader just
  // asked to see.
  const back = tiles.length >= 2 && (
    <button
      type="button"
      className="fixture-row is-plain"
      onClick={() => {
        rememberSport(slug, null);
        setSport(null);
      }}
    >
      <span className="fixture-team">‹ All sports</span>
    </button>
  );

  const head = (
    <>
      <div className="oh-school-head">
        {roster?.logo ? (
          <div className="oh-school-head-row">
            <img className="oh-crest" src={roster.logo} alt="" />
            <div>{headline}</div>
          </div>
        ) : (
          headline
        )}
      </div>

      {back}

      {roster && (
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
      )}
    </>
  );

  return (
    <Frame head={head}>
      {roster ? (
        tab === 'lookup' ? (
          /*
           * The one tab that is not a plain scroll. `.lookup` is the root
           * app's own column — keys at the bottom at `flex: none`, everything
           * above them shrinking and scrolling — and `LookupTab` hands over
           * exactly the pieces that column expects, so the arrangement is
           * the same one Poland's Lookup screen has always used.
           *
           * The footer rows are the price. They live below the active tab,
           * and below the keys there is nothing: the pad owns the bottom of
           * the screen now. They stay one tap away on Team and Schedule,
           * which is where Poland keeps its own way out too.
           */
          <div className="lookup oh-lookup">
            <LookupTab players={roster.players} />
          </div>
        ) : (
          <div className="screen">
            {tab === 'team' && (
              <div className="oh-roster">
                <TeamTab players={roster.players} />
              </div>
            )}
            {tab === 'schedule' && (
              <>
                {/* Football's fixtures come from the directory, which every
                    school in the state has. Any other sport can only show what
                    was pasted for it. */}
                {sport === 'football' ? (
                  schedule
                ) : roster.schedule ? (
                  <PastedSchedule rows={roster.schedule} />
                ) : (
                  <p className="empty-text">No schedule added yet for {sportLabel(sport)}.</p>
                )}
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

            {footer}
          </div>
        )
      ) : (
        <div className="screen">
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

          {footer}
        </div>
      )}
    </Frame>
  );
}
