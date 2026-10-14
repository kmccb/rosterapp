/**
 * Every paying school's football results from 2011 to 2025, as committed files.
 *
 * Run by hand, never scheduled: past seasons don't change. The 240 week pages
 * are kept under scripts/data/scoreboards/ (gitignored — they are joeeitel's
 * pages, not ours to republish), so a school that starts paying later is
 * written from the cache without asking his site for anything again. Only
 * pages the cache lacks are fetched, one at a time, a second apart.
 *
 * All or nothing. A week that won't fetch, a regular-season week that reads as
 * no games at all, or a line the parser can't read that names a school being
 * written stops the run before any file is touched. The second check is the
 * one that matters most: the older pages once parsed to nothing without a word
 * of complaint, and a history quietly missing a season looks exactly like a
 * real one.
 *
 *   node scripts/build-history.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEEK, WEEKS, USER_AGENT } from './lib/ohio-state.mjs';
import { parseScoreboardStrict } from '../src/ohio/stateParse.ts';
import { modernScoreboard } from '../src/ohio/legacyScoreboard.ts';
import { buildHistory, historyJson } from '../src/oh/history.ts';

const FROM = 2011;
const TO = 2025;
/*
 * The bounds below are what the cached pages show, not a guess. Every season
 * from 2011 to 2025 has a page for weeks 1–15, and every one has games through
 * week 13; 2020's COVID season left weeks 14 and 15 as empty pages. Week 16 is
 * the only week that is ever missing — 2011–2020 played five playoff rounds,
 * not six — so an absence any earlier is a failure, not the end of a season.
 */
const FIRST_OPTIONAL_WEEK = 16;
/** A page with no games in these weeks is a page misread, or not the page at all. */
const NONEMPTY_THROUGH = 13;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts', 'data', 'scoreboards');
const outDir = join(root, 'public', 'oh', 'history');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastFetch = 0;

/*
 * A week's page, or null for a playoff week the season never reached. The site
 * answers a week it has no page for with 403, the same as week 17 of any year.
 * Only from FIRST_OPTIONAL_WEEK is that believed, and remembered in the cache
 * so a re-run doesn't ask again; earlier, a 403 is the site refusing us, which
 * stops the run and is not written down, so the next run asks afresh.
 */
async function weekPage(year, n) {
  const file = join(cacheDir, String(year), `week-${n}.html`);
  const absent = `${file}.absent`;
  if (existsSync(file)) return readFile(file, 'utf8');
  if (existsSync(absent)) return null;

  const wait = lastFetch + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();

  const res = await fetch(WEEK(year, n), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20000),
  });
  await mkdir(dirname(file), { recursive: true });
  if ((res.status === 403 || res.status === 404) && n >= FIRST_OPTIONAL_WEEK) {
    await writeFile(absent, `HTTP ${res.status}\n`);
    return null;
  }
  if (!res.ok) throw new Error(`${year} week ${n}: HTTP ${res.status}`);
  const html = await res.text();
  await writeFile(file, html);
  return html;
}

const { slugs } = JSON.parse(await readFile(join(root, 'paid-schools.json'), 'utf8'));
const { schools } = JSON.parse(await readFile(join(root, 'public', 'oh', 'index.json'), 'utf8'));
const bySlug = new Map(schools.map((s) => [s.slug, s]));

for (const slug of slugs) {
  if (!bySlug.has(slug)) throw new Error(`${slug} is in paid-schools.json but not in the directory`);
}
// How each paid school is printed on a scoreboard line, to tell whether a line we can't read is one of ours.
const printed = slugs.map((slug) => `${bySlug.get(slug).name} (${bySlug.get(slug).city})`);

const games = [];
const problems = [];
let skipped = 0;

for (let year = FROM; year <= TO; year++) {
  let seasonGames = 0;
  let weeks = 0;
  for (let n = 1; n <= WEEKS; n++) {
    const html = await weekPage(year, n);
    // The season ended a round early; there is nothing after it either.
    if (html === null) break;
    weeks = n;
    const { games: week, unreadable } = parseScoreboardStrict(modernScoreboard(html), n);

    if (n <= NONEMPTY_THROUGH && week.length === 0) {
      problems.push(`${year} week ${n}: no games read — a misread page, or a challenge page in its place`);
    }
    for (const line of unreadable) {
      if (printed.some((p) => line.includes(p))) problems.push(`${year} week ${n}: unreadable: ${line}`);
      else skipped += 1;
    }
    games.push(...week);
    seasonGames += week.length;
  }
  console.log(`  ${year}: ${weeks} weeks, ${seasonGames} games`);
}

if (problems.length) {
  console.error(`  ! nothing written:\n    ${problems.join('\n    ')}`);
  process.exit(1);
}
if (skipped) console.log(`  (${skipped} unreadable lines named no paid school — out-of-state sides, mostly)`);

await mkdir(outDir, { recursive: true });
for (const slug of slugs) {
  const history = buildHistory(games, slug, FROM, TO, schools);
  await writeFile(join(outDir, `${slug}.json`), historyJson(history));
  console.log(`  wrote ${slug}: ${history.games.length} games`);

  /*
   * A season with no games is the tell that the school was printed under a
   * name this couldn't tie to it, or didn't play; either way someone should look.
   */
  const years = new Set(history.games.map((g) => Number(g[0].slice(0, 4))));
  for (let year = FROM; year <= TO; year++) {
    if (!years.has(year)) console.warn(`  ? ${slug}: no games in ${year}`);
  }
}
