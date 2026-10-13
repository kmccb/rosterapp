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
 * Which teams comes from two places. The database is the usual one: the seller
 * sets a school's MaxPreps link in the panel, and school_stats_targets (0009)
 * answers with the links of the rows that are published and paid today. It is
 * asked with the anon key the site's own bundle ships, and only when
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are both set. The other is
 * maxpreps-teams.json, where a school was added by hand before the panel could
 * do it, and still can be. A team in both is read once, from the database's
 * link. Either way there is no discovering them: this reads the pages of
 * schools that asked for it, a handful of times a week, and nothing else on
 * the site.
 *
 * If the database cannot be asked — the call fails, or 0009 has not been
 * applied yet — the run says so in one line and carries on with the file's
 * teams, and takes nothing down: a stats file is removed for being in neither
 * list only on a run where the database actually answered.
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

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMaxPrepsRoster, rosterCsv } from '../src/maxpreps/rosterParse.ts';
import { parseMaxPrepsStats } from '../src/maxpreps/statsParse.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withRoster = process.argv.includes('--roster');

const statsDir = join(root, 'public/oh/stats');
const fileTeams = JSON.parse(readFileSync(join(root, 'maxpreps-teams.json'), 'utf8')).teams;

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

/*
 * The database's teams, or null when it could not be asked. Null and an empty
 * list are different answers and the difference matters below: an empty list
 * means nobody has a link set, null means nobody knows.
 */
const askDatabase = async () => {
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/rpc/school_stats_targets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: '{}',
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text();
      const missing = res.status === 404 || text.includes('PGRST202');
      console.log(
        missing
          ? `database: school_stats_targets is not there yet (0009 not applied) — reading the file's teams only`
          : `::warning::database: ${res.status} from school_stats_targets — reading the file's teams only`,
      );
      return null;
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('the answer was not a list');
    return rows;
  } catch (err) {
    console.log(`::warning::database: ${err.message} — reading the file's teams only`);
    return null;
  }
};

/* The database checks this too. Checked again here because what comes back is
   about to be fetched and to name a file on disk. */
const isMaxPreps = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.maxpreps.com' && !url.username && !url.port;
  } catch {
    return false;
  }
};
const plainName = (value) => typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);

const keyOf = (team) => `${team.slug} ${team.sport}`;

const dbRows = await askDatabase();
const dbTeams = [];
// Every slug and sport the database named, whether or not its link was usable:
// a row with a bad link is a row to complain about, not a file to take down.
const dbNamed = new Set();
for (const row of dbRows ?? []) {
  if (!plainName(row?.slug) || !plainName(row?.sport)) {
    failures.push('database: a stats target with a slug or sport that is not a plain name — skipped');
    continue;
  }
  dbNamed.add(keyOf(row));
  if (!isMaxPreps(row.stats_source_url)) {
    failures.push(`${keyOf(row)}: the database's stats link is not an https page on www.maxpreps.com — skipped`);
    continue;
  }
  // The file's roster link, if it has one for this team, still serves --roster.
  const inFile = fileTeams.find((t) => keyOf(t) === keyOf(row));
  dbTeams.push({ slug: row.slug, sport: row.sport, stats: row.stats_source_url, roster: inFile?.roster, paidByDatabase: true });
}

const teams = [...dbTeams, ...fileTeams.filter((t) => !dbNamed.has(keyOf(t)))];
if (dbRows) console.log(`database: ${dbTeams.length} team${dbTeams.length === 1 ? '' : 's'} with a stats link`);

for (const team of teams) {
  const label = `${team.slug} ${team.sport}`;

  // A team the database named is published and paid by the database's own
  // reckoning, which is the better authority; the list is the file's gate.
  if (!team.paidByDatabase && !paid.has(team.slug)) {
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

/*
 * A link cleared in the panel, or a row that has lapsed or been unpublished,
 * leaves a stats file with nobody behind it. It goes — but only when the
 * database answered this run. On a run where it did not, a team missing from
 * its list is not evidence of anything.
 */
if (dbRows && existsSync(statsDir)) {
  const wanted = new Set([...dbNamed, ...fileTeams.map(keyOf)]);
  for (const name of readdirSync(statsDir).filter((n) => n.endsWith('.json'))) {
    let kept;
    try {
      kept = readJson(join(statsDir, name));
    } catch {
      continue;
    }
    // Only a file this script wrote, under the name it would have written it.
    if (!plainName(kept?.slug) || !plainName(kept?.sport) || name !== `${kept.slug}-${kept.sport}.json`) continue;
    if (wanted.has(keyOf(kept))) continue;
    rmSync(join(statsDir, name), { force: true });
    console.log(`${keyOf(kept)}: no stats link in the database or the file — stats file taken down`);
  }
}

if (failures.length) {
  for (const f of failures) console.error(`::error::${f}`);
  process.exit(1);
}
