# A paid school's page, made to look like Poland's

**Date:** 2026-10-14 · **Branch:** `poland-look` (stacked on `crest-plate`, PR #24, which adds `colors.nickname`)

## Why

The owner put Poland's phone screens beside Springfield's and asked for every paid school,
Springfield first, to look like Poland's: the lookup screen, the player screen, the schedule with
its Next up card and weather, and the past ten-or-so meetings with each opponent.

## What changes

### 1. The header (every tab of a sport page)
Poland: one small uppercase muted line, `POLAND BULLDOGS` (`src/App.tsx:356`, `.title` in
`src/styles.css:144`). The paid page gets the same, as `{name} {nickname}`, with **a small crest
beside it** (owner's choice). The crest sits on its `--crest-plate`. The big name and the
"New Middletown · 5–3" line go. The hub (`oh-hub-head`) is not a sport page and stays as it is.
`.title` is already in the paid bundle (`src/oh/main.tsx` imports `../styles.css`). New CSS
goes in `src/oh/oh.css` only. Never edit `src/styles.css`.

### 2. Lookup
- No big typed-number readout (`.oh-query`, `RosterTabs.tsx:~90`). Poland has none.
- Result cards show name plus `position · height · weight · grade` only, like Poland's
  `PlayerRow`. The season stat lines (`summariseStats`) leave the Lookup hits. They stay on the
  player screen and the Stats tab, and on Team if it shows them today.
- Lookup's empty state matches Poland (the "N players starting with 1" line is already shared).

### 3. The player screen
- Today `.oh-sheet` is a fixed overlay at ground 0.93 with a blur, so the keypad ghosts through
  and the crest is barely visible.
- Wanted: **full screen, opaque**. Nothing of the page behind shows through, there are no keypad
  numbers, and **the crest is clearly visible** as the screen's own watermark. It should be
  plainly there, but faint enough that the text reads well (about the visibility of Poland's
  bulldog on its main screens or a little more).
- Implementation: give the sheet an opaque `--bg` ground with its own crest layer (the
  `--wallpaper` image, centred, `contain`, at a set opacity), above which the content sits. Keep
  the Back control and the existing content.

### 4. Schedule tab
Duplicate Poland's `src/screens/Schedule.tsx` pieces into `src/oh/` (the root runtime can't be
imported). The pure helpers in `src/schedule/icalParse.ts` (`headToHead`, etc.) may be imported.
- **Next up card** (`.next-card*` classes, already in the bundle) shows:
  - `vs`/`at` Opponent
  - **the school's own season record** ("5–3 this season")
  - the full date and time ("Friday, October 16 · 7:00 PM")
  - the forecast row (from `weather.json`, as today; it moves out of the list row and into the card)
  - "**N–M all-time**" against this opponent, when history exists
  - the countdown ("2 days until game day", game-day state the same as Poland's)
  - Kickoff times come from `kickoffAt` in `src/ohio/kickoff.ts`; the directory's "7pm" isn't ISO.
  - Poland's game-day badge image becomes the school's crest.
- Under the card: "N games · W–L — tap one for the record against them".
- Each game row expands (tap) to Poland's `HeadToHead`: "10–2 in 12 meetings since 2011", then
  rows `W 42–0 home · 2025`, newest first. **Meetings** = the history file plus this season's
  scored games against that opponent.
- A non-football sport's pasted schedule keeps today's rendering. This section is football only,
  because the history and the directory are football.

### 5. History data: `public/oh/history/<slug>.json`
- **Source:** joeeitel's weekly scoreboards, `scoreboard/<year>/week-<n>`, for **2011–2025**,
  parsed by `src/ohio/stateParse.ts`. That gives the directory's own "Name (City)" slugs, so no
  team ids are needed. **The old pages are in older markup** (checked 2026-10-14): 2011–2014 use
  `<PRE>`/`<BR/>` and 2015–2023 `<br/>`, with scores in `<font color="blue">`, overtime and
  unplayed in `<font color="red">`, and "cancelled" for "cancel". Fed to the parser as they are,
  they read as **zero games and zero unreadable lines** — silently. `stateParse.ts` stays
  byte-identical (it serves the live directory); a pure `src/ohio/legacyScoreboard.ts`
  (`modernScoreboard(html)`) rewrites the old markup into today's, is a no-op on 2024+ pages, and
  is pinned to trimmed 2011/2018/2025 fixtures.
- **New script** `scripts/build-history.mjs`:
  - Writes a file **only for slugs in `paid-schools.json`** (owner's choice).
  - Caches raw week pages under `scripts/data/scoreboards/<year>/week-<n>.html` (gitignored), so
    adding a paid school later re-reads nothing. That's about 240 requests once, a second apart.
  - **Run by hand, never scheduled**, since past seasons don't change.
  - Fails before writing anything if a week won't fetch, a regular-season week (1–10) reads as no
    games, or a line it can't read names a school being written. A playoff week the site has no
    page for (403 — 2011–2020 had five playoff rounds, not six) ends that season.
  - The current season isn't in the file; the page already has it from the directory.
- **Shape:**
  ```json
  { "slug": "springfield-new-middletown", "from": 2011, "to": 2025,
    "games": [["2025-10-17", "mcdonald-mcdonald", "McDonald", "home", 42, 7], ...] }
  ```
  - `home` is `"home" | "away"`. There is no "neutral": 2011–2015 print every game as "A vs B",
    so a neutral site can't be told apart for those years. The parser's away-then-home order holds
    for every year (checked against Poland's record book). The two numbers are **this school's** score, then
    the opponent's.
  - Games are ordered newest first. The opponent's slug is `null` when it isn't in today's
    directory (`public/oh/index.json`) — an out-of-state team, a school that has since closed or
    merged, or a shared name like "East" — with the printed name kept. A school printed under an
    older town ("South Range (North Lima)" before "(Canfield)") is matched by name alone when
    exactly one directory school has that name.
- **Pure reader** `src/oh/history.ts`. It validates the shape (junk gives no history, never a
  crash) and builds the meetings for one opponent, matched by slug. It is tested against a small
  committed fixture.
- The fan page fetches `/oh/history/<slug>.json` when the Schedule tab opens. A missing file
  means no all-time line and rows that still expand with this season only (or don't expand),
  never an error.

## Rules that still hold
- Poland must not change: no edits to `src/styles.css`, `src/screens/*`, `src/App.tsx` or
  `teams/*`. `npm run build`'s guard must pass.
- Nothing under `src/oh/` imports `src/screens`, `src/share`, `src/theme` or `src/App.tsx`.
- Tests run env-free. `npx vitest run` and `npx tsc --noEmit` must be clean.
- The repo is public. Scores are public facts, but cached pages stay in `scripts/data/` (gitignored).
- Comments are prose about why. User-facing copy uses typographic apostrophes.

## Order of work
1. History script + data + `src/oh/history.ts` (independent).
2. Header + Lookup + player screen (independent of 1).
3. Schedule tab (needs 1's reader).
Each is reviewed before the next merges into the branch, then the whole branch is reviewed once.
