/*
 * The Schools view's arithmetic: which schools match what was typed, and how
 * one of the directory's games reads as a row. Pure, so a ranking that feels
 * wrong can be pinned in a test rather than argued about on a phone.
 */

import type { School, SchoolGame, SchoolSeason } from '../ohio/stateModel';

const MAX_MATCHES = 15;

const squash = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/*
 * Lower is better. A name that starts with the query is what almost everyone
 * meant; the town comes next because "Ursuline" is in Youngstown and a reader
 * who types the town should still find it; a bare "contains" is the fallback
 * that keeps "Youngstown East" reachable from "east".
 */
const tier = (school: School, q: string): number | null => {
  const name = squash(school.name);
  const city = squash(school.city);
  if (name.startsWith(q)) return 0;
  if (city.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (city.includes(q)) return 3;
  return null;
};

export function searchSchools(schools: School[], query: string): School[] {
  const q = squash(query);
  if (q.length < 2) return [];

  return schools
    .map((school) => ({ school, tier: tier(school, q) }))
    .filter((m): m is { school: School; tier: number } => m.tier !== null)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.school.name.localeCompare(b.school.name) ||
        a.school.city.localeCompare(b.school.city),
    )
    .slice(0, MAX_MATCHES)
    .map((m) => m.school);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/*
 * The directory's date is already the Eastern calendar day. Building a Date
 * from it in UTC and reading UTC parts back keeps a phone west of Ohio from
 * printing Thursday for a Friday game.
 */
const shortDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[at.getUTCDay()]} ${MONTHS[m - 1]} ${d}`;
};

const score = (game: SchoolGame): string => {
  const r = game.result;
  if (!r) return game.kickoff || '';
  const mark = r.us === r.them ? 'T' : r.won ? 'W' : 'L';
  return `${mark} ${r.us}–${r.them}`;
};

export function describeGame(game: SchoolGame): {
  week: string;
  date: string;
  opponent: string;
  result: string;
} {
  return {
    week: `Wk ${game.week}`,
    date: shortDate(game.date),
    opponent: `${game.home ? 'vs' : 'at'} ${game.opponent}`,
    result: score(game),
  };
}

export const recordOf = (season: SchoolSeason): string =>
  `${season.record.won}–${season.record.lost}`;
