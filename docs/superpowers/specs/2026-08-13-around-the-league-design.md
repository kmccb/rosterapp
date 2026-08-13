# Around the League

A fourth tab for Poland, showing what the rest of the Northeast 8 did on Friday
night and where Poland sits in its playoff region.

Status: approved 2026-08-13. Poland only.

## The problem

The Schedule tab answers "who do we play next". It cannot answer "how did
everyone else do", because the calendar feed it is built from carries one
school's games and nothing else. A conference has seven schools and a playoff
region has thirty; a supporter checking the tab on a Friday night wants both.

## Scope

In: Poland Seminary, the root team.

Out: Youngstown State and Victory Christian. Neither gets the tab and neither
has its build path touched. The tab is gated on a config key exactly as
`schedule` and `seasons` already are, so the gate is the existing mechanism
rather than a new one.

Out: history. The tab shows the current season only. Poland's own back
catalogue already lives in `history.json` and is served by the head-to-head
panel on the Schedule tab.

## Where the data comes from

Ohio high school football has no public API. ESPN returns 400 for high-school
football, ScheduleStar's feeds are keyed by an opaque per-school uuid with no
directory to discover them, and MaxPreps and SI both forbid automated
collection. The one workable source is `joeeitel.com`, an Ohio-only site
carrying every team's schedule, scores, record, division and region, plus
per-region Harbin playoff points.

Two page shapes, both verified 2026-08-13:

    team    https://joeeitel.com/hsfoot/teams.jsp?teamID={id}&year={year}
    region  https://joeeitel.com/hsfoot/rankings/{year}/region-{n}

A team page header carries the team's own division and region:

    2026 Poland Seminary Football (0-0) | Coach: Tom Pavlansky | Division IV, Region 13

and its schedule rows carry each opponent's record and division:region:

    Date | H/A | Opponent          | Div.     | Result | Score
    8/21 | H   | Salem      (0-0)  | [III:9]  |        |
    9/18 | H   | Hubbard    (0-0)  | [IV:13]  |        |
    10/9 | H   | Girard     (0-0)  | [V:17]   |        |

`robots.txt` returns 404, so nothing is disallowed. The fetch runs once a night
on the refresh job that already exists, identifies itself in the User-Agent as
the existing ESPN and calendar fetches do, and costs about eight requests.

### The risk, stated plainly

This is one person's hobby site with no API and no published terms. It is well
structured and current, but it can change shape or disappear, and this feature
depends on it entirely. Two mitigations, both below: parsing is pure and tested
against saved fixtures so a shape change fails a test rather than shipping a
blank tab, and a failed fetch keeps the previous file rather than emptying it.

## What the screen shows

A tab labelled `League`, fourth after Lookup, Team and Schedule. At 375px four
tabs are about 93px each and the longest existing label, "Schedule", measures
about 62px, so nothing needs to shrink.

One screen, two segments, using the `.seg` control already shared by Team and
Stats:

    ┌──────────────────────────────────────┐
    │   Northeast 8   │      Region        │
    └──────────────────────────────────────┘
     WEEK 4 · SEPTEMBER 18

     Poland          42   final
     Hubbard         14

     Lakeview         —   7:00 PM
     Niles McKinley   —

     STANDINGS              LEAGUE   ALL
     1  Girard               3–0     4–0
     2  Poland               2–1     3–1

**Northeast 8** — the league's games grouped by week, newest first, with the
standings underneath. Poland's own row is picked out.

**Region** — the Harbin points table for whichever region Poland is in, ranked,
with Poland picked out. This is the "division" half of the request.

### Membership, and why it is not a list in a file

The Northeast 8 is Girard, Hubbard, Lakeview, Niles McKinley, Poland Seminary,
South Range and Struthers. Salem joins in 2027.

Poland plays all six of the others every season, so their team IDs are links on
Poland's own page. Resolving them by name from that page means the roster of
teams maintains itself, and the alternative — seven IDs hand-copied into a
config file — goes stale the first season somebody reorganises. `team.json`
carries the names to look for and an optional ID override for the season a
fixture does not happen.

### Division is read, never hardcoded

Poland was Division V, Region 17 in 2025 and is Division IV, Region 13 in 2026.
South Range moved V to VI over the same winter, and Salem IV to III. Divisions
are reassigned on enrollment every two years and regions shuffle with them. The
region page to fetch is therefore derived from Poland's own team-page header
each build, not stored.

## Data model

The build writes one file, `public/league.json`, served network-first with a
precache fallback exactly as `schedule.json` and `seasons.json` already are:

```jsonc
{
  "conference": "Northeast 8",
  "division": "IV",          // Poland's, this season
  "region": 13,
  "teams": [                 // the seven, Poland included
    { "name": "Poland Seminary", "id": 1264, "overall": "3-1", "leagueRecord": "2-1" }
  ],
  "games": [                 // every league team's games, deduplicated
    {
      "date": "2026-09-18",
      "home": "Poland Seminary",
      "away": "Hubbard",
      "result": { "home": 42, "away": 14 },   // absent until played
      "isLeagueGame": true                     // both sides in the conference
    }
  ],
  "region_table": [
    { "rank": 1, "name": "Girard", "record": "4-0", "points": 12.5 }
  ],
  "fetched": "2026-09-19T04:00:00.000Z"
}
```

A league game appears on two teams' pages, so `games` is deduplicated on
`date` plus the two school names.

## Components

| File | Responsibility |
| --- | --- |
| `src/league/leagueParse.ts` | Pure: HTML string in, typed rows out. No fetching. |
| `src/league/leagueParse.test.ts` | Fixtures saved from real pages, asserting the shapes above. |
| `scripts/lib/ohio.mjs` | Fetching and orchestration; calls the parser. |
| `src/screens/League.tsx` | The screen and its two segments. |
| `scripts/build-teams.mjs` | One call, writing `league.json`, mirroring the schedule step. |
| `src/App.tsx` | The tab, gated on `bakedTeam()?.league`. |

Splitting parse from fetch is the point: the fragile half is a pure function
over a string, so it can be tested exhaustively without the network, and the
network half has no logic worth testing.

## Error handling

- **Fetch fails.** Keep the existing `league.json` and warn in the build log,
  the same rule the schedule and roster steps already follow: stale is worth
  more than empty.
- **A page parses to nothing.** Treat as a failed fetch. A structure change
  that yields zero rows must not overwrite a good file with an empty one.
- **Poland's region cannot be read.** Write the conference half and omit
  `region_table`; the Region segment says the playoff table is unavailable
  rather than rendering an empty list.
- **The file is missing at runtime.** The screen shows the same "not for this
  team yet" empty state the other screens use.

## Testing

- Parser unit tests against saved fixtures: a team page mid-season with scores,
  a team page pre-season with none, and a region page. These are the tests that
  catch the source changing shape.
- A test that the week grouping puts a Thursday and a Saturday game in the same
  football week.
- A test that deduplication collapses one game appearing on both teams' pages.
- A test that league record counts only conference opponents.

## Not doing

- Other conferences or a team picker. Poland only, per the request.
- Historical seasons in this tab.
- Standings tie-breakers. Ohio uses Harbin points for seeding and the region
  table already carries them, so the conference table sorts on record alone and
  does not pretend to break ties.
