# Schools on the League tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third segment on Poland's League tab that searches all 716 Ohio schools by name or town and shows the chosen school's season, opponents tappable, from the directory files the site already publishes.

**Architecture:** One pure module (`src/league/schools.ts`) does the search ranking and turns a directory game into row text, pinned by tests. One new screen (`src/screens/Schools.tsx`) owns the two fetches and the failure states. `League.tsx` gains the segment and holds the query and chosen slug so the place survives a switch to Region. The baseline is re-recorded in the feature commit because this changes the root bundle.

**Tech Stack:** React 18 + TypeScript, Vite, vitest (node environment, `src/**/*.test.ts` only). No new dependencies.

Spec: `docs/superpowers/specs/2026-09-19-league-school-search-design.md`.

## Global Constraints

- **Poland must not change by accident.** `npm run build` ends with `scripts/check-untouched.mjs`. It WILL fail on this branch until Task 5 re-records the baseline; before that, only run `npx tsc --noEmit` and `npx vitest run`. Never edit `scripts/untouched-baseline.json` except in Task 5, by the procedure there.
- **Never edit `src/styles.css`.** Every element uses a class that exists: `control-bar`, `control-row`, `seg`, `input search`, `row`, `group-head`, `lg-game`, `lg-score`, `link-btn`, `filter-line`, `empty-text`.
- **Nothing here imports from `src/oh/`.** Types come from `src/ohio/stateModel.ts` (pure, shared).
- **Tests must pass env-free** and never touch the network. Screens are not unit-tested in this repo; the pure module is.
- **Copy uses typographic apostrophes** (`isn’t`, not `isn't`). Scores use an en dash (`28–14`, U+2013).
- **Fetch paths are absolute**: `/oh/index.json` and `/oh/data/<slug>.json`, not under the team base.
- **Commit messages** are plain sentences saying why, in the voice of `git log`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Work on branch `league-school-search` (already created off main, holds the spec).

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/league/fixtures/directory-poland-2026.json` | A copy of Poland's real directory season file, so row formatting is pinned to real data. |
| `src/league/schools.ts` | Pure: `searchSchools`, `describeGame`, `recordOf`. No React, no fetch. |
| `src/league/schools.test.ts` | Pins the three functions. |
| `src/screens/Schools.tsx` | The view: index fetch (once per session), season fetch per slug, search list, season rows, three failure messages. |
| `src/screens/League.tsx` | Adds the `Schools` segment and lifts `query` + `slug` state. |
| `scripts/untouched-baseline.json` | Re-recorded in Task 5 only. |

---

### Task 1: Search ranking (`searchSchools`)

**Files:**
- Create: `src/league/schools.ts`
- Test: `src/league/schools.test.ts`

**Interfaces:**
- Consumes: `School` from `src/ohio/stateModel.ts` — `{ slug: string; name: string; city: string }`.
- Produces: `searchSchools(schools: School[], query: string): School[]` — at most 15, ranked; `[]` when the trimmed query is under two characters.

- [ ] **Step 1: Write the failing tests**

Create `src/league/schools.test.ts`:

```ts
import { searchSchools } from './schools';
import type { School } from '../ohio/stateModel';

const s = (name: string, city: string): School => ({
  slug: `${name}-${city}`.toLowerCase().replace(/\s+/g, '-'),
  name,
  city,
});

const SCHOOLS: School[] = [
  s('Poland Seminary', 'Poland'),
  s('Youngstown East', 'Youngstown'),
  s('Youngstown Chaney', 'Youngstown'),
  s('Ursuline', 'Youngstown'),
  s('Struthers', 'Struthers'),
  s('Springfield', 'Springfield'),
  s('Springfield', 'New Middletown'),
  s('Jackson', 'Jackson'),
  s('Jackson-Milton', 'North Jackson'),
  s('Canfield', 'Canfield'),
  s('Salem', 'Salem'),
  s('Lowellville', 'Lowellville'),
  s('Ada', 'Ada'),
];

describe('searchSchools', () => {
  it('needs two characters before it answers', () => {
    expect(searchSchools(SCHOOLS, '')).toEqual([]);
    expect(searchSchools(SCHOOLS, 'p')).toEqual([]);
    expect(searchSchools(SCHOOLS, ' p ')).toEqual([]);
    expect(searchSchools(SCHOOLS, 'po')).toHaveLength(1);
  });

  it('matches the name, case and surrounding space ignored', () => {
    expect(searchSchools(SCHOOLS, '  POLAND ').map((x) => x.name)).toEqual(['Poland Seminary']);
  });

  it('matches the town too, so a school named for somewhere else is still found', () => {
    // Ursuline plays in Youngstown; nobody types "Ursuline" looking for the town.
    const names = searchSchools(SCHOOLS, 'youngs').map((x) => x.name);
    expect(names).toContain('Ursuline');
    expect(names).toContain('Youngstown East');
  });

  it('puts a name that starts with the query above one that merely contains it', () => {
    const names = searchSchools(SCHOOLS, 'jackson').map((x) => x.name);
    // Both start with "Jackson"; the town-only match for North Jackson would be
    // the same school, so this checks name-prefix ordering is alphabetical.
    expect(names).toEqual(['Jackson', 'Jackson-Milton']);
  });

  it('ranks name prefix, then town prefix, then anything that contains it', () => {
    const names = searchSchools(SCHOOLS, 'spring').map((x) => `${x.name}/${x.city}`);
    // Both Springfields match on name; alphabetical by name then city.
    expect(names).toEqual(['Springfield/New Middletown', 'Springfield/Springfield']);

    const east = searchSchools(SCHOOLS, 'east').map((x) => x.name);
    // "Youngstown East" only contains "east"; it still shows, after any prefix hits.
    expect(east).toEqual(['Youngstown East']);
  });

  it('caps the list at fifteen', () => {
    const many: School[] = Array.from({ length: 40 }, (_, i) => s(`Ada ${String(i).padStart(2, '0')}`, 'Ada'));
    expect(searchSchools(many, 'ada')).toHaveLength(15);
  });

  it('collapses runs of spaces in the query', () => {
    expect(searchSchools(SCHOOLS, 'poland   seminary').map((x) => x.name)).toEqual(['Poland Seminary']);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/league/schools.test.ts`
Expected: FAIL — `Cannot find module './schools'`.

- [ ] **Step 3: Write the implementation**

Create `src/league/schools.ts`:

```ts
/*
 * The Schools view's arithmetic: which schools match what was typed, and how
 * one of the directory's games reads as a row. Pure, so a ranking that feels
 * wrong can be pinned in a test rather than argued about on a phone.
 */

import type { School } from '../ohio/stateModel';

const MAX_MATCHES = 15;

const squash = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/*
 * Lower is better. A name that starts with the query is what almost everyone
 * meant; the town comes next because "Ursuline" is in Youngstown and a reader
 * who types the town should still find it; a bare "contains" is the fallback
 * that keeps "Youngstown East" reachable from "east".
 */
const tier = (school: School, q: string): number | null => {
  const name = squash(school.name);
  const city = squash(school.city);
  if (name.startsWith(q)) return 0;
  if (city.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (city.includes(q)) return 3;
  return null;
};

export function searchSchools(schools: School[], query: string): School[] {
  const q = squash(query);
  if (q.length < 2) return [];

  return schools
    .map((school) => ({ school, tier: tier(school, q) }))
    .filter((m): m is { school: School; tier: number } => m.tier !== null)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.school.name.localeCompare(b.school.name) ||
        a.school.city.localeCompare(b.school.city),
    )
    .slice(0, MAX_MATCHES)
    .map((m) => m.school);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/league/schools.test.ts`
Expected: 7 passed.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/league/schools.ts src/league/schools.test.ts
git commit -m "Rank a school search the way a reader means it: name first, then the town" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: A game as a row (`describeGame`, `recordOf`)

**Files:**
- Create: `src/league/fixtures/directory-poland-2026.json` (copy of `public/oh/data/poland-seminary-poland.json`)
- Modify: `src/league/schools.ts` (append)
- Modify: `src/league/schools.test.ts` (append)

**Interfaces:**
- Consumes: `SchoolGame`, `SchoolSeason` from `src/ohio/stateModel.ts`:
  ```ts
  type SchoolGame = { week: number; date: string; kickoff: string; home: boolean; opponent: string;
    opponentCity: string; opponentSlug: string | null; result?: { us: number; them: number; won: boolean }; overtime?: string };
  type SchoolSeason = { school: School; games: SchoolGame[]; record: { won: number; lost: number; played: number } };
  ```
- Produces:
  - `describeGame(game: SchoolGame): { week: string; date: string; opponent: string; result: string }` — `week` is `Wk 3`; `date` is `Fri Sep 4`; `opponent` is `vs Struthers` or `at Struthers`; `result` is `W 28–14`, `L 14–28`, `T 14–14`, the kickoff string, or `''`.
  - `recordOf(season: SchoolSeason): string` — `3–2`.

- [ ] **Step 1: Save the fixture**

```bash
cp public/oh/data/poland-seminary-poland.json src/league/fixtures/directory-poland-2026.json
```

Then open it and confirm: it has `school`, `games` and `record`; the first game is `week: 1`, `date: "2026-08-21"`, `home: true`, `opponent: "Salem"`, `result: { us: 17, them: 21, won: false }`; the last game has no `result` and `kickoff: "7pm"`. If the file has since been refreshed and those facts moved, adjust the numbers in the tests below to the fixture, not the other way round — the fixture is the truth.

- [ ] **Step 2: Write the failing tests**

Append to `src/league/schools.test.ts` (add the imports at the top of the file):

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describeGame, recordOf, searchSchools } from './schools';
import type { School, SchoolGame, SchoolSeason } from '../ohio/stateModel';

const poland: SchoolSeason = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/directory-poland-2026.json', import.meta.url)), 'utf8'),
);
```

(Replace the existing `import { searchSchools } from './schools';` and the `School` type import with the lines above.) Then append:

```ts
describe('describeGame', () => {
  it('reads a home loss off Poland’s real file', () => {
    const g = poland.games[0];
    expect(describeGame(g)).toEqual({
      week: 'Wk 1',
      date: 'Fri Aug 21',
      opponent: 'vs Salem',
      result: 'L 17–21',
    });
  });

  it('says "at" for an away game and puts our score first either way', () => {
    const g: SchoolGame = {
      week: 3, date: '2026-09-04', kickoff: '7pm', home: false,
      opponent: 'Struthers', opponentCity: 'Struthers', opponentSlug: 'struthers-struthers',
      result: { us: 28, them: 14, won: true },
    };
    expect(describeGame(g).opponent).toBe('at Struthers');
    expect(describeGame(g).result).toBe('W 28–14');
  });

  it('calls a level score a tie', () => {
    const g: SchoolGame = {
      week: 5, date: '2026-09-18', kickoff: '', home: true,
      opponent: 'Canfield', opponentCity: 'Canfield', opponentSlug: 'canfield-canfield',
      result: { us: 14, them: 14, won: false },
    };
    expect(describeGame(g).result).toBe('T 14–14');
  });

  it('shows the kickoff for a game not yet played, and nothing if there is no kickoff', () => {
    const last = poland.games[poland.games.length - 1];
    expect(last.result).toBeUndefined();
    expect(describeGame(last).result).toBe(last.kickoff);
    expect(describeGame({ ...last, kickoff: '' }).result).toBe('');
  });

  it('names the weekday from the date alone, whatever the machine’s time zone', () => {
    // 2026-08-21 is a Friday; a UTC-vs-local slip would print Thursday.
    const g: SchoolGame = {
      week: 1, date: '2026-08-21', kickoff: '7pm', home: true,
      opponent: 'Salem', opponentCity: 'Salem', opponentSlug: 'salem-salem',
    };
    expect(describeGame(g).date).toBe('Fri Aug 21');
    expect(describeGame({ ...g, date: '2026-10-31' }).date).toBe('Sat Oct 31');
    expect(describeGame({ ...g, date: '2026-01-01' }).date).toBe('Thu Jan 1');
  });
});

describe('recordOf', () => {
  it('prints won–lost with an en dash', () => {
    expect(recordOf(poland)).toBe(`${poland.record.won}–${poland.record.lost}`);
    expect(recordOf({ ...poland, record: { won: 0, lost: 0, played: 0 } })).toBe('0–0');
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/league/schools.test.ts`
Expected: FAIL — `describeGame is not a function` (or not exported).

- [ ] **Step 4: Write the implementation**

In `src/league/schools.ts`, widen the type import to

```ts
import type { School, SchoolGame, SchoolSeason } from '../ohio/stateModel';
```

then append:

```ts
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/*
 * The directory's date is already the Eastern calendar day. Building a Date
 * from it in UTC and reading UTC parts back keeps a phone west of Ohio from
 * printing Thursday for a Friday game.
 */
const shortDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[at.getUTCDay()]} ${MONTHS[m - 1]} ${d}`;
};

const score = (game: SchoolGame): string => {
  const r = game.result;
  if (!r) return game.kickoff || '';
  const mark = r.us === r.them ? 'T' : r.won ? 'W' : 'L';
  return `${mark} ${r.us}–${r.them}`;
};

export function describeGame(game: SchoolGame): {
  week: string;
  date: string;
  opponent: string;
  result: string;
} {
  return {
    week: `Wk ${game.week}`,
    date: shortDate(game.date),
    opponent: `${game.home ? 'vs' : 'at'} ${game.opponent}`,
    result: score(game),
  };
}

export const recordOf = (season: SchoolSeason): string =>
  `${season.record.won}–${season.record.lost}`;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/league/schools.test.ts`
Expected: all passed (7 search + 5 describe + 1 record = 13).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/league/schools.ts src/league/schools.test.ts src/league/fixtures/directory-poland-2026.json
git commit -m "Read a directory game as one row: week, day, who, and how it went" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The Schools view

**Files:**
- Create: `src/screens/Schools.tsx`

**Interfaces:**
- Consumes: `searchSchools`, `describeGame`, `recordOf` from `../league/schools`; `School`, `SchoolSeason` from `../ohio/stateModel`.
- Produces: `Schools` component with props
  ```ts
  { query: string; onQuery: (q: string) => void; slug: string | null; onSlug: (s: string | null) => void }
  ```
  League (Task 4) owns those four values.

- [ ] **Step 1: Write the component**

Create `src/screens/Schools.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { describeGame, recordOf, searchSchools } from '../league/schools';
import type { School, SchoolSeason } from '../ohio/stateModel';

/*
 * Any Ohio school's season, from the directory the site already publishes.
 *
 * Two files, fetched when needed and never precached: the index of every
 * school, once per session, and one small season file per school opened.
 * Away from a signal this view says so and does nothing clever — the
 * directory is deliberately kept off the phone, and a search box that lists
 * names it cannot open would be worse than the sentence.
 *
 * The query and the chosen school belong to the League screen, not here, so
 * a switch to Region and back lands on the same school.
 */

type Props = {
  query: string;
  onQuery: (q: string) => void;
  slug: string | null;
  onSlug: (s: string | null) => void;
};

const NEEDS_SIGNAL = 'Looking up a school needs a signal.';

/*
 * One fetch of the index per session. Held as the promise rather than the
 * result so two quick mounts share a request, and dropped on failure so
 * leaving the view and coming back tries again.
 */
let indexPromise: Promise<School[]> | null = null;

const loadIndex = (): Promise<School[]> => {
  if (!indexPromise) {
    indexPromise = fetch('/oh/index.json')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { schools?: School[] }) => {
        if (!Array.isArray(data.schools)) throw new Error('no schools');
        return data.schools;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
};

const loadSeason = async (slug: string): Promise<SchoolSeason> => {
  const res = await fetch(`/oh/data/${slug}.json`);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

export function Schools({ query, onQuery, slug, onSlug }: Props) {
  const [schools, setSchools] = useState<School[] | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [season, setSeason] = useState<SchoolSeason | null>(null);
  const [seasonFailed, setSeasonFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIndexFailed(false);
    loadIndex()
      .then((list) => !cancelled && setSchools(list))
      .catch(() => !cancelled && setIndexFailed(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!slug) {
      setSeason(null);
      setSeasonFailed(false);
      return;
    }
    let cancelled = false;
    setSeason(null);
    setSeasonFailed(false);
    loadSeason(slug)
      .then((s) => !cancelled && setSeason(s))
      .catch(() => !cancelled && setSeasonFailed(true));
    return () => { cancelled = true; };
  }, [slug]);

  if (slug) {
    return (
      <>
        <p className="filter-line">
          <button type="button" className="link-btn" onClick={() => onSlug(null)}>
            ‹ Back
          </button>
        </p>

        {seasonFailed && <p className="empty-text">{NEEDS_SIGNAL}</p>}
        {!seasonFailed && !season && <p className="empty-text">Loading…</p>}

        {season && (
          <>
            <div className="group-head">
              {season.school.name} · {season.school.city} · {recordOf(season)}
            </div>
            {season.games.length === 0 && (
              <p className="empty-text">No games listed for this school yet.</p>
            )}
            {season.games.map((g) => {
              const row = describeGame(g);
              return (
                <div className="lg-game" key={`${g.week}-${g.date}`}>
                  <span className="lg-side">
                    {row.week} · {row.date} ·{' '}
                    {g.opponentSlug ? (
                      <button type="button" className="link-btn" onClick={() => onSlug(g.opponentSlug)}>
                        {row.opponent}
                      </button>
                    ) : (
                      row.opponent
                    )}
                  </span>
                  <span className="lg-score">{row.result}</span>
                </div>
              );
            })}
          </>
        )}
      </>
    );
  }

  if (indexFailed) {
    return <p className="empty-text">{NEEDS_SIGNAL}</p>;
  }

  const matches = schools ? searchSchools(schools, query) : [];

  return (
    <>
      <div className="control-row">
        <input
          className="input search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="School or town"
          aria-label="Find a school"
          disabled={!schools}
        />
      </div>
      {matches.map((s) => (
        <button type="button" className="row" key={s.slug} onClick={() => onSlug(s.slug)}>
          {s.name} · {s.city}
        </button>
      ))}
    </>
  );
}
```

Notes for the implementer:
- `opponentSlug` is `null` for a non-Ohio opponent; that case prints plain text, not a button. Do not "fix" it into a button.
- The `key` on a row is week plus date; a school never plays two games on one date.
- Do not add a retry button; the spec says leaving and returning is the retry.
- Do not put the input inside `control-bar`; League already renders one above, with the segment control in it, and a second pinned bar would stack.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (The component is not imported anywhere yet; that's fine.)

- [ ] **Step 3: Commit**

```bash
git add src/screens/Schools.tsx
git commit -m "Add the Schools view: search the directory, open a season, tap through to an opponent" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Wire it into the League tab

**Files:**
- Modify: `src/screens/League.tsx` — import block (line 1–3), the `view` state (line 32), the segment control (lines 70–77), and the render body (after line 114, before `{view === 'region' && (`).

**Interfaces:**
- Consumes: `Schools` from `./Schools` with props `{ query, onQuery, slug, onSlug }`.

- [ ] **Step 1: Add the import**

Below `import { byWeek, type LeagueGame, type Standing } from '../league/leagueModel';` add:

```ts
import { Schools } from './Schools';
```

- [ ] **Step 2: Widen the view and lift the Schools state**

Replace

```ts
  const [view, setView] = useState<'league' | 'region'>('league');
```

with

```ts
  const [view, setView] = useState<'league' | 'region' | 'schools'>('league');
  // Held here rather than in Schools so a look at the Region and back lands
  // on the same school with the same thing typed.
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolSlug, setSchoolSlug] = useState<string | null>(null);
```

- [ ] **Step 3: Add the segment**

After the Region button

```tsx
          <button type="button" aria-pressed={view === 'region'} onClick={() => setView('region')}>
            Region
          </button>
```

add

```tsx
          <button type="button" aria-pressed={view === 'schools'} onClick={() => setView('schools')}>
            Schools
          </button>
```

- [ ] **Step 4: Render the view**

Immediately before `{view === 'region' && (` add:

```tsx
      {view === 'schools' && (
        <Schools
          query={schoolQuery}
          onQuery={setSchoolQuery}
          slug={schoolSlug}
          onSlug={setSchoolSlug}
        />
      )}
```

- [ ] **Step 5: Type-check and run the suite**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: everything green (the count is the pre-branch total plus 13).

- [ ] **Step 6: Look at it**

Run `npm run dev` and open the root page in the Browser pane at 375×812. The dev server renders Poland (see memory: it cannot render YSU or Victory Christian, which is fine here). Open the League tab. Check, in order:

1. The control reads `Northeast 8 · Region · Schools`.
2. Schools shows the search box; typing `po` lists `Poland Seminary · Poland`; typing `youngs` lists the Youngstown schools with Ursuline among them.
3. Tapping Poland shows `‹ Back`, the header `Poland Seminary · Poland · 3–2` (or whatever the record is that day), and one row per game with `vs`/`at`, the short date, and `W 28–14`-style scores, en dashes visible.
4. Tapping an opponent's name loads that school. Back returns to the search with `po` still typed.
5. Switch to Region and back to Schools: the same school is still open.
6. In devtools, block requests to `/oh/*` (or go offline), leave Schools and come back: the sentence `Looking up a school needs a signal.` replaces the box.

Take one screenshot of step 3 for the PR.

- [ ] **Step 7: Commit**

```bash
git add src/screens/League.tsx
git commit -m "Put Schools beside the conference and the region, and keep your place across the switch" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Prove the page diff and re-record the baseline

This is the deliberate root-app change procedure from CLAUDE.md. Every step's expected output is stated; if one differs, stop and report rather than proceed.

**Files:**
- Modify: `scripts/untouched-baseline.json`

- [ ] **Step 1: Build and read the guard's complaint**

```bash
npm run build > "$TEMP/build.log" 2>&1; echo "exit=$?"; grep -n -E "precache|changed|FAILED|must not|shrank|grew|denylist" "$TEMP/build.log"
```

Expected: `exit=1`; a line `precache  32 entries`; exactly three `! dist/.../index.html changed — it must not.` lines (root, ysu, victorychristian); nothing about precache growing or shrinking, nothing about the denylist. Any other complaint means something else changed — stop.

- [ ] **Step 2: Diff the built root page against the live one**

```bash
S="$TEMP"; curl -s https://roster.scottforge.ai/ -o "$S/live-index.html"
node -e "
const fs=require('fs');const S=process.env.TEMP;
const norm=t=>t.replace(/\r/g,'').replace(/var token = '[^']*';/,\"var token = '<beacon>';\");
fs.writeFileSync(S+'/live.norm.html',norm(fs.readFileSync(S+'/live-index.html','utf8')));
fs.writeFileSync(S+'/dist.norm.html',norm(fs.readFileSync('dist/index.html','utf8')));
"
diff "$S/live.norm.html" "$S/dist.norm.html"; echo "changed-lines=$(diff "$S/live.norm.html" "$S/dist.norm.html" | grep -c '^[<>]')"
```

Expected: `changed-lines=2`, and both lines are the `<script type="module" crossorigin src="/assets/index-….js">` tag with different hashes. Anything else in the diff (a stylesheet link, a manifest line, a `__TEAMS__` change) means stop.

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

Expected output: `precache same` and the other nine keys `CHANGED`.

- [ ] **Step 4: Run the guard on its own**

```bash
node scripts/check-untouched.mjs; echo "guard=$?"
```

Expected: `Poland, YSU and Victory Christian are unchanged. Precache still 32 entries, …` and `guard=0`.

- [ ] **Step 5: Full build once more**

```bash
npm run build > "$TEMP/build2.log" 2>&1; echo "exit=$?"; tail -3 "$TEMP/build2.log"
```

Expected: `exit=0`, the guard's sentence at the end.

- [ ] **Step 6: Commit the baseline with a message that says why**

```bash
git add scripts/untouched-baseline.json
git commit -m "Re-record the baseline for the Schools view, a deliberate change to the root app" -m "Proven the way CLAUDE.md describes: the built root page differs from the live one by the bundle filename alone, the precache is still 32 entries, and the guard passes on the rebuilt tree." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Whole-branch review and hand-off

- [ ] **Step 1: Run everything**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: all green, guard sentence at the end.

- [ ] **Step 2: Read the diff against main as a reviewer**

```bash
git diff main...HEAD --stat
git diff main...HEAD -- src
```

Check against the spec's "Not in this" list: no offline search, no history stack, no roster or crest, nothing on `/oh/`. Check no file under `src/screens` or `src/league` imports from `src/oh/`. Check `src/styles.css` is untouched: `git diff main...HEAD --stat -- src/styles.css` prints nothing.

- [ ] **Step 3: Hand off**

Report to the user: the branch name, the commit list, the screenshot from Task 4 step 6, and the two things they must do on a phone after merge and deploy (spec, Shipping, item 6). Merging to main and pushing is the user's call, since it ships to installed phones.
