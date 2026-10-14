/*
 * The playoff picture for one region, read off Joe Eitel's rankings page.
 *
 * Ohio seeds its playoffs by region on Harbin points, not by conference, so a
 * conference table answers "are we winning the league" and this answers the
 * question people actually ask in October: are we in. Twenty-eight regions,
 * four to a division; the page for each is one table.
 *
 * src/league has a parser for the same page, written for Poland's own app. It
 * is not used here, and not because it is wrong: it is part of the root app's
 * bundle, and it does not read the one column this needs. The table prints a
 * school's mailing city beside its name, and the state directory files every
 * school under exactly that pair — so a row can be tied to a directory school
 * by name and city, with no table of team ids to keep. That is what makes the
 * rankings possible for any school in the state rather than for the one whose
 * id somebody looked up.
 *
 * Pure, and pinned to a saved page.
 */

export type RegionRow = {
  /** As printed — "1t" when tied. */
  rank: string;
  /** Wins and losses in the games that count toward the points. */
  record: string;
  school: string;
  city: string;
  /** Harbin average, the number seeding is decided on. */
  average: number;
  /** The site marks the rows currently in a playoff place. */
  qualifying: boolean;
};

export type RegionPage = {
  /** The season the page says it is for. */
  year: number;
  region: number;
  /** "Top 12 teams following week 10 qualify for playoffs" */
  caption: string;
  rows: RegionRow[];
};

const strip = (s: string): string =>
  s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Regions run 1 to 28, four to a division, in order: 13 is in Division IV. '' when it is not a region. */
export const divisionOf = (region: number): string =>
  Number.isInteger(region) && region >= 1 && region <= 28 ? ROMAN[Math.ceil(region / 4) - 1] : '';

/**
 * Null when the page is not a region's table. The columns are found by their
 * headings rather than counted: the site hides and shows columns by screen
 * width and has added one before, and "the fifth cell" is a guess that turns a
 * city into a school without anything failing.
 */
export function parseRegionPage(html: string): RegionPage | null {
  const title = html.match(/<title>\s*(\d{4})\s+Region\s+(\d+)\b/i);
  const year = Number(title?.[1]);
  const region = Number(title?.[2]);
  if (!divisionOf(region)) return null;

  const head = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? '';
  const headings = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((h) => strip(h[1]).toLowerCase());
  const at = (wanted: RegExp): number => headings.findIndex((h) => wanted.test(h));
  const col = {
    rank: at(/rank/),
    record: at(/w-l/),
    city: at(/city/),
    school: at(/^school$/),
    average: at(/average/),
  };
  if (Object.values(col).some((i) => i < 0)) return null;

  const rows: RegionRow[] = [];
  for (const m of html.matchAll(/<tr class="(?:odd|even)([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]));
    const school = cells[col.school] ?? '';
    const average = Number(cells[col.average]);
    if (!school || !Number.isFinite(average)) continue;
    rows.push({
      rank: cells[col.rank] ?? '',
      record: cells[col.record] ?? '',
      school,
      city: cells[col.city] ?? '',
      average,
      qualifying: /qualifyingPosition/.test(m[1]),
    });
  }
  if (rows.length === 0) return null;

  // Before a game has been played every team is level on nothing, and the
  // site still marks the first dozen it lists. That is the order it happens to
  // print them in, not a playoff place.
  if (rows.every((r) => r.average === 0)) for (const r of rows) r.qualifying = false;

  return { year, region, caption: strip(html.match(/<caption>([\s\S]*?)<\/caption>/)?.[1] ?? ''), rows };
}

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The directory school a row is, or null.
 *
 * Name and city together, because a name alone is not a school: there are four
 * Springfields. Both come from the same site the directory was built from, so
 * they agree to the letter nearly always; punctuation and case are ignored for
 * the times they do not. A row that fits no school, or more than one, is left
 * unplaced — it is still printed in the table, by its name, and simply cannot
 * be the row that is highlighted as "us".
 */
export function slugForRow(
  row: { school: string; city: string },
  directory: Array<{ slug: string; name: string; city: string }>,
): string | null {
  const name = squash(row.school);
  const city = squash(row.city);
  const hits = directory.filter((s) => squash(s.name) === name && squash(s.city) === city);
  return hits.length === 1 ? hits[0].slug : null;
}
