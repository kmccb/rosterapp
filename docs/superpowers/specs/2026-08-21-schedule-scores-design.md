# Real scores on the Schedule tab

**Date:** 2026-08-21

## The problem

The Schedule tab has never shown a score, and on current evidence never will.

It is built from Poland's ScheduleStar iCal feed, and `parseScore()` in
`src/schedule/icalParse.ts` was written on a guess — its own comment admits the feed
carried no results at the time, so it codes the two forms these calendars *usually* use
and hopes. Fetching the live feed on 2026-08-21 confirms the guess was wrong: the two
played scrimmages carry no score in any field, only a gear-discount advert and an NFHS
streaming link. `LAST-MODIFIED` shows the feed is maintained, so it is not stale.
ScheduleStar publishes fixtures, not results.

Three things follow, all visible to anyone opening the tab:

- Every fixture renders as unplayed. The `Fixture` component already draws a W/L chip and
  a score when `game.result` is set — it has simply never had data.
- The record line under the next-game card reads `0–0` all season.
- "Next up" cannot advance past a finished game, because `nextGame()` looks for the first
  game with no result.

Meanwhile the League tab, three tabs across, shows Poland's actual scores.

## What we already have

`league.json` is built from Poland's own joeeitel team page, and that page carries **every
game with its score** — conference and non-conference alike — plus the playoff flag and
the season record in its caption. Verified against the saved 2025 fixture: all twelve
games, `9-3`, including the two November playoff games.

`toLeagueGames()` already preserves `result` per game. Poland's ten 2026 fixtures are
present in the built file. Nothing new needs scraping.

## Design

### Matching — `src/schedule/mergeResults.ts`

A new pure module. One exported function takes the iCal `Game[]`, the league's
`LeagueGame[]` and our league-side team name, and returns games with `result` filled in.

Matching is on **opponent key, with date as the tiebreak** — not on date first. The two
sources can disagree about a date (a game moved to Saturday) but never about who played.
When one key appears twice in a season — Girard in 2025, week 8 and the regional semi —
the nearest date decides between them.

Both sides go through the existing `canonicalOpponent()` alias table, so joeeitel's
"Youngstown East" and the feed's spelling land on one key. This is the same table that
already stops fifteen Niles McKinley meetings going missing from the head-to-head.

Rules:

- Scrimmages are never matched. joeeitel does not carry them, and a scrimmage is not part
  of a record.
- A league game with no result contributes nothing.
- An iCal game whose key matches nothing is left result-less. Nothing is invented.
- An existing `result` from `parseScore()` wins, so if ScheduleStar ever does start
  publishing scores the school's own feed remains authoritative.

### Build wiring — `scripts/build-teams.mjs`

`writeSchedule()` and the league block are left exactly as they are. A new `applyResults()`
step runs *after* the league block: it reads the finished `schedule.json` and `league.json`
back off disk, merges, and rewrites `schedule.json`.

This is deliberate. The league block carries all-or-nothing fallback logic — republish the
previously deployed copy rather than blank a working playoff table — and reordering the
build to thread league data into `writeSchedule()` would put that at risk for no gain.
Reading the finished file also means a *republished stale* league copy still supplies
scores, which is the behaviour we want: last week's scores beat none.

A team with no league configured (YSU, Victory Christian) skips the step entirely and its
Schedule tab is unchanged.

### "Next up" advances on the clock

New predicate `isDone(game, now)` in `icalParse.ts`: true when the game has a result, **or**
when kickoff plus 3½ hours has passed. `nextGame()` becomes `games.find(g => !isDone(g))`.

This covers the gap between a game ending around 10pm Friday and the 2am rebuild that
fetches the score. Without it the card sits on a finished game for four hours on the one
night people are looking at it.

A game with a date but no kickoff time falls back to end-of-day, so it never advances
early.

The same predicate drives the list sectioning below, so the card and the list cannot
disagree about what has been played.

### Screen — `src/screens/Schedule.tsx`

`byMonth()` is replaced by two sections:

- **Coming up** — ascending, nearest first.
- **Played** — descending, most recent first.

The two games either side of today therefore end up adjacent, which is the pair anyone
opening the tab is usually after. Month headers go: they do not survive a reversed section,
and the coming-up/played split is the more useful one. Each fixture row consequently needs
its month back, since the header no longer supplies it.

The record moves onto the Next Up card as a prominent figure. It is computed from the
merged games — non-scrimmage results only — rather than read from `league.teams[].overall`,
so the Schedule tab stays self-contained for teams with no league configured. Both numbers
derive from the same joeeitel data, so they agree.

The existing small grey summary line stays.

## Testing

Pure functions, pinned against the real saved 2025 Poland page:

- Girard twice in one season resolves to the right game by date.
- An alias mismatch still matches.
- A fixture joeeitel does not carry is left result-less.
- Scrimmages are never given a result.
- A result already on the game is not overwritten.
- `isDone` is false three hours after kickoff and true four hours after.
- `isDone` on a date-only game does not fire early.
- Sectioning: upcoming ascending, played descending.

## Known risk

This makes the Schedule tab's scores depend on joeeitel — a hobby site, no API, shape can
change without warning. That dependency already exists for the League tab and is handled
the same way: every parser is pure and pinned to a saved copy of a real page, so a change
in shape fails a test here rather than emptying a screen on someone's phone.

`parseScore()` on the iCal feed is kept as a free fallback, and takes precedence, in case
ScheduleStar ever starts publishing results.
