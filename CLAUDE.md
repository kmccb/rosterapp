# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

A phone-first roster lookup for a high school football parent. Standing in the bleachers, he asks
"who is #7?" and needs an answer before the next snap. Type the number on a big keypad, get the
player.

Every design call traces back to that moment: one-handed, at night, in a crowd, on congested cell
service. When a trade-off comes up, **legibility and speed at the stadium win**.

## Status

Work lives on `claude/football-roster-lookup-8uqr00`. **Not yet merged to `main`.**

Built and verified:
- Keypad lookup with prefix matching, player card, reverse name/position search
- Roster paste import with column inference and a review/edit table
- Settings: team name, season, CSV/JSON backup, delete
- Installable PWA, works fully offline
- 30 parser unit tests; full flow driven in Chromium at 390×844 including a network-off reload

Pending, in order:
1. **DNS** — `CNAME` record `roster` → `kmccb.github.io.` for `roster.scottforge.ai`
2. **GitHub** — Settings → Pages → Custom domain, then Enforce HTTPS
3. **Merge to `main`** — the deploy workflow only triggers on pushes to `main`, and the manual
   "Run workflow" button only appears for workflows already on the default branch. Nothing
   deploys until this happens.

The repo is public with Pages enabled (both required on the free plan).

## Planned, not built

**Player stats on the card** — season totals plus a per-game log, imported by pasting a stat sheet.
Design decisions are settled and written up; the build hasn't started.

There is **no legitimate automated source** for high school football stats. MaxPreps has no public
API and its Terms of Use forbid scraping. **Do not build a scraper.** The agreed approach is that
the user copies a table he's entitled to read and pastes it, reusing the existing parser machinery.

## Architecture

```
src/
  types.ts            Player, Roster, formatHeight/formatWeight, SIDE_LABEL
  storage.ts          localStorage behind loadRoster/saveRoster, schema-versioned
  parse/rosterParse.ts   All paste-parsing. Pure, no DOM, no React.
  components/         Keypad, PlayerCard, PlayerRow — presentational
  screens/            Lookup, RosterList, Import, Settings
```

`App.tsx` owns roster state and persists through `storage.ts`. Screens receive data and callbacks;
they don't touch localStorage directly.

### The parser is the load-bearing part

`src/parse/rosterParse.ts` handles delimiter sniffing (tab/pipe/comma/semicolon/whitespace), header
detection, column inference by value shape, name splitting, and height/weight/grade parsing.

Rules for changing it:
- **Keep it pure.** No DOM, no React, no storage. That's what makes it testable, and it's the only
  part of the app with real logic.
- **Never throw on bad input.** A row that can't be parsed comes back with `issues` populated and
  is shown for editing. Losing a row silently is worse than showing a broken one.
- **Add a test with every format fix.** Every parser bug so far came from real pasted data, and
  each one is now a regression test.

### Conventions worth preserving

- **Nothing saves without review.** Import always routes through the editable table first. Real
  spreadsheet pastes are never clean.
- **Jersey numbers are strings**, so `07` survives and two players can share a number (offense and
  defense). Matching uses `numberKey`/`numberMatches`, not numeric comparison.
- **`side` stays `''` for two-way players.** On this team nearly everyone plays both ways; asserting
  "Offense" for a `QB/DB` would be wrong. Don't "fix" this by guessing.
- **The keypad is deliberately not an `<input>`.** The OS keyboard covers results and costs a tap.
- **16px minimum on inputs** — anything smaller makes iOS zoom the page on focus.

## Data and privacy

Roster data lives in `localStorage` on the device. It is never sent anywhere, and **no real player
data belongs in this repo** — these are minors' names, heights and weights, and the repo is public.

Test fixtures use invented names that mirror real formats. When verifying against a real roster, do
it locally in the scratchpad and don't commit it.

The only backup is Settings → Copy as CSV/JSON. Clearing site data loses the roster.

## Commands

```sh
npm install
npm run dev      # --host, so a phone on the same wifi can open it
npm test         # parser tests
npm run build    # tsc --noEmit && vite build
npm run preview  # serve the build — use this to check offline behaviour
npm run icons    # regenerate PNGs after editing public/icons/favicon.svg
```

## Verifying UI changes

Unit tests don't cover the thing that matters most — whether it's readable and fast on a phone.
Drive the built app with Playwright at 390×844 (`executablePath: '/opt/pw-browsers/chromium'`),
walk import → save → lookup, and reload with the network off. Screenshots catch clipped fields that
assertions miss; two real layout bugs were found that way.

## Gotchas

- **`base` in `vite.config.ts` is `/`** because of the custom domain. Reverting to plain
  `github.io` hosting means putting `/rosterapp/` back, or every asset 404s.
- **`public/CNAME`** carries the domain into each build. Without it, an Actions deploy clears the
  custom domain setting.
- **Node 22.** `sharp` is only used by `npm run icons`; the build doesn't need it.
