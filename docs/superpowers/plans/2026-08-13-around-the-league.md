# Around the League Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth tab for Poland showing the Northeast 8's games and standings, and Poland's OHSAA playoff region table.

**Architecture:** A build-time fetch of eight `joeeitel.com` pages writes `public/league.json`; the screen reads it network-first like `schedule.json` already does. The fragile half — HTML parsing — is pure functions over saved fixtures with unit tests; the fetch half has no logic. Derivation (deduplicate, standings, weeks) is a third pure module so each file has one job.

**Tech Stack:** TypeScript, React 18, Vite, Vitest. No new dependencies — parsing is regex over classed HTML, matching how `icalParse.ts` handles iCal.

## Global Constraints

- **Poland only.** The tab is gated on `bakedTeam()?.league`. YSU and Victory Christian must render exactly as they do today.
- **Current season only.** No historical years in this tab.
- **Never hardcode division or region.** Poland was D-V Region 17 in 2025 and is D-IV Region 13 in 2026. Both are read from Poland's own page every build.
- **Stale beats empty.** A failed fetch, or a parse yielding zero rows, keeps the previous `league.json` and warns. It must never overwrite good data with an empty file.
- **Identify the fetcher.** `User-Agent: rosterapp (github.com/kmccb/rosterapp)`, matching the existing ESPN and calendar fetches.
- **Reuse existing CSS.** `.control-bar`, `.seg`, `.group-head`, `.filter-line`, `.form-chip` already exist and are already shared by three screens. Add only what is genuinely new.
- **Verified source facts** (2026-08-13): Poland teamID `1264`. Northeast 8 rivals — Girard `644`, Hubbard `738`, Lakeview `828`, Niles McKinley `994`, South Range `1460`, Struthers `1500`. Region 13 lists 24 teams, 12 marked `qualifyingPosition`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/league/fixtures/*.html` | Real saved pages. The tests' only input. |
| `src/league/leagueParse.ts` | HTML string in, typed rows out. No fetching, no derivation. |
| `src/league/leagueParse.test.ts` | Parser tests over the fixtures. |
| `src/league/leagueModel.ts` | Deduplicate, standings, week grouping. No HTML, no fetching. |
| `src/league/leagueModel.test.ts` | Model tests over hand-built inputs. |
| `scripts/lib/ohio.mjs` | Fetch and orchestrate. Calls the parser; holds no parsing. |
| `scripts/build-teams.mjs` | One call writing `league.json`, mirroring the schedule step. |
| `teams/poland/team.json` | `league` config block. |
| `src/screens/League.tsx` | The screen and its two segments. |
| `src/App.tsx` | The tab. |
| `src/styles.css` | Only what the standings and region tables genuinely need. |

---

### Task 1: Save the fixtures

The tests must run against real pages, and the fixtures are what catch the source changing shape. Save them once, commit them, never regenerate casually.

**Files:**
- Create: `src/league/fixtures/team-2025-poland.html`
- Create: `src/league/fixtures/team-2026-poland.html`
- Create: `src/league/fixtures/region-2026-13.html`

**Interfaces:**
- Consumes: nothing.
- Produces: three fixture files read by every later test.

- [ ] **Step 1: Fetch and save all three**

```bash
node -e "
const fs = require('fs');
const UA = { headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' } };
const save = async (url, path) => {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  fs.writeFileSync(path, await r.text());
  console.log(path, fs.statSync(path).size, 'bytes');
};
(async () => {
  fs.mkdirSync('src/league/fixtures', { recursive: true });
  await save('https://joeeitel.com/hsfoot/teams.jsp?teamID=1264&year=2025', 'src/league/fixtures/team-2025-poland.html');
  await save('https://joeeitel.com/hsfoot/teams.jsp?teamID=1264&year=2026', 'src/league/fixtures/team-2026-poland.html');
  await save('https://joeeitel.com/hsfoot/rankings/2026/region-13', 'src/league/fixtures/region-2026-13.html');
})();
"
```

- [ ] **Step 2: Confirm they contain what the parser needs**

```bash
grep -c "gameDate" src/league/fixtures/team-2025-poland.html
grep -c "qualifyingPosition" src/league/fixtures/region-2026-13.html
grep -o "Division [IVX]*, Region [0-9]*" src/league/fixtures/team-2025-poland.html
grep -o "Division [IVX]*, Region [0-9]*" src/league/fixtures/team-2026-poland.html
```

Expected: `12` game rows for 2025, `12` qualifying markers, then `Division V, Region 17` and `Division IV, Region 13`. If the last two disagree, the source changed — stop and re-read the spec's risk section before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/league/fixtures
git commit -m "Save joeeitel fixtures for the league parser"
```

---

### Task 2: Parse a team page

**Files:**
- Create: `src/league/leagueParse.ts`
- Test: `src/league/leagueParse.test.ts`

**Interfaces:**
- Consumes: fixtures from Task 1.
- Produces:

```ts
export type TeamGame = {
  /** ISO, e.g. "2025-08-22". The season never crosses a new year. */
  date: string;
  home: boolean;
  opponent: string;
  opponentId: number;
  /** Their record as printed, e.g. "7-5". */
  opponentRecord: string;
  /** Absent until played. Us first, them second. */
  result?: { us: number; them: number };
};

export type TeamPage = {
  name: string;
  record: string;
  /** Roman, as printed: "IV". */
  division: string;
  region: number;
  games: TeamGame[];
};

export function parseTeamPage(html: string, year: number): TeamPage;
```

- [ ] **Step 1: Write the failing test**

```ts
// src/league/leagueParse.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTeamPage } from './leagueParse';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseTeamPage', () => {
  const played = parseTeamPage(fixture('team-2025-poland.html'), 2025);

  it('reads the team, its record and where it is filed', () => {
    expect(played.name).toBe('Poland Seminary');
    expect(played.record).toBe('9-3');
    // Never hardcode this: it moved to IV:13 the following season.
    expect(played.division).toBe('V');
    expect(played.region).toBe(17);
  });

  it('reads a played game, opponent id and all', () => {
    const opener = played.games[0];
    expect(opener).toMatchObject({
      date: '2025-08-22',
      home: false,
      opponent: 'Salem',
      opponentId: 1392,
      opponentRecord: '7-5',
      result: { us: 48, them: 26 },
    });
  });

  it('keeps the loss the right way round', () => {
    const girard = played.games.find((g) => g.opponent === 'Girard' && g.date === '2025-10-10');
    expect(girard?.result).toEqual({ us: 28, them: 29 });
  });

  it('finds every game on the page', () => {
    expect(played.games).toHaveLength(12);
  });

  it('leaves a fixture with no score unplayed rather than nil-nil', () => {
    const upcoming = parseTeamPage(fixture('team-2026-poland.html'), 2026);
    expect(upcoming.division).toBe('IV');
    expect(upcoming.region).toBe(13);
    expect(upcoming.games).toHaveLength(10);
    expect(upcoming.games[0]).toMatchObject({
      date: '2026-08-21',
      home: true,
      opponent: 'Salem',
    });
    expect(upcoming.games[0].result).toBeUndefined();
  });

  it('resolves every Northeast 8 rival from Poland own page', () => {
    const upcoming = parseTeamPage(fixture('team-2026-poland.html'), 2026);
    const byName = Object.fromEntries(upcoming.games.map((g) => [g.opponent, g.opponentId]));
    expect(byName).toMatchObject({
      Girard: 644, Hubbard: 738, Lakeview: 828,
      'Niles McKinley': 994, 'South Range': 1460, Struthers: 1500,
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/league/leagueParse.test.ts`
Expected: FAIL — cannot resolve `./leagueParse`.

- [ ] **Step 3: Write the parser**

```ts
// src/league/leagueParse.ts

/**
 * Ohio high school football, read off the one site that publishes it.
 *
 * There is no API. This parses `joeeitel.com`, which is a person rather than a
 * company, so the target can change without warning — everything here is a
 * pure function over a string and every one of them is pinned to a saved copy
 * of a real page. A change in shape fails a test on this machine instead of
 * emptying the screen on somebody's phone.
 */

export type TeamGame = {
  /** ISO, e.g. "2025-08-22". The season never crosses a new year. */
  date: string;
  home: boolean;
  opponent: string;
  opponentId: number;
  /** Their record as printed, e.g. "7-5". */
  opponentRecord: string;
  /** Absent until played. Us first, them second. */
  result?: { us: number; them: number };
};

export type TeamPage = {
  name: string;
  record: string;
  /** Roman, as printed: "IV". */
  division: string;
  region: number;
  games: TeamGame[];
};

/** Cell contents by class, with the tags and the whitespace taken out. */
const cell = (row: string, className: string): string => {
  const m = row.match(new RegExp(`<td[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`));
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
};

export function parseTeamPage(html: string, year: number): TeamPage {
  const caption = html.match(/<caption>\s*<strong>\s*\d{4}\s+([\s\S]+?)\s+Football\s+\((\d+-\d+)\)/);
  const filed = html.match(/Division\s+([IVXL]+),\s*Region\s+(\d+)/);

  const games: TeamGame[] = [];
  for (const [, row] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const date = cell(row, 'gameDate');
    if (!/^\d{1,2}\/\d{1,2}$/.test(date)) continue; // header and footnote rows

    const link = row.match(/<a class="teamLink" href="teams\.jsp\?teamID=(\d+)/);
    if (!link) continue;

    const [month, day] = date.split('/');
    // A playoff row carries a '#' before the name; the record follows it.
    const opponentCell = cell(row, 'opponent');
    const opponent = opponentCell.replace(/^#\s*/, '').replace(/\s*\(\d+-\d+\)\s*$/, '').trim();
    const score = cell(row, 'score').match(/^(\d+)-(\d+)$/);

    games.push({
      date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      home: cell(row, 'homeAway').toUpperCase().startsWith('H'),
      opponent,
      opponentId: Number(link[1]),
      opponentRecord: (opponentCell.match(/\((\d+-\d+)\)/) ?? [, ''])[1],
      ...(score ? { result: { us: Number(score[1]), them: Number(score[2]) } } : {}),
    });
  }

  return {
    name: caption?.[1].trim() ?? '',
    record: caption?.[2] ?? '',
    division: filed?.[1] ?? '',
    region: Number(filed?.[2] ?? 0),
    games,
  };
}
```

- [ ] **Step 4: Run the tests until they pass**

Run: `npx vitest run src/league/leagueParse.test.ts`
Expected: PASS, 6 tests.

If the `#` playoff rows in the 2025 fixture break the opponent name, fix the strip in `parseTeamPage` — do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/league/leagueParse.ts src/league/leagueParse.test.ts
git commit -m "Read an Ohio team page into games"
```

---

### Task 3: Parse the region page

**Files:**
- Modify: `src/league/leagueParse.ts`
- Modify: `src/league/leagueParse.test.ts`

**Interfaces:**
- Consumes: `src/league/fixtures/region-2026-13.html`.
- Produces:

```ts
export type RegionRow = {
  /** As printed — "1t" when tied. */
  rank: string;
  school: string;
  teamId: number;
  record: string;
  /** Harbin average, the number seeding is decided on. */
  average: number;
  /** The site marks the rows currently in a playoff place. */
  qualifying: boolean;
};

export type RegionTable = {
  /** "Top 12 teams following week 10 qualify for playoffs" */
  caption: string;
  rows: RegionRow[];
};

export function parseRegionTable(html: string): RegionTable;
```

- [ ] **Step 1: Write the failing test**

```ts
// append to src/league/leagueParse.test.ts
import { parseRegionTable } from './leagueParse';

describe('parseRegionTable', () => {
  const table = parseRegionTable(fixture('region-2026-13.html'));

  it('keeps the caption, which states the cut', () => {
    expect(table.caption).toBe('Top 12 teams following week 10 qualify for playoffs');
  });

  it('reads every team in the region', () => {
    expect(table.rows).toHaveLength(24);
  });

  it('marks exactly the rows the site marks as qualifying', () => {
    expect(table.rows.filter((r) => r.qualifying)).toHaveLength(12);
  });

  it('finds Poland, which is what the screen picks out', () => {
    const poland = table.rows.find((r) => r.school === 'Poland Seminary');
    expect(poland).toBeDefined();
    expect(poland!.teamId).toBe(1264);
  });

  it('reads a row whole', () => {
    const first = table.rows[0];
    expect(first.rank).toBe('1t');
    expect(first.record).toBe('0-0');
    expect(typeof first.average).toBe('number');
    expect(Number.isNaN(first.average)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/league/leagueParse.test.ts`
Expected: FAIL — `parseRegionTable` is not exported.

- [ ] **Step 3: Write the parser**

```ts
// append to src/league/leagueParse.ts

export type RegionRow = {
  /** As printed — "1t" when tied. */
  rank: string;
  school: string;
  teamId: number;
  record: string;
  /** Harbin average, the number seeding is decided on. */
  average: number;
  /** The site marks the rows currently in a playoff place. */
  qualifying: boolean;
};

export type RegionTable = {
  /** "Top 12 teams following week 10 qualify for playoffs" */
  caption: string;
  rows: RegionRow[];
};

const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/**
 * The playoff picture, which in Ohio is a points table rather than a league
 * one. The site already marks the rows in a qualifying place, so that is read
 * rather than recomputed from the caption — it knows the rule, this does not.
 */
export function parseRegionTable(html: string): RegionTable {
  const caption = html.match(/<caption>([\s\S]*?)<\/caption>/);
  const rows: RegionRow[] = [];

  for (const m of html.matchAll(/<tr class="(?:odd|even)([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const qualifying = /qualifyingPosition/.test(m[1]);
    const body = m[2];
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]));
    const link = body.match(/teams\.jsp\?teamID=(\d+)/);
    if (cells.length < 6 || !link) continue;

    rows.push({
      rank: cells[0],
      record: cells[1],
      school: cells[4],
      teamId: Number(link[1]),
      average: Number(cells[5]),
      qualifying,
    });
  }

  return { caption: strip(caption?.[1] ?? ''), rows };
}
```

Delete the dead first `for` loop before running — it is there only to show the shape and must not ship. If `cells[4]` is not the school name in the fixture, log `cells` for one row and correct the indices; the columns are Rank, W-L, ID, City, School, Average.

- [ ] **Step 4: Run the tests until they pass**

Run: `npx vitest run src/league/leagueParse.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/league/leagueParse.ts src/league/leagueParse.test.ts
git commit -m "Read an Ohio playoff region table"
```

---

### Task 4: Derive games, standings and weeks

**Files:**
- Create: `src/league/leagueModel.ts`
- Test: `src/league/leagueModel.test.ts`

**Interfaces:**
- Consumes: `TeamPage` from Task 2.
- Produces:

```ts
export type LeagueGame = {
  date: string;
  home: string;
  away: string;
  result?: { home: number; away: number };
  isLeagueGame: boolean;
};

export type Standing = {
  name: string;
  overall: string;
  leagueRecord: string;
};

export type Week = { week: number; label: string; games: LeagueGame[] };

export function toLeagueGames(pages: TeamPage[], members: string[]): LeagueGame[];
export function standings(pages: TeamPage[], members: string[]): Standing[];
export function byWeek(games: LeagueGame[]): Week[];
```

- [ ] **Step 1: Write the failing test**

```ts
// src/league/leagueModel.test.ts
import { describe, expect, it } from 'vitest';
import { byWeek, standings, toLeagueGames } from './leagueModel';
import type { TeamPage } from './leagueParse';

const MEMBERS = ['Poland Seminary', 'Girard', 'Hubbard'];

const page = (name: string, games: TeamPage['games']): TeamPage => ({
  name, record: '', division: 'IV', region: 13, games,
});

const game = (date: string, opponent: string, home: boolean, us?: number, them?: number) => ({
  date, home, opponent, opponentId: 0, opponentRecord: '',
  ...(us === undefined ? {} : { result: { us, them: them! } }),
});

describe('toLeagueGames', () => {
  it('collapses one game that appears on both teams pages', () => {
    const pages = [
      page('Poland Seminary', [game('2026-09-18', 'Hubbard', true, 42, 14)]),
      page('Hubbard', [game('2026-09-18', 'Poland Seminary', false, 14, 42)]),
    ];
    const games = toLeagueGames(pages, MEMBERS);
    expect(games).toHaveLength(1);
    expect(games[0]).toEqual({
      date: '2026-09-18', home: 'Poland Seminary', away: 'Hubbard',
      result: { home: 42, away: 14 }, isLeagueGame: true,
    });
  });

  it('keeps a game against an outsider, and says it is not a league game', () => {
    const pages = [page('Poland Seminary', [game('2026-08-21', 'Salem', true)])];
    const games = toLeagueGames(pages, MEMBERS);
    expect(games).toHaveLength(1);
    expect(games[0].isLeagueGame).toBe(false);
    expect(games[0].result).toBeUndefined();
  });
});

describe('standings', () => {
  it('counts only conference opponents in the league record', () => {
    const pages = [
      page('Poland Seminary', [
        game('2026-08-21', 'Salem', true, 48, 26),      // outsider, ignored
        game('2026-09-18', 'Hubbard', true, 42, 14),    // league win
        game('2026-10-09', 'Girard', true, 28, 29),     // league loss
        game('2026-10-30', 'Lakeview', true),           // unplayed, ignored
      ]),
    ];
    const [poland] = standings(pages, MEMBERS);
    expect(poland).toEqual({ name: 'Poland Seminary', overall: '2-1', leagueRecord: '1-1' });
  });

  it('sorts on league record, then overall', () => {
    const pages = [
      page('Hubbard', [game('2026-09-18', 'Poland Seminary', false, 14, 42)]),
      page('Poland Seminary', [game('2026-09-18', 'Hubbard', true, 42, 14)]),
    ];
    expect(standings(pages, MEMBERS).map((s) => s.name)).toEqual(['Poland Seminary', 'Hubbard']);
  });
});

describe('byWeek', () => {
  it('puts a Thursday and a Saturday in the same football week', () => {
    // 2026-09-17 is a Thursday, 2026-09-19 the Saturday after it.
    const weeks = byWeek([
      { date: '2026-09-17', home: 'A', away: 'B', isLeagueGame: true },
      { date: '2026-09-19', home: 'C', away: 'D', isLeagueGame: true },
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].games).toHaveLength(2);
  });

  it('numbers weeks that have games, and puts the newest first', () => {
    const weeks = byWeek([
      { date: '2026-08-21', home: 'A', away: 'B', isLeagueGame: true },
      { date: '2026-09-18', home: 'C', away: 'D', isLeagueGame: true },
    ]);
    // Two weeks apart on the calendar, but weeks are numbered by position
    // among weeks that actually have games — the source gives no season start
    // date, so numbering the empty ones would be invention. Newest first.
    expect(weeks.map((w) => w.week)).toEqual([2, 1]);
    expect(weeks[0].games[0].date).toBe('2026-09-18');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/league/leagueModel.test.ts`
Expected: FAIL — cannot resolve `./leagueModel`.

- [ ] **Step 3: Write the model**

```ts
// src/league/leagueModel.ts
import type { TeamPage } from './leagueParse';

export type LeagueGame = {
  date: string;
  home: string;
  away: string;
  result?: { home: number; away: number };
  isLeagueGame: boolean;
};

export type Standing = { name: string; overall: string; leagueRecord: string };
export type Week = { week: number; label: string; games: LeagueGame[] };

/**
 * One fixture appears on two teams' pages, so it arrives twice and has to be
 * collapsed. Keyed on the date and the two schools sorted, which is the same
 * key whichever side reported it.
 */
const keyOf = (g: LeagueGame) => `${g.date}|${[g.home, g.away].sort().join('|')}`;

export function toLeagueGames(pages: TeamPage[], members: string[]): LeagueGame[] {
  const seen = new Map<string, LeagueGame>();

  for (const page of pages) {
    for (const g of page.games) {
      const home = g.home ? page.name : g.opponent;
      const away = g.home ? g.opponent : page.name;
      const one: LeagueGame = {
        date: g.date,
        home,
        away,
        isLeagueGame: members.includes(page.name) && members.includes(g.opponent),
        ...(g.result
          ? { result: g.home
              ? { home: g.result.us, away: g.result.them }
              : { home: g.result.them, away: g.result.us } }
          : {}),
      };
      // First writer wins unless the second carries a score the first lacked.
      const existing = seen.get(keyOf(one));
      if (!existing || (!existing.result && one.result)) seen.set(keyOf(one), one);
    }
  }

  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const tally = (games: TeamPage['games'], only?: string[]) => {
  let won = 0;
  let lost = 0;
  for (const g of games) {
    if (!g.result) continue;
    if (only && !only.includes(g.opponent)) continue;
    if (g.result.us > g.result.them) won += 1;
    else lost += 1;
  }
  return `${won}-${lost}`;
};

const asPair = (record: string) => record.split('-').map(Number);

export function standings(pages: TeamPage[], members: string[]): Standing[] {
  return pages
    .filter((p) => members.includes(p.name))
    .map((p) => ({
      name: p.name,
      overall: tally(p.games),
      leagueRecord: tally(p.games, members),
    }))
    .sort((a, b) => {
      const [aw, al] = asPair(a.leagueRecord);
      const [bw, bl] = asPair(b.leagueRecord);
      if (bw - bl !== aw - al) return bw - bl - (aw - al);
      const [aow, aol] = asPair(a.overall);
      const [bow, bol] = asPair(b.overall);
      return bow - bol - (aow - aol);
    });
}

/**
 * A football week is Monday to Sunday, because a Thursday game and the
 * Saturday after it belong to the same round and dividing on the date alone
 * would split them.
 */
const mondayOf = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export function byWeek(games: LeagueGame[]): Week[] {
  const buckets = new Map<string, LeagueGame[]>();
  for (const g of games) {
    const k = mondayOf(g.date);
    buckets.set(k, [...(buckets.get(k) ?? []), g]);
  }

  const mondays = [...buckets.keys()].sort();
  return mondays
    .map((monday, i) => ({
      week: i + 1,
      label: new Date(`${monday}T12:00:00`).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      }),
      games: buckets.get(monday)!,
    }))
    .reverse();
}
```

- [ ] **Step 4: Run the tests until they pass**

Run: `npx vitest run src/league/leagueModel.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/league/leagueModel.ts src/league/leagueModel.test.ts
git commit -m "Derive league games, standings and weeks"
```

---

### Task 5: Fetch the pages and write league.json

**Files:**
- Create: `scripts/lib/ohio.mjs`
- Modify: `scripts/build-teams.mjs`
- Modify: `teams/poland/team.json`

**Interfaces:**
- Consumes: `parseTeamPage`, `parseRegionTable`, `toLeagueGames`, `standings` from Tasks 2–4.
- Produces: `export async function fetchLeague(config, year)` returning the `league.json` object, or `null` when anything came back empty.

- [ ] **Step 1: Add the config block**

In `teams/poland/team.json`, alongside `"schedule"`:

```json
  "league": {
    "source": "joeeitel",
    "teamId": 1264,
    "conference": "Northeast 8",
    "members": [
      "Poland Seminary", "Girard", "Hubbard", "Lakeview",
      "Niles McKinley", "South Range", "Struthers"
    ]
  },
```

`members` is names, not ids. The ids are read from Poland's own page each build, because Poland plays all six and a hand-copied id goes stale the season somebody reorganises.

- [ ] **Step 2: Write the fetcher**

```js
// scripts/lib/ohio.mjs

/**
 * Ohio high school football, from the one place that publishes all of it.
 *
 * Poland's own page is the entry point: it names the division and region the
 * team is in this season, and it links every conference rival by id, because
 * Poland plays all six. So the roster of teams to fetch resolves itself rather
 * than being a list that rots.
 *
 * All parsing lives in src/league/leagueParse.ts and is tested against saved
 * pages. Nothing here does any.
 */
import { parseRegionTable, parseTeamPage } from '../../src/league/leagueParse.ts';
import { standings, toLeagueGames } from '../../src/league/leagueModel.ts';

const TEAM = (id, year) => `https://joeeitel.com/hsfoot/teams.jsp?teamID=${id}&year=${year}`;
const REGION = (year, n) => `https://joeeitel.com/hsfoot/rankings/${year}/region-${n}`;

const getHtml = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' },
    signal: AbortSignal.timeout(20000),
  });
  return res.ok ? res.text() : null;
};

export async function fetchLeague(config, year) {
  const ownHtml = await getHtml(TEAM(config.teamId, year));
  if (!ownHtml) return null;

  const own = parseTeamPage(ownHtml, year);
  // An empty parse means the page changed shape. Say nothing rather than
  // something wrong — the caller keeps the previous file.
  if (!own.name || !own.games.length || !own.region) return null;

  // The rivals, by the ids printed on Poland's own schedule.
  const wanted = config.members.filter((m) => m !== own.name);
  const ids = new Map();
  for (const g of own.games) if (wanted.includes(g.opponent)) ids.set(g.opponent, g.opponentId);

  const others = [];
  for (const [name, id] of ids) {
    const html = await getHtml(TEAM(id, year));
    const page = html && parseTeamPage(html, year);
    if (page?.games.length) others.push(page);
    else console.warn(`  ! league: no page for ${name} (${id}); leaving them out of the table.`);
  }

  const pages = [own, ...others];
  const regionHtml = await getHtml(REGION(year, own.region));
  const region = regionHtml ? parseRegionTable(regionHtml) : null;

  return {
    conference: config.conference,
    team: own.name,
    division: own.division,
    region: own.region,
    teams: standings(pages, config.members),
    games: toLeagueGames(pages, config.members),
    regionTable: region?.rows.length ? region : null,
    fetched: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: Wire it into the build**

In `scripts/build-teams.mjs`, import beside the other lib imports:

```js
import { fetchLeague } from './lib/ohio.mjs';
```

and add a step alongside the schedule one, inside the per-team work:

```js
  /*
   * The rest of the conference, and the playoff region. Written only for a
   * team that asked for it; kept from the last run when the fetch or the parse
   * comes back empty, for the same reason the schedule is.
   */
  if (team.league) {
    try {
      const league = await fetchLeague(team.league, new Date().getFullYear());
      if (league) {
        await writeFile(join(out, 'league.json'), JSON.stringify(league));
        console.log(
          `           league   ${league.teams.length} teams, ${league.games.length} games, ` +
            `D-${league.division} region ${league.region}` +
            `${league.regionTable ? `, ${league.regionTable.rows.length} in the region` : ', no region table'}`,
        );
      } else {
        console.warn(`  ! ${team.slug}: the league pages gave nothing; keeping the previous file.`);
      }
    } catch (err) {
      console.warn(`  ! ${team.slug}: could not read the league (${err.message}); keeping the previous file.`);
    }
  }
```

Then add `league` to the team table written into each page, beside `schedule` and `seasons`:

```js
      league: existsSync(join(out, 'league.json')),
```

- [ ] **Step 4: Run the build and read the output**

Run: `node scripts/build-teams.mjs --pre`
Expected: a `league` line for Poland naming seven teams, a game count, `D-IV region 13`, and 24 in the region. No `league` line for ysu or victorychristian.

Then confirm the file:

```bash
node -e "
const l = JSON.parse(require('fs').readFileSync('public/league.json','utf8'));
console.log(l.conference, '| D-' + l.division, 'region', l.region);
console.log('teams:', l.teams.map(t => t.name + ' ' + t.leagueRecord).join(', '));
console.log('games:', l.games.length, '| region rows:', l.regionTable?.rows.length);
"
```

- [ ] **Step 5: Confirm stale-beats-empty**

Temporarily point `TEAM` at a 404 (`teams.jsp?teamID=0`), re-run `node scripts/build-teams.mjs --pre`, and check that `public/league.json` still holds the previous good data and the build warned. Revert the change.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/ohio.mjs scripts/build-teams.mjs teams/poland/team.json
git commit -m "Fetch the Northeast 8 and Poland's playoff region"
```

---

### Task 6: The League screen

**Files:**
- Create: `src/screens/League.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `public/league.json` from Task 5; `LeagueGame`, `Standing`, `Week` types from Task 4.
- Produces: `export function League({ base }: { base: string })`.

- [ ] **Step 1: Write the screen**

```tsx
// src/screens/League.tsx
import { useEffect, useMemo, useState } from 'react';
import type { RegionTable } from '../league/leagueParse';
import { byWeek, type LeagueGame, type Standing } from '../league/leagueModel';

/**
 * What the build wrote. The row and table shapes are the parser's, imported
 * rather than restated — one definition, so a column added at the source
 * cannot mean two different things on the two sides of the file.
 */
type League = {
  conference: string;
  team: string;
  division: string;
  region: number;
  teams: Standing[];
  games: LeagueGame[];
  regionTable: RegionTable | null;
};

/**
 * The rest of the conference, and the playoff picture.
 *
 * Two questions, so two segments: how everyone did on Friday, and who is in a
 * qualifying place. Poland's own row is picked out in both, because the reason
 * anyone opens this is to find it.
 */
export function League({ base }: { base: string }) {
  const [league, setLeague] = useState<League | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<'league' | 'region'>('league');

  useEffect(() => {
    let cancelled = false;

    // Network first, precache second — the scores change on a Friday night and
    // the worker's copy is a launch behind.
    const load = async (): Promise<League> => {
      try {
        const fresh = await fetch(`${base}league.json?t=${Date.now()}`, { cache: 'no-store' });
        if (fresh.ok) return await fresh.json();
      } catch {
        /* no signal, which is the normal case at a ground */
      }
      const cached = await fetch(`${base}league.json`);
      if (!cached.ok) throw new Error(String(cached.status));
      return await cached.json();
    };

    load()
      .then((d) => !cancelled && setLeague(d))
      .catch(() => !cancelled && setFailed(true));

    return () => { cancelled = true; };
  }, [base]);

  const weeks = useMemo(() => (league ? byWeek(league.games) : []), [league]);

  if (failed) {
    return <div className="screen"><p className="empty-text">No league table for this team yet.</p></div>;
  }
  if (!league) {
    return <div className="screen"><p className="empty-text">Loading the league…</p></div>;
  }

  return (
    <div className="screen">
      <div className="control-bar">
        <div className="seg" role="group" aria-label="What to show">
          <button type="button" aria-pressed={view === 'league'} onClick={() => setView('league')}>
            {league.conference}
          </button>
          <button type="button" aria-pressed={view === 'region'} onClick={() => setView('region')}>
            Region
          </button>
        </div>
      </div>

      {view === 'league' && (
        <>
          <table className="table-lite">
            <thead>
              <tr><th>Standings</th><th>League</th><th>All</th></tr>
            </thead>
            <tbody>
              {league.teams.map((t) => (
                <tr key={t.name} className={t.name === league.team ? 'is-us' : undefined}>
                  <td>{t.name}</td>
                  <td>{t.leagueRecord.replace('-', '–')}</td>
                  <td>{t.overall.replace('-', '–')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {weeks.map((w) => (
            <div key={w.week}>
              <div className="group-head">Week {w.week} · {w.label}</div>
              {w.games.map((g) => (
                <div className={`lg-game${g.isLeagueGame ? '' : ' is-outside'}`} key={`${g.date}-${g.home}-${g.away}`}>
                  <span className="lg-side">{g.away}</span>
                  <span className="lg-score">{g.result ? g.result.away : '—'}</span>
                  <span className="lg-side">{g.home}</span>
                  <span className="lg-score">{g.result ? g.result.home : '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {view === 'region' && (
        league.regionTable ? (
          <>
            <p className="filter-line">
              <span>Division {league.division}, Region {league.region} — {league.regionTable.caption}</span>
            </p>
            <table className="table-lite">
              <thead>
                <tr><th>#</th><th>School</th><th>W–L</th><th>Avg</th></tr>
              </thead>
              <tbody>
                {league.regionTable.rows.map((r) => (
                  <tr key={r.teamId}
                      className={[r.school === league.team ? 'is-us' : '', r.qualifying ? 'is-in' : ''].filter(Boolean).join(' ') || undefined}>
                    <td>{r.rank}</td>
                    <td>{r.school}</td>
                    <td>{r.record.replace('-', '–')}</td>
                    <td>{r.average.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="empty-text">The playoff table isn’t available right now.</p>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the tab**

In `src/App.tsx`, beside the existing `seasons` entry in the tab list:

```tsx
  ...(bakedTeam()?.league ? [{ id: 'league' as Tab, label: 'League' }] : []),
```

Add `'league'` to the `Tab` union, and render it beside the other screens:

```tsx
        {tab === 'league' && <League base={teamBase()} />}
```

with `import { League } from './screens/League';` at the top. Add `league?: boolean;` to `BakedTeam` in `src/theme/theme.ts`, beside `seasons`.

- [ ] **Step 3: Add the styles**

Append near the other screen blocks in `src/styles.css`:

```css
/* ------------------------------------------------------------------ league */

/* A plain table, because a standings table is a table. Hairlines rather than
   boxes, to match the dense rows on the Team list. */
.table-lite {
  width: 100%;
  margin: 4px 0 8px;
  border-collapse: collapse;
  font-size: 15px;
}

.table-lite th {
  padding: 4px 0 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: right;
}

.table-lite th:first-child,
.table-lite td:first-child { text-align: left; }
.table-lite th:nth-child(2) { text-align: left; }

.table-lite td {
  padding: 7px 0;
  border-top: 1px solid var(--line);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.table-lite td:nth-child(2) { text-align: left; }

/* Our own row, which is the one anybody opened this to find. */
.table-lite .is-us td {
  color: var(--accent);
  font-weight: 800;
}

/* In a qualifying place, as the source marks it. */
.table-lite .is-in td:first-child::after {
  content: '·';
  margin-left: 6px;
  color: var(--ok);
}

.lg-game {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
}

.lg-score {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* A game against someone outside the conference still matters to the team
   playing it, but it is not what this screen is about. */
.lg-game.is-outside .lg-side { color: var(--muted); }
```

The Region segment's first column is the rank, so `th:nth-child(2)` and `td:nth-child(2)` left-align the school. On the standings table that is the League column, which should stay right-aligned — check both in the browser at Step 5 and split the selector per table if they fight.

- [ ] **Step 4: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass, including the 176 that already did.

- [ ] **Step 5: Build and verify in the browser**

```bash
npx vite build && node scripts/build-teams.mjs --post
```

Then start the preview and check, at 375px:

- Poland has four tabs and they fit on one line without wrapping.
- The League tab shows the standings with Poland picked out, and weeks below it.
- The Region segment shows 24 rows with Poland picked out and 12 marked as qualifying.
- **YSU and Victory Christian have no League tab and are otherwise unchanged.**
- No console errors.

Clear the service worker and caches before reloading, or the old bundle is served.

- [ ] **Step 6: Commit**

```bash
git add src/screens/League.tsx src/App.tsx src/styles.css src/theme/theme.ts
git commit -m "Add the League tab: the Northeast 8 and the playoff region"
```

---

### Task 7: Keep it current, and ship

**Files:**
- Modify: `.github/workflows/refresh.yml`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new; the nightly job now refreshes the league too.

- [ ] **Step 1: Check whether the refresh job already covers it**

```bash
cat .github/workflows/refresh.yml
```

The league is written by `build-teams.mjs --pre`, which the refresh job already runs. If it does, this task needs no workflow change — confirm and say so rather than editing for the sake of it.

- [ ] **Step 2: Full verification**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: clean types, all tests pass, and the build log shows the `league` line for Poland only.

- [ ] **Step 3: Push and watch the deploy**

```bash
git push origin main
gh run watch "$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

- [ ] **Step 4: Verify live**

Load `https://roster.scottforge.ai/`, open the League tab, and confirm the standings and region table render with real data. Then load `/ysu/` and confirm it still has exactly three tabs.

---

## Deliberate deviations from the spec

Two, both naming, both worth knowing about so nobody "fixes" them back:

- The spec's illustrative JSON wrote `region_table`. This plan uses
  `regionTable`, because every other key in this codebase is camelCase.
- The spec's `teams` rows carried an `id`. Nothing on the screen uses it, so
  `Standing` does not carry one. Add it when something needs it.

## Notes for the implementer

**The source is one person's website.** It has no API and no terms. Fetch it once a night and no more, keep the User-Agent honest, and if a page 404s, leave the previous data alone. If the parser starts failing, the fixtures in `src/league/fixtures/` are the record of what it used to look like — diff a fresh copy against them before changing any regex.

**Do not hardcode the division or the region.** Poland moved from D-V Region 17 to D-IV Region 13 between the 2025 and 2026 seasons, and its rivals moved too. Both come from Poland's own page every build.

**The season has not started.** Until 21 August 2026 every record is `0-0` and every game unplayed, so the standings will be flat and the region table all zeros. That is correct, not a bug. The screen must read sensibly in that state — check it before deciding something is broken.
