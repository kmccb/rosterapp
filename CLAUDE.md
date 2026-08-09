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
- Shared team database (Supabase) with two access codes, viewer/editor roles, offline cache
- Settings: team name, season, sync status, code rotation, CSV/JSON backup
- Installable PWA, works fully offline
- 30 parser unit tests; two browser drives at 390×844 — local-only mode, and a two-session
  editor/viewer sharing flow against a mock API, both including a network-off reload

Pending, in order:
1. **Supabase setup** — see `docs/sharing-setup.md`. Until `VITE_API_URL` is set the app runs
   on-device with no sign-in, which is a valid mode and the default.
2. **DNS** — `CNAME` record `roster` → `kmccb.github.io.` for `roster.scottforge.ai`
3. **GitHub** — Settings → Pages → Custom domain, then Enforce HTTPS; and add `VITE_API_URL` as
   an Actions *variable* so deployed builds get the backend
4. **Merge to `main`** — the deploy workflow only triggers on pushes to `main`, and the manual
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
  useTeam.ts          Roster state + sync + role. The one place the two worlds meet.
  api/client.ts       Calls to the edge function. Never on a lookup's critical path.
  parse/rosterParse.ts   All paste-parsing. Pure, no DOM, no React.
  components/         Keypad, PlayerCard, PlayerRow — presentational
  screens/            Lookup, RosterList, Import, Settings, SignIn
supabase/
  schema.sql          Tables + the RLS lockdown
  functions/api/      The only thing with database credentials
```

`App.tsx` renders; `useTeam.ts` owns state. Screens receive data and callbacks and touch neither
localStorage nor the network directly.

### The cache is the read path

**Lookups always read the local cache, never the network.** Sync happens around that. This is not
an optimisation — congested stadium wifi is the environment this app exists for, and any change
that puts a fetch in front of a jersey-number lookup breaks the product.

Consequences worth keeping:
- A signed-out or expired session still shows the last downloaded roster.
- Going offline degrades to "showing your last download", not an error screen.
- `useTeam` collapses to pure on-device behaviour when `VITE_API_URL` is unset, so the app is
  never broken mid-setup.

### Security posture

The browser holds no database credentials. RLS is on for every table with **no policies**, so anon
and authenticated can read nothing; the edge function's service role is the only way in, and it
checks the team code itself. Codes are stored PBKDF2-hashed, compared in constant time, and the
sign-in endpoint is rate-limited per hashed IP.

If you add an endpoint: it goes through the same token check, and anything that writes must
require `role === 'editor'`.

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
