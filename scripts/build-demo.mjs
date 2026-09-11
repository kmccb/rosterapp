/*
 * The demo school, written out as one file.
 *
 * Everything a prospect is shown at /oh/demo/ comes from public/oh/demo.json:
 * Poland Seminary, its crest and colors, every varsity sport on its real
 * calendar, and an invented roster for each. The schedules are read off the
 * school's own Eventlink feed; the rosters are invented because the root app's
 * roster travels by share code and the demo asks the database for nothing.
 * Football's fixtures and scores, the conference table and the forecast are
 * not in here at all — the demo's slug is Poland's real one, so the page reads
 * those from the directory like any school's page does.
 *
 * Run by hand — `node scripts/build-demo.mjs` — then commit public/oh/demo.json
 * and, if the feed was fetched, the refreshed capture in src/oh/fixtures. It is
 * not part of `npm run build` and must not become part of it: it re-encodes a
 * crest through sharp and may reach the network, and the guarded build has no
 * business doing either.
 *
 * WHEN TO RE-RUN. Whenever the school's calendar changes, and when a season
 * turns — the athletic office enters winter and spring schedules as they are
 * set, and a re-run picks up the new sports. Scores on played volleyball and
 * soccer rows are invented, seeded from the row, so a re-run on the same feed
 * on the same day writes the same file — a later run scores whatever has been
 * played in between, so the file moves day to day even when the feed does
 * not. Set DEMO_TODAY=2026-11-01 to see what it writes on a day of your
 * choosing.
 *
 * THE FEED URL IS A SECRET. It is a personal subscription token and the repo is
 * public. It lives in .env.local as EVENTLINK_ICS_URL and nowhere else. Without
 * it the script reads the committed capture, which carries no token.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseEventlink } from '../src/oh/eventlink.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'src/oh/fixtures/eventlink-poland-2026.ics');
const out = join(root, 'public/oh/demo.json');

const fail = (message) => {
  console.error(`! ${message}`);
  process.exit(1);
};

// ------------------------------------------------------------------ identity

const SLUG = 'poland-seminary-poland';
const SEASON = 2026;

const seasonFile = join(root, `public/oh/data/${SLUG}.json`);
if (!existsSync(seasonFile)) fail(`${seasonFile} is not there — the directory has not been built.`);
const directory = JSON.parse(readFileSync(seasonFile, 'utf8'));
const SCHOOL = directory.school;

/** Poland's navy and light blue, from teams/poland/team.json. */
const COLORS = { ground: '#04043a', accent: '#4fbaf7' };

/*
 * The conference is the seven league games: weeks 4 to 10 of the directory's
 * season. A table one school short is worse than none, so a season missing a
 * game or a slug in that range stops the run.
 */
const games = directory.games ?? [];
if (games.length < 10) fail(`Poland's season has ${games.length} games; expected ten.`);
const members = games.filter((g) => g.week >= 4 && g.week <= 10).map((g) => g.opponentSlug);
if (members.length !== 7 || members.some((m) => typeof m !== 'string' || !m)) {
  fail('weeks 4–10 do not each carry an opponent slug; the conference cannot be listed.');
}
const LEAGUE = { name: 'Northeast 8', members };

// ------------------------------------------------------------------- crest

/*
 * Poland's badge, re-encoded small. JPEG rather than PNG because the badge is
 * a photograph-like image and comes out a fifth of the size; rosterStore's
 * LOGO_DATA_URI accepts it. The string is inlined in a committed JSON and
 * again in a CSS custom property, and is worth keeping small in both.
 */
const badge = await sharp(join(root, 'teams/poland/logo.jpg'))
  .resize(256, 256, { fit: 'inside' })
  .jpeg({ quality: 78 })
  .toBuffer();
const LOGO = `data:image/jpeg;base64,${badge.toString('base64')}`;
if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(LOGO)) fail('the badge did not encode.');

// ---------------------------------------------------------------- the feed

const readEnv = () => {
  const file = join(root, '.env.local');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [
        l.slice(0, l.indexOf('=')).trim(),
        // A value pasted with surrounding quotes ("like this") is a common
        // .env slip; strip them rather than hand a quoted string to fetch().
        l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, ''),
      ]),
  );
};

let ics;
let fetched = false;
const url = readEnv().EVENTLINK_ICS_URL;
if (url) {
  const res = await fetch(url);
  if (!res.ok) fail(`the feed answered ${res.status}.`);
  ics = await res.text();
  if (!ics.includes('BEGIN:VCALENDAR')) fail('the feed did not answer with a calendar.');
  fetched = true;
} else if (existsSync(fixture)) {
  ics = readFileSync(fixture, 'utf8');
  console.log('no EVENTLINK_ICS_URL in .env.local; reading the committed capture');
} else {
  fail('no feed URL and no captured fixture — nothing to build from.');
}

const sports = parseEventlink(ics, SEASON);
if (sports.length < 10) fail(`only ${sports.length} sports came out of the feed; it has changed shape.`);
if (sports[0].sport !== 'football') fail('football is not on the calendar.');

/*
 * Only now — once the feed has proven it still has football and at least ten
 * sports on it — does a fresh fetch get to overwrite the committed capture.
 * Writing straight after the fetch, before these guards ran, meant a feed that
 * had changed shape clobbered the last known-good fixture on its way to
 * failing the run.
 */
if (fetched) {
  // The calendar's header carries the subscriber's own name — X-WR-CALNAME,
  // and an ID line naming them again — and the parser reads neither. Scrub
  // both before this becomes a committed file with someone's name in it.
  const scrubbed = ics
    .replace(/^X-WR-CALNAME:.*$/m, 'X-WR-CALNAME:Poland Seminary athletics')
    .replace(/^ID:.*\r?\n/m, '');
  writeFileSync(fixture, scrubbed);
  console.log(`fetched the feed; refreshed ${fixture}`);
}

// ------------------------------------------------------------------- today

/** Today, Eastern — the line between a row that gets a score and one that
 * does not. DEMO_TODAY overrides it for a look at another day. */
const TODAY =
  process.env.DEMO_TODAY ??
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) fail(`DEMO_TODAY must be YYYY-MM-DD, not "${TODAY}".`);

// ---------------------------------------------------------- seeded chance

/** A small deterministic generator, seeded from a string, so a re-run on the
 * same feed writes the same file and a diff shows only what changed. */
const seed = (text) => {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const rng = (text) => {
  let a = seed(text);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (r, list) => list[Math.floor(r() * list.length)];

/** Fisher–Yates, so the order depends on the seed and on nothing else. */
const shuffle = (r, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// -------------------------------------------------------------------- scores

/*
 * Only played volleyball and soccer rows get a score. A meet has no us/them,
 * and a golf score would be a lie. Sets for volleyball, goals for soccer, no
 * draws — the schedule chip has two states.
 */
const SCORED = new Set(['volleyball', 'boys soccer', 'girls soccer']);

const scoreFor = (sport, row) => {
  const r = rng(`${sport}|${row.date}|${row.opponent}`);
  const won = r() < 0.6;
  if (sport === 'volleyball') {
    const lost = pick(r, [0, 1, 2]);
    return won ? { us: 3, them: lost } : { us: lost, them: 3 };
  }
  const high = 1 + Math.floor(r() * 4);
  const low = Math.floor(r() * high);
  return won ? { us: high, them: low } : { us: low, them: high };
};

const withScores = (sport, rows) =>
  rows.map((row) => (SCORED.has(sport) && row.date < TODAY ? { ...row, score: scoreFor(sport, row) } : row));

// ------------------------------------------------------------------- rosters

/*
 * Invented players. The pools are generic on purpose and the generator's own;
 * none is drawn from any Poland roster. Last names are unique within a sport
 * so two players are never confused on the Team tab.
 */
const FIRST = [
  'Aiden', 'Ben', 'Caleb', 'Drew', 'Eli', 'Finn', 'Gavin', 'Hayden', 'Ian', 'Jake',
  'Kai', 'Liam', 'Mason', 'Nolan', 'Owen', 'Parker', 'Quinn', 'Reid', 'Sam', 'Tyler',
  'Ava', 'Bella', 'Chloe', 'Delaney', 'Ella', 'Faith', 'Grace', 'Hannah', 'Isla', 'Jenna',
  'Kate', 'Lila', 'Maya', 'Nora', 'Olivia', 'Paige', 'Reese', 'Sadie', 'Tessa', 'Zoe',
];
const LAST = [
  'Abbott', 'Barlow', 'Carver', 'Dawson', 'Ellery', 'Fenwick', 'Garner', 'Holloway', 'Ingram',
  'Jarvis', 'Keaton', 'Lockhart', 'Marlow', 'Naylor', 'Oakes', 'Pruett', 'Quimby', 'Rowan',
  'Sutton', 'Thorne', 'Underhill', 'Vance', 'Whitaker', 'Yates', 'Ashby', 'Bexley', 'Corwin',
  'Denholm', 'Everly', 'Fairbanks', 'Greer', 'Hollis', 'Iverson', 'Kendrick', 'Lyle', 'Merritt',
  'Norwood', 'Pemberton', 'Radley', 'Stroud', 'Tilden', 'Wakefield',
];
const GRADES = ['Fr', 'So', 'Jr', 'Sr'];

const BOYS_FIRST = FIRST.slice(0, 20);
const GIRLS_FIRST = FIRST.slice(20);

/** Which first-name pool a sport draws from. Coed sports draw from both. */
const namesFor = (sport) => {
  if (/^girls |^volleyball$|^softball$/.test(sport)) return GIRLS_FIRST;
  if (/^boys |^football$|^baseball$/.test(sport)) return BOYS_FIRST;
  return FIRST;
};

/** Squad size, the number range, and the positions a sport's Team tab filters by. */
const SHAPE = {
  football: { size: 40, numbers: [1, 99], positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'OL', 'OL', 'OL', 'DL', 'DL', 'LB', 'LB', 'CB', 'CB', 'S', 'K', 'P', 'WR/CB', 'RB/LB', 'QB/S'] },
  volleyball: { size: 13, numbers: [1, 25], positions: ['S', 'OH', 'OH', 'MB', 'MB', 'OPP', 'L', 'DS'] },
  'boys soccer': { size: 20, numbers: [0, 30], positions: ['GK', 'D', 'D', 'M', 'M', 'F'] },
  'girls soccer': { size: 20, numbers: [0, 30], positions: ['GK', 'D', 'D', 'M', 'M', 'F'] },
  'boys basketball': { size: 13, numbers: [0, 55], positions: ['G', 'G', 'F', 'F', 'C'] },
  'girls basketball': { size: 13, numbers: [0, 55], positions: ['G', 'G', 'F', 'F', 'C'] },
  baseball: { size: 18, numbers: [1, 40], positions: ['P', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'OF'] },
  softball: { size: 18, numbers: [1, 40], positions: ['P', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'OF'] },
  'boys lacrosse': { size: 22, numbers: [1, 45], positions: ['G', 'D', 'D', 'M', 'M', 'A'] },
  'girls lacrosse': { size: 22, numbers: [1, 45], positions: ['G', 'D', 'D', 'M', 'M', 'A'] },
};
const DEFAULT_SHAPE = { size: 16, numbers: [1, 40], positions: [] };

/** A football player's side of the ball, read off the position the way the
 * root app's roster filters do; a slash means both ways, which is ''. */
const OFFENSE = new Set(['QB', 'RB', 'WR', 'TE', 'OL', 'FB', 'C', 'OT', 'OG']);
const DEFENSE = new Set(['DL', 'DT', 'DE', 'LB', 'CB', 'S']);
const SPECIAL = new Set(['K', 'P']);
const sideOf = (position) => {
  if (position.includes('/')) return '';
  if (OFFENSE.has(position)) return 'O';
  if (DEFENSE.has(position)) return 'D';
  if (SPECIAL.has(position)) return 'ST';
  return '';
};

const rosterFor = (sport) => {
  const r = rng(`roster|${sport}`);
  const shape = SHAPE[sport] ?? DEFAULT_SHAPE;
  const firsts = namesFor(sport);
  const lasts = shuffle(r, LAST).slice(0, shape.size);
  const numbers = new Set();
  const [lo, hi] = shape.numbers;
  while (numbers.size < shape.size) numbers.add(lo + Math.floor(r() * (hi - lo + 1)));
  const key = sport.replace(/ /g, '-');
  return [...numbers]
    .sort((a, b) => a - b)
    .map((number, i) => {
      const position = shape.positions.length ? pick(r, shape.positions) : '';
      const player = {
        id: `${key}-${number}`,
        number: String(number),
        firstName: pick(r, firsts),
        lastName: lasts[i],
        position,
        side: sport === 'football' ? sideOf(position) : '',
        grade: pick(r, GRADES),
      };
      if (sport === 'football') {
        player.heightIn = 66 + Math.floor(r() * 12);
        player.weightLb = 150 + Math.floor(r() * 130);
      }
      return player;
    });
};

// -------------------------------------------------------------------- write

const demoSports = {};
for (const { sport, rows } of sports) {
  demoSports[sport] = {
    players: rosterFor(sport),
    // Football's fixtures come from the directory, as a real paid school's do.
    schedule: sport === 'football' ? null : withScores(sport, rows),
  };
}

const demo = {
  slug: SLUG,
  season: SEASON,
  generatedOn: TODAY,
  school: SCHOOL,
  colors: COLORS,
  logo: LOGO,
  league: LEAGUE,
  sportNames: sports.map((s) => s.sport),
  sports: demoSports,
};

writeFileSync(out, `${JSON.stringify(demo, null, 2)}\n`);

console.log(`wrote ${out} for ${SCHOOL.name}, season ${SEASON}, as of ${TODAY}`);
console.log(`  conference: ${LEAGUE.name} — ${members.join(', ')}`);
for (const { sport, rows } of sports) {
  const entry = demoSports[sport];
  const scored = entry.schedule ? entry.schedule.filter((r) => r.score).length : 0;
  const fixtures = entry.schedule ? `${entry.schedule.length} fixtures, ${scored} scored` : 'fixtures from the directory';
  console.log(`  ${sport.padEnd(18)} ${String(entry.players.length).padStart(2)} players, ${fixtures}`);
}
