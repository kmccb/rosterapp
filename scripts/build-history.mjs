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
/** Ohio's regular season is ten weeks; a week among them with no games is a page misread. */
const REGULAR_WEEKS = 10;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts', 'data', 'scoreboards');
const outDir = join(root, 'public', 'oh', 'history');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastFetch = 0;

/*
 * A week's page, or null for a playoff week the season never reached. Ohio
 * played five playoff rounds before it played six, and the site answers a week
 * it has no page for with 403, the same as week 17 of any year. That absence is
 * remembered in the cache too, so a re-run doesn't ask again.
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
  if ((res.status === 403 || res.status === 404) && n > REGULAR_WEEKS) {
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
const known = new Set(schools.map((s) => s.slug));
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

    if (n <= REGULAR_WEEKS && week.length === 0) {
      problems.push(`${year} week ${n}: no games read from a regular-season week`);
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
  const history = buildHistory(games, slug, FROM, TO, known);
  await writeFile(join(outDir, `${slug}.json`), historyJson(history));
  console.log(`  wrote ${slug}: ${history.games.length} games`);
}
