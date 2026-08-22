/**
 * The Ohio directory, written as static files and committed.
 *
 * No database. Sixteen requests a refresh is not a load problem worth buying
 * infrastructure for, and committing the result gives free hosting, a diff for
 * every score that changes, and a record of what the source said on the day —
 * the same reasoning that puts teams/poland/history.json in the repository.
 *
 * Refuses to publish a season that is worse than the committed one. A fetch
 * that half-fails would otherwise quietly delete schools from the directory,
 * and a school whose page disappears is a worse failure than one whose scores
 * are a day old.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSeason } from './lib/ohio-state.mjs';
import { directory, seasonsBySchool } from '../src/ohio/stateModel.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'oh');
const dataDir = join(out, 'data');
const indexFile = join(out, 'index.json');

const year = Number(process.argv[2]) || new Date().getFullYear();

const previousCount = async () => {
  if (!existsSync(indexFile)) return 0;
  try {
    return JSON.parse(await readFile(indexFile, 'utf8')).schools.length;
  } catch {
    return 0;
  }
};

const { games, weeks, failed } = await fetchSeason(year);
console.log(`  fetched ${weeks.length}/${weeks.length + failed.length} weeks, ${games.length} games`);

const schools = directory(games);
const seasons = seasonsBySchool(games);
const before = await previousCount();

/*
 * The guard. A directory that has shrunk means weeks went missing, and
 * republishing it would delete schools people have bookmarked. Ten per cent is
 * slack for a source correcting a duplicate, not for a failed run.
 */
if (before > 0 && schools.length < before * 0.9) {
  console.error(
    `  ! ${schools.length} schools against ${before} already published — too few. ` +
      `Keeping the committed copy. Failed weeks: ${failed.join(',') || 'none'}.`,
  );
  process.exit(1);
}

await mkdir(dataDir, { recursive: true });

// Clear the data directory so a school that genuinely left does not linger.
for (const f of await readdir(dataDir).catch(() => [])) {
  if (f.endsWith('.json')) await rm(join(dataDir, f));
}

await writeFile(
  indexFile,
  `${JSON.stringify({ year, fetched: new Date().toISOString(), schools }, null, 0)}\n`,
);

for (const season of seasons.values()) {
  await writeFile(join(dataDir, `${season.school.slug}.json`), `${JSON.stringify(season)}\n`);
}

console.log(`  wrote ${schools.length} schools, ${seasons.size} season files`);
if (failed.length) console.warn(`  ? weeks that failed: ${failed.join(',')}`);
