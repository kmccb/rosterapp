/*
 * A school's playoff region, as committed files.
 *
 * scripts/build-regions.mjs writes /oh/regions/index.json — which region each
 * school is in this season — and /oh/regions/<n>.json, the Harbin rankings
 * for a region. Two small fetches from our own origin: the index to find the
 * number, then the one table. Nothing here asks Joe Eitel's site anything; the
 * workflow did that, once, for everybody.
 *
 * Junk is treated as nothing, row by row, for the reason every loader on this
 * page gives: the files are written by a script and are still files, and a
 * table that prints "NaN" beside a school's name in the last week of the
 * season is worse than no table.
 */

import { divisionOf } from '../ohio/regionParse';
import { isDemo } from './demo';
import { chosenSlug } from './store';

export type RegionStanding = {
  rank: string;
  record: string;
  school: string;
  /** The directory's slug for the row, when it has one — what marks a row as "us". */
  slug: string | null;
  average: number;
  /** In a playoff place as things stand. */
  qualifying: boolean;
};

export type RegionTable = {
  region: number;
  /** "VII" */
  division: string;
  /** "Top 12 teams following week 10 qualify for playoffs" */
  caption: string;
  rows: RegionStanding[];
};

const KEPT = (slug: string): string => `oh.region.${slug}`;

export const asRegionTable = (v: unknown): RegionTable | null => {
  if (typeof v !== 'object' || v === null) return null;
  const file = v as Record<string, unknown>;
  const region = Number(file.region);
  if (!divisionOf(region) || !Array.isArray(file.rows)) return null;

  const rows: RegionStanding[] = [];
  for (const r of file.rows as Array<Record<string, unknown> | null>) {
    if (typeof r !== 'object' || r === null) continue;
    if (typeof r.school !== 'string' || !r.school.trim()) continue;
    if (typeof r.average !== 'number' || !Number.isFinite(r.average)) continue;
    rows.push({
      rank: typeof r.rank === 'string' ? r.rank : '',
      record: typeof r.record === 'string' ? r.record : '',
      school: r.school,
      slug: typeof r.slug === 'string' ? r.slug : null,
      average: r.average,
      qualifying: r.qualifying === true,
    });
  }
  // One row is not a ranking, and the caller would draw it as one.
  if (rows.length < 2) return null;

  return {
    region,
    division: divisionOf(region),
    caption: typeof file.caption === 'string' ? file.caption.slice(0, 120) : '',
    rows,
  };
};

const getJson = async (path: string): Promise<unknown> => {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  // A host can answer a missing file with a page of its own and a 200; the
  // parse turns that into null and the validators turn null into nothing.
  return res.ok ? res.json().catch(() => null) : null;
};

/**
 * Network first, then whatever was kept — the same rule as the season. Null
 * when the school is in no region this season, which is true of a school the
 * rankings do not list and of every school before the regions are drawn.
 */
export async function loadRegion(slug: string): Promise<RegionTable | null> {
  try {
    const index = (await getJson('/oh/regions/index.json')) as { regions?: Record<string, unknown> } | null;
    const n = Number(index?.regions?.[slug]);
    if (index && !divisionOf(n)) {
      if (!isDemo()) localStorage.removeItem(KEPT(slug));
      return null;
    }
    if (divisionOf(n)) {
      const table = asRegionTable(await getJson(`/oh/regions/${n}.json`));
      if (table) {
        // Kept for the followed school only, and never by the demo.
        if (!isDemo() && slug === chosenSlug()) {
          try {
            localStorage.setItem(KEPT(slug), JSON.stringify(table));
          } catch {
            // A full jar must not fail a fetch that already succeeded.
          }
        }
        return table;
      }
    }
  } catch {
    /* no signal */
  }
  if (isDemo()) return null;
  try {
    return asRegionTable(JSON.parse(localStorage.getItem(KEPT(slug)) ?? 'null'));
  } catch {
    return null;
  }
}

/** "6.3250" — the site prints four places and seeding has been decided on the third. */
export const averageLabel = (average: number): string => average.toFixed(4);
