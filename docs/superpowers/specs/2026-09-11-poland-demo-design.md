# The demo becomes Poland, with every varsity sport

**Date:** 2026-09-11

## Why

`/oh/demo/` is Springfield Local: six invented sports, invented fixtures, a date shift so the
season never ages. It proves the page works. It does not prove the hub works, because six tiles
is not a school — Poland fields eighteen varsity teams, and the hub's whole argument (in-season
sports first, the rest saying when they return) only reads right with a real calendar behind it.

Poland's Eventlink feed carries that calendar: every sport, every level, two seasons, with kickoff
times, home/away, and the notes a school prints on its own schedule (Homecoming, Senior Night).
It publishes fixtures only — never scores. The feed is a personal subscription and the repo is
public, so the URL is a secret and stays in `.env.local`.

Swapping the fiction for Poland's real schedules gives the demo eighteen tiles, real opponents,
real times, and football scores that arrive weekly on their own. The rosters stay invented — the
root app's roster travels by share code and the demo asks the database for nothing — and the
footer says so.

One thing this is **not**: a change to Poland's own app. `/` stays byte-identical; the guard
enforces it. The demo reads the same committed directory file the real `/oh/` Poland page reads,
and writes nothing anywhere.

## What ships

1. **A parser for the feed**, `src/oh/eventlink.ts`, pure, pinned to a committed capture.
2. **A rewritten generator**, `scripts/build-demo.mjs`, that turns the feed into `demo.json`.
3. **A demo loader that reads live directory data** for football, standings and weather, with the
   date shift removed.
4. **Gendered sport names** understood by the season table and the glyph set.
5. **A landing-tab rule**: Schedule by default, Lookup during a game. For every school, not just
   the demo.
6. **Copy and docs** that say Poland.

## 1. The parser: `src/oh/eventlink.ts`

Input is the raw `.ics` text. Output is a list of fixtures grouped by sport.

**Reading the calendar.** Unfold continuation lines (CRLF followed by a space or tab). Walk
`BEGIN:VEVENT`…`END:VEVENT` blocks. Properties are `NAME;PARAMS:VALUE`; parameters are ignored
except that `DTSTART` may be date-only (8 digits, all-day) or date-time in `America/New_York`.
Events carrying `RRULE` are recurring non-athletic entries and are dropped.

**Recognising a game.** The summary is `Sport (Gender Level) - Opponent` for home and
`Sport (Gender Level) @ Opponent` for away. A leading `CANCELED - ` marks a cancelled game and
the row is dropped. Anything that does not match the pattern (rehearsals, prom, booster meetings,
`Poland Seminary High School: …`) is dropped.

**Keeping varsity, this season.** Level is `V`, `JV` or `F` after a gender word (`Boys`, `Girls`,
`Coed`). Only `V` rows survive. The season is the one whose July the event falls after: a
2026-27 row has `DTSTART >= 2026-07-01` and `< 2027-07-01`. The generator passes the season
year; the parser filters to it.

**Naming the sport.** The feed's sport word and gender become the app's sport name:

| Feed | App sport name |
|---|---|
| `Football (Boys V)` | `football` |
| `Volleyball (Girls V)` | `volleyball` |
| `Cross Country (Coed V)` | `cross country` |
| `Swimming (Coed V)` | `swimming` |
| `Track & Field (Coed V)` | `track` |
| `Baseball (Boys V)` | `baseball` |
| `Softball (Girls V)` | `softball` |
| `Basketball (Boys V)` / `(Girls V)` | `boys basketball` / `girls basketball` |
| `Soccer`, `Golf`, `Tennis`, `Wrestling`, `Lacrosse` | `boys …` / `girls …` likewise |

Sports played by one gender only, or coed, keep the bare name. Sports Poland fields for both keep
the gender word in front. This is a table in the parser, not an inference, so a new feed sport
fails a test rather than inventing a name.

**The fixture.** Each surviving event becomes a `ScheduleRow` (`src/oh/scheduleParse.ts`):
`date` as ISO from `DTSTART`, `opponent` as the text after the separator with a trailing
` High School` / ` Sr High School` / ` H.S.` stripped, `home` from the separator, and `time` as
`h:mm AM/PM` from `DTSTART` when it has a clock and absent for all-day rows. Meets and
invitationals (`Boardman Invite`, `Sectional Tournament`) keep their name as the opponent — that
is what a fan reads on the school's own site. `DESCRIPTION` notes are dropped; the row type has
no field for them and inventing one is out of scope.

**Output shape:** `{ sport: string, rows: ScheduleRow[] }[]`, sports in first-seen order, rows
sorted by date then time. A sport with no surviving rows is not emitted.

**Fixture:** `src/oh/fixtures/eventlink-poland-2026.ics`, the capture taken 2026-09-11. The test
asserts the exact row count per sport for the 2026-27 season (football 12, volleyball 23,
girls soccer 20, boys soccer 20, and so on — the numbers the capture actually yields), that no
JV, freshman or cancelled row survives, that `Volleyball Banquet` and `Poland Players Rehearsal`
are absent, and that a home row and an away row each carry the right `home`, `time` and stripped
opponent.

## 2. The generator: `scripts/build-demo.mjs`

Rewritten from the top. Springfield Local, its five rivals, the crest rasteriser and the
date-anchoring logic go. What replaces them:

**Source.** `EVENTLINK_ICS_URL` from `.env.local` (read the way `verify-school-roster.mjs`
reads its variables). When set, fetch it and **overwrite the fixture capture** so the next commit
carries the fresh calendar. When unset, read the fixture. Either way the parser above does the
reading: the script imports `../src/oh/eventlink.ts` directly, the way `paid-weather.mjs`
imports `kickoff.ts` and `build-directory.mjs` imports `stateModel.ts`. One parser, no copy.
`.env.local` is read the way `verify-school-roster.mjs` reads it.

**Identity.** Slug `poland-seminary-poland`, name and city from the directory file
`public/oh/data/poland-seminary-poland.json`. Colors are Poland's navy and light blue from
`teams/poland/team.json` (`ground` `#04043a`, `accent` `#4fbaf7`), passed in the shape
`rosterStore`'s colour validator accepts. Logo: `teams/poland/logo.jpg` re-encoded through
`sharp` (already a dependency of this script) to a data URI that passes `validLogo` — the SVG
crest drawing goes, the encoder stays. If the encoded badge would fail validation the script
refuses rather than writing a blank-page demo.

**Sports.** Every sport the parser emits for season 2026. `sportNames` lists them; `sports[name]`
carries `{ players, schedule }`. Football's `schedule` is `null` — its fixtures and scores come
from the directory, as a real paid school's do. Every other sport's `schedule` is the parser's
rows.

**Scores.** Invented for **played** volleyball and boys/girls soccer rows only — rows dated before
the generation date. Seeded from the row's date and opponent so a re-run on the same feed writes
the same scores. Volleyball scores are sets (3–0, 3–1, 3–2 either way); soccer scores are goals
(0–4 each side). Every other sport stays unscored: meets have no `us`/`them`, and a golf score
would be a lie.

**Rosters.** Invented, one per sport, sized and positioned for the sport:

| Sport | Squad | Positions | Side |
|---|---|---|---|
| football | 40 | QB RB WR TE OL DL LB CB S K P, some doubled (`WR/CB`) | O / D / ST from position |
| volleyball | 13 | S OH MB OPP L DS | none |
| boys/girls soccer | 20 | GK D M F | none |
| boys/girls basketball | 13 | G F C | none |
| baseball, softball | 18 | P C 1B 2B 3B SS OF | none |
| boys/girls lacrosse | 22 | G D M A | none |
| everything else | 12–25 | none | none |

Numbers unique within a sport. Names drawn from a fixed pool that contains no real Poland
player; the generator's name lists are its own. `heightIn`/`weightLb` present for football only.
`grade` on everyone. The `Player` shape is `src/types.ts`'s.

**League.** `{ name: 'Northeast 8', members: [seven slugs] }`, where the members are the
`opponentSlug` of football games 4–10 in the directory file — the league games. The generator
refuses to write if the directory file has fewer than ten games or any of weeks 4–10 lacks an
`opponentSlug`; a standings table one school short is worse than none.

**Output.** `public/oh/demo.json`:

```
{
  slug, season: 2026, generatedOn,
  school: { slug, name, city },
  colors, logo, league,
  sportNames: [...],
  sports: { [name]: { players, schedule } }
}
```

`seasons` and `weather` are gone. The script prints the sports it wrote, the row counts, and
which rows it scored.

**Refusals.** No feed and no fixture: stop. A sport the naming table does not know: stop. Fewer
than ten sports: stop (the feed changed shape). Every refusal names what it saw.

## 3. The loader: `src/oh/demo.ts`

- `DEMO_SLUG` becomes `'poland-seminary-poland'`.
- `DemoData` loses `seasons` and `weather`; `asDemo` stops requiring them.
- `shiftToNow`, `weeksBehind`, `moveDate` and their tests go. `loadDemo` returns the parsed file
  as is.
- `demoSeason` returns `null` always. `store.ts`'s `isDemo()` branch in `loadSeason` then falls
  through to the directory fetch, which is the real Poland file, so football and every NE8
  member's season are live. The `isDemo()` branch is removed rather than left returning null.
- `demoWeather` returns `null` always, and its branch in `loadWeather` is removed likewise, so the
  demo reads `public/oh/weather.json` like any school.
- `demoIdentity`, `keptDemoIdentity`, `demoRosterBody` unchanged in shape. `demoRosterBody`
  still attaches `league` on football only.
- The "remembers nothing" rule stands: the demo writes nothing to storage.

`scripts/paid-weather.mjs` reads `public/oh/demo.json`'s `slug` and adds it to the slugs it
forecasts, after the `paid-schools.json` list, deduplicated. A missing or unreadable demo file
adds nothing and logs one line. The demo slug is never written to `paid-schools.json`.

## 4. Gendered sport names

`src/oh/sportSeasons.ts` gains a `bare(sport)` step inside `norm`: strip one leading `boys `,
`girls ` or `coed ` before the table lookup. The table gains two entries and loses one:

```
'girls tennis': [8, 9, 10],
'boys tennis':  [3, 4, 5],
```

replacing `tennis`. Lookup order: the full normalised name first (`girls tennis` hits), then the
bare name (`girls basketball` → `basketball`). A bare `tennis` that reaches the table finds
nothing and is treated as always in season, the existing charity — the seller types a gender for
tennis from now on and `docs/selling.md` says so.

`sportLabel` capitalises each word as today, so `girls soccer` renders "Girls Soccer".

`src/oh/SportGlyph.tsx` applies the same bare-name lookup so `boys golf` draws the golf mark.
The test that holds the glyph set to `knownSports()` is updated for the tennis split, with the
two tennis entries sharing one glyph.

`hubSports` keeps its football rule unchanged.

## 5. The landing tab: `src/oh/landing.ts`

```ts
export type Landing = 'lookup' | 'schedule';
export type LandingFixture = { date: string; time?: string | null };

export function landingTab(
  fixtures: LandingFixture[],
  players: number,
  now: Date,
): Landing;
```

Rules, in order:

1. `players === 0` → `schedule`. Nothing to look up.
2. Any fixture with a time whose start is in `[now − 4h, now + 1h]` → `lookup`.
3. Any fixture with no time whose date is today (Eastern) → `lookup`.
4. Otherwise `schedule`.

Times are parsed by `src/ohio/kickoff.ts`'s `clockOf`, which already reads both `7pm` and
`7:00 PM`, so one parser serves the directory's `kickoff` strings and the pasted schedule's
`time` strings. The instant is built in Eastern via `kickoffAt`. A fixture whose `time` is
present but unparseable is treated as untimed (rule 3), not as seven o'clock — `kickoffAt`'s
seven-o'clock default is for forecasts, and a wrong keypad is worse than a wrong forecast.

`School.tsx` calls `landingTab` in the effect that today does `setTab('lookup')` when a sport
is chosen, once the sport's roster and fixtures have settled. For football the fixtures are the
season's games (`date`, `kickoff` → `time`); for other sports the roster body's `schedule` rows.
A tab the reader has already tapped is never overridden: the rule runs only on sport entry.

## 6. Copy and docs

- Footer line (`School.tsx`, both places): **"Sample rosters — the schedules are real"**.
- `docs/selling.md`, "What to show a prospect": Poland Seminary, eighteen varsity sports, real
  schedules and football scores, invented rosters. Re-run note: run `node scripts/build-demo.mjs`
  with `EVENTLINK_ICS_URL` set whenever the school's calendar changes or a season turns; commit
  `public/oh/demo.json` and the refreshed `.ics` fixture together. The "twice a year" paragraph
  goes.
- `docs/selling.md`, "More than one sport": say the gender for tennis, basketball, soccer, golf,
  wrestling and lacrosse.
- `CLAUDE.md` "Where things stand": one paragraph on the Poland demo, and the flag that Eventlink
  is a scrapeable multi-sport schedule source — an open item, not built here.
- `.env.example` (or the README's env table, whichever exists): `EVENTLINK_ICS_URL`, never
  committed.

## Testing

- `eventlink.test.ts`: per-sport counts against the fixture; no JV/F/cancelled rows; named
  non-games absent; one home and one away row inspected field by field; all-day row has no
  `time`; unknown sport word throws.
- `landing.test.ts`: each boundary (59 minutes before, 61 minutes before, 3h59 after, 4h01
  after), untimed fixture today vs yesterday, zero players, empty fixture list.
- `sportSeasons.test.ts`: `girls tennis` autumn, `boys tennis` spring, `boys basketball` matches
  `basketball`, `sortSportsForNow` orders a gendered pair correctly, `knownSports` still covers
  the glyph set.
- `sportGlyph.test.ts`: `boys golf` and `golf` draw the same mark.
- `demo.test.ts`: reduced to the new shape — `asDemo` accepts the generated file, rejects a file
  missing `sports`, `demoSeason`/`demoWeather` no longer exist or return null, `demoRosterBody`
  attaches `league` to football only.
- `store.test.ts` / `rosterStore.test.ts`: demo branches updated; the directory fetch is hit for
  the demo slug's season.
- `paid-weather` has no test today; the plan adds a small one for the slug merge if the script's
  structure allows, otherwise the behaviour is checked by running it.
- `npx vitest run`, `npx tsc --noEmit`, `npm run build` (guard green, Poland untouched).
- In the browser at 375×812: the hub shows eighteen tiles with September's sports first; a
  football tile opens on Schedule (no game now) with real scores; a volleyball tile opens on
  Schedule with invented scores on played rows and none on future rows; a cross country tile
  shows meet names unscored; the Team tab on football filters by side; Lookup finds a number.

## Out of scope

- Refreshing the feed from CI (needs the token as a secret; a follow-up).
- Using Eventlink as a schedule source for paying schools (the phase 3 unlock; noted in
  CLAUDE.md).
- JV and freshman levels.
- Notes like Homecoming on a fixture.
- Region standings.
