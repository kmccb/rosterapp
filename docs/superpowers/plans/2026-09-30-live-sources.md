# Live sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each paid school a printable short address, and let a roster come from a CSV file or a linked Google Sheet and a non-football schedule from a linked calendar, synced every 15 minutes, with the seller emailed when a sync is refused.

**Architecture:** The fan page keeps reading `school_roster_fetch` exactly as today. A Supabase Edge Function (`sync-sources`), run every 15 minutes by `pg_cron`, reads the links from the database, fetches them, runs pure parsing/checking code from `src/sync/` (bundled into the function by Vite), writes accepted data through a service-role-only database function, and emails via Resend on state changes. The admin panel sets links, previews them ("Check link") and triggers "Sync now" through the same function.

**Tech Stack:** React 18 + TypeScript, Vite 8 (rolldown), Vitest 4, Supabase (Postgres, PostgREST, Edge Functions on Deno, pg_cron, pg_net, Vault), Cloudflare Pages `_redirects`, Resend.

**Spec:** `docs/superpowers/specs/2026-09-30-live-sources-design.md`

## Global Constraints

- **Poland must not change.** `npm run build` ends with `scripts/check-untouched.mjs`; it must pass with the baseline untouched: three guarded pages byte-identical, precache exactly 32 entries, worker denylists `/oh(/|$)`. Never edit `scripts/untouched-baseline.json`.
- Never edit `src/styles.css`. Do not modify `src/schedule/icalParse.ts` (it is in Poland's bundle) — import from it only.
- Nothing under `src/oh/` or `src/sync/` imports `src/share`, `src/screens`, `src/theme` or `src/App.tsx`.
- Tests must pass env-free (no Supabase vars). Mock `./supa` with `vi.mock` for supa-dependent code; never stub env or global fetch for it.
- Every short address lives under `/oh/` (Poland's worker answers every other path with Poland's shell).
- Database posture: RLS on, zero policies, access only via `security definer` functions with `set search_path = public, pg_temp`, errcode'd raises in sentence voice, schema-wide `revoke execute` then re-grant **every** live function by exact signature, migration apply-twice safe, wrapped in `begin/commit`, ends with `notify pgrst, 'reload schema'`.
- User-facing copy (UI strings, refusal reasons, emails) uses typographic apostrophes and quotes (’ “ ”).
- Comments explain why, in prose, matching the repo's density. Commit messages are plain sentences saying why, ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Feature work happens on a branch (`live-sources`), not `main`. Task 1 is the exception path: it may be merged to `main` on its own before the rest (it ships first).
- Run tests with `npx vitest run <path>`; the full suite with `npx vitest run`; types with `npx tsc --noEmit`.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/oh/link.ts` | create | Read `?school=` and decide which school a link opens |
| `src/oh/link.test.ts` | create | |
| `src/oh/Directory.tsx` | modify | Honour a school link once, then drop it from the address bar |
| `public/_redirects` | create | Short addresses → `/oh/?school=<slug>` |
| `src/oh/redirects.test.ts` | create | Every short address is under `/oh/`, 302, and names a real school |
| `supabase/migrations/0008_live_sources.sql` | create | Source columns, sync state, five new/changed functions, grants |
| `scripts/verify-school-roster.mjs` | modify | Four new anon-refusal checks, optional live-slug leak check |
| `src/sync/types.ts` | create | Shared types: `SideState`, `SyncState`, `Target`, `FetchText` |
| `src/sync/canon.ts` | create | Key-order-independent JSON comparison (jsonb reorders keys) |
| `src/sync/rosterCheck.ts` | create | Sheet/CSV text → players, refusals, warnings |
| `src/sync/fixtures/sheet-roster.csv` | create | A Google-Sheets-shaped export |
| `src/sync/calendar.ts` | create | iCal text → `ScheduleRow[]`, refusals |
| `src/sync/fixtures/eventlink-poland-2026.ics` | create | Copied from branch `poland-demo` (token-free capture) |
| `src/sync/alert.ts` | create | When to email, and what it says |
| `src/sync/run.ts` | create | One target's sync, and a link preview, with fetch injected |
| `src/sync/core.ts` | create | The bundle's entry: what the Edge Function imports |
| `src/sync/*.test.ts` | create | |
| `vite.sync.config.ts` | create | Library build of `src/sync/core.ts` |
| `supabase/functions/sync-sources/lib/core.js` | create (generated, committed) | |
| `supabase/functions/sync-sources/index.ts` | create | Deno handler: auth, fetch, email, apply |
| `supabase/cron/sync-sources.sql` | create | The schedule, run by hand once |
| `src/oh/manage/adminApi.ts` | modify | Source fields on `RosterRow`, `setSources`, `checkSource`, `syncNow` |
| `src/oh/manage/sources.ts` | create | Link validation and status-line wording |
| `src/oh/manage/Sources.tsx` | create | Link / Check / Sync now / Unlink UI |
| `src/oh/manage/Activate.tsx` | modify | CSV file input; hide paste boxes while linked; mount `Sources` |
| `src/oh/manage/Manage.tsx` | modify | Problem marker per row |
| `package.json`, `tsconfig.json` | modify | `build:sync` script; include `vite.sync.config.ts` |
| `docs/going-live.md`, `docs/selling.md`, `CLAUDE.md` | modify | v5 runbook, seller steps, current state |

---

### Task 1: A school's own address

**Files:**
- Create: `src/oh/link.ts`, `src/oh/link.test.ts`, `public/_redirects`, `src/oh/redirects.test.ts`
- Modify: `src/oh/Directory.tsx`

**Interfaces:**
- Produces: `schoolParam(search: string): string | null`, `resolveLink(param: string | null, schools: { slug: string }[], chosen: string | null): string | null`

- [ ] **Step 1: Write the failing tests**

`src/oh/link.test.ts`:

```ts
import { resolveLink, schoolParam } from './link';

describe('schoolParam', () => {
  it('reads a slug', () => {
    expect(schoolParam('?school=springfield-new-middletown')).toBe('springfield-new-middletown');
  });
  it('ignores an absent or empty parameter', () => {
    expect(schoolParam('')).toBeNull();
    expect(schoolParam('?school=')).toBeNull();
    expect(schoolParam('?manage')).toBeNull();
  });
  it('refuses anything that is not slug-shaped', () => {
    expect(schoolParam('?school=Springfield')).toBeNull();
    expect(schoolParam('?school=a/../b')).toBeNull();
    expect(schoolParam('?school=-a')).toBeNull();
    expect(schoolParam('?school=a--b')).toBeNull();
  });
});

describe('resolveLink', () => {
  const schools = [{ slug: 'springfield-new-middletown' }, { slug: 'poland-seminary-poland' }];

  it('opens the linked school when the directory has it', () => {
    expect(resolveLink('springfield-new-middletown', schools, 'poland-seminary-poland')).toBe(
      'springfield-new-middletown',
    );
  });
  it('falls back to the followed school for an unknown slug', () => {
    expect(resolveLink('no-such-school', schools, 'poland-seminary-poland')).toBe('poland-seminary-poland');
  });
  it('falls back to the picker when nothing is followed', () => {
    expect(resolveLink('no-such-school', schools, null)).toBeNull();
    expect(resolveLink(null, schools, null)).toBeNull();
  });
});
```

`src/oh/redirects.test.ts`:

```ts
import { readFileSync } from 'node:fs';

/*
 * The short addresses are printed on gate signs and flyers, so a typo here is
 * a QR code that opens the wrong school or none. Each line is held to the
 * directory it points into.
 */
const lines = readFileSync('public/_redirects', 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

const slugs = new Set(
  (JSON.parse(readFileSync('public/oh/index.json', 'utf8')).schools as { slug: string }[]).map(
    (s) => s.slug,
  ),
);

describe('public/_redirects', () => {
  it('has at least one short address', () => {
    expect(lines.length).toBeGreaterThan(0);
  });

  it.each(lines)('%s lives under /oh/, is a 302, and opens a real school', (line) => {
    const [from, to, status, ...rest] = line.split(/\s+/);
    expect(rest).toEqual([]);
    // Poland's worker answers every navigation outside /oh/ with Poland's page.
    expect(from).toMatch(/^\/oh\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/);
    expect(status).toBe('302');
    const target = new URL(to, 'https://roster.scottforge.ai');
    expect(target.pathname).toBe('/oh/');
    expect(slugs.has(target.searchParams.get('school') ?? '')).toBe(true);
  });

  it('lists no short address twice', () => {
    const froms = lines.map((l) => l.split(/\s+/)[0]);
    expect(new Set(froms).size).toBe(froms.length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/oh/link.test.ts src/oh/redirects.test.ts`
Expected: FAIL — `Cannot find module './link'` and `ENOENT ... public/_redirects`.

- [ ] **Step 3: Implement**

`src/oh/link.ts`:

```ts
/*
 * A school's own address.
 *
 * The directory remembers one followed school per phone, which is right for a
 * parent and useless for a gate sign: a QR code has to open one school for
 * everybody who scans it. `/oh/?school=<slug>` does that, and the short
 * addresses in public/_redirects point at it.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function schoolParam(search: string): string | null {
  const value = new URLSearchParams(search).get('school');
  return value && SLUG.test(value) ? value : null;
}

/**
 * Which school to open. A slug the directory doesn't know is a misprinted
 * link, and the reader gets what /oh/ would have shown them anyway — their own
 * school, or the picker — rather than a blank page.
 */
export function resolveLink(
  param: string | null,
  schools: { slug: string }[],
  chosen: string | null,
): string | null {
  if (param && schools.some((s) => s.slug === param)) return param;
  return chosen;
}
```

`public/_redirects` (Springfield is the first; both slash forms, because people type both):

```
# Short addresses for printed QR codes. Every one lives under /oh/: Poland's
# service worker answers any other path with Poland's own page.
/oh/springfield   /oh/?school=springfield-new-middletown   302
/oh/springfield/  /oh/?school=springfield-new-middletown   302
```

`src/oh/Directory.tsx` — change the imports and the top of the component:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { School } from '../ohio/stateModel';
import { resolveLink, schoolParam } from './link';
import { choose, chosenSlug, forget, loadIndex, searchSchools } from './store';
import { School as SchoolScreen } from './School';
```

```tsx
export function Directory() {
  // A school link is honoured once. It is taken out of the address bar as soon
  // as it is read, so "Follow a different school" followed by a reload doesn't
  // snap the reader back to the school on the sign.
  const link = useRef(schoolParam(location.search));
  const [schools, setSchools] = useState<School[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [slug, setSlug] = useState<string | null>(() => (link.current ? null : chosenSlug()));

  // Only needed for the picker — or to check a school link against the
  // directory. A school already chosen goes straight to its own screen, which
  // fetches its season directly. Loading resumes the moment "Follow a
  // different school" clears the choice and slug goes back to null.
  useEffect(() => {
    if (slug !== null) return;
    loadIndex()
      .then((list) => {
        const pending = link.current;
        link.current = null;
        if (pending) {
          history.replaceState(null, '', '/oh/');
          const target = resolveLink(pending, list, chosenSlug());
          if (target) {
            if (target === pending) choose(target);
            setSlug(target);
            return;
          }
        }
        setSchools(list);
      })
      .catch(() => setFailed(true));
  }, [slug]);
```

(The rest of the component is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/oh/link.test.ts src/oh/redirects.test.ts`
Expected: PASS (4 + 4 tests).

- [ ] **Step 5: Prove the build and the guard**

Run: `npx tsc --noEmit && npm run build`
Expected: the build ends with the guard passing (precache still 32). Then run `ls dist/_redirects` — the file is there (public/ is copied by the main build; `_redirects` matches none of the worker's glob extensions, so the precache cannot grow).

Then check `?school=` in a built preview. Add a `.claude/launch.json` entry that runs `npx vite preview --port 4173 --strictPort` (it serves `dist/`), open `http://localhost:4173/oh/?school=springfield-new-middletown` in the Browser pane, and confirm the Springfield screen opens and the address bar now reads `/oh/`. Also open `/oh/?school=no-such-school` and confirm the picker (or the previously followed school) shows. `vite preview` does not apply `_redirects`; that line is proven on the branch's Pages preview deploy, where `https://<branch>.rosterapp-7zt.pages.dev/oh/springfield` must land on Springfield.

- [ ] **Step 6: Commit**

```bash
git add src/oh/link.ts src/oh/link.test.ts src/oh/Directory.tsx public/_redirects src/oh/redirects.test.ts
git commit -m "Give a school an address of its own, so a QR code on a gate sign opens that school for everyone who scans it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0008 and the verify script

**Files:**
- Create: `supabase/migrations/0008_live_sources.sql`
- Modify: `scripts/verify-school-roster.mjs` (insert after the `anon list yields nothing` check)

**Interfaces:**
- Produces (SQL): `school_admin_check() → boolean` (authenticated); `school_roster_set_sources(text,text,integer,text,text,text) → void` (authenticated, admin-only); `school_roster_sync_targets() → setof jsonb` (service_role); `school_roster_sync_apply(text,text,integer,jsonb,jsonb,jsonb) → void` (service_role); `school_roster_list()` gains keys `roster_source_url`, `schedule_source_url`, `schedule_source_filter`, `sync_state`.
- `sync_targets` rows: `{slug, sport, season, roster_source_url, schedule_source_url, schedule_source_filter, sync_state, players, schedule}` — the shape `Target` in Task 3.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0008_live_sources.sql`:

```sql
-- Sources that keep themselves current.
--
-- A roster can now come from a Google Sheet the coach already keeps, and a
-- non-football schedule from the calendar the school already publishes. The
-- links live here, behind the seller's login — the repo is public and some
-- calendar links carry a personal token. A job run every fifteen minutes
-- (supabase/functions/sync-sources) reads them, checks what it fetched, and
-- writes only what passes. The fan page reads exactly what it read before:
-- school_roster_fetch builds its answer key by key and none of these columns
-- is one of them.
--
-- Only additions. school_roster_upsert keeps its eleven parameters, so unlike
-- 0007 there is no window in which the panel's saves are broken.

begin;

alter table public.school_roster
  add column if not exists roster_source_url text,
  add column if not exists schedule_source_url text,
  add column if not exists schedule_source_filter text,
  add column if not exists sync_state jsonb not null default '{}'::jsonb;

comment on column public.school_roster.roster_source_url is
  'A Google Sheet published to the web as CSV. While set, the sync job owns players.';
comment on column public.school_roster.schedule_source_url is
  'An iCal link. While set, the sync job owns schedule. Never set for football, whose schedule is the directory''s.';
comment on column public.school_roster.schedule_source_filter is
  'Text an event must contain to count, for calendars that carry every sport (Eventlink).';
comment on column public.school_roster.sync_state is
  '{"roster": SideState, "schedule": SideState} — last success, current problem, whether the seller has been emailed.';

-- The panel's way of asking "am I the seller?" with a session the sync
-- function was handed. school_roster_list answers an empty set to anybody
-- else, which a caller can't tell from "no rows yet"; this answers false.
create or replace function public.school_admin_check()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.school_admin();
$$;

-- Links are set and cleared here, never through upsert, so a renewal can't
-- drop them by not carrying them. Changing or clearing a link forgets that
-- side's sync history — a new link's problems are its own.
create or replace function public.school_roster_set_sources(
  p_slug text, p_sport text, p_season integer,
  p_roster_url text, p_schedule_url text, p_schedule_filter text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filter text := nullif(btrim(coalesce(p_schedule_filter, '')), '');
begin
  if not public.school_admin() then
    raise exception 'this account is not the seller''s and may not touch the paid tier'
      using errcode = '42501';
  end if;
  if p_roster_url is not null and p_roster_url !~ '^https://docs\.google\.com/spreadsheets/' then
    raise exception 'a roster link must be a Google Sheet published to the web' using errcode = '22023';
  end if;
  if p_schedule_url is not null and p_schedule_url !~ '^https://' then
    raise exception 'a calendar link must start with https://' using errcode = '22023';
  end if;
  if p_schedule_url is not null and p_sport = 'football' then
    raise exception 'football''s schedule comes from the directory and takes no calendar link'
      using errcode = '22023';
  end if;
  if length(coalesce(p_roster_url, '')) > 2000 or length(coalesce(p_schedule_url, '')) > 2000
     or length(coalesce(v_filter, '')) > 200 then
    raise exception 'that link is too long to be a real one' using errcode = '22023';
  end if;

  update public.school_roster set
    sync_state = (sync_state
      - (case when roster_source_url is distinct from p_roster_url then 'roster' else '' end))
      - (case when schedule_source_url is distinct from p_schedule_url
                or schedule_source_filter is distinct from v_filter then 'schedule' else '' end),
    roster_source_url      = p_roster_url,
    schedule_source_url    = p_schedule_url,
    schedule_source_filter = case when p_schedule_url is null then null else v_filter end
  where school_slug = p_slug and sport = p_sport and season = p_season;

  if not found then
    raise exception 'there is no activation for that school, sport and season' using errcode = 'P0002';
  end if;
end;
$$;

-- Everything the job needs to decide whether anything changed: the links,
-- the history, and what fans see now.
create or replace function public.school_roster_sync_targets()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'slug',                   school_slug,
           'sport',                  sport,
           'season',                 season,
           'roster_source_url',      roster_source_url,
           'schedule_source_url',    schedule_source_url,
           'schedule_source_filter', schedule_source_filter,
           'sync_state',             sync_state,
           'players',                players,
           'schedule',               schedule
         )
  from public.school_roster
  where roster_source_url is not null or schedule_source_url is not null
  order by school_slug, sport, season desc;
$$;

-- The job's only write. It can touch players, schedule and sync_state and
-- nothing else — colors, crest, published, paid-through and league are the
-- seller's. Each half only lands while its link is still set, so a sync that
-- was already running when the seller pressed Unlink can't write over the
-- roster they just took back.
create or replace function public.school_roster_sync_apply(
  p_slug text, p_sport text, p_season integer,
  p_players jsonb, p_schedule jsonb, p_sync_state jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_players is not null then
    perform public.school_roster_check_players(p_players);
    if jsonb_array_length(p_players) = 0 then
      raise exception 'a synced roster cannot be empty' using errcode = '22023';
    end if;
  end if;
  perform public.school_roster_check_schedule(p_schedule);
  if p_sync_state is null or jsonb_typeof(p_sync_state) <> 'object' then
    raise exception 'sync state must be a JSON object' using errcode = '22023';
  end if;

  update public.school_roster set
    players    = case when roster_source_url is not null then coalesce(p_players, players) else players end,
    schedule   = case when schedule_source_url is not null then coalesce(p_schedule, schedule) else schedule end,
    sync_state = p_sync_state,
    updated_at = case
                   when (p_players is not null and roster_source_url is not null)
                     or (p_schedule is not null and schedule_source_url is not null)
                   then now() else updated_at
                 end
  where school_slug = p_slug and sport = p_sport and season = p_season;
end;
$$;

-- --------------------------------------------------------------------- list

create or replace function public.school_roster_list()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'school_slug',            school_slug,
           'sport',                  sport,
           'season',                 season,
           'player_count',           jsonb_array_length(players),
           'colors',                 colors,
           'has_logo',               coalesce(theme ? 'logo', false),
           'has_schedule',           schedule is not null,
           'has_league',             league is not null,
           'published',              published,
           'paid_through',           paid_through,
           'note',                   note,
           'updated_at',             updated_at,
           'roster_source_url',      roster_source_url,
           'schedule_source_url',    schedule_source_url,
           'schedule_source_filter', schedule_source_filter,
           'sync_state',             sync_state
         )
  from public.school_roster
  where public.school_admin()
  order by school_slug, sport, season desc;
$$;

-- ----------------------------------------------------------------- grants

revoke execute on all functions in schema public from public, anon, authenticated;

-- Everything live gets its grant back, as every migration since 0001 has
-- done: four roster_* and five school_* as in 0007, plus the seller's two
-- new doors. The job's two functions go to service_role alone — no browser
-- ever holds that key.
grant execute on function public.roster_fetch(text) to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text) to anon, authenticated;
grant execute on function public.school_roster_fetch(text, text) to anon, authenticated;
grant execute on function public.school_roster_sports(text) to anon, authenticated;
grant execute on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, date, text) to authenticated;
grant execute on function public.school_roster_delete(text, text, integer) to authenticated;
grant execute on function public.school_roster_list() to authenticated;
grant execute on function public.school_admin_check() to authenticated;
grant execute on function public.school_roster_set_sources(text, text, integer, text, text, text) to authenticated;
grant execute on function public.school_roster_sync_targets() to service_role;
grant execute on function public.school_roster_sync_apply(text, text, integer, jsonb, jsonb, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Self-check the migration against the conventions**

Confirm by reading, and write the result into the task report:
- Every `grant` line from 0007's grants block appears above unchanged (diff the two blocks: `diff <(sed -n '/^grant/p' supabase/migrations/0007_school_identity_and_league.sql) <(sed -n '/^grant/p' supabase/migrations/0008_live_sources.sql)` shows only the four added lines).
- Apply-twice: `add column if not exists`; every function is `create or replace` with a signature that exists only in this migration (or, for `school_roster_list`, the same signature and return type as 0007). Nothing is dropped.
- `school_roster_fetch` is untouched, so no new column can reach anon.

- [ ] **Step 3: Add the verify checks**

In `scripts/verify-school-roster.mjs`, insert after the `anon list yields nothing` check:

```js
// 0008's doors. A missing function answers 404, which is >= 400 and would
// pass a lazy check without proving anything, so these insist on the
// permission wall itself: 401 for anon (or 403), never 404.
const refused = (res) => res.status === 401 || res.status === 403;

const anonSources = await rpc('school_roster_set_sources', {
  p_slug: 'x', p_sport: 'football', p_season: 2026,
  p_roster_url: null, p_schedule_url: null, p_schedule_filter: null,
});
check('anon cannot set sources', refused(anonSources), JSON.stringify(anonSources));

const anonTargets = await rpc('school_roster_sync_targets', {});
check('anon cannot read sync targets', refused(anonTargets), JSON.stringify(anonTargets));

const anonApply = await rpc('school_roster_sync_apply', {
  p_slug: 'x', p_sport: 'football', p_season: 2026,
  p_players: null, p_schedule: null, p_sync_state: {},
});
check('anon cannot apply a sync', refused(anonApply), JSON.stringify(anonApply));

const anonAdmin = await rpc('school_admin_check', {});
check('anon is not the seller', refused(anonAdmin), JSON.stringify(anonAdmin));

// With a live activation named in .env.local (VERIFY_SLUG, and VERIFY_SPORT
// when it isn't football), prove the public answer carries no link or sync
// history. Optional because the paid tier can have no live rows at all.
if (env.VERIFY_SLUG) {
  const live = await rpc('school_roster_fetch', {
    p_slug: env.VERIFY_SLUG,
    p_sport: env.VERIFY_SPORT || 'football',
  });
  const keys = live.body ? Object.keys(live.body) : [];
  check(`${env.VERIFY_SLUG} fetch carries no source links or sync state`,
    live.status === 200 && live.body !== null && !keys.some((k) => /source|sync/.test(k)),
    JSON.stringify({ status: live.status, keys }));
}
```

Also update the header comment's description (it says "Run by hand after applying 0004") to: `Run by hand after applying a migration — not in CI, ...` and add `0008's four doors` to the list of what it asks.

- [ ] **Step 4: Check the script parses**

Run: `node --check scripts/verify-school-roster.mjs`
Expected: no output, exit 0. (The live run happens in the rollout, Task 10.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_live_sources.sql scripts/verify-school-roster.mjs
git commit -m "Store each activation's sheet and calendar links behind the seller's login, and give the sync job a write that can touch only players and schedule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reading a roster sheet

**Files:**
- Create: `src/sync/types.ts`, `src/sync/canon.ts`, `src/sync/rosterCheck.ts`, `src/sync/rosterCheck.test.ts`, `src/sync/fixtures/sheet-roster.csv`

**Interfaces:**
- Consumes: `parseRoster(text): ParseResult`, `numberKey(s)` from `src/parse/rosterParse.ts`; `Player` from `src/types.ts`; `ScheduleRow` from `src/oh/scheduleParse.ts`.
- Produces:
  - `src/sync/types.ts`: `SideState`, `SyncState`, `SourceSide = 'roster' | 'schedule'`, `Target`, `Fetched`, `FetchText`.
  - `src/sync/canon.ts`: `canon(value: unknown): string`.
  - `src/sync/rosterCheck.ts`: `stripBom(text): string`, `tidySheet(text): string`, `checkRoster(text: string, previousCount: number): RosterVerdict`, `sameRoster(a: Player[], b: Player[]): boolean`, `type RosterVerdict = { ok: true; players: Player[]; warnings: string[] } | { ok: false; reason: string }`.

- [ ] **Step 1: Write the types and the fixture (no logic yet)**

`src/sync/types.ts`:

```ts
import type { Player } from '../types';
import type { ScheduleRow } from '../oh/scheduleParse';

/** One half of a row's sync history, as stored in school_roster.sync_state. */
export type SideState = {
  ok_at: string | null;
  problem: string | null;
  problem_since: string | null;
  /** True once the seller has been emailed about `problem`. */
  alerted: boolean;
  changed_at: string | null;
};

export type SyncState = { roster?: SideState; schedule?: SideState };

export type SourceSide = 'roster' | 'schedule';

/** A row of school_roster_sync_targets(). */
export type Target = {
  slug: string;
  sport: string;
  season: number;
  roster_source_url: string | null;
  schedule_source_url: string | null;
  schedule_source_filter: string | null;
  sync_state: SyncState;
  players: Player[];
  schedule: ScheduleRow[] | null;
};

export type Fetched = { ok: true; text: string; contentType: string } | { ok: false; reason: string };

export type FetchText = (url: string) => Promise<Fetched>;
```

`src/sync/fixtures/sheet-roster.csv` — shaped like a coach's sheet published to CSV: a title row, a blank row, a header, a quoted name with a comma, a shared number, an unreadable height, trailing blank rows. Write it with exactly this content (LF line endings):

```
Springfield Tigers Volleyball 2026,,,,
,,,,
#,Name,Pos,Gr,Ht
1,Ava Carter,S,Sr,5-8
2,"Smith, Jordan",OH,Jr,tall
3,Mia Lopez,MB,So,
3,Kate Ryan,L,Fr,5-4
7,Zoe Patel,OPP,Jr,5-10
,,,,
,,,,
```

- [ ] **Step 2: Write the failing tests**

`src/sync/rosterCheck.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import type { Player } from '../types';
import { canon } from './canon';
import { checkRoster, sameRoster, stripBom, tidySheet } from './rosterCheck';

const sheet = readFileSync('src/sync/fixtures/sheet-roster.csv', 'utf8');

describe('tidySheet', () => {
  it('drops a BOM, blank rows and a title above the header', () => {
    expect(tidySheet('﻿Title,,,\r\n,,,\r\n#,Name\r\n1,Ava Carter\r\n,,\r\n')).toBe('#,Name\n1,Ava Carter');
  });
  it('keeps a sheet with no title as it is', () => {
    expect(tidySheet('#,Name\n1,Ava Carter')).toBe('#,Name\n1,Ava Carter');
  });
});

describe('stripBom', () => {
  it('removes only a leading BOM', () => {
    expect(stripBom('﻿#,Name')).toBe('#,Name');
    expect(stripBom('#,Name')).toBe('#,Name');
  });
});

describe('checkRoster', () => {
  it('reads the published-sheet fixture', () => {
    const v = checkRoster(sheet, 0);
    if (!v.ok) throw new Error(v.reason);
    expect(v.players.map((p) => p.number)).toEqual(['1', '2', '3', '3', '7']);
    // A quoted "Last, First" survives the comma.
    expect(v.players[1].lastName).toBe('Smith');
    // An unreadable height is dropped, not fatal.
    expect(v.players[1].heightIn).toBeUndefined();
    expect(v.players[0].heightIn).toBe(68);
  });

  it('warns, never refuses, on a shared number and a bad height', () => {
    const v = checkRoster(sheet, 0);
    if (!v.ok) throw new Error(v.reason);
    expect(v.warnings).toContain('#3 is worn by 2 players');
    expect(v.warnings.some((w) => w.startsWith('#2 Jordan Smith: ') && w.includes('height'))).toBe(true);
  });

  it('refuses an empty sheet', () => {
    expect(checkRoster(',,,,\n,,,,\n', 0)).toEqual({ ok: false, reason: 'the sheet has no player rows' });
  });

  it('refuses a row with no number or no name, naming the first one', () => {
    const v = checkRoster('#,Name\n1,Ava Carter\n,Mia Lopez\n', 0);
    expect(v).toEqual({ ok: false, reason: 'a row is missing a number or a name (“Mia Lopez”)' });
    const two = checkRoster('#,Name\n1,Ava Carter\n,Mia Lopez\n,Kate Ryan\n', 0);
    expect(two).toEqual({ ok: false, reason: '2 rows are missing a number or a name (“Mia Lopez”)' });
  });

  it('refuses more than 300 rows', () => {
    const rows = Array.from({ length: 301 }, (_, i) => `${i % 99},Player ${i}`).join('\n');
    expect(checkRoster(`#,Name\n${rows}`, 0)).toEqual({
      ok: false,
      reason: 'the sheet has 301 rows, and a roster stops at 300',
    });
  });

  it('refuses a roster that lost more than half its players', () => {
    expect(checkRoster('#,Name\n1,Ava Carter\n2,Mia Lopez\n', 5)).toEqual({
      ok: false,
      reason: 'the sheet has 2 players where it had 5 — was it cleared, or the wrong tab published?',
    });
    expect(checkRoster('#,Name\n1,Ava Carter\n2,Mia Lopez\n3,Kate Ryan\n', 5).ok).toBe(true);
  });
});

describe('sameRoster', () => {
  const p = (over: Partial<Player>): Player => ({
    id: 'x', number: '1', firstName: 'Ava', lastName: 'Carter', position: 'S', side: 'D', ...over,
  });

  it('ignores ids, which the parser makes up on every read', () => {
    expect(sameRoster([p({ id: 'a' })], [p({ id: 'b' })])).toBe(true);
  });
  it('ignores key order, which jsonb rewrites', () => {
    const reordered = JSON.parse('{"side":"D","id":"z","number":"1","position":"S","lastName":"Carter","firstName":"Ava"}');
    expect(sameRoster([p({})], [reordered])).toBe(true);
  });
  it('sees a changed number or a different length', () => {
    expect(sameRoster([p({})], [p({ number: '2' })])).toBe(false);
    expect(sameRoster([p({})], [p({}), p({})])).toBe(false);
  });
});

describe('canon', () => {
  it('sorts keys at every depth and drops undefined', () => {
    expect(canon({ b: 1, a: { d: 2, c: undefined, b: [{ y: 1, x: 2 }] } })).toBe(
      '{"a":{"b":[{"x":2,"y":1}],"d":2},"b":1}',
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/sync/rosterCheck.test.ts`
Expected: FAIL — `Cannot find module './canon'`.

- [ ] **Step 4: Implement**

`src/sync/canon.ts`:

```ts
/**
 * JSON with its keys sorted, for asking "is this the same data?".
 *
 * Postgres stores jsonb with its keys reordered, so a roster read back from the
 * database never stringifies the way the same roster just parsed does. Without
 * this every sync would look like a change.
 */
export function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
```

`src/sync/rosterCheck.ts`:

```ts
import { numberKey, parseRoster } from '../parse/rosterParse';
import type { Player } from '../types';
import { canon } from './canon';

/*
 * A coach's sheet, read the way a paste is.
 *
 * parseRoster already splits comma rows with a quote-aware splitter, so this
 * adds only what a published sheet brings that a paste doesn't — a BOM, a
 * title row above the header, empty ",,,," rows — and the rules for when a
 * sheet is too broken to put in front of fans. A refused sheet changes
 * nothing: the page keeps the last roster that passed.
 */

export type RosterVerdict =
  | { ok: true; players: Player[]; warnings: string[] }
  | { ok: false; reason: string };

const MAX_ROWS = 300;

export const stripBom = (text: string): string => text.replace(/^﻿/, '');

const isEmptyRow = (line: string): boolean => /^[\s,;\t]*$/.test(line);

/** Fewer than two filled cells: "2026 Varsity Roster" sitting above the header. */
const isTitleRow = (line: string): boolean =>
  line.split(',').filter((c) => c.replace(/"/g, '').trim() !== '').length < 2;

export function tidySheet(text: string): string {
  const lines = stripBom(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !isEmptyRow(l));
  let start = 0;
  while (start < lines.length - 1 && isTitleRow(lines[start])) start += 1;
  return lines.slice(start).join('\n');
}

const label = (p: Player, raw: string[]): string => {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return name || raw.filter(Boolean).join(' ') || '(blank row)';
};

export function checkRoster(text: string, previousCount: number): RosterVerdict {
  const { rows } = parseRoster(tidySheet(text));

  if (rows.length === 0) return { ok: false, reason: 'the sheet has no player rows' };
  if (rows.length > MAX_ROWS) {
    return { ok: false, reason: `the sheet has ${rows.length} rows, and a roster stops at ${MAX_ROWS}` };
  }

  const unnamed = rows.filter((r) => !r.player.number || (!r.player.firstName && !r.player.lastName));
  if (unnamed.length) {
    const lead = unnamed.length === 1 ? 'a row is' : `${unnamed.length} rows are`;
    return {
      ok: false,
      reason: `${lead} missing a number or a name (“${label(unnamed[0].player, unnamed[0].raw)}”)`,
    };
  }

  // A cleared sheet, or the wrong tab published, looks like a roster that
  // lost most of its players overnight. A real roster doesn't.
  if (previousCount > 0 && rows.length < previousCount / 2) {
    return {
      ok: false,
      reason: `the sheet has ${rows.length} players where it had ${previousCount} — was it cleared, or the wrong tab published?`,
    };
  }

  const players = rows.map((r) => ({ ...r.player }));
  const warnings: string[] = [];
  for (const r of rows) {
    for (const issue of r.issues) warnings.push(`#${r.player.number} ${label(r.player, r.raw)}: ${issue}`);
  }
  // Two players can share a number on purpose (Player says so), so this is
  // worth a look, never a refusal.
  const worn = new Map<string, number>();
  for (const p of players) worn.set(numberKey(p.number), (worn.get(numberKey(p.number)) ?? 0) + 1);
  for (const [n, count] of worn) if (count > 1) warnings.push(`#${n} is worn by ${count} players`);

  return { ok: true, players, warnings };
}

const withoutId = ({ id: _id, ...rest }: Player) => rest;

/** The same roster, ignoring the ids the parser makes up fresh on every read. */
export const sameRoster = (a: Player[], b: Player[]): boolean =>
  a.length === b.length && canon(a.map(withoutId)) === canon(b.map(withoutId));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sync/rosterCheck.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. If `noUnusedLocals` flags `_id`, replace `withoutId` with `(p: Player) => { const { id, ...rest } = p; void id; return rest; }`.

- [ ] **Step 6: Commit**

```bash
git add src/sync/types.ts src/sync/canon.ts src/sync/rosterCheck.ts src/sync/rosterCheck.test.ts src/sync/fixtures/sheet-roster.csv
git commit -m "Read a coach's published sheet the way a paste is read, and refuse the shapes that would blank a roster in front of fans

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reading a calendar

**Files:**
- Create: `src/sync/calendar.ts`, `src/sync/calendar.test.ts`, `src/sync/fixtures/eventlink-poland-2026.ics`

**Interfaces:**
- Consumes: `tidyOpponent(raw: string): string` from `src/schedule/icalParse.ts` (import only — do not edit that file); `ScheduleRow` from `src/oh/scheduleParse.ts`.
- Produces: `calendarToSchedule(text: string, opts: { filter: string | null; seasonYear: number }): ScheduleVerdict`, `readStart(value: string): { date: string; time?: string } | null`, `readOpponent(summary: string): { opponent: string; home: boolean } | null`, `type ScheduleVerdict = { ok: true; rows: ScheduleRow[]; skipped: number } | { ok: false; reason: string }`.

- [ ] **Step 1: Bring over the Eventlink capture**

```bash
git show poland-demo:src/oh/fixtures/eventlink-poland-2026.ics > src/sync/fixtures/eventlink-poland-2026.ics
grep -ciE "token|https?://" src/sync/fixtures/eventlink-poland-2026.ics
```

Expected: the grep prints `0`. **If it prints anything else, stop**: the repo is public and the capture must carry no feed URL or token. Report it instead of committing.

- [ ] **Step 2: Write the failing tests**

`src/sync/calendar.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { tidyOpponent } from '../schedule/icalParse';
import { calendarToSchedule, readOpponent, readStart } from './calendar';

const eventlink = readFileSync('src/sync/fixtures/eventlink-poland-2026.ics', 'utf8');

const vevent = (lines: string[]): string => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const calendar = (...events: string[]): string =>
  ['BEGIN:VCALENDAR', ...events, 'END:VCALENDAR'].join('\r\n');

describe('readStart', () => {
  it('prints a zoned or floating time as written', () => {
    expect(readStart('20260824T190000')).toEqual({ date: '2026-08-24', time: '7:00 PM' });
  });
  it('turns a UTC stamp into Ohio’s date and time', () => {
    // 7pm Friday in Ohio is midnight Saturday in UTC.
    expect(readStart('20260905T000000Z')).toEqual({ date: '2026-09-04', time: '8:00 PM' });
  });
  it('leaves a date-only stamp without a time', () => {
    expect(readStart('20261212')).toEqual({ date: '2026-12-12' });
  });
  it('refuses garbage', () => {
    expect(readStart('soon')).toBeNull();
  });
});

describe('readOpponent', () => {
  it('reads Eventlink: “-” is home, “@” is away', () => {
    expect(readOpponent('Volleyball (Girls V) - Campbell Memorial High School')).toEqual({
      opponent: 'Campbell Memorial', home: true,
    });
    expect(readOpponent('Basketball (Boys V) @ Boardman High School')).toEqual({
      opponent: 'Boardman', home: false,
    });
  });
  it('skips an Eventlink event that names no school', () => {
    expect(readOpponent('Baseball (Boys V) - Baseball Team Pictures')).toBeNull();
    expect(readOpponent('Basketball (Boys V) - United Way (vs Neshannock)')).toBeNull();
  });
  it('reads ScheduleStar’s pipes', () => {
    expect(
      readOpponent('Poland Seminary vs Salem Jr/Sr High School | Boys Varsity Football | Home (Homecoming)'),
    ).toEqual({ opponent: tidyOpponent('Salem Jr/Sr High School'), home: true });
  });
  it('reads a plain “vs”, “at” or “@”', () => {
    expect(readOpponent('Girls Soccer vs Canfield')).toEqual({ opponent: 'Canfield', home: true });
    expect(readOpponent('Girls Soccer at Canfield')).toEqual({ opponent: 'Canfield', home: false });
    expect(readOpponent('Girls Soccer @ Canfield')).toEqual({ opponent: 'Canfield', home: false });
  });
  it('gives up on a title with no opponent', () => {
    expect(readOpponent('Senior Night')).toBeNull();
  });
});

describe('calendarToSchedule on the Eventlink capture', () => {
  it('pulls this season’s varsity volleyball out of the whole school', () => {
    const v = calendarToSchedule(eventlink, { filter: 'Volleyball (Girls V)', seasonYear: 2026 });
    if (!v.ok) throw new Error(v.reason);
    expect(v.rows).toHaveLength(22);
    expect(v.skipped).toBe(0);
    expect(v.rows.filter((r) => r.home)).toHaveLength(10);
    expect(v.rows[0]).toEqual({ date: '2026-08-24', opponent: 'Campbell Memorial', home: true, time: '7:00 PM' });
    expect(v.rows.every((r) => r.date >= '2026-08-01' && r.date <= '2027-07-31')).toBe(true);
  });

  it('counts the one unreadable basketball event and keeps the rest', () => {
    const v = calendarToSchedule(eventlink, { filter: 'Basketball (Boys V)', seasonYear: 2026 });
    if (!v.ok) throw new Error(v.reason);
    expect(v.rows).toHaveLength(21);
    expect(v.skipped).toBe(1);
  });

  it('refuses a filter that matches nothing, and says so', () => {
    expect(calendarToSchedule(eventlink, { filter: 'Curling (Boys V)', seasonYear: 2026 })).toEqual({
      ok: false,
      reason: 'no 2026–27 events match “Curling (Boys V)” — check the filter',
    });
  });
});

describe('calendarToSchedule rules', () => {
  const game = (summary: string, start: string, extra: string[] = []) =>
    vevent([`SUMMARY:${summary}`, `DTSTART;TZID=America/New_York:${start}`, ...extra]);

  it('drops cancelled events and anything outside the school year', () => {
    const v = calendarToSchedule(
      calendar(
        game('Girls Soccer vs Canfield', '20260910T170000'),
        game('Girls Soccer at Salem', '20260917T170000', ['STATUS:CANCELLED']),
        game('Girls Soccer vs Howland', '20260705T170000'),
      ),
      { filter: null, seasonYear: 2026 },
    );
    expect(v).toEqual({
      ok: true,
      rows: [{ date: '2026-09-10', opponent: 'Canfield', home: true, time: '5:00 PM' }],
      skipped: 0,
    });
  });

  it('matches the filter against categories and description too, ignoring case', () => {
    const v = calendarToSchedule(
      calendar(game('vs Canfield', '20260910T170000', ['CATEGORIES:Girls Varsity Soccer'])),
      { filter: 'girls varsity soccer', seasonYear: 2026 },
    );
    expect(v.ok && v.rows.length).toBe(1);
  });

  it('unfolds long lines', () => {
    const v = calendarToSchedule(
      calendar(['BEGIN:VEVENT', 'SUMMARY:Girls Soccer vs Can', ' field', 'DTSTART:20260910T170000', 'END:VEVENT'].join('\r\n')),
      { filter: null, seasonYear: 2026 },
    );
    expect(v.ok && v.rows[0].opponent).toBe('Canfield');
  });

  it('refuses when more than half the events name no opponent', () => {
    const v = calendarToSchedule(
      calendar(
        game('Girls Soccer vs Canfield', '20260910T170000'),
        game('Team pictures', '20260911T170000'),
        game('Banquet', '20260912T170000'),
      ),
      { filter: null, seasonYear: 2026 },
    );
    expect(v).toEqual({ ok: false, reason: '2 of 3 events don’t name an opponent' });
  });

  it('refuses an empty calendar', () => {
    expect(calendarToSchedule(calendar(), { filter: null, seasonYear: 2026 })).toEqual({
      ok: false,
      reason: 'the calendar has no 2026–27 events',
    });
  });

  it('sorts by date', () => {
    const v = calendarToSchedule(
      calendar(game('vs B School', '20260917T170000'), game('vs A School', '20260910T170000')),
      { filter: null, seasonYear: 2026 },
    );
    expect(v.ok && v.rows.map((r) => r.date)).toEqual(['2026-09-10', '2026-09-17']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/sync/calendar.test.ts`
Expected: FAIL — `Cannot find module './calendar'`.

- [ ] **Step 4: Implement**

`src/sync/calendar.ts`:

```ts
import type { ScheduleRow } from '../oh/scheduleParse';
import { tidyOpponent } from '../schedule/icalParse';

/*
 * A school's calendar, read into the same rows a pasted schedule makes.
 *
 * Poland's football parser (src/schedule/icalParse.ts) is in Poland's bundle
 * and is not touched; this is the any-sport reader the paid tier needs. It
 * knows three ways a game is titled — Eventlink's "Sport (Gender Level) - X"
 * and "@ X", ScheduleStar's pipes, and a plain "vs X" / "at X" — and treats
 * anything else as not a game. Calendars carry fixtures, never results.
 */

export type ScheduleVerdict =
  | { ok: true; rows: ScheduleRow[]; skipped: number }
  | { ok: false; reason: string };

const unfold = (text: string): string => text.replace(/\r?\n[ \t]/g, '');

const field = (body: string, key: string): string => {
  const m = body.match(new RegExp(`^${key}[^:\\r\\n]*:(.*)$`, 'm'));
  return m
    ? m[1].trim().replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ').trim()
    : '';
};

const clock = (hh: number, mm: number): string =>
  `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;

/**
 * A DTSTART value as an Ohio fan reads it. A zoned or floating stamp is the
 * wall clock the school typed, printed as is. A UTC stamp is moved to Eastern,
 * because a 7pm Friday game is midnight Saturday in UTC.
 */
export function readStart(value: string): { date: string; time?: string } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, z] = m;
  if (!hh) return { date: `${y}-${mo}-${d}` };
  if (!z) return { date: `${y}-${mo}-${d}`, time: clock(+hh, +mm) };

  const at = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: clock(+parts.hour, +parts.minute) };
}

const EVENTLINK = /^.+?\([^)]*\)\s*([-@])\s*(.+)$/;
// Eventlink puts banquets and picture days in the same feed, titled the same
// way; a real fixture names a school.
const NAMES_A_SCHOOL = /\b(high\s+school|hs|academy|college|school)\b/i;
const PLAIN = /(?:^|\s)(vs\.?|versus|at|@)\s+(.+)$/i;

export function readOpponent(summary: string): { opponent: string; home: boolean } | null {
  const el = summary.match(EVENTLINK);
  if (el) {
    if (!NAMES_A_SCHOOL.test(el[2])) return null;
    return { opponent: tidyOpponent(el[2]), home: el[1] === '-' };
  }

  if (summary.includes('|')) {
    const [matchup = '', , venue = ''] = summary.split('|').map((s) => s.trim());
    const sides = matchup.split(/\s+(?:vs\.?|at|@)\s+/i);
    if (sides.length < 2) return null;
    return { opponent: tidyOpponent(sides[1]), home: /^home/i.test(venue) };
  }

  const plain = summary.match(PLAIN);
  if (!plain) return null;
  const opponent = tidyOpponent(plain[2]);
  return opponent ? { opponent, home: !/^(at|@)$/i.test(plain[1]) } : null;
}

export function calendarToSchedule(
  text: string,
  opts: { filter: string | null; seasonYear: number },
): ScheduleVerdict {
  const from = `${opts.seasonYear}-08-01`;
  const to = `${opts.seasonYear + 1}-07-31`;
  const season = `${opts.seasonYear}–${String((opts.seasonYear + 1) % 100).padStart(2, '0')}`;
  const filter = opts.filter?.trim() || null;
  const needle = filter?.toLowerCase() ?? null;

  const rows: ScheduleRow[] = [];
  let considered = 0;
  let skipped = 0;

  for (const chunk of unfold(text).split('BEGIN:VEVENT').slice(1)) {
    const body = chunk.split('END:VEVENT')[0];
    const summary = field(body, 'SUMMARY');

    if (needle) {
      const hay = `${summary} ${field(body, 'CATEGORIES')} ${field(body, 'DESCRIPTION')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    if (/^STATUS:CANCELLED/im.test(body)) continue;

    const dt = body.match(/^DTSTART[^:\r\n]*:(\S+)/m);
    const start = dt ? readStart(dt[1]) : null;
    if (!start || start.date < from || start.date > to) continue;

    considered += 1;
    const who = readOpponent(summary);
    if (!who) {
      skipped += 1;
      continue;
    }
    rows.push({
      date: start.date,
      opponent: who.opponent,
      home: who.home,
      ...(start.time ? { time: start.time } : {}),
    });
  }

  if (considered === 0) {
    return {
      ok: false,
      reason: filter
        ? `no ${season} events match “${filter}” — check the filter`
        : `the calendar has no ${season} events`,
    };
  }
  if (skipped * 2 > considered) {
    return { ok: false, reason: `${skipped} of ${considered} events don’t name an opponent` };
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, rows, skipped };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sync/calendar.test.ts && npx tsc --noEmit`
Expected: PASS. If an Eventlink count differs from the pinned 22/10/21/1, do not edit the number to match: print the rows, find which rule disagrees with the spec, and fix the rule (the pins were counted independently from the raw capture).

- [ ] **Step 6: Commit**

```bash
git add src/sync/calendar.ts src/sync/calendar.test.ts src/sync/fixtures/eventlink-poland-2026.ics
git commit -m "Read any sport's games out of a school's calendar, pinned to the real Eventlink capture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: When to email, and what it says

**Files:**
- Create: `src/sync/alert.ts`, `src/sync/alert.test.ts`

**Interfaces:**
- Consumes: `SideState`, `SourceSide` from `src/sync/types.ts`.
- Produces: `type Outcome = { kind: 'ok'; changed: boolean } | { kind: 'problem'; reason: string }`, `type Email = { kind: 'problem'; reason: string } | { kind: 'recovered' }`, `nextSide(prev: SideState | undefined, outcome: Outcome, now: string): { state: SideState; email: Email | null }`, `emailFor(t: { slug: string; sport: string }, side: SourceSide, email: Email, state: SideState): { subject: string; text: string }`, `stamp(iso: string): string`.

- [ ] **Step 1: Write the failing tests**

`src/sync/alert.test.ts`:

```ts
import { emailFor, nextSide, stamp } from './alert';
import type { SideState } from './types';

const T0 = '2026-09-30T20:15:00.000Z';
const T1 = '2026-09-30T20:30:00.000Z';
const T2 = '2026-09-30T20:45:00.000Z';

const healthy: SideState = { ok_at: T0, problem: null, problem_since: null, alerted: false, changed_at: T0 };

describe('nextSide', () => {
  it('records a first success, and nothing is emailed', () => {
    expect(nextSide(undefined, { kind: 'ok', changed: true }, T0)).toEqual({
      state: { ok_at: T0, problem: null, problem_since: null, alerted: false, changed_at: T0 },
      email: null,
    });
  });

  it('keeps changed_at when nothing changed', () => {
    expect(nextSide(healthy, { kind: 'ok', changed: false }, T1).state.changed_at).toBe(T0);
  });

  it('emails on the first failure', () => {
    expect(nextSide(healthy, { kind: 'problem', reason: 'r' }, T1)).toEqual({
      state: { ok_at: T0, problem: 'r', problem_since: T1, alerted: false, changed_at: T0 },
      email: { kind: 'problem', reason: 'r' },
    });
  });

  it('stays quiet while the same problem persists and has been emailed', () => {
    const failing: SideState = { ...healthy, problem: 'r', problem_since: T1, alerted: true };
    expect(nextSide(failing, { kind: 'problem', reason: 'r' }, T2)).toEqual({ state: failing, email: null });
  });

  it('tries again when the last email didn’t go out', () => {
    const unsent: SideState = { ...healthy, problem: 'r', problem_since: T1, alerted: false };
    expect(nextSide(unsent, { kind: 'problem', reason: 'r' }, T2).email).toEqual({ kind: 'problem', reason: 'r' });
  });

  it('emails again when the reason changes, keeping when the trouble began', () => {
    const failing: SideState = { ...healthy, problem: 'r', problem_since: T1, alerted: true };
    expect(nextSide(failing, { kind: 'problem', reason: 's' }, T2)).toEqual({
      state: { ...failing, problem: 's', alerted: false },
      email: { kind: 'problem', reason: 's' },
    });
  });

  it('emails on recovery only if the problem was emailed', () => {
    const emailed: SideState = { ...healthy, problem: 'r', problem_since: T1, alerted: true };
    expect(nextSide(emailed, { kind: 'ok', changed: false }, T2).email).toEqual({ kind: 'recovered' });
    const unsent: SideState = { ...emailed, alerted: false };
    expect(nextSide(unsent, { kind: 'ok', changed: false }, T2).email).toBeNull();
  });
});

describe('stamp', () => {
  it('prints Eastern time with plain spaces', () => {
    expect(stamp(T0)).toBe('Sep 30, 4:15 PM');
  });
});

describe('emailFor', () => {
  const t = { slug: 'springfield-new-middletown', sport: 'volleyball' };

  it('says what was refused and what fans still see', () => {
    const state: SideState = { ...healthy, problem: 'r', problem_since: T1 };
    expect(emailFor(t, 'roster', { kind: 'problem', reason: 'a row is missing a number or a name (“Mia”)' }, state)).toEqual({
      subject: 'Sync refused: springfield-new-middletown volleyball roster',
      text:
        'springfield-new-middletown volleyball roster: sync refused — a row is missing a number or a name (“Mia”).\n\n' +
        'Fans still see the roster from Sep 30, 4:15 PM.\n\n' +
        'https://roster.scottforge.ai/oh/?manage',
    });
  });

  it('says so when nothing has ever synced from the link', () => {
    const state: SideState = { ok_at: null, problem: 'r', problem_since: T1, alerted: false, changed_at: null };
    expect(emailFor(t, 'schedule', { kind: 'problem', reason: 'r' }, state).text).toContain(
      'Nothing has synced from this link yet, so fans see the schedule that was there before.',
    );
  });

  it('announces a recovery', () => {
    expect(emailFor(t, 'roster', { kind: 'recovered' }, healthy)).toEqual({
      subject: 'Syncing again: springfield-new-middletown volleyball roster',
      text: 'springfield-new-middletown volleyball roster is syncing again.\n\nhttps://roster.scottforge.ai/oh/?manage',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sync/alert.test.ts`
Expected: FAIL — `Cannot find module './alert'`.

- [ ] **Step 3: Implement**

`src/sync/alert.ts`:

```ts
import type { SideState, SourceSide } from './types';

/*
 * One email when something goes wrong, one when it's fixed, and silence in
 * between. The job runs every fifteen minutes; an email per run would be
 * ninety-six a day about one coach's typo.
 */

export type Outcome = { kind: 'ok'; changed: boolean } | { kind: 'problem'; reason: string };
export type Email = { kind: 'problem'; reason: string } | { kind: 'recovered' };

export function nextSide(
  prev: SideState | undefined,
  outcome: Outcome,
  now: string,
): { state: SideState; email: Email | null } {
  if (outcome.kind === 'ok') {
    return {
      state: {
        ok_at: now,
        problem: null,
        problem_since: null,
        alerted: false,
        changed_at: outcome.changed ? now : prev?.changed_at ?? null,
      },
      email: prev?.problem && prev.alerted ? { kind: 'recovered' } : null,
    };
  }

  const same = prev?.problem === outcome.reason;
  const state: SideState = {
    ok_at: prev?.ok_at ?? null,
    problem: outcome.reason,
    problem_since: prev?.problem ? prev.problem_since : now,
    // A send that failed leaves alerted false, so the next run tries again.
    alerted: same ? Boolean(prev?.alerted) : false,
    changed_at: prev?.changed_at ?? null,
  };
  return { state, email: state.alerted ? null : { kind: 'problem', reason: outcome.reason } };
}

/** "Sep 30, 4:15 PM". ICU puts a narrow no-break space before PM; mail clients don't need it. */
export const stamp = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(/[  ]/g, ' ');

const PANEL = 'https://roster.scottforge.ai/oh/?manage';

export function emailFor(
  t: { slug: string; sport: string },
  side: SourceSide,
  email: Email,
  state: SideState,
): { subject: string; text: string } {
  const what = `${t.slug} ${t.sport} ${side}`;
  if (email.kind === 'recovered') {
    return { subject: `Syncing again: ${what}`, text: `${what} is syncing again.\n\n${PANEL}` };
  }
  const kept = state.ok_at
    ? `Fans still see the ${side} from ${stamp(state.ok_at)}.`
    : `Nothing has synced from this link yet, so fans see the ${side} that was there before.`;
  return {
    subject: `Sync refused: ${what}`,
    text: `${what}: sync refused — ${email.reason}.\n\n${kept}\n\n${PANEL}`,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sync/alert.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync/alert.ts src/sync/alert.test.ts
git commit -m "Email the seller once when a sync is refused and once when it recovers, never every fifteen minutes in between

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: One sync, and the bundle the function runs

**Files:**
- Create: `src/sync/run.ts`, `src/sync/run.test.ts`, `src/sync/core.ts`, `vite.sync.config.ts`, `src/sync/bundle.test.ts`, `supabase/functions/sync-sources/lib/core.js` (generated)
- Modify: `package.json` (script), `tsconfig.json` (include)

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces:
  - `syncTarget(t: Target, fetchText: FetchText, now: string): Promise<SyncResult>` where `type SyncResult = { players: Player[] | null; schedule: ScheduleRow[] | null; state: SyncState; emails: { side: SourceSide; email: Email }[] }`. `players`/`schedule` are non-null only when accepted **and** different from what is stored.
  - `previewSource(req: { kind: SourceSide; url: string; filter: string | null; season: number }, fetchText: FetchText): Promise<Preview>` where `type Preview = { ok: true; players?: Player[]; rows?: ScheduleRow[]; warnings: string[]; skipped: number } | { ok: false; reason: string }`.
  - `src/sync/core.ts` re-exports `syncTarget`, `previewSource`, `emailFor` (what `index.ts` imports from `./lib/core.js`).

- [ ] **Step 1: Write the failing tests**

`src/sync/run.test.ts`:

```ts
import type { Player } from '../types';
import { previewSource, syncTarget } from './run';
import type { Fetched, Target } from './types';

const NOW = '2026-09-30T20:15:00.000Z';

const answering = (byUrl: Record<string, Fetched>) => async (url: string): Promise<Fetched> =>
  byUrl[url] ?? { ok: false, reason: 'HTTP 404' };

const csv = (text: string): Fetched => ({ ok: true, text, contentType: 'text/csv' });
const ics = (text: string): Fetched => ({ ok: true, text, contentType: 'text/calendar' });

const SHEET = 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv';
const CAL = 'https://example.test/cal.ics';

const target = (over: Partial<Target> = {}): Target => ({
  slug: 'springfield-new-middletown',
  sport: 'volleyball',
  season: 2026,
  roster_source_url: SHEET,
  schedule_source_url: null,
  schedule_source_filter: null,
  sync_state: {},
  players: [],
  schedule: null,
  ...over,
});

const ROSTER = '#,Name\n1,Ava Carter\n2,Mia Lopez\n';
const GAME = 'BEGIN:VEVENT\r\nSUMMARY:Girls Volleyball vs Canfield\r\nDTSTART:20260910T170000\r\nEND:VEVENT';

describe('syncTarget — roster', () => {
  it('writes a new roster and records the success', async () => {
    const r = await syncTarget(target(), answering({ [SHEET]: csv(ROSTER) }), NOW);
    expect(r.players?.map((p) => p.lastName)).toEqual(['Carter', 'Lopez']);
    expect(r.state.roster).toEqual({ ok_at: NOW, problem: null, problem_since: null, alerted: false, changed_at: NOW });
    expect(r.emails).toEqual([]);
    expect(r.schedule).toBeNull();
  });

  it('writes nothing when the sheet hasn’t changed', async () => {
    const first = await syncTarget(target(), answering({ [SHEET]: csv(ROSTER) }), NOW);
    const again = await syncTarget(
      target({ players: first.players as Player[], sync_state: first.state }),
      answering({ [SHEET]: csv(ROSTER) }),
      NOW,
    );
    expect(again.players).toBeNull();
    expect(again.state.roster?.ok_at).toBe(NOW);
  });

  it('refuses a sheet that answers with a web page (not published)', async () => {
    const r = await syncTarget(
      target(),
      answering({ [SHEET]: { ok: true, text: '<!DOCTYPE html><html>', contentType: 'text/html; charset=utf-8' } }),
      NOW,
    );
    expect(r.players).toBeNull();
    expect(r.state.roster?.problem).toBe(
      'the link opens a web page, not a sheet — publish the roster tab to the web as CSV',
    );
    expect(r.emails).toEqual([{ side: 'roster', email: { kind: 'problem', reason: r.state.roster?.problem } }]);
  });

  it('records a dead link as a problem', async () => {
    const r = await syncTarget(target(), answering({}), NOW);
    expect(r.state.roster?.problem).toBe('the sheet didn’t answer (HTTP 404)');
  });
});

describe('syncTarget — schedule', () => {
  it('reads a linked calendar for a non-football sport', async () => {
    const r = await syncTarget(
      target({ roster_source_url: null, schedule_source_url: CAL }),
      answering({ [CAL]: ics(GAME) }),
      NOW,
    );
    expect(r.schedule).toEqual([{ date: '2026-09-10', opponent: 'Canfield', home: true, time: '5:00 PM' }]);
    expect(r.state.schedule?.ok_at).toBe(NOW);
    expect(r.state.roster).toBeUndefined();
  });

  it('never touches football’s schedule', async () => {
    let asked = 0;
    const r = await syncTarget(
      target({ sport: 'football', roster_source_url: null, schedule_source_url: CAL }),
      async () => {
        asked += 1;
        return ics(GAME);
      },
      NOW,
    );
    expect(asked).toBe(0);
    expect(r.schedule).toBeNull();
  });

  it('writes nothing when the calendar hasn’t changed, whatever order jsonb stored the keys in', async () => {
    const stored = [JSON.parse('{"time":"5:00 PM","home":true,"date":"2026-09-10","opponent":"Canfield"}')];
    const r = await syncTarget(
      target({ roster_source_url: null, schedule_source_url: CAL, schedule: stored }),
      answering({ [CAL]: ics(GAME) }),
      NOW,
    );
    expect(r.schedule).toBeNull();
  });
});

describe('previewSource', () => {
  it('shows a sheet’s players and warnings without any history', async () => {
    const p = await previewSource(
      { kind: 'roster', url: SHEET, filter: null, season: 2026 },
      answering({ [SHEET]: csv('#,Name\n3,Ava Carter\n3,Mia Lopez\n') }),
    );
    expect(p.ok && p.players?.length).toBe(2);
    expect(p.ok && p.warnings).toEqual(['#3 is worn by 2 players']);
  });

  it('shows a calendar’s games and how many it skipped', async () => {
    const p = await previewSource(
      { kind: 'schedule', url: CAL, filter: null, season: 2026 },
      answering({ [CAL]: ics(GAME) }),
    );
    expect(p).toEqual({
      ok: true,
      rows: [{ date: '2026-09-10', opponent: 'Canfield', home: true, time: '5:00 PM' }],
      warnings: [],
      skipped: 0,
    });
  });

  it('passes a refusal through', async () => {
    expect(await previewSource({ kind: 'schedule', url: CAL, filter: null, season: 2026 }, answering({}))).toEqual({
      ok: false,
      reason: 'the link didn’t answer (HTTP 404)',
    });
  });
});
```

`src/sync/bundle.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { build, type Rolldown } from 'vite';

/*
 * The Edge Function runs a committed bundle of src/sync, because Deno can't
 * resolve this repo's extensionless imports. A bundle that wasn't rebuilt
 * after a change here would run yesterday's rules in production while every
 * test passed — so the test rebuilds it in memory and compares.
 */
it('supabase/functions/sync-sources/lib/core.js is built from the current src/sync', async () => {
  const out = await build({ configFile: 'vite.sync.config.ts', logLevel: 'silent', build: { write: false } });
  const result = (Array.isArray(out) ? out[0] : out) as Rolldown.RolldownOutput;
  const fresh = result.output[0].type === 'chunk' ? result.output[0].code : '';
  const committed = readFileSync('supabase/functions/sync-sources/lib/core.js', 'utf8');
  expect(committed.replace(/\r\n/g, '\n')).toBe(fresh.replace(/\r\n/g, '\n'));
}, 60_000);
```

(If `Rolldown` is not exported from `vite` in the installed version, type the result as `{ output: { type: string; code?: string }[] }` instead and read `output[0].code ?? ''`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sync/run.test.ts src/sync/bundle.test.ts`
Expected: FAIL — `Cannot find module './run'` and a missing config/bundle.

- [ ] **Step 3: Implement `run.ts` and `core.ts`**

`src/sync/run.ts`:

```ts
import type { ScheduleRow } from '../oh/scheduleParse';
import type { Player } from '../types';
import { nextSide, type Email, type Outcome } from './alert';
import { calendarToSchedule } from './calendar';
import { canon } from './canon';
import { checkRoster, sameRoster } from './rosterCheck';
import type { Fetched, FetchText, SourceSide, SyncState, Target } from './types';

/*
 * One activation's sync, with the network handed in. The Edge Function passes
 * a real fetch with a timeout and a size cap; the tests pass a table. Nothing
 * here writes anywhere — the caller sends `players`, `schedule` and `state` to
 * school_roster_sync_apply, which is the only thing that can.
 */

export type SyncResult = {
  /** Non-null only when the sheet passed and differs from what fans see. */
  players: Player[] | null;
  schedule: ScheduleRow[] | null;
  state: SyncState;
  emails: { side: SourceSide; email: Email }[];
};

export type Preview =
  | { ok: true; players?: Player[]; rows?: ScheduleRow[]; warnings: string[]; skipped: number }
  | { ok: false; reason: string };

// A sheet that isn't published answers 200 with Google's sign-in page; a
// calendar page copied from the browser's address bar does the same.
const isWebPage = (f: Extract<Fetched, { ok: true }>): boolean =>
  /text\/html/i.test(f.contentType) || /^\s*<(!doctype|html)/i.test(f.text);

const NOT_A_SHEET = 'the link opens a web page, not a sheet — publish the roster tab to the web as CSV';
const NOT_A_CALENDAR = 'the link opens a web page, not a calendar — copy the calendar’s iCal or subscribe link';

async function rosterOutcome(t: Target, fetchText: FetchText): Promise<{ outcome: Outcome; players: Player[] | null }> {
  const got = await fetchText(t.roster_source_url as string);
  if (!got.ok) return { outcome: { kind: 'problem', reason: `the sheet didn’t answer (${got.reason})` }, players: null };
  if (isWebPage(got)) return { outcome: { kind: 'problem', reason: NOT_A_SHEET }, players: null };
  const v = checkRoster(got.text, t.players.length);
  if (!v.ok) return { outcome: { kind: 'problem', reason: v.reason }, players: null };
  const changed = !sameRoster(t.players, v.players);
  return { outcome: { kind: 'ok', changed }, players: changed ? v.players : null };
}

async function scheduleOutcome(
  t: Target,
  fetchText: FetchText,
): Promise<{ outcome: Outcome; schedule: ScheduleRow[] | null }> {
  const got = await fetchText(t.schedule_source_url as string);
  if (!got.ok) return { outcome: { kind: 'problem', reason: `the calendar didn’t answer (${got.reason})` }, schedule: null };
  if (isWebPage(got)) return { outcome: { kind: 'problem', reason: NOT_A_CALENDAR }, schedule: null };
  const v = calendarToSchedule(got.text, { filter: t.schedule_source_filter, seasonYear: t.season });
  if (!v.ok) return { outcome: { kind: 'problem', reason: v.reason }, schedule: null };
  const changed = !t.schedule || canon(t.schedule) !== canon(v.rows);
  return { outcome: { kind: 'ok', changed }, schedule: changed ? v.rows : null };
}

export async function syncTarget(t: Target, fetchText: FetchText, now: string): Promise<SyncResult> {
  const state: SyncState = { ...t.sync_state };
  const emails: SyncResult['emails'] = [];
  let players: Player[] | null = null;
  let schedule: ScheduleRow[] | null = null;

  if (t.roster_source_url) {
    const r = await rosterOutcome(t, fetchText);
    const next = nextSide(t.sync_state.roster, r.outcome, now);
    state.roster = next.state;
    players = r.players;
    if (next.email) emails.push({ side: 'roster', email: next.email });
  }

  // Football's schedule is the directory's; the database refuses to store a
  // calendar link for it, and this refuses to read one that got there anyway.
  if (t.schedule_source_url && t.sport !== 'football') {
    const s = await scheduleOutcome(t, fetchText);
    const next = nextSide(t.sync_state.schedule, s.outcome, now);
    state.schedule = next.state;
    schedule = s.schedule;
    if (next.email) emails.push({ side: 'schedule', email: next.email });
  }

  return { players, schedule, state, emails };
}

/** The panel's Check link: the same reading, no history, nothing written. */
export async function previewSource(
  req: { kind: SourceSide; url: string; filter: string | null; season: number },
  fetchText: FetchText,
): Promise<Preview> {
  const got = await fetchText(req.url);
  if (!got.ok) return { ok: false, reason: `the link didn’t answer (${got.reason})` };
  if (req.kind === 'roster') {
    if (isWebPage(got)) return { ok: false, reason: NOT_A_SHEET };
    const v = checkRoster(got.text, 0);
    return v.ok ? { ok: true, players: v.players, warnings: v.warnings, skipped: 0 } : v;
  }
  if (isWebPage(got)) return { ok: false, reason: NOT_A_CALENDAR };
  const v = calendarToSchedule(got.text, { filter: req.filter, seasonYear: req.season });
  return v.ok ? { ok: true, rows: v.rows, warnings: [], skipped: v.skipped } : v;
}
```

`src/sync/core.ts`:

```ts
/*
 * Everything the sync-sources Edge Function imports, bundled by
 * vite.sync.config.ts into supabase/functions/sync-sources/lib/core.js.
 * After any change under src/sync, run `npm run build:sync` and commit the
 * bundle; src/sync/bundle.test.ts fails until you do.
 */
export { emailFor } from './alert';
export { previewSource, syncTarget } from './run';
export type { Preview, SyncResult } from './run';
export type { SyncState, Target } from './types';
```

- [ ] **Step 4: Add the bundle config, the script, and build it**

`vite.sync.config.ts`:

```ts
import { defineConfig } from 'vite';

/**
 * src/sync bundled for the sync-sources Edge Function.
 *
 * Deno can't follow this repo's extensionless imports, so the pure sync code
 * is bundled into one plain ES module the function imports. Unminified, so a
 * stack trace in the Supabase logs points at readable code. publicDir is off
 * or the build would copy all of public/ — seven hundred school files — next
 * to it.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'supabase/functions/sync-sources/lib',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    lib: {
      entry: 'src/sync/core.ts',
      formats: ['es'],
      fileName: () => 'core.js',
    },
  },
});
```

`package.json` — add to `scripts`:

```json
"build:sync": "vite build --config vite.sync.config.ts",
```

`tsconfig.json` — change `include` to:

```json
"include": ["src", "vite.config.ts", "vite.oh.config.ts", "vite.sync.config.ts"]
```

Run: `npm run build:sync`
Expected: writes `supabase/functions/sync-sources/lib/core.js` and nothing else in that folder. Open it and confirm it contains `syncTarget`, `previewSource`, `emailFor` and no `import` statements.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sync && npx tsc --noEmit`
Expected: PASS, including the bundle test.

- [ ] **Step 6: Commit**

```bash
git add src/sync/run.ts src/sync/run.test.ts src/sync/core.ts src/sync/bundle.test.ts vite.sync.config.ts package.json tsconfig.json supabase/functions/sync-sources/lib/core.js
git commit -m "Run one activation's sync with the network handed in, and bundle it for the Edge Function with a test that catches a stale bundle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Edge Function and its schedule

**Files:**
- Create: `supabase/functions/sync-sources/index.ts`, `supabase/cron/sync-sources.sql`

**Interfaces:**
- Consumes: `syncTarget`, `previewSource`, `emailFor` from `./lib/core.js`; SQL functions from Task 2.
- Produces (HTTP, `POST {SUPABASE_URL}/functions/v1/sync-sources`):
  - `{action: 'cron'}` with header `x-cron-secret` → `{synced: number, failed: number}`
  - `{action: 'check', kind, url, filter, season}` with the seller's `Authorization: Bearer <session>` and `apikey` → `Preview`
  - `{action: 'sync', slug, sport, season}` (same auth) → `{state: SyncState}`; `404 {error}` when the row has no link
  - Errors: `{error: string}` with 400/401/404/500.

No unit tests: this file is the thin shell around tested code. It is proven in the rollout rehearsal (Task 10).

- [ ] **Step 1: Write the function**

`supabase/functions/sync-sources/index.ts`:

```ts
// Deno. Deployed with --no-verify-jwt: it does its own auth, so it works with
// either kind of Supabase API key. The cron call proves itself with a shared
// secret; a panel call carries the seller's session, which the database
// checks.
import { emailFor, previewSource, syncTarget } from './lib/core.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ALERT_TO = Deno.env.get('ALERT_TO') ?? '';
const ALERT_FROM = Deno.env.get('ALERT_FROM') ?? 'Roster alerts <alerts@scottforge.ai>';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;

// The panel runs on the real domain, on Pages previews, and on a dev server.
const PANEL_ORIGIN =
  /^(https:\/\/roster\.scottforge\.ai|https:\/\/([a-z0-9-]+\.)?rosterapp-7zt\.pages\.dev|http:\/\/localhost:\d+)$/;

const cors = (origin: string | null): Record<string, string> =>
  origin && PANEL_ORIGIN.test(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
      }
    : {};

const json = (body: unknown, status: number, origin: string | null): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });

// A new-style secret key (sb_secret_…) is not a JWT and goes in apikey alone.
const serviceHeaders = (): Record<string, string> =>
  SERVICE_KEY.startsWith('sb_')
    ? { apikey: SERVICE_KEY }
    : { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rpc(fn: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} answered ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function isSeller(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  try {
    const apikey = req.headers.get('apikey') ?? ANON_KEY;
    return (await rpc('school_admin_check', {}, { apikey, Authorization: auth })) === true;
  } catch {
    return false;
  }
}

async function fetchText(url: string) {
  if (!/^https:\/\//i.test(url)) return { ok: false as const, reason: 'not an https link' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'roster.scottforge.ai sync' },
    });
    if (!res.ok) return { ok: false as const, reason: `HTTP ${res.status}` };
    const reader = res.body?.getReader();
    if (!reader) return { ok: false as const, reason: 'an empty answer' };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        ctl.abort();
        return { ok: false as const, reason: 'larger than 1 MB' };
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.length;
    }
    return {
      ok: true as const,
      text: new TextDecoder().decode(all),
      contentType: res.headers.get('content-type') ?? '',
    };
  } catch (e) {
    const err = e as Error;
    return { ok: false as const, reason: err.name === 'AbortError' ? 'no answer in 10 seconds' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail(subject: string, text: string): Promise<boolean> {
  if (!RESEND_API_KEY || !ALERT_TO) {
    console.log('email not configured; would have sent:', subject);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_TO], subject, text }),
  });
  if (!res.ok) console.error('resend', res.status, await res.text());
  return res.ok;
}

async function runOne(t: any) {
  const result = await syncTarget(t, fetchText, new Date().toISOString());
  for (const { side, email } of result.emails) {
    const sideState = result.state[side as 'roster' | 'schedule']!;
    const { subject, text } = emailFor(t, side, email, sideState);
    const sent = await sendEmail(subject, text);
    if (sent && email.kind === 'problem') result.state[side as 'roster' | 'schedule'] = { ...sideState, alerted: true };
  }
  await rpc(
    'school_roster_sync_apply',
    {
      p_slug: t.slug,
      p_sport: t.sport,
      p_season: t.season,
      p_players: result.players,
      p_schedule: result.schedule,
      p_sync_state: result.state,
    },
    serviceHeaders(),
  );
  return result.state;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, origin);
  const body = await req.json().catch(() => ({}));

  if (body.action === 'cron') {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
      return json({ error: 'not allowed' }, 401, origin);
    }
    const targets = (await rpc('school_roster_sync_targets', {}, serviceHeaders())) ?? [];
    let failed = 0;
    // One at a time, each in its own try: one school's broken link or
    // refused write never stops the others.
    for (const t of targets) {
      try {
        await runOne(t);
      } catch (e) {
        failed += 1;
        console.error('sync failed', t.slug, t.sport, t.season, e);
      }
    }
    return json({ synced: targets.length - failed, failed }, 200, origin);
  }

  if (!(await isSeller(req))) return json({ error: 'Sign in as the seller to do that.' }, 401, origin);

  if (body.action === 'check') {
    if (body.kind !== 'roster' && body.kind !== 'schedule') return json({ error: 'kind must be roster or schedule' }, 400, origin);
    const preview = await previewSource(
      { kind: body.kind, url: String(body.url ?? ''), filter: body.filter ?? null, season: Number(body.season) },
      fetchText,
    );
    return json(preview, 200, origin);
  }

  if (body.action === 'sync') {
    const targets = (await rpc('school_roster_sync_targets', {}, serviceHeaders())) ?? [];
    const t = targets.find(
      (x: any) => x.slug === body.slug && x.sport === body.sport && x.season === Number(body.season),
    );
    if (!t) return json({ error: 'That activation has no linked sheet or calendar.' }, 404, origin);
    try {
      return json({ state: await runOne(t) }, 200, origin);
    } catch (e) {
      return json({ error: `The database refused the sync: ${(e as Error).message}` }, 500, origin);
    }
  }

  return json({ error: 'unknown action' }, 400, origin);
});
```

- [ ] **Step 2: Write the schedule SQL**

`supabase/cron/sync-sources.sql`:

```sql
-- Runs the sync-sources Edge Function every fifteen minutes. Applied by hand,
-- once, in the dashboard SQL editor — after the function is deployed and its
-- CRON_SECRET is set. Not a numbered migration: it names this project's URL
-- and a secret, and the repo is public.
--
-- Before running: Database → Extensions → enable pg_cron and pg_net.
-- Replace the two values in angle brackets. The secret must equal the
-- function's CRON_SECRET (supabase secrets set CRON_SECRET=...).

select vault.create_secret('<the same value as CRON_SECRET>', 'sync_sources_cron_secret');

select cron.schedule(
  'sync-sources',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/sync-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_sources_cron_secret')
    ),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- To stop it:   select cron.unschedule('sync-sources');
-- To see runs:  select * from cron.job_run_details order by start_time desc limit 20;
```

- [ ] **Step 3: Check what can be checked locally**

Run: `npx vitest run && npx tsc --noEmit`
Expected: still green (the function is outside `tsconfig`'s include and outside vitest's). If `deno` is installed (`deno --version`), also run `deno check supabase/functions/sync-sources/index.ts` and fix anything it reports; if not, say so in the report — the rehearsal in Task 10 is the real proof.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sync-sources/index.ts supabase/cron/sync-sources.sql
git commit -m "Add the sync-sources function: every fifteen minutes it fetches each linked sheet and calendar, writes what passes and emails about what doesn't

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The panel's data layer

**Files:**
- Modify: `src/oh/manage/adminApi.ts`
- Create: `src/oh/manage/sources.ts`, `src/oh/manage/sources.test.ts`, `src/oh/manage/adminApi.test.ts`

**Interfaces:**
- Consumes: `SyncState`, `SideState`, `SourceSide` from `src/sync/types.ts`; `Preview` from `src/sync/run.ts` (type-only imports); `rpc`, `supaBase`, `supaKey` from `src/oh/supa.ts`; `freshToken` from `src/oh/adminAuth.ts`.
- Produces:
  - `RosterRow` gains optional `roster_source_url?: string | null`, `schedule_source_url?: string | null`, `schedule_source_filter?: string | null`, `sync_state?: SyncState` (optional: a database without 0008 doesn't send them).
  - `setSources(r: { slug: string; sport: string; season: number; rosterUrl: string | null; scheduleUrl: string | null; scheduleFilter: string | null }): Promise<void>`
  - `checkSource(r: { kind: SourceSide; url: string; filter: string | null; season: number }): Promise<Preview>`
  - `syncNow(slug: string, sport: string, season: number): Promise<{ state: SyncState }>`
  - `sources.ts`: `sheetLinkProblem(url): string | null`, `calendarUrl(raw): string`, `calendarLinkProblem(url): string | null`, `when(iso): string`, `ago(iso, now: Date): string`, `sideLine(side: SideState | undefined, now: Date): string`, `rowProblems(row: { sport: string; sync_state?: SyncState }): string[]`.

- [ ] **Step 1: Write the failing tests**

`src/oh/manage/sources.test.ts`:

```ts
import type { SideState } from '../../sync/types';
import { ago, calendarLinkProblem, calendarUrl, rowProblems, sheetLinkProblem, sideLine, when } from './sources';

const PUBLISHED = 'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=0&single=true&output=csv';

describe('sheetLinkProblem', () => {
  it('accepts a published CSV link', () => {
    expect(sheetLinkProblem(PUBLISHED)).toBeNull();
  });
  it('explains the editing link', () => {
    expect(sheetLinkProblem('https://docs.google.com/spreadsheets/d/abc/edit#gid=0')).toBe(
      'That’s the sheet’s editing link. Publish it instead: File → Share → Publish to web → the roster tab → Comma-separated values (.csv), and paste that link.',
    );
  });
  it('refuses anything that isn’t a Google Sheet', () => {
    expect(sheetLinkProblem('https://example.com/roster.csv')).toBe(
      'A roster link has to be a Google Sheet (https://docs.google.com/spreadsheets/…).',
    );
  });
});

describe('calendar links', () => {
  it('turns webcal into https', () => {
    expect(calendarUrl('  webcal://example.test/cal.ics ')).toBe('https://example.test/cal.ics');
    expect(calendarUrl('webcals://example.test/cal.ics')).toBe('https://example.test/cal.ics');
  });
  it('wants https after that', () => {
    expect(calendarLinkProblem('https://example.test/cal.ics')).toBeNull();
    expect(calendarLinkProblem('http://example.test/cal.ics')).toBe('A calendar link has to start with https:// or webcal://.');
  });
});

describe('status wording', () => {
  const now = new Date('2026-09-30T20:21:00.000Z');
  const ok: SideState = { ok_at: '2026-09-30T20:15:00.000Z', problem: null, problem_since: null, alerted: false, changed_at: null };

  it('says how long ago', () => {
    expect(ago('2026-09-30T20:20:40.000Z', now)).toBe('just now');
    expect(ago('2026-09-30T20:15:00.000Z', now)).toBe('6 min ago');
    expect(ago('2026-09-30T17:15:00.000Z', now)).toBe('3 h ago');
    expect(ago('2026-09-28T17:15:00.000Z', now)).toBe(`on ${when('2026-09-28T17:15:00.000Z')}`);
  });

  it('prints Eastern weekday and time', () => {
    expect(when('2026-09-29T22:40:00.000Z')).toBe('Tue 6:40 PM');
  });

  it('describes a side', () => {
    expect(sideLine(undefined, now)).toBe('not synced yet');
    expect(sideLine(ok, now)).toBe('synced 6 min ago');
    expect(sideLine({ ...ok, problem: 'r', problem_since: '2026-09-29T22:40:00.000Z' }, now)).toBe(
      '⚠ r — since Tue 6:40 PM',
    );
  });

  it('lists a row’s open problems for the school list', () => {
    expect(rowProblems({ sport: 'volleyball' })).toEqual([]);
    expect(
      rowProblems({
        sport: 'volleyball',
        sync_state: { roster: { ...ok, problem: 'r', problem_since: '2026-09-29T22:40:00.000Z' }, schedule: ok },
      }),
    ).toEqual(['⚠ Volleyball roster: r, since Tue 6:40 PM']);
  });
});
```

`src/oh/manage/adminApi.test.ts`:

```ts
import { vi } from 'vitest';

vi.mock('../supa', () => ({
  rpc: vi.fn(async () => null),
  supaBase: 'https://db.test',
  supaKey: 'anon-key',
  supaAvailable: true,
}));
vi.mock('../adminAuth', () => ({ freshToken: vi.fn(async () => 'session-token') }));

import { rpc } from '../supa';
import { checkSource, setSources, syncNow } from './adminApi';

describe('setSources', () => {
  it('signs the call and sends every argument by name', async () => {
    await setSources({
      slug: 's', sport: 'volleyball', season: 2026,
      rosterUrl: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv', scheduleUrl: null, scheduleFilter: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      'school_roster_set_sources',
      {
        p_slug: 's', p_sport: 'volleyball', p_season: 2026,
        p_roster_url: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv',
        p_schedule_url: null, p_schedule_filter: null,
      },
      'session-token',
    );
  });
});

describe('the sync function', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts a check with the seller’s session', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, reason: 'r' }), { status: 200 }));
    const out = await checkSource({ kind: 'roster', url: 'u', filter: null, season: 2026 });
    expect(out).toEqual({ ok: false, reason: 'r' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://db.test/functions/v1/sync-sources');
    expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer session-token' });
    expect(JSON.parse(init.body)).toEqual({ action: 'check', kind: 'roster', url: 'u', filter: null, season: 2026 });
  });

  it('turns an error answer into a thrown message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'That activation has no linked sheet or calendar.' }), { status: 404 }));
    await expect(syncNow('s', 'volleyball', 2026)).rejects.toThrow('That activation has no linked sheet or calendar.');
  });
});
```

(Stubbing global `fetch` here is for the Edge Function call, which is not Supabase's `rpc`; `./supa` itself is mocked as the constraints require.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/oh/manage/sources.test.ts src/oh/manage/adminApi.test.ts`
Expected: FAIL — `./sources` missing; `setSources`/`checkSource`/`syncNow` not exported.

- [ ] **Step 3: Implement**

`src/oh/manage/sources.ts`:

```ts
import type { SideState, SyncState } from '../../sync/types';

/*
 * What the panel says about a link before it is saved, and about a sync
 * after. The database checks the same rules again; these exist so the seller
 * reads the reason in plain words before pressing anything.
 */

const SHEET = /^https:\/\/docs\.google\.com\/spreadsheets\//;

export function sheetLinkProblem(url: string): string | null {
  if (!SHEET.test(url)) return 'A roster link has to be a Google Sheet (https://docs.google.com/spreadsheets/…).';
  // The address-bar link answers with Google's sign-in page, not the rows.
  if (!/output=csv/.test(url)) {
    return 'That’s the sheet’s editing link. Publish it instead: File → Share → Publish to web → the roster tab → Comma-separated values (.csv), and paste that link.';
  }
  return null;
}

export const calendarUrl = (raw: string): string => raw.trim().replace(/^webcals?:\/\//i, 'https://');

export const calendarLinkProblem = (url: string): string | null =>
  /^https:\/\/\S+$/i.test(url) ? null : 'A calendar link has to start with https:// or webcal://.';

export const when = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(/[  ]/g, ' ');

export function ago(iso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `on ${when(iso)}`;
}

export function sideLine(side: SideState | undefined, now: Date): string {
  if (!side) return 'not synced yet';
  if (side.problem) return `⚠ ${side.problem}${side.problem_since ? ` — since ${when(side.problem_since)}` : ''}`;
  return side.ok_at ? `synced ${ago(side.ok_at, now)}` : 'not synced yet';
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function rowProblems(row: { sport: string; sync_state?: SyncState }): string[] {
  const out: string[] = [];
  for (const side of ['roster', 'schedule'] as const) {
    const s = row.sync_state?.[side];
    if (s?.problem) {
      out.push(`⚠ ${capital(row.sport)} ${side}: ${s.problem}${s.problem_since ? `, since ${when(s.problem_since)}` : ''}`);
    }
  }
  return out;
}
```

`src/oh/manage/adminApi.ts` — add imports and extend:

```ts
import { freshToken } from '../adminAuth';
import { rpc, supaBase, supaKey } from '../supa';
import type { ScheduleRow } from '../scheduleParse';
import type { Preview } from '../../sync/run';
import type { SourceSide, SyncState } from '../../sync/types';
```

Add to `RosterRow` (after `updated_at`):

```ts
  /** Set by migration 0008; absent from a database that doesn't have it yet. */
  roster_source_url?: string | null;
  schedule_source_url?: string | null;
  schedule_source_filter?: string | null;
  sync_state?: SyncState;
```

Append:

```ts
export const setSources = async (r: {
  slug: string;
  sport: string;
  season: number;
  /** null unlinks; the last synced roster stays. */
  rosterUrl: string | null;
  scheduleUrl: string | null;
  scheduleFilter: string | null;
}): Promise<void> => {
  await rpc<null>(
    'school_roster_set_sources',
    {
      p_slug: r.slug,
      p_sport: r.sport,
      p_season: r.season,
      p_roster_url: r.rosterUrl,
      p_schedule_url: r.scheduleUrl,
      p_schedule_filter: r.scheduleFilter,
    },
    await signed(),
  );
};

/*
 * The sync-sources Edge Function, called with the seller's own session. It
 * checks that session against the database before it does anything.
 */
const callSync = async <T>(body: Record<string, unknown>): Promise<T> => {
  const token = await signed();
  const res = await fetch(`${supaBase}/functions/v1/sync-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supaKey ?? '', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const answer = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !answer) throw new Error(answer?.error ?? `The sync service said no (${res.status}).`);
  return answer;
};

export const checkSource = (r: { kind: SourceSide; url: string; filter: string | null; season: number }) =>
  callSync<Preview>({ action: 'check', ...r });

export const syncNow = (slug: string, sport: string, season: number) =>
  callSync<{ state: SyncState }>({ action: 'sync', slug, sport, season });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/oh/manage && npx tsc --noEmit`
Expected: PASS (including the existing `activate.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/oh/manage/adminApi.ts src/oh/manage/adminApi.test.ts src/oh/manage/sources.ts src/oh/manage/sources.test.ts
git commit -m "Let the panel set links, preview them and ask for a sync, and word a sync's state the way a seller reads it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The panel's screens

**Files:**
- Create: `src/oh/manage/Sources.tsx`
- Modify: `src/oh/manage/Activate.tsx`, `src/oh/manage/Manage.tsx`

**Interfaces:**
- Consumes: Task 8; `stripBom` from `src/sync/rosterCheck.ts`.
- Produces: `Sources({ row: RosterRow; onLinked: (l: { roster: boolean; schedule: boolean }) => void })`.

No new CSS: reuse `mg-field`, `search`, `fixture-row is-plain`, `fixture-team`, `fixture-sub`, `filter-line`, `empty-text`, `mg-review`, `mg-review-row`, `mg-skip`, `mg-skip-row` (all already in `src/oh/oh.css`).

- [ ] **Step 1: Write `Sources.tsx`**

```tsx
import { useState } from 'react';
import type { Preview } from '../../sync/run';
import type { SideState, SourceSide, SyncState } from '../../sync/types';
import { checkSource, setSources, syncNow, type RosterRow } from './adminApi';
import { calendarLinkProblem, calendarUrl, sheetLinkProblem, sideLine } from './sources';

type Links = { roster: string | null; schedule: string | null; filter: string | null };

/**
 * Where a saved activation's roster and schedule come from.
 *
 * While a link is set, the sheet or calendar owns that half: the paste boxes
 * above are hidden, and changing it means changing the source or unlinking.
 * Unlinking keeps whatever synced last, so a seller can take a roster back
 * without fans seeing it empty for a moment.
 */
export function Sources({
  row,
  onLinked,
}: {
  row: RosterRow;
  onLinked: (l: { roster: boolean; schedule: boolean }) => void;
}) {
  const [links, setLinks] = useState<Links>({
    roster: row.roster_source_url ?? null,
    schedule: row.schedule_source_url ?? null,
    filter: row.schedule_source_filter ?? null,
  });
  const [state, setState] = useState<SyncState>(row.sync_state ?? {});

  const save = async (next: Links) => {
    await setSources({
      slug: row.school_slug,
      sport: row.sport,
      season: row.season,
      rosterUrl: next.roster,
      scheduleUrl: next.schedule,
      scheduleFilter: next.filter,
    });
    setLinks(next);
    // The database forgets a side's history when its link changes; so does this.
    setState((s) => ({
      roster: next.roster === links.roster ? s.roster : undefined,
      schedule: next.schedule === links.schedule && next.filter === links.filter ? s.schedule : undefined,
    }));
    onLinked({ roster: Boolean(next.roster), schedule: Boolean(next.schedule) });
  };

  const sync = async () => {
    const answer = await syncNow(row.school_slug, row.sport, row.season);
    setState(answer.state);
  };

  return (
    <>
      <SourceBlock
        kind="roster"
        sport={row.sport}
        season={row.season}
        linked={links.roster}
        filter={null}
        side={state.roster}
        onLink={async (url) => {
          await save({ ...links, roster: url });
          await sync();
        }}
        onUnlink={() => save({ ...links, roster: null })}
        onSync={sync}
      />
      {row.sport !== 'football' && (
        <SourceBlock
          kind="schedule"
          sport={row.sport}
          season={row.season}
          linked={links.schedule}
          filter={links.filter}
          side={state.schedule}
          onLink={async (url, filter) => {
            await save({ ...links, schedule: url, filter });
            await sync();
          }}
          onUnlink={() => save({ ...links, schedule: null, filter: null })}
          onSync={sync}
        />
      )}
    </>
  );
}

function SourceBlock(props: {
  kind: SourceSide;
  sport: string;
  season: number;
  linked: string | null;
  filter: string | null;
  side: SideState | undefined;
  onLink: (url: string, filter: string | null) => Promise<void>;
  onUnlink: () => Promise<void>;
  onSync: () => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState(props.filter ?? '');
  const [check, setCheck] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const noun = props.kind === 'roster' ? 'roster' : 'schedule';
  const source = props.kind === 'roster' ? 'Google Sheet' : 'calendar';

  if (props.linked) {
    return (
      <div className="mg-field">
        <p className="filter-line">
          <span>
            {noun === 'roster' ? 'Roster' : 'Schedule'} from a {source} · {sideLine(props.side, new Date())}
          </span>
        </p>
        <span className="fixture-sub">
          {props.linked}
          {props.filter && ` · only “${props.filter}”`}
        </span>
        <button type="button" className="fixture-row is-plain" disabled={busy} onClick={() => run(props.onSync)}>
          <span className="fixture-team">{busy ? 'Working…' : 'Sync now'}</span>
        </button>
        <button type="button" className="fixture-row is-plain" disabled={busy} onClick={() => run(props.onUnlink)}>
          <span className="fixture-team">
            Unlink
            <span className="fixture-sub">The last synced {noun} stays on the page.</span>
          </span>
        </button>
        {error && <p className="empty-text">{error}</p>}
      </div>
    );
  }

  const clean = props.kind === 'schedule' ? calendarUrl(url) : url.trim();
  const problem = clean
    ? props.kind === 'roster'
      ? sheetLinkProblem(clean)
      : calendarLinkProblem(clean)
    : null;
  const filterValue = filter.trim() || null;

  return (
    <div className="mg-field">
      <p className="filter-line">
        <span>Or link a {source}, and the {noun} keeps itself current</span>
      </p>
      <input
        className="search"
        type="url"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setCheck(null);
        }}
        placeholder={props.kind === 'roster' ? 'Published Google Sheet link (CSV)' : 'Calendar link (https:// or webcal://)'}
        aria-label={`${source} link`}
      />
      {props.kind === 'roster' && (
        <span className="fixture-sub">
          In the sheet: File → Share → Publish to web → the roster tab → Comma-separated values (.csv) → Publish,
          then copy that link.
        </span>
      )}
      {props.kind === 'schedule' && (
        <input
          className="search"
          type="text"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setCheck(null);
          }}
          placeholder="Only events containing… e.g. Volleyball (Girls V)"
          aria-label="Calendar filter"
        />
      )}
      {problem && <p className="empty-text">{problem}</p>}
      <button
        type="button"
        className="fixture-row is-plain"
        disabled={busy || !clean || Boolean(problem)}
        onClick={() =>
          run(async () => {
            setCheck(await checkSource({ kind: props.kind, url: clean, filter: filterValue, season: props.season }));
          })
        }
      >
        <span className="fixture-team">{busy ? 'Working…' : 'Check link'}</span>
      </button>
      {check && <CheckView check={check} />}
      {check?.ok && (
        <button
          type="button"
          className="fixture-row is-plain"
          disabled={busy}
          onClick={() => run(() => props.onLink(clean, filterValue))}
        >
          <span className="fixture-team">Link this {source}</span>
        </button>
      )}
      {error && <p className="empty-text">{error}</p>}
    </div>
  );
}

function CheckView({ check }: { check: Preview }) {
  if (!check.ok) return <p className="empty-text">Refused: {check.reason}.</p>;
  return (
    <>
      <p className="filter-line">
        <span>
          {check.players ? `${check.players.length} players read` : `${check.rows?.length ?? 0} games read`}
          {check.skipped > 0 && ` · ${check.skipped} events skipped`}
        </span>
      </p>
      {check.warnings.length > 0 && (
        <div className="mg-skip">
          {check.warnings.map((w, i) => (
            <div className="mg-skip-row" key={i}>
              {w}
            </div>
          ))}
        </div>
      )}
      <div className="mg-review">
        {check.players?.slice(0, 60).map((p) => (
          <div className="mg-review-row" key={p.id}>
            <b>#{p.number}</b> {p.firstName} {p.lastName}
            <span className="fixture-sub">
              {p.position}
              {p.grade && ` · ${p.grade}`}
            </span>
          </div>
        ))}
        {check.rows?.slice(0, 60).map((r, i) => (
          <div className="mg-review-row" key={i}>
            <b>{r.date}</b> · {r.home ? 'vs' : 'at'} {r.opponent}
            {r.time && <span className="fixture-sub">{r.time}</span>}
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Wire it into `Activate.tsx`**

1. Imports: add `import { stripBom } from '../../sync/rosterCheck';` and `import { Sources } from './Sources';`.
2. State, after the `leagueCleared` state:

```tsx
  // While a link is set the source owns that half, so its paste box is hidden
  // and save() sends null for it (keep), exactly as an untouched box does.
  const [linked, setLinked] = useState({
    roster: Boolean(existing?.roster_source_url),
    schedule: Boolean(existing?.schedule_source_url),
  });
```

3. Wrap the roster `<textarea className="mg-paste" …>` **and** its `{parsed && (…)}` review block in `{!linked.roster && (<>…</>)}`, and put a CSV picker directly above the textarea inside that wrapper:

```tsx
              <label className="mg-field">
                Or a CSV file{' '}
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Read into the paste box, so a file gets the same review
                    // table as a paste before anything is saved.
                    if (file) file.text().then((t) => setPasted(stripBom(t)));
                  }}
                />
              </label>
```

   When `linked.roster` is true, render instead:

```tsx
            <p className="filter-line">
              <span>The roster comes from the linked Google Sheet. Edit it there, or unlink it below.</span>
            </p>
```

4. Change the schedule section's condition from `{effectiveSport !== 'football' && (` to `{effectiveSport !== 'football' && !linked.schedule && (`.
5. Directly after that schedule section closes, mount the sources for a saved row:

```tsx
          {existing && <Sources row={existing} onLinked={setLinked} />}
          {!existing && (
            <p className="fixture-sub">Save first — a Google Sheet or calendar can be linked once the activation exists.</p>
          )}
```

- [ ] **Step 3: Mark problems in the school list (`Manage.tsx`)**

Add `import { rowProblems } from './sources';`. Inside each row's `<span className="fixture-team">`, after the existing `<span className="fixture-sub">…</span>`, add:

```tsx
              {rowProblems(r).map((p) => (
                <span key={p} className="fixture-sub">
                  {p}
                </span>
              ))}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green; the guard passes (precache 32).

Then look at it: start a built preview (`.claude/launch.json` entry `npx vite preview --port 4173 --strictPort`, which serves `dist/`), open `http://localhost:4173/oh/?manage` in the Browser pane at 375×812, sign in only if `.env.local` is configured for the preview build — otherwise check the layout the way the existing panel is checked (a local build cannot reach the live database without env). Confirm: the CSV picker sits above the paste box; on a new activation the "Save first" line shows; nothing overflows at 375 px. Screenshot it for the report.

- [ ] **Step 5: Commit**

```bash
git add src/oh/manage/Sources.tsx src/oh/manage/Activate.tsx src/oh/manage/Manage.tsx
git commit -m "Let the seller import a CSV file, link a sheet or calendar to a saved activation, and see a refused sync in the school list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Runbook, seller steps, and the record

**Files:**
- Modify: `docs/going-live.md`, `docs/selling.md`, `CLAUDE.md`

- [ ] **Step 1: `docs/going-live.md` — add a "v5: live sources" section** at the end, with exactly these steps in this order:

1. **Short address (already live if Task 1 shipped first).** `https://roster.scottforge.ai/oh/springfield` lands on Springfield on a phone *with Poland installed* and on one without. Adding a school: one line in `public/_redirects`, both slash forms; `src/oh/redirects.test.ts` holds it to the directory.
2. **Migration 0008.** Additive; no deploy ordering. Paste `supabase/migrations/0008_live_sources.sql` into the dashboard SQL editor, run it, run it again (apply-twice gate), then `node scripts/verify-school-roster.mjs` — expect 11 ok lines (12 with `VERIFY_SLUG` set in `.env.local`).
3. **Resend.** Create the account; add the domain `scottforge.ai`; add the DNS records Resend lists to the Cloudflare zone (DNS only, not proxied); wait for "Verified"; create an API key with sending access only.
4. **The function.** With the Supabase CLI logged in and linked to the project:
   ```bash
   npm run build:sync
   npx supabase secrets set CRON_SECRET=<long random string> RESEND_API_KEY=<key> ALERT_TO=<seller address> ALERT_FROM="Roster alerts <alerts@scottforge.ai>"
   npx supabase functions deploy sync-sources --no-verify-jwt
   ```
5. **The schedule.** Database → Extensions: enable `pg_cron` and `pg_net`. Fill in and run `supabase/cron/sync-sources.sql`. After 15 minutes, `select * from cron.job_run_details order by start_time desc limit 5;` shows a `succeeded` run, and the function's logs show `{"synced":0,"failed":0}` (no links yet).
6. **Push the panel** (merge the branch; Pages deploys).
7. **Rehearsal** — on a throwaway activation (an unpublished row on a school nobody follows), with a throwaway Google Sheet and a calendar:
   - Link the sheet with Check link first; Link; the roster appears, "synced just now".
   - Put a blank name in a row: within 15 minutes one email, "Sync refused…"; the panel's school list shows ⚠; the stored roster is unchanged.
   - Wait one more run: no second email.
   - Fix the row: one "Syncing again" email.
   - Unpublish the sheet: one email naming "a web page, not a sheet".
   - Repeat link/break/fix with a calendar link and a filter on a non-football sport.
   - Unlink both; the last synced roster and schedule stay. Delete the row.
8. **What this costs if it breaks.** Fans never see a broken sheet: a refused sync writes nothing. The job stopping (cron unscheduled, function deleted) means links simply stop updating — the page keeps the last good data and the panel's "synced N ago" grows.

- [ ] **Step 2: `docs/selling.md` — add to the activation runbook:**
   - **The school's address:** add `/oh/<short-name>` lines to `public/_redirects` (both slash forms), push, then make the QR code from `https://roster.scottforge.ai/oh/<short-name>` — never from `/oh/?school=…`, so the printed code survives any later change.
   - **Roster from a CSV file:** "Or a CSV file" above the paste box; it fills the paste box and gets the same review.
   - **Roster from the coach's Google Sheet:** save the activation unpublished first; ask the coach to publish the roster tab (File → Share → Publish to web → the tab → CSV) and send the link; in the panel paste it, Check link, Link; publish once it says "synced". From then on the coach edits the sheet; changes are live within 15 minutes; the roster section is read-only in the panel.
   - **Schedule from a calendar (non-football):** ask for the calendar's iCal/subscribe link from their scheduler. Check link with a filter naming the sport and level as the calendar writes it (Eventlink: `Volleyball (Girls V)`). Only promise a scheduling system that has a passing sample in `src/sync/fixtures/` — today ScheduleStar and Eventlink.
   - **When an email arrives:** the reason is in the subject line's email body; fans still see the last good data; fix the sheet (or tell the coach) and the next run sends "Syncing again".

- [ ] **Step 3: `CLAUDE.md` — update the record:**
   - Supabase heading: `migrations 0001–0007 APPLIED in production; 0008 WRITTEN` (until the rollout, then `0001–0008 APPLIED`), and a paragraph: 0008 adds `roster_source_url`, `schedule_source_url`, `schedule_source_filter`, `sync_state`; `school_admin_check`, `school_roster_set_sources` (authenticated, admin-only), `school_roster_sync_targets` and `school_roster_sync_apply` (service_role only); upsert still 11 params. "Still five `school_*` grants" becomes "seven `school_*` grants to authenticated/anon plus two to service_role".
   - The verify script line: "11 checks (12 with `VERIFY_SLUG`)".
   - A new bullet under Data sources: **Linked sheets and calendars** — the `sync-sources` Edge Function, every 15 minutes via pg_cron, pure code in `src/sync/` bundled by `npm run build:sync` into a committed `supabase/functions/sync-sources/lib/core.js` (a test fails if it is stale); alerts via Resend.
   - Short addresses: `public/_redirects`, always under `/oh/`, and why.
   - Test count: replace "489 tests / 32 files" with the numbers `npx vitest run` now prints.
   - Where things stand: date it `2026-09-30`; note the demo on `main` is the fictional `springfield-local-demo` (the `poland-demo` branch, with Poland on its Eventlink calendar, was never merged).

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: green; guard passes.

```bash
git add docs/going-live.md docs/selling.md CLAUDE.md
git commit -m "Write down how live sources go live, how a seller links a coach's sheet, and where the project stands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

Final whole-branch review (the repo's convention — every round so far has caught a Critical), then merge `live-sources` to `main`. The manual rollout (going-live v5, steps 2–7) is the seller's, in that order; nothing in it is reversible by a code revert alone, so step 7's rehearsal happens before any real school's sheet is linked.
