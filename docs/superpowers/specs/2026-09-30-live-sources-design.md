# Live sources: a school's own link, Sheets and calendars that keep themselves current

**Date:** 2026-09-30

## Why

The first prospect, Springfield Local, is being pitched with a PDF that promises a coach can edit
a roster sheet and see it on the page, and that schedule changes carry over on their own. Today
neither is true: every roster and every non-football schedule is pasted into the panel by the
seller. That is fine for a concierge product, but a coach should be able to fix a number at 5 PM
without a text message, and a calendar the school already keeps should not be retyped.

There is also nothing to print. A paid school has no link of its own — a fan opens `/oh/`, picks
the school, and the phone remembers it. Only the demo has an address. The QR code on a gate sign
needs one that will still work in five years.

The seller stays the only admin. Coaches never sign in; they keep editing the sheet they already
keep.

## What ships

1. **A short address per school**, e.g. `roster.scottforge.ai/oh/springfield`, and a
   `?school=<slug>` link that opens a school directly.
2. **CSV import** for rosters in the panel.
3. **A linked Google Sheet** per school and sport, synced every 15 minutes.
4. **A linked calendar** per school and non-football sport, synced every 15 minutes.
5. **Alerts**: a status line in the panel and an email to the seller when a sync is refused or a
   link stops answering, and again when it recovers.

## 1. The address

**Why under `/oh/`.** Poland's root service worker answers every navigation on the origin with
Poland's app shell except `/oh(/|$)` (`navigateFallbackDenylist` in `vite.config.ts`). A phone
with Poland installed that scans `roster.scottforge.ai/springfield` would open Poland's roster,
and New Middletown is next door to Poland. The worker is guarded and does not change, so every
short address lives under `/oh/`.

- New file `public/_redirects` (Cloudflare Pages), one line per school:
  `/oh/springfield  /oh/?school=springfield-new-middletown  302`. Adding a school is a one-line
  commit. A 302, not a 301, so a mistaken line can be corrected without phones caching it.
- `src/oh/main.tsx` reads `?school=<slug>`. If the slug is in the directory index, it calls
  `choose(slug)` (which already clears another school's caches) and renders that school, exactly
  as if it had been picked from the directory; "Change school" still works. An unknown slug falls
  back to the directory, never a blank page.
- `?manage`, `?privacy` and the demo keep their precedence.
- The guard must pass unchanged: nothing is added to the root precache (`public/_redirects` is
  not an asset the worker globs; confirm the count stays 32), and the three guarded pages are
  untouched.

## 2–4. Sources

Each `school_roster` row (school + sport) gets a **roster source** — pasted, CSV file, or linked
Google Sheet — and, for non-football sports, a **schedule source** — pasted or linked calendar.
Football's schedule stays the directory's, as today; the panel already hides the schedule paste
for football and hides the calendar link the same way.

**The source wins.** While a sheet or calendar is linked, the panel shows that roster or schedule
read-only. Editing means changing the sheet or unlinking. Unlinking keeps the last synced data.
Colors, crest, published, paid-through and league stay editable as today.

**The fan page does not change how it reads.** `school_roster_fetch` still returns players and
schedule; the sync job fills the same columns the panel fills.

### Migration 0008 (additive)

New columns on `school_roster`, never returned by `school_roster_fetch`:

| column | type | meaning |
|---|---|---|
| `roster_source_url` | text, null | published-to-CSV Google Sheet link |
| `schedule_source_url` | text, null | calendar (iCal) link |
| `schedule_source_filter` | text, null | case-insensitive text an event must contain, for all-sports calendars (Eventlink) |
| `sync_state` | jsonb, not null default `'{}'` | `{roster?: SyncState, schedule?: SyncState}` |

`SyncState` = `{ ok_at: timestamptz | null, problem: string | null, problem_since: timestamptz | null, alerted: boolean, changed_at: timestamptz | null }`.

New functions, same posture as 0004–0007 (security definer, `search_path` pinned, errcode'd
sentence-voice raises):

- `school_roster_set_sources(p_slug, p_sport, p_roster_url, p_schedule_url, p_schedule_filter)` —
  `school_admin()` only. Null means unlink. Roster links must match
  `^https://docs\.google\.com/spreadsheets/`; calendar links must be `https://` (a `webcal://`
  link is rewritten to `https://` by the panel before saving). Football rows refuse a calendar.
  Clearing a link clears that half of `sync_state`.
- `school_roster_sync_targets()` — returns `slug, sport, roster_source_url, schedule_source_url,
  schedule_source_filter, sync_state, player_count, has_schedule` for every row with a link.
  Granted to `service_role` only.
- `school_roster_sync_apply(p_slug, p_sport, p_players, p_schedule, p_sync_state)` — writes
  `players` (when `p_players` is not null), `schedule` (when `p_schedule` is not null), and
  `sync_state`, and nothing else. Runs `school_roster_check_players` on players. Granted to
  `service_role` only.
- `school_roster_list` additionally returns `roster_source_url`, `schedule_source_url`,
  `schedule_source_filter` and `sync_state` (admin-only already). It returns `setof jsonb`, so
  the new keys go in its `jsonb_build_object` and its signature does not move.

`school_roster_upsert` keeps its 11 parameters, so there is no push→apply ordering window. The
migration follows the conventions: `begin/commit`, schema-wide revoke then re-grant every live
function by exact signature (fetch, sports, upsert, delete, list, set_sources; sync_targets and
sync_apply to `service_role`), apply-twice safe, `notify pgrst, 'reload schema'`.

### The sync job

A Supabase Edge Function, `sync-sources`, run every 15 minutes by `pg_cron` + `pg_net`. A side
effect worth having: a project touched every 15 minutes is never paused for inactivity.

For each target, independently (one school's dead link never stops the others):

1. Fetch the link: 10-second timeout, 1 MB cap, `https` only, redirects followed (Google's
   published CSV redirects).
2. Parse and check it (below).
3. Accepted and different from what is stored → write it. Accepted and identical → write only
   `ok_at`. Refused or unreachable → write nothing but `sync_state`.
4. Decide whether to email (see Alerts).

Two more entry points on the same function, called from the panel with the admin's own session:

- **Check** (`{slug, sport, kind, url, filter, dry: true}`) — fetch and parse a link that is not
  saved yet; return the parsed result or the refusal. Writes nothing.
- **Sync now** (`{slug, sport}`) — run steps 1–4 for that one row.

Both verify the caller is the admin by calling an admin-only function with the caller's JWT
before doing anything.

All parsing and checking is pure code under `src/`, pinned by tests. The function is a thin
Deno wrapper. **The plan settles first** whether `supabase functions deploy` bundles relative
imports from `src/`; if not, a script copies the pure modules into
`supabase/functions/_shared/` and a test fails if the copies drift from `src/`.

### Rosters: CSV and Sheets

- `src/parse/csv.ts` — a real CSV splitter: quoted fields, `""` escapes, commas and newlines
  inside quotes, a leading BOM, CRLF. (`splitLine` in `rosterParse.ts` does not handle quotes, so
  `"Smith, Jr."` would split today.) Its rows feed the existing column detection in
  `parseRoster`, so a sheet is read the way a paste is.
- `src/oh/rosterCheck.ts` — `checkRoster(result, previousCount) → {ok, players, warnings} |
  {ok: false, reason}`. **Refused:** no players; a duplicate jersey number (`numberKey`); a row
  without both number and name; more than 300 rows; or, on automatic sync only, fewer than half
  of `previousCount` (a cleared sheet or the wrong tab published). **Warned, not refused:** an
  unreadable optional field (height, weight, grade, position) is dropped for that player and
  listed.
- **CSV file** in the panel is a one-time import: file → `csv.ts` → the existing review table →
  save through `school_roster_upsert` as a paste is saved today. Only the Sheet syncs.

### Schedules: calendars

- `src/oh/icalSchedule.ts` — `calendarToSchedule(text, {filter, seasonYear, schoolName}) →
  {ok, rows, skipped} | {ok: false, reason}`. Reuses `src/schedule/icalParse.ts`'s unfolding and
  date handling where it fits. Per event: date and start time in Eastern; "vs X" → home, "at X" /
  "@ X" → away; opponent tidied with `tidyOpponent`. The filter is applied first, against
  SUMMARY, CATEGORIES and DESCRIPTION. Dropped: `STATUS:CANCELLED`, events outside the school
  year (Aug 1 – Jul 31 of `seasonYear`). **Refused:** no games after filtering ("check the
  filter"), or more than half of the filtered events with no readable opponent. Otherwise
  unreadable events are skipped and counted.
- Output is `ScheduleRow[]` (`src/oh/scheduleParse.ts`), so `PastedSchedule` renders it
  unchanged. Calendars carry fixtures only; no scores.
- **Supported providers are the ones with a pinned fixture:** ScheduleStar
  (`src/schedule/fixtures`), Eventlink (`src/oh/fixtures/eventlink-poland-2026.ics`), and
  Springfield's own system, captured before it is promised to them. rSchoolToday, ArbiterGame
  and DragonFly are claimed only once a real capture of each passes.

## 5. Alerts

- `src/oh/syncAlert.ts` — pure: `nextState(prev: SyncState, result, now) → {state, email: null |
  'problem' | 'recovered'}`. Email on the first failure; email again only if the reason changes;
  email on recovery; nothing while the same problem persists.
- Sent through Resend (free tier) from `alerts@scottforge.ai` (Resend's DNS records added once
  to the Cloudflare zone). The API key and the seller's address are Edge Function secrets, never
  in the repo.
- Problem email: *“Springfield volleyball roster: sync refused — two players are #12. Fans still
  see the roster from 4:15 PM.”* plus a link to `/oh/?manage`. Recovery: *“Springfield
  volleyball roster is syncing again.”*
- A failed email send is logged and does not mark `alerted`, so the next run tries again.

## Panel

- **Roster, per sport:** Paste | CSV file | Google Sheet. Choosing Sheet takes the published-CSV
  link and offers **Check link** (the dry run, shown in the existing review table, or the
  refusal). **Link** saves it with `school_roster_set_sources` and runs Sync now. While linked:
  read-only roster, “From Google Sheet · synced 6 min ago”, **Sync now**, **Unlink**.
- **Schedule, non-football sports:** Paste | Calendar link (+ optional filter), same
  Check / Link / Sync now / Unlink flow.
- **School list:** a marker per row with an open problem, e.g. “⚠ Volleyball roster: two #12s,
  since Tue 6:40 PM”.
- A short how-to under the Sheet field: File → Share → Publish to web → the roster tab → CSV.

## Testing

Env-free, `./supa` mocked, as always.

- `csv.ts`: quotes, embedded commas and newlines, BOM, CRLF, a saved real published-sheet CSV.
- `rosterCheck.ts`: each refusal and each warning.
- `icalSchedule.ts`: the ScheduleStar and Eventlink fixtures (filter on and off), cancelled
  events, the school-year window, home/away, the half-unreadable refusal; Springfield's capture
  once it exists.
- `syncAlert.ts`: every transition, including a failed send.
- `?school=`: known slug chooses and renders; unknown slug shows the directory.
- Panel helpers: the set-sources arguments, read-only while linked.
- `scripts/verify-school-roster.mjs`: anon cannot call `set_sources`, `sync_targets` or
  `sync_apply`; `school_roster_fetch` never returns a source column.
- `npm run build` and the guard pass untouched.

## Rollout

0008 only adds, so no broken-save window.

1. **The address ships first, alone** — `_redirects`, `?school=`, Springfield's line. Usable for
   the pitch now.
2. Apply 0008; apply it again; `node scripts/verify-school-roster.mjs`.
3. Resend account, DNS records, function secrets; deploy `sync-sources`; schedule it.
4. Push the panel.
5. Rehearse on a throwaway sheet and calendar against a test row: link, break (duplicate number,
   empty sheet, dead URL), confirm one problem email each, fix, confirm the recovery email,
   unlink, delete the row.
6. `docs/going-live.md` gets a v5 section with this ordering; `docs/selling.md` gets the
   Sheet/calendar activation steps and the short-address line.

## Out of scope

Stats on paid pages (a premium tier, later), non-football scores, coach sign-in (phase 2), a
school's own domain forwarding to the short address, Region standings, and correcting the
Springfield PDF's copy.
