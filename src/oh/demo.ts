/*
 * The demo school.
 *
 * /oh/demo/ is a page a seller can hand a prospect: Poland Seminary, with
 * every varsity sport on its real calendar, out of one committed file. The
 * schedules are real — read off the school's own Eventlink feed by
 * scripts/build-demo.mjs — and the rosters are invented, because the root
 * app's roster travels by share code and this page asks the database for
 * nothing. The footer says so.
 *
 * What matters about this module is what it is *not*: it is not a second copy
 * of the School screen. The demo page mounts the real one, and two store
 * functions take a guard clause at the top that answers out of this file
 * instead of the network — the roster and the identity. The season, the
 * conference members and the forecast are not here at all: the demo's slug is
 * Poland's real directory slug, so those fall through to the same committed
 * files a real school's page reads, and football's scores arrive weekly on
 * their own.
 *
 * Nothing here imports a runtime value from store.ts or rosterStore.ts — those
 * two import from here, and a cycle between them would be a live hazard for the
 * sake of a validator. Types only, which are erased. The sanitizing is done on
 * the other side of the guard, by the same doors the network answers come
 * through.
 */

import type { Player } from '../types';
import type { School } from '../ohio/stateModel';
import type { ScheduleRow } from './scheduleParse';

/** The one school this page is about — Poland's real directory slug, so the
 * season, the conference and the forecast are the real ones. */
export const DEMO_SLUG = 'poland-seminary-poland';

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

/** A malformed file reads as no demo at all, rather than throwing into a
 * screen — the rule every other reader in this bundle keeps. Keys an older
 * generator wrote (seasons, weather) are simply not read. */
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

  return {
    slug: v.slug,
    season: v.season,
    school,
    colors: v.colors,
    logo: v.logo,
    league: v.league,
    sportNames: v.sportNames as string[],
    sports,
  };
};

/*
 * Fetched once, whatever asks for it.
 *
 * Three store functions and one of them synchronous, so the promise is held
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
        arrived = asDemo(body);
        return arrived;
      })
      .catch(() => null);
  }
  return pending;
}

// ------------------------------------------------------- what the guards ask

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
