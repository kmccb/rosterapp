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
  /** The day the table last changed, `YYYY-MM-DD`, or '' when the file does not say. */
  fetched: string;
  rows: RegionStanding[];
};

/**
 * The football season a day belongs to: July onward is this year's, and the
 * months before it still belong to last autumn's — the same clock the panel
 * files a row under. The rankings are only shown for the season it is.
 */
export const seasonOf = (day: Date): number =>
  day.getMonth() >= 6 ? day.getFullYear() : day.getFullYear() - 1;

const KEPT = (slug: string): string => `oh.region.${slug}`;

/**
 * `season` is the one the reader is in. A table from any other is refused:
 * the regions are redrawn every August, and until somebody runs the full
 * sweep the committed files are last year's — a finished season's final
 * standings, which under this year's schedule would read as today's.
 */
export const asRegionTable = (v: unknown, season: number): RegionTable | null => {
  if (typeof v !== 'object' || v === null) return null;
  const file = v as Record<string, unknown>;
  if (file.year !== season) return null;
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
    fetched: typeof file.fetched === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(file.fetched) ? file.fetched : '',
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
export async function loadRegion(slug: string, today = new Date()): Promise<RegionTable | null> {
  const season = seasonOf(today);
  try {
    const index = (await getJson('/oh/regions/index.json')) as
      | { year?: unknown; regions?: Record<string, unknown> }
      | null;
    const n = index?.year === season ? Number(index?.regions?.[slug]) : NaN;
    if (index && !divisionOf(n)) {
      if (!isDemo()) localStorage.removeItem(KEPT(slug));
      return null;
    }
    if (divisionOf(n)) {
      const table = asRegionTable(await getJson(`/oh/regions/${n}.json`), season);
      if (table) {
        // Kept for the followed school only, and never by the demo.
        if (!isDemo() && slug === chosenSlug()) {
          try {
            // With its year, which is what lets a kept copy be refused next season.
            localStorage.setItem(KEPT(slug), JSON.stringify({ ...table, year: season }));
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
    return asRegionTable(JSON.parse(localStorage.getItem(KEPT(slug)) ?? 'null'), season);
  } catch {
    return null;
  }
}

/** "6.3250" — the site prints four places and seeding has been decided on the third. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-10" → "Oct 10". A calendar day, never shifted by a zone. */
export const dayLabel = (iso: string): string => {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m && MONTHS[Number(m[1]) - 1] ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : '';
};

export const averageLabel = (average: number): string => average.toFixed(4);
