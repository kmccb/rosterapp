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
 * the audience that reads a schedule closely.
 *
 * The drift that would otherwise follow is handled at the other end:
 * src/oh/demo.ts carries every date forward by whole weeks when the page loads,
 * so the split between what has been played and what is to come stays where it
 * was put, indefinitely, with nobody remembering anything.
 *
 * What that cannot fix is the calendar itself. The shift moves the autumn along
 * with everything else, so about six months on the football season is reading
 * January to March under a hub tile still saying "Starts in August". So this
 * wants re-running about every six months — twice a year, near the start of the
 * autumn and again around February — and before any demo that matters.
 * `DEMO_TODAY=2027-02-10 node scripts/build-demo.mjs` shows what it writes on a
 * day of your choosing.
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
// DEMO_TODAY=2027-02-10 pretends it is that day. The calendar has two halves —
// the autumn under way, and the autumn not yet begun — and the second one is
// otherwise only reachable by changing the machine's clock.
const todayLocal = process.env.DEMO_TODAY
  ? new Date(`${process.env.DEMO_TODAY}T12:00:00`)
  : new Date();
const TODAY = new Date(
  Date.UTC(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate()),
);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const iso = (d) => d.toISOString().slice(0, 10);

// Friday is 5. `|| 7` is the case that matters: run this on a Friday and the
// answer is a week ago, not today — today's game has not been played yet.
const ANCHOR = addDays(TODAY, -((((TODAY.getUTCDay() - 5) + 7) % 7) || 7));

/*
 * Which months each sport runs in — the same table src/oh/sportSeasons.ts
 * keeps, and the reason it is here twice.
 *
 * That file is what the hub reads to print "In season" or "Starts in November"
 * under a sport's name, and it is TypeScript, which this script cannot import.
 * So it is copied, and a test holds the copy to the original — because the one
 * thing this script must not do is write a season the hub will contradict on
 * the very next tap.
 */
const SPORT_MONTHS = {
  football: [8, 9, 10, 11],
  volleyball: [8, 9, 10, 11],
  soccer: [8, 9, 10, 11],
  basketball: [11, 12, 1, 2, 3],
  wrestling: [11, 12, 1, 2, 3],
  baseball: [3, 4, 5, 6],
};

const MONTH_NOW = TODAY.getUTCMonth() + 1;
const liveNow = (sport) => SPORT_MONTHS[sport].includes(MONTH_NOW);

/*
 * Whether the autumn is on.
 *
 * Football, volleyball and soccer run to one calendar, so they take one
 * verdict. In the autumn they are anchored to today: results behind, fixtures
 * ahead, the season under way. Out of it they are moved bodily to the next
 * autumn with nothing played — which is precisely what a real school's page
 * looks like in February, and the only arrangement that does not argue with the
 * hub's own "Starts in August" above it. A season cannot both have results in
 * the past and sit in months 8 to 11 when today is the second of February.
 */
const AUTUMN = ['football', 'volleyball', 'soccer'];
const AUTUMN_LIVE = liveNow('football');

const TOTAL_WEEKS = 10;

/** Half the season behind, half ahead: enough played for a record, a Played
 * group and a standings table, and enough to come for the page to be about
 * something. Out of season nothing has been played, because nothing has. */
const PLAYED_WEEKS = AUTUMN_LIVE ? 5 : 0;

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
  months.includes(MONTH_NOW) ? addDays(TODAY, 14) : nextOn(month, day);

/** The Friday the next autumn opens on: the first one from late August. */
const nextAutumnOpener = () => {
  const late = nextOn(8, 21);
  return addDays(late, (5 - late.getUTCDay() + 7) % 7);
};

const AUTUMN_OPENER = AUTUMN_LIVE ? null : nextAutumnOpener();

/** Ten Fridays. In season, week five lands on the anchor; out of it, week one
 * lands on the next autumn's opening Friday and none of them has been played. */
const WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) =>
  AUTUMN_LIVE
    ? iso(addDays(ANCHOR, (i - (PLAYED_WEEKS - 1)) * 7))
    : iso(addDays(AUTUMN_OPENER, i * 7)),
);

/**
 * One autumn schedule, on whichever calendar is in force.
 *
 * `liveDays` are offsets from the anchor — negative or zero for a match that
 * has been played, eight or more for one to come, so that it clears today
 * however recently the anchor fell. `openerDays` are offsets from the next
 * autumn's opening Friday, used out of season, where every row is a fixture and
 * the scores are dropped along with the calendar they belonged to.
 */
const autumnSchedule = (fixtures, liveDays, openerDays) =>
  fixtures.map((f, i) =>
    AUTUMN_LIVE
      ? row(iso(addDays(ANCHOR, liveDays[i])), f.opponent, f.home, f.time, f.score)
      : row(iso(addDays(AUTUMN_OPENER, openerDays[i])), f.opponent, f.home, f.time),
  );

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

/** Only the first PLAYED_WEEKS weeks carry a result, so an out-of-season run —
 * where nothing has been played, because the season has not begun — drops every
 * score in the tables above rather than needing tables of its own. */
const isPlayed = (week) => week <= PLAYED_WEEKS;

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
      ...(g.us === undefined || !isPlayed(week)
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
        ...(us === undefined || !isPlayed(week)
          ? {}
          : { result: { us, them: theirs, won: us > theirs } }),
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
const VOLLEYBALL_SCHEDULE = autumnSchedule(
  [
    { opponent: 'Ashcombe', home: true, time: '6:30 PM', score: { us: 3, them: 1 } },
    { opponent: 'Bellhaven', home: false, time: '6:30 PM', score: { us: 1, them: 3 } },
    { opponent: 'Cedar Ridge', home: true, time: '6:30 PM' },
    { opponent: 'Elmbrook', home: false, time: '6:30 PM' },
    { opponent: 'Marlow Central', home: true, time: '6:30 PM' },
    { opponent: 'Ashcombe', home: false, time: '6:30 PM' },
    { opponent: 'Bellhaven', home: true, time: '6:30 PM' },
    { opponent: 'Cedar Ridge', home: false, time: '6:30 PM' },
    { opponent: 'Elmbrook', home: true, time: '6:30 PM' },
  ],
  [-10, -3, 8, 10, 15, 17, 22, 24, 29],
  [3, 10, 17, 24, 31, 38, 45, 52, 59],
);

const SOCCER_SCHEDULE = autumnSchedule(
  [
    { opponent: 'Kirkwood Prep', home: false, time: '7:00 PM', score: { us: 2, them: 1 } },
    { opponent: 'Ashcombe', home: true, time: '7:00 PM', score: { us: 0, them: 3 } },
    { opponent: 'Bellhaven', home: false, time: '7:00 PM', score: { us: 3, them: 2 } },
    { opponent: 'Cedar Ridge', home: true, time: '7:00 PM' },
    { opponent: 'Elmbrook', home: false, time: '11:00 AM' },
    { opponent: 'Marlow Central', home: true, time: '7:00 PM' },
    { opponent: 'Harmony Ridge', home: false, time: '11:00 AM' },
    { opponent: 'Stonebridge Central', home: true, time: '7:00 PM' },
  ],
  [-12, -8, -2, 9, 13, 16, 20, 23],
  [1, 8, 15, 22, 29, 36, 43, 50],
);

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
  // The day this was made, so a test can hold the file to the month table as it
  // stood then rather than as it stands whenever the suite happens to run.
  generatedOn: iso(TODAY),
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

/*
 * The second thing that must be true: no sport may argue with the hub above it.
 *
 * The today-boundary above says nothing about which months a season lands in,
 * and on its own it would happily pass a run made in February — January results
 * and March fixtures under a football tile reading "Starts in August". So each
 * sport is checked against the month table as well, and the check is different
 * either side of the sport's own season:
 *
 *  - out of season, the hub is saying the sport has not started. Nothing may
 *    carry a score, and every date must fall inside the sport's own months.
 *  - in season, the two dates a reader's eye actually lands on — the last
 *    result and the next fixture — must sit in the sport's months or the month
 *    either side of them. That tolerance is deliberate: a real autumn opens in
 *    the last week of August and can run a playoff into December, and refusing
 *    the shoulder would refuse a season nobody would look at twice.
 *
 * Nothing here demands that an in-season sport have results. Basketball in
 * January is a fixture list and no more, which is a thin page but not a
 * contradiction — the hub says the season is on and the page shows games to
 * come. What the hub cannot survive is the other one: "Starts in August" over
 * a row of January scores.
 */
const MONTH_OF = (date) => Number(date.slice(5, 7));
const neighbours = (months) =>
  new Set(months.flatMap((m) => [m, (m % 12) + 1, ((m + 10) % 12) + 1]));

const bySport = new Map();
for (const [where, date, scored] of dated) {
  const sport = where.endsWith(' football') ? 'football' : where;
  if (!bySport.has(sport)) bySport.set(sport, []);
  bySport.get(sport).push([date, scored]);
}

const quarrels = [];
for (const [sport, games] of bySport) {
  const months = SPORT_MONTHS[sport];
  if (!months) {
    quarrels.push(`${sport} is not in the month table`);
    continue;
  }
  const scored = games.filter(([, s]) => s).map(([d]) => d).sort();
  const ahead = games.filter(([, s]) => !s).map(([d]) => d).sort();

  if (!liveNow(sport)) {
    if (scored.length) {
      quarrels.push(`${sport} is out of season today but carries ${scored.length} results`);
    }
    const stray = games.map(([d]) => d).filter((d) => !months.includes(MONTH_OF(d)));
    if (stray.length) {
      quarrels.push(`${sport} is out of season today but ${stray.length} of its dates fall outside its months (${stray[0]})`);
    }
    continue;
  }

  const window = neighbours(months);
  const edges = [scored[scored.length - 1], ahead[0]].filter(Boolean);
  for (const edge of edges) {
    if (!window.has(MONTH_OF(edge))) {
      quarrels.push(`${sport}: ${edge} is too far outside its season for the hub to agree with`);
    }
  }
}
if (quarrels.length) {
  for (const q of quarrels) console.error(`  ${q}`);
  throw new Error('the calendar contradicts src/oh/sportSeasons.ts');
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
console.log(
  `  generated ${TODAY_ISO}; the autumn is ${AUTUMN_LIVE ? 'on' : `off, so ${AUTUMN.join('/')} are dated to the next one`}`,
);
console.log(`  anchored on ${iso(ANCHOR)}`);
console.log(`  football ${WEEKS[0]} → ${WEEKS[TOTAL_WEEKS - 1]}, ${PLAYED_WEEKS} played`);
const spread = (dates) =>
  dates.length ? `${dates[0]} → ${dates[dates.length - 1]} (${dates.length} games)` : 'none';
console.log(`  played  ${spread(scoredDates)}`);
console.log(`  ahead   ${spread(aheadDates)}`);
console.log(`  ${NAME}: ${seasons[SLUG].record.won}–${seasons[SLUG].record.lost}`);
/*
 * What the page does with this file from here on.
 *
 * src/oh/demo.ts moves every date forward by whole weeks at read time, so the
 * split between played and coming stays where it was put however long this file
 * sits — that part looks after itself and nobody has to remember anything.
 * What the shift cannot do is keep the season in its own months: it carries the
 * autumn along too, so about six months from now this season is reading January
 * to March under a hub still saying "Starts in August". That is the reason to
 * re-run this, and it makes it a twice-a-year job.
 */
console.log('  the page carries these dates forward by whole weeks as it ages;');
console.log('  re-run about every six months, so the season stays in its own months');
