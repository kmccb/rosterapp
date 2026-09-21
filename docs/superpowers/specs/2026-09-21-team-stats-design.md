# The Stats tab: leaders, sides, and a player's week by week

**Date:** 2026-09-21

## Why

The Hudl numbers pasted into the app show on one player's card and nowhere else. A parent wants
to know who leads the team, a coach wants the offense on one screen, and everybody wants to know
what a kid did *last Friday*, not only what he has done since August. Hudl has all three
answers, behind a login, on a laptop. The app should have them on the phone, offline.

Hudl's Game Stats page has a per-game breakdown that copies out the same way the season page
does. That is the week-by-week source; the app sums it into the season.

## What ships

- **Pasting a game.** Setup → Stats → This season gains a **One game** choice beside **Whole
  season**: opponent, date, paste. Games are kept separately, replaced by date, removable.
- **A Stats tab** on Poland's app, `Lookup · Team · Schedule · Stats · League`, shown when This
  season has any games or a whole-season paste. Segments: **Leaders · Offense · Defense ·
  Special**. Tapping a player opens their week-by-week with a Season line.
- **Totals are computed** from the games when games exist, so the tab, the card and the Season
  line can never disagree.
- The share code carries the games; fans get the same tab.

Last season stays whole-season only. The player card keeps its two-column block and gains a
"Week by week" link.

## Pasting a game

On Setup → Stats, under **This season** only, a second chip pair: **Whole season** (today's
flow, unchanged) and **One game**. One game shows:

- **Opponent** — a text box, e.g. `Salem`. Printed as typed.
- **Date** — a date box. Home or away is not asked and not derived.
- **The paste** — from Hudl's Game Stats page, with the game selected, select from the
  "Offense" heading down through "Special Teams" and copy. Both teams come along; the app keeps
  Poland's tables (Hudl prints ours first in every section, home or away — verified on both)
  and drops the opponent's.

Read shows the same match report as the season paste: matched count, names that fit nobody,
names that fit more than one. Save files the game under This season keyed by date; pasting the
same date again replaces that game. A game with a date but no rows is refused with "Couldn’t
find a game’s tables in that."

Below the box, the games already in, oldest first: `Aug 21 · Salem · 14 players`, each with a
Remove that acts at once (no confirm — it is one paste to put back).

Pasting a whole season while games exist saves it as today. It is then used only if all games
are removed.

## The Stats tab

Shown when `stats.current` has at least one game or a non-empty `byPlayer`. A pinned control
bar with a four-way segment: `Leaders · Offense · Defense · Special`.

**Leaders.** One block per category that has anyone in it, in the card's order: Passing,
Rushing, Receiving, Defense, Kicking, Punting, Kick returns, Punt returns. A block lists the top
three on the category's headline field: passing `yds`, rushing `yds`, receiving `yds`, defense
`tackles`, kicking `pts`, punting `ydsPerPunt`, both returns `yds`. Ties share a place, so a
block may show more than three. A row: `#5 Chase Jones` on the left, the category's summary
parts on the right (`481 yds · 4 TD · 73 car`), the same parts the card prints. A player with
no headline value in a category is not in that block.

**Offense, Defense, Special.** Players with any stat in that side's categories this season, by
jersey number (numeric, then name). Offense = passing, rushing, receiving. Defense = defense.
Special = kicking, punting, kickReturn, puntReturn. A row: number and name, then one line per
category the player has on that side, label and parts. A two-way player appears on two lists.
Roster players without stats on that side do not appear.

**A player's weeks.** Tapping a row anywhere opens the player's page in place of the segment
content, control bar still pinned: `‹ Back`, then the player's number and name as a group head,
then one block per game the player has a stat in, oldest first, headed `Sep 4 · Field`, with one
line per category (`Rushing · 12 car · 89 yds · 1 TD`). Last, a **Season** block with the totals,
same lines. Back returns to the segment you came from. If This season has no games (whole-season
paste only), the page shows only the Season block.

The card's stats block on Lookup and Team gains a "Week by week" link that opens this page on
the Stats tab for that player.

Everything reads from the phone's storage; no signal needed.

## Data

The store keeps its shape and This season gains one optional field:

```ts
type GameStats = { date: string; opponent: string; byPlayer: Record<string, PlayerStats> };
type SeasonStats = { label: string; byPlayer: Record<string, PlayerStats>; updatedAt: string; games?: GameStats[] };
```

`date` is `YYYY-MM-DD`. `games` is kept sorted by date. A game's `byPlayer` is the same
`playerKey → category → values` the season paste produces.

**Field names.** The game parser maps Hudl's game-page columns onto the season parser's names so
`summarise` and the card work on either:

| Game table | Columns as printed | Fields |
| --- | --- | --- |
| Passing | Comp/Att, Yds, TD, Int, Long, 2PT | `cmp`, `att` (split on `/`), `yds`, `td`, `int`, `lng` |
| Rushing | Att, Yds, TD, Long, Fum, 2PT | `carries`, `yds`, `td`, `lng`, `fum` |
| Receiving | Rec, Yds, TD, Long, Fum, 2PT | `rec`, `yds`, `td`, `lng`, `fum` |
| Defense | (blank), Tk, Ast, Sck, TFL, Sfty, Int, Fum, Blks, TD — the header's first cell is empty, so the table is recognised by shape | `tackles`, `assist`, `sacks`, `tfl`, `safety`, `int`, `fum`, `blocks`, `defTd`. Hudl's per-game `Fum` does not say forced or recovered, so it is kept as its own `fum` rather than guessed into the season sheet's `ff` or `fumRec`; `Blks` likewise stays `blocks`. Neither is printed by the card. |
| Kicking | FG, %, PAT, Pts | `fgMade`, `xpMade`, `pts` (attempts are not printed per game) |
| Punting | Num, Avg, In 20, Long | `punts`, `ydsPerPunt`, `in20`, `lng`; `yds` = round(avg × num) |
| Kickoff Returns / Punt Returns | Ret, Avg, TD, Long | `returns`, `td`, `lng`; `yds` = round(avg × ret) |

`2PT` and `%` are ignored. A dash is no value, as in the season parser. A row whose name cell
is only a number (`#33`, an opponent with no name) or `Rest of team` is dropped. Hudl prints
punt and return averages as whole numbers, so yards recovered from them can differ from Hudl's
own season page by a few yards over a season; that is the source, not the parser.

**Totals are computed, never stored.** `seasonTotals(season)`:

- If `games` is non-empty: for each player and category, sum every field that is a count
  (`yds`, `td`, `cmp`, `att`, `int`, `carries`, `rec`, `fum`, `tackles`, `solo`, `assist`,
  `sacks`, `tfl`, `safety`, `intRetYds`, `ff`, `fumRec`, `fumRetYds`, `defTd`, `fgMade`,
  `fgAtt`, `xpMade`, `xpAtt`, `pts`, `punts`, `in20`, `returns`), take
  the max of `lng`, and recompute `ydsPerCarry`, `ydsPerRec`, `ydsPerPunt`, `ydsPerReturn`,
  `ydsPerAtt`, `cmpPct` from the sums. A field absent in one game does not zero the sum.
  `rating` is not carried.
- Otherwise: `byPlayer` as pasted.

Leaders, the side lists, the Season block and the player card all read from this function.

**The share code** carries the store as it is, games included, under the existing 400 KB
ceiling in `roster_check_stats`. Sixteen games of sixty players is well under it. `loadStats`
reads a season with or without `games`; an older app on a fan's phone ignores the field and
carries it along when it re-shares.

## Code

**`src/stats/gameParse.ts`** — pure. `parseGameStats(text): { rows: ParsedStatRow[]; categories: StatCategory[] }`.
Splits the paste into lines, tracks the current section by the headings `Offense`, `Defense`,
`Special Teams`, recognises a table by a header row whose first cell is a category name
(`Passing`, `Rushing`, `Receiving`, `Defense`, `Kicking`, `Punting`, `Kickoff Returns`,
`Punt Returns`), keeps the first table per category and drops the second, and reads rows until
a blank line or the next header. Cells split on tabs, or two-plus spaces when the tabs were
lost. Tests pinned to two fixtures captured from Hudl with the browser, `hudl-game-home.txt`
and `hudl-game-away.txt`, under `src/stats/fixtures/`.

**`src/stats/seasonTotals.ts`** — pure. `seasonTotals(season: SeasonStats): Record<string, PlayerStats>`
and the `COUNTED`/`MAXED`/derived field tables it uses.

**`src/stats/leaders.ts`** — pure. `leaders(totals, roster): LeaderBlock[]` and
`bySide(totals, roster, side): SideRow[]`, where a row carries the player's number, full name,
key, and `StatSummary[]` from `summarise`. Players are looked up by `playerKey`; a key with no
roster player is skipped (it cannot happen after matching, but the function must not throw).

**`src/stats/statsStore.ts`** — `GameStats` type; `games` on `SeasonStats`; `putGame(date, opponent, byPlayer)`
(sorts, replaces on equal date); `removeGame(date)`. `loadStats` accepts either shape.

**`src/screens/GameImport.tsx`** — the One game form and games list. Owns opponent, date, paste,
report. Calls `parseGameStats`, `matchStats`, `putGame`, `removeGame`.

**`src/screens/StatsImport.tsx`** — gains the Whole season / One game chips under This season
and renders `GameImport` for the second; its own logic is unchanged.

**`src/screens/TeamStats.tsx`** — the tab. State: segment, chosen player key. Renders Leaders,
a side list, or the player's weeks. Props: `roster`, `stats`, and the open player's key with its
setter, both held by App so the card's link can set them.

**`src/App.tsx`** — the `teamStats` tab, gated as above; the card's "Week by week" callback sets
the tab and the initial key. `PlayerCard.tsx` gains the link, rendered only when a callback is
passed.

No stylesheet edit. Classes used: `control-bar`, `seg`, `group-head`, `row`, `rows`, `stats`,
`stats-row`, `stats-cat`, `link-btn`, `filter-line`, `empty-text`, `input`, `textarea`,
`chips`, `chip`, `btn`. Nothing under `src/oh/` is touched or imported.

## Tests

- Game parser: both fixtures (home, away); Poland's tables kept and the opponent's dropped;
  `Comp/Att` split; averages turned into yards; dash as no value; `#33` and `Rest of team`
  dropped; a paste with no tables returns nothing; a paste that lost its tabs.
- Totals: sums across games; a player in one game only; averages recomputed from sums, not
  averaged; `lng` is a max; a field absent in one game; no games falls back to the paste.
- Leaders: top three by headline; a tie at third keeps four; a category with nobody is absent;
  a key with no roster player is skipped. Sides: category membership; number ordering with
  `07`; a two-way player on two lists.
- Store: `putGame` sorts and replaces on the same date; `removeGame`; `loadStats` reads a season
  without `games` and one with.
- Screens are not unit-tested, as in the rest of the repo; the dev walkthrough covers them.

## Shipping

The same deliberate root-app change procedure as the Schools view (CLAUDE.md, "The one rule"):

1. Branch `team-stats` off main; per-task review; whole-branch review.
2. `npm run build` fails the guard on the three page hashes and nothing else; precache stays 32.
3. Fetch all three live pages, normalise them and the built ones the guard's way, diff: the only
   line allowed to differ in each is the `<script src="/assets/index-*.js">` tag.
4. Recompute the nine hashes with the guard's own `normalise` and `withoutTeams`, write the
   baseline, re-run `node scripts/check-untouched.mjs` green.
5. Merge to main as a **squash**. Intermediate branch commits are expected to fail the guard.
6. After the deploy: paste the Salem game on the phone, open Stats, check Leaders, the three
   sides, a player's weeks, and the card's link. Then paste the whole season and confirm the
   totals did not change (the games win). Then a second game, and the Season line moves.

## Not in this

- Home/away or week numbers on game rows. The date and the opponent say which Friday.
- Deriving a game from Hudl's page automatically, or from the schedule.
- Per-game stats for last season.
- Team-level totals (points, yards) from the game page's Team Totals table.
- Editing a game's numbers by hand.
