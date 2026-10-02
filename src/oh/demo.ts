/*
 * The demo school.
 *
 * /oh/demo/ is a page a seller can hand a prospect: Springfield (New
 * Middletown), the school the sales video was made for, as it would look the
 * day it signed up. The committed file carries what a paid activation would —
 * colors, crest, sample rosters, pasted volleyball and basketball schedules and
 * the conference — and nothing else. Football's schedule, scores and standings
 * are not in it: the store reads them from the directory, real and current,
 * exactly as it does for a paying school.
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
import { inSeason } from './sportSeasons';

/** The one school this page is about — a real directory slug, so that whatever
 * the file does not carry falls through to that school's own directory data. */
export const DEMO_SLUG = 'springfield-new-middletown';

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
  /** Any football season the file bakes in place of the directory's. The
   * Springfield demo bakes none — its school and every conference member are
   * read from the directory — so this is usually empty, and a slug missing from
   * it is the normal case rather than a fault. */
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

  // No seasons at all is the usual file: football comes from the directory.
  // Seasons that are there, though, are held to the shape — a half-written one
  // would take the League tab down with it.
  if (v.seasons !== undefined && !isRecord(v.seasons)) return null;
  const seasons: Record<string, SchoolSeason> = {};
  for (const [slug, raw] of Object.entries(v.seasons ?? {})) {
    const season = asSeason(raw);
    if (!season) return null;
    seasons[slug] = season;
  }

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
 * last Tuesday — to an audience that reads schedules for a living. Asking anyone
 * to remember to re-run a script is not a fix.
 *
 * So a schedule with results on it is moved at read time. Whole weeks, which is
 * the whole trick: every date keeps its day of the week, so a Tuesday match
 * stays on a Tuesday.
 *
 * Each sport is moved on its own, by its own results, and only a sport that has
 * results moves at all. A schedule with no scores on it — basketball in
 * October, or a whole autumn written as fixtures in February — was put on the
 * calendar by the generator against the hub's own month table, and it is right
 * where it is until its season arrives: moving it by volleyball's weeks used to
 * open basketball on Christmas Day, then in January under a hub saying "In
 * season". Nothing it shows is stale, because nothing on it has been played.
 *
 * And a sport is never moved out of its own months. Past that point the
 * season is over as far as the hub is concerned ("Starts in August"), and a row
 * of last week's volleyball results under that note is a worse contradiction
 * than a season left where it ended. That is the reason the generator still
 * wants re-running twice a year.
 *
 * Any baked football seasons (the Springfield file has none — its football is
 * the directory's, already today's) move as one block, with the forecast, by
 * the same rule: baked rivals carry the same conference games from the other
 * side, and a season shifted by a different number of weeks would put the
 * standings table at odds with the school's own record.
 */
const MS_DAY = 86_400_000;

const dayOf = (date: string): number => Date.parse(`${date}T00:00:00Z`);

const moveDate = (date: string, days: number): string => {
  const at = dayOf(date);
  return Number.isNaN(at) ? date : new Date(at + days * MS_DAY).toISOString().slice(0, 10);
};

const monthOf = (date: string): number => Number(date.slice(5, 7));

/**
 * How many whole weeks one sport's dates should move.
 *
 * The last day anything was played is the hinge: the generator put it on the
 * most recent day that had been, and it has to land there again. Moving it into
 * the window from yesterday back to a week ago does that, and because the
 * earliest unplayed date the generator writes is a clear week the far side of
 * that hinge, everything ahead lands on today or later without being counted
 * separately.
 *
 * Then the answer is cut back, a week at a time, until every date still sits in
 * the sport's own months (src/oh/sportSeasons.ts) — see above for why.
 *
 * No results, no move; and never negative, so a file that reads as generated in
 * the future — a phone with a slow clock, most likely — is left as written.
 */
const weeksFor = (
  sport: string,
  dates: Array<{ date: string; played: boolean }>,
  today: Date,
): number => {
  const scored = dates.filter((d) => d.played).map((d) => d.date);
  if (!scored.length) return 0;
  const hinge = dayOf(scored.reduce((a, b) => (a > b ? a : b)));
  if (Number.isNaN(hinge)) return 0;

  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const gap = Math.round((now - hinge) / MS_DAY);
  let weeks = Math.max(0, Math.floor((gap - 1) / 7));

  const inMonths = (w: number) =>
    dates.every(({ date }) => inSeason(sport, monthOf(moveDate(date, w * 7))));
  while (weeks > 0 && !inMonths(weeks)) weeks -= 1;
  return weeks;
};

const seasonDates = (data: DemoData) =>
  Object.values(data.seasons).flatMap((s) =>
    s.games.map((g) => ({ date: g.date, played: !!g.result })),
  );

const scheduleDates = (entry: DemoSport) =>
  (entry.schedule ?? []).map((r) => ({ date: r.date, played: !!r.score }));

/**
 * The furthest any part of the file is behind, in whole weeks — zero for a file
 * that is already today's, which is the case worth asking about.
 */
export const weeksBehind = (data: DemoData, today: Date): number =>
  Math.max(
    weeksFor('football', seasonDates(data), today),
    ...Object.entries(data.sports).map(([name, entry]) =>
      weeksFor(name, scheduleDates(entry), today),
    ),
  );

/** The same demo, each part with results moved on by its own whole weeks. */
export const shiftToNow = (data: DemoData, today: Date): DemoData => {
  if (weeksBehind(data, today) === 0) return data;

  const sports: Record<string, DemoSport> = {};
  for (const [name, entry] of Object.entries(data.sports)) {
    const days = weeksFor(name, scheduleDates(entry), today) * 7;
    sports[name] = days
      ? {
          players: entry.players,
          schedule: entry.schedule?.map((r) => ({ ...r, date: moveDate(r.date, days) })) ?? null,
        }
      : entry;
  }

  const days = weeksFor('football', seasonDates(data), today) * 7;
  const seasons: Record<string, SchoolSeason> = {};
  for (const [slug, season] of Object.entries(data.seasons)) {
    seasons[slug] = days
      ? { ...season, games: season.games.map((g) => ({ ...g, date: moveDate(g.date, days) })) }
      : season;
  }

  const weather = data.weather;
  return {
    ...data,
    seasons,
    sports,
    weather:
      weather && days
        ? {
            ...weather,
            date: moveDate(weather.date, days),
            // `at` is the same day with an hour on it; only the day moves.
            at: weather.at.includes('T')
              ? `${moveDate(weather.at.slice(0, 10), days)}${weather.at.slice(10)}`
              : weather.at,
          }
        : weather,
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

/** A season the file bakes, if it bakes one. Null for anything it does not —
 * for the Springfield demo, everything — which lets the caller go on to the
 * directory as it always has. */
export async function demoSeason(slug: string): Promise<SchoolSeason | null> {
  const demo = await loadDemo();
  return demo?.seasons[slug] ?? null;
}

/** A baked forecast, for the demo school and nobody else. Null when the file
 * bakes none, and then the caller reads the real one. */
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
