# Ohio Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a searchable directory of every Ohio high school football team, with schedules and scores, at `/oh/` — without changing one byte of how Poland, YSU or Victory Christian behave.

**Architecture:** Sixteen weekly scoreboard pages from joeeitel.com are parsed by pure, fixture-pinned functions into 734 schools and 4,275 games. A build script writes them as committed static JSON. A second Vite entry point at `/oh/` serves a search screen and a school screen, isolated from the existing app's bundle and service worker.

**Tech Stack:** TypeScript, React 18, Vite 8, vitest, vite-plugin-pwa (workbox), GitHub Actions, GitHub Pages. No database, no backend, no new dependencies.

## Global Constraints

- **Poland must not change.** `/`, `/ysu/` and `/victorychristian/` must behave identically after this work, including for an app already installed on a home screen and opened with no signal. Task 4 makes this a test.
- **The precache must not grow.** Directory data is never precached by the root service worker.
- **No new runtime dependencies.** Nothing is added to `package.json` dependencies.
- **Parsers are pure and pinned to saved fixtures**, matching `src/league/leagueParse.ts`. A source change fails a test here, it does not empty a screen on a phone.
- **All-or-nothing publishing.** A week that fails to fetch or parses to zero games keeps the copy already committed. Never publish a worse file over a good one, and never fail the build.
- **Request budget: 16 per refresh.** One per week page. Nothing in this plan fetches per-school pages.
- **User-Agent on every request:** `rosterapp (github.com/kmccb/rosterapp)`, matching `scripts/lib/ohio.mjs`.

## Source format, verified 2026-08-22

Games live inside a `<pre>` block, one per `<br>`:

```html
<br>2026-08-21     7pm Salem (Salem) <span class="text-primary">21</span> at Poland Seminary (Poland) <span class="text-primary">17</span>
<br>2026-09-04     7pm Wheelersburg (Wheelersburg) <span class="text-primary">32</span> at Green (Franklin Furnace) <span class="text-primary">38</span> <span class="text-danger">OT3</span>
<br>2026-09-24     6pm Bowsher (Toledo) <span class="text-danger">***</span> at Waite (Toledo) <span class="text-danger">***</span>
<br>2026-09-22     4pm Chaminade College School (North York) [ON] <span class="text-danger">***</span> at Huron Heights (Newmarket) [ON] <span class="text-danger">***</span>
```

- Score is an integer, or `***` when not yet played.
- An optional trailing `text-danger` span carries overtime (`OT1`, `OT3`).
- A trailing `[XX]` marks a non-Ohio school. Ohio schools carry no suffix.
- Score spans are `text-primary` when played and `text-danger` when `***`, so the parser must accept either class.

## File Structure

**Created:**
- `src/ohio/stateParse.ts` — one job: scoreboard HTML → `StateGame[]`. Pure.
- `src/ohio/stateParse.test.ts`
- `src/ohio/fixtures/scoreboard-2026-week-1.html` — played games, overtime
- `src/ohio/fixtures/scoreboard-2026-week-6.html` — unplayed games, out-of-state schools
- `src/ohio/stateModel.ts` — one job: `StateGame[]` → directory and per-school seasons. Pure.
- `src/ohio/stateModel.test.ts`
- `scripts/lib/ohio-state.mjs` — fetching only, no parsing (mirrors `scripts/lib/ohio.mjs`)
- `scripts/build-directory.mjs` — writes `public/oh/`
- `scripts/check-untouched.mjs` — the Poland regression guard
- `oh/index.html` — second Vite entry
- `src/oh/main.tsx`, `src/oh/Directory.tsx`, `src/oh/School.tsx`, `src/oh/store.ts`
- `.github/workflows/directory.yml`

**Modified:**
- `vite.config.ts` — second entry, `globIgnores`, `navigateFallbackDenylist`
- `package.json` — one script
- `.gitignore` — `public/oh/` must NOT be ignored (data is committed)

---

### Task 1: The scoreboard parser

**Files:**
- Create: `src/ohio/fixtures/scoreboard-2026-week-1.html`
- Create: `src/ohio/fixtures/scoreboard-2026-week-6.html`
- Create: `src/ohio/stateParse.ts`
- Test: `src/ohio/stateParse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
```ts
export type StateSide = {
  name: string;          // "Poland Seminary"
  city: string;          // "Poland"
  state: string;         // "OH" unless the source printed [XX]
  score: number | null;  // null until played
};
export type StateGame = {
  week: number;
  date: string;          // "2026-08-21"
  kickoff: string;       // "7pm", as printed. Always present in the 2026 season.
  away: StateSide;
  home: StateSide;
  overtime?: string;     // "OT3"
};
export function parseScoreboard(html: string, week: number): StateGame[];
```

- [ ] **Step 1: Save the two fixtures**

```bash
mkdir -p src/ohio/fixtures
curl -s -A "rosterapp (github.com/kmccb/rosterapp)" \
  "https://joeeitel.com/hsfoot/scoreboard/2026/week-1" \
  -o src/ohio/fixtures/scoreboard-2026-week-1.html
sleep 1
curl -s -A "rosterapp (github.com/kmccb/rosterapp)" \
  "https://joeeitel.com/hsfoot/scoreboard/2026/week-6" \
  -o src/ohio/fixtures/scoreboard-2026-week-6.html
```

Confirm both are ~65–70 KB and contain `<pre>`:

```bash
wc -c src/ohio/fixtures/*.html && grep -c "<pre>" src/ohio/fixtures/*.html
```

- [ ] **Step 2: Write the failing test**

Create `src/ohio/stateParse.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parseScoreboard } from './stateParse';

const WEEK1 = readFileSync('src/ohio/fixtures/scoreboard-2026-week-1.html', 'utf8');
const WEEK6 = readFileSync('src/ohio/fixtures/scoreboard-2026-week-6.html', 'utf8');

describe('parseScoreboard', () => {
  const week1 = parseScoreboard(WEEK1, 1);

  it('reads every game on the page', () => {
    expect(week1.length).toBe(385);
  });

  it('reads a played game, visitor first', () => {
    const g = week1.find((x) => x.home.name === 'Poland Seminary');
    expect(g).toMatchObject({
      week: 1,
      date: '2026-08-21',
      kickoff: '7pm',
      away: { name: 'Salem', city: 'Salem', state: 'OH', score: 21 },
      home: { name: 'Poland Seminary', city: 'Poland', state: 'OH', score: 17 },
    });
  });

  it('records overtime where the source marks it', () => {
    const ot = week1.filter((g) => g.overtime);
    expect(ot.length).toBeGreaterThan(0);
    expect(ot[0].overtime).toMatch(/^OT\d$/);
  });

  /*
   * Every game has two schools, so a week's schools must come to twice its
   * games. This is the invariant that catches a regex silently dropping rows,
   * which is the failure that would matter and the one hardest to spot.
   */
  it('accounts for two schools in every game', () => {
    const sides = week1.flatMap((g) => [g.away, g.home]);
    expect(sides.length).toBe(week1.length * 2);
    expect(sides.every((s) => s.name && s.city)).toBe(true);
  });

  it('leaves an unplayed game with no score rather than a zero', () => {
    const week6 = parseScoreboard(WEEK6, 6);
    const unplayed = week6.filter((g) => g.away.score === null);
    expect(unplayed.length).toBeGreaterThan(0);
    expect(unplayed[0].home.score).toBeNull();
  });

  it('marks a school from another state, and assumes Ohio otherwise', () => {
    const week6 = parseScoreboard(WEEK6, 6);
    const foreign = week6.flatMap((g) => [g.away, g.home]).filter((s) => s.state !== 'OH');
    expect(foreign.length).toBeGreaterThan(0);
    expect(foreign[0].state).toMatch(/^[A-Z]{2}$/);
    expect(week6.some((g) => g.home.state === 'OH')).toBe(true);
  });

  it('yields nothing rather than guessing when the page has changed shape', () => {
    expect(parseScoreboard('<html><body>Down for maintenance</body></html>', 1)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/ohio/stateParse.test.ts`
Expected: FAIL — `Failed to resolve import "./stateParse"`.

- [ ] **Step 4: Write the parser**

Create `src/ohio/stateParse.ts`:

```ts
/*
 * Ohio's whole season, off sixteen pages.
 *
 * joeeitel publishes a scoreboard per week, and one page carries every game in
 * the state: the date, the kickoff, both schools with the town they play in,
 * and the score once it exists. That is the entire free tier in sixteen
 * requests, and it is also the only source that prints a kickoff time for a
 * school that has not handed over a calendar feed.
 *
 * Pure, and pinned to saved copies of real pages, because this is one person's
 * site with no API and the shape can change without warning. A change fails a
 * test on a developer's machine instead of emptying a screen on a phone.
 */

export type StateSide = {
  name: string;
  city: string;
  /** "OH" unless the source printed a [XX] suffix. */
  state: string;
  /** Absent until played. */
  score: number | null;
};

export type StateGame = {
  week: number;
  /** ISO, e.g. "2026-08-21". */
  date: string;
  /** As printed — "7pm". Empty when the page gave none. */
  kickoff: string;
  away: StateSide;
  home: StateSide;
  /** "OT1", "OT3" — as the source marks it. */
  overtime?: string;
};

/*
 * One side of a fixture: "Salem (Salem) " or "Everett (Everett) [PA] ",
 * followed by the score span. The class is not pinned to text-primary because
 * an unplayed game carries the same span with text-danger and "***" inside it;
 * matching on the class would drop every unplayed fixture in the season.
 */
const SIDE = String.raw`(.+?)\s*\((.+?)\)\s*(?:\[([A-Z]{2})\]\s*)?<span class="text-(?:primary|danger)">(\d+|\*\*\*)<\/span>`;

/*
 * The kickoff is required, not optional. Every one of the 4,275 games in the
 * 2026 season printed one, and an optional group here would happily swallow
 * the first word of a school's name on any line that did not.
 */
const LINE = new RegExp(
  String.raw`<br>\s*(\d{4}-\d{2}-\d{2})\s+(\S+)\s+${SIDE}\s*at\s*${SIDE}` +
    String.raw`(?:\s*<span class="text-danger">(OT\d+)<\/span>)?`,
  'g',
);

const side = (name: string, city: string, st: string | undefined, score: string): StateSide => ({
  name: name.trim(),
  city: city.trim(),
  state: st ?? 'OH',
  score: score === '***' ? null : Number(score),
});

export function parseScoreboard(html: string, week: number): StateGame[] {
  const games: StateGame[] = [];

  for (const m of html.matchAll(LINE)) {
    const [, date, kickoff, aName, aCity, aState, aScore, hName, hCity, hState, hScore, ot] = m;

    games.push({
      week,
      date,
      kickoff,
      away: side(aName, aCity, aState, aScore),
      home: side(hName, hCity, hState, hScore),
      ...(ot ? { overtime: ot } : {}),
    });
  }

  return games;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ohio/stateParse.test.ts`
Expected: PASS, 7 tests.

If the game count assertion fails, print the real number and update the test to it — the fixture is the truth, and a count that has drifted means the fixture was re-saved:

```bash
node --input-type=module -e "
import {parseScoreboard} from './src/ohio/stateParse.ts';
import {readFileSync} from 'node:fs';
console.log(parseScoreboard(readFileSync('src/ohio/fixtures/scoreboard-2026-week-1.html','utf8'),1).length);
"
```

- [ ] **Step 6: Commit**

```bash
git add src/ohio/
git commit -m "Read a week of Ohio football off one page"
```

---

### Task 2: Directory and per-school seasons

**Files:**
- Create: `src/ohio/stateModel.ts`
- Test: `src/ohio/stateModel.test.ts`

**Interfaces:**
- Consumes: `StateGame`, `StateSide` from `./stateParse`.
- Produces:
```ts
export type School = { slug: string; name: string; city: string };
export type SchoolGame = {
  week: number;
  date: string;
  kickoff: string;
  home: boolean;
  opponent: string;
  opponentCity: string;
  /** Present only for an Ohio school, which is the only kind with a page. */
  opponentSlug: string | null;
  result?: { us: number; them: number; won: boolean };
  overtime?: string;
};
export type SchoolSeason = {
  school: School;
  games: SchoolGame[];
  record: { won: number; lost: number; played: number };
};
export const slugFor: (name: string, city: string) => string;
export function directory(games: StateGame[]): School[];
export function seasonsBySchool(games: StateGame[]): Map<string, SchoolSeason>;
```

- [ ] **Step 1: Write the failing test**

Create `src/ohio/stateModel.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parseScoreboard, type StateGame } from './stateParse';
import { directory, seasonsBySchool, slugFor } from './stateModel';

const week1 = parseScoreboard(
  readFileSync('src/ohio/fixtures/scoreboard-2026-week-1.html', 'utf8'),
  1,
);

const game = (over: Partial<StateGame> = {}): StateGame => ({
  week: 1,
  date: '2026-08-21',
  kickoff: '7pm',
  away: { name: 'Salem', city: 'Salem', state: 'OH', score: 21 },
  home: { name: 'Poland Seminary', city: 'Poland', state: 'OH', score: 17 },
  ...over,
});

describe('slugFor', () => {
  it('makes an address out of a school and its town', () => {
    expect(slugFor('Poland Seminary', 'Poland')).toBe('poland-seminary-poland');
  });

  /*
   * Forty-five school names in Ohio are shared. The town is what tells them
   * apart, and a search box that offers three schools called Jackson with no
   * way to choose between them is unusable.
   */
  it('tells two schools with the same name apart', () => {
    expect(slugFor('Jackson', 'Jackson')).not.toBe(slugFor('Jackson', 'Massillon'));
  });

  it('survives punctuation in a school name', () => {
    expect(slugFor('Notre Dame-Cathedral Latin', 'Chardon')).toBe(
      'notre-dame-cathedral-latin-chardon',
    );
    expect(slugFor('St Edward', 'Lakewood')).toBe('st-edward-lakewood');
  });
});

describe('directory', () => {
  it('lists a school once however many games it plays', () => {
    const d = directory([game(), game({ week: 2, away: { name: 'Kirtland', city: 'Kirtland', state: 'OH', score: null } })]);
    expect(d.filter((s) => s.name === 'Poland Seminary')).toHaveLength(1);
  });

  it('leaves out a school from another state, which has no page to open', () => {
    const d = directory([
      game({ away: { name: 'Everett', city: 'Everett', state: 'PA', score: 7 } }),
    ]);
    expect(d.map((s) => s.name)).toEqual(['Poland Seminary']);
  });

  it('is sorted by name so the file diffs cleanly week to week', () => {
    const names = directory(week1).map((s) => s.name);
    expect(names).toEqual([...names].sort());
  });

  it('finds every Ohio school on a real week', () => {
    expect(directory(week1).length).toBeGreaterThan(600);
  });
});

describe('seasonsBySchool', () => {
  const seasons = seasonsBySchool([
    game(),
    game({
      week: 2,
      date: '2026-08-28',
      away: { name: 'Kirtland', city: 'Kirtland', state: 'OH', score: null },
      home: { name: 'Poland Seminary', city: 'Poland', state: 'OH', score: null },
    }),
  ]);
  const poland = seasons.get('poland-seminary-poland')!;

  it('puts a game on both schools', () => {
    expect(seasons.has('poland-seminary-poland')).toBe(true);
    expect(seasons.has('salem-salem')).toBe(true);
  });

  it('says which side of the fixture the school was on', () => {
    expect(poland.games[0]).toMatchObject({ home: true, opponent: 'Salem' });
    expect(seasons.get('salem-salem')!.games[0]).toMatchObject({ home: false, opponent: 'Poland Seminary' });
  });

  it('scores the game from the school’s own side', () => {
    expect(poland.games[0].result).toEqual({ us: 17, them: 21, won: false });
    expect(seasons.get('salem-salem')!.games[0].result).toEqual({ us: 21, them: 17, won: true });
  });

  it('leaves an unplayed fixture without a result', () => {
    expect(poland.games[1].result).toBeUndefined();
  });

  it('counts the record off played games only', () => {
    expect(poland.record).toEqual({ won: 0, lost: 1, played: 1 });
  });

  it('orders a season by date', () => {
    expect(poland.games.map((g) => g.date)).toEqual(['2026-08-21', '2026-08-28']);
  });

  it('links an Ohio opponent and does not link one from out of state', () => {
    const s = seasonsBySchool([
      game({ away: { name: 'Everett', city: 'Everett', state: 'PA', score: 7 } }),
    ]);
    expect(s.get('poland-seminary-poland')!.games[0].opponentSlug).toBeNull();
    expect(seasonsBySchool([game()]).get('poland-seminary-poland')!.games[0].opponentSlug).toBe('salem-salem');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ohio/stateModel.test.ts`
Expected: FAIL — `Failed to resolve import "./stateModel"`.

- [ ] **Step 3: Write the model**

Create `src/ohio/stateModel.ts`:

```ts
/*
 * The state, turned into the two things the screen asks for: a list of schools
 * to search, and one season per school.
 *
 * The scoreboard is written from the game's point of view — a visitor, a home
 * side and two numbers. A reader is only ever interested in one school, so
 * every game is filed twice, once from each side, with the score turned round
 * to match whichever school is being read.
 */

import type { StateGame, StateSide } from './stateParse';

export type School = { slug: string; name: string; city: string };

export type SchoolGame = {
  week: number;
  date: string;
  kickoff: string;
  home: boolean;
  opponent: string;
  opponentCity: string;
  /** An Ohio school has a page to open; anyone else is a name on a fixture. */
  opponentSlug: string | null;
  result?: { us: number; them: number; won: boolean };
  overtime?: string;
};

export type SchoolSeason = {
  school: School;
  games: SchoolGame[];
  record: { won: number; lost: number; played: number };
};

/**
 * A school's address, from its name and the town it plays in.
 *
 * The town is not decoration. Forty-five school names in Ohio are shared —
 * three Jacksons, two Springfields — and the name alone cannot say which one a
 * reader meant.
 */
export const slugFor = (name: string, city: string): string =>
  `${name}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Only Ohio schools get a page; everyone else is an opponent's name. */
const isOhio = (s: StateSide) => s.state === 'OH';

export function directory(games: StateGame[]): School[] {
  const schools = new Map<string, School>();

  for (const g of games) {
    for (const s of [g.away, g.home]) {
      if (!isOhio(s)) continue;
      const slug = slugFor(s.name, s.city);
      if (!schools.has(slug)) schools.set(slug, { slug, name: s.name, city: s.city });
    }
  }

  // Sorted so the committed file changes only where the season changed.
  return [...schools.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city),
  );
}

export function seasonsBySchool(games: StateGame[]): Map<string, SchoolSeason> {
  const seasons = new Map<string, SchoolSeason>();

  const file = (us: StateSide, them: StateSide, atHome: boolean, g: StateGame) => {
    if (!isOhio(us)) return;

    const slug = slugFor(us.name, us.city);
    const season =
      seasons.get(slug) ??
      ({
        school: { slug, name: us.name, city: us.city },
        games: [],
        record: { won: 0, lost: 0, played: 0 },
      } satisfies SchoolSeason);

    const played = us.score !== null && them.score !== null;

    season.games.push({
      week: g.week,
      date: g.date,
      kickoff: g.kickoff,
      home: atHome,
      opponent: them.name,
      opponentCity: them.city,
      opponentSlug: isOhio(them) ? slugFor(them.name, them.city) : null,
      ...(played
        ? { result: { us: us.score!, them: them.score!, won: us.score! > them.score! } }
        : {}),
      ...(g.overtime ? { overtime: g.overtime } : {}),
    });

    if (played) {
      season.record.played += 1;
      if (us.score! > them.score!) season.record.won += 1;
      else season.record.lost += 1;
    }

    seasons.set(slug, season);
  };

  for (const g of games) {
    file(g.home, g.away, true, g);
    file(g.away, g.home, false, g);
  }

  for (const season of seasons.values()) {
    season.games.sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);
  }

  return seasons;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ohio/`
Expected: PASS, both files.

- [ ] **Step 5: Commit**

```bash
git add src/ohio/
git commit -m "Turn a state's scoreboard into schools and seasons"
```

---

### Task 3: Fetch the season and write the files

**Files:**
- Create: `scripts/lib/ohio-state.mjs`
- Create: `scripts/build-directory.mjs`
- Modify: `package.json` (add one script)

**Interfaces:**
- Consumes: `parseScoreboard` from `src/ohio/stateParse.ts`; `directory`, `seasonsBySchool` from `src/ohio/stateModel.ts`.
- Produces: `public/oh/index.json`, `public/oh/data/<slug>.json`, and:
```js
export async function fetchSeason(year, opts): Promise<{ games: StateGame[], weeks: number[], failed: number[] }>
```

`index.json` shape, which Task 5 reads:
```json
{ "year": 2026, "fetched": "2026-08-22T13:00:00.000Z",
  "schools": [{ "slug": "poland-seminary-poland", "name": "Poland Seminary", "city": "Poland" }] }
```

`data/<slug>.json` shape, which Task 6 reads: one `SchoolSeason` as JSON.

- [ ] **Step 1: Write the fetch layer**

Create `scripts/lib/ohio-state.mjs`:

```js
// scripts/lib/ohio-state.mjs

/**
 * Sixteen pages, and the whole state is on them.
 *
 * Deliberately separate from ohio.mjs, which serves the League tab for one
 * team and must keep working exactly as it does. Nothing here is imported by
 * that path.
 *
 * A week is fetched, parsed, and either yields games or is reported as failed.
 * It is never half-trusted: the caller keeps whatever was committed for a week
 * that came back wrong, because a week that has quietly lost half its games is
 * worse than last night's copy of it.
 */
import { parseScoreboard } from '../../src/ohio/stateParse.ts';

const WEEK = (year, n) => `https://joeeitel.com/hsfoot/scoreboard/${year}/week-${n}`;

/** Ohio plays ten regular-season weeks and up to six of playoffs. */
export const WEEKS = 16;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchSeason(year, { pause = 400 } = {}) {
  const games = [];
  const weeks = [];
  const failed = [];

  for (let n = 1; n <= WEEKS; n++) {
    try {
      const res = await fetch(WEEK(year, n), {
        headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const week = parseScoreboard(await res.text(), n);
      /*
       * Late playoff weeks are legitimately empty before the brackets are
       * drawn, so an empty week is not a failure on its own. The caller
       * decides, by comparing against what is already committed.
       */
      weeks.push(n);
      games.push(...week);
    } catch (err) {
      console.warn(`  ! week ${n}: ${err.message}`);
      failed.push(n);
    }

    // One page at a time, with a pause. This is somebody's hobby site.
    if (n < WEEKS) await sleep(pause);
  }

  return { games, weeks, failed };
}
```

- [ ] **Step 2: Write the build script**

Create `scripts/build-directory.mjs`:

```js
/**
 * The Ohio directory, written as static files and committed.
 *
 * No database. Sixteen requests a refresh is not a load problem worth buying
 * infrastructure for, and committing the result gives free hosting, a diff for
 * every score that changes, and a record of what the source said on the day —
 * the same reasoning that puts teams/poland/history.json in the repository.
 *
 * Refuses to publish a season that is worse than the committed one. A fetch
 * that half-fails would otherwise quietly delete schools from the directory,
 * and a school whose page disappears is a worse failure than one whose scores
 * are a day old.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSeason } from './lib/ohio-state.mjs';
import { directory, seasonsBySchool } from '../src/ohio/stateModel.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'oh');
const dataDir = join(out, 'data');
const indexFile = join(out, 'index.json');

const year = Number(process.argv[2]) || new Date().getFullYear();

const previousCount = async () => {
  if (!existsSync(indexFile)) return 0;
  try {
    return JSON.parse(await readFile(indexFile, 'utf8')).schools.length;
  } catch {
    return 0;
  }
};

const { games, weeks, failed } = await fetchSeason(year);
console.log(`  fetched ${weeks.length}/${weeks.length + failed.length} weeks, ${games.length} games`);

const schools = directory(games);
const seasons = seasonsBySchool(games);
const before = await previousCount();

/*
 * The guard. A directory that has shrunk means weeks went missing, and
 * republishing it would delete schools people have bookmarked. Ten per cent is
 * slack for a source correcting a duplicate, not for a failed run.
 */
if (before > 0 && schools.length < before * 0.9) {
  console.error(
    `  ! ${schools.length} schools against ${before} already published — too few. ` +
      `Keeping the committed copy. Failed weeks: ${failed.join(',') || 'none'}.`,
  );
  process.exit(1);
}

await mkdir(dataDir, { recursive: true });

// Clear the data directory so a school that genuinely left does not linger.
for (const f of await readdir(dataDir).catch(() => [])) {
  if (f.endsWith('.json')) await rm(join(dataDir, f));
}

await writeFile(
  indexFile,
  `${JSON.stringify({ year, fetched: new Date().toISOString(), schools }, null, 0)}\n`,
);

for (const season of seasons.values()) {
  await writeFile(join(dataDir, `${season.school.slug}.json`), `${JSON.stringify(season)}\n`);
}

console.log(`  wrote ${schools.length} schools, ${seasons.size} season files`);
if (failed.length) console.warn(`  ? weeks that failed: ${failed.join(',')}`);
```

- [ ] **Step 3: Add the script to package.json**

In `package.json` `"scripts"`, after `"icons"`, add:

```json
    "directory": "node scripts/build-directory.mjs"
```

- [ ] **Step 4: Run it against the live source**

Run: `npm run directory`

Expected output, roughly:
```
  fetched 16/16 weeks, 4275 games
  wrote 734 schools, 734 season files
```

Verify Poland's file is right:

```bash
node -e "
const s=require('./public/oh/data/poland-seminary-poland.json');
console.log(s.school.name, '|', JSON.stringify(s.record));
console.log(s.games.map(g=>[g.date,(g.home?'vs ':'at ')+g.opponent,g.result?g.result.us+'-'+g.result.them:''].join(' ')).join('\n'));
"
```

Expected: `Poland Seminary | {"won":0,"lost":1,"played":1}` and ten games, the first `2026-08-21 vs Salem 17-21`.

- [ ] **Step 5: Make sure the data is committed, not ignored**

`.gitignore` ignores `public/*/`, which would swallow `public/oh/`. Add an exception immediately after the `!public/CNAME` line:

```
# The Ohio directory is committed data, not a build artefact — see
# docs/superpowers/plans/2026-08-22-ohio-directory.md
!public/oh/
```

Verify git will take it:

```bash
git check-ignore -v public/oh/index.json || echo "NOT IGNORED - good"
```

Expected: `NOT IGNORED - good`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/ohio-state.mjs scripts/build-directory.mjs package.json .gitignore public/oh/
git commit -m "Fetch Ohio's season and commit it as static files"
```

---

### Task 4: Isolate the new page from the old one

This is the task the whole plan exists to make safe. Do not merge it without the guard passing.

**Files:**
- Create: `oh/index.html`
- Create: `scripts/check-untouched.mjs`
- Modify: `vite.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a build that emits `dist/oh/index.html` from `src/oh/main.tsx`, with the root service worker refusing to answer `/oh/` navigations and refusing to precache `oh/data/**`.

- [ ] **Step 1: Record what Poland's build looks like today**

Before touching the config, capture the baseline the guard compares against:

```bash
npm run build
node -e "
const fs=require('fs');
const man=fs.readdirSync('dist').filter(f=>/^workbox-|^sw\.js$/.test(f));
const sw=fs.readFileSync('dist/sw.js','utf8');
const urls=[...sw.matchAll(/\"url\":\"([^\"]+)\"/g)].map(m=>m[1]);
const base={
  precache: urls.length,
  root: require('crypto').createHash('sha256').update(fs.readFileSync('dist/index.html')).digest('hex'),
  ysu: require('crypto').createHash('sha256').update(fs.readFileSync('dist/ysu/index.html')).digest('hex'),
  vc: require('crypto').createHash('sha256').update(fs.readFileSync('dist/victorychristian/index.html')).digest('hex'),
};
fs.writeFileSync('scripts/untouched-baseline.json', JSON.stringify(base,null,2)+'\n');
console.log(base);
"
```

If `precache` reads 0, the manifest is in a sibling file rather than inline — in that case read the `workbox-*.js` file instead. Whatever number it prints, that is the baseline.

- [ ] **Step 2: Write the guard**

Create `scripts/check-untouched.mjs`:

```js
/**
 * Poland must not change.
 *
 * People have this on a home screen and open it at a ground with no signal. The
 * Ohio directory is worth nothing next to that, so this fails the build rather
 * than let a config change reach an installed phone.
 *
 * Three things are checked, and each has already gone wrong somewhere:
 *   - the three built pages are byte-identical to the recorded baseline
 *   - the precache has not grown, so no phone starts downloading the state
 *   - the worker refuses /oh/, so it stops answering it with Poland's shell
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const baseline = JSON.parse(await readFile(join(root, 'scripts/untouched-baseline.json'), 'utf8'));
const problems = [];

const pages = {
  root: 'dist/index.html',
  ysu: 'dist/ysu/index.html',
  vc: 'dist/victorychristian/index.html',
};

for (const [key, file] of Object.entries(pages)) {
  const got = sha(await readFile(join(root, file)));
  if (got !== baseline[key]) problems.push(`${file} changed — it must not.`);
}

const sw = await readFile(join(root, 'dist/sw.js'), 'utf8');
const urls = [...sw.matchAll(/"url":"([^"]+)"/g)].map((m) => m[1]);

if (urls.length > baseline.precache) {
  problems.push(`precache grew from ${baseline.precache} to ${urls.length} entries.`);
}
if (urls.some((u) => u.startsWith('oh/'))) {
  problems.push('the directory is being precached — globIgnores is not working.');
}
if (!/denylist/.test(sw)) {
  problems.push('the worker has no navigateFallbackDenylist, so it will answer /oh/ with Poland.');
}

if (problems.length) {
  console.error('\n  Poland regression guard FAILED:');
  for (const p of problems) console.error(`   ! ${p}`);
  process.exit(1);
}
console.log('  Poland, YSU and Victory Christian are byte-identical. Precache unchanged.');
```

- [ ] **Step 3: Create the second entry point**

Create `oh/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1"
    />
    <meta name="theme-color" content="#04043a" />
    <meta name="description" content="Every Ohio high school football team, with schedules and scores." />
    <title>Ohio Football</title>
    <!--
      No manifest and no service worker registration, deliberately.

      The root app registers a worker whose navigation fallback is bound to
      Poland's index.html, and a second worker on the same origin is a way to
      break the first. This page caches what it needs in localStorage instead,
      which is enough: the school a reader picks is a few kilobytes.
    -->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/oh/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Make the three config changes**

In `vite.config.ts`, replace the `VitePWA({...})` call and add a `build` block:

```ts
    VitePWA({
      registerType: 'autoUpdate',
      // Each team writes its own manifest in scripts/build-teams.mjs, so the
      // plugin must not generate a competing one at the root.
      manifest: false,
      workbox: {
        // Every extension here earns its place. jpg is each team's badge.jpg,
        // the page background. png is the icon sets. json is schedule.json, and
        // webmanifest each team's manifest. Anything left out of this list is
        // missing with no signal, which is the one condition the app exists to
        // survive — the wallpaper and then the schedule were each lost that way.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2,json,webmanifest}'],
        /*
         * The state is not part of anybody's home screen app. Seven hundred
         * school files match the json pattern above and would otherwise be
         * downloaded onto every installed phone the next time the worker
         * updated.
         */
        globIgnores: ['**/oh/data/**', '**/oh/index.json'],
        /*
         * The fallback is bound to Poland's index.html and answers every
         * navigation from the precache. Without this the directory is served
         * Poland's shell — and because bakedTeam() falls back to the root team
         * for an unrecognised path, it would come up wearing Poland's colours.
         */
        navigateFallbackDenylist: [/^\/oh\//],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        oh: 'oh/index.html',
      },
    },
  },
```

- [ ] **Step 5: Wire the guard into the build**

In `package.json`, change the `build` script so the guard runs after the build:

```json
    "build": "node scripts/build-teams.mjs --pre && tsc --noEmit && vite build && node scripts/build-teams.mjs --post && node scripts/check-untouched.mjs",
```

- [ ] **Step 6: Build and confirm nothing moved**

Run: `npm run build`

Expected: the build completes and ends with
`Poland, YSU and Victory Christian are byte-identical. Precache unchanged.`

If the three pages differ, the second entry has changed how Vite hashes the main bundle. Fix it by keeping `main` first in the `input` map — do not "fix" it by updating the baseline.

- [ ] **Step 7: Confirm the worker changed in exactly the intended way**

```bash
node -e "
const sw=require('fs').readFileSync('dist/sw.js','utf8');
console.log('denylist present:', /denylist/.test(sw));
console.log('oh/ precached   :', /\"url\":\"oh\//.test(sw));
console.log('oh page built   :', require('fs').existsSync('dist/oh/index.html'));
"
```

Expected: `true`, `false`, `true`.

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts oh/ scripts/check-untouched.mjs scripts/untouched-baseline.json package.json
git commit -m "Give the directory its own page, and prove Poland did not move"
```

---

### Task 5: The search screen

**Files:**
- Create: `src/oh/store.ts`
- Create: `src/oh/main.tsx`
- Create: `src/oh/Directory.tsx`

**Interfaces:**
- Consumes: `public/oh/index.json` and `public/oh/data/<slug>.json` written by Task 3; the `School` and `SchoolSeason` types from `../ohio/stateModel`.
- Produces:
```ts
// store.ts
export function searchSchools(schools: School[], q: string): School[];
export function loadIndex(): Promise<School[]>;
export function loadSeason(slug: string): Promise<SchoolSeason>;  // Task 6 uses this
export function chosenSlug(): string | null;
export function choose(slug: string): void;
export function forget(): void;
```

- [ ] **Step 1: Write the failing test for search**

Create `src/oh/store.test.ts`:

```ts
import { searchSchools } from './store';

const schools = [
  { slug: 'jackson-jackson', name: 'Jackson', city: 'Jackson' },
  { slug: 'jackson-massillon', name: 'Jackson', city: 'Massillon' },
  { slug: 'poland-seminary-poland', name: 'Poland Seminary', city: 'Poland' },
  { slug: 'st-edward-lakewood', name: 'St Edward', city: 'Lakewood' },
];

describe('searchSchools', () => {
  it('finds a school by the start of its name', () => {
    expect(searchSchools(schools, 'pol').map((s) => s.slug)).toEqual(['poland-seminary-poland']);
  });

  it('finds both schools that share a name', () => {
    expect(searchSchools(schools, 'jackson')).toHaveLength(2);
  });

  it('lets the town narrow it down', () => {
    expect(searchSchools(schools, 'jackson mass').map((s) => s.slug)).toEqual(['jackson-massillon']);
  });

  it('ignores case and punctuation', () => {
    expect(searchSchools(schools, 'ST. EDWARD').map((s) => s.slug)).toEqual(['st-edward-lakewood']);
  });

  it('returns nothing for an empty query rather than the whole state', () => {
    expect(searchSchools(schools, '   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/oh/store.test.ts`
Expected: FAIL — `Failed to resolve import "./store"`.

- [ ] **Step 3: Write the store**

Create `src/oh/store.ts`:

```ts
/*
 * What the directory remembers.
 *
 * No service worker here — the root app has one and a second on the same
 * origin is a way to break the first. localStorage is enough: an index of
 * seven hundred schools is forty kilobytes and a season is three, so the
 * school a reader actually follows survives a dead signal at a ground, which
 * is the only offline case that matters.
 */

import type { School, SchoolSeason } from '../ohio/stateModel';

const CHOSEN = 'oh.school';
const INDEX = 'oh.index';
const SEASON = (slug: string) => `oh.season.${slug}`;

/** Punctuation and case are noise when somebody is typing at a game. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Every word typed has to match, against either the school or its town.
 *
 * "jackson mass" has to reach Jackson of Massillon, because there are three
 * Jacksons and the town is the only thing that separates them.
 */
export function searchSchools(schools: School[], q: string): School[] {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];

  return schools.filter((s) => {
    const hay = norm(`${s.name} ${s.city}`);
    return words.every((w) => hay.includes(w));
  });
}

export const chosenSlug = (): string | null => localStorage.getItem(CHOSEN);
export const choose = (slug: string): void => localStorage.setItem(CHOSEN, slug);
export const forget = (): void => localStorage.removeItem(CHOSEN);

/** Network first, then whatever was kept — the schedule screen's rule. */
export async function loadIndex(): Promise<School[]> {
  try {
    const res = await fetch(`/oh/index.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json();
      localStorage.setItem(INDEX, JSON.stringify(body.schools));
      return body.schools as School[];
    }
  } catch {
    // No signal, which is the normal case at a ground.
  }
  const kept = localStorage.getItem(INDEX);
  if (kept) return JSON.parse(kept) as School[];
  throw new Error('no index');
}

export async function loadSeason(slug: string): Promise<SchoolSeason> {
  try {
    const res = await fetch(`/oh/data/${slug}.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const season = (await res.json()) as SchoolSeason;
      // Only the followed school is kept. Caching every school browsed would
      // fill the jar with counties nobody will open again.
      if (slug === chosenSlug()) localStorage.setItem(SEASON(slug), JSON.stringify(season));
      return season;
    }
  } catch {
    /* no signal */
  }
  const kept = localStorage.getItem(SEASON(slug));
  if (kept) return JSON.parse(kept) as SchoolSeason;
  throw new Error('no season');
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/oh/store.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the entry point and search screen**

Create `src/oh/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Directory } from './Directory';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Directory />
  </StrictMode>,
);
```

Create `src/oh/Directory.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { School } from '../ohio/stateModel';
import { choose, chosenSlug, forget, loadIndex, searchSchools } from './store';
import { School as SchoolScreen } from './School';

/**
 * Every school in Ohio, and the one you follow.
 *
 * The picker is the first run and then gets out of the way — somebody opening
 * this at their own child's game wants the game, not a search box. Changing
 * school stays one tap away, because families follow more than one.
 */
export function Directory() {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [slug, setSlug] = useState<string | null>(() => chosenSlug());

  useEffect(() => {
    loadIndex()
      .then(setSchools)
      .catch(() => setFailed(true));
  }, []);

  const hits = useMemo(() => (schools ? searchSchools(schools, q).slice(0, 40) : []), [schools, q]);

  if (slug) {
    return (
      <SchoolScreen
        slug={slug}
        onChange={() => {
          forget();
          setSlug(null);
          setQ('');
        }}
      />
    );
  }

  if (failed) {
    return (
      <div className="screen">
        <p className="empty-text">Couldn’t load the list of schools. Try again with a signal.</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <h1 className="next-card-opponent">Find your school</h1>
      <p className="filter-line">
        <span>{schools ? `${schools.length} Ohio teams` : 'Loading…'}</span>
      </p>

      <input
        className="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="School or town"
        autoComplete="off"
        aria-label="Search for a school"
      />

      <div className="fixtures">
        {hits.map((s) => (
          <button
            key={s.slug}
            type="button"
            className="fixture-row"
            onClick={() => {
              choose(s.slug);
              setSlug(s.slug);
            }}
          >
            <span className="fixture-team">
              {s.name}
              {/* The town always shows. Three schools are called Jackson and a
                  reader who does not know that cannot know when it matters. */}
              <span className="fixture-sub">{s.city}</span>
            </span>
          </button>
        ))}
        {q.trim() && !hits.length && <p className="empty-text">No school by that name.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/oh/
git commit -m "Find your school, out of every team in Ohio"
```

---

### Task 6: The school screen

**Files:**
- Create: `src/oh/School.tsx`

**Interfaces:**
- Consumes: `loadSeason` from `./store`; `SchoolSeason`, `SchoolGame` from `../ohio/stateModel`.
- Produces: `export function School({ slug, onChange }: { slug: string; onChange: () => void })`

- [ ] **Step 1: Write the screen**

Create `src/oh/School.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { SchoolGame, SchoolSeason } from '../ohio/stateModel';
import { loadSeason } from './store';

/** "2026-08-21" -> "Fri 21 Aug", in the reader's own locale. */
const when = (g: SchoolGame) =>
  new Date(`${g.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/**
 * One school's season: what is coming, and what has happened.
 *
 * The same order the Schedule tab settled on — next game first, results
 * underneath most recent first — because the two games either side of tonight
 * are the pair anybody is actually comparing.
 */
export function School({ slug, onChange }: { slug: string; onChange: () => void }) {
  const [season, setSeason] = useState<SchoolSeason | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSeason(null);
    setFailed(false);
    loadSeason(slug)
      .then(setSeason)
      .catch(() => setFailed(true));
  }, [slug]);

  if (failed) {
    return (
      <div className="screen">
        <p className="empty-text">Couldn’t load that school. Try again with a signal.</p>
        <button type="button" className="fixture-row" onClick={onChange}>
          Pick another school
        </button>
      </div>
    );
  }

  if (!season) {
    return (
      <div className="screen">
        <p className="empty-text">Loading…</p>
      </div>
    );
  }

  const played = season.games.filter((g) => g.result);
  const coming = season.games.filter((g) => !g.result);

  return (
    <div className="screen">
      <h1 className="next-card-opponent">{season.school.name}</h1>
      <p className="filter-line">
        <span>
          {season.school.city}
          {season.record.played > 0 && ` · ${season.record.won}–${season.record.lost}`}
        </span>
      </p>

      {coming.length > 0 && (
        <>
          <div className="group-head">Coming up</div>
          {coming.map((g) => (
            <div className="fixture" key={`${g.date}-${g.opponent}`}>
              <div className="fixture-row">
                <span className="fixture-date">{when(g)}</span>
                <span className="fixture-team">
                  <span className="fixture-ha">{g.home ? 'vs' : 'at'}</span> {g.opponent}
                  <span className="fixture-sub">{g.opponentCity}</span>
                </span>
                <span className="fixture-result">{g.kickoff}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {played.length > 0 && (
        <>
          <div className="group-head">Played</div>
          {[...played].reverse().map((g) => (
            <div className="fixture is-played" key={`${g.date}-${g.opponent}`}>
              <div className="fixture-row">
                <span className="fixture-date">{when(g)}</span>
                <span className="fixture-team">
                  <span className="fixture-ha">{g.home ? 'vs' : 'at'}</span> {g.opponent}
                  <span className="fixture-sub">
                    {g.opponentCity}
                    {g.overtime ? ` · ${g.overtime}` : ''}
                  </span>
                </span>
                <span className="fixture-result">
                  <span className={`form-chip ${g.result!.won ? 'won' : 'lost'}`}>
                    {g.result!.won ? 'W' : 'L'}
                  </span>{' '}
                  {g.result!.us}–{g.result!.them}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      <button type="button" className="fixture-row" onClick={onChange}>
        <span className="fixture-team">Follow a different school</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build and look at it**

```bash
npm run build
npx vite preview --port 4173
```

Open `http://localhost:4173/oh/`, search "poland", pick Poland Seminary. Expect the record `0–1`, nine fixtures under **Coming up**, and `L 17–21 vs Salem` under **Played**.

Then confirm the old app is untouched: open `http://localhost:4173/` and check Lookup, Team, Schedule and League all behave as before.

- [ ] **Step 3: Commit**

```bash
git add src/oh/School.tsx
git commit -m "One school's season, for any school in Ohio"
```

---

### Task 7: The roster hook

**Files:**
- Modify: `src/oh/School.tsx`

**Interfaces:**
- Consumes: `SchoolSeason` from `../ohio/stateModel`.
- Produces: no new exports.

This is the commercial point of the whole build: it turns a fan into somebody asking their athletic director to buy this.

- [ ] **Step 1: Add the panel**

In `src/oh/School.tsx`, immediately after the `<p className="filter-line">…</p>` block, insert:

```tsx
      {/*
        The reason the directory exists.
    
        Every school in the state gets a schedule and scores for nothing, and
        the one thing missing is the thing only the school can give — the
        roster. A reader who wanted to know who number seventeen was is the
        best possible person to go and ask for it.
      */}
      <section className="next-card">
        <p className="next-card-label">Roster not added yet</p>
        <p className="next-when">
          {season.school.name} hasn’t published their roster, so there’s no way to look up a number
          yet.
        </p>
        <a
          className="fixture-row"
          href={`mailto:?subject=${encodeURIComponent(
            `A roster app for ${season.school.name}`,
          )}&body=${encodeURIComponent(
            `I was at the game looking up jersey numbers and found this:\n\n` +
              `${location.origin}/oh/\n\n` +
              `${season.school.name}'s schedule and scores are already on it, but the roster ` +
              `isn't — that part has to come from the team. Any chance we could get ours added?\n`,
          )}`}
        >
          <span className="fixture-team">Ask the school to add it</span>
        </a>
      </section>
```

- [ ] **Step 2: Check it renders and the link is well formed**

```bash
npm run build && npx vite preview --port 4173
```

Open `/oh/`, pick any school, and confirm the panel appears with the school's name in it. Click the link and check the mail draft carries the school name in the subject.

- [ ] **Step 3: Commit**

```bash
git add src/oh/School.tsx
git commit -m "Point the people who want a roster at the people who have one"
```

---

### Task 8: Keep it current

**Files:**
- Create: `.github/workflows/directory.yml`

**Interfaces:**
- Consumes: `npm run directory` from Task 3.
- Produces: a scheduled job that commits changed data and lets the existing deploy publish it.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/directory.yml`:

```yaml
name: Refresh the Ohio directory

# Ohio plays on a Friday night. This runs early Saturday for the scores, and
# again on Wednesday to pick up a fixture that has moved. Sixteen requests a
# run against one person's hobby site, which is the whole budget.
#
# It commits to main, and that push is what triggers the deploy — so the data
# reaches the site through the ordinary route rather than a second publisher.
on:
  schedule:
    - cron: '0 7 * * 6'
    - cron: '0 7 * * 3'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: directory
  cancel-in-progress: false

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      # Exits non-zero if the fetch came back with too few schools, which keeps
      # the committed copy rather than deleting schools people have bookmarked.
      - run: npm run directory

      - name: Commit whatever changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add public/oh/
          if git diff --staged --quiet; then
            echo "No change in the state's scores."
            exit 0
          fi
          git commit -m "Ohio scores, $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 2: Test it without waiting for Saturday**

```bash
gh workflow run directory.yml
sleep 10
gh run watch "$(gh run list --workflow=directory.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Expected: green. On the first run after the data is already committed and current, expect `No change in the state's scores.`

- [ ] **Step 3: Confirm the deploy that follows still guards Poland**

If the refresh did push, a deploy will have been triggered. Watch it and confirm it ends with the guard passing:

```bash
gh run watch "$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Expected: `Poland, YSU and Victory Christian are byte-identical. Precache unchanged.`

- [ ] **Step 4: Verify the live site**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://roster.scottforge.ai/oh/
curl -s https://roster.scottforge.ai/oh/data/poland-seminary-poland.json | head -c 200
```

Expected: `200`, and Poland's season JSON.

Then confirm the old app is still itself:

```bash
curl -s https://roster.scottforge.ai/ | grep -c "__TEAMS__"
```

Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/directory.yml
git commit -m "Refresh Ohio after Friday night, and again midweek"
```

---

## Notes for whoever executes this

**The one thing that must not happen** is a change to `/`, `/ysu/` or `/victorychristian/`. Task 4 builds a guard for exactly that and wires it into `npm run build`. If it fails, the answer is never to update `scripts/untouched-baseline.json` — that file is the record of how the app behaved before this work, and rewriting it to make a build pass is how the constraint gets quietly dropped.

**The source is one person's website.** Every request carries a User-Agent that says who it is, weeks are fetched one at a time with a pause, and the whole refresh is sixteen requests twice a week. Do not add a per-school fetch loop; the scoreboard already has everything, and 734 team pages would be a different relationship with that server entirely.

**Fixtures are the record of what the source looked like.** If a parser test fails, diff a fresh capture against `src/ohio/fixtures/` before touching a regex. The test failing is the system working.

## Deferred, deliberately

Named here so nobody wonders whether they were forgotten:

- **The teams index** (`/hsfoot/teams`, 720 schools with team ids). Not fetched. The scoreboards yield 734 Ohio schools on their own — more than the index — and deriving the directory from one source rather than two removes a join that cannot be made reliably anyway: the index prints bare names, so for the 45 shared names it cannot say which id belongs to which town.
- **Team ids, divisions, regions and the playoff picture.** These need the index join above, or a one-time capture of ~70 team pages. Worth doing when the playoff race is the feature; not needed for search, schedules or scores.
- **Rosters for any school beyond the three already built in.** That needs accounts, payment, and school authorisation rather than a coach's say-so — a different piece of work, and the one with real privacy weight behind it.
- **Merging the directory into the main app**, or putting Poland behind a school picker. Poland's installed apps open at `/` and must keep doing so.
