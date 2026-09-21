# Pick the game, don't type it

**Date:** 2026-09-21

## Why

The One game paste asked for an opponent and a date the app already knows: the Schedule tab
carries the season, offline included. Typing them is a chance to misspell an opponent or pick a
Thursday. And on a phone the paste box zoomed the page: iOS zooms into any field whose text is
under 16 pixels, and the box was 13, so after a paste the whole screen panned sideways.

## What ships

- **Which game** replaces Opponent and Date on the One game form: a dropdown of the season's real
  games, oldest first, worded like the Schedule tab — `Aug 21 · vs Salem`, `Sep 4 · at Field`.
  Scrimmages are left out. A game already pasted reads `… · in`; picking it again replaces that
  paste, as before.
- It opens on the most recent game played that has no stats yet. When every played game is in,
  the latest played game; before the season, the first game.
- Date and opponent come from the schedule entry, so `putGame` is called exactly as before.
- If the schedule cannot be read (no file for this team, or the fetch and the precache both
  fail), the two typed fields come back, so the form never dead-ends. That is the only time they
  appear.
- Both paste boxes, season and game, drop the small monospace styling and use the plain input
  styling: 16-pixel text, so iOS stops zooming, and lines wrap instead of scrolling inside the
  box. The parser reads tabs and newlines, not columns, so wrapping costs nothing.

## Data

The schedule is `${base}schedule.json`, read the way the Schedule tab reads it: the network
first with a cache-busting query, then the plain address the service worker answers offline.
Its `games` are `Game` from `src/schedule/icalParse.ts` — `date`, `opponent`, `home`,
`scrimmage`. `base` comes from `teamBase()` in App, passed through StatsImport to GameImport.

## Code

- `src/stats/gameOptions.ts` — pure, tested. `gameOptions(games, pasted: Set<string>, today)`
  → `{ options: { date, opponent, label }[], suggested: string | null }`.
- `src/screens/GameImport.tsx` — loads the schedule once on mount, holds the chosen date,
  renders the dropdown or the fallback fields. `opponent` is derived from the chosen option.
- `src/screens/StatsImport.tsx` — passes `base`; both paste boxes lose the `textarea` class.
- `src/App.tsx` — passes `base={teamBase()}` to StatsImport.

No stylesheet edit. Shipped as a deliberate root-app change: baseline re-recorded after the
three-page proof, squash-merged.

## Not in this

- Games the schedule doesn't know (a make-up game added late): paste it via the fallback by
  editing the schedule source, not the app.
- Changing a pasted game's date.
