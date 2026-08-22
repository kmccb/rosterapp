# The Ohio directory

**Date:** 2026-08-22

## Why

People at a game last week were using this app without anyone having told them to. The thing
they wanted was "who is #17", and the only reason they had it was that somebody sent them a link.

The app is useful to exactly one school at a time, and getting a second school on it is a manual
job: a palette, a crest, a ScheduleStar uuid that cannot be discovered, a joeeitel team id, an
alias table. That is fine for three teams and impossible for seven hundred.

But joeeitel publishes the whole state, and a survey of it says the free tier is nearly free:

| Source | Requests | What it yields | Used here |
| --- | --- | --- | --- |
| `/hsfoot/scoreboard/{year}/week-{1..16}` | 16 | every game in Ohio — date, kickoff, both schools with cities, score | **yes** |
| `/hsfoot/teams` | 1 | 720 schools with team ids | no — see Identity |
| `/hsfoot/rankings/{year}/region-{1..28}` | 28 | playoff standings, Harbin averages | no — out of scope |

**Sixteen requests** covers search and every schedule and score in the state. Measured against the
live 2026 season: 4,275 games, of which 365 are played, across 734 Ohio schools. Week 1 alone
parses to 385 games, and every game carries exactly two schools — the invariant the parser is
tested on, because a regex silently dropping rows is the failure that would be hardest to see.

Two things the scoreboard gives that nothing else did:

- **Kickoff times.** `7pm`, per game, statewide. Until now the only source was the school's own
  ScheduleStar feed, keyed by a uuid that cannot be found without the school handing it over.
- **Cities.** `Jackson (Massillon)` against `Jackson (Jackson)`. Forty-five school names in Ohio
  are not unique and a search box is unusable without this.

So a fan from any school in Ohio can be given something useful on first open, with no setup and
nobody having sold anything. The roster — the "who is #17" part — is the one thing that still
requires the school, which makes it the thing worth charging for.

## The constraint that outranks everything

**Poland is live and people depend on it. Nothing in this work may change how it behaves.**

Specifically, all of the following must be true after this ships, and each is a test:

- `https://roster.scottforge.ai/` opens Poland exactly as it does today, including for an app
  already installed on a home screen and opened with no signal.
- Poland's roster, share codes and stored theme survive untouched. No storage key changes.
- The Lookup, Team, Schedule, Stats and League tabs behave identically.
- `/ysu/` and `/victorychristian/` are equally untouched.
- The precache does not grow. An installed app must not start downloading seven hundred schools.

The build already protects itself this way and this work inherits the discipline: a source that is
down or has changed shape must leave the previous good file in place rather than publish a worse
one, and must never fail the build.

### Why that forces a separate entry point

The generated service worker ends in:

```js
createHandlerBoundToURL("index.html")   // navigateFallback, no denylist
```

Every navigation is answered from the precache with **Poland's shell**. An installed app that
visits a new in-app route gets Poland's HTML, not the new page — and because there is no denylist,
it keeps getting it. `bakedTeam()` compounds it by falling back to the root team for any path it
does not recognise, so the page would come up wearing Poland's colours and crest.

And `globPatterns` currently precaches `**/*.json`. Seven hundred school files dropped into the
build output would all be precached, on every installed phone.

The directory is therefore **its own page and its own bundle**, with no service worker of its own, at
`/oh/`. Poland's code path is not modified. The two share source modules but not a runtime.

Three specific changes make that safe, and they are the riskiest edits in this work:

1. `navigateFallbackDenylist: [/^\/oh\//]` — so the existing worker stops claiming `/oh/`.
2. `globIgnores: ['**/oh/data/**', '**/oh/index.json']` — so school files are never precached.
3. `/oh/` registers **no service worker at all**, and caches what it needs in `localStorage`.

Point 3 was a second worker scoped to `/oh/` when this was first written, and it should not be:
a second worker on one origin is a way to break the first, and the first is the one holding
Poland's shell. The offline requirement here is small — an index of 734 schools is about 40 KB
and a season is 3 KB — so `localStorage` covers it with no new worker and no risk to the old one.

Change 1 only reaches installed phones when the worker updates, which is a launch or two behind.
Until then `/oh/` may be served Poland's shell for existing users. That is acceptable — no such
users exist yet, because the URL is new — but it is why the denylist ships *before* anything links
to `/oh/`.

## Data

### Scraping

A new `scripts/lib/ohio-state.mjs`, separate from the existing `ohio.mjs`, which is left alone.
All parsing goes in `src/ohio/stateParse.ts` as pure functions pinned to saved fixtures, matching
how `leagueParse.ts` is already built and tested.

The scoreboard is the primary source. Team pages are not fetched at all in this phase.

Failure is per-week and non-fatal: a week that will not parse keeps the copy already committed. A
week that parses to zero games when the committed copy has games is treated as a failure, not as a
week where nobody played — the same all-or-nothing rule the league fetch already applies.

### Storage: committed JSON, not a database

The scraped data is written into the repo and committed by the scheduled workflow. No database.

At sixteen requests a refresh there is no load problem for a database to solve, and a database
would add a bill, a service to keep alive, and a second place for the truth to live. Committing
gives free hosting, a diff for every score that changes, and an audit trail. `teams/poland/history.json`
already establishes the pattern of a committed record.

Supabase stays where it is, for share codes, and is the right home later for accounts and
subscriptions — which this phase does not have.

### Identity

A school is identified by `Name (City)` from the scoreboard, slugified. Run across all sixteen
weeks that yields **734 Ohio schools and zero duplicate slugs**, against 45 duplicated bare names —
the town separates every one of them.

The teams index is **not fetched at all**, which drops the budget from seventeen requests to
sixteen. It lists 720 schools where the scoreboards yield 734, so it is both an extra source and a
less complete one, and it carries bare names — meaning for the 45 shared names it cannot say which
team id belongs to which town anyway. Team ids are only needed for the playoff region tie-in, which
is out of scope here; when it is wanted, the fix is a one-time capture of those ~90 team pages
committed as a mapping, not a per-build cost.

### Files

```
public/oh/index.json          734 schools: slug, name, city                         ~40 KB
public/oh/data/<slug>.json    one school's season: opponent, date, kickoff, score   ~3 KB
```

`index.json` is kept in `localStorage` after the first load, so search works with no signal. School
files are fetched on demand and only the followed school's is kept — nobody browses another
county's scores from the bleachers, and caching seven hundred of them is the thing this design most
needs to avoid.

The school a reader picks is remembered, and *that* school's file is cached so it survives a dead
signal at a ground. This is the one place the directory has to be as good offline as Poland is.

## The screen

First run asks for a school and remembers it. After that the app opens on it.

```
Poland Seminary (Poland)

Friday vs Kirtland · 7:00      0–1
L 17–21 vs Salem

[Schedule]  [Scores]  [Standings]

┌──────────────────────────────────┐
│ Roster not added yet             │
│ [ Tell the coach ]               │
└──────────────────────────────────┘
```

The roster panel is the whole commercial point: it turns a fan into somebody asking the athletic
director to buy this. It is a mailto with the school's name filled in — the same mechanism the
existing "Ask for the link" button already uses.

Search is over 720 names, offline, from `index.json`. City is always shown, not only on collision,
because a reader who does not know there are three Jacksons cannot know when a qualifier matters.

## Out of scope

Deliberately not in this phase, so it stays shippable:

- Payments, accounts, subscriptions.
- Rosters for schools other than the three already built in.
- Merging the directory into the Poland app, or moving Poland behind a school picker.
- Other states, other sports.
- Push notifications.
- The playoff region tie-in that needs team ids.

## Testing

Pure parsers, fixtures saved from real pages, same as `leagueParse.ts`:

- A scoreboard week parses to the expected game count, and every game has two schools and two scores.
- `339 × 2 = 678` — every school in a week appears exactly once. This invariant catches a parse that
  silently drops rows, which is the failure mode that matters.
- A school whose name is duplicated resolves to distinct slugs by city.
- A week with no games yet played parses to games with no score rather than to nothing.
- A page that has changed shape yields zero games and is rejected rather than published.

And the Poland regression checks, which are the point of the exercise:

- The precache manifest contains the same entries before and after, plus nothing from `oh/`.
- `dist/index.html`, `dist/ysu/index.html` and `dist/victorychristian/index.html` are byte-identical
  to a build from before this work, given the same inputs.
- The generated worker carries the denylist and still binds its fallback to `index.html`.

## Risks

**One hobby site.** The whole free tier comes off joeeitel.com, which is one person with no API and
no obligation. A shape change breaks Ohio, not one tab. Mitigated the way the league tab already is
— pure parsers pinned to saved pages, all-or-nothing publishing, last good copy retained — but not
eliminated. A courtesy email to Joe Eitel is worth more than any of that code, and is the single
cheapest thing available: it converts a silent breakage into a heads-up.

**Commercialising someone else's work.** Scores and schedules are facts and facts are not
copyrightable, but wholesale reuse of a compilation to sell a product is a different conversation
from reading one team's page. This is a business decision rather than a technical one, and it is
better had now than after there are paying customers.

**Rosters of minors, at scale.** Not in this phase, but this phase is the on-ramp to it. Before any
school other than the three current ones publishes a roster, there needs to be school authorisation
rather than a coach's say-so, a privacy policy, and a deletion path.

**A directory implies coverage.** Seven hundred schools that all say "roster not added yet" reads as
an empty product. The schedule, scores and standings have to be good enough to be worth opening on
their own, or the roster prompt is an apology instead of a hook.
