# Poland Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five gaps between a paid school's `/oh/` page and Poland's app — pinned keypad, Team filters, school-wide crest and colors (hub included), kickoff weather, and a League tab.

**Architecture:** Two tasks are pure client work and land first (shell, filters). One migration (0007) then carries both remaining data needs — the sports call grows into a school-identity call, and a `league` column arrives — after which the look applies school-wide and a League tab computes standings from committed directory data. Weather is a server-side pass into committed JSON, matching Poland's build-time posture.

**Tech Stack:** React + TypeScript (Vite), Vitest, Supabase via plain-fetch RPC (`src/oh/supa.ts`), plpgsql migrations applied by hand, GitHub Actions for refresh.

**Spec:** `docs/superpowers/specs/2026-08-24-poland-parity-design.md` — read it once before Task 1.

## Global Constraints

- **Never edit `src/styles.css`** — its hash is baked into the guarded Poland pages, and the guard fails the build. Every new rule goes in `src/oh/oh.css`. Reusing existing shared classes is expected and correct; adding to the shared file is not.
- **Nothing under `src/oh/` imports the root app's runtime** — no `src/share`, `src/screens`, `src/theme`, `src/App.tsx`. Pure modules are fine: `src/types`, `src/parse/*`, `src/components/Keypad`, `src/ohio/*`, and (verified pure for this plan) `src/roster/filters.ts` and `src/schedule/weather.ts`. **Verify purity by reading the module's imports before importing it** — a module that reaches into `src/theme` is off limits however useful.
- **Tests must pass env-free**: mock `./supa` with `vi.mock`; never stub env vars or global fetch for supa-dependent code. Follow `src/oh/rosterStore.test.ts`'s existing pattern, including its `localStorage` stub notes.
- **`npm run build` must stay green** — it ends with `scripts/check-untouched.mjs`. Never fix a guard failure by editing `scripts/untouched-baseline.json`. A failure whose message names a data fetch is a scraper outage: re-run once.
- **Migration conventions**: new numbered file `0007_*.sql`; `begin/commit`; errcode'd raises in sentence voice; schema-wide `revoke execute on all functions` then re-grant **every** live function by exact signature; signature changes drop **both** old and new signatures first (apply-twice must succeed); end with `notify pgrst, 'reload schema'` outside the transaction. Mirror `supabase/migrations/0006_all_sports.sql` exactly. **The file is written here and applied by hand later — never applied from this repo.**
- **`jsonb_typeof(v->'key')` is NULL for an absent key, and a NULL `IF` in plpgsql does not raise.** Wrap every such test in `coalesce(..., 'missing')`, as 0006 does. This exact bug was caught in review last round.
- Commit messages: plain sentences saying why, in the repo's voice. Comments: prose explaining why. Typographic apostrophes (’) in user-facing copy.
- Verify with `npx vitest run` (baseline 326 tests / 22 files green) and `npx tsc --noEmit` (clean).

## File Structure

- Modify: `src/oh/School.tsx` — the shell (Task 1), the school-level look (Task 4), the League tab (Task 5), the forecast (Task 6).
- Modify: `src/oh/oh.css` — shell rules (Task 1), filter-bar and league tweaks as needed.
- Modify: `src/oh/RosterTabs.tsx` — Team filters (Task 2).
- Create: `supabase/migrations/0007_school_identity_and_league.sql` (Task 3).
- Modify: `src/oh/rosterStore.ts` + test — identity shape, league validation (Task 3).
- Modify: `src/oh/manage/Activate.tsx`, `adminApi.ts` — conference picker (Task 5).
- Create: `src/oh/leagueTable.ts` + test — pure standings from directory seasons (Task 5).
- Create: `scripts/geocode-schools.mjs`, `public/oh/geo.json`, `paid-schools.json`; modify `.github/workflows/refresh.yml`, `scripts/build-teams.mjs` (Task 6).

---

### Task 0: Branch

- [ ] **Step 1: Branch from a clean main and commit the spec + plan**

```bash
git checkout -b poland-parity
git add docs/superpowers/specs/2026-08-24-poland-parity-design.md docs/superpowers/plans/2026-08-24-poland-parity.md
git commit -m "Spec and plan for closing the gap to Poland's app"
```

---

### Task 1: The shell — a pinned header and a keypad under the thumb

**Files:**
- Modify: `src/oh/School.tsx`
- Modify: `src/oh/oh.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. A structural change other tasks build inside.

**The problem, measured:** `/oh/` renders the whole school page as one `<div className="screen">` in normal flow, so `.screen`'s `flex: 1` means nothing and `.keypad`'s `flex: none` means nothing — the keypad lands after the query readout, mid-page (y=329 of an 899px page). Poland's shell is `.app` (flex column, `height: 100%`) → `.header` (`flex: none`) → `.screen`/`.lookup` (`flex: 1`, `min-height: 0`, scrolls) → `.keypad` (`flex: none`). Read `src/screens/Lookup.tsx` for the `.lookup` > `.results` + `<Keypad>` arrangement.

**What to build:** wrap the school page (hub and sport views alike) in that same shape.

- The outer element becomes `.app`-shaped. **Do not reuse `.app` itself if it forces layout on the directory** — check whether `Directory.tsx` shares the container; if it does, give the school page its own `oh-app` class in `oh.css` duplicating `.app`'s three declarations, and say why in a comment.
- The school head (crest, name, record) and the tab bar move into a pinned header region that does not scroll.
- The body scrolls: `flex: 1; min-height: 0; overflow-y: auto`.
- On the Lookup tab, the body is the query readout plus hits (scrolling) and `<Keypad>` sits **outside** the scrolling region, pinned to the bottom — mirroring `.lookup` > `.results` + `.keypad`.
- The hub, Team, and Schedule tabs keep a plain scrolling body with no keypad.
- `#root { height: 100% }` and `html, body { height: 100% }` already exist in the shared stylesheet; confirm the oh entry (`oh/index.html`) mounts into `#root` so the height chain is unbroken. If it does not, fix it in `oh/index.html`, not in `src/styles.css`.

- [ ] **Step 1: Read the three references before editing**

`src/screens/Lookup.tsx` (the arrangement), `src/styles.css` lines ~120-200 and ~526-545 (`.app`, `.header`, `.screen`, `.lookup`, `.keypad` — read only, never edit), and the current `src/oh/School.tsx`.

- [ ] **Step 2: Restructure `School.tsx` and add the rules to `oh.css`**

Keep every behavior the file has today: the sport state machine, the `current` cancellation guard, the look lifecycle, the hub, the back row, the football-vs-pasted schedule split, the footer rows. This is a container change, not a rewrite of the logic.

- [ ] **Step 3: Verify in a real preview, at a phone size**

```bash
npm run build
```

Then serve `dist` and open `/oh/`, follow the demo school, and check with the browser tools at 375×812:
- the keypad's bottom edge is within `env(safe-area-inset-bottom)` of the viewport bottom on the Lookup tab, with the 22-player football roster loaded and with an empty query;
- the header (crest, name, tabs) stays put while the Team tab's 22 rows scroll under it;
- the hub's tiles scroll if they overflow and no keypad appears;
- nothing scrolls the body horizontally.

Record the measured `keypad.getBoundingClientRect().bottom` versus `window.innerHeight` in the report.

- [ ] **Step 4: Full verification**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: 326 green, tsc clean, guard green.

- [ ] **Step 5: Commit**

```bash
git add src/oh/School.tsx src/oh/oh.css
git commit -m "Give the school page the app's own shell, so the keys sit under the thumb"
```

---

### Task 2: Team filters, from the module Poland already uses

**Files:**
- Modify: `src/oh/RosterTabs.tsx`
- Modify: `src/oh/oh.css` (only if a rule is genuinely missing)
- Test: `src/oh/rosterTabs.test.ts` (create)

**Interfaces:**
- Consumes: `inArea`, `positionsForArea`, `positionsOf`, `sidesOf` from `../roster/filters` (**verified pure**: it imports only `../parse/rosterParse` and `../types`).
- Produces: `TeamTab` keeps its signature `({ players }: { players: Player[] })`.

**What to build:** Poland's control bar, over `/oh/`'s own rows. Read `src/screens/RosterList.tsx` first — it is the reference implementation, and its classes (`.control-bar`, `.control-row`, `.input.search`, `.pos-pill`, `.seg`, `.pos-chips`, `.chip`, `.filter-line`, `.filter-clear`, `.group-head`, `.rows.rows-dense`) all already exist in the shared stylesheet.

Port from it: the search box, the All/Offense/Defense/Special segment, the position pill and chips, the `summarise` count line with Clear, and `byDecade` grouping. **Do not port:** `PlayerCard`/`PlayerRow` (fan rows are dead ends — keep `/oh/`'s existing `Row`, per the comment at the top of `RosterTabs.tsx`), the `selected` state, and the `ResizeObserver`/`--bar-h` sticky-header machinery (that measures Poland's pinned bar against Poland's decade headers; only add it if Task 1's shell makes it necessary, and say so).

The degradation is the point: `areas` is empty and `positions.length <= 1` for a volleyball or basketball roster, whose players carry no position at all — Poland's own guards (`areas.length > 0`, `positions.length > 1`) already handle that, so the bar becomes a bare search box with no special case.

- [ ] **Step 1: Write the failing tests**

Create `src/oh/rosterTabs.test.ts`. These pin the degradation and the wiring — the filter logic itself is already covered by `src/roster/filters.test.ts`, so do not restate it:

```ts
import { describe, expect, it } from 'vitest';
import { positionsForArea, sidesOf } from '../roster/filters';
import type { Player } from '../types';

const player = (over: Partial<Player>): Player => ({
  id: over.number ?? 'x', number: '1', firstName: 'A', lastName: 'B',
  position: '', side: '', heightIn: undefined, weightLb: undefined, grade: '',
  ...over,
} as Player);

describe('what the Team tab can offer a roster', () => {
  it('offers nothing to a roster with no positions — a volleyball squad', () => {
    const squad = [player({ number: '2' }), player({ number: '4' })];
    expect(positionsForArea(squad, null)).toEqual([]);
    expect(squad.every((p) => sidesOf(p).length === 0)).toBe(true);
  });

  it('offers both sides to a two-way football player', () => {
    const wrcb = player({ number: '9', position: 'WR/CB' });
    expect(sidesOf(wrcb).sort()).toEqual(['D', 'O']);
    expect(positionsForArea([wrcb], 'O')).toEqual(['WR']);
    expect(positionsForArea([wrcb], 'D')).toEqual(['CB']);
  });
});
```

Check `src/types.ts` for `Player`'s real field names before writing this — fix the literal to match, keep the assertions.

- [ ] **Step 2: Run to see them fail (or pass trivially), then build the bar**

Run: `npx vitest run src/oh/rosterTabs.test.ts`

- [ ] **Step 3: Verify in the preview**

With the demo school's football roster: the segment offers only sides the roster uses; picking Defense narrows the chips to defensive positions; Clear restores 22 players; switching to volleyball shows a search box and no segment. Screenshot the football Team tab filtered to Offense.

- [ ] **Step 4: Full verification and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run build
git add src/oh/RosterTabs.tsx src/oh/rosterTabs.test.ts src/oh/oh.css
git commit -m "Narrow the Team tab the way Poland's does, from the same module"
```

---

### Task 3: Migration 0007 + the identity fetch

**Files:**
- Create: `supabase/migrations/0007_school_identity_and_league.sql`
- Modify: `src/oh/rosterStore.ts`, `src/oh/rosterStore.test.ts`
- Modify: `src/oh/School.tsx` (call-site shape only — the look move is Task 4)
- Modify: `scripts/verify-school-roster.mjs`

**Interfaces:**
- Produces, for Tasks 4 and 5:

```ts
export type SchoolIdentity = { sports: string[]; colors: SchoolColors; logo: string | null };
export function loadSchoolSports(slug: string): Promise<SchoolIdentity | null>;
export function keptSchoolSports(slug: string): SchoolIdentity | null;
```

`SchoolRoster` gains `league: { name: string; members: string[] } | null`.

- [ ] **Step 1: Write the migration**

Mirror `0006_all_sports.sql` in structure and voice. It must:

1. `alter table public.school_roster add column if not exists league jsonb;` with a `comment on column` explaining it is the conference the school told us, `{"name": …, "members": [slug, …]}`, null when they haven't.
2. `create or replace function public.school_roster_check_league(jsonb)` — null returns; must be an object; `name` a string; `members` an array of strings, at most 40, each non-empty; total `pg_column_size` under 20000. **Every `jsonb_typeof(v->'key')` test wrapped in `coalesce(…, 'missing')`** — an absent key must raise, not slip through a NULL `IF`.
3. **Replace `school_roster_sports(text)`**: drop and recreate (its return shape changes from array to object, so the body changes; the signature does not, but drop-and-recreate anyway as 0005 did for `fetch`). It returns
   ```
   jsonb_build_object('sports', <array of sports>, 'colors', <colors>, 'theme', <theme>)
   ```
   over the same published-and-paid gate. `sports` is `coalesce(jsonb_agg(distinct sport), '[]')` as today. `colors` and `theme` come from **one** row chosen by: rows with a non-null value first, football before other sports, then most recently updated — so a school that uploaded its crest on any row gets it back here. Never return a row that fails the published-and-paid gate.
4. `school_roster_fetch` — drop and recreate, adding `'league', r.league` to the built object.
5. `school_roster_upsert` — drop **both** the 10-param signature and the new 11-param one, then create with `p_league jsonb` as the **8th** parameter, between `p_schedule` and `p_published`. Contract: **null keeps stored, `'{}'::jsonb` clears, an object sets** — the theme's contract, not the schedule's. Call `school_roster_check_league(p_league)` beside the other checks, and mirror the `case` in both the `update` and the `insert`.
6. `school_roster_list` — `create or replace`, adding `'has_league', league is not null`.
7. Grants: schema-wide revoke, then re-grant **every** live function by exact signature — the four `roster_*`, and the five `school_*` (`fetch`, `sports`, `upsert` at its **new 11-param** signature, `delete`, `list`). Count them against 0006's list before finishing; a miss silently kills a live feature.

- [ ] **Step 2: Verify the migration by inspection, twice**

No database is reachable here. Read the finished file top to bottom against `0006_all_sports.sql`: every `create` either `or replace` or preceded by its `drop`; `add column if not exists`; both upsert signatures dropped; `begin`/`commit` present; `notify` outside the transaction; grant list complete. Then read it a second time as if it were the second run of the same file, and confirm nothing errors. Record both passes in the report.

- [ ] **Step 3: Update the verify script**

In `scripts/verify-school-roster.mjs`: the `sportsUnknown` check must now expect an **object** for an unknown school — `body.sports` an empty array, `body.colors` null — not a bare empty array. Keep the check name honest. Add `p_league: null` to the anon-upsert probe so it sends the new 11-param signature (otherwise it passes for the wrong reason: a 404, not the permission wall). Confirm with `node --check scripts/verify-school-roster.mjs`.

- [ ] **Step 4: Reshape `loadSchoolSports` and the cache**

In `rosterStore.ts`:
- `loadSchoolSports` returns `SchoolIdentity | null`. Validate: `sports` an array of strings (else the whole answer is `null`), `colors` through the existing `validColors`, `logo` through the existing `validLogo` applied to `theme?.logo`. A junk answer stays `null`, as today.
- `keptSchoolSports` and the cache under `oh.livesports.<slug>` now hold the identity object. **An older cache entry is a bare array** — read it as `{ sports: <array>, colors: null, logo: null }` rather than discarding it, so a returning reader is not sent back to the network. Pin that in a test.
- Add `league` to `SchoolRoster`, validated beside `schedule`: an object with a string `name` and an array of non-empty string `members`, else `null`. One malformed member poisons the lot, exactly as the schedule rule does.
- `upsertRoster` in `adminApi.ts` gains `league: { name: string; members: string[] } | Record<string, never> | null` sent as `p_league` in the **8th** position; `RosterRow` gains `has_league: boolean`.

- [ ] **Step 5: Tests**

Extend `rosterStore.test.ts`, following its existing mock and `localStorage`-stub patterns:
- identity: a good answer returns sports + colors + logo; a junk answer returns null; an empty sports array is a real answer; a network failure falls back to the kept copy;
- **the legacy cache**: `localStorage` holding `["football","volleyball"]` reads back as `{ sports: ['football','volleyball'], colors: null, logo: null }`;
- league validation: a good league round-trips; a members array containing a non-string reads as null; a missing `name` reads as null; absent reads as null.

Update `School.tsx`'s call sites for the new shape — a mechanical change; the look move is Task 4. Keep `sportsSettled` and the fast-settle behavior exactly as they are.

- [ ] **Step 6: Full verification and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run build
git add supabase/migrations/0007_school_identity_and_league.sql src/oh/rosterStore.ts src/oh/rosterStore.test.ts src/oh/manage/adminApi.ts src/oh/School.tsx scripts/verify-school-roster.mjs
git commit -m "Ask the school who it is, not just which sports it plays"
```

---

### Task 4: The school's look, everywhere

**Files:**
- Modify: `src/oh/School.tsx`

**Interfaces:**
- Consumes: `SchoolIdentity` from Task 3.

**What to build:** the crest and colors apply as soon as the identity arrives — before any roster — so the hub is dressed and a sport page inherits rather than flashing navy.

- The look effect keys on the identity's colors/logo, with the **current sport's own roster colors taking precedence when it has them** (a sport row with its own colors still wins for that sport).
- The hub renders in the school's look, crest included — today it is default navy with `--wallpaper: none` from `oh/index.html`.
- `clearLook` still runs on unmount and on a genuine school switch; the directory and unpaid schools must stay in the default look. Verify by following a different school and confirming `--bg` returns to `#04043a`.
- The hub's header shows the crest beside the name (the `oh-school-head-row` treatment) when there is one.

Keep the `current` cancellation guard and the identity-identity-stability fix (`setLive` keeping the previous array when contents match) intact — both were review findings last round.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify in the preview**

Follow the demo school: the hub carries the red ground and the crest watermark; tapping Volleyball keeps them (volleyball has no crest of its own); "Follow a different school" and picking an unpaid school returns to navy with no wallpaper. Screenshot the hub.

- [ ] **Step 3: Full verification and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run build
git add src/oh/School.tsx
git commit -m "Dress the whole school page, hub included, in the school's own colors"
```

---

### Task 5: The League tab, computed from the directory

**Files:**
- Create: `src/oh/leagueTable.ts`, `src/oh/leagueTable.test.ts`
- Modify: `src/oh/School.tsx`, `src/oh/manage/Activate.tsx`, `src/oh/oh.css`

**Interfaces:**

```ts
// src/oh/leagueTable.ts — pure
import type { SchoolSeason } from '../ohio/stateModel';
export type LeagueRow = {
  slug: string; name: string;
  leagueWon: number; leagueLost: number;
  overallWon: number; overallLost: number;
};
export function leagueTable(seasons: SchoolSeason[], members: string[]): LeagueRow[];
```

**The mechanism:** every committed school JSON (`public/oh/data/<slug>.json`, loaded by `loadSeason`) carries that school's full schedule with `opponentSlug` and `result` on each played game. A conference table is therefore a pure fold over the member schools' seasons — no scraping, no team ids. Read `src/ohio/stateModel.ts` for `SchoolSeason`/`SchoolGame` before writing.

Rules to implement and pin:
- League record counts only games whose `opponentSlug` is also a member; overall counts every played game.
- Sort by league win percentage, then overall win percentage, then name. A member with no league games sorts last but still appears.
- A member whose season JSON is missing or failed to load is dropped from the table entirely — the rest still renders.
- Ties (`result.won === false` with equal scores cannot occur in this data; treat `won` as authoritative).

- [ ] **Step 1: Write the failing tests**

`src/oh/leagueTable.test.ts`, with hand-built `SchoolSeason` fixtures (do not fetch): three members where A beat B and C, B beat C; a non-member win that lifts overall but not league; a member with a missing season; the sort order across a tie on league record.

- [ ] **Step 2: Run to fail, implement, run to pass**

- [ ] **Step 3: The panel's conference section**

In `Activate.tsx`, a section that appears **for football rows only** (v1 scope): a conference name input, and a member picker that reuses the school search already in this file (`searchSchools` over `loadIndex`) so members are stored as slugs. Show the chosen members as removable rows. Send it through the contract helper — mirror `themeArg`/`scheduleArg` exactly and export it for pinning:

```ts
export function leagueArg(
  name: string, members: string[], cleared: boolean,
): { name: string; members: string[] } | Record<string, never> | null;
```

`name.trim() && members.length` → the object; `cleared` → `{}`; else `null`. Pin those three cases plus "a filled form wins over a stale clear flag" in `activate.test.ts`.

- [ ] **Step 4: The fan tab**

In `School.tsx`, a **League** tab appears in the tab bar only when `sport === 'football'` and the roster carries a league with members. Its body loads each member's season via the existing `loadSeason` (network-first with its kept copy, so it works at a ground), builds the table, and renders standings — school name, league record, overall — with the school's own row marked. Use existing shared classes (`.rows`, `.row`, `.group-head`, `.filter-line`); add rules to `oh.css` only if genuinely missing. While the member seasons load, show the existing `Loading…` treatment; if fewer than two members resolve, show `<p className="empty-text">Not enough of the conference has reported yet.</p>` rather than a one-row table.

- [ ] **Step 5: Verify in the preview and commit**

Set a conference on the demo school from the panel (pick real Inter-Valley Conference members from the directory search — if membership cannot be confirmed, choose the school's own scheduled opponents and note in the report that the demo's conference is illustrative). Confirm the tab appears, the table computes, and volleyball shows no League tab.

```bash
npx vitest run && npx tsc --noEmit && npm run build
git add src/oh/leagueTable.ts src/oh/leagueTable.test.ts src/oh/School.tsx src/oh/manage/Activate.tsx src/oh/manage/activate.test.ts src/oh/oh.css
git commit -m "Stand up a conference table from the directory we already have"
```

---

### Task 6: Weather at kickoff, fetched once

**Files:**
- Create: `scripts/geocode-schools.mjs`, `public/oh/geo.json`, `paid-schools.json`
- Modify: `.github/workflows/refresh.yml`, `src/oh/School.tsx`
- Create: `scripts/lib/paid-weather.mjs` (or fold into an existing lib — read `scripts/build-teams.mjs` first)

**Interfaces:**
- Consumes: `describeSky`, `worthMentioning`, `Weather` from `src/schedule/weather.ts` (**verify purity first** — read its imports; if it reaches into the root app's runtime, duplicate the two functions in `src/oh/` with a comment citing `look.ts`'s precedent). Same check for `src/components/SkyIcon`.

**Why server-side:** `scripts/build-teams.mjs`'s `forecastFor` says it plainly — the forecast is fetched at build time so it happens once per build rather than once per spectator, and nobody has to announce themselves to a weather service. `/oh/` is the one surface here with a privacy page. Do not fetch Open-Meteo from the browser.

- [ ] **Step 1: Geocode once**

`scripts/geocode-schools.mjs` reads `public/oh/index.json`, resolves each school's `city` to a lat/lon via Open-Meteo's geocoding API (no key, be polite — serial with a small delay, cache as you go), and writes `public/oh/geo.json` as `{ "<slug>": { "lat": n, "lon": n } }`. A city that cannot be resolved is omitted, and the script prints how many. Run it once, commit the output, and note the miss count in the report. **A town centroid is the intended accuracy** — say so in the file header.

- [ ] **Step 2: The refresh pass**

`paid-schools.json` at the repo root: `{ "slugs": ["strasburg-franklin-strasburg"] }`, with a comment-free JSON body and its purpose documented in `docs/selling.md` (the seller appends a slug on a sale). The refresh pass reads it plus `geo.json` plus each school's committed season, finds the next unplayed fixture, fetches the hourly forecast nearest that kickoff exactly as `forecastFor` does (reuse its logic — read it and share it rather than re-deriving the hour-matching), and writes `public/oh/weather.json` as `{ "<slug>": { code, tempF, precipChance, windMph, day, date } }`. A school with no coordinates, no upcoming fixture, or a failed fetch is simply absent. Wire it into `.github/workflows/refresh.yml` beside the existing Poland pass, and make it fail soft — a weather outage must never fail the deploy.

- [ ] **Step 3: Render it**

On the football Schedule tab, the next upcoming fixture carries the forecast, in Poland's treatment: sky icon, temperature, and only the rain or wind worth mentioning (`worthMentioning`, and wind at 12 mph or more). Read `src/screens/Schedule.tsx`'s `Forecast` component as the reference. Load `public/oh/weather.json` network-first with the same kept-copy fallback the season uses. **No weather for this school prints nothing at all** — the schedule is exactly today's screen.

- [ ] **Step 4: Verify and commit**

Run the geocode script and the weather pass locally, confirm `weather.json` has an entry for the demo school, and check the Schedule tab shows a forecast on the next fixture and nothing on the rest.

```bash
npx vitest run && npx tsc --noEmit && npm run build
git add scripts/geocode-schools.mjs scripts/lib/ public/oh/geo.json public/oh/weather.json paid-schools.json .github/workflows/refresh.yml src/oh/School.tsx docs/selling.md
git commit -m "Carry the kickoff forecast to paid pages, fetched once and committed"
```

---

### Task 7: Docs, verification, merge

- [ ] **Step 1: Update the docs**

- `CLAUDE.md` — Supabase section: `school_roster_sports` now answers identity; the `league` column and its keep/clear/set contract; upsert is 11 params; grants still five `school_*`. "Where things stand": Poland parity shipped pending 0007; **correct the Phase 3 line that calls conference standings blocked** — conference tables now come from committed directory data; only Region standings still want the team-id mapping. Note `paid-schools.json` as the weather list.
- `docs/going-live.md` — a v4 section: the 0007 deploy ordering (push → green → apply → apply twice → `node scripts/verify-school-roster.mjs`).
- `docs/selling.md` — the conference question to ask at activation, and appending the slug to `paid-schools.json` so the school's weather starts flowing.

- [ ] **Step 2: Full verification**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit, final whole-branch review, merge**

Dispatch a whole-branch review over `git diff main...poland-parity` with the spec and this plan; fix Criticals and Importants; then merge with `--no-ff`. Do not push — the deploy ordering makes pushing the user's go-live step.

---

## Self-Review (performed at write time)

- **Spec coverage:** wallpaper/school-wide look (Tasks 3+4), keypad shell (1), Team filters (2), weather (6), League (5), migration and contracts (3), docs (7). Every spec section maps to a task.
- **Type consistency:** `SchoolIdentity` defined in Task 3 and consumed in 4; `leagueArg` mirrors `themeArg`/`scheduleArg`; `p_league` is the 8th parameter in both the SQL and the rpc body; `LeagueRow` defined once in Task 5.
- **Ordering:** the two purely-visual tasks land before the migration, so a stall on 0007 still leaves the keypad and filters shipped.
- **Known trap flagged:** the `jsonb_typeof` NULL bug is called out in Global Constraints, having been a Critical last round.
