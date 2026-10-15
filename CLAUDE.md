# rosterapp — working notes for Claude

Four things live in this repo; the first three share one deployment (Cloudflare Pages at https://roster.scottforge.ai):

1. **The root PWA** (`/`, `/ysu/`, `/victorychristian/`) — the original "who is #17" app.
   Poland Seminary is the root team; installed on real phones; used offline at games.
2. **The Ohio directory** (`/oh/`) — every OH school (717), searchable, schedules + scores,
   built as a **separate Vite pass** (`vite.oh.config.ts`), no service worker of its own.
3. **The paid tier** — a school pays ($400/season for one team, $1,800/year for the whole
   school, first season free; Stats an add-on at $150/sport/season or $600/year for every sport with stats; concierge: the seller does everything), its `/oh/` page gains Lookup/Team/Schedule tabs, full two-color theming, uploaded crest, and
   **installs as its own home-screen app**: `scripts/paid-apps.mjs` (first step of `npm run build`,
   fail-soft) asks `school_roster_sports` for each `paid-schools.json` slug and writes
   `public/oh/apps/<slug>/` (manifest opening `/oh/?school=<slug>`, icons from the crest; gitignored,
   rebuilt every deploy), and `src/oh/install.ts` links them in while a live school is on screen.
   The `?school=` link now stays in the address bar until the reader changes school, because
   Add to Home Screen saves whatever address the page is on.
   Admin panel at `/oh/?manage` (magic-link auth, single admin account; laptop-first, its own
   `.mg` styles in `src/oh/oh.css`, one row per school → a school page with Look, a card per
   sport, and Billing — `src/oh/manage/`). Privacy page at
   `/oh/?privacy`. Routing is by query flag — an unknown path falls back to Poland's root page.
4. **The marketing site** (`marketing/`, https://getroster.scottforge.ai) — one static page,
   its own Cloudflare Pages project, no build step. Nothing in it touches the three above, except that `src/marketing/site.test.ts` pins the page in the main project's `npm test`.

## The one rule that outranks everything

**Poland must not change.** `scripts/check-untouched.mjs` runs at the end of every
`npm run build` and fails it unless the three production pages are byte-identical to
`scripts/untouched-baseline.json`, the precache is exactly 32 entries, the worker denylists
`/oh(/|$)`, and the directory shipped its schools. **Never fix a guard failure by editing the
baseline.** A failure whose message says "a data fetch failed on this run" is a scraper outage,
not a config bug — wait for the next cron. Consequences:

- Never edit `src/styles.css` (its hash is baked into the guarded pages). Directory styles go
  in `src/oh/oh.css`.
- Nothing under `src/oh/` imports the root app's runtime: no `src/share`, `src/screens`,
  `src/theme`, `src/App.tsx`. Pure modules are fine (`src/types`, `src/parse/*`,
  `src/components/Keypad`, `src/ohio/*`). `src/oh/look.ts` deliberately DUPLICATES
  `src/theme/theme.ts`'s color math for this reason.
- A **deliberate** root-app change is the one time the baseline is re-recorded (last done
  2026-09-19: the Schools view on the League tab). Prove it first: normalise all three live
  pages (`/`, `/ysu/`, `/victorychristian/`) and their built counterparts the guard's way
  (`\r` stripped, beacon token blanked) and diff them — the only line allowed to differ in each
  is the `<script src="/assets/index-*.js">`
  tag. Then recompute the nine hashes with the guard's own `normalise`/`withoutTeams`, write
  them to the baseline, and re-run `node scripts/check-untouched.mjs`. The precache count must
  not move. Anything else in that diff is a regression, not a re-record.

## Data sources

- **joeeitel.com** (one person's hobby site, no API) feeds: Poland's League tab
  (`scripts/lib/ohio.mjs`), the statewide directory (16 weekly scoreboard pages →
  `src/ohio/stateParse.ts`, line-split parser), and the Schedule tab's *scores* (merged from
  league data — the ScheduleStar iCal feed publishes **fixtures only, never results**).
  All parsers are pure and pinned to saved fixtures in `src/*/fixtures/`; a shape change fails
  a test here, not a phone. Diff a fresh capture against the fixture before touching a regex.
- **Playoff regions** (joeeitel.com again) — `scripts/build-regions.mjs` writes
  `public/oh/regions/<n>.json` (a region's Harbin rankings) and `regions/index.json` (which of the
  28 regions each school is in). Rows are tied to directory schools by **name and mailing city**,
  both printed on the rankings page (`src/ohio/regionParse.ts`), so no team-id table is needed —
  that is what unblocked this. The scheduled run (a step in `directory.yml`, `continue-on-error`)
  reads only the regions holding a school in `paid-schools.json`; `--all` reads all 28 a second
  apart and is run **by hand** — when regions are drawn in August, and when a newly paid school
  is not in the index (the run warns). A paid football page shows the table on its League tab
  (`src/oh/regions.ts`), above the conference.
- **Football history** (joeeitel.com again) — `scripts/build-history.mjs` writes
  `public/oh/history/<slug>.json`, every 2011–2025 result of each `paid-schools.json` school, for
  the Schedule tab's all-time line and head-to-heads (`src/oh/history.ts`; the current season comes
  from the directory). Run **by hand, never scheduled** — when a school is added to
  `paid-schools.json` (no file just means no all-time line), and each winter with `TO` bumped so the
  finished season joins the file. The 240 week pages are cached in `scripts/data/scoreboards/`
  (gitignored), so a rerun asks joeeitel only for weeks it lacks.
- **ScheduleStar iCal** (uuid in `teams/poland/team.json`) feeds Poland's fixtures + kickoff
  times. Other sports statewide would come from ScheduleStar uuids obtained through the
  concierge relationship (phase 3 — no scrapeable source exists).
- Directory data is **committed** (`public/oh/`, 717 school JSONs) — no database for it.
  Refreshed by `.github/workflows/directory.yml` (Sat+Wed 07:00 UTC), which commits to main
  → triggers deploy. `refresh.yml` (every 6h) POSTs a Cloudflare deploy hook (`CF_PAGES_DEPLOY_HOOK`
  secret) — a rebuild of the same commit that re-fetches Poland's schedule/league/weather.
  All deploys are **fail-closed** behind the guard.
- **Linked sheets and calendars** (new in 0008) — a roster can come from a coach's Google Sheet
  and a non-football schedule from a calendar, instead of a one-time paste. The `sync-sources`
  Edge Function runs every 15 minutes via pg_cron, reading pure code in `src/sync/` that
  `npm run build:sync` bundles into a committed `supabase/functions/sync-sources/lib/core.js`
  (a test fails if that file goes stale). A refused sync writes nothing — fans never see a
  broken sheet — and the seller is alerted by Resend.
- **MaxPreps** (season stats, football, per school that asks) — `scripts/maxpreps.mjs` reads the
  printable stats page of each team the database names (`school_stats_targets()`, set per sport
  in the panel, migration 0009 — **written, NOT yet applied**) plus any in `maxpreps-teams.json`
  (the fallback until 0009 is in; gated by `paid-schools.json`), and commits
  `public/oh/stats/<slug>-<sport>.json`; `.github/workflows/maxpreps.yml` runs it Sat/Sun/Mon/Wed
  14:00 UTC. Parsers are pure, in `src/maxpreps/`, pinned to fixtures; rows come out in
  `src/stats`' own field names, so the paid page's Stats tab (`src/oh/StatsTab.tsx`) reuses
  Poland's leader math. A page it cannot read keeps the committed file and fails the run.
  A file team is fetched only if its slug is in `paid-schools.json`, and has its stats file removed
  when it is not; a database team is paid by the database's own reckoning, and a stats file
  neither source names is swept away — but only on a run where the database answered. Rows are tied to the
  roster on the page by whole name, then jersey-plus-surname (`matchTeamStats` in
  `src/oh/teamStats.ts`), never by Poland's surname-and-initial matcher.
  A stats link may be the print page or the **team's own MaxPreps page** (what a seller can copy
  from a browser): from the team page the script works out the print address once and keeps it in
  the stats file, and the first time it sees a team it also reads the **conference**, places its
  members in the directory by town then name (`src/maxpreps/leagueParse.ts`) and commits
  `public/oh/leagues/<slug>-<sport>.json` — a suggestion only the panel reads, behind the
  Conference section's **Fill from MaxPreps** button (`--league` re-reads it).
  **Week by week**: MaxPreps publishes no per-game player stats (not on the print page, a game's
  page — top three only — or a player's page). So the stats file also keeps `snapshots`, the season
  totals each time the team's games-played count (the print page's totals row) goes up, and
  `src/maxpreps/weeks.ts` subtracts consecutive ones. Tracking began after game 8 of 2026, so
  Springfield's earlier games are one "before week by week began" stretch. A week is named for a
  game only when the directory's scored games equal the latest snapshot's count. Rows on
  Lookup/Team/Stats open a player card (`src/oh/PlayerSheet.tsx`) drawn over the page.
  The roster parser reads positional arrays and checks itself against the page's stated count;
  `--roster` writes a CSV for the panel into `scripts/data/` (gitignored — the repo is public)
  and is never scheduled. The fixtures carry no athlete ids and invented names for removed players. MaxPreps' robots.txt disallows
  `/print` and its terms have not been read — one request per team per run, by the school's
  say-so, is the steady footprint (plus two, once, for the team and conference pages); keep it that way.

## Short addresses

`public/_redirects` holds the printed-QR-code addresses (`/oh/<short-name>`, both slash forms).
Every one lives under `/oh/`, because Poland's service worker answers any other path with
Poland's own page — a short address outside that prefix would never reach the directory at all.

## Supabase (migrations 0001–0008 APPLIED in production)

- Posture everywhere: RLS on with **zero policies**, table grants revoked, access only via
  security-definer functions, `search_path` pinned, errcode'd raises in sentence voice.
- **Share codes** (`shared_roster`, 0001–0003): coach publishes → code + edit token. Serves
  the root app. Untouchable.
- **Paid tier** (`school_roster`, `school_account`, 0004–0008): admin-only writes
  (`school_admin()` checks `is_admin`), public reads only via `school_roster_fetch(slug, sport)`
  gated on `published AND paid_through >= today` (Eastern). Renewal contract: `p_players`/`p_theme`/
  `p_schedule`/`p_league` **null = keep stored, `'{}'`/`'[]'` = clear (theme/schedule/league),
  object/array = set**; `p_colors` has NO keep — always send it. `school_roster_upsert` is still
  11 params (`p_league` is the 8th). `school_roster_sports(slug)` answers the school's identity,
  `{sports, colors, theme}`, choosing colors and crest per-field from the best published-and-paid
  row (football preferred, then most recently updated), so a crest uploaded on any sport paints
  the whole school, hub included. The `league jsonb` column carries `{name, members: [slug, …]}`,
  the conference the seller typed in at activation — the one fact a conference table can't get
  from the directory. **0008** (applied 2026-10-01, verified 11/11) adds `roster_source_url`,
  `schedule_source_url`, `schedule_source_filter`, and `sync_state` to `school_roster`, plus four
  functions: `school_admin_check` and `school_roster_set_sources` (authenticated, admin-only —
  the panel's Link/Unlink), and `school_roster_sync_targets`/`school_roster_sync_apply`
  (service_role only — the sync job's read and its one write). It's additive only: the upsert
  signature doesn't move, so unlike 0005–0007 there's no window where the panel's saves break.
  Seven `school_*` grants to authenticated/anon now (fetch, sports, upsert, delete, list,
  admin_check, set_sources) plus two to service_role (sync_targets, sync_apply).
- **Migration conventions:** new numbered file; schema-wide
  `revoke execute on all functions` then **re-grant every live function by exact signature**
  (a miss silently kills a live feature); signature changes drop BOTH old and new signatures
  first (apply-twice must succeed — it's a going-live gate); wrap in `begin/commit`; end with
  `notify pgrst, 'reload schema'`. Applied by hand in the dashboard SQL editor.
- **Signature-changing migrations have a deploy ordering** (see `docs/going-live.md`):
  push → deploy green → apply migration. The panel's saves break in the window; fan pages never do.
- **0009** (`supabase/migrations/0009_stats_source.sql`, written 2026-10-13, **not applied, never
  run against Postgres**) adds `stats_source_url` to `school_roster`,
  `school_roster_set_stats_source` (authenticated, admin-only), `school_stats_targets()` (anon —
  slug, sport and link for published-and-paid rows, nothing else) and one more key on
  `school_roster_list`. Additive: no deploy ordering. Until it is applied the panel's stats
  control answers with the database's own error and the job reads the file only.
- Verify with `node scripts/verify-school-roster.mjs` (13 checks once 0009 is applied, 14 with `VERIFY_SLUG` set in
  `.env.local`, needs `.env.local`). The sports check expects the identity object, so it fails
  against a database that only has 0006 applied; the four 0008 door checks fail the same way
  against a database that doesn't have 0008 yet — that's the runbook telling the truth, not a bug.

## Tests and CI

- `npx vitest run` — 803 tests / 60 files, all green. `npx tsc --noEmit` clean.
- **Tests must pass env-free**: CI runs `npm test` with no Supabase vars (forks contract).
  Mock `./supa` (`vi.mock`), never stub env or global fetch for supa-dependent code.
- CI = Cloudflare Pages' own build (project `rosterapp`, git-connected): every push to main
  deploys; every other branch/PR gets a preview build with a check on the PR. The build command
  (in the Pages dashboard, and in README's Deploying section) runs env-free `npm test` →
  `paid-weather.mjs` (fail-soft) → `npm run build` (+guard). Env vars live in the Pages project,
  **Production and Preview separately**, plain text — they ship in the bundle by design
  (`NODE_VERSION`=22, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `VITE_CF_BEACON` empty —
  the beacon is off). The GitHub repo *variables* of the same names are read by one thing: `maxpreps.yml`, to ask
  the database which teams have a stats link (public values; if they are unset the job reads
  `maxpreps-teams.json` only).

## Ops documents

- `docs/selling.md` — the seller's runbook (activate a school in ~3 min; price lives here).
- `docs/going-live.md` — first-time checklist + v2 (crest/tabs), v3 (all-sports), v4
  (identity/league), and v5 (live sources) verification, each with its own deploy ordering (v5
  has none — 0008 is additive). **The original 17-item 0004 sweep has never been run
  end-to-end** — partial coverage exists (verify script, share-code smoke, theme contract
  partially).
- Specs/plans in `docs/superpowers/{specs,plans}/` — the design history, in order.

## Where things stand (2026-10-14)

**Springfield (New Middletown) is the first real school, activated by the seller 2026-10-13/14** —
football live on `/oh/springfield` (`/oh/?school=springfield-new-middletown`), real 41-player
MaxPreps roster, peach ground `#ffbf94`, accent `#292929`, black text, nickname "Tigers", crest uploaded. It is in `paid-schools.json`, and that
list now drives its **stats fallback, playoff-region refresh and home-screen app** — never let a
branch drop it.

**The demo at `/oh/demo/` is Millbrook Tigers** (`millbrook-demo`, Springfield's look a shade off: peach ground
`#ffc29a`, accent `#2b2b2b`, text `#000000`, nickname "Tigers", black-on-orange MT crest), an invented school in an invented conference, everything baked into
`public/oh/demo.json` — football included — so it asks the directory and the database for nothing.
Its sample football stats (Stats tab, season lines, week-by-week card) are
`public/oh/stats/millbrook-demo-football.json`, written by the same script from the season it
plays (credited "a sample season"; no file out of season), fetched like a paid school's and never kept in the
phone; `scripts/maxpreps.mjs`'s sweep of unnamed stats files skips the demo's own slug (read from `public/oh/demo.json`) so it survives. It was Harlow Valley (violet/gold) until 2026-10-14. It went back to fiction (PR #16) when the
marketing site at https://getroster.scottforge.ai began pointing strangers at it. It needs a
re-run of `scripts/build-demo.mjs` by 17 November and on 1 December (`docs/selling.md`).

**Shipped 2026-10-13/14 (PRs #14–#21, all merged to main and deployed):**
- **#14 MaxPreps season stats** — Stats tab (Leaders/Offense/Defense/Special) + season lines on
  Lookup, fed by `.github/workflows/maxpreps.yml`. Springfield comes via `maxpreps-teams.json`.
- **#15 seller panel rebuilt** for a laptop — school list as dashboard, a page per school with Look
  (ground/accent/text colors, crest) and Billing written to every sport, a card per sport.
- **#17 Fill conference from MaxPreps** — `public/oh/leagues/`, one button in the Conference section.
- **#18 playoff region rankings** on the League tab (`public/oh/regions/`, name+city matching).
  Springfield: Division VII Region 25. **Run `node scripts/build-regions.mjs --all` each August.**
- **#19 text color** (third picker) + crest watermark in the panel preview.
- **#20 player card + week by week** — tap a row on Lookup/Team/Stats. Weeks come from snapshots
  of season totals (MaxPreps has no per-game data); Springfield's baseline is after game 8, so
  games 1–8 are one stretch. **Game 9 is Fri 2026-10-16 vs McDonald; the Sat 14:00 UTC run should
  record it as its own week** — first real proof of the snapshot method; check the card Saturday.
- **#21 installable school app** — `scripts/paid-apps.mjs` at build makes a manifest + icons per
  paid school; `?school=` now stays in the address.

**Open right now:**
1. **Re-upload Springfield's crest** (panel → Look → Replace crest, the full logo —
   `docs/design/springfield-video/tigers-logo.png` — then Save look). Since PR #22 (Poland-style
   icons) and the transparent-crest change, an upload is padded (not cropped) and its flat backdrop
   is lifted off (`src/oh/backdrop.ts`, shared by the panel and `scripts/lib/school-icon.mjs`), so the
   crest is stored as a transparent PNG. The crest stored now is the old centre-cropped JPEG, which
   neither can fix. After the next rebuild (≤6h), re-add the app to the home screen.
2. **Migration 0009 is NOT applied** — the panel's Stats link box errors ("Could not find the
   function … school_roster_set_stats_source"). Springfield doesn't need it. To apply: paste
   `supabase/migrations/0009_stats_source.sql` into the Supabase SQL editor, run twice, then
   `node scripts/verify-school-roster.mjs` (expect 13). Never run against Postgres yet.
3. **Unproven in production:** the MaxPreps workflow has never run on a GitHub runner (first
   scheduled run Sat 2026-10-17 14:00 UTC — check Actions); whether the repo variables
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` still exist (unset = job reads the file only); a
   real phone install of the tiger app; the week-by-week card with real data.
4. **Seen once on a test machine:** `/oh/` first load showed Victory Christian — almost certainly a
   service worker from before the 2026-08-22 `/oh` denylist; it fixed itself on refresh.
5. **Ideas raised, not built:** a game-day sponsor band ("Presented by …" per game, like the
   school's Gameday graphics — needs a schedule field + logo upload); other sports from MaxPreps
   (the AD wants girls/boys basketball, volleyball, soccer, softball).
6. **Housekeeping:** worktrees under `.superpowers/wt/` for merged branches (manage-redesign,
   league-fill, regions, text-color, weekly, install) can be removed; their remote branches too.
   Strasburg-Franklin reported "not live" to the icon builder on 2026-10-14 — its smoke-test roster
   may already be gone; check the panel.
7. **Email Joe Eitel** — still unsent; the directory, two Poland tabs and now the region rankings
   depend on his site.
8. **Phase 2** (coach self-serve) and the **other-sports schedules** from earlier remain as before.

**Older context still true:** hosting is Cloudflare Pages since 2026-09-11; live sources (sheet /
calendar sync, `sync-sources` Edge Function every 15 min, Resend alerts) are live and rehearsed
since 2026-10-02 — redeploy after any `src/sync` change with `npm run build:sync` then
`npx supabase functions deploy sync-sources --no-verify-jwt --project-ref jkuocstqtveuymfqqlwg`.
The repo is public: no real rosters or athlete ids in commits (`scripts/data/` is gitignored).
Another Claude session may be working in this checkout — use a worktree, never switch branches in
the main folder.

## Conventions

- Commit messages: plain sentences saying why, in the repo's voice (read `git log`).
- Comments: prose explaining why, not what. Typographic apostrophes in user-facing copy.
- Feature work: spec → plan (docs/superpowers) → subagent-driven execution with per-task
  review on a branch → final whole-branch review → merge. The review process has caught
  Criticals every single round — don't skip it.
- `teams/<slug>/team.json` defines a root-app team (the premium "own app" tier is a manual
  build: logo, palette, deploy — priced accordingly).
