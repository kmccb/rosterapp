/*
 * The demo school, written out as one file.
 *
 * Everything a prospect is shown at /oh/demo/ comes from public/oh/demo.json:
 * the school's colors and crest, three sample rosters, a football season for the
 * school and each of its conference rivals, the volleyball and basketball
 * schedules a seller would have pasted, the conference the seller would have
 * typed in, and the kickoff forecast. It is generated rather than hand-typed
 * because the pieces have to agree with one another and with the calendar — a
 * volleyball score dated next week is the single most visible way for this page
 * to look broken.
 *
 * The school is Millbrook (the Tigers), invented, and so are its rivals and
 * every player. The demo was the real Springfield for one pitch, but a public
 * site sends everyone here, and invented players do not belong on a real
 * school's page in front of strangers. It is dressed the way a paid school
 * like Springfield is — an orange ground, black on it, a nickname after the
 * name — because that is the page a prospect is being shown they could have.
 *
 * Alongside it the script writes public/oh/stats/millbrook-demo-football.json,
 * a season of invented stats for the invented football squad, in exactly the
 * shape scripts/maxpreps.mjs commits for a real school — so the Stats tab, the
 * season line on Lookup and the player card's week by week all draw on the
 * demo the way they draw on a paid page. Every number is made up here; the file
 * says so in its `source`.
 *
 * Run by hand — `node scripts/build-demo.mjs` — then commit public/oh/demo.json
 * and the stats file.
 * It is not part of `npm run build` and must not become part of it: it
 * rasterizes a crest through sharp, and the guarded build has no business doing
 * that.
 *
 * WHEN TO RE-RUN. The pasted schedules are anchored to the day the script runs,
 * so that a scored match is always in the past and an unplayed one always
 * ahead. src/oh/demo.ts carries a schedule that has results forward by whole
 * weeks when the page loads, each sport by its own results, so volleyball's
 * split between played and coming stays where it was put — but only as far as
 * the end of volleyball's own months. A schedule with nothing played on it
 * (basketball, until it starts) is never moved: it is already dated inside its
 * own season, and it slides into the past one fixture at a time once that
 * season arrives. So this wants re-running twice a year — near the start of
 * the autumn, and again in December once volleyball is over, when it rewrites
 * the autumn as next year's fixtures and starts basketball's run from a
 * fortnight ahead — and before any demo that matters.
 * `DEMO_TODAY=2027-02-10 node scripts/build-demo.mjs` shows what it writes on a
 * day of your choosing. Football is baked like the rest and is re-run with it.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

// ------------------------------------------------------------------ identity

const SLUG = 'millbrook-demo';
const NAME = 'Millbrook';
const CITY = 'Millbrook';
/* Said after the name in the page's headers — "Millbrook Tigers" — the way a
   seller's nickname is on a paid school's page (rosterStore.ts, SchoolColors). */
const NICKNAME = 'Tigers';

/*
 * An orange ground with black on it, the way the first paying school's page is
 * dressed, so the demo looks like the product a prospect would actually get.
 * Close to Springfield's orange and deliberately not the same: this school is
 * nobody's. The text is black too, because black reads on this orange where
 * white only just does — look.ts lifts or darkens a chosen text color to keep it
 * readable, so the third color is chosen rather than left to the white default.
 * No light set: like Springfield's, the light page is worked out from these.
 */
const GROUND = '#c65a12';
const ACCENT = '#1a1a1a';
const TEXT = '#000000';

/*
 * Every school on the demo page is invented, conference rivals included. The
 * demo was the real Springfield for one pitch; a public site sends everyone
 * here, and invented players do not belong on a real school's page in front of
 * strangers. The slugs carry a -demo suffix so none can collide with a real
 * file in public/oh/data, and the check below refuses to write if one does.
 *
 * Not "Springfield Local", the name the first fictional demo used: that is the
 * real name of a real district.
 */
const MEMBERS = [
  { slug: SLUG, name: NAME, city: CITY },
  { slug: 'ashcombe-demo', name: 'Ashcombe', city: 'Ashcombe' },
  { slug: 'bellhaven-demo', name: 'Bellhaven', city: 'Bellhaven' },
  { slug: 'cedar-ridge-demo', name: 'Cedar Ridge', city: 'Cedar Ridge' },
  { slug: 'elmbrook-demo', name: 'Elmbrook', city: 'Elmbrook' },
  { slug: 'marlow-central-demo', name: 'Marlow Central', city: 'Marlow' },
];
const [, ASHCOMBE, BELLHAVEN, CEDAR_RIDGE, ELMBROOK, MARLOW] = MEMBERS.map((m) => m.name);

const LEAGUE = {
  name: 'Riverbend Athletic Conference',
  members: MEMBERS.slice(1).map((m) => m.slug),
};

/* Read only to prove nothing invented here is somebody real. */
const index = readJson('public/oh/index.json');
const realSlugs = new Set((index.schools ?? index).map((s) => s.slug));

// ------------------------------------------------------------------- crest

/**
 * A monogram roundel, rasterized to PNG.
 *
 * PNG rather than SVG because rosterStore.ts's LOGO_DATA_URI accepts only
 * raster types — the value is substituted into a CSS url(), and the narrow
 * alphabet is what makes that safe. The letters are paths rather than <text>
 * so the output does not depend on the fonts of the machine that runs this.
 *
 * Black outside, then an orange ring, so the badge keeps its edge on the
 * orange page it sits on; "MT" in orange on black inside. Not a tiger: the
 * tiger is Springfield's own mark (docs/design/springfield-video), and a
 * monogram is what an invented school can honestly wear.
 */
const crestSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="${ACCENT}"/>
  <circle cx="256" cy="256" r="236" fill="${GROUND}"/>
  <circle cx="256" cy="256" r="218" fill="${ACCENT}"/>
  <circle cx="256" cy="256" r="198" fill="none" stroke="${GROUND}" stroke-width="7"/>
  <g fill="${GROUND}" transform="translate(256 256) scale(0.84) translate(-256 -256)">
    <path d="M92 362 v-212 h44 l50 120 l50 -120 h44 v212 h-40 v-136 l-40 96 h-28 l-40 -96 v136 z"/>
    <path d="M296 150 h124 v40 h-42 v172 h-40 v-172 h-42 z"/>
  </g>
</svg>`;

// Two colors and an edge, so a palette costs nothing and keeps the string
// small — it is inlined in a committed JSON and again in a CSS custom property.
const crestPng = await sharp(Buffer.from(crestSvg))
  .png({ palette: true, colors: 32, compressionLevel: 9 })
  .toBuffer();
const LOGO = `data:image/png;base64,${crestPng.toString('base64')}`;

/* The database refuses a theme over this many bytes (0005_school_theme.sql),
   so a crest past it is one the seller could never have uploaded. */
const THEME_CEILING = 500_000;

// ---------------------------------------------------------------- the calendar

/*
 * Every pasted date hangs off one day: the most recent Thursday that has
 * already been. A score is only ever printed on a date that has passed, so the
 * played half of a schedule is counted backwards from that Thursday, and
 * everything unplayed starts more than a week the far side of it — the anchor
 * can be as recent as yesterday or as old as a week, and the next fixture has
 * to clear today whatever day the script is run on.
 *
 * Thursday because it is a volleyball night, so the last result can sit on the
 * anchor itself. That matters to src/oh/demo.ts, which carries a played
 * schedule forward whenever its last result is more than a week old: a last
 * result the day before a Friday anchor is eight days old on a Friday run, and
 * the page would move volleyball a week on its very first load.
 *
 * Dates are done in UTC. The output is a plain YYYY-MM-DD and the arithmetic is
 * whole days, so the one thing that could go wrong is an hour lost to a clock
 * change turning the 4th into the 3rd; UTC has no such hour.
 */
const DAY = 86_400_000;
// DEMO_TODAY=2027-02-10 pretends it is that day, so the out-of-season half of
// the year can be seen without changing the machine's clock.
const todayLocal = process.env.DEMO_TODAY
  ? new Date(`${process.env.DEMO_TODAY}T12:00:00`)
  : new Date();
const TODAY = new Date(
  Date.UTC(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate()),
);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const iso = (d) => d.toISOString().slice(0, 10);

// Thursday is 4. `|| 7` is the case that matters: run this on a Thursday and
// the answer is a week ago, not today — today's match has not been played yet.
const ANCHOR = addDays(TODAY, -((((TODAY.getUTCDay() - 4) + 7) % 7) || 7));

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
  basketball: [11, 12, 1, 2, 3],
};

const MONTH_NOW = TODAY.getUTCMonth() + 1;
const liveNow = (sport) => SPORT_MONTHS[sport].includes(MONTH_NOW);

/*
 * Whether volleyball is on.
 *
 * In its season it is anchored to today: results behind, fixtures ahead. Out of
 * it the whole schedule moves bodily to the next autumn with nothing played —
 * which is what a real school's page looks like in February, and the only
 * arrangement that does not argue with the hub's own "Starts in August".
 */
const VOLLEYBALL_LIVE = liveNow('volleyball');

/**
 * The next time a given month and day comes round, at least a fortnight off.
 *
 * Basketball is dated by the calendar rather than by an offset from the anchor.
 * Its schedule has no scores on it, so any future date would satisfy the rule
 * above — but the hub says basketball "Starts in November" out of a fixed
 * table, and a schedule that then opened in June would contradict it.
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
 * Where an off-season sport's fixtures begin: the next time its opening date
 * comes round — unless today is already inside its run, when waiting eleven
 * months would put the first fixture under a hub saying "In season", so the
 * fixtures start a fortnight from now instead.
 */
const seasonStart = (month, day, months) =>
  months.includes(MONTH_NOW) ? addDays(TODAY, 14) : nextOn(month, day);

/** The Friday the next autumn opens on: the first one from late August. */
const nextAutumnOpener = () => {
  const late = nextOn(8, 21);
  return addDays(late, (5 - late.getUTCDay() + 7) % 7);
};

const AUTUMN_OPENER = VOLLEYBALL_LIVE ? null : nextAutumnOpener();

// --------------------------------------------------------------- football

/*
 * Football hangs off its own day: the most recent Friday that has been.
 * Volleyball keeps its Thursday above, and src/oh/demo.ts moves each sport by
 * its own results, so the two anchors never have to agree.
 */
const FB_ANCHOR = addDays(TODAY, -((((TODAY.getUTCDay() - 5) + 7) % 7) || 7));
const FOOTBALL_LIVE = liveNow('football');
const TOTAL_WEEKS = 10;

/*
 * How much of the season has been played is read off the real calendar, not
 * fixed at half.
 *
 * src/oh/demo.ts carries a played season forward by whole weeks but never out
 * of the sport's own months. A season always written half-played in mid-October
 * ends in mid-November, has two weeks of room, and then sits still with last
 * week's fixture under "Coming up". Written the way an Ohio season actually
 * falls — week one on the first Friday from late August — an October file ends
 * in October and has the whole of November to move in.
 *
 * Clamped to 1..9 so there is always a result behind and a fixture ahead while
 * the hub says "In season".
 */
const openerThisYear = (() => {
  const late = new Date(Date.UTC(TODAY.getUTCFullYear(), 7, 21));
  return addDays(late, (5 - late.getUTCDay() + 7) % 7);
})();
const weeksIn = Math.floor((FB_ANCHOR.getTime() - openerThisYear.getTime()) / (7 * DAY)) + 1;
const PLAYED_WEEKS = FOOTBALL_LIVE ? Math.min(9, Math.max(1, weeksIn)) : 0;

/** Ten Fridays. In season, the last played week lands on the anchor; out of
 * it, week one lands on the next autumn's opening Friday and none is played. */
const WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) =>
  FOOTBALL_LIVE
    ? iso(addDays(FB_ANCHOR, (i - (PLAYED_WEEKS - 1)) * 7))
    : iso(addDays(nextAutumnOpener(), i * 7)),
);

/*
 * Five rounds, every pair meeting once, in weeks 3 to 7. Written out because
 * the scores are chosen: a demo where the school being sold to wins everything
 * reads as a brochure, so Millbrook loses one here and two outside.
 * Indexes are into MEMBERS; `h` is the home side.
 */
const ROUNDS = [
  [{ h: 0, a: 1, hs: 28, as: 14 }, { h: 2, a: 5, hs: 21, as: 20 }, { h: 3, a: 4, hs: 7, as: 24 }],
  [{ h: 2, a: 0, hs: 24, as: 17 }, { h: 1, a: 3, hs: 13, as: 35 }, { h: 4, a: 5, hs: 28, as: 21 }],
  [{ h: 0, a: 3, hs: 35, as: 7 }, { h: 4, a: 2, hs: 14, as: 17 }, { h: 5, a: 1, hs: 30, as: 22 }],
  [{ h: 4, a: 0, hs: 17, as: 27 }, { h: 5, a: 3, hs: 28, as: 14 }, { h: 1, a: 2, hs: 10, as: 31 }],
  [{ h: 0, a: 5, hs: 24, as: 21 }, { h: 1, a: 4, hs: 14, as: 35 }, { h: 2, a: 3, hs: 38, as: 6 }],
];

/*
 * Non-conference weeks — 1, 2, 8, 9 and 10 — against schools with no page.
 * opponentSlug is null, the shape the real parser gives an opponent that is
 * not in the directory.
 */
const NON_CONFERENCE = {
  0: [
    { opponent: 'Kirkwood Prep', home: false, us: 14, them: 21 },
    { opponent: 'Twin Lakes', home: true, us: 31, them: 10 },
    { opponent: 'Harmony Ridge', home: true, us: 20, them: 23 },
    { opponent: 'Pinecrest Academy', home: false, us: 34, them: 12 },
    { opponent: 'Stonebridge Central', home: true, us: 21, them: 17 },
  ],
  1: [
    { opponent: 'Harmony Ridge', home: true, us: 24, them: 7 },
    { opponent: 'Stonebridge Central', home: false, us: 10, them: 27 },
    { opponent: 'Twin Lakes', home: false, us: 13, them: 20 },
    { opponent: 'Kirkwood Prep', home: true, us: 17, them: 14 },
    { opponent: 'Pinecrest Academy', home: true, us: 28, them: 21 },
  ],
  2: [
    { opponent: 'Pinecrest Academy', home: true, us: 42, them: 14 },
    { opponent: 'Kirkwood Prep', home: true, us: 21, them: 13 },
    { opponent: 'Harmony Ridge', home: false, us: 27, them: 24 },
    { opponent: 'Stonebridge Central', home: true, us: 14, them: 20 },
    { opponent: 'Twin Lakes', home: false, us: 35, them: 10 },
  ],
  3: [
    { opponent: 'Twin Lakes', home: false, us: 6, them: 28 },
    { opponent: 'Harmony Ridge', home: true, us: 20, them: 17 },
    { opponent: 'Kirkwood Prep', home: false, us: 7, them: 31 },
    { opponent: 'Pinecrest Academy', home: true, us: 24, them: 22 },
    { opponent: 'Stonebridge Central', home: false, us: 12, them: 30 },
  ],
  4: [
    { opponent: 'Stonebridge Central', home: true, us: 35, them: 28 },
    { opponent: 'Pinecrest Academy', home: false, us: 14, them: 9 },
    { opponent: 'Harmony Ridge', home: true, us: 21, them: 24 },
    { opponent: 'Twin Lakes', home: true, us: 30, them: 13 },
    { opponent: 'Kirkwood Prep', home: false, us: 17, them: 20 },
  ],
  5: [
    { opponent: 'Harmony Ridge', home: false, us: 13, them: 34 },
    { opponent: 'Twin Lakes', home: true, us: 7, them: 24 },
    { opponent: 'Stonebridge Central', home: false, us: 21, them: 28 },
    { opponent: 'Kirkwood Prep', home: true, us: 26, them: 19 },
    { opponent: 'Pinecrest Academy', home: false, us: 16, them: 14 },
  ],
};
const NON_CONFERENCE_WEEKS = [1, 2, 8, 9, 10];
const KICKOFF = '7:00 PM';

/** Only the first PLAYED_WEEKS weeks carry a result, so one table of scores
 * serves a file written on any day of the year. */
const isPlayed = (week) => week <= PLAYED_WEEKS;

/** One school's ten games, folded out of the two tables above. */
function seasonFor(i) {
  const games = [];
  NON_CONFERENCE[i].forEach((g, slot) => {
    const week = NON_CONFERENCE_WEEKS[slot];
    games.push({
      week,
      date: WEEKS[week - 1],
      kickoff: KICKOFF,
      home: g.home,
      opponent: g.opponent,
      opponentCity: '',
      opponentSlug: null,
      ...(isPlayed(week) ? { result: { us: g.us, them: g.them, won: g.us > g.them } } : {}),
    });
  });
  ROUNDS.forEach((round, r) => {
    const week = r + 3;
    for (const game of round) {
      if (game.h !== i && game.a !== i) continue;
      const home = game.h === i;
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
        ...(isPlayed(week) ? { result: { us, them: theirs, won: us > theirs } } : {}),
      });
    }
  });
  games.sort((a, b) => a.week - b.week);

  const record = { won: 0, lost: 0, played: 0 };
  for (const g of games) {
    if (!g.result) continue;
    record.played += 1;
    if (g.result.won) record.won += 1;
    else record.lost += 1;
  }
  return { school: MEMBERS[i], games, record };
}

const seasons = {};
MEMBERS.forEach((m, i) => {
  seasons[m.slug] = seasonFor(i);
});

/*
 * The forecast for the next fixture, baked like everything else: the demo page
 * may not ask anybody anything. School.tsx draws a forecast only on the fixture
 * naming this same day.
 */
const NEXT_FIXTURE = WEEKS[PLAYED_WEEKS];
const weather = {
  date: NEXT_FIXTURE,
  code: 2,
  tempF: 58,
  precipChance: 20,
  windMph: 9,
  day: false,
  at: `${NEXT_FIXTURE}T19:00`,
};

const row = (date, opponent, home, time, score) => ({
  date,
  opponent,
  home,
  time,
  ...(score ? { score } : {}),
});

/**
 * One autumn schedule, on whichever calendar is in force.
 *
 * `liveDays` are offsets from the anchor — zero or negative for a match that
 * has been played, twelve or more for one to come, so that it clears today
 * however old the anchor is. `openerDays` are offsets from the next autumn's
 * opening Friday, used out of season, where every row is a fixture and the
 * scores are dropped along with the calendar they belonged to.
 */
const autumnSchedule = (fixtures, liveDays, openerDays) =>
  fixtures.map((f, i) =>
    VOLLEYBALL_LIVE
      ? row(iso(addDays(ANCHOR, liveDays[i])), f.opponent, f.home, f.time, f.score)
      : row(iso(addDays(AUTUMN_OPENER, openerDays[i])), f.opponent, f.home, f.time),
  );

// ---------------------------------------------------------------- the squads

const player = (number, firstName, lastName, position, side, extra = {}) => ({
  number,
  firstName,
  lastName,
  position,
  side,
  ...extra,
});

/* Feet and inches as the video prints them, inches as the roster stores them. */
const ft = (feet, inches) => feet * 12 + inches;

/*
 * Every name here is invented, to make a believable small-school varsity — most
 * of it two-way, which is what a
 * thirty-man roster in Division VI looks like. A two-way player's side is left
 * blank, so the Offense and Defense chips both find him.
 */
const FOOTBALL = [
  player('1', 'Owen', 'Carter', 'QB/DB', '', { heightIn: ft(5, 9), weightLb: 175, grade: 'Jr' }),
  player('2', 'Jalen', 'Reyes', 'QB/DB', '', { heightIn: ft(6, 1), weightLb: 185, grade: 'So' }),
  player('3', 'Eli', 'Novak', 'WR/DB', '', { heightIn: ft(5, 8), weightLb: 160, grade: 'Sr' }),
  player('4', 'Drew', 'Halloran', 'WR/LB', '', { heightIn: ft(6, 0), weightLb: 180, grade: 'Jr' }),
  player('5', 'Kai', 'Mercer', 'RB/DB', '', { heightIn: ft(5, 8), weightLb: 165, grade: 'Sr' }),
  player('6', 'Sam', 'Whitfield', 'RB/LB', '', { heightIn: ft(5, 10), weightLb: 170, grade: 'Sr' }),
  player('7', 'Tobias', 'Kerr', 'TE/LB', '', { heightIn: ft(6, 3), weightLb: 170, grade: 'Jr' }),
  player('8', 'Wyatt', 'Brennan', 'WR/DB', '', { heightIn: ft(5, 10), weightLb: 160, grade: 'So' }),
  player('9', 'Colton', 'Hayes', 'RB', 'O', { heightIn: ft(5, 9), weightLb: 170, grade: 'Fr' }),
  player('10', 'Caleb', 'Ostrowski', 'LB/FB', '', { heightIn: ft(6, 0), weightLb: 190, grade: 'Sr' }),
  player('11', 'Nate', 'Pryor', 'WR/DB', '', { heightIn: ft(5, 11), weightLb: 170, grade: 'Jr' }),
  player('12', 'Luke', 'Danner', 'QB', 'O', { heightIn: ft(6, 2), weightLb: 180, grade: 'So' }),
  player('13', 'Ryan', 'Kozlowski', 'WR', 'O', { heightIn: ft(6, 0), weightLb: 165, grade: 'So' }),
  player('14', 'Isaac', 'Moreno', 'WR/CB', '', { heightIn: ft(5, 9), weightLb: 165, grade: 'Fr' }),
  player('15', 'Grant', 'Yoder', 'TE/DE', '', { heightIn: ft(6, 1), weightLb: 200, grade: 'Sr' }),
  player('18', 'Brady', 'Simmons', 'K/P', 'ST', { heightIn: ft(5, 11), weightLb: 160, grade: 'Jr' }),
  player('20', 'Ethan', 'Palmer', 'DB', 'D', { heightIn: ft(5, 10), weightLb: 165, grade: 'Jr' }),
  player('21', 'Mason', 'Kline', 'CB', 'D', { heightIn: ft(5, 9), weightLb: 158, grade: 'So' }),
  player('22', 'Logan', 'Szabo', 'RB/LB', '', { heightIn: ft(5, 11), weightLb: 185, grade: 'Jr' }),
  player('24', 'Darius', 'Cole', 'RB/LB', '', { heightIn: ft(5, 11), weightLb: 195, grade: 'Sr' }),
  player('33', 'Hunter', 'Mazur', 'FB/LB', '', { heightIn: ft(6, 0), weightLb: 205, grade: 'Sr' }),
  player('44', 'Jacob', 'Wenzel', 'LB', 'D', { heightIn: ft(5, 11), weightLb: 200, grade: 'Jr' }),
  player('50', 'Dominic', 'Russo', 'OL/DL', '', { heightIn: ft(6, 0), weightLb: 245, grade: 'Sr' }),
  player('52', 'Tyler', 'Petrosky', 'C', 'O', { heightIn: ft(5, 11), weightLb: 235, grade: 'Jr' }),
  player('55', 'Austin', 'Yeager', 'OL/DL', '', { heightIn: ft(6, 2), weightLb: 260, grade: 'Sr' }),
  player('60', 'Connor', 'Mihalik', 'OG', 'O', { heightIn: ft(6, 0), weightLb: 240, grade: 'So' }),
  player('64', 'Gavin', 'Lutz', 'OL/DL', '', { heightIn: ft(6, 1), weightLb: 255, grade: 'Jr' }),
  player('72', 'Nolan', 'Fetterman', 'OT', 'O', { heightIn: ft(6, 4), weightLb: 275, grade: 'Sr' }),
  player('75', 'Evan', 'Bartholomew', 'DT', 'D', { heightIn: ft(6, 2), weightLb: 270, grade: 'Jr' }),
  player('88', 'Carter', 'Lisko', 'TE/DE', '', { heightIn: ft(6, 2), weightLb: 205, grade: 'So' }),
];

/*
 * Positions are spelled out wherever the abbreviation is also a football one.
 *
 * The Team tab's side filter is the root app's, and its table is football's: a
 * basketball G and C read as guard and centre, a volleyball S as a safety. Left
 * as initials, this page would offer a basketball squad an "Offense" chip. Any
 * school may paste initials and get the same, which is a wart worth knowing
 * about — but the demo is the one page whose job is to look like the product
 * working.
 */
const VOLLEYBALL = [
  player('1', 'Ava', 'Kovach', 'OH', '', { heightIn: ft(5, 10), grade: 'Sr' }),
  player('3', 'Claire', 'Hudak', 'Setter', '', { heightIn: ft(5, 7), grade: 'Jr' }),
  player('4', 'Emma', 'Rinehart', 'L', '', { heightIn: ft(5, 4), grade: 'So' }),
  player('5', 'Sophia', 'Dombrowski', 'MB', '', { heightIn: ft(6, 0), grade: 'Sr' }),
  player('7', 'Madison', 'Pavlik', 'OH', '', { heightIn: ft(5, 9), grade: 'Jr' }),
  player('8', 'Kylie', 'Sandor', 'DS', '', { heightIn: ft(5, 5), grade: 'So' }),
  player('9', 'Grace', 'Tomko', 'RS', '', { heightIn: ft(5, 10), grade: 'Sr' }),
  player('10', 'Abby', 'Fusco', 'Setter', '', { heightIn: ft(5, 6), grade: 'So' }),
  player('11', 'Natalie', 'Gorby', 'MB', '', { heightIn: ft(5, 11), grade: 'Jr' }),
  player('12', 'Hannah', 'Sferra', 'DS', '', { heightIn: ft(5, 4), grade: 'Fr' }),
  player('14', 'Brooke', 'Wasko', 'OH', '', { heightIn: ft(5, 8), grade: 'So' }),
  player('16', 'Olivia', 'Marsco', 'MB', '', { heightIn: ft(5, 11), grade: 'Fr' }),
];

/* A small school's guards are its skill players in the autumn, so half the
   basketball squad is on the football roster too. */
const BASKETBALL = [
  player('3', 'Owen', 'Carter', 'Guard', '', { heightIn: ft(5, 9), grade: 'Jr' }),
  player('4', 'Eli', 'Novak', 'Guard', '', { heightIn: ft(5, 8), grade: 'Sr' }),
  player('5', 'Nate', 'Pryor', 'Guard', '', { heightIn: ft(5, 11), grade: 'Jr' }),
  player('10', 'Jalen', 'Reyes', 'Guard', '', { heightIn: ft(6, 1), grade: 'So' }),
  player('11', 'Drew', 'Halloran', 'Forward', '', { heightIn: ft(6, 0), grade: 'Jr' }),
  player('13', 'Ryan', 'Kozlowski', 'Guard', '', { heightIn: ft(6, 0), grade: 'So' }),
  player('20', 'Aaron', 'Vrabel', 'Forward', '', { heightIn: ft(6, 3), grade: 'Sr' }),
  player('21', 'Tobias', 'Kerr', 'Forward', '', { heightIn: ft(6, 3), grade: 'Jr' }),
  player('23', 'Micah', 'Stanko', 'Forward', '', { heightIn: ft(6, 2), grade: 'So' }),
  player('30', 'Ben', 'Hritz', 'Center', '', { heightIn: ft(6, 6), grade: 'Sr' }),
  player('32', 'Lucas', 'Oravec', 'Forward', '', { heightIn: ft(6, 4), grade: 'Jr' }),
  player('44', 'Carter', 'Lisko', 'Center', '', { heightIn: ft(6, 5), grade: 'So' }),
];

// -------------------------------------------------------------- the schedules

/*
 * Volleyball: the conference twice over, Tuesdays and Thursdays from late
 * August. In season it is ten matches played and four to come — enough results
 * for a record and enough fixtures for the page to be about something — and
 * Millbrook loses three, because a demo where the school being sold to wins
 * everything reads as a brochure.
 */
const VB_TIME = '6:30 PM';
const VOLLEYBALL_SCHEDULE = autumnSchedule(
  [
    { opponent: ASHCOMBE, home: true, score: { us: 3, them: 0 } },
    { opponent: BELLHAVEN, home: false, score: { us: 1, them: 3 } },
    { opponent: CEDAR_RIDGE, home: true, score: { us: 3, them: 1 } },
    { opponent: 'Twin Lakes', home: false, score: { us: 3, them: 2 } },
    { opponent: ELMBROOK, home: true, score: { us: 3, them: 0 } },
    { opponent: MARLOW, home: false, score: { us: 2, them: 3 } },
    { opponent: 'Kirkwood Prep', home: true, score: { us: 3, them: 1 } },
    { opponent: ASHCOMBE, home: false, score: { us: 3, them: 1 } },
    { opponent: BELLHAVEN, home: true, score: { us: 0, them: 3 } },
    { opponent: CEDAR_RIDGE, home: false, score: { us: 3, them: 0 } },
    { opponent: ELMBROOK, home: false },
    { opponent: MARLOW, home: true },
    { opponent: 'Harmony Ridge', home: true },
    { opponent: 'Pinecrest Academy', home: false },
  ].map((f) => ({ ...f, time: VB_TIME })),
  // Thursdays are 0, -7, … and Tuesdays -2, -9, …; the first fixture is the
  // Tuesday twelve days on, which clears today however old the anchor is.
  [-30, -28, -23, -21, -16, -14, -9, -7, -2, 0, 12, 14, 19, 21],
  [4, 6, 11, 13, 18, 20, 25, 27, 32, 34, 39, 41, 46, 48],
);

/*
 * Basketball: Tuesdays and Fridays from the Friday after Thanksgiving, the
 * conference twice over with two non-league games, all fixtures — the hub says
 * "Starts in November", and the page under it agrees.
 */
const WINTER_MONTHS = SPORT_MONTHS.basketball;
const tipOff = seasonStart(11, 27, WINTER_MONTHS);
const hoops = (n) => iso(addDays(tipOff, n));
const BB_TIME = '7:30 PM';

const BASKETBALL_SCHEDULE = [
  row(hoops(0), 'Kirkwood Prep', true, BB_TIME),
  row(hoops(4), ASHCOMBE, false, BB_TIME),
  row(hoops(7), BELLHAVEN, true, BB_TIME),
  row(hoops(11), CEDAR_RIDGE, false, BB_TIME),
  row(hoops(14), ELMBROOK, true, BB_TIME),
  row(hoops(21), MARLOW, false, BB_TIME),
  row(hoops(25), 'Twin Lakes', true, BB_TIME),
  row(hoops(39), 'Harmony Ridge', true, BB_TIME),
  row(hoops(42), ASHCOMBE, true, BB_TIME),
  row(hoops(46), BELLHAVEN, false, BB_TIME),
  row(hoops(49), CEDAR_RIDGE, true, BB_TIME),
  row(hoops(53), ELMBROOK, false, BB_TIME),
  row(hoops(56), MARLOW, true, BB_TIME),
  row(hoops(63), 'Pinecrest Academy', false, BB_TIME),
  row(hoops(67), 'Stonebridge Central', true, BB_TIME),
  row(hoops(70), 'Twin Lakes', false, BB_TIME),
];

/** Ids have to be unique and stable; nothing reads them but React's keys. */
const withIds = (sport, players) =>
  players.map((p) => ({ id: `${sport}-${p.number}`, ...p }));

const sports = {
  // Football's fixtures and scores are in `seasons` above, as a real paid school's are in the directory.
  football: { players: withIds('football', FOOTBALL), schedule: null },
  volleyball: { players: withIds('volleyball', VOLLEYBALL), schedule: VOLLEYBALL_SCHEDULE },
  basketball: { players: withIds('basketball', BASKETBALL), schedule: BASKETBALL_SCHEDULE },
};

/** A season is named for the autumn it starts in — a basketball season labelled
 * 2026 plays its February games in 2027. */
const openedIn = new Date(`${VOLLEYBALL_SCHEDULE[0].date}T00:00:00Z`);
const SEASON_YEAR =
  openedIn.getUTCMonth() + 1 >= 7 ? openedIn.getUTCFullYear() : openedIn.getUTCFullYear() - 1;

const demo = {
  slug: SLUG,
  season: SEASON_YEAR,
  // The day this was made, so a test can hold the file to the month table as it
  // stood then rather than as it stands whenever the suite happens to run.
  generatedOn: iso(TODAY),
  school: { slug: SLUG, name: NAME, city: CITY },
  colors: { ground: GROUND, accent: ACCENT, text: TEXT, nickname: NICKNAME },
  logo: LOGO,
  // The order the hub is handed; sortSportsForNow reorders it by the calendar.
  sportNames: ['football', 'volleyball', 'basketball'],
  league: LEAGUE,
  seasons,
  sports,
  weather,
};

// ------------------------------------------------------------ the self-checks

/*
 * The first thing that must be true: every school here is invented and the
 * season agrees with itself.
 *
 * A slug that matched a real directory file would put an invented roster on a
 * real school's page, and a game that one side records as a win and the other
 * does not mirror would put two different scores in the League table and on the
 * rival's own schedule.
 */
const identityFaults = [];
for (const m of MEMBERS) {
  if (!m.slug.endsWith('-demo')) identityFaults.push(`${m.slug} does not say it is a demo`);
  if (realSlugs.has(m.slug)) identityFaults.push(`${m.slug} is a real school in public/oh/index.json`);
  if (existsSync(join(root, `public/oh/data/${m.slug}.json`))) {
    identityFaults.push(`${m.slug} has a real public/oh/data file`);
  }
}
for (const m of MEMBERS.slice(1)) {
  if (!seasons[SLUG].games.some((g) => g.opponentSlug === m.slug)) {
    identityFaults.push(`${NAME}'s schedule never meets ${m.slug}`);
  }
}
// The same game seen from both sides must be the same game.
for (const [slug, season] of Object.entries(seasons)) {
  for (const g of season.games) {
    if (!g.opponentSlug) continue;
    const back = seasons[g.opponentSlug].games.find((o) => o.week === g.week);
    const agrees =
      back &&
      back.opponentSlug === slug &&
      back.date === g.date &&
      back.home !== g.home &&
      (g.result ? back.result?.us === g.result.them && back.result?.them === g.result.us : !back.result);
    if (!agrees) identityFaults.push(`${slug} week ${g.week} disagrees with ${g.opponentSlug}`);
  }
}
if (LOGO.length > THEME_CEILING) {
  identityFaults.push(`the crest is ${LOGO.length} bytes, over the ${THEME_CEILING} theme ceiling`);
}
for (const [sport, s] of Object.entries(sports)) {
  if (!s.players.length) identityFaults.push(`${sport} has nobody on it`);
}
if (identityFaults.length) {
  for (const f of identityFaults) console.error(`  ${f}`);
  throw new Error('the demo does not describe an invented school that agrees with itself');
}

/*
 * The second: every scored match strictly in the past and every unscored one
 * ahead. This throws rather than warns — a demo.json that fails it is the exact
 * file this generator exists to stop being committed.
 */
const TODAY_ISO = iso(TODAY);
const dated = [];
for (const [sport, s] of Object.entries(sports)) {
  for (const r of s.schedule ?? []) dated.push([sport, r.date, !!r.score]);
}
for (const g of seasons[SLUG].games) dated.push(['football', g.date, !!g.result]);

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
 * The third: no sport may argue with the hub above it.
 *
 * The today-boundary above says nothing about which months a season lands in,
 * and on its own it would happily pass a run made in February — January results
 * and March fixtures under a volleyball tile reading "Starts in August". So each
 * sport is checked against the month table as well, and the check is different
 * either side of the sport's own season:
 *
 *  - out of season, the hub is saying the sport has not started. Nothing may
 *    carry a score, and every date must fall inside the sport's own months.
 *  - in season, the two dates a reader's eye actually lands on — the last
 *    result and the next fixture — must sit in the sport's months or the month
 *    either side of them. That tolerance is deliberate: a real autumn opens in
 *    the last week of August and can run a tournament into November, and
 *    refusing the shoulder would refuse a season nobody would look at twice.
 */
const MONTH_OF = (date) => Number(date.slice(5, 7));
const neighbours = (months) =>
  new Set(months.flatMap((m) => [m, (m % 12) + 1, ((m + 10) % 12) + 1]));

const bySport = new Map();
for (const [sport, date, scored] of dated) {
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

// ------------------------------------------------------------------ the stats

/*
 * A season of football stats for the invented squad, game by game.
 *
 * Made the way the season was played rather than as totals picked out of the
 * air, for two reasons. The player card subtracts one copy of the totals from
 * the next to show a week (src/maxpreps/weeks.ts), so the copies have to be
 * real running sums of real games. And a prospect who knows football will
 * check one against the other: Millbrook's touchdowns and kicks add up to the
 * points on its own schedule, every catch is a completion somebody threw, and
 * the long run is a run somebody made.
 *
 * The numbers come from a fixed seed, so a re-run on the same day writes the
 * same file and a diff shows only what the calendar moved.
 */

/* mulberry32: small, seedable, and enough for dice. */
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = seeded(2026);
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (weights) => {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [who, w] of weights) {
    r -= w;
    if (r < 0) return who;
  }
  return weights[weights.length - 1][0];
};

const byNumber = new Map(FOOTBALL.map((p) => [p.number, p]));
const nameOf = (number) => {
  const p = byNumber.get(number);
  if (!p) throw new Error(`#${number} is not on the football roster`);
  return `${p.firstName} ${p.lastName}`;
};

/* The fields scripts/maxpreps.mjs keeps per category, in the print page's order. */
const FIELDS = {
  passing: ['games', 'cmp', 'att', 'yds', 'cmpPct', 'ydsPerGame', 'td', 'int', 'lng', 'rating'],
  rushing: ['games', 'carries', 'yds', 'ydsPerCarry', 'ydsPerGame', 'lng', 'td'],
  receiving: ['games', 'rec', 'yds', 'ydsPerRec', 'ydsPerGame', 'lng', 'td'],
  defense: ['games', 'solo', 'assist', 'tackles', 'tfl', 'sacks', 'ff', 'fumRec', 'int'],
  kicking: ['games', 'xpMade', 'xpAtt', 'fgMade', 'fgAtt', 'lng', 'pts'],
  punting: ['games', 'punts', 'yds', 'ydsPerPunt', 'lng', 'in20'],
  kickReturn: ['games', 'returns', 'yds', 'ydsPerReturn', 'lng'],
  puntReturn: ['games', 'returns', 'yds', 'ydsPerReturn', 'lng'],
};
/* What adds up game to game — the same table src/maxpreps/weeks.ts subtracts with. */
const COUNTING = {
  passing: ['cmp', 'att', 'yds', 'td', 'int'],
  rushing: ['carries', 'yds', 'td'],
  receiving: ['rec', 'yds', 'td'],
  defense: ['tackles', 'solo', 'assist', 'sacks', 'tfl', 'int', 'ff', 'fumRec'],
  kicking: ['xpMade', 'xpAtt', 'fgMade', 'fgAtt', 'pts'],
  punting: ['punts', 'yds', 'in20'],
  kickReturn: ['returns', 'yds'],
  puntReturn: ['returns', 'yds'],
};
/* MaxPreps leaves a defender's empty columns blank rather than printing zeros,
   and the card prints whatever is there — "0 sacks" under every tackle line
   would be noise. */
const DEFENSE_OPTIONAL = new Set(['assist', 'tfl', 'sacks', 'ff', 'fumRec', 'int']);

/** One play's yards: mostly short, now and then a long one. */
const carryYards = () => {
  const r = rand();
  if (r < 0.04) return between(30, 64);
  if (r < 0.15) return between(10, 24);
  return between(-2, 9);
};
const catchYards = () => (rand() < 0.14 ? between(20, 58) : between(4, 17));

/** Defenders, by how often each makes a tackle in a game, and what else they do. */
const DEFENDERS = [
  ['44', 8.5, 'front'], ['33', 7, 'front'], ['22', 6, 'front'], ['10', 5.5, 'front'],
  ['24', 4, 'front'], ['20', 4.5, 'back'], ['50', 4, 'line'], ['55', 3.5, 'line'],
  ['75', 3.5, 'line'], ['88', 3, 'line'], ['15', 2.5, 'line'], ['64', 2, 'line'],
  ['21', 3, 'back'], ['3', 2.5, 'back'], ['8', 2.5, 'back'], ['1', 2, 'back'], ['14', 1.5, 'back'],
];
const RECEIVERS = [['3', 28], ['11', 22], ['13', 16], ['4', 12], ['7', 10], ['15', 6], ['5', 6]];
/* Carries per game for each back: a range, and how often he scores a rushing touchdown. */
const RUSHERS = [['24', 15, 22, 50], ['5', 6, 11, 20], ['12', 3, 8, 15], ['9', 2, 6, 10], ['6', 0, 4, 5]];

/** One game, as each player's counting numbers in each category plus his long plays. */
function playGame(us, them) {
  const line = new Map();
  const add = (number, category, values) => {
    const key = `${number}|${category}`;
    const now = line.get(key) ?? { number, category, values: {} };
    for (const [field, n] of Object.entries(values)) {
      now.values[field] = field === 'lng' ? Math.max(now.values[field] ?? 0, n) : (now.values[field] ?? 0) + n;
    }
    line.set(key, now);
  };

  // The points on the schedule, taken apart: every 7 a touchdown and its kick,
  // a 6 left over a touchdown whose kick missed, a 3 a field goal.
  let tds = Math.floor(us / 7);
  let rest = us % 7;
  let missed = 0;
  if (rest === 6) { tds += 1; missed = 1; rest = 0; }
  const fgs = Math.floor(rest / 3);
  if (rest % 3) throw new Error(`${us} points do not come apart into touchdowns and field goals`);

  // Touchdowns: about two in five through the air.
  let passTds = 0;
  let rushTds = 0;
  for (let i = 0; i < tds; i++) {
    if (rand() < 0.4) passTds += 1;
    else rushTds += 1;
  }

  // The quarterbacks. Owen Carter, the backup, throws in about a third of games.
  const throws = [['12', between(13, 23)]];
  if (rand() < 0.35) throws.push(['1', between(1, 4)]);
  throws.forEach(([qb, att], i) => {
    let cmp = Math.round(att * (0.48 + rand() * 0.2));
    const td = i === 0 ? passTds : 0;
    cmp = Math.max(cmp, td);
    let yds = 0;
    let lng = 0;
    const caught = [];
    for (let c = 0; c < cmp; c++) {
      const who = pick(RECEIVERS);
      const gain = catchYards();
      yds += gain;
      lng = Math.max(lng, gain);
      caught.push(who);
      add(who, 'receiving', { rec: 1, yds: gain, lng: gain });
    }
    // A touchdown goes to somebody who caught a ball in this game.
    for (let t = 0; t < td; t++) add(caught[between(0, caught.length - 1)], 'receiving', { td: 1 });
    const int = i === 0 ? (rand() < 0.3 ? 1 : 0) + (rand() < 0.08 ? 1 : 0) : 0;
    add(qb, 'passing', { cmp, att, yds, td, int, lng });
  });

  // The backs, and the rushing touchdowns among whoever carried.
  const carried = [];
  for (const [who, lo, hi, scoreWeight] of RUSHERS) {
    const carries = between(lo, hi);
    if (!carries) continue;
    let yds = 0;
    let lng = 0;
    for (let c = 0; c < carries; c++) {
      const gain = who === '12' ? between(-6, 12) : carryYards();
      yds += gain;
      lng = Math.max(lng, gain);
    }
    // A night of lost yardage is real football, but it would make a week on
    // the card a negative number and the season total go backwards, which the
    // check below refuses. A back who got nowhere is written as no gain.
    add(who, 'rushing', { carries, yds: Math.max(0, yds), lng });
    carried.push([who, scoreWeight]);
  }
  for (let t = 0; t < rushTds; t++) add(pick(carried), 'rushing', { td: 1 });

  // The kicker: every extra point tried, a missed one now and then, and a
  // field goal tried and missed in about a quarter of games.
  const fgLong = Array.from({ length: fgs }, () => between(22, 41));
  const fgAtt = fgs + (rand() < 0.25 ? 1 : 0);
  add('18', 'kicking', {
    xpMade: tds - missed,
    xpAtt: tds,
    fgMade: fgs,
    fgAtt,
    lng: fgLong.length ? Math.max(...fgLong) : 0,
    pts: tds - missed + 3 * fgs,
  });
  const punts = between(2, 5);
  let puntYds = 0;
  let puntLng = 0;
  let in20 = 0;
  for (let p = 0; p < punts; p++) {
    const y = between(27, 46);
    puntYds += y;
    puntLng = Math.max(puntLng, y);
    if (rand() < 0.25) in20 += 1;
  }
  add('18', 'punting', { punts, yds: puntYds, lng: puntLng, in20 });

  // Kickoffs come back after the other side scores.
  const kicks = Math.max(1, Math.round(them / 7)) + (rand() < 0.5 ? 1 : 0);
  for (let k = 0; k < kicks; k++) {
    const y = rand() < 0.08 ? between(40, 72) : between(10, 28);
    add(rand() < 0.6 ? '8' : '5', 'kickReturn', { returns: 1, yds: y, lng: y });
  }
  const puntBacks = between(0, 3);
  for (let p = 0; p < puntBacks; p++) {
    const y = between(0, 14);
    add('3', 'puntReturn', { returns: 1, yds: y, lng: y });
  }

  // The defense: tackles around each player's own rate, about three in five
  // of them made alone, and the rarer things by where he lines up.
  const theirPicks = between(0, 2) === 2 ? 1 : 0;
  for (const [who, rate, spot] of DEFENDERS) {
    const tackles = Math.max(0, Math.round(rate * (0.5 + rand())));
    if (!tackles) continue;
    const solo = Math.min(tackles, Math.round(tackles * (0.5 + rand() * 0.25)));
    const extra = {};
    if (spot !== 'back' && rand() < (spot === 'line' ? 0.35 : 0.3)) extra.tfl = between(1, 2);
    if (spot !== 'back' && rand() < (spot === 'line' ? 0.22 : 0.12)) extra.sacks = 1;
    if (rand() < 0.04) extra.ff = 1;
    if (rand() < 0.04) extra.fumRec = 1;
    add(who, 'defense', { solo, assist: tackles - solo, tackles, ...extra });
  }
  if (theirPicks) add(pick([['20', 3], ['21', 2], ['3', 2], ['1', 1], ['8', 1]]), 'defense', { int: 1 });

  return line;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** The NFL passer rating, which is the one MaxPreps prints. */
const passerRating = ({ cmp, att, yds, td, int }) => {
  if (!att) return 0;
  const clamp = (x) => Math.min(2.375, Math.max(0, x));
  const parts = [(cmp / att - 0.3) * 5, (yds / att - 3) * 0.25, (td / att) * 20, 2.375 - (int / att) * 25];
  return round1((parts.map(clamp).reduce((a, b) => a + b, 0) / 6) * 100);
};

/** Running totals as the print page shows them: counts, games, longs, and the averages worked out again. */
function totalsAfter(games) {
  const sums = new Map();
  for (const game of games) {
    for (const [key, { number, category, values }] of game) {
      const now = sums.get(key) ?? { number, category, games: 0, values: {} };
      now.games += 1;
      for (const [field, n] of Object.entries(values)) {
        now.values[field] = field === 'lng' ? Math.max(now.values[field] ?? 0, n) : (now.values[field] ?? 0) + n;
      }
      sums.set(key, now);
    }
  }
  const order = Object.keys(FIELDS);
  const rows = [...sums.values()].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || Number(a.number) - Number(b.number),
  );
  return rows.map(({ number, category, games: played, values: v }) => {
    const derived = {
      games: played,
      ydsPerGame: round1((v.yds ?? 0) / played),
      cmpPct: v.att ? round1((100 * v.cmp) / v.att) : 0,
      rating: passerRating({ td: 0, int: 0, ...v }),
      ydsPerCarry: v.carries ? round1(v.yds / v.carries) : 0,
      ydsPerRec: v.rec ? round1(v.yds / v.rec) : 0,
      ydsPerPunt: v.punts ? round1(v.yds / v.punts) : 0,
      ydsPerReturn: v.returns ? round1(v.yds / v.returns) : 0,
    };
    const values = {};
    for (const field of FIELDS[category]) {
      const n = field in v ? v[field] : field in derived ? derived[field] : 0;
      if (category === 'defense' && DEFENSE_OPTIONAL.has(field) && !n) continue;
      values[field] = n;
    }
    return { name: nameOf(number), number, category, values };
  });
}

/*
 * Only the games already played, in the order they were played. Out of season
 * that is none, and then there is no stats file at all: the app reads a missing
 * file as a school with no stats yet (no Stats tab, no season lines), which is
 * what a real school's page looks like before its first game.
 */
const playedGames = seasons[SLUG].games.filter((g) => g.result).sort((a, b) => a.week - b.week);
const gameLines = playedGames.map((g) => playGame(g.result.us, g.result.them));
const snapshots = gameLines.map((_, i) => ({ games: i + 1, rows: totalsAfter(gameLines.slice(0, i + 1)) }));

const STATS_PATH = `public/oh/stats/${SLUG}-football.json`;
const stats = playedGames.length
  ? {
      slug: SLUG,
      sport: 'football',
      // Printed under the tab as "Season stats from …". Not "MaxPreps": none of
      // this came from there, and the page should not say it did.
      source: 'Sample',
      // No day. The page carries the demo's season forward a week at a time
      // (src/oh/demo.ts) and nothing carries this file with it, so a baked date
      // would be "updated Oct 10" under a schedule showing games into November.
      // The tab prints the credit without a day when there is none.
      updated: '',
      games: playedGames.length,
      rows: snapshots[snapshots.length - 1].rows,
      snapshots,
    }
  : null;

/*
 * The fourth check, on the stats: that the page will show every row of them,
 * and that the player card's weeks can be worked out of them.
 *
 *  - every row is somebody on the football roster, by the exact name and
 *    number the page matches on (matchTeamStats in src/oh/teamStats.ts);
 *  - the season's games are the games Millbrook has played;
 *  - no copy of the totals goes down in any counting number, games or long
 *    play — a week is the difference of two copies, and a negative week is a
 *    file that was not made by playing games. The averages are left out of
 *    this: yards a carry can fall after a bad night, and should;
 *  - the file passes the rules src/oh/teamStats.ts reads it by.
 */
const statFaults = [];
if (stats) {
  const KNOWN = new Set(Object.keys(FIELDS));
  const shapeOk = (rows) =>
    rows.length > 0 &&
    rows.every(
      (r) =>
        typeof r.name === 'string' &&
        r.name.trim() &&
        typeof r.number === 'string' &&
        KNOWN.has(r.category) &&
        Object.keys(r.values).length > 0 &&
        Object.values(r.values).every((n) => typeof n === 'number' && Number.isFinite(n)),
    );
  if (!shapeOk(stats.rows)) statFaults.push('the totals are not rows the page would read');
  for (const s of stats.snapshots) {
    if (!Number.isInteger(s.games) || s.games < 1 || !shapeOk(s.rows)) {
      statFaults.push(`the copy after game ${s.games} is not one the page would read`);
    }
  }
  for (const r of [...stats.rows, ...stats.snapshots.flatMap((s) => s.rows)]) {
    const p = byNumber.get(r.number);
    if (!p || `${p.firstName} ${p.lastName}` !== r.name) {
      statFaults.push(`${r.name} #${r.number} is not on the football roster`);
    }
    if (r.values.games > stats.games) statFaults.push(`${r.name} has played more games than the team`);
  }
  if (stats.games !== PLAYED_WEEKS) {
    statFaults.push(`the stats cover ${stats.games} games and the season has ${PLAYED_WEEKS} played`);
  }
  const last = stats.snapshots[stats.snapshots.length - 1];
  if (last.games !== stats.games || JSON.stringify(last.rows) !== JSON.stringify(stats.rows)) {
    statFaults.push('the latest copy is not the season totals');
  }
  const value = (rows, r, field) =>
    rows.find((o) => o.name === r.name && o.category === r.category)?.values[field] ?? 0;
  for (let i = 1; i < stats.snapshots.length; i++) {
    const before = stats.snapshots[i - 1];
    const after = stats.snapshots[i];
    if (after.games <= before.games) statFaults.push(`copy ${i} does not move the games count on`);
    for (const r of before.rows) {
      for (const field of [...COUNTING[r.category], 'games', 'lng']) {
        if (value(after.rows, r, field) < value(before.rows, r, field)) {
          statFaults.push(`${r.name}'s ${r.category} ${field} goes down after game ${after.games}`);
        }
      }
    }
  }
  // Every point on the schedule is a kick or a touchdown somebody scored.
  const scored = playedGames.reduce((s, g) => s + g.result.us, 0);
  const sum = (category, field) =>
    stats.rows.filter((r) => r.category === category).reduce((s, r) => s + (r.values[field] ?? 0), 0);
  const touchdowns = sum('rushing', 'td') + sum('receiving', 'td');
  if (sum('passing', 'td') !== sum('receiving', 'td')) statFaults.push('passing and receiving touchdowns disagree');
  if (6 * touchdowns + sum('kicking', 'pts') !== scored) {
    statFaults.push(`the stats score ${6 * touchdowns + sum('kicking', 'pts')} points and the schedule ${scored}`);
  }
}
if (statFaults.length) {
  for (const f of statFaults) console.error(`  ${f}`);
  throw new Error('the sample stats do not describe the season the demo played');
}

// ------------------------------------------------------------------ writing

const out = join(root, 'public/oh/demo.json');
writeFileSync(out, `${JSON.stringify(demo, null, 2)}\n`);

const statsOut = join(root, STATS_PATH);
if (stats) {
  mkdirSync(dirname(statsOut), { recursive: true });
  // Indented by one, as scripts/maxpreps.mjs writes a real school's.
  writeFileSync(statsOut, `${JSON.stringify(stats, null, 1)}\n`);
} else {
  rmSync(statsOut, { force: true });
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const statSize = (s) => `${JSON.stringify(s, null, 1)}\n`.length;
const spread = (dates) =>
  dates.length ? `${dates[0]} → ${dates[dates.length - 1]} (${dates.length} games)` : 'none';

console.log(`wrote ${out}`);
console.log(`  ${NAME}, ${CITY} (${SLUG}); ${LEAGUE.name}, ${LEAGUE.members.length} rivals`);
console.log(`  crest ${kb(crestPng.length)} png, ${kb(LOGO.length)} as a data URI`);
for (const [sport, s] of Object.entries(sports)) {
  console.log(`  ${sport}: ${s.players.length} players, ${s.schedule?.length ?? 0} pasted rows`);
}
console.log(
  `  generated ${TODAY_ISO}; volleyball is ${VOLLEYBALL_LIVE ? `on, anchored on ${iso(ANCHOR)}` : 'off, so it is dated to the next autumn'}`,
);
console.log(`  played  ${spread(dated.filter(([, , s]) => s).map(([, d]) => d).sort())}`);
console.log(`  ahead   ${spread(dated.filter(([, , s]) => !s).map(([, d]) => d).sort())}`);
console.log(
  `  football: ${PLAYED_WEEKS} of ${TOTAL_WEEKS} played, ${NAME} ${seasons[SLUG].record.won}–${seasons[SLUG].record.lost}, last game ${WEEKS[TOTAL_WEEKS - 1]}`,
);
console.log(
  stats
    ? `  stats: ${stats.rows.length} rows over ${stats.games} games, ${stats.snapshots.length} copies, ${kb(statSize(stats))} → ${STATS_PATH}`
    : `  stats: none, nothing played yet (${STATS_PATH} removed)`,
);
/*
 * What the page does with this file from here on: src/oh/demo.ts moves a
 * schedule that has results forward by whole weeks at read time, within its own
 * sport's months, and leaves a schedule with nothing played where it is. Neither
 * keeps a season current past its own months, which is the reason to re-run
 * this twice a year.
 */
console.log('  the page carries played schedules forward by whole weeks, within their months;');
console.log('  re-run near the start of the autumn and again in December');
