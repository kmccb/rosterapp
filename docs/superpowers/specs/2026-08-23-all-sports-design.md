# All sports: the athletic-director sale

**Date:** 2026-08-23

## Why

The paid tier sells one sport to one coach. The next conversation up the ladder is the athletic
director saying "I want all our sports in your app" — one buyer, one invoice, the whole
department. The schema saw this coming: `school_roster` is keyed by school + sport + season and
`school_roster_fetch(slug, sport)` already takes the sport. The only places football is actually
hardcoded are the fan page's fetch (`rosterStore.ts`) and the Activate form's default. This spec
is the UI and the one migration that turn the existing key into a product.

This is Phase 3 of the original roadmap pulled forward — the rosters-and-schedules half. The
half that stays deferred is automated results for non-football sports, because no scrapeable
source exists (joeeitel is football; ScheduleStar's feed publishes fixtures, never results).

## What ships

### The hub — sport icons, but only when there is a choice

When a school has **two or more** live sports (published and paid), its page opens on a hub:
the school header (crest, name) over a grid of sport tiles, each a name plus an emoji badge.
Tapping a tile opens that sport's page — the v2 tab set (`Lookup | Team | Schedule`), themed
in the school's colors, exactly as football ships today.

- **One live sport goes straight in.** A hub with a single tile is an extra tap in front of the
  thing a parent came for. Today's single-sport schools see no change at all.
- **In-season sports come first.** Sport → months is static knowledge (football Aug–Nov,
  basketball Nov–Mar, …): a small pinned table in the oh bundle, not a data source. In-season
  tiles lead and print full-strength; off-season tiles follow, dimmed. In November the page
  reorders itself and nobody touches anything.
- **Only sports with live rosters appear.** The hub renders what `school_roster_sports`
  answers — there is no "coming soon" tile to disappoint anyone.
- The chosen sport is remembered per school in localStorage (`oh.sport.<slug>`), so a
  basketball parent lands on basketball next time. A genuine school switch drops it, same
  eviction rule as the season and roster caches.

Selection is component state inside School.tsx — the school itself is chosen in-page and never
appears in the URL, so the sport doesn't either. `?manage` and `?privacy` routing is untouched.

### The Schedule tab for sports the directory cannot feed

Football's Schedule tab reads the committed directory season (joeeitel fixtures and scores).
No such source exists for volleyball or basketball, so for other sports the schedule is
**concierge data, like the roster**: the seller pastes schedule rows in the panel, they store
in the database next to the players, and the fan page renders them with the same stacked
`AUG / 28` date treatment.

- A row is `{ date, opponent, home/away, time?, note? }`. Scores are a `score?` field the
  seller may fill in after the fact ("text me the score" is a concierge touch, not a pipeline)
  — absent means the row prints as a fixture.
- The paste parser follows the roster paste's pattern: TSV/spreadsheet columns, pure function,
  pinned to fixtures in tests before it meets a real paste.
- Football ignores this column entirely and keeps its richer directory-fed tab. No school
  edits football fixtures by hand while a working scrape exists.
- ScheduleStar iCal automation (the uuid-per-team feed Poland uses) is the named next unlock:
  when schools hand over uuids through the concierge channel, a workflow can replace the
  pasted rows. The paste ships first because it needs nothing from anybody.

### Migration 0006

Following 0005's precedent exactly — new file, `begin/commit`, errcode'd raises in sentence
voice, `notify pgrst, 'reload schema'` at the end:

- `school_roster_sports(p_slug text)` — the one new public function: the list of sports for
  which this school has a **published and paid** roster (same gate as fetch, Eastern
  `paid_through` rule included). Returns sport names only — no seasons, no counts — so the
  hub learns what to draw and nothing else. Granted to anon.
- `alter table school_roster add column schedule jsonb` — the pasted rows, or null.
- `school_roster_check_schedule(jsonb)` — array of row objects, each field type-checked,
  a sane ceiling on length (a season is ~30 games, the ceiling is 100), errcode'd raises.
- `school_roster_upsert` gains `p_schedule jsonb` with the renewal contract players and theme
  already follow: **null keeps what is stored, `'[]'::jsonb` clears, an array sets.**
  Signature changes, so drop BOTH old and new signatures first — apply-twice must succeed.
- `school_roster_fetch` returns `schedule` alongside players, colors, and theme, under the
  same published-and-paid gate.
- Grants: schema-wide revoke, then re-grant **every** live function by exact signature — the
  four `roster_*`, the previous four `school_*` (fetch, upsert with its new signature, delete,
  list), and the new `school_roster_sports`. Five `school_*` grants after this migration.
- Deploy ordering applies (signature change): push → deploy green → apply migration. The
  panel's saves break in the window; fan pages never do.

### Panel changes

- The Activate form's sport field becomes a real picker (football, volleyball, soccer,
  basketball, baseball, softball, …) instead of a defaulted constant. Sport stays free text
  in the database — the picker is a convenience, not an enum migration.
- A schedule paste box appears for non-football sports, with the same parse-preview-save
  rhythm as the roster paste.
- The Manage list already keys rows by school + sport + season and needs no structural change;
  a school with four sports lists four rows.

### Fan page changes

- `loadSchoolRoster(slug)` becomes `loadSchoolRoster(slug, sport)`; the cache key gains the
  sport (`oh.roster.<slug>.<sport>`), and the eviction-on-switch rule carries over.
- School.tsx asks `school_roster_sports` once per visit (cached with the same network-first,
  kept-copy fallback as everything else), then renders hub or single sport.
- The sport's roster drives the tabs exactly as v2 built them — Lookup keypad, Team squad,
  Schedule — with the pasted schedule substituting for the directory season on non-football
  sports.

## Contracts

```ts
// rosterStore.ts
export type ScheduleRow = {
  date: string;            // ISO date
  opponent: string;
  home: boolean;
  time?: string;           // "7:00 PM" — absent prints nothing
  score?: { us: number; them: number };
  note?: string;           // "Senior night", "@ neutral site"
};
export function loadSchoolRoster(slug: string, sport: string): Promise<SchoolRoster | null>;
export function loadSchoolSports(slug: string): Promise<string[]>;  // live sports only

// sportSeasons.ts — pinned static table
export function inSeason(sport: string, month: number): boolean;
export function sortSportsForNow(sports: string[], now: Date): string[];
```

`SchoolRoster` gains `schedule: ScheduleRow[] | null`, validated like players and logo:
anything shape-wrong reads as null, never a half-parsed row handed to a screen.

`upsertRoster` (adminApi) gains `schedule: ScheduleRow[] | [] | null` — null keep, `[]` clear,
array set. Same contract prose as theme.

## Testing

- Hub logic pure and pinned: 0 sports → today's no-roster page, 1 → straight in, 2+ → hub;
  in-season ordering across month boundaries (a November fixture list puts basketball first).
- Schedule paste parser pinned to saved fixtures, including the awkward real-world pastes.
- Renewal contract extended to `p_schedule`: null keeps stored rows (SQL trace + live check).
- `school_roster_sports` answers only published-and-paid sports — three-row live check
  (unpublished, expired, live), same pattern as fetch's.
- Apply-twice on 0006 clean; `verify-school-roster.mjs` re-run (it may need the fifth grant
  added to its expectations).
- All existing tests stay green env-free; supa mocked, never env or fetch stubs.
- The Poland guard green on every build, as always.

## Out of scope

- **Automated results for non-football sports** — no source exists; the pasted `score?` field
  is the honest v1.
- **ScheduleStar iCal automation** — the named next unlock, blocked on uuids from schools.
- **Region/League tabs for any sport** — still waits on the school→team-id mapping.
- **Hudl stats and game-day weather on paid pages** — separate features (discussed 2026-08-23),
  each layers onto this per-sport structure later without rework.
- **Pricing** — the all-sports number is a selling.md decision, not a schema one. The panel
  charges nothing either way; `paid_through` is per row, so per-sport and per-school pricing
  are both expressible with what ships here.
