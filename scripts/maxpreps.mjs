/*
 * Season stats for the schools whose coaches keep them on MaxPreps.
 *
 * One request per team per run: the team's printable stats page, which is
 * every table MaxPreps has for it on one sheet. It is parsed by
 * src/maxpreps/statsParse.ts and written to public/oh/stats/<slug>-<sport>.json,
 * where the school's page reads it (src/oh/teamStats.ts). The workflow commits
 * whatever changed and the push is the deploy, the same route the directory
 * takes.
 *
 * Which teams is maxpreps-teams.json — a school is added there by hand when it
 * signs up and says its stats are on MaxPreps. There is no discovering them:
 * this reads the pages of schools that asked for it, a handful of times a week,
 * and nothing else on the site.
 *
 * It never makes things worse. A page that fails to arrive, has lost the tables
 * the parser needs, is missing a category that was published before, or comes
 * back with under half the rows already published
 * leaves the committed file exactly as it was — last week's numbers under last
 * week's date — and the run exits non-zero so that GitHub's own failure email
 * is the alert. A file is rewritten only when the numbers in it differ, so
 * `updated` is the day the stats last changed, not the day somebody looked.
 *
 *   node scripts/maxpreps.mjs            the scheduled run: stats for every team
 *   node scripts/maxpreps.mjs --roster   also write each team's roster to
 *                                        scripts/data/ as a CSV, for the
 *                                        panel's "Or a CSV file". Never
 *                                        scheduled: a roster is the school's to
 *                                        give, once, not ours to keep taking.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMaxPrepsRoster, rosterCsv } from '../src/maxpreps/rosterParse.ts';
import { parseMaxPrepsStats } from '../src/maxpreps/statsParse.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withRoster = process.argv.includes('--roster');

const teams = JSON.parse(readFileSync(join(root, 'maxpreps-teams.json'), 'utf8')).teams;

/*
 * Stats are part of the paid page, and paid-schools.json is the repo's own list
 * of who pays (the forecast reads it too). A team left in the config after its
 * school has come off that list is not fetched, and the file it had is taken
 * down — a static file has no paid_through to expire it, so this is the gate.
 */
const paid = new Set(JSON.parse(readFileSync(join(root, 'paid-schools.json'), 'utf8')).slugs);

/* A browser's name, because the page is served to browsers; one request, then
   done, so there is nothing here to throttle. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).pathname}`);
  return res.text();
};

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
};

/* Eastern, because that is the day a parent in Ohio would say the stats went up. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

const failures = [];

for (const team of teams) {
  const label = `${team.slug} ${team.sport}`;

  if (!paid.has(team.slug)) {
    rmSync(join(root, 'public/oh/stats', `${team.slug}-${team.sport}.json`), { force: true });
    console.log(`${label}: not in paid-schools.json — skipped, and no stats file left up`);
    continue;
  }

  try {
    const parsed = parseMaxPrepsStats(await get(team.stats));
    if (parsed.problems.length) throw new Error(parsed.problems.join(' '));

    const path = join(root, 'public/oh/stats', `${team.slug}-${team.sport}.json`);
    const kept = readJson(path);
    if (kept && parsed.rows.length < kept.rows.length / 2) {
      throw new Error(
        `only ${parsed.rows.length} rows where ${kept.rows.length} are published — kept what is there`,
      );
    }

    // A season only ever gains categories. One that was published and is not
    // on the page now is a table the parser has stopped recognising, and
    // publishing the rest under today's date would quietly lose it.
    const now = new Set(parsed.rows.map((r) => r.category));
    const lost = kept ? [...new Set(kept.rows.map((r) => r.category))].filter((c) => !now.has(c)) : [];
    if (lost.length) {
      throw new Error(`${lost.join(', ')} published before and missing now — kept what is there`);
    }

    if (kept && JSON.stringify(kept.rows) === JSON.stringify(parsed.rows)) {
      console.log(`${label}: no change since ${kept.updated}`);
    } else {
      writeJson(path, {
        slug: team.slug,
        sport: team.sport,
        source: 'MaxPreps',
        updated: today,
        rows: parsed.rows,
      });
      console.log(`${label}: ${parsed.rows.length} rows from ${parsed.tables.length} tables`);
    }
  } catch (err) {
    failures.push(`${label} stats: ${err.message}`);
  }

  if (withRoster && team.roster) {
    try {
      const parsed = parseMaxPrepsRoster(await get(team.roster));
      if (parsed.problems.length) throw new Error(parsed.problems.join(' '));
      const path = join(root, 'scripts/data', `${team.slug}-${team.sport}-roster.csv`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, rosterCsv(parsed.players));
      console.log(`${label}: ${parsed.players.length} on the roster`);
    } catch (err) {
      failures.push(`${label} roster: ${err.message}`);
    }
  }
}

if (failures.length) {
  for (const f of failures) console.error(`::error::${f}`);
  process.exit(1);
}
