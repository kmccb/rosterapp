/**
 * Per-season player statistics, fetched once and committed.
 *
 * Run by hand: `node scripts/fetch-players.mjs ysu 2754 2004`
 *
 * Why not in the build: the roster endpoint will hand over a whole squad in
 * one request, but the numbers attached to each player are their *career*
 * totals, not that season's. Reading them as a season put two quarterbacks on
 * 42 passing touchdowns in a year the team scored 27. The only source that
 * splits by season is one request per athlete, and there are 780 of them
 * across two decades — far too many for a job that runs every six hours.
 *
 * So it happens here instead, and the result is a file. Past seasons never
 * change; the build refreshes the current one on its own.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [slug, espnId, fromYear] = process.argv.slice(2);
if (!slug || !espnId) {
  console.error('usage: node scripts/fetch-players.mjs <slug> <espnTeamId> [fromYear]');
  process.exit(1);
}

const FROM = Number(fromYear) || 2004;
const TO = new Date().getFullYear();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const H = { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' };
const V3 = 'https://site.web.api.espn.com/apis/common/v3/sports/football/college-football';

const getJson = async (url) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) });
      if (res.ok) return res.json();
      if (res.status === 404) return null;
    } catch {
      /* retried below */
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
};

const inBatches = async (items, size, fn) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    process.stdout.write(`\r  ${Math.min(i + size, items.length)}/${items.length}`);
  }
  process.stdout.write('\r');
  return out;
};

/*
 * The basics, in the order they'd be read aloud, renamed so they still mean
 * something once the categories are flattened onto one line. Bare labels can't
 * be: a quarterback who also runs has YDS and TD twice over, and "TD 26, TD 27"
 * reads as a mistake.
 *
 * Everything else the API carries — long gain, rating, percentages of
 * percentages — is detail nobody scanning a season for a name is after.
 */
const KEEP = {
  passing: [['CMP', 'Cmp'], ['ATT', 'Att'], ['YDS', 'Pass Yds'], ['TD', 'Pass TD'], ['INT', 'Int']],
  rushing: [['CAR', 'Car'], ['YDS', 'Rush Yds'], ['AVG', 'Avg'], ['TD', 'Rush TD']],
  receiving: [['REC', 'Rec'], ['YDS', 'Rec Yds'], ['AVG', 'Avg'], ['TD', 'Rec TD']],
  defensive: [['TOT', 'Tackles'], ['SOLO', 'Solo'], ['SACK', 'Sacks'], ['TFL', 'TFL']],
  defensiveInterceptions: [['INT', 'Int'], ['TD', 'Int TD']],
  kicking: [['FGM', 'FG'], ['XPM', 'XP'], ['PTS', 'Pts']],
  punting: [['PUNTS', 'Punts'], ['AVG', 'Avg'], ['LNG', 'Long']],
  returning: [['KR', 'KR'], ['KRYDS', 'KR Yds'], ['PR', 'PR'], ['PRYDS', 'PR Yds']],
};

/** ESPN writes a dash where a player has none of that kind of season. */
const isBlank = (v) => !v || v === '-' || v === '0' || v === '0.0' || v === '--';

/**
 * Which season each row belongs to, and the kept stats for it.
 *
 * Every row names the team it was played for, which is the only reliable way
 * to tell a transfer's seasons apart. Without it a quarterback who threw for
 * Dayton in 2025 and arrived here in 2026 was counted in this team's 2025 —
 * putting two quarterbacks on 42 touchdowns in a year the team scored 27.
 */
const seasonRows = (payload, teamId) => {
  const bySeason = new Map();

  for (const category of payload?.categories ?? []) {
    const wanted = KEEP[category.name];
    if (!wanted) continue;
    const labels = category.labels ?? [];

    for (const row of category.statistics ?? []) {
      const year = row.season?.year;
      if (!year || String(row.teamId ?? '') !== String(teamId)) continue;

      const picked = wanted
        .map(([label, as]) => {
          const at = labels.indexOf(label);
          return at < 0 ? null : [as, String(row.stats?.[at] ?? '')];
        })
        .filter((pair) => pair && !isBlank(pair[1]));

      if (!picked.length) continue;
      if (!bySeason.has(year)) bySeason.set(year, []);
      bySeason.get(year).push(...picked);
      // The row knows the position that season, which a current roster does not.
      if (row.position) bySeason.get(year).position = row.position;
    }
  }

  return bySeason;
};

// ------------------------------------------------------------ who played when

const years = [];
for (let y = TO; y >= FROM; y--) years.push(y);

console.log(`Rosters ${FROM}-${TO}`);
/** id -> { name, per-season number and position } */
const people = new Map();

await inBatches(years, 4, async (year) => {
  const data = await getJson(`${V3}/teams/${espnId}/roster?enable=stats&season=${year}`);
  for (const a of (data?.positionGroups ?? []).flatMap((g) => g.athletes ?? [])) {
    if (!people.has(a.id)) {
      people.set(a.id, {
        name: a.displayName ?? [a.firstName, a.lastName].filter(Boolean).join(' '),
        years: new Map(),
      });
    }
    people.get(a.id).years.set(year, {
      n: String(a.jersey ?? '').trim(),
      pos: a.position?.abbreviation ?? '',
    });
  }
});
console.log(`  ${people.size} athletes`);

// ------------------------------------------------------- what they did, by year

console.log('Season splits, one request each');
const ids = [...people.keys()];
const splits = await inBatches(ids, 6, async (id) => [
  id,
  seasonRows(await getJson(`${V3}/athletes/${id}/stats`), espnId),
]);

const seasons = {};
let rows = 0;
for (const [id, bySeason] of splits) {
  const person = people.get(id);
  for (const [year, stats] of bySeason) {
    if (year < FROM || year > TO) continue;
    const onRoster = person.years.get(year);

    (seasons[year] ??= []).push({
      name: person.name,
      n: onRoster?.n ?? '',
      pos: stats.position || onRoster?.pos || '',
      s: stats,
    });
    rows++;
  }
}

for (const year of Object.keys(seasons)) {
  seasons[year].sort((a, b) => (Number(a.n) || 999) - (Number(b.n) || 999));
}

const out = join(root, 'teams', slug, 'players.json');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ seasons }));

const listed = Object.keys(seasons).sort();
console.log(`\nWrote ${out}`);
console.log(`  ${rows} player-seasons across ${listed.length} years (${listed[0]}-${listed[listed.length - 1]})`);
console.log(`  ${listed.map((y) => `${y}:${seasons[y].length}`).join('  ')}`);
