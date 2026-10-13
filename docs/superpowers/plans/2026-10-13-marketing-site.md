# Marketing Site and Fictional Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put `/oh/demo/` back on an invented school, then build a one-page static marketing site for Roster in scottforge.ai's design, ready to deploy at `getroster.scottforge.ai`.

**Architecture:** Part 1 changes only the demo's data and labels: `src/oh/demo.ts` and `src/oh/store.ts` already serve baked seasons and a baked forecast when `public/oh/demo.json` carries them, so the generator goes back to baking football for a fictional conference and the app code changes by one constant and some comments. Part 2 is a plain `marketing/` folder (HTML, CSS, images) that no Vite pass reads, pinned by one vitest file that reads it from disk.

**Tech Stack:** Node 22 ESM scripts, sharp (already a devDependency), vitest, TypeScript, plain HTML/CSS, Google Fonts, Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-13-marketing-site-design.md`

## Global Constraints

- **Poland must not change.** `npm run build` ends with `scripts/check-untouched.mjs`; it must pass with `scripts/untouched-baseline.json` untouched: three guarded pages byte-identical, precache exactly 32 entries. Never edit the baseline. Never edit `src/styles.css`.
- Nothing under `src/oh/` imports `src/share`, `src/screens`, `src/theme` or `src/App.tsx`.
- `marketing/` gains no dependency on the app's build, and the app's build gains none on it. `package.json` and `package-lock.json` do not change.
- Tests pass env-free (no Supabase vars). `npx vitest run` and `npx tsc --noEmit` are clean after every task.
- Tests must not read anything out of `public/oh/data/*.json` beyond "this file exists" — a cron job rewrites those files on main with no test step.
- The demo school is **Harlow Valley**, slug `harlow-valley-demo`, city `Harlow`, ground `#2f1466`, accent `#f5b63d`. Rivals: `ashcombe-demo`, `bellhaven-demo`, `cedar-ridge-demo`, `elmbrook-demo`, `marlow-central-demo`. Conference name: `Riverbend Athletic Conference`. Every demo slug ends in `-demo`.
- The real Springfield page (`/oh/springfield`, `public/oh/data/springfield-new-middletown.json`) is not touched and shows no invented player.
- Site address `https://getroster.scottforge.ai`. Demo `https://roster.scottforge.ai/oh/demo/`. Directory `https://roster.scottforge.ai/oh/`. Privacy `https://roster.scottforge.ai/oh/?privacy`. Email `tom@scottforge.ai`, mailto subject `Roster for our school`.
- Prices: One team `$400` / season. Whole school `$1,200` / year. District `Custom`. First season free.
- The site never says: `Hudl`, `MaxPreps`, `stats`, `Region`, `rSchoolToday`, `ArbiterGame`, `DragonFly`, `Presented by`, `sponsor`, `Springfield`, `Tigers`.
- User-facing copy uses typographic apostrophes and quotes (’ “ ”), second person, and “I” for Tom.
- Comments are prose explaining why, at the repo's density. Commit messages are plain sentences saying why, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All work happens on branch `marketing-site`.

## Review Focus

1. **The demo opened three weeks after it was generated, late in the football season.** A reader expects last Friday's game under Played and next Friday's under Coming up. `demo.ts` refuses to carry a sport out of its own months, so a season generated with its last game in mid-November goes stale early. Pinned in Task 1 (generator places the season by the real calendar) and Task 2 (test: football's split still lands on today 21 days on).
2. **An invented slug that turns out to be a real school.** Expected: the generator refuses to write. Pinned in Task 1 (self-check) and Task 2 (test against `public/oh/index.json`, existence only).
3. **The demo opened with no signal after first load, or on a network that blocks the directory.** Expected: every tab still draws. Pinned in Task 2 (test: in demo mode no fetch is made for `/oh/data/` or `/oh/weather.json`).
4. **The marketing page on a 320px phone.** Expected: no sideways scroll, price cards stacked, buttons tappable. Pinned in Task 6 (browser check at 375 and 320).
5. **A reader with no mail program set up clicks “Email Tom”.** Expected: the address is also readable on the page so it can be copied. Pinned in Task 4 (test: the address appears as visible text, not only in an `href`).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `scripts/build-demo.mjs` | Generates `public/oh/demo.json` for the fictional school | Modify |
| `public/oh/demo.json` | The committed demo data | Regenerate |
| `src/oh/demo.ts` | `DEMO_SLUG` and comments | Modify |
| `src/oh/store.ts` | Two comments | Modify |
| `src/oh/School.tsx` | The demo footer note | Modify |
| `oh/demo/index.html` | Demo page title, description, theme-color | Modify |
| `src/oh/demo.test.ts` | Pins the committed file and the store in demo mode | Modify |
| `paid-schools.json` | Springfield comes out | Modify |
| `marketing/index.html` | The page | Create |
| `marketing/site.css` | Its styles | Create |
| `marketing/favicon.svg` | Tab icon | Create |
| `marketing/img/*.webp` | Four phone screenshots and one share image | Create |
| `src/marketing/site.test.ts` | Pins links, prices, forbidden words, images | Create |
| `scripts/shoot-marketing.mjs` | Takes the screenshots from a built preview | Create |
| `.claude/launch.json` | A `marketing` preview server | Modify |
| `docs/selling.md`, `README.md`, `CLAUDE.md` | Price, demo, second Pages project | Modify |

---

## Part 1 — the demo becomes fictional

### Task 1: The generator writes Harlow Valley, football included

**Files:**
- Modify: `scripts/build-demo.mjs`
- Regenerate: `public/oh/demo.json`
- Reference (read-only): `git show f5eb0d5^:scripts/build-demo.mjs` — the last fully fictional generator

**Interfaces:**
- Produces: `public/oh/demo.json` with keys `slug`, `season`, `generatedOn`, `school {slug,name,city}`, `colors {ground,accent}`, `logo` (a `data:image/png;base64,` URI), `sportNames ['football','volleyball','basketball']`, `league {name, members: string[5]}`, `seasons` (six entries keyed by slug, each `{school, games, record}`), `sports` (three entries), `weather {date, code, tempF, precipChance, windMph, day, at}`.
- A season's game is `{week, date, kickoff, home, opponent, opponentCity, opponentSlug, result?}` with `result {us, them, won}`.

- [ ] **Step 1: Replace the header comment and the identity block**

Rewrite the file's opening comment so it describes a fictional school whose football is baked (keep the "Run by hand", "not part of npm run build" and "WHEN TO RE-RUN" paragraphs, changing "Football needs none of this — it is live" to say football is baked and re-run with the rest). Then replace everything from `const SLUG =` down to the end of the `MCDONALD, JACKSON_MILTON…` destructuring with:

```js
const SLUG = 'harlow-valley-demo';
const NAME = 'Harlow Valley';
const CITY = 'Harlow';

/*
 * A deep violet ground with a bright gold on it. look.ts builds the whole page
 * out of these two by mixing toward white, so a ground with real chroma gives
 * the hub's bands something to be, where a near-black leaves them all one dark.
 */
const GROUND = '#2f1466';
const ACCENT = '#f5b63d';

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
```

Remove the now-unused `directorySeason`, `SCHOOL`, `directory` and `nameOf`.

- [ ] **Step 2: Replace the crest block**

Delete the whole tiger-crest block (from `const WALLPAPER_PX` through `const LOGO = …jpeg…`) and put this in its place. Keep `THEME_CEILING`.

```js
/**
 * A monogram roundel, rasterized to PNG.
 *
 * PNG rather than SVG because rosterStore.ts's LOGO_DATA_URI accepts only
 * raster types — the value is substituted into a CSS url(), and the narrow
 * alphabet is what makes that safe. The letters are paths rather than <text>
 * so the output does not depend on the fonts of the machine that runs this.
 */
const crestSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="${ACCENT}"/>
  <circle cx="256" cy="256" r="230" fill="${GROUND}"/>
  <circle cx="256" cy="256" r="206" fill="none" stroke="${ACCENT}" stroke-width="9"/>
  <g fill="${ACCENT}">
    <path d="M117 150 h38 v72 h48 v-72 h38 v212 h-38 v-100 h-48 v100 h-38 z"/>
    <path d="M257 150 h42 l27 148 l27 -148 h42 l-48 212 h-42 z"/>
  </g>
</svg>`;

// Two colors and an edge, so a palette costs nothing and keeps the string
// small — it is inlined in a committed JSON and again in a CSS custom property.
const crestPng = await sharp(Buffer.from(crestSvg))
  .png({ palette: true, colors: 32, compressionLevel: 9 })
  .toBuffer();
const LOGO = `data:image/png;base64,${crestPng.toString('base64')}`;
```

- [ ] **Step 3: Add football's calendar after the existing `nextAutumnOpener` / `AUTUMN_OPENER` definitions**

`SPORT_MONTHS` already has a `football` row; leave that table alone. Add:

```js
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
 * reads as a brochure, so Harlow Valley loses one here and two outside.
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
```

- [ ] **Step 4: Point the squads and pasted schedules at the invented schools**

In `FOOTBALL`, change the comment above it to say the names are invented (drop every mention of the video and one-pager) and change #24 to:

```js
  player('24', 'Darius', 'Cole', 'RB/LB', '', { heightIn: ft(5, 11), weightLb: 195, grade: 'Sr' }),
```

Replace the `VOLLEYBALL_SCHEDULE` fixture list (keep `VB_TIME`, both offset arrays and the `.map` that adds the time) with:

```js
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
```

Replace the sixteen `BASKETBALL_SCHEDULE` rows, keeping the same `hoops(n)` offsets in the same order (0, 4, 7, 11, 14, 21, 25, 39, 42, 46, 49, 53, 56, 63, 67, 70), with these opponents and home flags in order: `'Kirkwood Prep'` home, `ASHCOMBE` away, `BELLHAVEN` home, `CEDAR_RIDGE` away, `ELMBROOK` home, `MARLOW` away, `'Twin Lakes'` home, `'Harmony Ridge'` home, `ASHCOMBE` home, `BELLHAVEN` away, `CEDAR_RIDGE` home, `ELMBROOK` away, `MARLOW` home, `'Pinecrest Academy'` away, `'Stonebridge Central'` home, `'Twin Lakes'` away.

Reword the two schedule comments: "Springfield loses three" becomes "Harlow Valley loses three"; "the conference twice over" stays true for both.

- [ ] **Step 5: Write the baked pieces into the file object**

In the `demo` object: `school: { slug: SLUG, name: NAME, city: CITY }`, and add `seasons,` before `sports,` and `weather,` after it. Change the comment on `sports.football` to "Football's fixtures and scores are in `seasons` above, as a real paid school's are in the directory."

`SEASON_YEAR` is currently derived from `VOLLEYBALL_SCHEDULE[0].date`; leave it.

- [ ] **Step 6: Replace the identity self-check and extend the today check**

Replace the whole `identityFaults` block with:

```js
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
```

In the "second" check, feed football into `dated` so the today-boundary and the month-table check both cover it:

```js
for (const g of seasons[SLUG].games) dated.push(['football', g.date, !!g.result]);
```

(One school's games are enough for the calendar check; the both-sides check above covers the rivals.)

In the closing `console.log` lines, replace the `${SCHOOL.name}, ${SCHOOL.city}` line with `${NAME}, ${CITY}`, the crest line with `crest ${kb(crestPng.length)} png`, and the last "football is … in the directory" line with:

```js
console.log(
  `  football: ${PLAYED_WEEKS} of ${TOTAL_WEEKS} played, ${NAME} ${seasons[SLUG].record.won}–${seasons[SLUG].record.lost}, last game ${WEEKS[TOTAL_WEEKS - 1]}`,
);
```

- [ ] **Step 7: Run it for today and for three other days**

```bash
node scripts/build-demo.mjs
DEMO_TODAY=2027-02-10 node scripts/build-demo.mjs
DEMO_TODAY=2027-08-05 node scripts/build-demo.mjs
DEMO_TODAY=2027-11-28 node scripts/build-demo.mjs
node scripts/build-demo.mjs
```

Expected: every run prints `wrote …demo.json` and throws nothing. February: football `0 of 10 played`, first week in late August 2027. Early August: `1 of 10 played`. Late November: `9 of 10 played`. Today (2026-10-13): `8 of 10 played`, last game `2026-10-23`. The final run leaves today's file on disk.

- [ ] **Step 8: Commit**

```bash
git add scripts/build-demo.mjs public/oh/demo.json
git commit -m "Put the demo back on an invented school, with its own football season baked in

A public site is about to send everyone to /oh/demo/, and invented players do not belong on the real Springfield's page in front of strangers. The football season is placed by the real calendar so the page has the rest of the autumn to carry itself forward in.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`src/oh/demo.test.ts` is red after this commit; Task 2 turns it green.

---

### Task 2: The app names the new school, and the tests pin the baked file

**Files:**
- Modify: `src/oh/demo.ts` (line 33 and comments at 1–13, 50–56, 219–223, 364–366)
- Modify: `src/oh/store.ts` (comments at ~184–190 and ~250–252)
- Modify: `src/oh/School.tsx` (~593–608)
- Modify: `oh/demo/index.html` (lines 9–14)
- Modify: `paid-schools.json`
- Test: `src/oh/demo.test.ts`

**Interfaces:**
- Consumes: `public/oh/demo.json` as Task 1 wrote it.
- Produces: `DEMO_SLUG === 'harlow-valley-demo'`.

- [ ] **Step 1: Rewrite the tests that describe Springfield**

In `src/oh/demo.test.ts`:

Replace the `MVAC_SCARLET` constant with:

```ts
/** The invented conference, by the slugs the generator gives it. */
const RIVALS = [
  'ashcombe-demo',
  'bellhaven-demo',
  'cedar-ridge-demo',
  'elmbrook-demo',
  'marlow-central-demo',
];
```

In the `load` helper, record every URL asked for so a test can prove what was never fetched. Add `const asked: string[] = [];` beside `jar`, push `path` as the first line inside the fetch stub, and expose it with `vi.stubGlobal('__asked', asked);`. Rewrite the comment above `load` to say the demo file answers everything and the directory is there only to prove it is not asked.

Replace the first four tests of `describe('the committed file')` — "reads as the Springfield demo…", "wears the video’s colors…", "bakes no season and no forecast…", "names MVAC Scarlet…" — with:

```ts
  it('reads as Harlow Valley, a school that does not exist, with three sports', async () => {
    const { loadDemo, DEMO_SLUG } = await load(committed());
    const demo = await loadDemo();

    expect(demo).not.toBeNull();
    expect(DEMO_SLUG).toBe('harlow-valley-demo');
    expect(demo!.slug).toBe(DEMO_SLUG);
    expect(demo!.school).toEqual({ slug: DEMO_SLUG, name: 'Harlow Valley', city: 'Harlow' });
    expect(demo!.sportNames).toEqual(['football', 'volleyball', 'basketball']);
    for (const sport of demo!.sportNames) {
      expect(demo!.sports[sport].players.length).toBeGreaterThan(0);
    }
  });

  it('wears its own colors and a crest the database would have accepted', () => {
    const raw = committed() as { colors: unknown; logo: string };
    expect(raw.colors).toEqual({ ground: '#2f1466', accent: '#f5b63d' });
    expect(raw.logo).toMatch(/^data:image\/png;base64,/);
    expect(raw.logo.length).toBeLessThan(500_000);
  });

  /*
   * Existence only, never contents: the directory's files are rewritten by a
   * cron job with no test step. What matters is that nothing invented here is
   * a school somebody actually attends.
   */
  it('borrows no real school', () => {
    const raw = committed() as { slug: string; league: { name: string; members: string[] } };
    expect(raw.league.name).toBe('Riverbend Athletic Conference');
    expect([...raw.league.members].sort()).toEqual([...RIVALS].sort());

    const real = new Set(directoryIndex().schools.map((s) => s.slug));
    for (const slug of [raw.slug, ...raw.league.members]) {
      expect(slug.endsWith('-demo'), slug).toBe(true);
      expect(real.has(slug), slug).toBe(false);
      expect(existsSync(dataFile(slug)), slug).toBe(false);
    }
    expect(JSON.stringify(raw)).not.toMatch(/springfield|tigers|marcus bell/i);
  });

  /*
   * A fictional school has no directory file, so everything the football tabs
   * draw has to be in this one: the school's season, every rival's, and a
   * forecast on the next fixture.
   */
  it('bakes the whole conference’s football, each game the same from both sides', async () => {
    const { loadDemo, demoSeason, demoWeather, DEMO_SLUG } = await load(committed());
    const demo = await loadDemo();
    const members = [DEMO_SLUG, ...RIVALS];

    for (const slug of members) {
      const season = await demoSeason(slug);
      expect(season, slug).not.toBeNull();
      expect(season!.school.slug).toBe(slug);
      expect(season!.games).toHaveLength(10);
      const played = season!.games.filter((g) => g.result);
      expect(season!.record).toEqual({
        won: played.filter((g) => g.result!.won).length,
        lost: played.filter((g) => !g.result!.won).length,
        played: played.length,
      });
      for (const g of season!.games) {
        if (!g.opponentSlug) continue;
        const back = demo!.seasons[g.opponentSlug].games.find((o) => o.week === g.week)!;
        expect(back.opponentSlug, `${slug} week ${g.week}`).toBe(slug);
        expect(back.date).toBe(g.date);
        expect(back.home).toBe(!g.home);
        expect(back.result?.us).toBe(g.result?.them);
        expect(back.result?.them).toBe(g.result?.us);
      }
    }

    const mine = (await demoSeason(DEMO_SLUG))!;
    for (const rival of RIVALS) {
      expect(mine.games.some((g) => g.opponentSlug === rival), rival).toBe(true);
    }
    expect(demo!.sports.football.schedule).toBeNull();

    // The forecast belongs to the next unplayed game and to nobody else.
    const next = mine.games.find((g) => !g.result);
    const forecast = await demoWeather(DEMO_SLUG);
    if (next) expect(forecast!.date).toBe(next.date);
    expect(await demoWeather(RIVALS[0])).toBeNull();
  });
```

In "puts the video’s players on the football roster, and no stats on anybody": rename it `'fields a believable football squad, and no stats on anybody'`, delete the `byNumber.get('24')` assertion and the whole `named` table and its loop, keep the rest.

Replace "pastes the whole conference into both schedules, twice" with:

```ts
  it('pastes the whole conference into both schedules, twice', async () => {
    const { loadDemo } = await load(committed());
    const demo = (await loadDemo())!;
    const names = RIVALS.map((slug) => demo.seasons[slug].school.name);
    for (const sport of ['volleyball', 'basketball']) {
      const opponents = demo.sports[sport].schedule!.map((r) => r.opponent);
      for (const name of names) {
        expect(opponents.filter((o) => o === name), `${sport} ${name}`).toHaveLength(2);
      }
    }
  });
```

In "never writes a season the hub would contradict", after the loop over `raw.sports`, add the same rule for football read from `seasons`:

```ts
    const football = (raw as unknown as {
      slug: string;
      seasons: Record<string, { games: Array<{ date: string; result?: unknown }> }>;
    });
    for (const g of football.seasons[football.slug].games) {
      if (inSeason('football', month)) continue;
      expect(!!g.result, `football ${g.date}`).toBe(false);
      expect(inSeason('football', Number(g.date.slice(5, 7))), `football ${g.date}`).toBe(true);
    }
```

In `describe('the calendar, weeks after it was written')`:

- In "carries a baked season and its forecast along together", change the grafted school to `{ slug: base.slug, name: 'Harlow Valley', city: 'Harlow' }` and the opening comment to "Grafted over what the file bakes, so the dates are the test's own."
- Add this test (Review Focus 1):

```ts
  it('keeps football’s split on today for three weeks after it was written', async () => {
    const { demo, shiftToNow } = await asWritten();
    const hadResults = demo.seasons[demo.slug].games.some((g) => g.result);
    for (const days of [8, 15, 22]) {
      const today = later(days);
      const games = shiftToNow(demo, day(today)).seasons[demo.slug].games;
      if (!hadResults) continue; // written out of season: nothing to carry
      const played = games.filter((g) => g.result).map((g) => g.date);
      const ahead = games.filter((g) => !g.result).map((g) => g.date);
      expect(played.every((d) => d < today), `+${days} played`).toBe(true);
      expect(ahead.every((d) => d >= today), `+${days} ahead`).toBe(true);
    }
  });
```

If this fails only because the file was generated in the last week of November (nine played, the tenth game already at the month's edge), that is the documented December re-run and not a bug; guard the assertion with `if (Number(born().slice(5, 7)) === 11 && Number(born().slice(8, 10)) > 7) return;` and say why in a comment.

In `describe('the store, in demo mode')`:

Replace "reads the season and the forecast from the directory, as a paid page does" with (Review Focus 3):

```ts
  it('serves the season and the forecast from the file, and asks the directory for nothing', async () => {
    await load(committed(), {}, { 'harlow-valley-demo': { date: '2026-01-01' } });
    const { DEMO_SLUG, store } = await stores();
    localStorage.setItem('oh.school', DEMO_SLUG);

    const season = await store.loadSeason(DEMO_SLUG);
    expect(season.school).toEqual({ slug: DEMO_SLUG, name: 'Harlow Valley', city: 'Harlow' });
    for (const rival of RIVALS) {
      expect((await store.loadSeason(rival)).school.slug).toBe(rival);
    }
    const forecast = await store.loadWeather(DEMO_SLUG);
    expect(forecast).not.toBeNull();
    expect(forecast!.date).not.toBe('2026-01-01');

    const asked = (globalThis as unknown as { __asked: string[] }).__asked;
    expect(asked.filter((p) => p.startsWith('/oh/data/'))).toEqual([]);
    expect(asked).not.toContain('/oh/weather.json');

    // And leaves nothing behind: a prospect's visit is not a school followed.
    store.rememberLeagueTable(DEMO_SLUG, 'members', []);
    for (const jar of ['season', 'weather', 'league']) {
      expect(localStorage.getItem(`oh.${jar}.${DEMO_SLUG}`), jar).toBeNull();
    }
  });
```

Rename "fills the whole MVAC Scarlet table from the directory, so the League tab draws" to `'fills the whole conference table from the file, so the League tab draws'`, keep its body, and add at the end:

```ts
    expect(rows).toHaveLength(6);
```

- [ ] **Step 2: Run the tests to see them fail for the right reason**

Run: `npx vitest run src/oh/demo.test.ts`
Expected: FAIL — `expected 'springfield-new-middletown' to be 'harlow-valley-demo'` among others.

- [ ] **Step 3: Change the constant and the words around it**

`src/oh/demo.ts` line 33 and its comment:

```ts
/** The one school this page is about. Suffixed so it can never collide with a
 * real directory slug: the school is invented, and so is its conference. */
export const DEMO_SLUG = 'harlow-valley-demo';
```

Rewrite the module's opening paragraph (lines 4–10) to:

```ts
 * /oh/demo/ is a page a seller can hand a prospect, and the page the marketing
 * site sends strangers to: Harlow Valley, a school that does not exist, as it
 * would look the day it signed up. The committed file carries everything —
 * colors, crest, sample rosters, pasted volleyball and basketball schedules,
 * the conference, and the football seasons of the school and its five invented
 * rivals — so the page asks the directory and the database for nothing.
```

Rewrite the `seasons` field comment (50–55) to: "The football season of the demo school and of every conference member, so the League tab folds out of baked results the way it folds out of the directory." Rewrite the paragraph at 219–223 to drop "(the Springfield file has none…)". Rewrite the `demoSeason` doc comment to: "The demo school's season or a conference member's. Null for any other slug, which lets the caller go on as it always has."

`src/oh/store.ts`: in the `loadSeason` comment drop "— which for the Springfield demo is everything, so its football and its whole League tab are the directory's real seasons" and end the sentence at "untouched." In `loadWeather`, replace the three-line comment with: "The demo's forecast is baked beside its fixtures. A demo file that bakes none falls through to the real one."

`src/oh/School.tsx`: replace the comment and the note with:

```tsx
  /*
   * One quiet line saying what this is.
   *
   * A stranger looking at Harlow Valley has to be able to tell at a glance
   * that all of it is invented. It sits in the footer in the muted voice the
   * rest of the small print uses — the pitch is that this looks like a real
   * page, and a banner across the screen would spend the pitch to make the
   * point.
   */
  const demoNote = isDemo() ? (
    <p className="oh-demo-note">Sample school, players, schedules and scores.</p>
  ) : null;
```

`oh/demo/index.html`:

```html
    <meta name="theme-color" content="#2f1466" />
    <meta
      name="description"
      content="A sample school page — rosters, schedules, scores and standings, as a school gets them when it signs up."
    />
    <title>Harlow Valley — a demo</title>
```

`paid-schools.json`:

```json
{"slugs":["strasburg-franklin-strasburg"]}
```

- [ ] **Step 4: Run everything**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all green, no type errors. If a test elsewhere names `springfield-new-middletown` (`src/oh/link.test.ts`, `src/oh/redirects.test.ts`), leave it: those are about the real school's address, which has not changed.

- [ ] **Step 5: Build, and look at the built demo**

```bash
npm run build
```

Expected: ends with the guard passing. Then start the `roster-preview` server (`preview_start {name: "roster-preview"}`), open `/oh/demo/` at the mobile preset, and confirm by `read_page` and one screenshot per screen:

- The hub shows Harlow Valley, the HV crest, violet and gold, three sports.
- Football → Lookup: type 24, see Darius Cole. Team lists ~30 players. Schedule shows played games with scores, a next game with a forecast, and games to come. League shows six rows headed by the conference name.
- Volleyball and Basketball open with rosters and schedules.
- The footer reads “Sample school, players, schedules and scores.”
- `read_network_requests` shows no request to `/oh/data/` or `/oh/weather.json`, and nothing to Supabase.
- `read_console_messages {onlyErrors: true}` is empty.

If a screen is blank where the pre-`f5eb0d5` demo was not, diff the code path against `git show f5eb0d5^:src/oh/School.tsx` before changing anything else.

- [ ] **Step 6: Commit**

```bash
git add src/oh/demo.ts src/oh/store.ts src/oh/School.tsx src/oh/demo.test.ts oh/demo/index.html paid-schools.json
git commit -m "Name the demo for the invented school, and pin that it asks the directory for nothing

Springfield comes off the forecast list with it: the demo was its only reason to be there.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The seller's runbook describes the demo that exists

**Files:**
- Modify: `docs/selling.md` (lines 8–64)
- Modify: `CLAUDE.md` (the demo sentences under "Live and verified", and the paid-tier price in the opening list)

- [ ] **Step 1: Rewrite the price line and "What to show a prospect"**

Replace lines 8–9 of `docs/selling.md` with:

```markdown
One team is $400 a season. A whole school — every sport and level — is $1,200
a year. A district or conference is quoted. A school's first season is free.
These lines are the one place those numbers live — change them here and on
the site (`marketing/index.html`) together, and quote whatever they say.
```

Replace the section body (through the Maintenance paragraph) with:

```markdown
https://getroster.scottforge.ai — the site. Send this to someone you have not
met.

https://roster.scottforge.ai/oh/demo/ — the demo. Open it on a phone and hand
it over. No login, no setup, nothing to explain first.

It is Harlow Valley, a school that does not exist, in violet and gold with its
own crest. Three sports — Football, Volleyball, Basketball — each opening the
way a paying school's does: keypad, roster, schedule. Football also carries
scores, a forecast at the next kickoff, and a standings table for a conference
of five more invented schools.

The school is fictional on purpose. For one pitch the demo was the real
Springfield with sample players on it; the site now sends strangers here, and
invented players do not belong on a real school's page in front of them. A
quiet line in the footer says it is all sample data.

It works with no signal once loaded, and it asks the database and the
directory for nothing — safe on a school's guest wifi or in a car park.

**Maintenance:** the page carries each sport's dates forward by whole weeks as
it ages, so what has been played and what is coming split at today — but only
until that sport's own months run out. So run `node scripts/build-demo.mjs`
and commit `public/oh/demo.json` **twice a year**: near the start of the
autumn, and again in December once football and volleyball are over. It
refuses to write a season that would argue with itself, or a school that
turns out to be real, and prints the dates it wrote.

After a re-run that changes how the page looks, re-take the site's
screenshots: `node scripts/shoot-marketing.mjs` (see README, Deploying).
```

Delete the paragraph about `springfield-new-middletown` being in `paid-schools.json`, and in "One more line, in the repo" change the example to one slug plus `"their-school-theirtown"`.

- [ ] **Step 2: Correct CLAUDE.md**

In the opening list, item 3: `a school pays ($400/season for one team, $1,200/year for the whole school, first season free; concierge: the seller does everything)`. Add item 4:

```markdown
4. **The marketing site** (`marketing/`, https://getroster.scottforge.ai) — one static page,
   its own Cloudflare Pages project, no build step. Nothing in it touches the three above.
```

Change "Three products share this repo and one deployment" to "Four things live in this repo; the first three share one deployment". Replace the sentences beginning "The demo at `/oh/demo/` is the real Springfield…" through "…move the demo on when the pitch does (selling.md)." with:

```markdown
The demo at `/oh/demo/` is Harlow Valley (`harlow-valley-demo`), an invented school in an
invented conference, everything baked into `public/oh/demo.json` — football included — so it
asks the directory and the database for nothing. It was the real Springfield for one pitch
(PR #12) and went back to fiction on 2026-10-13 when the public site began pointing at it.
```

- [ ] **Step 3: Commit**

```bash
git add docs/selling.md CLAUDE.md
git commit -m "Tell the seller what the demo is now and what Roster costs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part 2 — the site

### Task 4: The page, pinned by a test

**Files:**
- Create: `marketing/index.html`
- Create: `marketing/favicon.svg`
- Create: `src/marketing/site.test.ts`

**Interfaces:**
- Produces: section ids `what`, `inside`, `setup`, `families`, `cost`, `launch`, `start`. Image paths `img/lookup.webp`, `img/team.webp`, `img/schedule.webp`, `img/league.webp`, `img/share.png` (created in Task 6). Class names listed in Task 5.

- [ ] **Step 1: Write the failing test**

`src/marketing/site.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The marketing page, pinned.
 *
 * It is plain HTML that no build reads, so nothing else would notice a dead
 * anchor, a price that drifted from docs/selling.md, or a sentence promising
 * something the app does not do. Read off disk as text — it is one small page,
 * and a DOM would be a dependency to keep for the sake of four regexes.
 */
const file = new URL('../../marketing/index.html', import.meta.url);
const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
/** What a reader sees: tags, scripts and styles out, entities left alone. */
const text = html
  .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
const attrs = (name: string) => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) => m[1]);

describe('the marketing page', () => {
  it('exists and is one page with one h1', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1"/);
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/getroster\.scottforge\.ai\/"/);
  });

  it('has every section its own links point at', () => {
    const ids = new Set(attrs('id'));
    for (const id of ['what', 'inside', 'setup', 'families', 'cost', 'launch', 'start']) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const href of attrs('href').filter((h) => h.startsWith('#'))) {
      expect(ids.has(href.slice(1)), href).toBe(true);
    }
  });

  it('links out only to the addresses the spec names', () => {
    const allowed = [
      'https://roster.scottforge.ai/oh/demo/',
      'https://roster.scottforge.ai/oh/',
      'https://roster.scottforge.ai/oh/?privacy',
      'https://scottforge.ai/',
      'https://getroster.scottforge.ai/',
      'mailto:tom@scottforge.ai?subject=Roster%20for%20our%20school',
    ];
    const out = attrs('href').filter(
      (h) => /^(https?:|mailto:)/.test(h) && !h.includes('fonts.g'),
    );
    for (const href of out) expect(allowed, href).toContain(href);
    expect(out).toContain('https://roster.scottforge.ai/oh/demo/');
    expect(out.some((h) => h.startsWith('mailto:'))).toBe(true);
  });

  // A reader with no mail program can still copy the address.
  it('prints the email address where it can be read', () => {
    expect(text).toContain('tom@scottforge.ai');
  });

  it('quotes the prices docs/selling.md quotes', () => {
    expect(text).toMatch(/\$400\s*\/ season/);
    expect(text).toMatch(/\$1,200\s*\/ year/);
    expect(text).toMatch(/first season is free/i);
    const selling = readFileSync(new URL('../../docs/selling.md', import.meta.url), 'utf8');
    expect(selling).toContain('$400');
    expect(selling).toContain('$1,200');
  });

  it('promises nothing the app does not do, and names no real school', () => {
    for (const word of [
      'Hudl', 'MaxPreps', 'stats', 'Region', 'rSchoolToday', 'ArbiterGame',
      'DragonFly', 'Presented by', 'sponsor', 'Springfield', 'Tigers',
    ]) {
      expect(text.toLowerCase().includes(word.toLowerCase()), word).toBe(false);
    }
  });

  it('writes its apostrophes and quotes the way the app does', () => {
    expect(text).not.toMatch(/[A-Za-z]'[a-z]/);
    expect(text).not.toContain('"');
  });

  it('gives every picture a size, a description and a file', () => {
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBeGreaterThanOrEqual(4);
    for (const img of imgs) {
      expect(img, img).toMatch(/\balt="[^"]{8,}"/);
      expect(img, img).toMatch(/\bwidth="\d+"/);
      expect(img, img).toMatch(/\bheight="\d+"/);
    }
  });

  it('carries no tracker', () => {
    expect(html).not.toMatch(/<script[^>]*\bsrc=/);
    expect(html).not.toMatch(/gtag|analytics|beacon/i);
  });
});
```

The "a file" half of the picture test (each `src` exists on disk) is added in Task 6, when the files exist.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/marketing/site.test.ts`
Expected: FAIL — the first test, `expected '' to match /^<!doctype html>/i`.

- [ ] **Step 3: Write the favicon**

`marketing/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="8" fill="#0C0B09"/>
  <text x="32" y="45" text-anchor="middle" font-family="Georgia, serif" font-size="40" font-weight="700" fill="#E85D2F">R</text>
</svg>
```

- [ ] **Step 4: Write the page**

`marketing/index.html`. Every string a reader sees is below; do not paraphrase it. Before writing the privacy answer, open the privacy screen's source (`grep -rn "privacy" src/oh --include=*.tsx -il`) and confirm each clause of the answer is something that page also says; cut any clause it does not.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Roster — every team at your school, one link</title>
    <meta
      name="description"
      content="Rosters, schedules and scores for every sport at your school, on any phone. No app to download and no account to create. Built and run for Ohio schools by ScottForge."
    />
    <link rel="canonical" href="https://getroster.scottforge.ai/" />
    <meta name="theme-color" content="#0C0B09" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://getroster.scottforge.ai/" />
    <meta property="og:title" content="Roster — every team at your school, one link" />
    <meta
      property="og:description"
      content="Rosters, schedules and scores for every sport at your school, on any phone. No app, no account."
    />
    <meta property="og:image" content="https://getroster.scottforge.ai/img/share.png" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600&family=Fraunces:ital,opsz,wght@0,9..144,450;1,9..144,450&family=JetBrains+Mono:wght@400;500&display=swap"
    />
    <link rel="stylesheet" href="site.css" />
  </head>
  <body>
    <a class="skip" href="#what">Skip to content</a>

    <header class="bar">
      <a class="mark" href="https://getroster.scottforge.ai/">Roster</a>
      <a class="by" href="https://scottforge.ai/">by ScottForge</a>
      <nav aria-label="Sections">
        <a href="#what">What it is</a>
        <a href="#setup">Setup</a>
        <a href="#cost">Cost</a>
        <a href="#launch">Questions</a>
      </nav>
      <a class="btn" href="https://roster.scottforge.ai/oh/demo/">Try the demo <span aria-hidden="true">→</span></a>
    </header>

    <main>
      <section class="hero">
        <div class="hero-words">
          <p class="eyebrow">For Ohio high school athletics</p>
          <h1>Every team. <em>One link.</em></h1>
          <p class="lede">
            Rosters, schedules and scores for every sport at your school, on any phone. No app to
            download and no account to create.
          </p>
          <p class="actions">
            <a class="btn btn-hot" href="https://roster.scottforge.ai/oh/demo/">Try the demo <span aria-hidden="true">→</span></a>
            <a class="btn" href="mailto:tom@scottforge.ai?subject=Roster%20for%20our%20school">Email Tom <span aria-hidden="true">→</span></a>
          </p>
        </div>
        <figure class="phone">
          <img src="img/lookup.webp" width="390" height="844" alt="The Lookup screen: a jersey number typed on a keypad, and the player’s name, position and class above it." />
        </figure>
      </section>

      <section id="what" class="band">
        <p class="label">01 / What it is</p>
        <h2>The team, in everyone’s pocket.</h2>
        <div class="two">
          <div>
            <p>
              On a Friday night, the announcer, the visiting coach and half the bleachers are trying
              to work out who just made the play. The roster exists, but it’s a PDF in someone’s
              inbox.
            </p>
            <p>
              Roster puts every team at your school on one web link. Families open it from a QR code
              or your athletics site, pick a sport, and type a jersey number to see the player.
            </p>
          </div>
          <dl class="tabs">
            <div><dt>Lookup</dt><dd>Jersey number in; name, position and class out.</dd></div>
            <div><dt>Team</dt><dd>The full roster, searchable, grouped the way the sideline thinks.</dd></div>
            <div><dt>Schedule</dt><dd>Every game, home and away, with a countdown to the next one.</dd></div>
            <div><dt>League</dt><dd>Your conference’s scores and standings.</dd></div>
          </dl>
        </div>
      </section>

      <section id="inside" class="band band-ash">
        <p class="label">02 / A look inside</p>
        <h2>A reason to open it every week.</h2>
        <div class="shots">
          <figure class="phone">
            <img src="img/team.webp" width="390" height="844" loading="lazy" alt="The Team screen: a search box, and the roster listed by jersey number with position and class." />
            <figcaption><strong>Team</strong> Search by name, number or position.</figcaption>
          </figure>
          <figure class="phone">
            <img src="img/schedule.webp" width="390" height="844" loading="lazy" alt="The Schedule screen: the next game with a countdown and a forecast, then the games played and to come." />
            <figcaption><strong>Schedule</strong> The next game first, with the weather at kickoff.</figcaption>
          </figure>
          <figure class="phone">
            <img src="img/league.webp" width="390" height="844" loading="lazy" alt="The League screen: a conference standings table with each school’s conference and overall record." />
            <figcaption><strong>League</strong> Conference standings, kept current through the season.</figcaption>
          </figure>
        </div>
        <p class="fine">Screens show a sample school. Nobody on them is real.</p>
      </section>

      <section id="setup" class="band">
        <p class="label">03 / Your setup</p>
        <h2>Two things to share. That’s it.</h2>
        <p class="lede">Use whatever you already keep. Share it once per sport.</p>
        <div class="cards">
          <article class="card">
            <p class="num">1</p>
            <h3>Roster</h3>
            <p><strong>Best:</strong> a Google Sheet. Your coach edits a number there and the page follows within the hour.</p>
            <p><strong>Also works:</strong> a spreadsheet file, or the roster pasted into an email.</p>
            <p class="fine">Number, name, grade, position. Height and weight if you want them shown.</p>
          </article>
          <article class="card">
            <p class="num">2</p>
            <h3>Schedule</h3>
            <p><strong>Football:</strong> nothing to send. Schedules and scores for every Ohio school are already in.</p>
            <p><strong>Other sports:</strong> the calendar link from your scheduling service, or I enter the schedule for you.</p>
            <p class="fine">Where the calendar link works, reschedules and time changes carry over on their own.</p>
          </article>
        </div>
        <div class="rest">
          <h3>I take care of the rest</h3>
          <ul class="ticks">
            <li>Each sport in your colors, with your crest</li>
            <li>Cleaning up names and jersey conflicts</li>
            <li>Conference scores and standings</li>
            <li>Hosting, security and uptime</li>
            <li>Your QR code and a print-ready flyer</li>
            <li>Changes through the season</li>
          </ul>
        </div>
      </section>

      <section id="families" class="band band-ash">
        <p class="label">04 / Getting it to families</p>
        <h2>One link, everywhere your fans already look.</h2>
        <div class="cards cards-3">
          <article class="card"><h3>Take-home flyer</h3><p>A half-page flyer with the QR code, sent home in backpacks or handed out at registration.</p></article>
          <article class="card"><h3>Athletics website</h3><p>A “Roster &amp; Scores” button on your athletics page. I send the image and the link; your web person pastes it in.</p></article>
          <article class="card"><h3>Gate and bleacher signs</h3><p>A QR sign at the ticket gate, the concession stand and the press box, so visiting fans find it too.</p></article>
          <article class="card"><h3>Game program</h3><p>The QR code on the back of the program, next to the roster page it replaces.</p></article>
          <article class="card"><h3>School messaging</h3><p>One post or text through your parent messaging and the booster accounts before the first home game.</p></article>
          <article class="card"><h3>PA announcement</h3><p><em>“Want tonight’s roster on your phone? Scan the code on the gate sign or in your program.”</em></p></article>
        </div>
        <div class="rest">
          <h3>Save it like an app</h3>
          <p><strong>iPhone:</strong> open the link in Safari, tap Share, then Add to Home Screen.</p>
          <p><strong>Android:</strong> open the link in Chrome, tap the menu, then Add to Home screen.</p>
        </div>
      </section>

      <section id="cost" class="band">
        <p class="label">05 / What it costs</p>
        <h2>Priced per school. <em>First season free.</em></h2>
        <div class="cards cards-3 prices">
          <article class="card">
            <h3>One team</h3>
            <p class="price">$400 <span>/ season</span></p>
            <p>One varsity sport, such as football or basketball. Setup included.</p>
          </article>
          <article class="card card-hot">
            <p class="label">Recommended</p>
            <h3>Whole school</h3>
            <p class="price">$1,200 <span>/ year</span></p>
            <p>Every sport and level on one school page, with QR flyers, gate signs and the website button.</p>
          </article>
          <article class="card">
            <h3>District</h3>
            <p class="price">Custom</p>
            <p>Several schools or a whole conference on one invoice.</p>
          </article>
        </div>
        <div class="rest">
          <h3>Your first season is free</h3>
          <p>Try it through a season. If the press box and the bleachers don’t use it, you don’t pay for it.</p>
        </div>
        <h3 class="sub">Every plan includes</h3>
        <ul class="ticks">
          <li>Setup from your sheet and calendar</li>
          <li>Your colors and crest</li>
          <li>Conference standings</li>
          <li>Hosting and updates all season</li>
          <li>QR code and print-ready flyer</li>
          <li>Support by email or phone</li>
        </ul>
      </section>

      <section id="launch" class="band band-ash">
        <p class="label">06 / Launch plan</p>
        <h2>Live before the next home game.</h2>
        <ol class="steps">
          <li><p class="label">Day 1</p><h3>Share two things</h3><p>The roster sheet and the schedule, for each sport.</p></li>
          <li><p class="label">Days 2–4</p><h3>Review your page</h3><p>You and the coaches check names and numbers. I fix anything that’s off.</p></li>
          <li><p class="label">Game week</p><h3>Get it out</h3><p>Flyers home, button on the website, signs at the gate.</p></li>
          <li><p class="label">All season</p><h3>It keeps itself current</h3><p>Football scores and standings update without a phone call.</p></li>
        </ol>

        <h3 class="sub">Questions athletic directors ask</h3>
        <dl class="faq">
          <div><dt>Which sports?</dt><dd>Any team with a roster and a schedule. The demo shows football, volleyball and basketball; soccer, baseball, softball and track are added the same way.</dd></div>
          <div><dt>What about student privacy?</dt><dd>The page shows only what’s on the roster you send: number, name, grade and position, plus height and weight if you include them. No addresses, contact details or photos. A player or a whole roster comes down the same day you ask.</dd></div>
          <div><dt>Who keeps it updated?</dt><dd>Your sheet does, if you link one. Otherwise, text or email me the change and I make it.</dd></div>
          <div><dt>Does IT need to approve anything?</dt><dd>No. There’s nothing to install on school devices and no student accounts.</dd></div>
          <div><dt>What does it cost?</dt><dd>$1,200 a year for every sport at your school, and your first season is free.</dd></div>
        </dl>
      </section>

      <section id="start" class="band start">
        <p class="label">07 / Start here</p>
        <h2>See it on your own phone.</h2>
        <p class="lede">Open the demo, type a jersey number, and decide whether your bleachers would use it.</p>
        <p class="actions">
          <a class="btn btn-hot" href="https://roster.scottforge.ai/oh/demo/">Try the demo <span aria-hidden="true">→</span></a>
          <a class="btn" href="mailto:tom@scottforge.ai?subject=Roster%20for%20our%20school">Email Tom <span aria-hidden="true">→</span></a>
        </p>
        <p class="contact">tom@scottforge.ai · usually within 24 hours</p>
        <p>
          Your school’s football schedule and scores are already there, free:
          <a href="https://roster.scottforge.ai/oh/">find your school</a>.
        </p>
        <p class="fine">
          Roster is built and run by one person in Youngstown, Ohio.
          <a href="https://scottforge.ai/">ScottForge</a> does IT, automation and websites for small
          businesses in the Mahoning Valley.
        </p>
      </section>
    </main>

    <footer class="foot">
      <p>© 2026 ScottForge · Made in Youngstown, OH</p>
      <nav aria-label="Footer">
        <a href="https://roster.scottforge.ai/oh/demo/">Demo</a>
        <a href="https://roster.scottforge.ai/oh/?privacy">Privacy</a>
        <a href="https://scottforge.ai/">ScottForge</a>
      </nav>
    </footer>
  </body>
</html>
```

Two claims in that copy must be checked against the code before the commit, and softened if they do not hold:
- "the page follows within the hour" — the sync job runs every 15 minutes (`CLAUDE.md`, Data sources). True.
- "The next game first, with the weather at kickoff" — the forecast shows only for schools on `paid-schools.json`. True for a paying school; leave it.

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/marketing/site.test.ts`
Expected: PASS, all nine.

- [ ] **Step 6: Commit**

```bash
git add marketing/index.html marketing/favicon.svg src/marketing/site.test.ts
git commit -m "Write the page an athletic director can be sent to, and pin what it may claim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The look

**Files:**
- Create: `marketing/site.css`
- Modify: `.claude/launch.json`

**Interfaces:**
- Consumes: the class names in `marketing/index.html`: `skip`, `bar`, `mark`, `by`, `btn`, `btn-hot`, `hero`, `hero-words`, `eyebrow`, `lede`, `actions`, `phone`, `band`, `band-ash`, `label`, `two`, `tabs`, `shots`, `fine`, `cards`, `cards-3`, `card`, `card-hot`, `num`, `rest`, `ticks`, `prices`, `price`, `sub`, `steps`, `faq`, `start`, `contact`, `foot`.

- [ ] **Step 1: Add a preview server**

Add to `configurations` in `.claude/launch.json`:

```json
    {
      "name": "marketing",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--yes", "http-server", "marketing", "-p", "4190", "-c-1", "--silent"],
      "port": 4190
    }
```

- [ ] **Step 2: Write the stylesheet**

`marketing/site.css`. The token values are scottforge.ai's own; do not adjust them by eye.

```css
/*
 * Roster's marketing page, in ScottForge's colors and type.
 *
 * One file, no build. Mobile first: every grid is a single column until there
 * is room for more, so the page cannot scroll sideways on a small phone.
 */
:root {
  --coal: #0c0b09;
  --ash: #141210;
  --soot: #1c1915;
  --paper: #f2ebdd;
  --paper-dim: #d4cbb9;
  --fog: #8a8276;
  --ember: #e85d2f;
  --ember-hot: #ff8a3d;
  --ember-yel: #ffc857;
  --border: rgba(242, 235, 221, 0.08);
  --border-hot: rgba(232, 93, 47, 0.35);
  --f-display: 'Fraunces', Georgia, serif;
  --f-body: 'Archivo', -apple-system, 'Segoe UI', sans-serif;
  --f-mono: 'JetBrains Mono', ui-monospace, Consolas, monospace;
  --gutter: clamp(20px, 5vw, 64px);
  --measure: 1120px;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  background: var(--coal);
  color: var(--paper-dim);
  font: 400 17px/1.6 var(--f-body);
}

img {
  display: block;
  max-width: 100%;
  height: auto;
}

a {
  color: var(--paper);
  text-decoration-color: var(--border-hot);
  text-underline-offset: 3px;
}
a:hover {
  color: var(--ember-hot);
}
:focus-visible {
  outline: 2px solid var(--ember-yel);
  outline-offset: 3px;
}

h1,
h2,
h3 {
  margin: 0;
  color: var(--paper);
  font-family: var(--f-display);
  font-weight: 450;
  text-wrap: balance;
}
h1 {
  font-size: clamp(2.9rem, 11vw, 6.6rem);
  line-height: 0.98;
  letter-spacing: -0.038em;
}
h2 {
  font-size: clamp(1.9rem, 5vw, 3rem);
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin-bottom: 0.6em;
}
h3 {
  font-size: 1.3rem;
  line-height: 1.2;
}
h1 em,
h2 em {
  color: var(--ember);
  font-style: italic;
}
p {
  margin: 0 0 1em;
}
strong {
  color: var(--paper);
  font-weight: 600;
}

.label,
.eyebrow {
  margin: 0 0 1.4em;
  color: var(--ember);
  font: 500 0.74rem/1.4 var(--f-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.lede {
  max-width: 34em;
  font-size: clamp(1.05rem, 2.2vw, 1.22rem);
}
.fine {
  color: var(--fog);
  font-size: 0.86rem;
}
.sub {
  margin: 2.6em 0 1em;
}

.skip {
  position: absolute;
  left: -999px;
}
.skip:focus {
  left: var(--gutter);
  top: 8px;
  z-index: 10;
  background: var(--coal);
  padding: 8px 12px;
}

/* ---------------------------------------------------------------- buttons */

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.7em;
  min-height: 44px;
  padding: 0.75em 1.25em;
  border: 1px solid var(--border-hot);
  border-radius: 3px;
  color: var(--ember-yel);
  font: 600 0.8rem/1 var(--f-body);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
}
.btn:hover {
  border-color: var(--ember-hot);
  color: var(--paper);
}
.btn-hot {
  background: var(--ember);
  border-color: var(--ember);
  color: var(--coal);
}
.btn-hot:hover {
  background: var(--ember-hot);
  border-color: var(--ember-hot);
  color: var(--coal);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 1.8em;
}

/* -------------------------------------------------------------- top bar */

.bar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px var(--gutter);
  background: rgba(12, 11, 9, 0.82);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
.mark {
  color: var(--paper);
  font: 450 1.35rem/1 var(--f-display);
  text-decoration: none;
}
.by {
  color: var(--fog);
  font: 400 0.7rem/1 var(--f-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-decoration: none;
}
.bar nav {
  display: none;
  gap: 26px;
  margin-left: auto;
}
.bar nav a {
  color: var(--paper-dim);
  font-size: 0.92rem;
  text-decoration: none;
}
.bar .btn {
  margin-left: auto;
  min-height: 40px;
  padding: 0.6em 0.9em;
}

/* ------------------------------------------------------------- sections */

.hero,
.band,
.foot {
  padding-inline: var(--gutter);
}
.hero > *,
.band > * {
  max-width: var(--measure);
  margin-inline: auto;
}
.hero {
  display: grid;
  gap: 48px;
  padding-block: clamp(48px, 9vw, 110px);
}
.hero-words {
  margin: 0;
}
.band {
  padding-block: clamp(56px, 9vw, 120px);
  border-top: 1px solid var(--border);
}
.band-ash {
  background: var(--ash);
}

.two,
.cards,
.shots,
.steps,
.ticks,
.faq {
  display: grid;
  gap: 20px;
  padding: 0;
  list-style: none;
}
.two {
  gap: 36px;
}

.tabs {
  margin: 0;
  display: grid;
  gap: 14px;
}
.tabs div {
  padding-left: 16px;
  border-left: 3px solid var(--ember);
}
.tabs dt,
.faq dt {
  color: var(--paper);
  font-weight: 600;
}
.tabs dd,
.faq dd {
  margin: 0;
}

/* --------------------------------------------------------------- phones */

.phone {
  margin: 0 auto;
  width: min(100%, 300px);
}
.phone img {
  border: 6px solid var(--soot);
  border-radius: 34px;
  background: var(--soot);
  box-shadow: 0 30px 80px -30px rgba(232, 93, 47, 0.35);
}
.phone figcaption {
  margin-top: 16px;
  font-size: 0.95rem;
}
.phone figcaption strong {
  display: block;
  font: 450 1.2rem/1.3 var(--f-display);
}

/* ---------------------------------------------------------------- cards */

.card {
  padding: 26px;
  background: var(--soot);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.card h3 {
  margin-bottom: 0.5em;
}
.card > :last-child {
  margin-bottom: 0;
}
.card-hot {
  border-color: var(--ember);
}
.num {
  margin: 0 0 0.1em;
  color: var(--ember);
  font: 450 3rem/1 var(--f-display);
}
.price {
  margin: 0 0 0.3em;
  color: var(--paper);
  font: 450 clamp(2.4rem, 7vw, 3.2rem) / 1 var(--f-display);
  letter-spacing: -0.02em;
}
.price span {
  color: var(--fog);
  font: 400 0.95rem/1 var(--f-body);
  letter-spacing: 0;
}

.rest {
  margin-top: 28px;
  padding: 28px;
  border: 1px solid var(--border-hot);
  border-radius: 6px;
}
.rest h3 {
  margin-bottom: 0.7em;
}
.rest > :last-child {
  margin-bottom: 0;
}
.ticks {
  gap: 10px;
  margin: 0;
}
.ticks li {
  padding-left: 1.7em;
  text-indent: -1.7em;
}
.ticks li::before {
  content: '✓';
  display: inline-block;
  width: 1.7em;
  text-indent: 0;
  color: var(--ember);
}

.steps {
  margin: 0;
}
.steps li {
  padding-top: 18px;
  border-top: 3px solid var(--ember);
}
.steps .label {
  margin-bottom: 0.6em;
}
.steps h3 {
  margin-bottom: 0.4em;
}

.faq {
  gap: 0;
  margin: 0;
}
.faq div {
  display: grid;
  gap: 6px;
  padding: 20px 0;
  border-top: 1px solid var(--border);
}

.start .contact {
  margin-top: 1.6em;
  color: var(--paper);
  font: 400 0.95rem/1.5 var(--f-mono);
}

.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  justify-content: space-between;
  padding-block: 28px;
  border-top: 1px solid var(--border);
  color: var(--fog);
  font: 400 0.72rem/1.6 var(--f-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.foot p {
  margin: 0;
}
.foot nav {
  display: flex;
  gap: 22px;
}
.foot a {
  color: var(--fog);
  text-decoration: none;
}
.foot a:hover {
  color: var(--paper);
}

/* ----------------------------------------------------------- with room */

@media (min-width: 620px) {
  .cards,
  .ticks {
    grid-template-columns: repeat(2, 1fr);
  }
  .shots {
    grid-template-columns: repeat(3, 1fr);
  }
  .steps {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 900px) {
  .bar nav {
    display: flex;
  }
  .bar .btn {
    margin-left: 0;
  }
  .hero {
    grid-template-columns: 1.25fr 0.75fr;
    align-items: center;
  }
  .two {
    grid-template-columns: 1fr 1fr;
  }
  .cards-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .steps {
    grid-template-columns: repeat(4, 1fr);
  }
  .faq div {
    grid-template-columns: 1fr 2fr;
    gap: 32px;
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

- [ ] **Step 3: Look at it**

`preview_start {name: "marketing"}`, then with the browser tools:

- Screenshot at the desktop preset and at the mobile preset. The pictures are missing until Task 6; everything else should be in place.
- Put scottforge.ai beside it (`preview_start {url: "https://scottforge.ai"}`) and compare the top bar, the hero headline, a section label, and a button. Same type, same colors, same weight of line.
- `javascript_tool`: `getComputedStyle(document.querySelector('h1')).fontFamily` starts with `Fraunces`; `getComputedStyle(document.body).backgroundColor` is `rgb(12, 11, 9)`.
- `read_console_messages {onlyErrors: true}` shows nothing but the four missing images.

Fix what is off in `site.css` and look again.

- [ ] **Step 4: Commit**

```bash
git add marketing/site.css .claude/launch.json
git commit -m "Dress the page in ScottForge's colors and type, one column until there is room for more

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The pictures, and the page checked on a phone

**Files:**
- Create: `scripts/shoot-marketing.mjs`
- Create: `marketing/img/lookup.webp`, `team.webp`, `schedule.webp`, `league.webp`, `share.png`
- Modify: `src/marketing/site.test.ts`

**Interfaces:**
- Consumes: a built preview of the app on `http://localhost:4173` (the `roster-preview` server) showing the fictional demo from Part 1.

- [ ] **Step 1: Add the missing half of the picture test**

In `src/marketing/site.test.ts`, inside "gives every picture a size, a description and a file", add after the loop:

```ts
    for (const src of attrs('src')) {
      expect(existsSync(new URL(`../../marketing/${src}`, import.meta.url)), src).toBe(true);
    }
    expect(existsSync(new URL('../../marketing/img/share.png', import.meta.url))).toBe(true);
```

Run: `npx vitest run src/marketing/site.test.ts`
Expected: FAIL — `img/lookup.webp` does not exist.

- [ ] **Step 2: Write the screenshot script**

`package.json` must not change, so the browser driver is installed outside the repo and found through an environment variable.

`scripts/shoot-marketing.mjs`:

```js
/*
 * The marketing page's phone screenshots, taken from the real demo.
 *
 * Real screens rather than drawn ones, because the site's whole claim is "this
 * is what you get" — and so they have to be re-taken when the demo's look
 * changes. Run by hand against a built preview:
 *
 *   npm run build && npx vite preview --port 4173      (in one terminal)
 *   npm i --prefix "$TEMP/shoot" playwright-core       (once)
 *   SHOOT_FROM="$TEMP/shoot" node scripts/shoot-marketing.mjs
 *
 * playwright-core is not a dependency of this repo on purpose: the guarded
 * build installs from package-lock.json, and a screenshot tool has no business
 * in it. It drives the Edge or Chrome already on the machine.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'marketing/img');
mkdirSync(out, { recursive: true });

if (!process.env.SHOOT_FROM) throw new Error('set SHOOT_FROM to a folder with playwright-core installed');
const { chromium } = createRequire(join(process.env.SHOOT_FROM, 'package.json'))('playwright-core');

const ORIGIN = process.env.SHOOT_ORIGIN ?? 'http://localhost:4173';
const SIZE = { width: 390, height: 844 };

let browser;
for (const channel of ['msedge', 'chrome']) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch {
    /* try the next one */
  }
}
if (!browser) throw new Error('neither Edge nor Chrome could be started');

const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2 });
await page.goto(`${ORIGIN}/oh/demo/`, { waitUntil: 'networkidle' });

const save = async (name) => {
  await page.waitForTimeout(400);
  const png = await page.screenshot();
  await sharp(png).resize(780).webp({ quality: 82 }).toFile(join(out, `${name}.webp`));
  console.log(`  ${name}.webp`);
  return png;
};

await page.getByText('Football', { exact: true }).first().click();
for (const digit of ['2', '4']) {
  await page.getByRole('button', { name: digit, exact: true }).click();
}
const lookup = await save('lookup');

for (const tab of ['Team', 'Schedule', 'League']) {
  await page.getByRole('button', { name: tab, exact: true }).click();
  await save(tab.toLowerCase());
}
await browser.close();

/*
 * The picture a link to the site unfurls with: the Lookup screen on the site's
 * own coal ground, at the size the Open Graph preview wants.
 */
const phone = await sharp(lookup).resize({ height: 560 }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#0C0B09' } })
  .composite([{ input: phone, gravity: 'centre' }])
  .png()
  .toFile(join(out, 'share.png'));
console.log('  share.png');
```

The three locators (`getByText('Football')`, the keypad buttons, the tab buttons) are written against what the demo shows. If one does not match, open the built demo in the browser pane, `read_page {filter: "interactive"}`, and use the role and name it reports — do not add test ids to the app for this.

- [ ] **Step 3: Take them**

```bash
npm run build
```

Start `roster-preview` (`preview_start {name: "roster-preview"}`), then:

```bash
npm i --prefix "$TEMP/shoot" playwright-core
SHOOT_FROM="$TEMP/shoot" node scripts/shoot-marketing.mjs
git status --short package.json package-lock.json
```

Expected: five files listed; `git status` prints nothing for the two package files. Open each WebP with the Read tool and confirm: Lookup shows #24 Darius Cole; Team shows a roster; Schedule shows played games and a next game; League shows the six-school table. Each file should be under 120 kB.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/marketing/site.test.ts`
Expected: PASS.

- [ ] **Step 5: Check the page at phone width (Review Focus 4)**

With the `marketing` preview open, for each of `resize_window {preset: "mobile"}` and `resize_window {width: 320, height: 640}`:

```js
({
  sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  small: [...document.querySelectorAll('a.btn')].filter((a) => a.getBoundingClientRect().height < 44).length,
  wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className).slice(0, 5),
})
```

Expected: `sideways` 0, `small` 0, `wide` empty. The top bar's button is 40px tall by design; if `small` reports it, raise `.bar .btn` to `min-height: 44px` and let the bar grow.

Then take a full-length screenshot at the mobile preset and at the desktop preset, and read the page top to bottom once at each size: headings in order, three price cards stacked on the phone and side by side on desktop, no orphaned single word under a headline.

Check contrast once with:

```js
(() => {
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x + 0.05) / (y + 0.05)).toFixed(2); };
  const on = (sel, bg) => ratio(getComputedStyle(document.querySelector(sel)).color, bg);
  return { body: on('.lede', 'rgb(12,11,9)'), fine: on('.fine', 'rgb(20,18,16)'), label: on('.label', 'rgb(12,11,9)'), btnHot: ratio('rgb(12,11,9)', 'rgb(232,93,47)') };
})()
```

Expected: every number at least 4.5. If `fine` falls short, lighten `--fog` for `.fine` only (`#9c9488`) rather than changing the token.

Reset with `resize_window {preset: "desktop"}`.

- [ ] **Step 6: Confirm the guard still passes with the folder present**

```bash
npm run build
npx vitest run
npx tsc --noEmit
ls dist | grep -i marketing
```

Expected: the build ends with the guard passing; tests and types clean; the last command prints nothing (the site is not in the app's output).

- [ ] **Step 7: Commit**

```bash
git add scripts/shoot-marketing.mjs marketing/img src/marketing/site.test.ts marketing/site.css
git commit -m "Show the real screens, taken from the demo, and hold every picture to a file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: How it deploys, written down

**Files:**
- Modify: `README.md` (the Deploying section)

- [ ] **Step 1: Add the second project to README's Deploying section**

Append, in the README's voice:

```markdown
### The marketing site

`marketing/` is a separate Cloudflare Pages project on this same repository,
served at https://getroster.scottforge.ai. It has no build: Pages publishes
the folder as it is.

To create it (once, in the Cloudflare dashboard):

1. Workers & Pages → Create → Pages → Connect to Git → this repository.
2. Project name `getroster`. Production branch `main`.
3. Framework preset None. Build command empty. Build output directory `.`
4. Root directory (advanced) `marketing`.
5. After the first deploy: Settings → Builds → Build watch paths → include
   `marketing/**`, so the twice-weekly directory commits do not redeploy it.
6. Custom domains → Set up a domain → `getroster.scottforge.ai`. The zone is
   already on Cloudflare, so the CNAME is added for you.

It needs no environment variables. The main `rosterapp` project still builds
on every push; nothing under `marketing/` is in its output, and the guard
does not look at it.

The phone screenshots in `marketing/img/` are taken from the built demo by
`scripts/shoot-marketing.mjs` (its header says how to run it). Re-take them
when the demo's look changes. `src/marketing/site.test.ts` holds the page to
its own links, the prices in `docs/selling.md`, and the list of things it must
not promise.
```

- [ ] **Step 2: Bring CLAUDE.md's test count up to date**

Run `npx vitest run` and copy the totals it prints into the "Tests and CI" line of `CLAUDE.md` (it reads "580 tests / 42 files" today).

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Write down how the marketing site reaches its own address

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

1. Whole-branch review (the repo's convention: it has caught Criticals every round), then fix what it finds.
2. Open a PR from `marketing-site` to `main`. The existing Pages project builds a preview; its check must be green.
3. Merge. The main project redeploys with the fictional demo. Open `https://roster.scottforge.ai/oh/demo/` on a phone and confirm Harlow Valley.
4. **Tom, in the Cloudflare dashboard:** the six steps in README → The marketing site.
5. Open `https://getroster.scottforge.ai` and click every link once. Paste the address into a message to yourself and confirm the preview card shows the share image.
