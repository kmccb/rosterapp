/*
 * A paid school's past seasons, and its record against one opponent.
 *
 * scripts/build-history.mjs reads joeeitel's weekly scoreboards for 2011–2025
 * once, by hand, and commits /oh/history/<slug>.json for each paying school. The
 * current season is never in that file; the page already has it from the
 * directory, and `meetings` stitches the two together.
 *
 * A row is [date, opponent slug, opponent as printed, "home" | "away", our
 * score, their score]. There is no "neutral": from 2011 to 2015 the scoreboard
 * printed every game as "A vs B", so a neutral site can't be told from an
 * ordinary one for a third of the years, and a flag that is right only some of
 * the time would mislead more than it informs. The parser's away-then-home order
 * holds for every year (checked against Poland's own record book), so that is
 * what is kept.
 *
 * The opponent's slug is today's directory slug. An Ohio school printed under an
 * older town ("South Range (North Lima)" before it was "(Canfield)") is matched
 * by name alone when exactly one school in the directory has that name. It is
 * null otherwise — an out-of-state side, a school that has since closed or
 * merged, or a name like "East" that several schools share — so a row never
 * links to a page that isn't there, or to the wrong one. The printed name is
 * always kept.
 *
 * Built to be fetched and read on a phone: a file that isn't what this expects
 * gives no history rather than an error, and a malformed row is dropped rather
 * than shown as "NaN – 7".
 */

import type { Game, HeadToHead } from '../schedule/icalParse.ts';
import { seasonsBySchool, slugFor, type School, type SchoolGame } from '../ohio/stateModel.ts';
import type { StateGame } from '../ohio/stateParse.ts';

export type Venue = 'home' | 'away';

export type HistoryRow = [
  date: string,
  opponentSlug: string | null,
  opponent: string,
  venue: Venue,
  us: number,
  them: number,
];

export type SchoolHistory = {
  slug: string;
  from: number;
  to: number;
  /** Newest first. */
  games: HistoryRow[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const score = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
const year = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 1900;

const row = (r: unknown): HistoryRow | null => {
  if (!Array.isArray(r) || r.length !== 6) return null;
  const [date, slug, name, venue, us, them] = r;
  if (typeof date !== 'string' || !ISO.test(date)) return null;
  if (slug !== null && (typeof slug !== 'string' || slug === '')) return null;
  if (typeof name !== 'string' || name.trim() === '') return null;
  if (venue !== 'home' && venue !== 'away') return null;
  if (!score(us) || !score(them)) return null;
  return [date, slug, name, venue, us, them];
};

/** The committed file, checked. Anything that isn't one gives null; never throws. */
export function parseHistory(raw: unknown): SchoolHistory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { slug, from, to, games } = raw as Record<string, unknown>;
  if (typeof slug !== 'string' || slug === '') return null;
  if (!year(from) || !year(to) || from > to) return null;
  if (!Array.isArray(games)) return null;

  const rows = games.map(row).filter((r): r is HistoryRow => r !== null);
  rows.sort((a, b) => b[0].localeCompare(a[0]));
  return { slug, from, to, games: rows };
}

/*
 * Rows become the Game shape Poland's head-to-head already reads, so the
 * Schedule tab can show the same record and list. A school with no directory
 * page is keyed by its printed name behind a "~", which no slug can start with,
 * so it never matches a real opponent's slug by accident.
 */
export const keyFor = (slug: string | null, name: string): string =>
  slug ?? `~${name.toLowerCase()}`;

const asGame = ([date, slug, name, venue, us, them]: HistoryRow): Game => ({
  date,
  opponent: name,
  opponentKey: keyFor(slug, name),
  home: venue === 'home',
  scrimmage: false,
  result: { us, them, won: us > them },
});

/** Every past game, as Games, newest first. */
export function historyGames(history: SchoolHistory | null): Game[] {
  return history ? history.games.map(asGame) : [];
}

/** This season's scored games from the directory, in the same shape. */
export function seasonGames(season: SchoolGame[]): Game[] {
  return season
    .filter((g) => g.result)
    .map((g) => ({
      date: g.date,
      opponent: g.opponent,
      opponentKey: keyFor(g.opponentSlug, g.opponent),
      home: g.home,
      scrimmage: false,
      result: g.result,
    }));
}

/**
 * The record against one opponent: the history file plus this season's scored
 * games, newest first. A date in both counts once, so a history file that one
 * day overlaps the current season can't double a meeting.
 */
export function meetings(
  history: SchoolHistory | null,
  season: SchoolGame[],
  opponentSlug: string,
): HeadToHead {
  const byDate = new Map<string, Game>();
  for (const g of [...seasonGames(season), ...historyGames(history)]) {
    if (g.opponentKey === opponentSlug && !byDate.has(g.date)) byDate.set(g.date, g);
  }
  const list = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  return {
    played: list.length,
    won: list.filter((g) => g.result!.won).length,
    lost: list.filter((g) => !g.result!.won).length,
    meetings: list,
  };
}

/**
 * The committed file for one school, or null.
 *
 * Null covers every way of not having one — no file because the school was
 * activated after the last hand-run, no signal, a host answering a missing
 * file with a page of its own — because to a fan they are all the same thing:
 * no all-time line, and the season's own meetings still there. A file for some
 * other school is refused too, so a mis-copied file can't put another school's
 * record on this page.
 *
 * No cache-busting query, unlike the season and the forecast: past seasons
 * don't change between deploys, so the browser's ordinary caching is right.
 */
export async function loadHistory(slug: string): Promise<SchoolHistory | null> {
  try {
    const res = await fetch(`/oh/history/${slug}.json`);
    if (!res.ok) return null;
    const history = parseHistory(await res.json().catch(() => null));
    return history && history.slug === slug ? history : null;
  } catch {
    return null;
  }
}

/*
 * A name reduced the way the directory reduces one for a slug, so "St. John"
 * and "St John" are the same name.
 */
const nameKey = (name: string) => slugFor(name, '');

/*
 * Today's slug for an opponent as the scoreboard printed it. The town is part
 * of a slug because forty-five Ohio school names are shared, but towns drift:
 * a school's mailing town on joeeitel's pages can change between seasons. So a
 * printed name and town that is no longer a slug falls back to the name alone,
 * trusted only when exactly one school in the directory has it. Only an Ohio
 * school is looked up this way (seasonsBySchool gives anyone else no slug at
 * all), and never as the school whose history this is.
 */
export function opponentResolver(directory: readonly Pick<School, 'slug' | 'name'>[]) {
  const known = new Set(directory.map((s) => s.slug));
  const byName = new Map<string, string[]>();
  for (const s of directory) {
    const key = nameKey(s.name);
    byName.set(key, [...(byName.get(key) ?? []), s.slug]);
  }

  return (printedSlug: string | null, name: string, self?: string): string | null => {
    if (!printedSlug) return null;
    if (known.has(printedSlug)) return printedSlug;
    const same = byName.get(nameKey(name)) ?? [];
    return same.length === 1 && same[0] !== self ? same[0] : null;
  };
}

/*
 * The writer's half, kept beside the reader so the two can't drift: one
 * school's rows out of every scoreboard game for the years read. It goes
 * through the directory's own seasonsBySchool, so home and away, the score
 * turned round to this school, and the opponent's slug are worked out exactly
 * as the live directory works them out.
 */
export function buildHistory(
  games: StateGame[],
  slug: string,
  from: number,
  to: number,
  directory: readonly Pick<School, 'slug' | 'name'>[],
): SchoolHistory {
  const opponentSlug = opponentResolver(directory);

  // A page that lists a game twice, or two pages that both carry it, count it once.
  const seen = new Set<string>();
  const unique = games.filter((g) => {
    const key = [g.date, g.away.name, g.away.city, g.home.name, g.home.city].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const season = seasonsBySchool(unique).get(slug);
  const rows: HistoryRow[] = (season?.games ?? [])
    .filter((g) => g.result && Number(g.date.slice(0, 4)) >= from && Number(g.date.slice(0, 4)) <= to)
    .map((g) => [
      g.date,
      opponentSlug(g.opponentSlug, g.opponent, slug),
      g.opponent,
      g.home ? 'home' : 'away',
      g.result!.us,
      g.result!.them,
    ]);
  rows.sort((a, b) => b[0].localeCompare(a[0]));
  return { slug, from, to, games: rows };
}

/** One row per line, so a re-run's diff shows the games that changed. */
export const historyJson = (h: SchoolHistory): string =>
  `{"slug":${JSON.stringify(h.slug)},"from":${h.from},"to":${h.to},"games":[\n` +
  h.games.map((r) => JSON.stringify(r)).join(',\n') +
  `\n]}\n`;
