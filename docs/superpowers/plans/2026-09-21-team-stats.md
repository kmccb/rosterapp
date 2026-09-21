# The Stats tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Stats tab on Poland's app with team leaders, each side of the ball, and a player's week-by-week, fed by pasting one Hudl game at a time and summing.

**Architecture:** Four pure modules do all the arithmetic and are tested: a parser for Hudl's game-page paste (`gameParse.ts`), a summer that turns games into season totals (`seasonTotals.ts`), leader and side-list builders (`leaders.ts`), and the store's new `games` field (`statsStore.ts`). Two screens sit on top: `GameImport.tsx` for the paste and `TeamStats.tsx` for the tab. `App.tsx` adds the tab; `PlayerCard.tsx` gains a link. The baseline is re-recorded last because this changes the root bundle.

**Tech Stack:** React 18 + TypeScript, Vite, vitest (node environment, `src/**/*.test.ts` only). No new dependencies.

Spec: `docs/superpowers/specs/2026-09-21-team-stats-design.md`. Fixtures already captured and committed with this plan: `src/stats/fixtures/hudl-game-home.txt` (Salem, 2026-08-21) and `src/stats/fixtures/hudl-game-away.txt` (Canfield, 2026-09-11).

## Global Constraints

- **Poland must not change by accident.** `npm run build` ends with `scripts/check-untouched.mjs`; it WILL fail on this branch until Task 8 re-records the baseline. Before that, run only `npx tsc --noEmit` and `npx vitest run`. Never edit `scripts/untouched-baseline.json` except in Task 8, by its procedure.
- **Never edit `src/styles.css`.** Classes used: `screen`, `control-bar`, `seg`, `group-head`, `rows`, `row`, `lg-game`, `lg-side`, `lg-score`, `link-btn`, `filter-line`, `empty-text`, `chips`, `chip`, `active`, `input`, `textarea`, `label`, `hint`, `error`, `success`, `warn`, `section`, `review-actions`, `btn`, `btn-primary`, `stats`, `stats-row`, `stats-cat`.
- **Nothing here imports from `src/oh/`.**
- **Tests pass env-free**, no network; fixtures are committed files read with `readFileSync`.
- **Copy uses typographic apostrophes** (`Couldn’t`, `player’s`). Scores use an en dash where a range is printed. Comments are prose explaining why.
- **Field names** are the season parser's (`src/stats/statsParse.ts` `COLUMNS`): `cmp att yds td int lng carries fum rec tackles solo assist sacks tfl safety intRetYds ff fumRec fumRetYds defTd fgMade fgAtt xpMade xpAtt pts punts ydsPerPunt in20 returns ydsPerReturn ydsPerCarry ydsPerRec cmpPct`.
- **Every commit** is a plain sentence saying why and ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit with a heredoc and verify the trailer with `git log -1 --format=%B`; earlier implementers had tooling substitute another model name.
- Branch `team-stats` (created off main; holds the spec, fixtures and this plan).

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/stats/gameParse.ts` | Pure: Hudl game-page paste → `ParsedStatRow[]`, Poland's tables only. |
| `src/stats/gameParse.test.ts` | Pins both fixtures. |
| `src/stats/seasonTotals.ts` | Pure: games → season `byPlayer`; falls back to the paste. |
| `src/stats/seasonTotals.test.ts` | Sums, maxes, derived averages, fallback. |
| `src/stats/leaders.ts` | Pure: leader blocks, side lists, a game's label. |
| `src/stats/leaders.test.ts` | Top-three with ties, side membership, ordering. |
| `src/stats/statsStore.ts` | `games` field, `putGame`, `removeGame`. |
| `src/stats/statsStore.test.ts` | Round trips (create if absent). |
| `src/screens/GameImport.tsx` | The One game form and games list. |
| `src/screens/StatsImport.tsx` | Whole season / One game chips under This season. |
| `src/screens/TeamStats.tsx` | The tab: Leaders · Offense · Defense · Special, and a player's weeks. |
| `src/components/PlayerCard.tsx` | "Week by week" link when a callback is passed. |
| `src/screens/Lookup.tsx`, `src/screens/RosterList.tsx` | Pass the callback through. |
| `src/App.tsx` | The `teamStats` tab, gated; the chosen player key. |
| `scripts/untouched-baseline.json` | Re-recorded in Task 8 only. |

---

### Task 1: The game-page parser

**Files:**
- Create: `src/stats/gameParse.ts`
- Test: `src/stats/gameParse.test.ts`
- Read (do not modify): `src/stats/statsParse.ts` for `ParsedStatRow`, `StatCategory`.

**Interfaces:**
- Consumes: `ParsedStatRow = { name: string; number: string; category: StatCategory; values: Record<string, number> }` and `StatCategory` from `./statsParse`.
- Produces: `parseGameStats(text: string): { rows: ParsedStatRow[]; categories: StatCategory[] }`.

- [ ] **Step 1: Write the failing tests**

Create `src/stats/gameParse.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGameStats } from './gameParse';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

const HOME = fixture('hudl-game-home.txt');
const AWAY = fixture('hudl-game-away.txt');

const find = (rows: ReturnType<typeof parseGameStats>['rows'], category: string, name: string) =>
  rows.find((r) => r.category === category && r.name === name);

describe('parseGameStats', () => {
  it('keeps Poland’s tables and drops the opponent’s, which Hudl prints second', () => {
    const { rows } = parseGameStats(HOME);
    expect(rows.map((r) => r.name)).not.toContain('B. Bezon');
    expect(rows.map((r) => r.name)).not.toContain('B. Kana');
    expect(rows.map((r) => r.name)).not.toContain('L. Mayhew');
    expect(rows.filter((r) => r.category === 'passing')).toHaveLength(1);
  });

  it('reads every category on the home page', () => {
    const { rows, categories } = parseGameStats(HOME);
    expect(categories.sort()).toEqual(
      ['defense', 'kickReturn', 'kicking', 'passing', 'punting', 'receiving', 'rushing'].sort(),
    );
    // 1 passing + 5 rushing + 5 receiving + 14 defense + 1 kicking + 1 punting + 3 kick returns.
    expect(rows).toHaveLength(30);
  });

  it('splits Comp/Att into two fields and maps the rest by name', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'passing', 'D. Xipolitas')?.values).toEqual({
      cmp: 6, att: 11, yds: 83, td: 1, int: 1, lng: 30,
    });
    expect(find(rows, 'passing', 'D. Xipolitas')?.number).toBe('1');
  });

  it('reads rushing and receiving with the season parser’s names', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'rushing', 'C. Jones')?.values).toEqual({ carries: 13, yds: 23, td: 1, lng: 12 });
    expect(find(rows, 'receiving', 'G. Seifert')?.values).toEqual({ rec: 1, yds: 13, td: 1, lng: 13 });
  });

  it('reads the defense table, whose header has no category cell, from the section heading', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'defense', 'P. Zoumis')?.values).toEqual({ tackles: 12, assist: 2, int: 1 });
    expect(find(rows, 'defense', 'D. Delluomo')?.values).toEqual({ tackles: 4, assist: 1, sacks: 1 });
    expect(find(rows, 'defense', 'N. Minehart')?.values).toEqual({ assist: 1 });
    expect(rows.filter((r) => r.category === 'defense')).toHaveLength(14);
  });

  it('turns an average into yards so totals can add up', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'punting', 'D. Xipolitas')?.values).toEqual({
      punts: 4, ydsPerPunt: 34, yds: 136, lng: 40,
    });
    expect(find(rows, 'kickReturn', 'C. Scott')?.values).toEqual({
      returns: 2, ydsPerReturn: 60, yds: 120, lng: 60,
    });
  });

  it('reads kicking as made counts and points, since attempts are not printed per game', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'kicking', 'S. (Salvi) Carramusa')?.values).toEqual({ fgMade: 1, xpMade: 2, pts: 5 });
  });

  it('drops a row with no numbers at all, and the Kickoff table, which is not a category', () => {
    const { rows, categories } = parseGameStats(HOME);
    // A. Sattarelle's punt return row is all dashes.
    expect(rows.filter((r) => r.category === 'puntReturn')).toHaveLength(0);
    expect(categories).not.toContain('puntReturn');
    expect(rows.every((r) => Object.keys(r.values).length > 0)).toBe(true);
    // The Kickoff table (4 kickoffs) follows Kicking; its row must not become kicking numbers.
    expect(rows.filter((r) => r.category === 'kicking')).toHaveLength(1);
    expect(find(rows, 'kicking', 'S. (Salvi) Carramusa')?.values.fgMade).toBe(1);
  });

  it('drops opponent rows that are only a number, and Rest of team', () => {
    const { rows } = parseGameStats(AWAY);
    expect(rows.map((r) => r.name)).not.toContain('');
    expect(rows.map((r) => r.name)).not.toContain('Rest of team');
    expect(rows.map((r) => r.name)).not.toContain('J. Pannunzio');
  });

  it('reads the away page, where Poland’s tables still come first', () => {
    const { rows } = parseGameStats(AWAY);
    expect(find(rows, 'passing', 'A. Sattarelle')?.values).toEqual({ cmp: 0, att: 1 });
    expect(find(rows, 'rushing', 'C. Jones')?.values).toEqual({ carries: 26, yds: 163, td: 1, lng: 51 });
    expect(find(rows, 'defense', 'M. Purins')?.values).toEqual({ tackles: 2, sacks: 2 });
    expect(find(rows, 'defense', 'A. Sattarelle')?.values).toEqual({ tackles: 1, assist: 2, int: 1 });
    expect(find(rows, 'defense', 'N. Nittoli')?.values).toEqual({ tackles: 1, fum: 1 });
    expect(find(rows, 'puntReturn', 'N. Nittoli')?.values).toEqual({ returns: 1, ydsPerReturn: 3, yds: 3, lng: 3 });
    expect(find(rows, 'kicking', 'S. (Salvi) Carramusa')?.values).toEqual({ fgMade: 1, xpMade: 3, pts: 6 });
    expect(rows.map((r) => r.name)).not.toContain('L. Goodrich');
  });

  it('copes with a paste that lost its tabs to plain text', () => {
    const spaced = HOME.split('\n').map((l) => l.split('\t').join('   ')).join('\n');
    const { rows } = parseGameStats(spaced);
    expect(find(rows, 'rushing', 'C. Jones')?.values.yds).toBe(23);
  });

  it('returns nothing for text that isn’t a game page', () => {
    expect(parseGameStats('Passing Stats\n#\tNAME\tGAMES\tCMP\n1\tD. Xipolitas\t5\t27')).toEqual({
      rows: [],
      categories: [],
    });
    expect(parseGameStats('')).toEqual({ rows: [], categories: [] });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/stats/gameParse.test.ts`
Expected: FAIL — `Cannot find module './gameParse'`.

- [ ] **Step 3: Write the parser**

Create `src/stats/gameParse.ts`:

```ts
/*
 * Parses one game's tables copied out of Hudl's Game Stats page.
 *
 * That page is shaped differently from the season page: sections headed
 * Offense, Defense and Special Teams; a table's category in its first header
 * cell ("Passing", "Kickoff Returns") — except Defense, whose header starts
 * with a blank cell and takes its name from the section; and both teams on
 * the page, ours first in every section, then the opponent's with the same
 * headers. So this keeps the first table it sees for a category and skips
 * the repeat.
 *
 * Column names are mapped onto the season parser's field names so one
 * summariser serves both. Where Hudl prints an average instead of yards
 * (punts, returns) the yards are recovered as average × count, rounded, so a
 * season can be summed from games.
 */

import type { ParsedStatRow, StatCategory } from './statsParse';

type ColumnMap = Record<string, string>;

/** First header cell (squashed) → category. Defense is matched separately. */
const TABLE_CATEGORY: Record<string, StatCategory> = {
  passing: 'passing',
  rushing: 'rushing',
  receiving: 'receiving',
  kicking: 'kicking',
  punting: 'punting',
  'kickoff returns': 'kickReturn',
  'punt returns': 'puntReturn',
};

/** Squashed game-page heading → season field name. Unlisted headings are ignored. */
const COLUMNS: Record<StatCategory, ColumnMap> = {
  passing: { 'comp/att': 'comp/att', yds: 'yds', td: 'td', int: 'int', long: 'lng' },
  rushing: { att: 'carries', yds: 'yds', td: 'td', long: 'lng', fum: 'fum' },
  receiving: { rec: 'rec', yds: 'yds', td: 'td', long: 'lng', fum: 'fum' },
  defense: {
    tk: 'tackles', ast: 'assist', sck: 'sacks', tfl: 'tfl', sfty: 'safety', int: 'int',
    fum: 'fum', blks: 'blocks', td: 'defTd',
  },
  kicking: { fg: 'fgMade', pat: 'xpMade', pts: 'pts' },
  punting: { num: 'punts', avg: 'ydsPerPunt', 'in 20': 'in20', long: 'lng' },
  kickReturn: { ret: 'returns', avg: 'ydsPerReturn', td: 'td', long: 'lng' },
  puntReturn: { ret: 'returns', avg: 'ydsPerReturn', td: 'td', long: 'lng' },
};

/** Yards recovered from an average, per category: [count field, average field]. */
const YARDS_FROM_AVERAGE: Partial<Record<StatCategory, [string, string]>> = {
  punting: ['punts', 'ydsPerPunt'],
  kickReturn: ['returns', 'ydsPerReturn'],
  puntReturn: ['returns', 'ydsPerReturn'],
};

const squash = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const splitCells = (line: string): string[] => {
  const cells = line.includes('\t') ? line.split('\t') : line.split(/ {2,}/);
  return cells.map((c) => c.trim());
};

const toNumber = (raw: string): number | undefined => {
  const cleaned = raw.replace(/,/g, '').replace(/%/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '—') return undefined;
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : undefined;
};

/** "#12 C. Scott" → { number: "12", name: "C. Scott" }; "J. Mayhew" → no number. */
const splitName = (cell: string): { number: string; name: string } => {
  const m = cell.trim().match(/^#(\d+)\s*(.*)$/);
  if (m) return { number: m[1], name: m[2].trim() };
  return { number: '', name: cell.trim() };
};

const isDefenseHeader = (squashed: string[]): boolean =>
  squashed[0] === '' && squashed.includes('tk') && squashed.includes('ast');

const categoryOfHeader = (squashed: string[]): StatCategory | null => {
  if (isDefenseHeader(squashed)) return 'defense';
  return TABLE_CATEGORY[squashed[0]] ?? null;
};

/*
 * A data cell is a number, a dash, a pair ("6/11") or a percentage. A header
 * row has none of those after its first cell — "2PT" and "In 20" contain
 * digits but are not numbers. Recognising headers by shape rather than by
 * name is what stops the Kickoff table (Num, Yrds, Long, TB), which this app
 * has no category for, from being read as more rows of the table before it.
 */
const DATA_CELL = /^(-|-?\d+(\.\d+)?( ?%)?|\d+\/\d+)$/;
const looksLikeHeader = (cells: string[]): boolean =>
  cells.length > 1 && !cells.slice(1).some((c) => DATA_CELL.test(c.trim()));

export function parseGameStats(input: string): { rows: ParsedStatRow[]; categories: StatCategory[] } {
  const rows: ParsedStatRow[] = [];
  const seen = new Set<StatCategory>();

  let category: StatCategory | null = null;
  let columns: string[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const cells = splitCells(line);

    // Section headings and "No Punt Returns" are single cells; nothing to keep.
    if (cells.length === 1) continue;

    if (looksLikeHeader(cells)) {
      const squashed = cells.map(squash);
      const headerCategory = categoryOfHeader(squashed);
      // No category for it (Kickoff), or the opponent's copy of one already
      // read: read nothing until the next header this app wants.
      if (!headerCategory || seen.has(headerCategory)) {
        category = null;
        columns = [];
        continue;
      }
      seen.add(headerCategory);
      category = headerCategory;
      const map = COLUMNS[category];
      columns = squashed.map((h) => map[h] ?? '');
      continue;
    }

    if (!category) continue;

    const { number, name } = splitName(cells[0]);
    if (!name || squash(name).startsWith('rest of team')) continue;

    const values: Record<string, number> = {};
    for (let i = 1; i < cells.length && i < columns.length; i += 1) {
      const field = columns[i];
      if (!field) continue;
      if (field === 'comp/att') {
        const [c, a] = cells[i].split('/');
        const cmp = toNumber(c ?? '');
        const att = toNumber(a ?? '');
        if (cmp !== undefined) values.cmp = cmp;
        if (att !== undefined) values.att = att;
        continue;
      }
      const n = toNumber(cells[i]);
      if (n !== undefined) values[field] = n;
    }

    const derived = YARDS_FROM_AVERAGE[category];
    if (derived) {
      const [count, avg] = derived;
      if (values[count] !== undefined && values[avg] !== undefined) {
        values.yds = Math.round(values[count] * values[avg]);
      }
    }

    if (Object.keys(values).length === 0) continue;
    rows.push({ name, number, category, values });
  }

  const categories = [...new Set(rows.map((r) => r.category))];
  return { rows, categories };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/stats/gameParse.test.ts`
Expected: 12 passed.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/stats/gameParse.ts src/stats/gameParse.test.ts
git commit -F - <<'EOF'
Read one game off Hudl's game page, ours and not the opponent's

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log -1 --format=%B
```

---

### Task 2: Season totals from games

**Files:**
- Create: `src/stats/seasonTotals.ts`
- Test: `src/stats/seasonTotals.test.ts`
- Modify: `src/stats/statsStore.ts` (types only, at the top of the file: add `GameStats` and the optional `games` field)

**Interfaces:**
- Consumes: `PlayerStats = Record<string, Record<string, number>>` from `./statsMatch`; `SeasonStats` from `./statsStore`.
- Produces: `seasonTotals(season: SeasonStats | undefined): Record<string, PlayerStats>`; the `GameStats` type.

- [ ] **Step 1: Add the types to the store**

In `src/stats/statsStore.ts`, replace

```ts
export type SeasonStats = {
  label: string;
  /** playerKey -> category -> values. */
  byPlayer: Record<string, PlayerStats>;
  updatedAt: string;
};
```

with

```ts
/** One game, pasted from Hudl's game page. `date` is YYYY-MM-DD; `opponent` is as typed. */
export type GameStats = {
  date: string;
  opponent: string;
  /** playerKey -> category -> values. */
  byPlayer: Record<string, PlayerStats>;
};

export type SeasonStats = {
  label: string;
  /** playerKey -> category -> values. The whole-season paste; ignored while games exist. */
  byPlayer: Record<string, PlayerStats>;
  updatedAt: string;
  /** Kept sorted by date. When present, the season's numbers are the sum of these. */
  games?: GameStats[];
};
```

Run `npx tsc --noEmit`; expected clean (the field is optional).

- [ ] **Step 2: Write the failing tests**

Create `src/stats/seasonTotals.test.ts`:

```ts
import { seasonTotals } from './seasonTotals';
import type { SeasonStats } from './statsStore';

const season = (games: SeasonStats['games'], byPlayer: SeasonStats['byPlayer'] = {}): SeasonStats => ({
  label: '2026',
  byPlayer,
  updatedAt: '2026-09-21T00:00:00.000Z',
  games,
});

describe('seasonTotals', () => {
  it('sums counting fields across games', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'jones|c': { rushing: { carries: 13, yds: 23, td: 1, lng: 12 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: { 'jones|c': { rushing: { carries: 26, yds: 163, td: 1, lng: 51 } } } },
      ]),
    );
    expect(t['jones|c'].rushing.carries).toBe(39);
    expect(t['jones|c'].rushing.yds).toBe(186);
    expect(t['jones|c'].rushing.td).toBe(2);
  });

  it('takes the longest for lng rather than adding it', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'jones|c': { rushing: { carries: 1, yds: 12, lng: 12 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: { 'jones|c': { rushing: { carries: 1, yds: 51, lng: 51 } } } },
      ]),
    );
    expect(t['jones|c'].rushing.lng).toBe(51);
  });

  it('recomputes averages from the sums instead of averaging the averages', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'x|d': { punting: { punts: 4, yds: 136, ydsPerPunt: 34 }, passing: { cmp: 6, att: 11, yds: 83 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: { 'x|d': { punting: { punts: 1, yds: 25, ydsPerPunt: 25 }, passing: { cmp: 3, att: 6, yds: 33 } } } },
      ]),
    );
    expect(t['x|d'].punting.ydsPerPunt).toBeCloseTo(161 / 5);
    expect(t['x|d'].passing.cmpPct).toBeCloseTo((9 / 17) * 100);
    expect(t['x|d'].passing.ydsPerAtt).toBeCloseTo(116 / 17);
  });

  it('adds ydsPerCarry, ydsPerRec and ydsPerReturn when their parts are present', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'j|c': { rushing: { carries: 10, yds: 55 }, receiving: { rec: 2, yds: 30 }, kickReturn: { returns: 2, yds: 120 } } } },
      ]),
    );
    expect(t['j|c'].rushing.ydsPerCarry).toBeCloseTo(5.5);
    expect(t['j|c'].receiving.ydsPerRec).toBe(15);
    expect(t['j|c'].kickReturn.ydsPerReturn).toBe(60);
  });

  it('does not zero a total because one game lacked the field', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'z|p': { defense: { tackles: 12, int: 1 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: { 'z|p': { defense: { tackles: 6 } } } },
      ]),
    );
    expect(t['z|p'].defense).toEqual({ tackles: 18, int: 1 });
  });

  it('keeps a player who appears in one game only', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'a|b': { receiving: { rec: 1, yds: 9 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: {} },
      ]),
    );
    expect(t['a|b'].receiving).toEqual({ rec: 1, yds: 9, ydsPerRec: 9 });
  });

  it('falls back to the whole-season paste when there are no games', () => {
    const pasted = { 'j|c': { rushing: { carries: 73, yds: 481, td: 4 } } };
    expect(seasonTotals(season(undefined, pasted))).toBe(pasted);
    expect(seasonTotals(season([], pasted))).toBe(pasted);
  });

  it('answers an empty object for no season at all', () => {
    expect(seasonTotals(undefined)).toEqual({});
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/stats/seasonTotals.test.ts`
Expected: FAIL — `Cannot find module './seasonTotals'`.

- [ ] **Step 4: Write the summer**

Create `src/stats/seasonTotals.ts`:

```ts
/*
 * A season's numbers, from its games.
 *
 * The games are the truth once any have been pasted: every screen reads the
 * sum, so the Leaders, a side's list, the Season line and the card can never
 * disagree. Counting fields add; the longest play is a max; averages are
 * recomputed from the sums, because an average of averages is wrong the
 * moment two games have different counts. With no games the whole-season
 * paste stands, exactly as before games existed.
 */

import type { PlayerStats } from './statsMatch';
import type { SeasonStats } from './statsStore';

const COUNTED = new Set([
  'yds', 'td', 'cmp', 'att', 'int', 'carries', 'rec', 'fum', 'tackles', 'solo', 'assist',
  'sacks', 'tfl', 'safety', 'intRetYds', 'ff', 'fumRec', 'fumRetYds', 'defTd', 'blocks',
  'fgMade', 'fgAtt', 'xpMade', 'xpAtt', 'pts', 'punts', 'in20', 'returns', 'sacked',
]);

const MAXED = new Set(['lng']);

/** field → [numerator, denominator, multiplier]. Added when both parts are present. */
const DERIVED: Array<[string, string, string, number]> = [
  ['ydsPerCarry', 'yds', 'carries', 1],
  ['ydsPerRec', 'yds', 'rec', 1],
  ['ydsPerPunt', 'yds', 'punts', 1],
  ['ydsPerReturn', 'yds', 'returns', 1],
  ['ydsPerAtt', 'yds', 'att', 1],
  ['cmpPct', 'cmp', 'att', 100],
];

const add = (into: Record<string, number>, from: Record<string, number>): void => {
  for (const [field, value] of Object.entries(from)) {
    if (COUNTED.has(field)) into[field] = (into[field] ?? 0) + value;
    else if (MAXED.has(field)) into[field] = Math.max(into[field] ?? -Infinity, value);
    // Averages and rates are recomputed below; anything else is not carried.
  }
};

const derive = (values: Record<string, number>): void => {
  for (const [field, top, bottom, times] of DERIVED) {
    if (values[top] !== undefined && values[bottom] !== undefined && values[bottom] !== 0) {
      values[field] = (values[top] / values[bottom]) * times;
    }
  }
};

export function seasonTotals(season: SeasonStats | undefined): Record<string, PlayerStats> {
  if (!season) return {};
  if (!season.games || season.games.length === 0) return season.byPlayer;

  const out: Record<string, PlayerStats> = {};
  for (const game of season.games) {
    for (const [key, categories] of Object.entries(game.byPlayer)) {
      const player = (out[key] ??= {});
      for (const [category, values] of Object.entries(categories)) {
        add((player[category] ??= {}), values);
      }
    }
  }
  for (const player of Object.values(out)) {
    for (const values of Object.values(player)) derive(values);
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/stats/seasonTotals.test.ts`
Expected: 8 passed. Then `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add src/stats/statsStore.ts src/stats/seasonTotals.ts src/stats/seasonTotals.test.ts
git commit -F - <<'EOF'
Sum a season from its games, so no two screens can disagree about a number

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log -1 --format=%B
```

---

### Task 3: Leaders, sides, and a game's label

**Files:**
- Create: `src/stats/leaders.ts`
- Test: `src/stats/leaders.test.ts`

**Interfaces:**
- Consumes: `summarise`, `StatSummary` from `./statsFormat`; `CATEGORY_LABEL`, `StatCategory` from `./statsParse`; `playerKey`, `PlayerStats` from `./statsMatch`; `Player`, `fullName` from `../types`.
- Produces:
  ```ts
  type LeaderRow = { key: string; number: string; name: string; value: number; parts: string[] };
  type LeaderBlock = { category: StatCategory; label: string; rows: LeaderRow[] };
  type SideRow = { key: string; number: string; name: string; lines: StatSummary[] };
  type Side = 'offense' | 'defense' | 'special';
  leaders(totals, players): LeaderBlock[]
  bySide(totals, players, side): SideRow[]
  gameLabel(date, opponent): string   // "Sep 4 · Field"
  SIDE_CATEGORIES: Record<Side, StatCategory[]>
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/stats/leaders.test.ts`:

```ts
import { bySide, gameLabel, leaders } from './leaders';
import { playerKey } from './statsMatch';
import type { Player } from '../types';

const p = (number: string, firstName: string, lastName: string): Player => ({
  id: `${number}-${lastName}`,
  number,
  firstName,
  lastName,
  position: '',
  side: '',
});

const jones = p('5', 'Chase', 'Jones');
const xip = p('1', 'Dominic', 'Xipolitas');
const scott = p('12', 'Caleb', 'Scott');
const zoumis = p('28', 'Peter', 'Zoumis');
const seven = p('07', 'Tom', 'Dedo');
const PLAYERS = [jones, xip, scott, zoumis, seven];
const k = playerKey;

describe('leaders', () => {
  it('ranks the top three on the category’s headline field with the card’s parts', () => {
    const blocks = leaders(
      {
        [k(jones)]: { rushing: { yds: 481, td: 4, carries: 73 } },
        [k(xip)]: { rushing: { yds: 353, td: 3, carries: 47 } },
        [k(scott)]: { rushing: { yds: 18, carries: 3 } },
        [k(zoumis)]: { rushing: { yds: 7, td: 1, carries: 1 } },
      },
      PLAYERS,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].category).toBe('rushing');
    expect(blocks[0].label).toBe('Rushing');
    expect(blocks[0].rows.map((r) => r.name)).toEqual(['Chase Jones', 'Dominic Xipolitas', 'Caleb Scott']);
    expect(blocks[0].rows[0]).toMatchObject({ key: k(jones), number: '5', value: 481 });
    expect(blocks[0].rows[0].parts).toEqual(['481 yds', '4 TD', '73 car']);
  });

  it('keeps a tie for third rather than cutting it', () => {
    const blocks = leaders(
      {
        [k(jones)]: { defense: { tackles: 41 } },
        [k(zoumis)]: { defense: { tackles: 37 } },
        [k(scott)]: { defense: { tackles: 14 } },
        [k(xip)]: { defense: { tackles: 14 } },
        [k(seven)]: { defense: { tackles: 4 } },
      },
      PLAYERS,
    );
    expect(blocks[0].rows.map((r) => r.number)).toEqual(['5', '28', '12', '1']);
  });

  it('orders blocks like the card and leaves out a category nobody has', () => {
    const blocks = leaders(
      {
        [k(jones)]: { kickReturn: { yds: 228, returns: 6 }, receiving: { yds: 119, rec: 7 } },
        [k(xip)]: { passing: { yds: 513, td: 6, cmp: 27, att: 47 } },
      },
      PLAYERS,
    );
    expect(blocks.map((b) => b.category)).toEqual(['passing', 'receiving', 'kickReturn']);
  });

  it('skips a key with no roster player and a player without the headline field', () => {
    const blocks = leaders(
      {
        'ghost|g': { rushing: { yds: 999 } },
        [k(jones)]: { rushing: { td: 2 } },
        [k(xip)]: { rushing: { yds: 10 } },
      },
      PLAYERS,
    );
    expect(blocks[0].rows.map((r) => r.name)).toEqual(['Dominic Xipolitas']);
  });

  it('breaks a tie on the headline by name so the order is stable', () => {
    const blocks = leaders(
      { [k(xip)]: { rushing: { yds: 50 } }, [k(jones)]: { rushing: { yds: 50 } } },
      PLAYERS,
    );
    expect(blocks[0].rows.map((r) => r.name)).toEqual(['Chase Jones', 'Dominic Xipolitas']);
  });
});

describe('bySide', () => {
  const totals = {
    [k(jones)]: { rushing: { yds: 481, carries: 73 }, defense: { tackles: 37 }, kickReturn: { yds: 228, returns: 6 } },
    [k(xip)]: { passing: { yds: 513, cmp: 27, att: 47 }, punting: { punts: 6, ydsPerPunt: 32.5 } },
    [k(seven)]: { defense: { tackles: 4 } },
    [k(scott)]: { receiving: { yds: 103, rec: 3 } },
  };

  it('lists a side’s players by number with only that side’s lines', () => {
    const rows = bySide(totals, PLAYERS, 'offense');
    expect(rows.map((r) => r.number)).toEqual(['1', '5', '12']);
    expect(rows[1].lines.map((l) => l.label)).toEqual(['Rushing']);
    expect(rows[0].lines.map((l) => l.label)).toEqual(['Passing']);
  });

  it('puts a two-way player on both lists', () => {
    expect(bySide(totals, PLAYERS, 'defense').map((r) => r.name)).toEqual(['Chase Jones', 'Tom Dedo']);
    expect(bySide(totals, PLAYERS, 'special').map((r) => r.name)).toEqual(['Dominic Xipolitas', 'Chase Jones']);
  });

  it('sorts numbers as numbers, so 07 comes before 12', () => {
    expect(bySide(totals, PLAYERS, 'defense').map((r) => r.number)).toEqual(['5', '07']);
  });

  it('leaves out a player with nothing on that side', () => {
    expect(bySide(totals, PLAYERS, 'defense').map((r) => r.name)).not.toContain('Caleb Scott');
  });
});

describe('gameLabel', () => {
  it('prints the day and the opponent as typed', () => {
    expect(gameLabel('2026-09-04', 'Field')).toBe('Sep 4 · Field');
    expect(gameLabel('2026-10-23', 'Struthers')).toBe('Oct 23 · Struthers');
  });

  it('falls back to the raw date if it is not YYYY-MM-DD', () => {
    expect(gameLabel('Friday', 'Salem')).toBe('Friday · Salem');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/stats/leaders.test.ts`
Expected: FAIL — `Cannot find module './leaders'`.

- [ ] **Step 3: Write the module**

Create `src/stats/leaders.ts`:

```ts
/*
 * What the Stats tab prints: who leads each category, who has done anything
 * on each side of the ball, and how a game is named on a player's page.
 *
 * Leaders rank on one headline number per category — the one a parent in the
 * stands asks about — and keep a tie at third rather than cutting it, because
 * "who is third" is the question and two kids can be. A side is a set of
 * categories, not a roster column: a running back who returns kicks belongs on
 * Offense and on Special, and this is the only way he lands on both.
 */

import { summarise, type StatSummary } from './statsFormat';
import { CATEGORY_LABEL, type StatCategory } from './statsParse';
import { playerKey, type PlayerStats } from './statsMatch';
import { fullName, type Player } from '../types';

export type LeaderRow = { key: string; number: string; name: string; value: number; parts: string[] };
export type LeaderBlock = { category: StatCategory; label: string; rows: LeaderRow[] };
export type SideRow = { key: string; number: string; name: string; lines: StatSummary[] };
export type Side = 'offense' | 'defense' | 'special';

/** Card order: offence first, then the rest. */
const ORDER: StatCategory[] = [
  'passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn',
];

const HEADLINE: Record<StatCategory, string> = {
  passing: 'yds',
  rushing: 'yds',
  receiving: 'yds',
  defense: 'tackles',
  kicking: 'pts',
  punting: 'ydsPerPunt',
  kickReturn: 'yds',
  puntReturn: 'yds',
};

export const SIDE_CATEGORIES: Record<Side, StatCategory[]> = {
  offense: ['passing', 'rushing', 'receiving'],
  defense: ['defense'],
  special: ['kicking', 'punting', 'kickReturn', 'puntReturn'],
};

const TOP = 3;

const byKey = (players: Player[]): Map<string, Player> =>
  new Map(players.map((p) => [playerKey(p), p]));

/** "07" sorts as 7; two players on one number fall back to their names. */
const numberOrder = (a: { number: string; name: string }, b: { number: string; name: string }): number =>
  Number(a.number) - Number(b.number) || a.name.localeCompare(b.name);

export function leaders(totals: Record<string, PlayerStats>, players: Player[]): LeaderBlock[] {
  const roster = byKey(players);
  const blocks: LeaderBlock[] = [];

  for (const category of ORDER) {
    const field = HEADLINE[category];
    const rows: LeaderRow[] = [];

    for (const [key, stats] of Object.entries(totals)) {
      const player = roster.get(key);
      const value = stats[category]?.[field];
      if (!player || value === undefined) continue;
      const summary = summarise({ [category]: stats[category] })[0];
      rows.push({ key, number: player.number, name: fullName(player), value, parts: summary?.parts ?? [] });
    }
    if (rows.length === 0) continue;

    rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const cut = rows[TOP - 1]?.value;
    const kept = rows.filter((r, i) => i < TOP || r.value === cut);
    blocks.push({ category, label: CATEGORY_LABEL[category], rows: kept });
  }

  return blocks;
}

export function bySide(totals: Record<string, PlayerStats>, players: Player[], side: Side): SideRow[] {
  const roster = byKey(players);
  const wanted = new Set<string>(SIDE_CATEGORIES[side]);
  const rows: SideRow[] = [];

  for (const [key, stats] of Object.entries(totals)) {
    const player = roster.get(key);
    if (!player) continue;
    const onSide: PlayerStats = {};
    for (const [category, values] of Object.entries(stats)) {
      if (wanted.has(category)) onSide[category] = values;
    }
    const lines = summarise(onSide);
    if (lines.length === 0) continue;
    rows.push({ key, number: player.number, name: fullName(player), lines });
  }

  return rows.sort(numberOrder);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-04", "Field" → "Sep 4 · Field". The date is a calendar day, never shifted by a zone. */
export function gameLabel(date: string, opponent: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : date;
  return `${day} · ${opponent}`;
}
```

Check `fullName` exists in `src/types.ts` (`grep -n 'export const fullName' src/types.ts`); it does today. If its signature is `(p: Player) => string`, the code above is right.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/stats/leaders.test.ts`
Expected: 11 passed. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/stats/leaders.ts src/stats/leaders.test.ts
git commit -F - <<'EOF'
Rank the leaders and sort each side of the ball, ties and two-way players kept

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log -1 --format=%B
```

---

### Task 4: The store learns about games

**Files:**
- Modify: `src/stats/statsStore.ts`
- Test: `src/stats/statsStore.test.ts` (create if it does not exist; if it exists, append the `describe` block)

**Interfaces:**
- Produces: `putGame(date: string, opponent: string, byPlayer: Record<string, PlayerStats>): StatsStore`; `removeGame(date: string): StatsStore`. `loadStats` returns `games` when present and well-formed.

- [ ] **Step 1: Write the failing tests**

The store reads `localStorage` through `scopedKey` (`src/scope.ts`), which reads `window.location.pathname` when called. In a node test, install a minimal `localStorage` and a `window` with a pathname on `globalThis` before importing the store (a dynamic `await import` after the stubs, as below, is what makes the order certain). Create `src/stats/statsStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

(globalThis as unknown as { window: unknown }).window = { location: { pathname: '/' } };

const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  get length() { return memory.size; },
} as Storage;

const { loadStats, putGame, putSeason, removeGame } = await import('./statsStore');

describe('games in the store', () => {
  beforeEach(() => memory.clear());

  it('creates This season around the first game', () => {
    const next = putGame('2026-08-21', 'Salem', { 'j|c': { rushing: { yds: 23 } } });
    expect(next.current?.games).toHaveLength(1);
    expect(next.current?.games?.[0]).toEqual({ date: '2026-08-21', opponent: 'Salem', byPlayer: { 'j|c': { rushing: { yds: 23 } } } });
    expect(next.current?.byPlayer).toEqual({});
    expect(loadStats().current?.games).toHaveLength(1);
  });

  it('keeps games sorted by date whatever order they were pasted in', () => {
    putGame('2026-09-11', 'Canfield', {});
    putGame('2026-08-21', 'Salem', {});
    expect(loadStats().current?.games?.map((g) => g.opponent)).toEqual(['Salem', 'Canfield']);
  });

  it('replaces a game pasted again on the same date', () => {
    putGame('2026-08-21', 'Salem', { 'j|c': { rushing: { yds: 1 } } });
    putGame('2026-08-21', 'Salem HS', { 'j|c': { rushing: { yds: 23 } } });
    const games = loadStats().current?.games;
    expect(games).toHaveLength(1);
    expect(games?.[0].opponent).toBe('Salem HS');
    expect(games?.[0].byPlayer['j|c'].rushing.yds).toBe(23);
  });

  it('removes a game by date and leaves the rest', () => {
    putGame('2026-08-21', 'Salem', {});
    putGame('2026-09-11', 'Canfield', {});
    const next = removeGame('2026-08-21');
    expect(next.current?.games?.map((g) => g.opponent)).toEqual(['Canfield']);
  });

  it('keeps a whole-season paste beside the games', () => {
    putSeason('current', '2026', { 'j|c': { rushing: { yds: 481 } } });
    putGame('2026-08-21', 'Salem', {});
    const current = loadStats().current;
    expect(current?.label).toBe('2026');
    expect(current?.byPlayer['j|c'].rushing.yds).toBe(481);
    expect(current?.games).toHaveLength(1);
  });

  it('reads a stored season that has no games, and drops a malformed games field', () => {
    putSeason('current', '2026', {});
    expect(loadStats().current?.games).toBeUndefined();
    const raw = JSON.parse(memory.values().next().value as string);
    raw.stats.current.games = 'nope';
    memory.set([...memory.keys()][0], JSON.stringify(raw));
    expect(loadStats().current?.games).toBeUndefined();
  });
});
```

If `scopedKey` needs `window.location` or similar and the import throws, report NEEDS_CONTEXT with the error rather than stubbing more.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/stats/statsStore.test.ts`
Expected: FAIL — `putGame is not a function` (or the import fails on `removeGame`).

- [ ] **Step 3: Implement**

In `src/stats/statsStore.ts`:

Replace the `isSeason` guard and `loadStats` with:

```ts
const isGame = (v: unknown): v is GameStats => {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return typeof g.date === 'string' && typeof g.opponent === 'string' && typeof g.byPlayer === 'object' && g.byPlayer !== null;
};

const isSeason = (v: unknown): v is SeasonStats => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.label === 'string' && typeof s.byPlayer === 'object' && s.byPlayer !== null;
};

/** A season as stored, with a games field only if every game in it is well-formed. */
const tidySeason = (s: SeasonStats): SeasonStats => {
  const { games, ...rest } = s as SeasonStats & { games?: unknown };
  if (Array.isArray(games) && games.every(isGame)) return { ...rest, games };
  return rest;
};

/** Anything unreadable reads as "no stats", exactly like the roster does. */
export const loadStats = (): StatsStore => {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const stats = parsed?.stats;
    if (!stats || typeof stats !== 'object') return {};
    const out: StatsStore = {};
    if (isSeason(stats.previous)) out.previous = tidySeason(stats.previous);
    if (isSeason(stats.current)) out.current = tidySeason(stats.current);
    return out;
  } catch {
    return {};
  }
};
```

Replace `putSeason` with a version that keeps the games already there:

```ts
export const putSeason = (
  bucket: SeasonBucket,
  label: string,
  byPlayer: Record<string, PlayerStats>,
): StatsStore => {
  const next: StatsStore = { ...loadStats() };
  const games = next[bucket]?.games;
  next[bucket] = { label, byPlayer, updatedAt: new Date().toISOString(), ...(games ? { games } : {}) };
  saveStats(next);
  return next;
};
```

Append after `clearSeason`:

```ts
const byDate = (a: GameStats, b: GameStats): number => a.date.localeCompare(b.date);

/** Files one game under This season; a game on the same date is replaced, not doubled. */
export const putGame = (
  date: string,
  opponent: string,
  byPlayer: Record<string, PlayerStats>,
): StatsStore => {
  const next: StatsStore = { ...loadStats() };
  const current: SeasonStats = next.current ?? { label: 'This season', byPlayer: {}, updatedAt: '' };
  const games = (current.games ?? []).filter((g) => g.date !== date);
  games.push({ date, opponent, byPlayer });
  games.sort(byDate);
  next.current = { ...current, games, updatedAt: new Date().toISOString() };
  saveStats(next);
  return next;
};

export const removeGame = (date: string): StatsStore => {
  const next: StatsStore = { ...loadStats() };
  if (!next.current?.games) return next;
  const games = next.current.games.filter((g) => g.date !== date);
  next.current = { ...next.current, games, updatedAt: new Date().toISOString() };
  saveStats(next);
  return next;
};
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/stats/statsStore.test.ts`
Expected: 6 passed (plus any pre-existing). Then `npx vitest run` — the whole suite green — and `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/stats/statsStore.ts src/stats/statsStore.test.ts
git commit -F - <<'EOF'
Keep each pasted game in the store, replaced by date and kept in order

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log -1 --format=%B
```

---

### Task 5: Pasting a game

**Files:**
- Create: `src/screens/GameImport.tsx`
- Modify: `src/screens/StatsImport.tsx`

**Interfaces:**
- Consumes: `parseGameStats` (Task 1); `putGame`, `removeGame`, `StatsStore` (Task 4); `matchStats`, `MatchReport` from `../stats/statsMatch`; `CATEGORY_LABEL` from `../stats/statsParse`; `gameLabel` (Task 3); `Roster` from `../types`.
- Produces: `GameImport` with props `{ roster: Roster; stats: StatsStore; onSaved: (next: StatsStore) => void }`.

- [ ] **Step 1: Write `GameImport.tsx`**

```tsx
import { useState } from 'react';
import { parseGameStats } from '../stats/gameParse';
import { gameLabel } from '../stats/leaders';
import { matchStats, type MatchReport } from '../stats/statsMatch';
import { CATEGORY_LABEL } from '../stats/statsParse';
import { putGame, removeGame, type StatsStore } from '../stats/statsStore';
import type { Roster } from '../types';

type Props = {
  roster: Roster;
  stats: StatsStore;
  onSaved: (next: StatsStore) => void;
};

/*
 * One game at a time, from Hudl's Game Stats page. Games are filed by date,
 * so pasting Friday's game again on Saturday morning replaces it rather than
 * doubling every number. Removing one is a tap with no confirm: putting it
 * back is one paste.
 */
export function GameImport({ roster, stats, onSaved }: Props) {
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [report, setReport] = useState<MatchReport | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const games = stats.current?.games ?? [];

  const read = () => {
    setSaved('');
    if (!opponent.trim() || !date) {
      setError('Say who the game was against and when.');
      return;
    }
    const { rows, categories: found } = parseGameStats(text);
    if (rows.length === 0) {
      setReport(null);
      setError(
        'Couldn’t find a game’s tables in that. On Hudl’s Game Stats page, pick the game, then select from the “Offense” heading down through “Special Teams” and copy.',
      );
      return;
    }
    if (roster.players.length === 0) {
      setError('Add the roster first — stats are filed against players by name.');
      return;
    }
    setError('');
    setCategories(found.map((c) => CATEGORY_LABEL[c]));
    setReport(matchStats(rows, roster.players));
  };

  const save = () => {
    if (!report) return;
    try {
      const next = putGame(date, opponent.trim(), report.byPlayer);
      onSaved(next);
      setSaved(`Saved ${gameLabel(date, opponent.trim())}.`);
      setReport(null);
      setText('');
      setOpponent('');
      setDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the game.');
    }
  };

  const remove = (gameDate: string) => {
    onSaved(removeGame(gameDate));
    setSaved('');
  };

  const matchedCount = report ? Object.keys(report.byPlayer).length : 0;

  return (
    <>
      <p className="hint">
        On Hudl’s Game Stats page, pick the game, then select from the “Offense” heading down
        through “Special Teams” and copy. Both teams come along; only Poland’s tables are kept.
      </p>

      <label className="label" htmlFor="game-opponent">
        Opponent
      </label>
      <input
        id="game-opponent"
        className="input"
        value={opponent}
        onChange={(e) => setOpponent(e.target.value)}
        placeholder="Salem"
      />

      <label className="label" htmlFor="game-date">
        Date
      </label>
      <input
        id="game-date"
        className="input"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <label className="label" htmlFor="game-paste">
        Paste the game
      </label>
      <textarea
        id="game-paste"
        className="input textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={'Offense\nPassing\tComp/Att\tYds\tTD\t…\n#1 D. Xipolitas\t6/11\t83\t1\t…'}
      />

      {error && <p className="error">{error}</p>}
      {saved && <p className="success">{saved}</p>}

      {report && (
        <>
          <h3 className="section">Check before saving</h3>
          <p className="hint">
            <strong>{matchedCount}</strong> players matched across {categories.join(', ')}.
          </p>
          {report.unmatched.length > 0 && (
            <>
              <p className="warn">
                {report.unmatched.length} names aren’t on the roster — normally players who left.
                Their stats are dropped.
              </p>
              <p className="hint">{report.unmatched.join(' · ')}</p>
            </>
          )}
          {report.ambiguous.length > 0 && (
            <>
              <p className="warn">
                {report.ambiguous.length} names fit more than one player, so they’re left out rather
                than guessed. Give the roster full first names to fix it.
              </p>
              {report.ambiguous.map((a) => (
                <p className="hint" key={a.printed}>
                  {a.printed} → {a.candidates.join(' or ')}
                </p>
              ))}
            </>
          )}
          <div className="review-actions">
            <button type="button" className="btn" onClick={() => setReport(null)}>
              Start over
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={matchedCount === 0}>
              Save {matchedCount} players
            </button>
          </div>
        </>
      )}

      {!report && (
        <div className="review-actions">
          <button type="button" className="btn btn-primary" onClick={read} disabled={!text.trim()}>
            Read the game
          </button>
        </div>
      )}

      {games.length > 0 && (
        <>
          <h3 className="section">Games in</h3>
          <div className="rows">
            {games.map((g) => (
              <div className="row" key={g.date}>
                <span>
                  {gameLabel(g.date, g.opponent)} · {Object.keys(g.byPlayer).length} players
                </span>
                <button type="button" className="link-btn" onClick={() => remove(g.date)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire it into `StatsImport.tsx`**

Add the import at the top:

```ts
import { GameImport } from './GameImport';
```

Add a state line after `const [saved, setSaved] = useState('');`:

```ts
  // Under This season a game can be pasted on its own; last season is totals only.
  const [mode, setMode] = useState<'season' | 'game'>('season');
```

Replace the block from `{existing && (` through the closing `)}` of the "Already holding" hint with:

```tsx
      {bucket === 'current' && (
        <div className="chips" role="group" aria-label="What to paste">
          <button
            type="button"
            className={`chip${mode === 'season' ? ' active' : ''}`}
            aria-pressed={mode === 'season'}
            onClick={() => { setMode('season'); setReport(null); setSaved(''); }}
          >
            Whole season
          </button>
          <button
            type="button"
            className={`chip${mode === 'game' ? ' active' : ''}`}
            aria-pressed={mode === 'game'}
            onClick={() => { setMode('game'); setReport(null); setSaved(''); }}
          >
            One game
          </button>
        </div>
      )}

      {bucket === 'current' && mode === 'game' ? (
        <GameImport roster={roster} stats={stats} onSaved={onSaved} />
      ) : (
        <>
          {existing && (
            <p className="hint">
              Already holding {Object.keys(existing.byPlayer).length} players as “{existing.label}”.
              Saving replaces them.
              {(existing.games?.length ?? 0) > 0 && ' While games are in, the games are what the app shows.'}
            </p>
          )}
```

and close that fragment: immediately before the final `</div>` of the component's return (after the `{!report && (...)}` block), add `</>` and `)}`. The result is: the chips, then either `GameImport` or the existing season form wrapped in a fragment. The existing hint, label, textarea, error, report and buttons all live inside the fragment unchanged.

Also change the hint under `<h2 className="section">Stats</h2>` to:

```tsx
      <p className="hint">
        On Hudl, open the season stats page, select the tables and copy — or, under This season,
        paste one game at a time from the Game Stats page. Players are matched by name, so a change
        of jersey number doesn’t matter.
      </p>
```

- [ ] **Step 3: Type-check and run the suite**

`npx tsc --noEmit` clean; `npx vitest run` green.

- [ ] **Step 4: Commit**

```bash
git add src/screens/GameImport.tsx src/screens/StatsImport.tsx
git commit -F - <<'EOF'
Let a game be pasted on its own, filed by date, removable with a tap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log -1 --format=%B
```

---

### Task 6: The Stats tab

**Files:**
- Create: `src/screens/TeamStats.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/PlayerCard.tsx`, `src/screens/Lookup.tsx`, `src/screens/RosterList.tsx`

**Interfaces:**
- Consumes: `seasonTotals` (Task 2); `leaders`, `bySide`, `gameLabel`, `Side` (Task 3); `summarise` from `../stats/statsFormat`; `playerKey` from `../stats/statsMatch`; `StatsStore`; `Roster`, `Player`, `fullName`.
- Produces: `TeamStats` with props `{ roster: Roster; stats: StatsStore; player: string | null; onPlayer: (key: string | null) => void }`. `PlayerCard` gains `onWeekByWeek?: () => void`. `Lookup` and `RosterList` gain `onWeekByWeek?: (key: string) => void`.

- [ ] **Step 1: Write `TeamStats.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { bySide, gameLabel, leaders, type Side } from '../stats/leaders';
import { seasonTotals } from '../stats/seasonTotals';
import { summarise } from '../stats/statsFormat';
import { playerKey } from '../stats/statsMatch';
import type { StatsStore } from '../stats/statsStore';
import { fullName, type Roster } from '../types';

type Segment = 'leaders' | Side;

type Props = {
  roster: Roster;
  stats: StatsStore;
  /** The player whose weeks are open, held by App so the card's link can set it. */
  player: string | null;
  onPlayer: (key: string | null) => void;
};

const SEGMENTS: Array<{ id: Segment; label: string }> = [
  { id: 'leaders', label: 'Leaders' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'special', label: 'Special' },
];

/*
 * Three questions, one tab: who leads, who has done anything on each side,
 * and what one kid did each Friday. Every number here is the season's games
 * summed — the same sum the card reads — so nothing on this screen can be
 * out of step with anything else.
 */
export function TeamStats({ roster, stats, player, onPlayer }: Props) {
  const [segment, setSegment] = useState<Segment>('leaders');

  const season = stats.current;
  const totals = useMemo(() => seasonTotals(season), [season]);
  const players = roster.players;

  const blocks = useMemo(() => leaders(totals, players), [totals, players]);
  const side = useMemo(
    () => (segment === 'leaders' ? [] : bySide(totals, players, segment)),
    [totals, players, segment],
  );

  const open = player ? players.find((p) => playerKey(p) === player) ?? null : null;

  return (
    <div className="screen">
      <div className="control-bar">
        <div className="seg" role="group" aria-label="What to show">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={segment === s.id}
              onClick={() => { setSegment(s.id); onPlayer(null); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <>
          <p className="filter-line">
            <button type="button" className="link-btn" onClick={() => onPlayer(null)}>
              ‹ Back
            </button>
          </p>
          <div className="group-head">#{open.number} {fullName(open)}</div>

          {(season?.games ?? []).map((g) => {
            const lines = summarise(g.byPlayer[player as string]);
            if (lines.length === 0) return null;
            return (
              <div key={g.date}>
                <div className="lg-game">
                  <span className="lg-side"><strong>{gameLabel(g.date, g.opponent)}</strong></span>
                  <span className="lg-score" />
                </div>
                {lines.map((l) => (
                  <div className="lg-game" key={l.category}>
                    <span className="lg-side">{l.label}</span>
                    <span className="lg-score">{l.parts.join(' · ')}</span>
                  </div>
                ))}
              </div>
            );
          })}

          <div className="lg-game">
            <span className="lg-side"><strong>Season</strong></span>
            <span className="lg-score" />
          </div>
          {summarise(totals[player as string]).map((l) => (
            <div className="lg-game" key={l.category}>
              <span className="lg-side">{l.label}</span>
              <span className="lg-score">{l.parts.join(' · ')}</span>
            </div>
          ))}
        </>
      )}

      {!open && segment === 'leaders' && (
        blocks.length === 0 ? (
          <p className="empty-text">No stats pasted for this season yet.</p>
        ) : (
          blocks.map((b) => (
            <div key={b.category}>
              <div className="group-head">{b.label}</div>
              <div className="rows">
                {b.rows.map((r) => (
                  <button type="button" className="row" key={r.key} onClick={() => onPlayer(r.key)}>
                    <span className="row-number">#{r.number}</span>
                    <span>{r.name}</span>
                    <span>{r.parts.join(' · ')}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )
      )}

      {!open && segment !== 'leaders' && (
        side.length === 0 ? (
          <p className="empty-text">Nobody has a stat on this side yet.</p>
        ) : (
          <div className="rows">
            {side.map((r) => (
              <button type="button" className="row" key={r.key} onClick={() => onPlayer(r.key)}>
                <span className="row-number">#{r.number}</span>
                <span>
                  <strong>{r.name}</strong>
                  {r.lines.map((l) => (
                    <span key={l.category}>
                      <br />
                      {l.label} · {l.parts.join(' · ')}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: The card's link**

In `src/components/PlayerCard.tsx`, change the props type to

```ts
type Props = { player: Player; onBack?: () => void; stats?: StatsStore; onWeekByWeek?: () => void };
```

and the signature to `export function PlayerCard({ player, onBack, stats, onWeekByWeek }: Props)`. Immediately after the `<StatsTable … />` element (before the card's closing `</div>`), add:

```tsx
      {onWeekByWeek && (current || previous) && (
        <p className="filter-line">
          <button type="button" className="link-btn" onClick={onWeekByWeek}>
            Week by week
          </button>
        </p>
      )}
```

(`current` and `previous` are the two locals already computed near the top of `PlayerCard`.)

In `src/screens/Lookup.tsx`, add `onWeekByWeek?: (key: string) => void` to its props type, accept it in the function signature, and pass it at the `<PlayerCard` call:

```tsx
            onWeekByWeek={onWeekByWeek ? () => onWeekByWeek(playerKey(featured)) : undefined}
```

adding `import { playerKey } from '../stats/statsMatch';` if the file does not already import it. Do the same in `src/screens/RosterList.tsx` for its `<PlayerCard player={selected} …>` call, with `selected` in place of `featured`.

- [ ] **Step 3: The tab in `App.tsx`**

Add `'teamStats'` to the `Tab` union. Add imports:

```ts
import { TeamStats } from './screens/TeamStats';
```

After the `const [stats, setStats] = useState<StatsStore>(() => loadStats());` line add:

```ts
  // Which player's weeks the Stats tab has open; the card's link sets it from another tab.
  const [statsPlayer, setStatsPlayer] = useState<string | null>(null);

  // The tab exists only once something has been pasted for this season, and never
  // beside a baked Stats tab (YSU's), which would put two "Stats" on one bar.
  const hasTeamStats =
    !bakedTeam()?.seasons &&
    Boolean(stats.current) &&
    ((stats.current?.games?.length ?? 0) > 0 || Object.keys(stats.current?.byPlayer ?? {}).length > 0);

  const tabs = useMemo(() => {
    if (!hasTeamStats) return TABS;
    const entry = { id: 'teamStats' as Tab, label: 'Stats' };
    const at = TABS.findIndex((t) => t.id === 'league');
    return at === -1 ? [...TABS, entry] : [...TABS.slice(0, at), entry, ...TABS.slice(at)];
  }, [hasTeamStats]);

  useEffect(() => {
    if (tab === 'teamStats' && !hasTeamStats) setTab('lookup');
  }, [tab, hasTeamStats]);
```

App's react import is currently `import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';` — add `useMemo` to it. Find the tab bar render — the `TABS.map((t) => (` near `onClick={() => setTab(t.id)}` — and change `TABS.map` to `tabs.map`.

Add the screen render next to the other tab screens:

```tsx
        {tab === 'teamStats' && (
          <TeamStats roster={roster} stats={stats} player={statsPlayer} onPlayer={setStatsPlayer} />
        )}
```

Pass the card's link through on Lookup and Team:

```tsx
            onWeekByWeek={hasTeamStats ? (key) => { setStatsPlayer(key); setTab('teamStats'); } : undefined}
```

on the `<Lookup …>` element and the same prop on `<RosterList …>`.

- [ ] **Step 4: Type-check and run the suite**

`npx tsc --noEmit` clean; `npx vitest run` green.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TeamStats.tsx src/App.tsx src/components/PlayerCard.tsx src/screens/Lookup.tsx src/screens/RosterList.tsx
git commit -F - <<'EOF'
Add the Stats tab: leaders, each side of the ball, and a player's Fridays one by one

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log -1 --format=%B
```

---

### Task 7: Walk it through on the built preview

The dev server has no baked team, so this runs on `vite preview` over a build (the guard fails at the end of `npm run build` but `dist/` is produced). The controller runs this in the Browser pane at 375×812; the implementer of Task 6 does not.

- [ ] Build: `npm run build` (expect the guard to fail on the three page hashes only, `precache  32 entries`). Start `roster-preview` from `.claude/launch.json`.
- [ ] Setup → Stats → This season → One game. Opponent `Salem`, date `2026-08-21`, paste the contents of `src/stats/fixtures/hudl-game-home.txt`. Read: the report lists matched players and drops nobody Poland-side. Save. The "Games in" list shows `Aug 21 · Salem · N players`.
- [ ] Paste the away fixture as `Canfield`, `2026-09-11`. Two games listed, in date order.
- [ ] The tab bar now reads `Lookup · Team · Schedule · Stats · League`. Stats → Leaders shows Passing (Xipolitas 116 yds), Rushing (Jones 186 yds first, Xipolitas 167 second), Receiving, Defense (Zoumis 18 tackles first, Jones 17 second), Kicking (Carramusa 11 pts), Punting, Kick returns (Scott 120 yds, Jones 43), Punt returns (Nittoli).
- [ ] Offense lists players by number with lines; Defense; Special. A two-way player (Jones) appears on Offense, Defense and Special.
- [ ] Tap Jones on Leaders: `‹ Back`, `#5 Chase Jones`, `Aug 21 · Salem` with Rushing/Receiving/Defense/Kick returns lines, `Sep 11 · Canfield`, then `Season` with the sums. Back returns to Leaders.
- [ ] Lookup → 5 → the card shows "Week by week"; tapping it lands on the Stats tab with Jones open.
- [ ] Setup → Stats → One game → Remove Salem. Leaders update. Remove Canfield: the Stats tab disappears from the bar and the app is on Lookup.
- [ ] Take one screenshot of the Leaders segment and one of a player's weeks.

---

### Task 8: Prove the page diff and re-record the baseline

Identical to the Schools view's Task 5, with all three pages diffed. Every expected output is stated; a mismatch stops the task.

**Files:**
- Modify: `scripts/untouched-baseline.json`

- [ ] **Step 1: Build and read the guard's complaint**

```bash
npm run build > "$TEMP/build.log" 2>&1; echo "exit=$?"; grep -n -E "precache|changed|FAILED|must not|shrank|grew|denylist" "$TEMP/build.log"
```

Expected: `exit=1`; `precache  32 entries`; exactly three `! dist/.../index.html changed — it must not.` lines; nothing else.

- [ ] **Step 2: Diff all three live pages against the built ones**

```bash
S="$TEMP"
for pair in "/:dist/index.html" "/ysu/:dist/ysu/index.html" "/victorychristian/:dist/victorychristian/index.html"; do
  path="${pair%%:*}"; file="${pair#*:}"; tag=$(echo "$path" | tr '/' '_')
  curl -s "https://roster.scottforge.ai$path" -o "$S/live$tag.html"
  node -e "
const fs=require('fs');const S=process.env.TEMP;const tag=process.argv[1];const file=process.argv[2];
const norm=t=>t.replace(/\r/g,'').replace(/var token = '[^']*';/,\"var token = '<beacon>';\");
fs.writeFileSync(S+'/live'+tag+'.norm.html',norm(fs.readFileSync(S+'/live'+tag+'.html','utf8')));
fs.writeFileSync(S+'/dist'+tag+'.norm.html',norm(fs.readFileSync(file,'utf8')));
" "$tag" "$file"
  echo "== $path"; diff "$S/live$tag.norm.html" "$S/dist$tag.norm.html"; echo "changed-lines=$(diff "$S/live$tag.norm.html" "$S/dist$tag.norm.html" | grep -c '^[<>]')"
done
```

Expected, for each of the three: `changed-lines=2`, both lines the `<script type="module" crossorigin src="/assets/index-….js">` tag. Anything else means stop.

- [ ] **Step 3: Recompute the nine hashes with the guard's own functions**

```bash
node -e "
const fs=require('fs');const c=require('crypto');const sha=b=>c.createHash('sha256').update(b).digest('hex');
const norm=t=>t.replace(/\r/g,'').replace(/var token = '[^']*';/,\"var token = '<beacon>';\");
const wo=t=>norm(t).replace(/<script>window\.__TEAMS__=[\s\S]*?<\/script>/,'<script>__TEAMS__</script>');
const pages={root:'dist/index.html',ysu:'dist/ysu/index.html',vc:'dist/victorychristian/index.html'};
const file='scripts/untouched-baseline.json';
const cur=fs.readFileSync(file,'utf8');const old=JSON.parse(cur);const next={...old};
for(const [k,f] of Object.entries(pages)){const t=fs.readFileSync(f,'utf8');next[k]=sha(t);next[k+'Lf']=sha(norm(t));next[k+'Shell']=sha(wo(t));}
for(const k of Object.keys(next))console.log(k, old[k]===next[k]?'same':'CHANGED');
const eol=cur.includes('\r\n')?'\r\n':'\n';
fs.writeFileSync(file,(JSON.stringify(next,null,2)+'\n').replace(/\r?\n/g,eol));
"
```

Expected: `precache same` and nine `CHANGED`.

- [ ] **Step 4: Run the guard on its own**

```bash
node scripts/check-untouched.mjs; echo "guard=$?"
```

Expected: the "unchanged … Precache still 32 entries" sentence and `guard=0`.

- [ ] **Step 5: Full build once more**

```bash
npm run build > "$TEMP/build2.log" 2>&1; echo "exit=$?"; tail -3 "$TEMP/build2.log"
```

Expected: `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add scripts/untouched-baseline.json
git commit -F - <<'EOF'
Re-record the baseline for the Stats tab, a deliberate change to the root app

Proven the way CLAUDE.md describes: all three built pages differ from the
live ones by the bundle filename alone, the precache is still 32 entries,
and the guard passes on the rebuilt tree.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log -1 --format=%B
```

---

### Task 9: Whole-branch review and hand-off

- [ ] `npx tsc --noEmit && npx vitest run && npm run build` — all green, guard sentence at the end.
- [ ] `git diff main...HEAD --stat`; confirm `src/styles.css` and `src/oh/` are untouched and nothing under `src/` imports from `src/oh/`.
- [ ] Check the spec's "Not in this": no home/away or week numbers, no automatic Hudl pull, no per-game last season, no team totals, no hand editing.
- [ ] Report: branch, commits, the two screenshots, and the phone checks from the spec's Shipping item 6. Merge to main as a squash is the user's call.
