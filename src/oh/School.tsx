import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SchoolGame, SchoolSeason } from '../ohio/stateModel';
import { SkyIcon } from '../components/SkyIcon';
import { describeSky, worthMentioning } from '../schedule/weather';
import { leagueTable, type LeagueRow } from './leagueTable';
import { LookupTab, TeamTab } from './RosterTabs';
import {
  keptSchoolSports,
  loadSchoolRoster,
  loadSchoolSports,
  type SchoolIdentity,
  type SchoolRoster,
} from './rosterStore';
import type { ScheduleRow } from './scheduleParse';
import { applyLook, clearLook } from './look';
import { hubSports, inSeason, sortSportsForNow, sportEmoji, sportLabel } from './sportSeasons';
import {
  chosenSport,
  keptLeagueTable,
  loadSeason,
  loadWeather,
  rememberLeagueTable,
  rememberSport,
  type FixtureWeather,
} from './store';

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

/**
 * What it will be like to stand there.
 *
 * Poland's Schedule screen has had this since it existed and this is the same
 * treatment, deliberately: sky, temperature, and only the rain or the wind
 * worth mentioning. A forecast that lists every number for a still, dry evening
 * is noise above the thing people opened this screen for.
 *
 * Written out here rather than imported, because the original lives inside
 * `src/screens/Schedule.tsx` and nothing under `src/oh/` may reach into the
 * root app's runtime — the same rule `src/oh/look.ts` observes by duplicating
 * `src/theme/theme.ts`'s color math. The two pieces it uses are imported
 * rather than copied because both are genuinely pure: `describeSky` and
 * `worthMentioning` import nothing at all, and `SkyIcon` imports only them.
 *
 * `.forecast` and its parts come from the shared stylesheet, which `/oh/`'s
 * entry loads; `oh.css` only says how the line sits inside a fixture row.
 */
function Forecast({ weather }: { weather: FixtureWeather }) {
  const notes = [
    worthMentioning(weather.precipChance) ? `${weather.precipChance}% rain` : null,
    weather.windMph >= 12 ? `${weather.windMph} mph wind` : null,
  ].filter(Boolean);

  return (
    <p className="forecast">
      <SkyIcon code={weather.code} day={weather.day} />
      <span className="forecast-temp">{weather.tempF}°</span>
      <span className="forecast-sky">{describeSky(weather.code)}</span>
      {notes.length > 0 && <span className="forecast-note">{notes.join(' · ')}</span>}
    </p>
  );
}

type SchoolTab = 'lookup' | 'team' | 'schedule' | 'league';

const SCHOOL_TABS: Array<{ id: SchoolTab; label: string }> = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'team', label: 'Team' },
  { id: 'schedule', label: 'Schedule' },
];

/** Only a football row with a conference on it gets this fourth tab, so it
 * hangs on the end of the three rather than living among them. */
const LEAGUE_TAB: { id: SchoolTab; label: string } = { id: 'league', label: 'League' };

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
  // or a deploy running ahead of the migration behind the sports door. The
  // site falls back to the football-only page it was, rather than showing a
  // reader a hub built out of a failure.
  const [live, setLive] = useState<string[] | null>(null);
  // The same answer, kept whole, for the sake of the colors and the crest on
  // it. The sports list is held separately above rather than read back out of
  // here, because what the memo and the roster effect below key on is that
  // array's referential sameness — and a sports array reached through a
  // freshly fetched object is a fresh array every time, however identical its
  // contents. See the setLive call below.
  const [identity, setIdentity] = useState<SchoolIdentity | null>(null);
  const [sportsSettled, setSportsSettled] = useState(false);
  const [sport, setSport] = useState<string | null>(null);
  // Whether the roster behind the chosen sport has been asked for yet. A tile
  // tap sets the sport and the effect below clears the roster, so without
  // this the next render is the hub the reader just tapped out of — nothing
  // happens on screen until the network answers.
  const [rosterFetch, setRosterFetch] = useState<'idle' | 'loading' | 'done'>('idle');
  // The table the network built, and the member list it was built for. The key
  // is what stops a re-entry into the tab refetching ten school files, and what
  // stops a previous school's table flashing up under this school's conference
  // name while the new one is still in the air.
  const [leagueRows, setLeagueRows] = useState<LeagueRow[] | null>(null);
  const [leagueKey, setLeagueKey] = useState<string | null>(null);
  // The forecast for this school's next fixture, when it has one. Only paying
  // schools do, so on nearly every page in the state this settles as null and
  // the schedule looks exactly as it does today.
  const [weather, setWeather] = useState<FixtureWeather | null>(null);

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
    // hold it on a 404 for the whole window between a deploy and the
    // migration behind it.
    const kept = keptSchoolSports(slug);
    setLive(kept?.sports ?? null);
    // Cleared here rather than left to the network, so that following a
    // different school drops the old school's colors on the same render that
    // drops its sports. A returning reader's kept copy puts them straight
    // back up, before the first paint.
    setIdentity(kept);
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
            prev && prev.length === v.sports.length && prev.every((s, i) => s === v.sports[i])
              ? prev
              : v.sports,
          );
          // No such care needed for the look: the effect that applies it is
          // keyed on the three values inside, not on this object, so an answer
          // that merely agrees with the kept copy costs a render and repaints
          // nothing.
          setIdentity(v);
        }
        setSportsSettled(true);
      })
      .catch(() => {
        setSportsSettled(true);
      });
  }, [slug]);

  /*
   * The forecast, on its own errand.
   *
   * A separate effect from the one above rather than another branch inside it:
   * that effect carries the sports answer, the kept identity and the theme, and
   * its ordering has been got right once already. This is one small file with
   * no bearing on any of that, and it needs a cancellation guard of its own so
   * a slow answer for the school a reader has just left cannot land on the
   * school they are now looking at.
   *
   * Asked for on every school page, not only the paid ones, because there is no
   * way to know which is which before asking — and the file is a couple of
   * hundred bytes, one line per paying school. loadWeather swallows its own
   * failures; the catch is for a jar or a parse that surprises it.
   */
  useEffect(() => {
    setWeather(null);

    let current = true;
    loadWeather(slug)
      .then((w) => {
        if (current) setWeather(w);
      })
      .catch(() => {
        // No forecast is the normal state of nearly every page here.
      });

    return () => {
      current = false;
    };
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

  // What to paint the page in, decided field by field: the sport the reader
  // is in wins wherever its own row has an answer, and the school's identity
  // fills in the rest. So a volleyball program that runs different colors
  // keeps them, while a volleyball row that never uploaded a crest still
  // wears the school's. Colors travel as a pair — the store hands over both
  // or neither — so they are taken as a pair here too.
  const colors = roster?.colors ?? identity?.colors ?? null;
  const ground = colors?.ground ?? null;
  const accent = colors?.accent ?? null;
  const crest = roster?.logo ?? identity?.logo ?? null;

  // The look lifecycle. Applied to document.documentElement — the wallpaper
  // lives on body::before, outside this component's own tree — so it has to
  // be taken back down again, not just left to be overwritten: the cleanup
  // fires on unmount and whenever the look itself changes, which covers a
  // slug change even on a future Directory that stops routing through its own
  // null step between schools.
  //
  // The identity arrives before any roster does, and that is the point: the
  // hub is the first screen anybody sees and it carries no roster to get a
  // look from, so it used to sit in default navy while the crest appeared
  // only once football had loaded. Now the hub is dressed and the sport page
  // inherits rather than flashing.
  //
  // Keyed on the three values rather than on the objects holding them, so a
  // refetch that agrees with what is already on screen does not strobe the
  // page through the default theme and back.
  useEffect(() => {
    if (!ground || !accent) return;
    applyLook({ ground, accent, logo: crest ?? undefined });
    return () => clearLook();
  }, [ground, accent, crest]);

  /*
   * The conference, and the schools whose seasons it is folded out of.
   *
   * Football only: the standings come from the directory's own files, and the
   * directory only knows football. Every other sport's fixtures arrive as a
   * paste with no opponent slugs on them, so there is nothing to find another
   * school's season by.
   *
   * The school's own slug goes on the front of the member list without being
   * asked. It is trivially in its own conference, and leaving that to the
   * seller would make one forgotten tap a way to publish a table the paying
   * school is missing from.
   */
  const conference = sport === 'football' ? (roster?.league ?? null) : null;
  const members = useMemo(
    () => (conference ? [...new Set([slug, ...conference.members])] : []),
    [slug, conference],
  );
  // The list as one comparable value, so the effect below can be keyed on what
  // the members *are* rather than on the identity of the array holding them —
  // a fresh roster fetch that agrees with the last one must not refetch.
  const membersKey = members.join(',');

  useEffect(() => {
    // Ten school files is not a download to make on every football page view.
    // The tab pays for its own data, once, the first time it is opened.
    if (tab !== 'league' || !membersKey || leagueKey === membersKey) return;

    let current = true;
    Promise.all(
      // Split rather than close over `members`: the key already says exactly
      // which schools this run is for, and one dependency cannot disagree
      // with itself the way two can.
      membersKey.split(',').map((member) => loadSeason(member).catch(() => null)),
    ).then((got) => {
      if (!current) return;
      // A member whose file never came — a mistyped slug, a school that fell
      // out of the directory, a dead signal — is simply absent. leagueTable
      // drops it and renders the rest.
      const rows = leagueTable(
        got.filter((s): s is SchoolSeason => s !== null),
        membersKey.split(','),
      );

      if (rows.length >= 2) {
        rememberLeagueTable(slug, membersKey, rows);
      } else if (keptLeagueTable(slug, membersKey)) {
        // Fewer than two members is what a dead signal looks like from here:
        // loadSeason keeps a copy of the followed school only, so offline the
        // school resolves itself and nobody else. A table that was right on
        // Saturday must not be replaced by a sentence saying the conference
        // hasn't reported. With nothing kept there is nothing to protect, and
        // the honest empty state is the right answer.
        return;
      }

      setLeagueRows(rows);
      setLeagueKey(membersKey);
    });

    return () => {
      current = false;
    };
  }, [tab, membersKey, leagueKey, slug]);

  // The kept table stands in until the network has one for this same
  // conference — the rhythm loadSeason and loadSchoolRoster already use, so
  // the tab opens at a ground on what it showed last time rather than on a
  // spinner that never resolves.
  const standings = useMemo(
    () =>
      leagueRows && leagueKey === membersKey ? leagueRows : keptLeagueTable(slug, membersKey),
    [leagueRows, leagueKey, membersKey, slug],
  );

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

  // The name with the crest beside it, wherever the school has one. The hub
  // gets the same treatment as a sport page: it is the school's front door,
  // and a front door with no badge on it was the whole complaint.
  const nameBlock = crest ? (
    <div className="oh-school-head-row">
      <img className="oh-crest" src={crest} alt="" />
      <div>{headline}</div>
    </div>
  ) : (
    headline
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
      <Frame head={<div className="oh-school-head">{nameBlock}</div>}>
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

  /*
   * Which fixture the forecast belongs on: the one it names, and no other.
   *
   * Matching on the date rather than simply taking the first fixture in the
   * list is what makes a stale file harmless. The refresh picks the next game
   * that has not been played *and* has not already happened; this list shows
   * every game without a score on it, which for a day or two after a Friday is
   * a longer list. When the two disagree nothing matches and nothing prints,
   * which is the right answer — the schedule is exactly today's screen, and a
   * school with no forecast shows no forecast rather than an empty space where
   * one goes.
   */
  const forecastOn = weather ? coming.findIndex((g) => g.date === weather.date) : -1;

  const schedule = (
    <>
      {coming.length > 0 && (
        <>
          <div className="group-head">Coming up</div>
          {coming.map((g, i) => {
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
                {i === forecastOn && weather && <Forecast weather={weather} />}
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
      <div className="oh-school-head">{nameBlock}</div>

      {back}

      {roster && (
        <nav className="tabs oh-school-tabs" aria-label="Sections">
          {(conference ? [...SCHOOL_TABS, LEAGUE_TAB] : SCHOOL_TABS).map((t) => (
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
           * The footer rows go *inside* the tab rather than under it, because
           * below the keys there is nothing — the pad owns the bottom of the
           * screen now. Poland has no footer on its own Lookup screen and does
           * not need one, but this is a public page and Lookup is where every
           * paid school lands, so the privacy notice has to stay reachable
           * without first tapping through to another tab.
           */
          <div className="lookup oh-lookup">
            <LookupTab players={roster.players} footer={footer} />
          </div>
        ) : (
          <div className="screen">
            {tab === 'team' && (
              <div className="oh-roster">
                <TeamTab players={roster.players} />
              </div>
            )}
            {tab === 'league' && conference && (
              <>
                <div className="group-head">{conference.name}</div>
                {standings === null ? (
                  <p className="empty-text">Loading…</p>
                ) : standings.length < 2 ? (
                  /* One row is not a table — it is this school, alone, next to
                     a heading claiming to be a conference. Say what is
                     actually true instead. */
                  <p className="empty-text">Not enough of the conference has reported yet.</p>
                ) : (
                  <table className="table-lite table-standings">
                    <thead>
                      <tr>
                        <th>Standings</th>
                        <th>League</th>
                        <th>All</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((r) => (
                        <tr key={r.slug} className={r.slug === slug ? 'is-us' : undefined}>
                          <td>{r.name}</td>
                          <td>
                            {r.leagueWon}–{r.leagueLost}
                          </td>
                          <td>
                            {r.overallWon}–{r.overallLost}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
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
