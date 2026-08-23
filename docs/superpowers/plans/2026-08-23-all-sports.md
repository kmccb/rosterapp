# All Sports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid school with rosters in more than one sport gets a sport-picker hub on its `/oh/` page; each sport opens the v2 tab set, with non-football schedules stored as concierge pastes.

**Architecture:** The `school_roster` table is already keyed by school + sport + season; this plan adds one public function (`school_roster_sports`), a `schedule` jsonb column (migration 0006), makes the fan-side fetch and cache sport-aware, adds a sport picker and schedule paste to the panel, and puts the hub in `School.tsx`. Static sport knowledge (seasons, emoji) is a pinned table, not a data source.

**Tech Stack:** React + TypeScript (Vite), Vitest, Supabase via plain-fetch RPC (`src/oh/supa.ts`), plpgsql migrations applied by hand.

**Spec:** `docs/superpowers/specs/2026-08-23-all-sports-design.md`. One deliberate refinement over the spec: the hub's tile list is the live sports **plus football always** — football's schedule and scores come free from the directory, so a school whose only paid sport is basketball still shows a football tile (opening today's free schedule page) rather than hiding the one thing every school already gets. Consequently the hub appears whenever a school has any non-football live sport.

## Global Constraints

- **Never edit `src/styles.css`** — its hash is baked into the guarded Poland pages. All new styles go in `src/oh/oh.css`.
- **Nothing under `src/oh/` imports the root app's runtime** (`src/share`, `src/screens`, `src/theme`, `src/App.tsx`). Pure modules are fine (`src/types`, `src/parse/*`, `src/components/Keypad`, `src/ohio/*`).
- **Tests must pass env-free**: mock `./supa` with `vi.mock`, never stub env vars or global fetch for supa-dependent code.
- **`npm run build` must stay green** — it ends with the Poland guard (`scripts/check-untouched.mjs`). Never fix a guard failure by editing the baseline.
- **Migration conventions**: new numbered file `0006_*.sql`; `begin/commit`; errcode'd raises in sentence voice with typographic apostrophes; schema-wide `revoke execute on all functions` then re-grant EVERY live function by exact signature; signature changes drop BOTH old and new signatures first (apply-twice must succeed); end with `notify pgrst, 'reload schema'`. Applied by hand in the dashboard SQL editor — never from this repo.
- **Deploy ordering** (0006 changes `school_roster_upsert`'s signature): push → deploy green → apply migration. The plan only writes the file; applying it is a post-merge step for the user.
- Commit messages: plain sentences saying why, in the repo's voice. Comments: prose explaining why. Typographic apostrophes (’) in user-facing copy.
- Run tests with `npx vitest run <file>` (targeted) and `npx vitest run` + `npx tsc --noEmit` (full). Baseline before this plan: 295 tests / 20 files, all green.

## File Structure

- Create: `src/oh/sportSeasons.ts` + test — static sport table: in-season months, display labels, emoji, hub composition, ordering.
- Create: `src/oh/scheduleParse.ts` + test — pure paste parser producing `ScheduleRow[]`; owns the `ScheduleRow` type.
- Create: `supabase/migrations/0006_all_sports.sql` — `school_roster_sports`, `schedule` column + check, upsert 10-param, fetch + schedule, list + `has_schedule`, grants.
- Modify: `src/oh/rosterStore.ts` + test — sport-aware fetch/cache, `schedule` validation, `loadSchoolSports`.
- Modify: `src/oh/store.ts` + test — prefix eviction, remembered sport.
- Modify: `src/oh/manage/adminApi.ts`, `src/oh/manage/Activate.tsx` + `activate.test.ts`, `src/oh/manage/Manage.tsx` — sport picker, schedule paste, `scheduleArg`.
- Modify: `src/oh/School.tsx`, `src/oh/oh.css` — the hub and per-sport views.
- Modify: `scripts/verify-school-roster.mjs`, `docs/going-live.md`, `CLAUDE.md` — the new function's live checks and the updated contracts.

---

### Task 0: Branch

- [ ] **Step 1: Create the working branch from a clean main**

```bash
git checkout -b all-sports
git add docs/superpowers/specs/2026-08-23-all-sports-design.md docs/superpowers/plans/2026-08-23-all-sports.md
git commit -m "Spec and plan for the all-sports hub"
```

---

### Task 1: Sport knowledge — `src/oh/sportSeasons.ts`

**Files:**
- Create: `src/oh/sportSeasons.ts`
- Test: `src/oh/sportSeasons.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by School.tsx in Task 6):
  - `inSeason(sport: string, month: number): boolean` — month is 1–12.
  - `sortSportsForNow(sports: string[], now: Date): string[]`
  - `hubSports(live: string[]): string[]`
  - `sportLabel(sport: string): string`
  - `sportEmoji(sport: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/oh/sportSeasons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hubSports, inSeason, sortSportsForNow, sportEmoji, sportLabel } from './sportSeasons';

describe('sport seasons', () => {
  it('knows the Ohio calendar', () => {
    expect(inSeason('football', 9)).toBe(true);
    expect(inSeason('football', 2)).toBe(false);
    expect(inSeason('basketball', 12)).toBe(true);
    expect(inSeason('basketball', 9)).toBe(false);
    // Winter sports wrap the year boundary.
    expect(inSeason('basketball', 1)).toBe(true);
    expect(inSeason('softball', 4)).toBe(true);
    expect(inSeason('softball', 10)).toBe(false);
  });

  it('treats a sport it has never heard of as always in season', () => {
    expect(inSeason('esports', 1)).toBe(true);
    expect(inSeason('esports', 7)).toBe(true);
  });

  it('puts in-season sports first, alphabetical within each group', () => {
    const november = new Date('2026-11-15T12:00:00');
    expect(sortSportsForNow(['football', 'basketball', 'baseball', 'wrestling'], november))
      .toEqual(['basketball', 'football', 'wrestling', 'baseball']);
    const april = new Date('2027-04-15T12:00:00');
    expect(sortSportsForNow(['football', 'basketball', 'baseball'], april))
      .toEqual(['baseball', 'basketball', 'football']);
  });

  it('always includes football in the hub, without duplicating it', () => {
    expect(hubSports(['basketball'])).toEqual(['basketball', 'football']);
    expect(hubSports(['football', 'volleyball'])).toEqual(['football', 'volleyball']);
    expect(hubSports([])).toEqual(['football']);
  });

  it('labels and badges', () => {
    expect(sportLabel('cross country')).toBe('Cross Country');
    expect(sportEmoji('football')).toBe('🏈');
    expect(sportEmoji('esports')).toBe('🎽');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/oh/sportSeasons.test.ts`
Expected: FAIL — cannot resolve `./sportSeasons`.

- [ ] **Step 3: Implement**

Create `src/oh/sportSeasons.ts`:

```ts
/*
 * What the hub knows about sports without asking anybody.
 *
 * Ohio's high-school calendar is static knowledge: football is an autumn
 * sport this year and every year. A pinned table keeps the hub current on
 * its own — in November basketball leads and baseball dims — with no data
 * source, no cron, and nothing to go stale. A sport missing from the table
 * simply counts as always in season, so a new sport sells before this file
 * hears about it.
 */

const MONTHS: Record<string, number[]> = {
  football: [8, 9, 10, 11],
  volleyball: [8, 9, 10, 11],
  soccer: [8, 9, 10, 11],
  'cross country': [8, 9, 10],
  golf: [8, 9, 10],
  // Girls' tennis is autumn, boys' is spring; one entry covers the pair.
  tennis: [3, 4, 5, 8, 9, 10],
  cheer: [8, 9, 10, 11, 12, 1, 2],
  basketball: [11, 12, 1, 2, 3],
  wrestling: [11, 12, 1, 2, 3],
  swimming: [11, 12, 1, 2],
  hockey: [11, 12, 1, 2, 3],
  bowling: [11, 12, 1, 2],
  baseball: [3, 4, 5, 6],
  softball: [3, 4, 5, 6],
  track: [3, 4, 5, 6],
  lacrosse: [3, 4, 5],
};

const EMOJI: Record<string, string> = {
  football: '🏈', volleyball: '🏐', soccer: '⚽', 'cross country': '🏃',
  golf: '⛳', tennis: '🎾', cheer: '📣', basketball: '🏀', wrestling: '🤼',
  swimming: '🏊', hockey: '🏒', bowling: '🎳', baseball: '⚾', softball: '🥎',
  track: '🏃', lacrosse: '🥍',
};

const norm = (sport: string): string => sport.trim().toLowerCase();

/** Month is 1–12. A sport the table doesn't know is always in season. */
export const inSeason = (sport: string, month: number): boolean => {
  const months = MONTHS[norm(sport)];
  return months ? months.includes(month) : true;
};

/** In-season sports first, alphabetical within each group. */
export const sortSportsForNow = (sports: string[], now: Date): string[] => {
  const month = now.getMonth() + 1;
  return [...sports].sort((a, b) => {
    const liveA = inSeason(a, month) ? 0 : 1;
    const liveB = inSeason(b, month) ? 0 : 1;
    return liveA - liveB || a.localeCompare(b);
  });
};

/**
 * The tiles the hub draws: every live paid sport, plus football always —
 * football's schedule and scores come free from the directory, so the one
 * thing every school already has must not vanish behind a paid basketball
 * roster.
 */
export const hubSports = (live: string[]): string[] => {
  const seen = new Set(live.map(norm));
  return seen.has('football') ? [...seen] : [...seen, 'football'];
};

export const sportLabel = (sport: string): string =>
  norm(sport).replace(/\b[a-z]/g, (c) => c.toUpperCase());

export const sportEmoji = (sport: string): string => EMOJI[norm(sport)] ?? '🎽';
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/oh/sportSeasons.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/oh/sportSeasons.ts src/oh/sportSeasons.test.ts
git commit -m "Pin the sport calendar the hub sorts itself by"
```

---

### Task 2: Schedule paste parser — `src/oh/scheduleParse.ts`

**Files:**
- Create: `src/oh/scheduleParse.ts`
- Test: `src/oh/scheduleParse.test.ts`

**Interfaces:**
- Consumes: nothing (pure module — no imports beyond types it defines).
- Produces (used by rosterStore in Task 3, Activate in Task 5, School in Task 6):

```ts
export type ScheduleScore = { us: number; them: number };
export type ScheduleRow = {
  date: string;            // ISO "2026-11-27"
  opponent: string;
  home: boolean;
  time?: string;           // "7:00 PM"
  score?: ScheduleScore;
};
export type ParsedSchedule = { rows: ScheduleRow[]; skipped: { text: string; issue: string }[] };
export function parseSchedule(text: string, seasonYear: number): ParsedSchedule;
```

**Parsing rules (encode exactly these — the tests pin them):**
- Lines split on `\n`; blank lines ignored. Cells split on tabs; a line with no tab splits on runs of 2+ spaces instead.
- Cells classify left-to-right by content, not position. The first date-like cell claims the date; after that, `n-n` cells may be scores. A line with no date, or no opponent, lands in `skipped` with a sentence saying why (header rows skip themselves this way).
- Dates accepted: `2026-11-27`, `11/27`, `11/27/26`, `11/27/2026`, `Nov 27`, `November 27`. An explicit year wins; otherwise month ≥ 7 files under `seasonYear`, month < 7 under `seasonYear + 1` (a basketball season labelled 2026 plays its February games in 2027).
- Home/away: a standalone cell `h`/`home`/`vs` → home, `a`/`away`/`at`/`@` → away (case-insensitive); or the opponent cell starting `@ `, `at `, or `vs `/`vs. ` strips the marker and sets the flag. Default is home.
- Time: `7pm`, `7 PM`, `7:00pm`, `19:00` is NOT accepted (nobody pastes 24-hour); normalize to `7:00 PM`.
- Score: `W 3-1` / `L 1-3` (letter validated as a marker only — the first number is always ours) or a bare `45-21` after the date is claimed. En-dash accepted alongside hyphen.

- [ ] **Step 1: Write the failing test**

Create `src/oh/scheduleParse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseSchedule } from './scheduleParse';

describe('parseSchedule', () => {
  it('reads a plain spreadsheet paste', () => {
    const text = [
      'Date\tOpponent\tH/A\tTime',
      '8/28\tCanfield\tH\t7:00 PM',
      '9/4\tHoward\tA\t7pm',
    ].join('\n');
    const { rows, skipped } = parseSchedule(text, 2026);
    expect(skipped).toEqual([{ text: 'Date Opponent H/A Time', issue: 'no date on this line' }]);
    expect(rows).toEqual([
      { date: '2026-08-28', opponent: 'Canfield', home: true, time: '7:00 PM' },
      { date: '2026-09-04', opponent: 'Howard', home: false, time: '7:00 PM' },
    ]);
  });

  it('rolls past-new-year dates into the following calendar year', () => {
    const { rows } = parseSchedule('11/27\tBoardman\n2/6\tFitch', 2026);
    expect(rows[0].date).toBe('2026-11-27');
    expect(rows[1].date).toBe('2027-02-06');
  });

  it('honors an explicit year over the season clock', () => {
    const { rows } = parseSchedule('2/6/2026\tFitch', 2026);
    expect(rows[0].date).toBe('2026-02-06');
  });

  it('reads scores, ours first regardless of the letter', () => {
    const { rows } = parseSchedule('11/27\tBoardman\tW 3-1\n12/4\tFitch\tL 1–3', 2026);
    expect(rows[0].score).toEqual({ us: 3, them: 1 });
    expect(rows[1].score).toEqual({ us: 1, them: 3 });
  });

  it('reads a bare score once the date is claimed', () => {
    const { rows } = parseSchedule('8/28\tCanfield\t45-21', 2026);
    expect(rows[0].score).toEqual({ us: 45, them: 21 });
  });

  it('takes home and away from the opponent cell when there is no marker cell', () => {
    const { rows } = parseSchedule('8/28\t@ Canfield\n9/4\tvs. Howard', 2026);
    expect(rows[0]).toMatchObject({ opponent: 'Canfield', home: false });
    expect(rows[1]).toMatchObject({ opponent: 'Howard', home: true });
  });

  it('splits on runs of spaces when there are no tabs', () => {
    const { rows } = parseSchedule('Aug 28   Canfield   7:00 PM', 2026);
    expect(rows).toEqual([{ date: '2026-08-28', opponent: 'Canfield', home: true, time: '7:00 PM' }]);
  });

  it('skips a line with a date but nobody to play', () => {
    const { rows, skipped } = parseSchedule('8/28\t7:00 PM', 2026);
    expect(rows).toEqual([]);
    expect(skipped[0].issue).toBe('no opponent on this line');
  });

  it('reads month names', () => {
    const { rows } = parseSchedule('November 27\tBoardman', 2026);
    expect(rows[0].date).toBe('2026-11-27');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/oh/scheduleParse.test.ts`
Expected: FAIL — cannot resolve `./scheduleParse`.

- [ ] **Step 3: Implement**

Create `src/oh/scheduleParse.ts`:

```ts
/*
 * Parses schedule rows pasted out of a spreadsheet or a school's site.
 *
 * The directory can feed football fixtures for every school in the state,
 * but no scrapeable source exists for volleyball or basketball — so those
 * schedules arrive the way rosters do: the seller pastes, this reads it,
 * and the panel shows what it made before anything is saved. Cells are
 * classified by what they contain rather than which column they sat in,
 * because every school's spreadsheet is laid out differently.
 *
 * Everything here is pure and pinned in tests, the same bargain every
 * parser in this repo makes.
 */

export type ScheduleScore = { us: number; them: number };

export type ScheduleRow = {
  /** ISO date, e.g. "2026-11-27". */
  date: string;
  opponent: string;
  home: boolean;
  /** Kickoff/tip as printed for a fan, e.g. "7:00 PM". */
  time?: string;
  /** Ours first. Absent means the game hasn't been played (or reported). */
  score?: ScheduleScore;
};

export type ParsedSchedule = {
  rows: ScheduleRow[];
  skipped: { text: string; issue: string }[];
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * A date with no year files under the season's clock: July onward is the
 * season's own year, January–June the one after — a basketball season
 * labelled 2026 plays its February games in 2027.
 */
const yearFor = (month: number, seasonYear: number): number =>
  month >= 7 ? seasonYear : seasonYear + 1;

const parseDate = (cell: string, seasonYear: number): string | null => {
  const iso = cell.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return cell;

  const slash = cell.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const year = slash[3]
      ? Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3])
      : yearFor(month, seasonYear);
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const named = cell.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
  if (named) {
    const month = MONTH_NAMES[named[1].slice(0, 3).toLowerCase()];
    const day = Number(named[2]);
    if (!month || day < 1 || day > 31) return null;
    const year = named[3] ? Number(named[3]) : yearFor(month, seasonYear);
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  return null;
};

const parseTime = (cell: string): string | null => {
  const m = cell.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  return `${hour}:${m[2] ?? '00'} ${m[3].toUpperCase()}M`;
};

/** true = home, false = away, null = this cell isn't a home/away marker. */
const parseHomeAway = (cell: string): boolean | null => {
  const v = cell.trim().toLowerCase();
  if (v === 'h' || v === 'home' || v === 'vs' || v === 'vs.') return true;
  if (v === 'a' || v === 'away' || v === 'at' || v === '@') return false;
  return null;
};

/** "W 3-1", "L 1–3", or a bare "45-21". The first number is always ours —
 * the letter is a marker people type, not a field anyone trusts. */
const parseScore = (cell: string, dateClaimed: boolean): ScheduleScore | null => {
  const marked = cell.match(/^[WLwl]\s+(\d+)\s*[-–]\s*(\d+)$/);
  if (marked) return { us: Number(marked[1]), them: Number(marked[2]) };
  if (!dateClaimed) return null;
  const bare = cell.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  return bare ? { us: Number(bare[1]), them: Number(bare[2]) } : null;
};

export function parseSchedule(text: string, seasonYear: number): ParsedSchedule {
  const rows: ScheduleRow[] = [];
  const skipped: ParsedSchedule['skipped'] = [];

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/))
      .map((c) => c.trim())
      .filter(Boolean);

    let date: string | null = null;
    let opponent: string | null = null;
    let home: boolean | null = null;
    let time: string | undefined;
    let score: ScheduleScore | undefined;

    for (const cell of cells) {
      if (!date) {
        const d = parseDate(cell, seasonYear);
        if (d) { date = d; continue; }
      }
      const s = parseScore(cell, date !== null);
      if (s && !score) { score = s; continue; }
      const t = parseTime(cell);
      if (t && !time) { time = t; continue; }
      const ha = parseHomeAway(cell);
      if (ha !== null && home === null) { home = ha; continue; }
      if (!opponent) {
        // The opponent may carry its own venue marker: "@ Canfield".
        const marked = cell.match(/^(?:@|at|vs\.?)\s+(.+)$/i);
        if (marked) {
          opponent = marked[1];
          if (home === null) home = /^vs/i.test(cell);
        } else {
          opponent = cell;
        }
      }
    }

    const raw = cells.join(' ');
    if (!date) { skipped.push({ text: raw, issue: 'no date on this line' }); continue; }
    if (!opponent) { skipped.push({ text: raw, issue: 'no opponent on this line' }); continue; }

    const row: ScheduleRow = { date, opponent, home: home ?? true };
    if (time) row.time = time;
    if (score) row.score = score;
    rows.push(row);
  }

  return { rows, skipped };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/oh/scheduleParse.test.ts`
Expected: PASS (9 tests). If a case fails, fix the parser, not the pinned expectation — the rules above are the contract.

- [ ] **Step 5: Commit**

```bash
git add src/oh/scheduleParse.ts src/oh/scheduleParse.test.ts
git commit -m "Parse pasted schedules the way rosters already arrive"
```

---

### Task 3: Migration 0006 + verify script + docs

**Files:**
- Create: `supabase/migrations/0006_all_sports.sql`
- Modify: `scripts/verify-school-roster.mjs` (add `school_roster_sports` checks)
- Modify: `docs/going-live.md` (0006 joins the signature-change ordering note)

**Interfaces:**
- Consumes: 0005's live schema.
- Produces (the client tasks call these):
  - `school_roster_sports(p_slug text) → jsonb` — array of live sports, `[]` when none. Granted to anon.
  - `school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, boolean, date, text)` — `p_schedule jsonb` is the NEW 7th parameter, between `p_theme` and `p_published`. Contract: null keeps, `'[]'::jsonb` clears, an array sets.
  - `school_roster_fetch` returns `schedule` alongside `season/players/colors/theme`.
  - `school_roster_list` rows gain `has_schedule` boolean.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_all_sports.sql`:

```sql
-- The all-sports hub: which sports a school has live, and a schedule for
-- the sports the directory cannot feed.
--
-- school_roster was keyed by school + sport + season from the start; this
-- migration is the day that key becomes a product. One new public door
-- (school_roster_sports — what the hub draws) and one new column
-- (schedule — pasted rows, because no scrapeable source exists for
-- volleyball or basketball the way joeeitel feeds football).

begin;

alter table public.school_roster
  add column if not exists schedule jsonb;

comment on column public.school_roster.schedule is
  'Concierge-pasted fixtures for sports the directory cannot feed: [{"date","opponent","home",...}]. Null for football, whose schedule the directory already has.';

-- A season is ~30 games; 100 rows and 100 kB stop a paste of the wrong
-- thing without ever bothering a real schedule.
create or replace function public.school_roster_check_schedule(p_schedule jsonb)
returns void
language plpgsql
as $$
declare
  v_row jsonb;
begin
  if p_schedule is null then return; end if;
  if jsonb_typeof(p_schedule) <> 'array' then
    raise exception 'schedule must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_schedule) > 100 then
    raise exception 'that schedule has too many rows to be a season' using errcode = '22023';
  end if;
  if pg_column_size(p_schedule) > 100000 then
    raise exception 'that schedule is too large to store' using errcode = '22023';
  end if;
  for v_row in select jsonb_array_elements(p_schedule) loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row->'date') <> 'string'
       or jsonb_typeof(v_row->'opponent') <> 'string' then
      raise exception 'each schedule row needs at least a date and an opponent' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------------ sports

-- The hub's one question: which sports does this school have live? Same
-- gate as fetch — published and paid, on the Eastern clock — and the answer
-- carries sport names only, so an expired school looks exactly like a
-- school that never paid.
create or replace function public.school_roster_sports(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(distinct r.sport), '[]'::jsonb)
  from public.school_roster r
  where r.school_slug = p_slug
    and r.published
    and r.paid_through >= (now() at time zone 'America/New_York')::date;
$$;

-- ------------------------------------------------------------------ fetch

drop function if exists public.school_roster_fetch(text, text);

create function public.school_roster_fetch(p_slug text, p_sport text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'season',   r.season,
           'players',  r.players,
           'colors',   r.colors,
           'theme',    r.theme,
           'schedule', r.schedule
         )
  from public.school_roster r
  where r.school_slug = p_slug
    and r.sport = p_sport
    and r.published
    and r.paid_through >= (now() at time zone 'America/New_York')::date
  order by r.season desc
  limit 1;
$$;

-- ------------------------------------------------------------------ upsert

drop function if exists public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, boolean, date, text);
drop function if exists public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, boolean, date, text);

-- p_schedule follows p_theme's contract: null keeps what is stored, an
-- empty array clears it, an array sets it. A renewal must not lose the
-- schedule it isn't carrying.
create function public.school_roster_upsert(
  p_slug text, p_sport text, p_season integer,
  p_players jsonb, p_colors jsonb, p_theme jsonb, p_schedule jsonb,
  p_published boolean, p_paid_through date, p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_final_players jsonb;
begin
  if not public.school_admin() then
    raise exception 'this account is not the seller''s and may not touch the paid tier'
      using errcode = '42501';
  end if;

  perform public.school_roster_check_players(p_players);
  perform public.school_roster_check_theme(p_theme);
  perform public.school_roster_check_schedule(p_schedule);

  update public.school_roster set
    players      = coalesce(p_players, players),
    colors       = p_colors,
    theme        = case
                     when p_theme is null then theme
                     when p_theme = '{}'::jsonb then null
                     else p_theme
                   end,
    schedule     = case
                     when p_schedule is null then schedule
                     when p_schedule = '[]'::jsonb then null
                     else p_schedule
                   end,
    published    = p_published,
    paid_through = p_paid_through,
    note         = p_note,
    updated_at   = now()
  where school_slug = p_slug and sport = p_sport and season = p_season
  returning players into v_final_players;

  if found then
    if p_published and jsonb_array_length(v_final_players) = 0 then
      raise exception 'a roster cannot be published with nobody on it' using errcode = '22023';
    end if;
    return;
  end if;

  if p_published and (p_players is null or jsonb_array_length(p_players) = 0) then
    raise exception 'a roster cannot be published with nobody on it' using errcode = '22023';
  end if;

  insert into public.school_roster
    (school_slug, sport, season, players, colors, theme, schedule, published, paid_through, note)
  values
    (p_slug, p_sport, p_season, coalesce(p_players, '[]'::jsonb), p_colors,
     case when p_theme = '{}'::jsonb then null else p_theme end,
     case when p_schedule = '[]'::jsonb then null else p_schedule end,
     p_published, p_paid_through, p_note);
end;
$$;

-- -------------------------------------------------------------------- list

create or replace function public.school_roster_list()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'school_slug',  school_slug,
           'sport',        sport,
           'season',       season,
           'player_count', jsonb_array_length(players),
           'colors',       colors,
           'has_logo',     coalesce(theme ? 'logo', false),
           'has_schedule', schedule is not null,
           'published',    published,
           'paid_through', paid_through,
           'note',         note,
           'updated_at',   updated_at
         )
  from public.school_roster
  where public.school_admin()
  order by school_slug, sport, season desc;
$$;

-- ----------------------------------------------------------------- grants

revoke execute on all functions in schema public from public, anon, authenticated;

-- Everything live gets its grant back — the schema-wide revoke above strips
-- the share-code doors and the school doors alike, so the whole set is
-- re-listed here, as every migration since 0001 has done. Five school_*
-- grants now: sports joins fetch on the anon side.
grant execute on function public.roster_fetch(text) to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text) to anon, authenticated;
grant execute on function public.school_roster_fetch(text, text) to anon, authenticated;
grant execute on function public.school_roster_sports(text) to anon, authenticated;
grant execute on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, boolean, date, text) to authenticated;
grant execute on function public.school_roster_delete(text, text, integer) to authenticated;
grant execute on function public.school_roster_list() to authenticated;

commit;

-- PostgREST caches the function catalog; without this a dropped/recreated
-- signature (school_roster_upsert above) can 404 until the API restarts on
-- its own. Harmless if the listener isn't there.
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Extend the verify script**

In `scripts/verify-school-roster.mjs`, after the `fetchUnknown` check, add:

```js
const sportsUnknown = await rpc('school_roster_sports', { p_slug: 'no-such-school-nowhere' });
check('unknown school has no sports',
  sportsUnknown.status === 200 && Array.isArray(sportsUnknown.body) && sportsUnknown.body.length === 0,
  JSON.stringify(sportsUnknown));
```

And update the anon upsert probe (it must send the NEW signature, or the check would "pass" by hitting a missing function rather than the permission wall):

```js
const anonUpsert = await rpc('school_roster_upsert', {
  p_slug: 'x', p_sport: 'football', p_season: 2026, p_players: [], p_colors: null,
  p_theme: null, p_schedule: null, p_published: false, p_paid_through: '2027-02-01', p_note: '',
});
```

The script prints its own total, so no count needs editing.

- [ ] **Step 3: Note the ordering in `docs/going-live.md`**

Read the file first. Find where it describes the 0005 deploy ordering (push → deploy green → apply migration) and extend that section to name 0006 as the next migration following the same rule, with one added line: *after applying, run `node scripts/verify-school-roster.mjs` (now 7 checks) and re-apply 0006 a second time to prove apply-twice.* Match the surrounding prose style.

- [ ] **Step 4: Sanity-check the SQL by reading it against 0005**

No database is reachable from this environment — the file is applied by hand later. Verify by inspection, line by line against `supabase/migrations/0005_school_theme.sql`: both old and new upsert signatures dropped; every function in 0005's grant list re-granted here plus `school_roster_sports`; `begin`/`commit` wrapping; `notify` outside the transaction.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_all_sports.sql scripts/verify-school-roster.mjs docs/going-live.md
git commit -m "Migration 0006: a sports door for the hub, a schedule column for the sports the directory cannot feed"
```

---

### Task 4: Sport-aware fan store — `rosterStore.ts` + `store.ts`

**Files:**
- Modify: `src/oh/rosterStore.ts`
- Modify: `src/oh/store.ts`
- Test: `src/oh/rosterStore.test.ts`, `src/oh/store.test.ts`

**Interfaces:**
- Consumes: `ScheduleRow` from `./scheduleParse` (Task 2), `rpc`/`supaAvailable` from `./supa`, `chosenSlug` from `./store`.
- Produces (School.tsx in Task 6 calls these):
  - `cacheKey(slug: string, sport: string): string` → `oh.roster.<slug>.<sport>`
  - `loadSchoolRoster(slug: string, sport: string): Promise<SchoolRoster | null>` — `SchoolRoster` gains `schedule: ScheduleRow[] | null`.
  - `loadSchoolSports(slug: string): Promise<string[] | null>` — live sports; `[]` = known none; `null` = could not determine (no signal, no cache, or the function isn't deployed yet).
  - From `store.ts`: `chosenSport(slug: string): string | null`, `rememberSport(slug: string, sport: string | null): void`.

- [ ] **Step 1: Write the failing tests**

In `src/oh/rosterStore.test.ts`, update the cacheKey test and add new ones (keep every existing test; they should continue to pass with mechanical signature updates only — the existing `parseCached` cases are unchanged because `schedule` is optional):

```ts
it('keys the cache by school and sport', () => {
  expect(cacheKey('hubbard-hubbard', 'football')).toBe('oh.roster.hubbard-hubbard.football');
});

it('accepts only well-formed schedule rows, defaulting anything else to none', () => {
  const rows = [{ date: '2026-11-27', opponent: 'Boardman', home: true, time: '7:00 PM' }];
  const good = { season: 2026, players: [], colors: null, logo: null, schedule: rows };
  expect(parseCached(JSON.stringify(good))?.schedule).toEqual(rows);

  // One malformed row poisons the lot — half a schedule rendered as whole
  // is worse than the fixtures simply not showing.
  const half = { season: 2026, players: [], colors: null, logo: null,
    schedule: [{ date: '2026-11-27', opponent: 'Boardman', home: true }, { opponent: 'Fitch' }] };
  expect(parseCached(JSON.stringify(half))?.schedule).toBeNull();

  const notArray = { season: 2026, players: [], colors: null, logo: null, schedule: 'soon' };
  expect(parseCached(JSON.stringify(notArray))?.schedule).toBeNull();

  const missing = { season: 2026, players: [], colors: null, logo: null };
  expect(parseCached(JSON.stringify(missing))?.schedule).toBeNull();
});
```

And a `loadSchoolSports` describe block (mirror the file's existing `loadSchoolRoster` mock style — `mockedRpc` steered per test, `localStorage.clear()` in `beforeEach`):

```ts
describe('loadSchoolSports', () => {
  beforeEach(() => { localStorage.clear(); mockedRpc.mockReset(); });

  it('answers the live list and caches it for the chosen school', async () => {
    localStorage.setItem('oh.school', 'hubbard-hubbard');
    mockedRpc.mockResolvedValueOnce(['football', 'volleyball']);
    expect(await loadSchoolSports('hubbard-hubbard')).toEqual(['football', 'volleyball']);
    expect(JSON.parse(localStorage.getItem('oh.livesports.hubbard-hubbard')!)).toEqual(['football', 'volleyball']);
  });

  it('treats junk answers as unknown, not as an empty school', async () => {
    mockedRpc.mockResolvedValueOnce({ nope: true });
    expect(await loadSchoolSports('hubbard-hubbard')).toBeNull();
  });

  it('falls back to the kept copy without a signal', async () => {
    localStorage.setItem('oh.livesports.hubbard-hubbard', JSON.stringify(['basketball']));
    mockedRpc.mockRejectedValueOnce(new Error('no signal'));
    expect(await loadSchoolSports('hubbard-hubbard')).toEqual(['basketball']);
  });

  it('is unknown with no signal and no kept copy', async () => {
    mockedRpc.mockRejectedValueOnce(new Error('no signal'));
    expect(await loadSchoolSports('hubbard-hubbard')).toBeNull();
  });

  it('an empty answer is a real answer — no live sports', async () => {
    mockedRpc.mockResolvedValueOnce([]);
    expect(await loadSchoolSports('hubbard-hubbard')).toEqual([]);
  });
});
```

In `src/oh/store.test.ts` add (read the file's existing style first and match it):

```ts
it('a genuine school switch drops every jar the old school filled', () => {
  localStorage.setItem('oh.school', 'old-school');
  localStorage.setItem('oh.season.old-school', '{}');
  localStorage.setItem('oh.roster.old-school', '{}');            // pre-sport legacy key
  localStorage.setItem('oh.roster.old-school.football', '{}');
  localStorage.setItem('oh.roster.old-school.basketball', '{}');
  localStorage.setItem('oh.livesports.old-school', '[]');
  localStorage.setItem('oh.sport.old-school', 'basketball');
  choose('new-school');
  expect(localStorage.getItem('oh.roster.old-school')).toBeNull();
  expect(localStorage.getItem('oh.roster.old-school.football')).toBeNull();
  expect(localStorage.getItem('oh.roster.old-school.basketball')).toBeNull();
  expect(localStorage.getItem('oh.livesports.old-school')).toBeNull();
  expect(localStorage.getItem('oh.sport.old-school')).toBeNull();
});

it('remembers a sport per school and forgets it on request', () => {
  rememberSport('hubbard-hubbard', 'basketball');
  expect(chosenSport('hubbard-hubbard')).toBe('basketball');
  rememberSport('hubbard-hubbard', null);
  expect(chosenSport('hubbard-hubbard')).toBeNull();
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/oh/rosterStore.test.ts src/oh/store.test.ts`
Expected: FAIL — signatures and exports don't exist yet.

- [ ] **Step 3: Implement `rosterStore.ts` changes**

- `import type { ScheduleRow } from './scheduleParse';`
- `cacheKey = (slug: string, sport: string): string => `oh.roster.${slug}.${sport}``
- `SchoolRoster` gains `schedule: ScheduleRow[] | null`; `RawRosterBody` gains `schedule?: unknown`.
- Add the validator beside `validColors`/`validLogo`:

```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * All rows well-formed or no schedule at all — the colors rule. Half a
 * schedule rendered as if it were whole would misinform quietly, which is
 * worse than the tab simply not appearing.
 */
const validSchedule = (v: unknown): ScheduleRow[] | null => {
  if (!Array.isArray(v) || v.length === 0) return null;
  const rows: ScheduleRow[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) return null;
    const r = item as Record<string, unknown>;
    if (typeof r.date !== 'string' || !ISO_DATE.test(r.date)) return null;
    if (typeof r.opponent !== 'string' || !r.opponent.trim()) return null;
    if (typeof r.home !== 'boolean') return null;
    const row: ScheduleRow = { date: r.date, opponent: r.opponent, home: r.home };
    if (r.time !== undefined) {
      if (typeof r.time !== 'string') return null;
      row.time = r.time;
    }
    if (r.score !== undefined) {
      const s = r.score as Record<string, unknown>;
      if (typeof s !== 'object' || s === null) return null;
      if (typeof s.us !== 'number' || typeof s.them !== 'number'
          || !Number.isFinite(s.us) || !Number.isFinite(s.them)) return null;
      row.score = { us: s.us, them: s.them };
    }
    rows.push(row);
  }
  return rows;
};
```

- `parseCached` and the network-clean path both set `schedule: validSchedule(...)` (from `v.schedule` / `body.schedule`).
- `loadSchoolRoster(slug, sport)`: pass `p_sport: sport` to the rpc; every `cacheKey(slug)` becomes `cacheKey(slug, sport)`.
- Delete the unused `evictRosterCache` export (nothing calls it; `store.ts` owns eviction).
- Add:

```ts
const sportsKey = (slug: string): string => `oh.livesports.${slug}`;

/**
 * Which sports this school has live. [] is a real answer — no paid sports;
 * null means the question couldn't be asked (no signal and no kept copy, or
 * a deploy running ahead of migration 0006), and the caller falls back to
 * behaving as the football-only site it was.
 */
export async function loadSchoolSports(slug: string): Promise<string[] | null> {
  const kept = (): string[] | null => {
    try {
      const raw = localStorage.getItem(sportsKey(slug));
      const v = raw ? (JSON.parse(raw) as unknown) : null;
      return Array.isArray(v) && v.every((s) => typeof s === 'string') ? (v as string[]) : null;
    } catch {
      return null;
    }
  };

  if (!supaAvailable) return null;
  try {
    const body = await rpc<unknown>('school_roster_sports', { p_slug: slug });
    if (Array.isArray(body) && body.every((s) => typeof s === 'string')) {
      if (slug === chosenSlug()) {
        try {
          localStorage.setItem(sportsKey(slug), JSON.stringify(body));
        } catch {
          // A full jar must not fail the fetch that succeeded.
        }
      }
      return body as string[];
    }
    return null;
  } catch {
    return kept();
  }
}
```

- [ ] **Step 4: Implement `store.ts` changes**

Replace the two inlined removals in `choose()` with a prefix sweep, and add the sport memory:

```ts
const SPORT = (slug: string) => `oh.sport.${slug}`;

export const choose = (slug: string): void => {
  const prev = chosenSlug();
  if (prev && prev !== slug) {
    localStorage.removeItem(SEASON(prev));
    // Every jar the old school filled: its season above, the pre-sport
    // roster key, one roster per sport, the live-sports list, and the
    // remembered sport. Prefix sweep rather than a list of names, so a
    // future jar under the same prefix cannot be forgotten here. Keys
    // inlined rather than imported from rosterStore, which imports
    // chosenSlug from here.
    for (const key of Object.keys(localStorage)) {
      if (key === `oh.roster.${prev}` || key.startsWith(`oh.roster.${prev}.`)) {
        localStorage.removeItem(key);
      }
    }
    localStorage.removeItem(`oh.livesports.${prev}`);
    localStorage.removeItem(SPORT(prev));
  }
  localStorage.setItem(CHOSEN, slug);
};

/** The sport this reader last opened at this school, so a basketball
 * parent lands on basketball next time. */
export const chosenSport = (slug: string): string | null => localStorage.getItem(SPORT(slug));

export const rememberSport = (slug: string, sport: string | null): void => {
  if (sport) localStorage.setItem(SPORT(slug), sport);
  else localStorage.removeItem(SPORT(slug));
};
```

- [ ] **Step 5: Fix the one existing caller so the suite compiles**

`src/oh/School.tsx:58` calls `loadSchoolRoster(slug)`. Task 6 rebuilds this file; for now make the minimal edit `loadSchoolRoster(slug, 'football')` so `tsc` and the suite stay green between tasks.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/oh/rosterStore.test.ts src/oh/store.test.ts && npx tsc --noEmit`
Expected: PASS, clean tsc.

- [ ] **Step 7: Commit**

```bash
git add src/oh/rosterStore.ts src/oh/rosterStore.test.ts src/oh/store.ts src/oh/store.test.ts src/oh/School.tsx
git commit -m "Teach the fan store which sport it is asking about"
```

---

### Task 5: Panel — sport picker, schedule paste, `scheduleArg`

**Files:**
- Modify: `src/oh/manage/adminApi.ts`
- Modify: `src/oh/manage/Activate.tsx`
- Modify: `src/oh/manage/Manage.tsx` (one line: the row label)
- Test: `src/oh/manage/activate.test.ts`

**Interfaces:**
- Consumes: `parseSchedule`, `ScheduleRow` from `../scheduleParse` (Task 2).
- Produces:
  - `upsertRoster` row gains `schedule: ScheduleRow[] | [] | null` → sent as `p_schedule`.
  - `RosterRow` gains `has_schedule: boolean`.
  - Exported for pinning: `scheduleArg(rows: ScheduleRow[], cleared: boolean): ScheduleRow[] | [] | null`.

- [ ] **Step 1: Write the failing test**

In `src/oh/manage/activate.test.ts`, add (match the file's existing style — it already pins `themeArg` the same way):

```ts
import { scheduleArg } from './Activate';

describe('scheduleArg', () => {
  const row = { date: '2026-11-27', opponent: 'Boardman', home: true };

  it('a fresh paste sends the rows', () => {
    expect(scheduleArg([row], false)).toEqual([row]);
  });

  it('clearing sends the empty array, which the database reads as "wipe"', () => {
    expect(scheduleArg([], true)).toEqual([]);
  });

  it('neither sends null — keep whatever is stored, the renewal case', () => {
    expect(scheduleArg([], false)).toBeNull();
  });

  it('a paste wins over a stale clear flag', () => {
    expect(scheduleArg([row], true)).toEqual([row]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/oh/manage/activate.test.ts`
Expected: FAIL — `scheduleArg` is not exported.

- [ ] **Step 3: Implement `adminApi.ts`**

- `RosterRow` gains `has_schedule: boolean;` after `has_logo`.
- `upsertRoster`'s row type gains, after `theme`:

```ts
  /** null keeps the stored schedule (renewal case), [] clears it, rows set it. */
  schedule: ScheduleRow[] | [] | null;
```

with `import type { ScheduleRow } from '../scheduleParse';`, and the rpc body gains `p_schedule: row.schedule,` between `p_theme` and `p_published`.

- [ ] **Step 4: Implement `Activate.tsx`**

Mirror the logo's shape everywhere:

1. Export the contract next to `themeArg`:

```ts
/**
 * The schedule half of upsertRoster's contract, themeArg's twin: a fresh
 * paste sends the rows, a cleared schedule sends [] (wipe the stored one),
 * and neither sends null (keep whatever is stored — the renewal case).
 */
export function scheduleArg(rows: ScheduleRow[], cleared: boolean): ScheduleRow[] | [] | null {
  if (rows.length) return rows;
  if (cleared) return [];
  return null;
}
```

2. State: `const [sport, setSport] = useState(existing?.sport ?? 'football');`, `const [schedulePasted, setSchedulePasted] = useState('');`, `const [scheduleCleared, setScheduleCleared] = useState(false);`.

3. Sport picker, rendered right after the school is chosen (`{!existing && …}` — an existing row's sport is part of its identity and is not editable, exactly like its season):

```tsx
{!existing && (
  <label className="mg-field">
    Sport{' '}
    <select value={sport} onChange={(e) => setSport(e.target.value)}>
      {['football', 'volleyball', 'soccer', 'cross country', 'golf', 'tennis', 'cheer',
        'basketball', 'wrestling', 'swimming', 'hockey', 'bowling',
        'baseball', 'softball', 'track', 'lacrosse'].map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  </label>
)}
```

4. Derived schedule (the effective sport for an existing row is `existing.sport`):

```ts
const effectiveSport = existing?.sport ?? sport;
const schedParsed = useMemo(
  () => (effectiveSport !== 'football' && schedulePasted.trim()
    ? parseSchedule(schedulePasted, existing?.season ?? currentSeasonYear())
    : null),
  [effectiveSport, schedulePasted, existing],
);
```

5. Schedule paste UI, rendered after the roster review block, only when `effectiveSport !== 'football'` — a textarea (same `mg-paste` class, `rows={6}`, placeholder `existing?.has_schedule ? 'Paste to replace the schedule, or leave empty to keep it' : 'Paste the schedule rows here — date, opponent, time'`), a count line (`{schedParsed.rows.length} games read · N rows skipped` in the same `filter-line`/`mg-skip` pattern as the roster paste, listing each skipped row's `text — issue`), a `Has a schedule` sub-label when `existing?.has_schedule && !scheduleCleared && !schedParsed`, and a `Remove schedule` button (`fixture-row is-plain`, like `Remove logo`) shown when `Boolean(schedParsed?.rows.length) || (existing?.has_schedule && !scheduleCleared)`, whose click clears the paste and sets `scheduleCleared`.

6. `save()` passes `sport: effectiveSport` (replacing `existing?.sport ?? 'football'`) and `schedule: scheduleArg(schedParsed?.rows ?? [], scheduleCleared)`.

7. `currentSeasonYear`'s comment gains one sentence: every sport files under the school year that starts that fall, so July onward is the season year for winter and spring sports too — their January games belong to the season labelled with the previous autumn.

- [ ] **Step 5: The Manage row names its sport**

In `src/oh/manage/Manage.tsx:124`: `{r.school_slug} · {r.sport} · {r.season}`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/oh/manage/activate.test.ts && npx tsc --noEmit`
Expected: PASS, clean tsc.

- [ ] **Step 7: Commit**

```bash
git add src/oh/manage/adminApi.ts src/oh/manage/Activate.tsx src/oh/manage/Manage.tsx src/oh/manage/activate.test.ts
git commit -m "The panel activates any sport and carries its pasted schedule"
```

---

### Task 6: The hub — `School.tsx` + `oh.css`

**Files:**
- Modify: `src/oh/School.tsx`
- Modify: `src/oh/oh.css`

**Interfaces:**
- Consumes: `loadSchoolSports`, `loadSchoolRoster(slug, sport)` (Task 4); `chosenSport`, `rememberSport` (Task 4); `hubSports`, `sortSportsForNow`, `sportLabel`, `sportEmoji` (Task 1); `ScheduleRow` (Task 2).
- Produces: the shipped page. No new exports.

**Behavior contract (all of it — implement exactly this):**

1. On `slug` change, load season (as today) AND `loadSchoolSports(slug)` into `live: string[] | null` state, with a `sportsSettled` flag; the Loading screen holds until `season && sportsSettled` (the sports promise always settles — it never throws).
2. `const effectiveLive = live ?? (live === null ? [] : live)` — no: keep it explicit. `live === null` (unknown — offline first visit, or a deploy ahead of migration 0006) means **fall back to today's exact behavior**: treat the tile list as `['football']` and go straight to football.
3. `const tiles = sortSportsForNow(hubSports(live ?? []), new Date())`. When `live` is null, tiles is `['football']` by the fallback in (2).
4. Selected sport state `sport: string | null`. When `sportsSettled` flips true: if `tiles.length === 1` → that sport; else if `chosenSport(slug)` is in tiles → it; else `null` (the hub).
5. `sport === null` renders the hub: the plain-text school header (name, city, record — no crest; no roster is loaded on the hub, so the default look applies), then the tile grid, then the existing "Follow a different school" button and privacy line. Tiles:

```tsx
<div className="oh-sport-grid">
  {tiles.map((s) => (
    <button key={s} type="button"
      className={`oh-sport-tile${inSeason(s, new Date().getMonth() + 1) ? '' : ' is-off'}`}
      onClick={() => { rememberSport(slug, s); setSport(s); }}>
      <span className="oh-sport-emoji" aria-hidden="true">{sportEmoji(s)}</span>
      <span className="oh-sport-name">{sportLabel(s)}</span>
    </button>
  ))}
</div>
```

6. A non-null `sport` loads its roster in a `useEffect` over `[slug, sport, live]`: `if (sport && (live ?? []).includes(sport)) loadSchoolRoster(slug, sport).then(setRoster).catch(() => setRoster(null)); else setRoster(null);` — plus the same reset lines the current effect has. When `live` is null (fallback mode) football DOES fetch: the condition is `(live?.includes(sport) ?? sport === 'football')`.
7. The sport view is today's page with two additions and one substitution:
   - Above the tab bar, when `tiles.length >= 2`, a back row: `<button type="button" className="fixture-row is-plain oh-hub-back" onClick={() => { rememberSport(slug, null); setSport(null); }}><span className="fixture-team">‹ All sports</span></button>` — clearing the memory so leaving from the hub later doesn't warp back here.
   - `sport === 'football'`: exactly today's rendering — roster tabs when a roster is live (Schedule tab = the directory season, as now), the free page (ask-the-school card + season schedule) when not.
   - Any other sport with a live roster: the same tab bar, but the Schedule tab body renders `roster.schedule` rows instead of the directory season (see 8); the Lookup/Team tabs and the mailto footer are identical. If `roster.schedule` is null, the Schedule tab shows `<p className="empty-text">No schedule added yet for {sportLabel(sport)}.</p>`.
   - Any other sport whose roster fetch answered null (expired mid-session, cache miss offline): render the hub instead — never a dead sport page.
8. Pasted-schedule rendering — extract today's fixture-row markup into a tiny local component so the season list and the pasted list share it:

```tsx
const PastedSchedule = ({ rows }: { rows: ScheduleRow[] }) => {
  const played = rows.filter((r) => r.score).sort((a, b) => b.date.localeCompare(a.date));
  const coming = rows.filter((r) => !r.score).sort((a, b) => a.date.localeCompare(b.date));
  const stack = (date: string) => {
    const d = new Date(`${date}T12:00:00`);
    return {
      day: d.toLocaleDateString(undefined, { day: 'numeric' }),
      month: d.toLocaleDateString(undefined, { month: 'short' }),
    };
  };
  return (
    <>
      {coming.length > 0 && (
        <>
          <div className="group-head">Coming up</div>
          {coming.map((r) => {
            const { day, month } = stack(r.date);
            return (
              <div className="fixture" key={`${r.date}-${r.opponent}`}>
                <div className="fixture-row">
                  <span className="fixture-date"><span className="fixture-month">{month}</span>{day}</span>
                  <span className="fixture-team">
                    <span className="fixture-ha">{r.home ? 'vs' : 'at'}</span> {r.opponent}
                  </span>
                  <span className="fixture-result">{r.time ?? ''}</span>
                </div>
              </div>
            );
          })}
        </>
      )}
      {played.length > 0 && (
        <>
          <div className="group-head">Played</div>
          {played.map((r) => {
            const { day, month } = stack(r.date);
            const won = r.score!.us > r.score!.them;
            return (
              <div className="fixture is-played" key={`${r.date}-${r.opponent}`}>
                <div className="fixture-row">
                  <span className="fixture-date"><span className="fixture-month">{month}</span>{day}</span>
                  <span className="fixture-team">
                    <span className="fixture-ha">{r.home ? 'vs' : 'at'}</span> {r.opponent}
                  </span>
                  <span className="fixture-result">
                    <span className={`form-chip ${won ? 'won' : 'lost'}`}>{won ? 'W' : 'L'}</span>{' '}
                    {r.score!.us}–{r.score!.them}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
};
```

(A drawn game renders as L — ties are near-nonexistent in these sports and the chip has two states; note this in a comment.)

9. The look lifecycle (`applyLook`/`clearLook` over `[roster]`) is untouched — the hub has no roster, so it stays in the default look, and each sport themes itself when its roster lands.

- [ ] **Step 1: Implement** (no component-test infra exists in this repo — the pure logic this screen leans on was pinned in Tasks 1, 2 and 4; this file is verified by tsc, the suite, and eyes on the preview).

- [ ] **Step 2: Styles — append to `src/oh/oh.css`**

```css
/* The all-sports hub: one tile per sport with anything to show. Off-season
   tiles stay tappable — a January reader may well want the football result
   from November — they just stop shouting. */
.oh-sport-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 16px 0;
}
.oh-sport-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 8px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.oh-sport-tile.is-off { opacity: 0.55; }
.oh-sport-emoji { font-size: 28px; line-height: 1; }
.oh-sport-name { font-weight: 600; }
```

(Before writing, check `oh.css` for its variable names — if it uses different custom-property names than `--line`/`--surface`/`--text`, use the file's own.)

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite green (≈315+ tests), clean tsc.

Run: `npm run build`
Expected: build green, Poland guard passes ("untouched" check ok). If the guard fails with a data-fetch message, that is a scraper outage — re-run; never touch the baseline.

- [ ] **Step 4: Eyes on it**

Start the oh dev pass (check `package.json` for the script — the oh build is `vite.oh.config.ts`; if there's a `dev:oh` script use it, otherwise `npx vite --config vite.oh.config.ts`) and verify against a mocked or real school: the hub appears only with 2+ tiles, a single-sport school goes straight in, the back row returns to the hub, off-season tiles dim, and the pasted-schedule tab renders both groups. Screenshot for the record.

- [ ] **Step 5: Commit**

```bash
git add src/oh/School.tsx src/oh/oh.css
git commit -m "A school with more than one sport opens on a hub of them"
```

---

### Task 7: Docs, full verification, merge

**Files:**
- Modify: `CLAUDE.md` (Supabase section: upsert contract now players/theme/schedule; five `school_*` grants; `school_roster_sports` exists. "Where things stand": all-sports shipped pending 0006 apply; renumber open items.)
- Modify: `docs/selling.md` — read it first; add a short "more than one sport" note to the activation runbook (pick the sport in the form; paste the schedule for non-football sports; price left open).

- [ ] **Step 1: Update the docs above** — match each file's voice; keep diffs small.

- [ ] **Step 2: Full verification**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: all green, guard ok.

- [ ] **Step 3: Commit docs**

```bash
git add CLAUDE.md docs/selling.md
git commit -m "Write the all-sports contract into the working notes and the seller's runbook"
```

- [ ] **Step 4: Final whole-branch review** — dispatch a code-reviewer subagent over `git diff main...all-sports` with the spec and this plan; fix Criticals/Importants before merging (the review process has caught Criticals every round — don't skip it).

- [ ] **Step 5: Merge to main** (no push until the user says so, per repo convention — deploy ordering means push must precede the 0006 apply):

```bash
git checkout main
git merge --no-ff all-sports -m "Merge all-sports: the hub, the sports door, and pasted schedules"
```

- [ ] **Step 6: Hand back the go-live steps** — tell the user, in order: push (CI: test → build+guard → Pages) → wait for green → apply 0006 in the dashboard SQL editor → apply it a second time (apply-twice gate) → `node scripts/verify-school-roster.mjs` (7 checks) → optionally re-activate Strasburg with a second sport to see the hub live. Until 0006 is applied, fan pages behave exactly as today (the sports call fails closed to football-only) and the panel's saves are broken in the push→apply window — the known, documented window.

---

## Self-Review (performed at write time)

- **Spec coverage:** hub (Task 6), in-season ordering (1, 6), remembered sport + eviction (4, 6), schedule paste + parser (2, 5), migration 0006 with sports door/schedule column/contract/grants (3), fetch+cache sport-awareness (4), panel picker (5), verify script + apply-twice (3, 7), out-of-scope items untouched. One deliberate deviation (football tile always present) is declared up top and in the spec's terms.
- **Type consistency:** `ScheduleRow` defined once in `scheduleParse.ts`; `scheduleArg(rows, cleared)` matches `themeArg`'s shape; `p_schedule` sits 7th in both the SQL and the rpc body; `loadSchoolSports` returns `string[] | null` and Task 6 consumes exactly that.
- **Placeholders:** none — every step carries its code or an exact instruction naming file, line, and content.
