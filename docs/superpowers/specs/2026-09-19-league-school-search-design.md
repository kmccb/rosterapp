# Schools on the League tab: look up any Ohio school's season

**Date:** 2026-09-19

## Why

Somebody at a Poland game wants to know how next week's opponent has been doing, or how the
team their cousin plays for got on. The League tab answers that for the Northeast 8 and the
playoff region and for nobody else. The directory at `/oh/` answers it for all 716 schools, but
it is a different page in a browser tab, not the app on the home screen.

The directory's data is already published beside the app: an index of every school and a small
season file per school, refreshed twice a week. The root app can read those files. It has never
had a reason to until now.

## What ships

A third segment on the League tab, `Northeast 8 · Region · Schools`. Schools is a search box.
Two letters in, it lists matching schools; tap one and the school's season appears in the League
tab's own week-row style. Tap an opponent in that list and you are looking at that school
instead. It needs a signal and says so when there isn't one.

Poland only. The League tab exists only for a team whose build produced a league table, and that
is Poland. YSU and Victory Christian share the bundle and see nothing new.

## The Schools view

**Search.** A search box in the roster's existing search styling, placeholder "School or town".
Nothing is listed until two characters have been typed. Matching is case-insensitive against the
school's name and its city. Results are ordered: name starts with the query, then city starts
with the query, then either contains it; ties alphabetical by name; at most fifteen shown. Each
match reads `Poland Seminary · Poland`.

**A school's season.** Tapping a match replaces the list with:

- A `‹ Back` control that returns to the search, query still typed.
- A header line, `Poland Seminary · Poland · 3–2`. The record is `won–lost` from the file's
  `record`; a school with nothing played shows `0–0`.
- One row per game, in schedule order, using the League tab's `lg-game` and `lg-score` classes:
  `Wk 3 · Fri Sep 4 · vs Struthers · W 28–14`. Away games say `at` rather than `vs`. An unplayed
  game shows its kickoff time (`7pm`) where the score would be, or nothing if the file has no
  kickoff. Scores print with an en dash.
- The opponent's name is a button. Tapping it loads that school's season in place. The Back
  control still returns to the search, not to the previous school; a stack is a filing system
  nobody asked for.

**Remembering your place.** The chosen school and the query live in the League screen's state,
not the Schools component's, so switching to Region and back shows the same school. Nothing is
written to storage; a relaunch starts empty.

## Data

Two published files, fetched with a plain `fetch` and the browser's normal caching. The League
tab's `cache: 'no-store'` exists because scores land on a Friday night; the directory changes on
Wednesday and Saturday mornings, and stale-by-a-day is fine.

- `/oh/index.json` — `{ year, fetched, schools: [{ slug, name, city }], games }`. 52 KB.
  Fetched once, the first time the Schools view is opened, and held in memory for the session.
  Only `schools` is read.
- `/oh/data/<slug>.json` — a `SchoolSeason`: `{ school, games, record }`, about 2 KB. Fetched
  when a school is chosen. Each game carries `opponentSlug`, which is what the opponent tap
  uses; no name-to-slug lookup anywhere.

Both paths are absolute, not under the team's `base`: the directory lives at the site root and
the root app is served from `/`. The types come from `src/ohio/stateModel.ts`, which the root
app may share — the rule is that nothing under `src/oh/` imports the root app's runtime, and
this crosses in the other direction through a pure module.

## Offline

`/oh/` is kept out of the phone's precache on purpose, so away from a signal:

- The index fetch fails: the search box is replaced by "Looking up a school needs a signal." No
  retry button; leaving the Schools view and coming back tries again.
- A school fetch fails after a successful search: the same sentence where the games would be,
  with Back still working and the search still usable.
- A school with no games in its file: "No games listed for this school yet."

## Code

Three units.

**`src/league/schools.ts`** — pure, fully tested, no React.

- `searchSchools(schools: School[], query: string): School[]` — the ranking above. Returns
  `[]` for fewer than two non-space characters.
- `describeGame(game: SchoolGame): { week, date, opponent, result }` — `week` is `Wk 3`;
  `date` is `Fri Sep 4`, computed from the ISO date as a plain calendar day (no time zone
  arithmetic — the date string is the Eastern date already); `opponent` is `vs Struthers` or
  `at Struthers`; `result` is `W 28–14`, `L 14–28`, `T 14–14`, the kickoff string, or `''`.
- `recordOf(season: SchoolSeason): string` — `3–2`.

Tests pin the ranking (prefix beats contains, city matches, the two-character gate, the cap,
whitespace and case) and the row (home win, away loss, tie, unplayed with and without a kickoff)
against rows taken from Poland's real directory file, saved as a fixture under
`src/league/fixtures/`.

**`src/screens/Schools.tsx`** — the view. Owns the two fetches, the three failure states, and
the list-or-season rendering. Props: `query`, `slug`, and setters for both, lifted from League.
Imports only `../league/schools`, the types from `../ohio/stateModel`, and React.

**`src/screens/League.tsx`** — the view type gains `'schools'`, the segmented control gains
the button, `view === 'schools'` renders `<Schools … />`, and two `useState` lines hold the
lifted query and slug. Nothing else in League changes.

No stylesheet edit. Every element uses a class the root app already has: `search`, `row`,
`group-head`, `lg-game`, `lg-score`, `empty-text`, `seg`, `control-bar`.

## Shipping

This is a deliberate root-app change and follows the procedure in CLAUDE.md:

1. Branch `league-school-search` off main; per-task review as usual.
2. `npm run build` on the finished branch fails the guard on the three page hashes and on
   nothing else — check the message, don't assume it.
3. Fetch the live root page, normalise both it and `dist/index.html` the guard's way, and diff:
   the only line allowed to differ is the `<script src="/assets/index-*.js">` tag. Precache
   stays at 32.
4. Recompute the nine hashes with the guard's own `normalise` and `withoutTeams`, write them to
   `scripts/untouched-baseline.json`, and re-run `node scripts/check-untouched.mjs` green.
5. The baseline change lands in the same commit as the feature, so no commit on main fails its
   own build.
6. After the Cloudflare build is green: on a phone with a signal, open League → Schools, find a
   school, open it, tap an opponent. Then airplane mode, leave and re-enter Schools, and read
   the "needs a signal" sentence.

## Not in this

- Offline search. Names without games is half a feature; see the Data section.
- A history stack behind Back.
- Any school's roster, stats, or crest. Those are the paid tier's.
- The same search on the paid `/oh/` page.
