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

/*
 * What was published last time: the school count that guards against a
 * shrunk directory, and the game count that guards against one that held its
 * size while losing games underneath it. `games` postdates some committed
 * copies, so its absence skips that half of the check rather than tripping it.
 */
const previousIndex = async () => {
  if (!existsSync(indexFile)) return { schools: 0, games: undefined };
  try {
    const parsed = JSON.parse(await readFile(indexFile, 'utf8'));
    return {
      schools: parsed.schools.length,
      games: typeof parsed.games === 'number' ? parsed.games : undefined,
    };
  } catch {
    return { schools: 0, games: undefined };
  }
};

const { games, weeks, failed } = await fetchSeason(year);
console.log(`  fetched ${weeks.length}/${weeks.length + failed.length} weeks, ${games.length} games`);

const schools = directory(games);
const seasons = seasonsBySchool(games);
const { schools: before, games: beforeGames } = await previousIndex();

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

/*
 * A week that failed outright is a hole in the season, not a source that
 * corrected itself — the school-count floor above can pass while an entire
 * week's games are missing from every school that played in it. Refuse to
 * publish rather than let that hole reach the site quietly.
 */
if (failed.length > 0 && before > 0) {
  console.error(
    `  ! week(s) ${failed.join(',')} failed to fetch — publishing would drop their games from ` +
      `every school that played in them. Keeping the committed copy.`,
  );
  process.exit(1);
}

/*
 * The same guard as schools, but on games directly, because a school survives
 * on the list with zero games just as easily as with a full slate. Skipped
 * when the committed index predates this field.
 */
if (beforeGames !== undefined && games.length < beforeGames * 0.9) {
  console.error(
    `  ! ${games.length} games against ${beforeGames} already published — too few. ` +
      `Keeping the committed copy.`,
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
  `${JSON.stringify({ year, fetched: new Date().toISOString(), schools, games: games.length }, null, 0)}\n`,
);

for (const season of seasons.values()) {
  await writeFile(join(dataDir, `${season.school.slug}.json`), `${JSON.stringify(season)}\n`);
}

console.log(`  wrote ${schools.length} schools, ${seasons.size} season files`);
if (failed.length) console.warn(`  ? weeks that failed: ${failed.join(',')}`);
