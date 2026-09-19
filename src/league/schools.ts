/*
 * The Schools view's arithmetic: which schools match what was typed, and how
 * one of the directory's games reads as a row. Pure, so a ranking that feels
 * wrong can be pinned in a test rather than argued about on a phone.
 */

import type { School } from '../ohio/stateModel';

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
