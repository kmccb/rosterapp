/*
 * The demo school, written out as one file.
 *
 * Everything a prospect is shown at /oh/demo/ comes from public/oh/demo.json:
 * a fictional school, its crest, six rosters, six schedules and a whole
 * fictional conference. It is generated rather than hand-typed because the
 * pieces have to agree with one another — a football record has to match the
 * games behind it, and a standings table only reads right when every member's
 * season carries the same result from the other side.
 *
 * The school is invented on purpose. The old demo put made-up players on
 * Strasburg-Franklin's real page, which is fine as a smoke test and not fine
 * as the thing shown to prospects; Springfield Local misrepresents nobody, and
 * its five conference rivals are invented for the same reason.
 *
 * Run by hand — `node scripts/build-demo.mjs` — then commit public/oh/demo.json.
 * It is not part of `npm run build` and must not become part of it: it
 * rasterizes a crest through sharp, and the guarded build has no business
 * doing that.
 *
 * WHEN TO RE-RUN. Every date below is anchored to the day the script runs, so
 * that a scored game is always in the past and an unplayed one always ahead —
 * a demo printing "W 21–14" against next month's date is the single most
 * visible way for this page to look broken, and athletic directors are exactly
 * the audience that reads a schedule closely. But the file it writes is static,
 * so it drifts: five weeks after a run the last of the "Coming up" fixtures has
 * gone by with no score on it, and the played half has stopped growing. The
 * script says on its way out when that happens. Re-run it before any serious
 * demo, and certainly if it has been more than a month.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------------ identity

const SLUG = 'springfield-local-demo';
const NAME = 'Springfield Local';
const CITY = 'Springfield';

/*
 * A deep violet ground with a bright gold on it.
 *
 * Two things pick this pair. It has to be nothing like the maroon the old
 * smoke-test school wore, so nobody confuses the two demos; and look.ts builds
 * the whole page out of these two by mixing toward white, so a ground with real
 * chroma gives the hub's --ghost → --surface gradient something to be, where a
 * near-black would leave every band the same flat dark.
 */
const GROUND = '#2f1466';
const ACCENT = '#f5b63d';

/*
 * Every school on the demo page is invented, conference rivals included.
 * Their slugs carry a -demo suffix so that none of them can ever collide with
 * one of the 717 real files in public/oh/data — and so that a slug leaking
 * anywhere obviously says what it is.
 */
const MEMBERS = [
  { slug: SLUG, name: NAME, city: CITY },
  { slug: 'ashcombe-demo', name: 'Ashcombe', city: 'Ashcombe' },
  { slug: 'bellhaven-demo', name: 'Bellhaven', city: 'Bellhaven' },
  { slug: 'cedar-ridge-demo', name: 'Cedar Ridge', city: 'Cedar Ridge' },
  { slug: 'elmbrook-demo', name: 'Elmbrook', city: 'Elmbrook' },
  { slug: 'marlow-central-demo', name: 'Marlow Central', city: 'Marlow' },
];

const LEAGUE = { name: 'Riverbend Athletic Conference', members: MEMBERS.slice(1).map((m) => m.slug) };

// ------------------------------------------------------------------- crest

/**
 * A monogram roundel, rasterized to PNG.
 *
 * PNG rather than SVG because rosterStore.ts's LOGO_DATA_URI deliberately
 * accepts only raster types — the value is substituted into a CSS url(), and
 * the narrow alphabet is what makes that safe. The letters are drawn as paths
 * rather than <text> so the output does not depend on which fonts happen to be
 * installed on the machine that runs this.
 */
const crestSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="${ACCENT}"/>
  <circle cx="256" cy="256" r="230" fill="${GROUND}"/>
  <circle cx="256" cy="256" r="206" fill="none" stroke="${ACCENT}" stroke-width="9"/>
  <g fill="${ACCENT}">
    <path d="M247 150 h-60 a44 44 0 0 0 -44 44 v22 a44 44 0 0 0 44 44 h34 a10 10 0 0 1 10 10 v10
             a10 10 0 0 1 -10 10 h-78 v40 h78 a50 50 0 0 0 50 -50 v-10 a50 50 0 0 0 -50 -50 h-34
             a4 4 0 0 1 -4 -4 v-22 a4 4 0 0 1 4 -4 h60 z"/>
    <path d="M281 150 h44 v180 h72 v40 h-116 z"/>
  </g>
</svg>`;

// Two colors and an edge, so a palette costs nothing and saves five sixths of
// the file — this string is inlined in a committed JSON and then again in a CSS
// custom property, and it is worth keeping small in both.
const crestPng = await sharp(Buffer.from(crestSvg))
  .png({ palette: true, colors: 32, compressionLevel: 9 })
  .toBuffer();
const LOGO = `data:image/png;base64,${crestPng.toString('base64')}`;

// ----------------------------------------------------------------- football

/*
 * Every date in this file hangs off one day: the most recent Friday that has
 * already been.
 *
 * The rule the whole calendar has to keep is that a score is only ever printed
 * on a date that has passed. So the anchor is a Friday in the past, the played
 * half of the season is counted backwards from it, and everything unplayed
 * starts a week the far side of it — a week, not a day, because the anchor can
 * be as recent as yesterday and the next fixture has to clear today whatever
 * day of the week the script is run on.
 *
 * Dates are done in UTC. The output is a plain YYYY-MM-DD and the arithmetic is
 * whole days, so the one thing that could go wrong is an hour lost to a clock
 * change turning the 4th into the 3rd; UTC has no such hour.
 */
const DAY = 86_400_000;
const todayLocal = new Date();
const TODAY = new Date(
  Date.UTC(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate()),
);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const iso = (d) => d.toISOString().slice(0, 10);

// Friday is 5. `|| 7` is the case that matters: run this on a Friday and the
// answer is a week ago, not today — today's game has not been played yet.
const ANCHOR = addDays(TODAY, -((((TODAY.getUTCDay() - 5) + 7) % 7) || 7));

/** Half the season behind, half ahead: enough played for a record, a Played
 * group and a standings table, and enough to come for the page to be about
 * something. */
const PLAYED_WEEKS = 5;
const TOTAL_WEEKS = 10;

/** Ten Fridays, with week five landing on the anchor. */
const WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) =>
  iso(addDays(ANCHOR, (i - (PLAYED_WEEKS - 1)) * 7)),
);

/** A day that has been: the anchor, or `n` days before it. */
const played = (n) => iso(addDays(ANCHOR, -n));

/** A day that has not: `n` days past the anchor, counted from a week out so
 * that it clears today however recently the anchor fell. */
const upcoming = (n) => iso(addDays(ANCHOR, 7 + n));

/**
 * The next time a given month and day comes round, at least a fortnight off.
 *
 * The winter and spring sports are dated by the calendar rather than by an
 * offset from the anchor. Their schedules have no scores on them, so any future
 * date would satisfy the rule above — but the hub tells a reader that basketball
 * "Starts in November" out of a fixed table, and a schedule that then opens in
 * June because the script happened to run in March would contradict it on the
 * next tap.
 */
const nextOn = (month, day) => {
  const year = TODAY.getUTCFullYear();
  for (const y of [year, year + 1, year + 2]) {
    const d = new Date(Date.UTC(y, month - 1, day));
    if (d.getTime() >= TODAY.getTime() + 14 * DAY) return d;
  }
  throw new Error('no future date for that month and day');
};

/**
 * Where an off-season sport's fixtures begin.
 *
 * Normally the next time its opening date comes round. But a script run *during*
 * that sport's own season would otherwise push its first fixture eleven months
 * out while the hub said "In season" above it — so when today is already inside
 * the run, the fixtures start a fortnight from now instead. `months` is the same
 * list src/oh/sportSeasons.ts keeps for the sport.
 */
const seasonStart = (month, day, months) =>
  months.includes(TODAY.getUTCMonth() + 1) ? addDays(TODAY, 14) : nextOn(month, day);

/** A season is named for the autumn it starts in — a basketball season labelled
 * 2026 plays its February games in 2027. */
const openedIn = new Date(`${WEEKS[0]}T00:00:00Z`);
const SEASON_YEAR =
  openedIn.getUTCMonth() + 1 >= 7 ? openedIn.getUTCFullYear() : openedIn.getUTCFullYear() - 1;

/*
 * Weeks 3 to 7 are the conference, a full round robin over six schools: five
 * rounds, every pair meeting exactly once. Written out rather than computed,
 * because the scores are chosen rather than generated — a demo where the school
 * being sold to wins everything reads as a brochure, so Springfield loses two.
 *
 * Indexes are into MEMBERS. `h` is the home side. A round with scores has been
 * played; the last two have not.
 */
const ROUNDS = [
  [
    { h: 0, a: 1, hs: 28, as: 14 },
    { h: 2, a: 5, hs: 21, as: 20 },
    { h: 3, a: 4, hs: 7, as: 24 },
  ],
  [
    { h: 2, a: 0, hs: 24, as: 17 },
    { h: 1, a: 3, hs: 13, as: 35 },
    { h: 4, a: 5, hs: 28, as: 21 },
  ],
  [
    { h: 0, a: 3, hs: 35, as: 7 },
    { h: 4, a: 2, hs: 14, as: 17 },
    { h: 5, a: 1, hs: 30, as: 22 },
  ],
  [{ h: 4, a: 0 }, { h: 5, a: 3 }, { h: 1, a: 2 }],
  [{ h: 0, a: 5 }, { h: 1, a: 4 }, { h: 2, a: 3 }],
];

/*
 * Non-conference weeks — 1, 2, 8, 9 and 10 — against schools with no page.
 * These carry opponentSlug: null, which is the shape the real parser already
 * produces for an opponent that is not in the directory, so they behave here
 * exactly as an out-of-state side does on a real school's fixture list.
 */
const NON_CONFERENCE = {
  0: [
    { opponent: 'Kirkwood Prep', home: false, us: 14, them: 21 },
    { opponent: 'Twin Lakes', home: true, us: 31, them: 10 },
    { opponent: 'Harmony Ridge', home: true },
    { opponent: 'Pinecrest Academy', home: false },
    { opponent: 'Stonebridge Central', home: true },
  ],
  1: [
    { opponent: 'Harmony Ridge', home: true, us: 24, them: 7 },
    { opponent: 'Stonebridge Central', home: false, us: 10, them: 27 },
    { opponent: 'Twin Lakes', home: false },
    { opponent: 'Kirkwood Prep', home: true },
    { opponent: 'Pinecrest Academy', home: true },
  ],
  2: [
    { opponent: 'Pinecrest Academy', home: true, us: 42, them: 14 },
    { opponent: 'Kirkwood Prep', home: true, us: 21, them: 13 },
    { opponent: 'Harmony Ridge', home: false },
    { opponent: 'Stonebridge Central', home: true },
    { opponent: 'Twin Lakes', home: false },
  ],
  3: [
    { opponent: 'Twin Lakes', home: false, us: 6, them: 28 },
    { opponent: 'Harmony Ridge', home: true, us: 20, them: 17 },
    { opponent: 'Kirkwood Prep', home: false },
    { opponent: 'Pinecrest Academy', home: true },
    { opponent: 'Stonebridge Central', home: false },
  ],
  4: [
    { opponent: 'Stonebridge Central', home: true, us: 35, them: 28 },
    { opponent: 'Pinecrest Academy', home: false, us: 14, them: 9 },
    { opponent: 'Harmony Ridge', home: true },
    { opponent: 'Twin Lakes', home: true },
    { opponent: 'Kirkwood Prep', home: false },
  ],
  5: [
    { opponent: 'Harmony Ridge', home: false, us: 13, them: 34 },
    { opponent: 'Twin Lakes', home: true, us: 7, them: 24 },
    { opponent: 'Stonebridge Central', home: false },
    { opponent: 'Kirkwood Prep', home: true },
    { opponent: 'Pinecrest Academy', home: false },
  ],
};

/** Which week each non-conference slot sits in: 1, 2, 8, 9, 10. */
const NON_CONFERENCE_WEEKS = [1, 2, 8, 9, 10];

const KICKOFF = '7:00 PM';

/** One school's ten games, folded out of the two tables above. */
function seasonFor(index) {
  const me = MEMBERS[index];
  const games = [];

  NON_CONFERENCE[index].forEach((g, slot) => {
    const week = NON_CONFERENCE_WEEKS[slot];
    games.push({
      week,
      date: WEEKS[week - 1],
      kickoff: KICKOFF,
      home: g.home,
      opponent: g.opponent,
      opponentCity: '',
      opponentSlug: null,
      ...(g.us === undefined
        ? {}
        : { result: { us: g.us, them: g.them, won: g.us > g.them } }),
    });
  });

  ROUNDS.forEach((round, r) => {
    const week = r + 3;
    for (const game of round) {
      if (game.h !== index && game.a !== index) continue;
      const home = game.h === index;
      const them = MEMBERS[home ? game.a : game.h];
      const us = home ? game.hs : game.as;
      const theirs = home ? game.as : game.hs;
      games.push({
        week,
        date: WEEKS[week - 1],
        kickoff: KICKOFF,
        home,
        opponent: them.name,
        opponentCity: them.city,
        opponentSlug: them.slug,
        ...(us === undefined ? {} : { result: { us, them: theirs, won: us > theirs } }),
      });
    }
  });

  games.sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);

  const record = { won: 0, lost: 0, played: 0 };
  for (const g of games) {
    if (!g.result) continue;
    record.played += 1;
    if (g.result.won) record.won += 1;
    else record.lost += 1;
  }

  return { school: me, games, record };
}

const seasons = {};
MEMBERS.forEach((m, i) => {
  seasons[m.slug] = seasonFor(i);
});

// ---------------------------------------------------------------- the squads

/*
 * Every name here is invented. A handful appear in two or three sports,
 * because that is what a small school looks like — the quarterback plays
 * point guard and pitches in the spring, and the offensive line is most of the
 * heavyweight half of the wrestling room.
 */
const player = (number, firstName, lastName, position, side, extra = {}) => ({
  number,
  firstName,
  lastName,
  position,
  side,
  ...extra,
});

const FOOTBALL = [
  player('1', 'Cole', 'Brennan', 'QB', 'O', { heightIn: 74, weightLb: 190, grade: 'Sr' }),
  player('2', 'Marcus', 'Ely', 'WR/CB', '', { heightIn: 70, weightLb: 165, grade: 'Jr' }),
  player('3', 'Devin', 'Raker', 'RB', 'O', { heightIn: 69, weightLb: 180, grade: 'Sr' }),
  player('4', 'Isaiah', 'Tarrant', 'WR', 'O', { heightIn: 73, weightLb: 170, grade: 'So' }),
  player('5', 'Owen', 'Castellano', 'K', 'ST', { heightIn: 68, weightLb: 155, grade: 'Jr' }),
  player('7', 'Nate', 'Whitcomb', 'QB/S', '', { heightIn: 71, weightLb: 175, grade: 'So' }),
  player('9', 'Jalen', 'Prewitt', 'WR', 'O', { heightIn: 72, weightLb: 172, grade: 'Sr' }),
  player('11', 'Tyler', 'Nordquist', 'LB', 'D', { heightIn: 71, weightLb: 205, grade: 'Jr' }),
  player('12', 'Aidan', 'Foss', 'S', 'D', { heightIn: 70, weightLb: 178, grade: 'Sr' }),
  player('15', 'Reece', 'Kimball', 'RB', 'O', { heightIn: 68, weightLb: 168, grade: 'So' }),
  player('20', 'Malachi', 'Deering', 'CB', 'D', { heightIn: 69, weightLb: 160, grade: 'Jr' }),
  player('22', 'Griffin', 'Doyle', 'LB', 'D', { heightIn: 72, weightLb: 210, grade: 'Sr' }),
  player('24', 'Elias', 'Mowry', 'RB/LB', '', { heightIn: 70, weightLb: 195, grade: 'Jr' }),
  player('33', 'Sam', 'Reddick', 'FB', 'O', { heightIn: 71, weightLb: 215, grade: 'Sr' }),
  player('44', 'Bennett', 'Hoyle', 'LB', 'D', { heightIn: 73, weightLb: 200, grade: 'So' }),
  player('52', 'Dominic', 'Vasquez', 'C', 'O', { heightIn: 73, weightLb: 255, grade: 'Sr' }),
  player('55', 'Kade', 'Sorensen', 'OL', 'O', { heightIn: 74, weightLb: 262, grade: 'Jr' }),
  player('58', 'Trevor', 'Lindquist', 'DL', 'D', { heightIn: 74, weightLb: 248, grade: 'Sr' }),
  player('66', 'Andre', 'Bellamy', 'OL', 'O', { heightIn: 72, weightLb: 270, grade: 'So' }),
  player('71', 'Josiah', 'Trent', 'DT', 'D', { heightIn: 75, weightLb: 285, grade: 'Sr' }),
  player('77', 'Micah', 'Ordonez', 'OT', 'O', { heightIn: 76, weightLb: 278, grade: 'Jr' }),
  player('88', 'Levi', 'Ashford', 'TE', 'O', { heightIn: 75, weightLb: 220, grade: 'Jr' }),
];

/*
 * Positions are spelled out wherever the abbreviation is also a football one.
 *
 * The Team tab's side filter is the root app's, and its table is football's: a
 * basketball G and C read as guard and centre, a baseball SS as a strong
 * safety, a volleyball S as a safety. Left as initials, this page offers a
 * basketball squad an "Offense" chip. Any school may paste initials and get
 * the same, which is a wart worth knowing about — but the demo is the one page
 * whose job is to look like the product working.
 */
const BASKETBALL = [
  player('3', 'Cole', 'Brennan', 'Guard', '', { heightIn: 74, grade: 'Sr' }),
  player('4', 'Simon', 'Reyes', 'Guard', '', { heightIn: 70, grade: 'Jr' }),
  player('5', 'Reece', 'Kimball', 'Guard', '', { heightIn: 68, grade: 'So' }),
  player('11', 'Julian', 'Marsh', 'Guard', '', { heightIn: 72, grade: 'Sr' }),
  player('12', 'Owen', 'Castellano', 'Guard', '', { heightIn: 68, grade: 'Jr' }),
  player('14', 'Isaiah', 'Tarrant', 'Forward', '', { heightIn: 73, grade: 'So' }),
  player('20', 'Ethan', 'Kowal', 'Forward', '', { heightIn: 75, grade: 'Jr' }),
  player('21', 'Dante', 'Alvarado', 'Forward', '', { heightIn: 76, grade: 'Sr' }),
  player('23', 'Bennett', 'Hoyle', 'Forward', '', { heightIn: 73, grade: 'So' }),
  player('32', 'Nico', 'Ferraro', 'Center', '', { heightIn: 79, grade: 'Sr' }),
  player('40', 'Brady', 'Kellerman', 'Forward', '', { heightIn: 74, grade: 'Jr' }),
  player('44', 'Xander', 'Pruitt', 'Center', '', { heightIn: 78, grade: 'So' }),
];

const BASEBALL = [
  player('2', 'Nate', 'Whitcomb', 'Shortstop', '', { grade: 'So' }),
  player('4', 'Reece', 'Kimball', '2B', '', { grade: 'So' }),
  player('6', 'Devin', 'Raker', 'OF', '', { grade: 'Sr' }),
  player('7', 'Cole', 'Brennan', 'Pitcher/1B', '', { grade: 'Sr' }),
  player('8', 'Griffin', 'Doyle', 'Catcher', '', { grade: 'Sr' }),
  player('9', 'Emmett', 'Braddock', 'OF', '', { grade: 'Jr' }),
  player('10', 'Gus', 'Thorne', '3B', '', { grade: 'Jr' }),
  player('12', 'Rowan', 'Pike', 'Pitcher', '', { grade: 'So' }),
  player('14', 'Silas', 'Merrick', 'OF', '', { grade: 'Fr' }),
  player('16', 'Tobias', 'Lane', '1B', '', { grade: 'Jr' }),
  player('18', 'Cash', 'Delaney', 'Pitcher', '', { grade: 'Sr' }),
  player('21', 'Hugo', 'Barrett', 'Catcher', '', { grade: 'So' }),
  player('24', 'Wyatt', 'Coburn', '2B/Shortstop', '', { grade: 'Jr' }),
  player('27', 'Jonah', 'Reeves', 'OF', '', { grade: 'Sr' }),
  player('31', 'Milo', 'Standish', 'Pitcher', '', { grade: 'Fr' }),
];

const VOLLEYBALL = [
  player('1', 'Harper', 'Quinlan', 'OH', '', { grade: 'Sr' }),
  player('3', 'Nadia', 'Fontaine', 'Setter', '', { grade: 'Jr' }),
  player('5', 'Elise', 'Vandermeer', 'MB', '', { grade: 'Sr' }),
  player('6', 'Camille', 'Rourke', 'L', '', { grade: 'So' }),
  player('7', 'Marisol', 'Ibarra', 'OH', '', { grade: 'Jr' }),
  player('9', 'Tessa', 'Bramwell', 'RS', '', { grade: 'Sr' }),
  player('10', 'Priya', 'Raghavan', 'Setter', '', { grade: 'So' }),
  player('12', 'June', 'Okafor', 'MB', '', { grade: 'Jr' }),
  player('14', 'Delaney', 'Voss', 'OH', '', { grade: 'Fr' }),
  player('16', 'Sloane', 'Petrakis', 'DS', '', { grade: 'So' }),
  player('18', 'Amara', 'Whitfield', 'MB', '', { grade: 'Sr' }),
  player('21', 'Ruby', 'Castellano', 'L', '', { grade: 'Fr' }),
];

const SOCCER = [
  player('1', 'Diego', 'Mendoza', 'GK', '', { grade: 'Sr' }),
  player('2', 'Finn', 'Halloran', 'D', '', { grade: 'Jr' }),
  player('3', 'Oscar', 'Delacroix', 'D', '', { grade: 'Sr' }),
  player('4', 'Kwame', 'Adeyemi', 'D', '', { grade: 'So' }),
  player('5', 'Tomas', 'Rivas', 'M', '', { grade: 'Jr' }),
  player('6', 'Henry', 'Pell', 'M', '', { grade: 'Sr' }),
  player('7', 'Luca', 'Bertani', 'F', '', { grade: 'Jr' }),
  player('8', 'Arturo', 'Salcedo', 'M', '', { grade: 'So' }),
  player('9', 'Emeka', 'Nwosu', 'F', '', { grade: 'Sr' }),
  player('10', 'Ravi', 'Chandran', 'M', '', { grade: 'Jr' }),
  player('11', 'Jonas', 'Wiese', 'F', '', { grade: 'So' }),
  player('12', 'Callum', 'Roth', 'D', '', { grade: 'Fr' }),
  player('14', 'Yusuf', 'Demir', 'M', '', { grade: 'So' }),
  player('15', 'Peter', 'Lindgren', 'D', '', { grade: 'Jr' }),
  player('17', 'Mateo', 'Vargas', 'F', '', { grade: 'Fr' }),
  player('21', 'Anders', 'Blom', 'GK', '', { grade: 'So' }),
];

/* Wrestling numbers its athletes by weight class, which is what a fan reads
   on the bracket sheet and so what Lookup has to find them by. */
const WRESTLING = [
  player('106', 'Eli', 'Sandoval', '106 lb', '', { grade: 'Fr' }),
  player('113', 'Brandt', 'McHugh', '113 lb', '', { grade: 'So' }),
  player('120', 'Corbin', 'Ashby', '120 lb', '', { grade: 'Jr' }),
  player('126', 'Rafael', 'Ocampo', '126 lb', '', { grade: 'So' }),
  player('132', 'Weston', 'Kraig', '132 lb', '', { grade: 'Sr' }),
  player('138', 'Micah', 'Ordonez', '138 lb', '', { grade: 'Jr' }),
  player('144', 'Dmitri', 'Volkov', '144 lb', '', { grade: 'Sr' }),
  player('150', 'Isaac', 'Ferrand', '150 lb', '', { grade: 'Jr' }),
  player('157', 'Tobias', 'Lane', '157 lb', '', { grade: 'Jr' }),
  player('165', 'Kade', 'Sorensen', '165 lb', '', { grade: 'Jr' }),
  player('175', 'Josiah', 'Trent', '175 lb', '', { grade: 'Sr' }),
  player('190', 'Trevor', 'Lindquist', '190 lb', '', { grade: 'Sr' }),
  player('215', 'Andre', 'Bellamy', '215 lb', '', { grade: 'So' }),
  player('285', 'Marcus', 'Delahunt', '285 lb', '', { grade: 'Sr' }),
];

// -------------------------------------------------------------- the schedules

const row = (date, opponent, home, time, score) => ({
  date,
  opponent,
  home,
  time,
  ...(score ? { score } : {}),
});

/*
 * The pasted schedules — every sport but football, which draws its fixtures
 * from the season above.
 *
 * All six sports are set to one moment: a demo school five weeks into its
 * autumn. Football has played five of ten, volleyball two of nine and soccer
 * three of eight, every one of those on a day that has been; the winter and
 * spring sports have not started, which is what the hub's "Starts in November"
 * and "Starts in March" notes are there to say.
 */
const VOLLEYBALL_SCHEDULE = [
  row(played(10), 'Ashcombe', true, '6:30 PM', { us: 3, them: 1 }),
  row(played(3), 'Bellhaven', false, '6:30 PM', { us: 1, them: 3 }),
  row(upcoming(1), 'Cedar Ridge', true, '6:30 PM'),
  row(upcoming(3), 'Elmbrook', false, '6:30 PM'),
  row(upcoming(8), 'Marlow Central', true, '6:30 PM'),
  row(upcoming(10), 'Ashcombe', false, '6:30 PM'),
  row(upcoming(15), 'Bellhaven', true, '6:30 PM'),
  row(upcoming(17), 'Cedar Ridge', false, '6:30 PM'),
  row(upcoming(22), 'Elmbrook', true, '6:30 PM'),
];

const SOCCER_SCHEDULE = [
  row(played(12), 'Kirkwood Prep', false, '7:00 PM', { us: 2, them: 1 }),
  row(played(8), 'Ashcombe', true, '7:00 PM', { us: 0, them: 3 }),
  row(played(2), 'Bellhaven', false, '7:00 PM', { us: 3, them: 2 }),
  row(upcoming(2), 'Cedar Ridge', true, '7:00 PM'),
  row(upcoming(6), 'Elmbrook', false, '11:00 AM'),
  row(upcoming(9), 'Marlow Central', true, '7:00 PM'),
  row(upcoming(13), 'Harmony Ridge', false, '11:00 AM'),
  row(upcoming(16), 'Stonebridge Central', true, '7:00 PM'),
];

const WINTER_MONTHS = [11, 12, 1, 2, 3];
const SPRING_MONTHS = [3, 4, 5, 6];

const tipOff = seasonStart(11, 27, WINTER_MONTHS);
const firstMat = seasonStart(11, 28, WINTER_MONTHS);
const firstPitch = seasonStart(3, 30, SPRING_MONTHS);

const from = (start) => (n) => iso(addDays(start, n));
const hoops = from(tipOff);
const mat = from(firstMat);
const diamond = from(firstPitch);

const BASKETBALL_SCHEDULE = [
  row(hoops(0), 'Kirkwood Prep', true, '7:30 PM'),
  row(hoops(7), 'Ashcombe', false, '7:30 PM'),
  row(hoops(14), 'Bellhaven', true, '7:30 PM'),
  row(hoops(22), 'Harmony Ridge', false, '2:00 PM'),
  row(hoops(36), 'Cedar Ridge', true, '7:30 PM'),
  row(hoops(42), 'Elmbrook', false, '7:30 PM'),
  row(hoops(49), 'Marlow Central', true, '7:30 PM'),
];

const WRESTLING_SCHEDULE = [
  row(mat(0), 'Stonebridge Invitational', false, '9:00 AM'),
  row(mat(14), 'Ashcombe', true, '6:00 PM'),
  row(mat(35), 'Pinecrest Academy', false, '9:00 AM'),
  row(mat(47), 'Bellhaven', true, '6:00 PM'),
  row(mat(63), 'Riverbend Conference Meet', false, '10:00 AM'),
];

const BASEBALL_SCHEDULE = [
  row(diamond(0), 'Kirkwood Prep', true, '4:30 PM'),
  row(diamond(3), 'Ashcombe', false, '4:30 PM'),
  row(diamond(10), 'Bellhaven', true, '4:30 PM'),
  row(diamond(17), 'Cedar Ridge', false, '4:30 PM'),
  row(diamond(22), 'Elmbrook', true, '4:30 PM'),
  row(diamond(28), 'Marlow Central', false, '4:30 PM'),
  row(diamond(35), 'Harmony Ridge', true, '4:30 PM'),
  row(diamond(39), 'Twin Lakes', false, '4:30 PM'),
];

/** Ids have to be unique and stable; nothing reads them but React's keys. */
const withIds = (sport, players) =>
  players.map((p) => ({ id: `${sport}-${p.number}`, ...p }));

const sports = {
  // Football's fixtures live in the season above — the same arrangement a real
  // paid school has, where the directory feeds football and nothing else.
  football: { players: withIds('football', FOOTBALL), schedule: null },
  volleyball: { players: withIds('volleyball', VOLLEYBALL), schedule: VOLLEYBALL_SCHEDULE },
  soccer: { players: withIds('soccer', SOCCER), schedule: SOCCER_SCHEDULE },
  basketball: { players: withIds('basketball', BASKETBALL), schedule: BASKETBALL_SCHEDULE },
  wrestling: { players: withIds('wrestling', WRESTLING), schedule: WRESTLING_SCHEDULE },
  baseball: { players: withIds('baseball', BASEBALL), schedule: BASEBALL_SCHEDULE },
};

/*
 * The forecast for the next fixture, baked like everything else.
 *
 * The date is what binds it to a game: School.tsx draws a forecast only on the
 * fixture naming that same day, so this one belongs to week six and appears
 * nowhere else. Written out rather than fetched, because the demo page is not
 * allowed to ask anybody anything.
 */
const NEXT_FIXTURE = WEEKS[PLAYED_WEEKS];

const weather = {
  date: NEXT_FIXTURE,
  code: 2,
  tempF: 63,
  precipChance: 20,
  windMph: 9,
  day: false,
  at: `${NEXT_FIXTURE}T19:00`,
};

const demo = {
  slug: SLUG,
  season: SEASON_YEAR,
  school: { slug: SLUG, name: NAME, city: CITY },
  colors: { ground: GROUND, accent: ACCENT },
  logo: LOGO,
  // The order the hub is handed; sortSportsForNow reorders it by the calendar.
  sportNames: ['football', 'volleyball', 'soccer', 'basketball', 'wrestling', 'baseball'],
  league: LEAGUE,
  seasons,
  sports,
  weather,
};

/*
 * The one thing that must be true, checked before the file is written.
 *
 * Every scored game strictly in the past and every unscored one ahead, across
 * football, all five pasted schedules and all six baked seasons — the rivals
 * included, because they carry the same conference games from the other side
 * and a rival left on the old calendar would put the standings table at odds
 * with the school's own record. This throws rather than warns: a demo.json that
 * fails it is the exact file this rewrite exists to stop being committed.
 */
const TODAY_ISO = iso(TODAY);
const dated = [];
for (const season of Object.values(seasons)) {
  for (const g of season.games) dated.push([`${season.school.slug} football`, g.date, !!g.result]);
}
for (const [sport, s] of Object.entries(sports)) {
  for (const r of s.schedule ?? []) dated.push([sport, r.date, !!r.score]);
}

const wrong = dated.filter(([, date, scored]) =>
  scored ? date >= TODAY_ISO : date < TODAY_ISO,
);
if (wrong.length) {
  for (const [where, date, scored] of wrong) {
    console.error(`  ${where}: ${date} ${scored ? 'has a score and is not past' : 'has no score and is not ahead'}`);
  }
  throw new Error(`${wrong.length} games are on the wrong side of today`);
}

const out = join(root, 'public/oh/demo.json');
writeFileSync(out, `${JSON.stringify(demo, null, 2)}\n`);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const scoredDates = dated.filter(([, , s]) => s).map(([, d]) => d).sort();
const aheadDates = dated.filter(([, , s]) => !s).map(([, d]) => d).sort();

console.log(`wrote ${out}`);
console.log(`  crest ${kb(crestPng.length)} png, ${kb(LOGO.length)} as a data URI`);
console.log(`  ${Object.keys(seasons).length} seasons, ${Object.keys(sports).length} sports`);
for (const [sport, s] of Object.entries(sports)) {
  console.log(`  ${sport}: ${s.players.length} players, ${s.schedule?.length ?? 0} pasted rows`);
}
console.log(`  anchored on ${iso(ANCHOR)}, generated ${TODAY_ISO}`);
console.log(`  football ${WEEKS[0]} → ${WEEKS[TOTAL_WEEKS - 1]}, ${PLAYED_WEEKS} played`);
console.log(`  played  ${scoredDates[0]} → ${scoredDates[scoredDates.length - 1]} (${scoredDates.length} games)`);
console.log(`  ahead   ${aheadDates[0]} → ${aheadDates[aheadDates.length - 1]} (${aheadDates.length} games)`);
console.log(`  ${NAME}: ${seasons[SLUG].record.won}–${seasons[SLUG].record.lost}`);
// The date the file stops telling the truth: the last autumn fixture goes by
// with no score on it and the Played group quietly stops growing.
console.log(`  re-run before a demo — this one reads as stale after ${WEEKS[TOTAL_WEEKS - 1]}`);
