/*
 * The demo school, written out as one file.
 *
 * Everything a prospect is shown at /oh/demo/ that a paid activation would
 * carry comes from public/oh/demo.json: the school's colors and crest, three
 * sample rosters, the volleyball and basketball schedules a seller would have
 * pasted, and the conference the seller would have typed in. It is generated
 * rather than hand-typed because the pieces have to agree with one another and
 * with the calendar — a volleyball score dated next week is the single most
 * visible way for this page to look broken.
 *
 * The school is Springfield (New Middletown), the first prospect, and the page
 * is built to match the video made for them: black and orange, the tiger crest,
 * Football / Volleyball / Basketball, #24 Marcus Bell on Lookup and MVAC Scarlet
 * on League. What the file does NOT carry is as deliberate as what it does:
 *
 *  - No football season. Springfield is a real school with a real directory
 *    file, public/oh/data/springfield-new-middletown.json, refreshed twice a
 *    week. The demo's football schedule, scores and standings are read from
 *    that file and its conference rivals' files, exactly as a paid page's are —
 *    so the one part of the demo an athletic director can check against what
 *    they know is the part that is true.
 *  - No forecast. The kickoff forecast comes from public/oh/weather.json like
 *    any paying school's, once the school is in paid-schools.json.
 *  - No stats. The video shows a stat block on the Lookup card; the app has no
 *    such thing, and a demo that promises it would be selling something that
 *    does not exist.
 *
 * The rosters are invented (the football one starts from the names the video
 * and its one-pager use), and the footer says so.
 *
 * Run by hand — `node scripts/build-demo.mjs` — then commit public/oh/demo.json.
 * It is not part of `npm run build` and must not become part of it: it resizes
 * a crest through sharp, and the guarded build has no business doing that.
 *
 * WHEN TO RE-RUN. The pasted schedules are anchored to the day the script runs,
 * so that a scored match is always in the past and an unplayed one always
 * ahead. src/oh/demo.ts carries those dates forward by whole weeks when the
 * page loads, so the split between played and coming stays where it was put.
 * What that cannot fix is the calendar itself: about six months on, the
 * volleyball season is reading March to May under a hub saying "Starts in
 * August". So this wants re-running twice a year, near the start of the autumn
 * and again around February, and before any demo that matters.
 * `DEMO_TODAY=2027-02-10 node scripts/build-demo.mjs` shows what it writes on a
 * day of your choosing. Football needs none of this — it is live.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

// ------------------------------------------------------------------ identity

/*
 * The real directory slug, which is the whole point of the change: with it,
 * every store function that is not answered out of this file — the season, the
 * League tab's member seasons, the forecast — falls through to the same files a
 * paid Springfield page would read.
 */
const SLUG = 'springfield-new-middletown';

/*
 * The name and town are the directory's, not ours. A paid page draws its
 * header from the directory and so does the demo; a display name typed here
 * would be one more thing that could disagree with the real page.
 */
const directorySeason = readJson(`public/oh/data/${SLUG}.json`);
const SCHOOL = directorySeason.school;

/* The video's two colors: its background and its accent. */
const GROUND = '#0e0c0b';
const ACCENT = '#f26722';

/*
 * MVAC Scarlet, by exact directory slug. Two Western Reserves exist in Ohio;
 * the one in this conference is Berlin Center's, which is the one Springfield's
 * own schedule links to.
 */
const MEMBERS = [
  'mcdonald-mcdonald',
  'jackson-milton-north-jackson',
  'campbell-memorial-campbell',
  'mineral-ridge-mineral-ridge',
  'lowellville-lowellville',
  'waterloo-atwater',
  'western-reserve-berlin-center',
];

const LEAGUE = { name: 'MVAC Scarlet', members: MEMBERS };

/* Names for the pasted schedules, taken from the directory so a volleyball
   opponent is spelled exactly as the football schedule spells it. */
const index = readJson('public/oh/index.json');
const directory = new Map((index.schools ?? index).map((s) => [s.slug, s]));
const nameOf = (slug) => directory.get(slug)?.name ?? slug;
const [MCDONALD, JACKSON_MILTON, CAMPBELL, MINERAL_RIDGE, LOWELLVILLE, WATERLOO, WESTERN_RESERVE] =
  MEMBERS.map(nameOf);

// ------------------------------------------------------------------- crest

/*
 * The crest from the video, sized the way the panel sizes an upload.
 *
 * src/oh/look.ts's resizeLogo centre-crops whatever the seller picks to a
 * 720-pixel square and re-encodes it as a JPEG at 0.85, and that is the string
 * a real activation stores. Doing the same here means the demo wears exactly
 * what Springfield's own page would wear once the seller uploads this file —
 * the white corners included, which is what an upload of it looks like.
 */
const WALLPAPER_PX = 720;
const crestJpeg = await sharp(join(root, 'docs/design/springfield-video/tigers-logo.png'))
  .resize(WALLPAPER_PX, WALLPAPER_PX, { fit: 'cover', position: 'centre' })
  .jpeg({ quality: 85 })
  .toBuffer();
const LOGO = `data:image/jpeg;base64,${crestJpeg.toString('base64')}`;

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
 * anchor itself. That matters to src/oh/demo.ts, which carries the file forward
 * whenever its last result is more than a week old: a last result the day
 * before a Friday anchor is eight days old on a Friday run, and the page would
 * move the whole file a week on its very first load — basketball included,
 * which is how a Christmas Day fixture appears.
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
 * Football starts from the video and its one-pager, name for name: #1 to #7 are
 * the Team tab the video scrolls past, #24 is the Lookup card it opens on, and
 * #10 to #15 are the one-pager's "double digits". The rest are invented, to make
 * a believable small-school varsity — most of it two-way, which is what a
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
  player('24', 'Marcus', 'Bell', 'RB/LB', '', { heightIn: ft(5, 11), weightLb: 195, grade: 'Sr' }),
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
 * Springfield loses three, because a demo where the school being sold to wins
 * everything reads as a brochure.
 */
const VB_TIME = '6:30 PM';
const VOLLEYBALL_SCHEDULE = autumnSchedule(
  [
    { opponent: LOWELLVILLE, home: true, score: { us: 3, them: 0 } },
    { opponent: MCDONALD, home: false, score: { us: 1, them: 3 } },
    { opponent: WATERLOO, home: true, score: { us: 3, them: 1 } },
    { opponent: MINERAL_RIDGE, home: false, score: { us: 3, them: 2 } },
    { opponent: CAMPBELL, home: true, score: { us: 3, them: 0 } },
    { opponent: JACKSON_MILTON, home: false, score: { us: 2, them: 3 } },
    { opponent: WESTERN_RESERVE, home: true, score: { us: 3, them: 1 } },
    { opponent: LOWELLVILLE, home: false, score: { us: 3, them: 1 } },
    { opponent: MCDONALD, home: true, score: { us: 0, them: 3 } },
    { opponent: WATERLOO, home: false, score: { us: 3, them: 0 } },
    { opponent: MINERAL_RIDGE, home: true },
    { opponent: CAMPBELL, home: false },
    { opponent: JACKSON_MILTON, home: true },
    { opponent: WESTERN_RESERVE, home: false },
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
  row(hoops(0), 'Brookfield', true, BB_TIME),
  row(hoops(4), LOWELLVILLE, false, BB_TIME),
  row(hoops(7), MCDONALD, true, BB_TIME),
  row(hoops(11), WATERLOO, false, BB_TIME),
  row(hoops(14), MINERAL_RIDGE, true, BB_TIME),
  row(hoops(21), CAMPBELL, false, BB_TIME),
  row(hoops(25), 'Lakeview', true, BB_TIME),
  row(hoops(39), JACKSON_MILTON, true, BB_TIME),
  row(hoops(42), WESTERN_RESERVE, false, BB_TIME),
  row(hoops(46), LOWELLVILLE, true, BB_TIME),
  row(hoops(49), MCDONALD, false, BB_TIME),
  row(hoops(53), WATERLOO, true, BB_TIME),
  row(hoops(56), MINERAL_RIDGE, false, BB_TIME),
  row(hoops(63), CAMPBELL, true, BB_TIME),
  row(hoops(67), JACKSON_MILTON, false, BB_TIME),
  row(hoops(70), WESTERN_RESERVE, true, BB_TIME),
];

/** Ids have to be unique and stable; nothing reads them but React's keys. */
const withIds = (sport, players) =>
  players.map((p) => ({ id: `${sport}-${p.number}`, ...p }));

const sports = {
  // Football's fixtures and scores are the directory's — the same arrangement a
  // real paid school has, where the directory feeds football and nothing else.
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
  school: SCHOOL,
  colors: { ground: GROUND, accent: ACCENT },
  logo: LOGO,
  // The order the hub is handed; sortSportsForNow reorders it by the calendar.
  sportNames: ['football', 'volleyball', 'basketball'],
  league: LEAGUE,
  sports,
};

// ------------------------------------------------------------ the self-checks

/*
 * The first thing that must be true: this is the school it says it is, in the
 * conference it says it is in.
 *
 * Football, the standings and the forecast are all read from the directory by
 * slug, so a slug that does not resolve is a demo with an empty League tab. And
 * a member Springfield does not actually play would sit in the table at 0–0
 * against the school being sold to, which reads as a mistake to exactly the
 * people who would know.
 */
const identityFaults = [];
if (SCHOOL?.slug !== SLUG) identityFaults.push(`${SLUG}'s directory file names ${SCHOOL?.slug}`);
for (const slug of MEMBERS) {
  if (!directory.has(slug)) identityFaults.push(`${slug} is not in public/oh/index.json`);
  if (!existsSync(join(root, `public/oh/data/${slug}.json`))) {
    identityFaults.push(`${slug} has no public/oh/data file`);
  }
  if (!directorySeason.games.some((g) => g.opponentSlug === slug)) {
    identityFaults.push(`${SCHOOL.name}'s schedule never meets ${slug}`);
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
  throw new Error('the demo does not describe the school it names');
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

const out = join(root, 'public/oh/demo.json');
writeFileSync(out, `${JSON.stringify(demo, null, 2)}\n`);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const spread = (dates) =>
  dates.length ? `${dates[0]} → ${dates[dates.length - 1]} (${dates.length} games)` : 'none';

console.log(`wrote ${out}`);
console.log(`  ${SCHOOL.name}, ${SCHOOL.city} (${SLUG}); ${LEAGUE.name}, ${MEMBERS.length} rivals`);
console.log(`  crest ${kb(crestJpeg.length)} jpeg, ${kb(LOGO.length)} as a data URI`);
for (const [sport, s] of Object.entries(sports)) {
  console.log(`  ${sport}: ${s.players.length} players, ${s.schedule?.length ?? 0} pasted rows`);
}
console.log(
  `  generated ${TODAY_ISO}; volleyball is ${VOLLEYBALL_LIVE ? `on, anchored on ${iso(ANCHOR)}` : 'off, so it is dated to the next autumn'}`,
);
console.log(`  played  ${spread(dated.filter(([, , s]) => s).map(([, d]) => d).sort())}`);
console.log(`  ahead   ${spread(dated.filter(([, , s]) => !s).map(([, d]) => d).sort())}`);
console.log(`  football is ${directorySeason.record.won}–${directorySeason.record.lost} in the directory today, and stays live`);
/*
 * What the page does with this file from here on: src/oh/demo.ts moves the
 * pasted dates forward by whole weeks at read time, so the split between played
 * and coming stays where it was put. It cannot keep a season in its own months,
 * which is the reason to re-run this twice a year.
 */
console.log('  the page carries the pasted dates forward by whole weeks as it ages;');
console.log('  re-run about every six months, so each season stays in its own months');
