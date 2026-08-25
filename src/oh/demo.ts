/*
 * The demo school.
 *
 * /oh/demo/ is a page a seller can hand a prospect: a fictional school —
 * Springfield Local — with six sports, a crest, a conference and a season, all
 * of it out of one committed file. It is fictional on purpose. The demo before
 * this one put invented players on Strasburg-Franklin's real page, which was
 * fine as a smoke test and is not fine as the thing shown to strangers.
 *
 * What matters about this module is what it is *not*: it is not a second copy
 * of the School screen. The demo page mounts the real one, and the four store
 * functions behind it each take a guard clause at the top that answers out of
 * this file instead of the network. So whatever the paid page does, the demo
 * does, and neither can drift from the other.
 *
 * Nothing here imports a runtime value from store.ts or rosterStore.ts — those
 * two import from here, and a cycle between them would be a live hazard for the
 * sake of a validator. Types only, which are erased. The sanitizing is done on
 * the other side of the guard, by the same doors the network answers come
 * through.
 */

import type { Player } from '../types';
import type { School, SchoolSeason } from '../ohio/stateModel';
import type { ScheduleRow } from './scheduleParse';
import type { FixtureWeather } from './store';

/** The one school this page is about. Suffixed so it can never collide with a
 * real directory slug — there are four real Springfields in Ohio. */
export const DEMO_SLUG = 'springfield-local-demo';

/** The raw shape of one sport in the file: a squad, and the fixtures somebody
 * would have pasted for it. Football's are null — its fixtures come from the
 * season, exactly as a real paid school's do. */
export type DemoSport = { players: Player[]; schedule: ScheduleRow[] | null };

export type DemoData = {
  slug: string;
  season: number;
  school: School;
  /** Left unknown here and validated on the far side of the guard, by
   * rosterStore's own validators — this file must not hold a second opinion
   * about what a color or a badge is allowed to be. */
  colors: unknown;
  logo: unknown;
  league: unknown;
  sportNames: string[];
  sports: Record<string, DemoSport>;
  /** The demo school's season and every conference member's, so the League tab
   * folds out of baked results the same way it folds out of the directory. */
  seasons: Record<string, SchoolSeason>;
  weather: FixtureWeather | null;
};

/*
 * Which page this is.
 *
 * The path is the real answer — vite.oh.config.ts emits a file at
 * dist/oh/demo/index.html, so /oh/demo/ is a page that exists rather than a
 * route needing a fallback. `?demo` is kept as an alias because a seller may
 * reach this from a link, a QR code or a typed address, and a demo that quietly
 * turns into the directory is worse than a demo that is reachable two ways.
 *
 * `location` is guarded because the test environment for this project is node,
 * where there is no such global: off the page, nothing is the demo.
 */
const DEMO_PATH = /^\/oh\/demo(\/(index\.html)?)?$/;

/** `?demo=false` is somebody turning it off, not a flag that happens to be
 * present — the query string is the one place a reader can spell it either
 * way, and `has()` alone reads both as yes. */
const OFF = new Set(['false', '0', 'no', 'off']);

export function isDemo(): boolean {
  if (typeof location === 'undefined') return false;
  if (DEMO_PATH.test(location.pathname)) return true;
  const flag = new URLSearchParams(location.search).get('demo');
  return flag !== null && !OFF.has(flag.toLowerCase());
}

// ------------------------------------------------------------- reading it in

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const asSchool = (v: unknown): School | null => {
  if (!isRecord(v)) return null;
  return isText(v.slug) && isText(v.name) && typeof v.city === 'string'
    ? { slug: v.slug, name: v.name, city: v.city }
    : null;
};

/**
 * A season, checked as far as the screens actually read it.
 *
 * The bar is the same one `/oh/data/<slug>.json` is held to, which is to say
 * the shape rather than every field: both files are committed to this repo and
 * served from this origin, and the thing worth defending against is a file
 * half-written by a future generator, not an attacker. What is checked is what
 * would otherwise throw — leagueTable walks `games` and reads `result`, and a
 * season with no games array takes the League tab down with it.
 */
const asSeason = (v: unknown): SchoolSeason | null => {
  if (!isRecord(v)) return null;
  const school = asSchool(v.school);
  if (!school || !Array.isArray(v.games) || !v.games.every(isRecord)) return null;
  if (!isRecord(v.record)) return null;
  const { won, lost, played } = v.record;
  if (!isCount(won) || !isCount(lost) || !isCount(played)) return null;
  return { school, games: v.games as SchoolSeason['games'], record: { won, lost, played } };
};

/**
 * The forecast, checked here rather than by store.ts's own guard.
 *
 * store.ts keeps that check private and this module deliberately imports no
 * runtime value from it, so the same six fields are spelled out again. They are
 * spelled out for the same reason: this file is small enough to hand-edit, and
 * one missing number would print "NaN°" beside a school's name on the one
 * screen a prospect was brought here to look at.
 */
const asWeather = (v: unknown): FixtureWeather | null => {
  if (!isRecord(v)) return null;
  if (!isText(v.date) || typeof v.day !== 'boolean' || !isText(v.at)) return null;
  const { code, tempF, precipChance, windMph } = v;
  if (!isCount(code) || !isCount(tempF) || !isCount(precipChance) || !isCount(windMph)) return null;
  return { date: v.date, code, tempF, precipChance, windMph, day: v.day, at: v.at };
};

/** A malformed file reads as no demo at all, rather than throwing into a
 * screen — the rule every other reader in this bundle keeps. */
const asDemo = (v: unknown): DemoData | null => {
  if (!isRecord(v)) return null;
  if (!isText(v.slug) || !isCount(v.season)) return null;

  const school = asSchool(v.school);
  if (!school) return null;

  if (!Array.isArray(v.sportNames) || !v.sportNames.length || !v.sportNames.every(isText)) {
    return null;
  }
  if (!isRecord(v.sports)) return null;

  const sports: Record<string, DemoSport> = {};
  for (const name of v.sportNames as string[]) {
    const entry = v.sports[name];
    if (!isRecord(entry) || !Array.isArray(entry.players) || !entry.players.length) return null;
    if (entry.schedule !== null && !Array.isArray(entry.schedule)) return null;
    sports[name] = {
      players: entry.players as Player[],
      schedule: (entry.schedule as ScheduleRow[] | null) ?? null,
    };
  }

  if (!isRecord(v.seasons)) return null;
  const seasons: Record<string, SchoolSeason> = {};
  for (const [slug, raw] of Object.entries(v.seasons)) {
    const season = asSeason(raw);
    if (!season) return null;
    seasons[slug] = season;
  }
  // Without its own season the school has no name, no town and no fixtures —
  // there is no demo left to show.
  if (!seasons[v.slug]) return null;

  return {
    slug: v.slug,
    season: v.season,
    school,
    colors: v.colors,
    logo: v.logo,
    league: v.league,
    sportNames: v.sportNames as string[],
    sports,
    seasons,
    weather: asWeather(v.weather),
  };
};

// ------------------------------------------------------------ moving it on

/*
 * The demo's calendar, carried forward to today.
 *
 * The file is generated with results behind and fixtures ahead, and then it is
 * committed and sits still while the world moves. School.tsx splits Played from
 * Coming up on whether a game carries a score, not on its date, so a week after
 * a generation the page starts listing games under "Coming up" that were played
 * last Friday — to an audience that reads schedules for a living. Asking anyone
 * to remember to re-run a script is not a fix.
 *
 * So the dates are moved at read time. Whole weeks, which is the whole trick:
 * every date keeps its day of the week, so Friday football stays on a Friday
 * and a Tuesday volleyball match stays on a Tuesday.
 *
 * One delta, computed once, applied to everything — six seasons, five pasted
 * schedules and the forecast. Not per sport and not per school: the rivals
 * carry the same conference games from the other side, and a season shifted by
 * a different number of weeks would put the standings table at odds with the
 * school's own record.
 */
const MS_DAY = 86_400_000;

const dayOf = (date: string): number => Date.parse(`${date}T00:00:00Z`);

const moveDate = (date: string, days: number): string => {
  const at = dayOf(date);
  return Number.isNaN(at) ? date : new Date(at + days * MS_DAY).toISOString().slice(0, 10);
};

/**
 * How many whole weeks the file is behind.
 *
 * The last day anything was played is the hinge: the generator put it on the
 * most recent day that had been, and it has to land there again. Moving it into
 * the window from yesterday back to a week ago does that, and because the
 * earliest unplayed date the generator writes is a clear week the far side of
 * that hinge, everything ahead lands on today or later without being counted
 * separately.
 *
 * Never negative. A file that somehow reads as generated in the future — a
 * phone with a slow clock, most likely — is left exactly as it was written
 * rather than dragged backwards.
 */
export const weeksBehind = (data: DemoData, today: Date): number => {
  const scored: string[] = [];
  for (const season of Object.values(data.seasons)) {
    for (const game of season.games) if (game.result) scored.push(game.date);
  }
  for (const entry of Object.values(data.sports)) {
    for (const row of entry.schedule ?? []) if (row.score) scored.push(row.date);
  }
  if (!scored.length) return 0;

  const hinge = dayOf(scored.reduce((a, b) => (a > b ? a : b)));
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (Number.isNaN(hinge)) return 0;

  const gap = Math.round((now - hinge) / MS_DAY);
  return Math.max(0, Math.floor((gap - 1) / 7));
};

/** The same demo, every date `weeks` weeks later. */
export const shiftToNow = (data: DemoData, today: Date): DemoData => {
  const weeks = weeksBehind(data, today);
  if (weeks === 0) return data;
  const days = weeks * 7;

  const seasons: Record<string, SchoolSeason> = {};
  for (const [slug, season] of Object.entries(data.seasons)) {
    seasons[slug] = {
      ...season,
      games: season.games.map((g) => ({ ...g, date: moveDate(g.date, days) })),
    };
  }

  const sports: Record<string, DemoSport> = {};
  for (const [name, entry] of Object.entries(data.sports)) {
    sports[name] = {
      players: entry.players,
      schedule: entry.schedule?.map((r) => ({ ...r, date: moveDate(r.date, days) })) ?? null,
    };
  }

  const weather = data.weather;
  return {
    ...data,
    seasons,
    sports,
    weather: weather
      ? {
          ...weather,
          date: moveDate(weather.date, days),
          // `at` is the same day with an hour on it; only the day moves.
          at: weather.at.includes('T')
            ? `${moveDate(weather.at.slice(0, 10), days)}${weather.at.slice(10)}`
            : weather.at,
        }
      : null,
  };
};

/*
 * Fetched once, whatever asks for it.
 *
 * Four store functions and one of them synchronous, so the promise is held
 * rather than the callers coordinating: the first to ask starts the fetch and
 * every other one joins it. A failure memoizes as null on purpose — a demo page
 * whose data file is missing is broken, and retrying it on every screen change
 * would only be broken more slowly.
 */
let pending: Promise<DemoData | null> | null = null;
let arrived: DemoData | null = null;

export function loadDemo(): Promise<DemoData | null> {
  if (!pending) {
    pending = fetch('/oh/demo.json', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((body) => {
        const parsed = asDemo(body);
        // Moved on to today once, here, so that every reader of `arrived`
        // below sees the same calendar.
        arrived = parsed ? shiftToNow(parsed, new Date()) : null;
        return arrived;
      })
      .catch(() => null);
  }
  return pending;
}

// ------------------------------------------------------- what the guards ask

/** The demo school's own season, or a conference member's. Null for anything
 * this file does not carry, which lets the caller go on as it always has. */
export async function demoSeason(slug: string): Promise<SchoolSeason | null> {
  const demo = await loadDemo();
  return demo?.seasons[slug] ?? null;
}

/** The forecast, for the demo school and nobody else. */
export async function demoWeather(slug: string): Promise<FixtureWeather | null> {
  const demo = await loadDemo();
  return demo && slug === demo.slug ? demo.weather : null;
}

/**
 * Who this school is, in the shape rosterStore's own `asIdentity` reads: the
 * sports it sells and the look to draw them in. Handed over raw, because the
 * validating belongs on the other side of the guard.
 */
const identityBody = (demo: DemoData): unknown => ({
  sports: demo.sportNames,
  colors: demo.colors,
  logo: demo.logo,
});

export async function demoIdentity(slug: string): Promise<unknown> {
  const demo = await loadDemo();
  return demo && slug === demo.slug ? identityBody(demo) : null;
}

/** The same answer without waiting, for the one caller that cannot: the kept
 * copy read during a render. Null until the fetch above has landed, which is
 * exactly what a first visit to a real school looks like. */
export function keptDemoIdentity(slug: string): unknown {
  return arrived && slug === arrived.slug ? identityBody(arrived) : null;
}

/**
 * One sport's roster, in the shape rosterStore's `parseCached` reads.
 *
 * The conference rides on football alone, because the standings are folded out
 * of football seasons and no other sport has anything to fold — the same rule
 * School.tsx applies when it decides whether to draw a fourth tab.
 */
export async function demoRosterBody(slug: string, sport: string): Promise<unknown> {
  const demo = await loadDemo();
  if (!demo || slug !== demo.slug) return null;
  const entry = demo.sports[sport];
  if (!entry) return null;
  return {
    season: demo.season,
    players: entry.players,
    colors: demo.colors,
    logo: demo.logo,
    schedule: entry.schedule,
    league: sport === 'football' ? demo.league : null,
  };
}
