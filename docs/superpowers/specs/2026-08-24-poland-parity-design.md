# Poland parity: the paid page as the real app

**Date:** 2026-08-24

## Why

The demo school and Poland were opened side by side, and the paid page loses the comparison in
five specific ways. Each is a real gap, not a matter of taste — the pitch is "the app people at a
Poland game asked how to get," so the paid page has to *be* that app, not resemble it.

Measured against the live demo (`strasburg-franklin-strasburg`, three sports), the gaps and their
causes:

1. **No crest behind the page.** It works on football and nowhere else. The look is stored per
   `(school, sport, season)` row, so a school that buys three sports has to upload its crest three
   times — and **the hub, the first screen anyone sees, is not themed at all**: it renders in the
   default navy with `--wallpaper: none` (set by `oh/index.html` so the directory can't wear
   Poland's badge). A school's identity should belong to the school, not to one row.
2. **The keypad floats mid-page.** Poland's shell is a fixed-height flex column — `.app` holds a
   pinned header, a scrolling body, and `.keypad { flex: none }` at the bottom. `/oh/` renders the
   whole school page inside a single scrolling `.screen`, so the keypad lands wherever the content
   above it ends (measured: y=329 of a 899px page). The keys belong under the thumb.
3. **The Team tab has no filters.** Poland narrows by side of the ball and position over a pinned
   control bar. `/oh/`'s Team tab is a flat list.
4. **The Schedule tab has no forecast.** Poland prints the kickoff sky, temperature, and the rain
   or wind worth mentioning.
5. **No League tab.** Poland has one; the paid page has never had one.

## What ships

### 1. The look belongs to the school

The crest and colors move up a level: fetched once per school, applied on the hub, and inherited
by every sport that hasn't got its own.

- `school_roster_sports` grows from "which sports" into "what this school looks like": it returns
  `{ sports: [...], colors, theme }`, taking the colors and crest from the school's rows —
  **preferring football, then the most recently updated row that has them**, so the seller keeps
  uploading a crest exactly once and every sport wears it.
- `School.tsx` applies that look as soon as it arrives, before any roster — so the hub is dressed,
  and a sport page inherits it rather than flashing navy while its roster loads.
- A sport row with its own colors still wins for that sport (a school whose volleyball program
  runs different colors stays possible), but nothing has to be re-entered to look right.

The panel gains nothing new here: uploading the crest on any row is enough.

### 2. The school page gets Poland's shell

The paid school page (hub and sport views alike) renders inside the root app's shell shape rather
than one long `.screen`:

- a pinned header carrying the crest, school name, record, and the tab bar,
- a scrolling body,
- the keypad pinned to the bottom on Lookup, exactly as `.lookup`/`.keypad` already do it.

This is a JSX restructure plus rules in `src/oh/oh.css` — **not** an edit to `src/styles.css`,
whose hash the Poland guard holds. The classes themselves (`.app`, `.lookup`, `.keypad`,
`.header`) are already in the shared stylesheet and already correct; what `/oh/` lacks is a
container that makes them mean anything.

### 3. Team filters, from the module Poland already uses

`src/roster/filters.ts` is pure — it imports only `../parse/rosterParse` and `../types` — so
`/oh/` may use it under the isolation rule, no duplication needed. The Team tab gains Poland's
control bar: search, an All/Offense/Defense/Special segment, position chips, and the count line
that says what is applied.

Both guards Poland's own bar uses carry over unchanged and matter more here: `areas` is empty and
`positions.length <= 1` for a volleyball roster, which has no positions in it — so the bar
degrades to a plain search box for non-football sports without a special case.

Rows stay `/oh/`'s own `Row`, not `PlayerRow`: there is no card to open on a fan page, and a
permanently disabled button reads as "unavailable" on every row to a screen reader. That decision
stands from v2.

### 4. Weather, without announcing the reader to anybody

Poland's forecast is fetched **at build time** — deliberately, so it happens once per build
rather than once per spectator and "nobody has to announce themselves to a weather service"
(`scripts/build-teams.mjs`). A client-side Open-Meteo call from the fan page would be far simpler
and would quietly break that stance, on the one page in this repo that has a privacy page
promising nothing follows the reader. So the forecast is fetched server-side and committed, like
every other piece of directory data:

- **Coordinates:** the statewide data has none. A one-time script geocodes each school's city to a
  centroid and commits `public/oh/geo.json`. A town centroid is not the stadium, which is the
  right accuracy for temperature and rain and costs nothing to keep for all 717 schools.
- **Forecast:** `refresh.yml` (already every 6 hours, already fetching Poland's) gains a pass over
  the paid schools, writing one small `public/oh/weather.json`. The paid list comes from a
  committed `paid-schools.json` the seller appends on a sale — one line in the runbook, in a
  workflow that is already concierge.
- **Render:** the next fixture on the Schedule tab carries the same `Forecast` treatment Poland
  uses. `src/schedule/weather.ts` (`describeSky`, `worthMentioning`, the `Weather` type) is pure
  and shared; `SkyIcon` is checked for purity and shared or duplicated on the same rule as
  `look.ts`.

Absent weather prints nothing at all — a schedule with no forecast is exactly today's screen.

### 5. A League tab that needs no scraping

CLAUDE.md files this as blocked, and for Poland's mechanism it is: `standings()` reads scraped
joeeitel **team pages**, and a team-page id per member school is the ~90-capture mapping the
directory build deferred.

**The directory makes the mechanism unnecessary.** Every one of the 717 committed school JSONs
already carries that school's full schedule with `opponentSlug` and `result` on every game. Given
a list of member slugs, a conference table is a pure function over data already on disk — no
scrape, no ids, no new pipeline, and it stays correct on its own because the directory refreshes
twice a week.

The one input with no statewide source is **membership**, and that is a concierge question the
seller can ask once: "what conference are you in?" So:

- Migration adds a `league jsonb` column: `{ "name": "Inter-Valley Conference", "members": [slug, …] }`,
  null for a school that hasn't given one. Same renewal contract as its neighbours: **null keeps,
  `'{}'` clears, an object sets**.
- The panel gains a conference section: a name field and a member picker that searches the
  directory index exactly as the school picker already does, so members are stored as slugs and
  can never drift from a typo.
- The fan page shows a **League** tab only when a member list exists. It loads each member's
  committed season JSON, counts games between members, and prints the standings table plus the
  week-by-week fixtures — Poland's League tab, computed from the directory instead of scraped.
- Football only in v1. Other sports would need their schedules, which are concierge-pasted and
  carry no opponent slugs.

## Contracts

```ts
// rosterStore.ts — the sports call answers with the school's identity, not just a list
export type SchoolIdentity = {
  sports: string[];
  colors: SchoolColors;          // null when no row carries any
  logo: string | null;           // validated exactly as the roster's is
};
export function loadSchoolSports(slug: string): Promise<SchoolIdentity | null>;

// league/table.ts (new, pure)
export type LeagueRow = { slug: string; name: string; league: string; overall: string };
export function leagueTable(seasons: SchoolSeason[], members: string[]): LeagueRow[];
```

`SchoolRoster` gains `league: { name: string; members: string[] } | null`, validated like the
schedule: any malformed member list reads as no league rather than a half-built table.

## Testing

- The identity fetch pinned: football's colors preferred, most-recent fallback, junk to null; the
  cached copy keeps working across the shape change (an older cache is an array, not an object).
- Shell layout verified in a real preview at 375px: the keypad's bottom edge sits within the
  safe-area inset of the viewport bottom, on the hub, on Lookup, and with a 22-player roster.
- Filters: reuse of Poland's pure module means Poland's own tests already cover the logic; what is
  pinned here is the degradation — a roster with no positions offers no segment and no chips.
- `leagueTable` pinned against committed fixtures: a member that played every other member, a
  member with a game against a non-member (excluded from the league record, kept in overall), a
  member whose season JSON is missing (dropped, table still renders).
- Weather: the geocode script's output shape; the refresh pass writing only paid schools; the
  fan page printing nothing when the file has no entry for this school.
- Migration 0007 applies twice cleanly, re-grants every live function by exact signature, and
  keeps the deploy ordering (push → green → apply).
- The Poland guard green on every build, as always.

## Out of scope

- **Player cards on the fan page** — the row is a dead end by design (v2's reasoning stands).
- **Stats on paid pages** — discussed 2026-08-23, still its own feature; the Hudl paste pipeline
  is untouched here.
- **Region standings** — the 28 region tables still want the team-id mapping. Conference
  standings above do not, which is the whole point.
- **Non-football league tables**, and **weather for non-football sports** (pasted schedules carry
  no opponent slugs and often no reliable time).
- **Deriving colors from the crest's pixels** — the seller picks two, as in v2.
