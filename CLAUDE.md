# rosterapp — working notes for Claude

Three products share this repo and one deployment (GitHub Pages at https://roster.scottforge.ai):

1. **The root PWA** (`/`, `/ysu/`, `/victorychristian/`) — the original "who is #17" app.
   Poland Seminary is the root team; installed on real phones; used offline at games.
2. **The Ohio directory** (`/oh/`) — every OH school (717), searchable, schedules + scores,
   built as a **separate Vite pass** (`vite.oh.config.ts`), no service worker of its own.
3. **The paid tier** — a school pays (~$200/season, concierge: the seller does everything),
   its `/oh/` page gains Lookup/Team/Schedule tabs, full two-color theming, uploaded crest.
   Admin panel at `/oh/?manage` (magic-link auth, single admin account). Privacy page at
   `/oh/?privacy`. Routing is by query flag — Pages has no SPA fallback.

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

## Data sources

- **joeeitel.com** (one person's hobby site, no API) feeds: Poland's League tab
  (`scripts/lib/ohio.mjs`), the statewide directory (16 weekly scoreboard pages →
  `src/ohio/stateParse.ts`, line-split parser), and the Schedule tab's *scores* (merged from
  league data — the ScheduleStar iCal feed publishes **fixtures only, never results**).
  All parsers are pure and pinned to saved fixtures in `src/*/fixtures/`; a shape change fails
  a test here, not a phone. Diff a fresh capture against the fixture before touching a regex.
- **ScheduleStar iCal** (uuid in `teams/poland/team.json`) feeds Poland's fixtures + kickoff
  times. Other sports statewide would come from ScheduleStar uuids obtained through the
  concierge relationship (phase 3 — no scrapeable source exists).
- Directory data is **committed** (`public/oh/`, 717 school JSONs) — no database for it.
  Refreshed by `.github/workflows/directory.yml` (Sat+Wed 07:00 UTC), which commits to main
  → triggers deploy. `refresh.yml` (every 6h) rebuilds Poland's schedule/league/weather.
  All deploys are **fail-closed** behind the guard.

## Supabase (migrations 0001–0006 APPLIED in production; 0007 WRITTEN, NOT applied)

- Posture everywhere: RLS on with **zero policies**, table grants revoked, access only via
  security-definer functions, `search_path` pinned, errcode'd raises in sentence voice.
- **Share codes** (`shared_roster`, 0001–0003): coach publishes → code + edit token. Serves
  the root app. Untouchable.
- **Paid tier** (`school_roster`, `school_account`, 0004–0007): admin-only writes
  (`school_admin()` checks `is_admin`), public reads only via `school_roster_fetch(slug, sport)`
  gated on `published AND paid_through >= today` (Eastern). Renewal contract: `p_players`/`p_theme`/
  `p_schedule`/`p_league` **null = keep stored, `'{}'`/`'[]'` = clear (theme/schedule/league),
  object/array = set**; `p_colors` has NO keep — always send it. `school_roster_upsert` is 11
  params now (`p_league` is the 8th). `school_roster_sports(slug)` (0007, written, NOT yet
  applied to production) no longer answers a bare array — it answers the school's identity,
  `{sports, colors, theme}`, choosing colors and crest per-field from the best published-and-paid
  row (football preferred, then most recently updated), so a crest uploaded on any sport paints
  the whole school, hub included. The `league jsonb` column (also 0007) carries
  `{name, members: [slug, …]}`, the conference the seller typed in at activation — the one fact a
  conference table can't get from the directory. Still five `school_*` grants: fetch, sports,
  upsert, delete, list — only upsert's signature moved.
- **Migration conventions:** new numbered file; schema-wide
  `revoke execute on all functions` then **re-grant every live function by exact signature**
  (a miss silently kills a live feature); signature changes drop BOTH old and new signatures
  first (apply-twice must succeed — it's a going-live gate); wrap in `begin/commit`; end with
  `notify pgrst, 'reload schema'`. Applied by hand in the dashboard SQL editor.
- **Signature-changing migrations have a deploy ordering** (see `docs/going-live.md`):
  push → deploy green → apply migration. The panel's saves break in the window; fan pages never do.
- Verify with `node scripts/verify-school-roster.mjs` (7 checks, needs `.env.local`). Since 0007
  the sports check expects the identity object, so it fails against a database that only has 0006
  applied — that's the runbook telling the truth, not a bug.

## Tests and CI

- `npx vitest run` — 375 tests / 25 files, all green. `npx tsc --noEmit` clean.
- **Tests must pass env-free**: CI runs `npm test` with no Supabase vars (forks contract).
  Mock `./supa` (`vi.mock`), never stub env or global fetch for supa-dependent code.
- CI = `deploy.yml` (push to main: test → build+guard → Pages). Env vars are repository
  *variables*, not secrets — they ship in the bundle by design (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_CF_BEACON` for Cloudflare Web Analytics).

## Ops documents

- `docs/selling.md` — the seller's runbook (activate a school in ~3 min; price lives here).
- `docs/going-live.md` — first-time checklist + v2 (crest/tabs), v3 (all-sports), and v4
  (identity/league) verification, each with its own deploy ordering. **The original 17-item
  0004 sweep has never been run end-to-end** — partial coverage exists (verify script 6/6,
  share-code smoke, theme contract partially).
- Specs/plans in `docs/superpowers/{specs,plans}/` — the design history, in order.

## Where things stand (2026-08-24, end of session)

**Live and verified:** directory (717 schools, auto-refreshing, scores flowing), paid tier v2
(tabs, full theming, crest upload), the all-sports hub (0006), migration 0006 applied and
verified, share-code system proven alive post-migrations, security script 6/6.

**Shipped, pending migration:** Poland parity for the paid `/oh/` page — the root app's shell
(pinned header, scrolling body, keypad pinned to the bottom on Lookup, measured flush at
375x812), Poland's Team-tab filters (search, All/Offense/Defense/Special, position chips, count
+ Clear, reusing `src/roster/filters.ts`, degrading to a bare search box for sports with no
positions), the school's colors and crest applied school-wide including the hub, a League tab on
paid football pages with conference standings computed from the committed directory data (no
scraping, no team-id mapping — just a member list typed in at activation), and kickoff weather on
paid football pages fetched server-side into `public/oh/weather.json` for the slugs listed in
`paid-schools.json`, using coordinates from `public/oh/geo.json` (716 of 717 schools;
`coventry-coventry-twp` unplaceable). Migration 0007 (identity-shaped `school_roster_sports`, the
`league` column, 11-param upsert) is written and tested but **not yet applied to production** —
until it is, the League tab and school-wide crest/colors have no live data to draw on, and panel
saves are broken in the push→apply window.

**Open items, in priority order:**
1. **Apply migration 0007** — push → deploy green → apply in the dashboard SQL editor → apply
   a second time (apply-twice gate) → `node scripts/verify-school-roster.mjs` (7 checks, and
   expect the sports check to fail until 0007 is applied). Full ordering is in
   docs/going-live.md's v4 section.
2. **Strasburg-Franklin carries a TEST roster** (2 fake players: Jake Miller/Sam Ortiz,
   published, paid through 2027-02-01, note "smoke test"). Delete it from `/oh/?manage`
   or replace with a real roster. The seller's admin session expires hourly — re-sign-in
   via magic link is normal.
3. **First real sale** — the pitch: "send me your roster spreadsheet, I take care of
   everything." Panel workflow is in selling.md. A crest upload + colors makes the demo.
4. **Remaining live checks** (nice-to-have): the theme ceiling probe (>500 kB must be
   refused) and the second-non-admin-account check — listed in going-live.md.
5. **Email Joe Eitel** — still unsent. Two tabs and the whole directory now depend on his
   hobby site; a courtesy note converts silent breakage into a heads-up.
6. **Phase 2** (coach self-serve accounts) — schema is ready (`school_account`); build when
   mid-season roster-change texts become a burden.
7. **Phase 3** (all-sports package) — conference standings are done (committed directory data,
   member list from the panel); what's left is the **Region standings** tab, which needs the
   school→team-id mapping (blocked on ~90 team-page captures, deliberately deferred), and
   multi-sport schedules for non-football sports beyond the concierge-pasted rows 0006 already
   covers — a ScheduleStar uuid per sport would automate those later, same as football's.

## Conventions

- Commit messages: plain sentences saying why, in the repo's voice (read `git log`).
- Comments: prose explaining why, not what. Typographic apostrophes in user-facing copy.
- Feature work: spec → plan (docs/superpowers) → subagent-driven execution with per-task
  review on a branch → final whole-branch review → merge. The review process has caught
  Criticals every single round — don't skip it.
- `teams/<slug>/team.json` defines a root-app team (the premium "own app" tier is a manual
  build: logo, palette, deploy — priced accordingly).
