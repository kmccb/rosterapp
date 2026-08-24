/**
 * Where every school in the directory plays, near enough.
 *
 * The forecast needs a latitude and a longitude, and the directory carries a
 * town. So each school's town is resolved once, here, and the answer committed
 * as public/oh/geo.json — a school never moves, so this is a one-off with a
 * top-up whenever the directory gains a name it did not have before.
 *
 * **A town centroid is the intended accuracy.** This is not the address of a
 * stadium and must not be treated as one: it is the middle of the town the
 * school plays in, which for a weather forecast is the same answer to within a
 * degree and a percent. Nothing here should ever grow into a school-address
 * database — the whole point of /oh/ is that reading it tells nobody anything,
 * and a file of precise locations is a different kind of file.
 *
 * Open-Meteo's geocoding API needs no key and no account, same as the forecast
 * itself. It is somebody's free service, so this asks serially with a pause
 * between calls, and asks once per town rather than once per school — there are
 * about six hundred towns behind seven hundred schools.
 *
 *   node scripts/geocode-schools.mjs           fill in what is missing
 *   node scripts/geocode-schools.mjs --force   ask again for every school
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexFile = join(root, 'public/oh/index.json');
const geoFile = join(root, 'public/oh/geo.json');

const force = process.argv.includes('--force');

/** Long enough to be a guest rather than a load. */
const PAUSE_MS = 250;
const pause = () => new Promise((go) => setTimeout(go, PAUSE_MS));

/*
 * The directory writes towns the way the scoreboard prints them, and the
 * scoreboard abbreviates. "Mt Gilead" and "Cuyahoga Hts" are not names any
 * gazetteer holds, so the shortened forms are spelled out before asking —
 * once each, in the order most likely to land.
 */
const LONG = {
  mt: 'Mount',
  mount: 'Mt',
  st: 'Saint',
  saint: 'St',
  hts: 'Heights',
  ft: 'Fort',
  n: 'North',
  s: 'South',
  e: 'East',
  w: 'West',
};

/** The forms of a town's name worth asking about, best guess first. */
const spellings = (city) => {
  const words = city.split(/\s+/).filter(Boolean);
  const tried = [city];

  const expanded = words
    .map((w) => LONG[w.toLowerCase().replace(/\.$/, '')] ?? w)
    .join(' ');
  if (expanded !== city) tried.push(expanded);

  // "Newton Falls" hyphenated, "Bellaire-St Clairsville" and the like: the
  // gazetteer holds one town, the scoreboard sometimes prints two joined.
  if (city.includes('-')) tried.push(city.split('-')[0].trim());

  return [...new Set(tried)];
};

/**
 * One town, to a point on the map.
 *
 * Ohio only. Every name in this directory is an Ohio town, and half of them —
 * Springfield, Jackson, Newton Falls — are also a town in six other states.
 * Filtering on the state is what stops a Friday night in Ashland, Ohio being
 * forecast for Ashland, Kentucky.
 */
async function locate(city) {
  for (const name of spellings(city)) {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}` +
      `&count=100&language=en&format=json`;

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    await pause();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { results } = await res.json();
    const hit = (results ?? []).find((r) => r.country_code === 'US' && r.admin1 === 'Ohio');
    if (hit) return { lat: Number(hit.latitude.toFixed(4)), lon: Number(hit.longitude.toFixed(4)) };
  }
  return null;
}

const { schools } = JSON.parse(await readFile(indexFile, 'utf8'));
if (!Array.isArray(schools) || !schools.length) throw new Error('public/oh/index.json has no schools');

const geo = !force && existsSync(geoFile) ? JSON.parse(await readFile(geoFile, 'utf8')) : {};

// One lookup per town, however many schools sit in it. Cleveland alone is
// twenty schools and one point on the map.
const byCity = new Map();
const missing = [];

for (const school of schools) {
  if (geo[school.slug]) continue;
  if (!school.city) {
    missing.push(school.slug);
    continue;
  }

  const key = school.city.toLowerCase();
  if (!byCity.has(key)) {
    try {
      byCity.set(key, await locate(school.city));
    } catch (err) {
      // A town that could not be asked about is a town with no answer. It is
      // recorded as a miss and the next run will try it again — the file is
      // topped up rather than rewritten, so nothing already resolved is lost.
      console.warn(`  ! ${school.city}: ${err.message}`);
      byCity.set(key, null);
    }
  }

  const at = byCity.get(key);
  if (at) geo[school.slug] = at;
  else missing.push(school.slug);
}

// Sorted, so a top-up run changes the committed file only where it added
// something rather than reshuffling seven hundred lines.
const sorted = Object.fromEntries(Object.keys(geo).sort().map((slug) => [slug, geo[slug]]));
await writeFile(geoFile, `${JSON.stringify(sorted, null, 0)}\n`);

console.log(`geo.json: ${Object.keys(sorted).length} schools placed, ${missing.length} without a town on the map.`);
if (missing.length) console.log(`          ${missing.join(', ')}`);
