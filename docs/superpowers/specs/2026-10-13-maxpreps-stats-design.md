# Season stats from MaxPreps, on a paid school's football page

**Date:** 2026-10-13

## Why

Springfield's athletic director called, interested, and said his coaches keep stats on
MaxPreps. The paid page had no stats at all — the September Stats tab is Poland's, in the root
app, fed by a Hudl paste — and the seller does not want to paste anything after each game.

## What ships

- **A Stats tab** on a paid football page, `Lookup · Team · Schedule · Stats · League`, shown
  only when the school has a stats file and at least one name in it is on the roster. Segments
  `Leaders · Offense · Defense · Special`, the same ranking and wording as Poland's
  (`src/stats/leaders.ts`, `statsFormat.ts`), on a screen of its own (`src/oh/StatsTab.tsx`)
  because nothing under `src/oh/` may import `src/screens`.
- **Season lines on a Lookup hit.** Type 4 and #4's card says what he has done this season.
  Not on the Team tab, which is a list to scan.
- **A feed nobody tends.** `scripts/maxpreps.mjs` reads each configured team's printable stats
  page and writes `public/oh/stats/<slug>-<sport>.json`; a workflow runs it four mornings a week
  and commits when the numbers moved. The push is the deploy.
- **A roster CSV** from the same source (`--roster`, by hand), in the shape the panel's CSV
  import reads back exactly.

## The data

The print page is sixteen tables; ten are read. Cells carry a class naming their stat, so
columns are found by class and tables by the id of the heading above them. Rows come out as
`ParsedStatRow` — one per player per category, in the Hudl parser's field names — with the
player's full name from the link's `title`. Defense is three tables merged by the matcher;
returns are one table split in two; return touchdowns come from the scoring table. A row whose
counting stats are all zero is dropped, and defense drops zero fields so a linebacker's line
does not read "0 INT".

The file holds rows, not a table keyed by player. The page matches them to whatever roster it
has with `matchTeamStats`: the whole name when exactly one player has it, else the jersey when
that player's surname is in the printed name, never the jersey alone. Poland's matcher goes by
surname and initial because that is all Hudl prints; here it would hand one brother the other's
season. Two roster players sharing a surname and initial get nothing, since the shared leader
tables key on exactly that.

## Failing closed

- Parser: reports a problem when the rushing or tackles table is missing or empty.
- Script: only slugs in `paid-schools.json` are fetched, and a team off that list has its file
  removed — a static file has no `paid_through`, so that list is the gate.
- Script: a failed fetch, a parser problem, a category that was published and is now missing,
  or fewer than half the published rows keeps the
  committed file and exits non-zero. The commit step still runs, so one team's failure does not
  hold back another's. GitHub's failed-workflow email is the alert.
- Page: the file is validated row by row; a missing or unreadable file means no tab.
- `updated` changes only when the rows do, and is printed under the tab with the source.

Nothing here touches Supabase, the root app, `src/styles.css` or the guarded pages.
`public/oh/**` is already outside the precache.

## What is not committed

The repo is public. The roster CSV goes to `scripts/data/`, which is ignored. The fixtures have
athlete ids, profile links and timestamps blanked, and the eleven athletes the coach had removed
from the roster carry invented names.

## What it leans on

MaxPreps' robots.txt disallows `/print`, and its terms of use were not read. The footprint is
one request per team per run, four runs a week, for schools that asked. The unblocked stats
page carries only the top three per category, which is not enough for Offense/Defense/Special.
If MaxPreps blocks the job, the same parser can sit behind a paste box in the panel.

## Not in this round

- Week by week per game (MaxPreps has it per game; a second parser).
- Any sport but football. The file name and the store take a sport; the parser does not.
- Stats on the demo. `/oh/demo/` is being moved to an invented school on the `marketing-site`
  branch; Springfield's real roster and stats belong on Springfield's own page, which needs an
  activation in the panel.
- The game-day sponsor band (its own spec).
