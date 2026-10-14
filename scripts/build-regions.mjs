/*
 * The playoff rankings, a region at a time, written as static files and committed.
 *
 * Ohio has twenty-eight regions and Joe Eitel's site has a page for each. Two
 * things are kept: public/oh/regions/<n>.json, the table for a region, and
 * public/oh/regions/index.json, which region every school is in. A school's
 * page reads the index to find its region and then that region's file
 * (src/oh/regions.ts).
 *
 * The budget is the point of how this is arranged. The directory refresh costs
 * the site sixteen requests, twice a week, and it is one person's hobby site;
 * reading all twenty-eight regions on every run as well would nearly triple
 * that for tables almost nobody is looking at. So:
 *
 *   node scripts/build-regions.mjs --all   every region, a second apart. By
 *                                          hand, when the regions are drawn in
 *                                          August and whenever a school pays
 *                                          that the index has never heard of.
 *   node scripts/build-regions.mjs         the scheduled run: only the regions
 *                                          that hold a school in
 *                                          paid-schools.json — today, one.
 *
 * It never makes things worse and, on the scheduled run, never fails: it
 * shares a workflow with the directory, and a rankings page that would not
 * load must not stop the state's scores being committed. A page that fails, is
 * not a region's table, or has under half the rows already published leaves
 * the committed file as it was and says so in a warning.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { divisionOf, parseRegionPage, slugForRow } from '../src/ohio/regionParse.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public/oh/regions');
const indexPath = join(dir, 'index.json');
const all = process.argv.includes('--all');

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const directory = readJson(join(root, 'public/oh/index.json'));
const schools = directory.schools;
const year = directory.year;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

const index = readJson(indexPath);
// Last year's index says where schools were, and the regions are redrawn.
const known = index?.year === year ? index.regions : {};

let wanted;
if (all) {
  wanted = Array.from({ length: 28 }, (_, i) => i + 1);
} else {
  const paid = readJson(join(root, 'paid-schools.json'))?.slugs ?? [];
  wanted = [...new Set(paid.map((slug) => known[slug]).filter((n) => divisionOf(n)))].sort((a, b) => a - b);
  for (const slug of paid) {
    if (!divisionOf(known[slug])) {
      console.log(`::warning::${slug} is not in the regions index for ${year} — run build-regions.mjs --all once`);
    }
  }
}

const failures = [];
const regions = { ...known };

for (const [i, n] of wanted.entries()) {
  if (i > 0) await sleep(1000);
  const path = join(dir, `${n}.json`);
  try {
    const res = await fetch(`https://joeeitel.com/hsfoot/rankings/${year}/region-${n}`, {
      headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${res.status} from the site`);
    const page = parseRegionPage(await res.text());
    if (!page) throw new Error('the page is not a region’s table');
    if (page.region !== n) throw new Error(`the page is region ${page.region}’s`);

    const kept = readJson(path);
    if (kept?.year === year && page.rows.length < kept.rows.length / 2) {
      throw new Error(`only ${page.rows.length} teams where ${kept.rows.length} are published`);
    }

    const rows = page.rows.map((row) => ({ ...row, slug: slugForRow(row, schools) }));
    const unplaced = rows.filter((r) => !r.slug).map((r) => r.school);
    for (const row of rows) if (row.slug) regions[row.slug] = n;

    const next = { year, region: n, division: divisionOf(n), caption: page.caption, rows };
    // Rewritten only when the table moved, so `fetched` is the day it last did.
    const same = kept && JSON.stringify({ ...kept, fetched: undefined }) === JSON.stringify({ ...next, fetched: undefined });
    if (!same) writeJson(path, { ...next, fetched: today });
    console.log(
      `region ${n}: ${rows.length} teams${same ? ', no change' : ''}` +
        (unplaced.length ? ` — not in the directory: ${unplaced.join(', ')}` : ''),
    );
  } catch (err) {
    failures.push(`region ${n}: ${err.message} — kept what is there`);
  }
}

// A school the full sweep no longer finds anywhere has left the rankings; on a
// partial run nothing is known about the regions that were not read.
if (all && failures.length === 0) {
  const seen = new Set();
  for (const n of wanted) for (const row of readJson(join(dir, `${n}.json`))?.rows ?? []) if (row.slug) seen.add(row.slug);
  for (const slug of Object.keys(regions)) if (!seen.has(slug)) delete regions[slug];
}

const nextIndex = { year, regions: Object.fromEntries(Object.entries(regions).sort(([a], [b]) => a.localeCompare(b))) };
if (wanted.length && JSON.stringify(nextIndex) !== JSON.stringify(index)) writeJson(indexPath, nextIndex);

for (const f of failures) console.log(`::warning::${f}`);
// By hand, a failure should look like one. Scheduled, it must not: see above.
if (all && failures.length) process.exit(1);
