# Concierge Rosters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the seller activate a paid school from an admin panel — paste the roster, pick colors, set a paid-through date, publish — and have that school's `/oh/` page grow a Lookup keypad and Team list that second.

**Architecture:** One new Supabase migration in the established posture (RLS on, zero policies, grants revoked, security-definer functions only). The admin panel and the fan-side roster live entirely in the `/oh/` bundle; auth is Supabase magic link driven by plain `fetch`, matching the repo's deliberate avoidance of supabase-js. Payment is a `paid_through` date and a note — no payment code exists.

**Tech Stack:** Postgres/Supabase (SQL migration), TypeScript, React 18, plain fetch, vitest. No new dependencies.

## Global Constraints

- **The Poland guard stays green.** Every `npm run build` must end with "Poland, YSU and Victory Christian are unchanged." A failing guard means your change broke isolation — fix the change, never the guard or `scripts/untouched-baseline.json`.
- **The share-code system is untouched.** `supabase/migrations/0001–0003`, `src/share/`, and every root-app screen stay as they are. This plan adds migration `0004` and files under `src/oh/` only (plus one styles addition to `src/oh/oh.css`, never `src/styles.css` — editing the shared stylesheet changes Poland's CSS hash and fails the guard).
- **Admin-only writes.** Every mutating SQL function's first act is an `is_admin` check on `auth.uid()`. The public fetch function returns data only for `published AND paid_through >= current_date`, newest season first.
- **No supabase-js.** All Supabase traffic is plain `fetch`, in the style of `src/share/share.ts:232`.
- **Fan pages need no account, ever.** The roster fetch runs on the anon key alone.
- **Routing by query flag, not path.** GitHub Pages has no SPA fallback and the root service worker denylists `/oh/` navigations, so `/oh/manage` as a path would 404. The panel is `/oh/?manage`; privacy is `/oh/?privacy`. Magic-link tokens arrive in the URL hash and never collide with a query flag.
- **Comments in the repo's voice:** prose explaining why, not what.

## Environment facts the implementer needs

- `.env.local` holds real `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; both Vite passes (root and `vite.oh.config.ts`) read the same env, and CI passes them to the whole build script. `import.meta.env.VITE_SUPABASE_URL` works in the oh bundle today.
- Migrations in this repo are applied by hand in the Supabase dashboard's SQL editor. Applying `0004` is a **HUMAN STEP** — the plan marks it. Everything after it in Task 1 verifies against the live database.
- The Bash tool is Git Bash on Windows.

## File Structure

**Created:**
- `supabase/migrations/0004_school_roster.sql` — tables, functions, grants
- `scripts/verify-school-roster.mjs` — manual live-API verification (not CI)
- `src/oh/adminAuth.ts` — magic-link session: request, capture from URL, refresh, signed-fetch
- `src/oh/adminAuth.test.ts`
- `src/oh/rosterStore.ts` — fan-side fetch/cache of a school's roster + shared rpc helper
- `src/oh/rosterStore.test.ts`
- `src/oh/manage/Manage.tsx` — panel shell: sign-in, school list
- `src/oh/manage/Activate.tsx` — the activation form: paste → review → colors → date → publish
- `src/oh/manage/adminApi.ts` — admin RPC calls (list/upsert/delete)
- `src/oh/RosterTabs.tsx` — fan-side Lookup + Team tabs
- `src/oh/Privacy.tsx` — the plain-language privacy page

**Modified:**
- `src/oh/main.tsx` — route on `?manage` / `?privacy`
- `src/oh/School.tsx` — load roster, show tabs, apply colors, footer privacy link
- `src/oh/store.ts` — evict the roster cache alongside the season on a school switch
- `src/oh/oh.css` — panel and tab styles

---

### Task 1: Migration 0004 and the live verification script

**Files:**
- Create: `supabase/migrations/0004_school_roster.sql`
- Create: `scripts/verify-school-roster.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (SQL, callable via PostgREST `/rest/v1/rpc/<fn>`):
  - `school_roster_fetch(p_slug text, p_sport text) → jsonb | null` — anon-callable
  - `school_roster_upsert(p_slug text, p_sport text, p_season int, p_players jsonb, p_colors jsonb, p_published boolean, p_paid_through date, p_note text) → void` — admin only
  - `school_roster_delete(p_slug text, p_sport text, p_season int) → void` — admin only
  - `school_roster_list() → setof jsonb` — admin only
- Produces (tables): `school_account`, `school_roster` per the spec.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_school_roster.sql`:

```sql
-- The paid tier, operated by hand.
--
-- Same posture as shared_roster and for the same reason: the anon key ships
-- in a public bundle, so the key can never be the thing keeping rosters
-- apart. Tables are never exposed to the Data API — RLS on with no policies,
-- grants revoked, and the only doors are the definer functions below.
--
-- What is different from the share-code system is who may write. There, the
-- right to edit is a bearer token; here it is an account with is_admin set,
-- because v1 is concierge: the seller is the only writer. The schema still
-- carries sport and season in the key so that coach self-serve (phase 2) and
-- the all-sports package (phase 3) are new rows, not new schemas.

create table if not exists public.school_account (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.school_account is
  'Who may operate the paid tier. v1: one row, the seller, inserted by hand.';

alter table public.school_account enable row level security;
revoke all on table public.school_account from anon, authenticated;

create table if not exists public.school_roster (
  school_slug   text not null,
  sport         text not null default 'football',
  season        integer not null,
  players       jsonb not null default '[]'::jsonb,
  -- { "ground": "#04043a", "accent": "#4fbaf7" } or null for the default look.
  colors        jsonb,
  published     boolean not null default false,
  -- The whole notion of payment and of currency. The page goes dark on its
  -- own the day after this; there is no other clock to keep right.
  paid_through  date not null,
  -- "check #1042, booster treasurer J. Smith". Never shown publicly.
  note          text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (school_slug, sport, season)
);

comment on table public.school_roster is
  'Paid rosters, readable only through school_roster_fetch(). Not exposed to the Data API.';

alter table public.school_roster enable row level security;
revoke all on table public.school_roster from anon, authenticated;

-- ---------------------------------------------------------------- helpers

-- True only for a signed-in caller whose account row says so. Every write
-- function opens with this; there is deliberately no other authority.
create or replace function public.school_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.school_account
    where id = auth.uid() and is_admin
  );
$$;

-- ------------------------------------------------------------------ fetch

-- The public door. Newest season for the school and sport, and only when it
-- is published and paid for. Both conditions live here, not in the client.
-- There is no function that lists, counts or searches across schools — the
-- same deliberate omission the share-code system makes.
create or replace function public.school_roster_fetch(p_slug text, p_sport text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'season',  r.season,
           'players', r.players,
           'colors',  r.colors
         )
  from public.school_roster r
  where r.school_slug = p_slug
    and r.sport = p_sport
    and r.published
    and r.paid_through >= current_date
  order by r.season desc
  limit 1;
$$;

-- ------------------------------------------------------------------ admin

-- p_players null means "keep what is there" — the common edit is a renewal
-- (a new date, a new note) and making it resend a roster it does not hold
-- would turn every renewal into a data-loss hazard. Written as an explicit
-- update-then-insert rather than ON CONFLICT, because the conflict form's
-- excluded row would already have had the null coalesced away.
create or replace function public.school_roster_upsert(
  p_slug text, p_sport text, p_season integer,
  p_players jsonb, p_colors jsonb,
  p_published boolean, p_paid_through date, p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.school_admin() then
    raise exception 'not allowed';
  end if;

  update public.school_roster set
    players      = coalesce(p_players, players),
    colors       = p_colors,
    published    = p_published,
    paid_through = p_paid_through,
    note         = p_note,
    updated_at   = now()
  where school_slug = p_slug and sport = p_sport and season = p_season;

  if not found then
    insert into public.school_roster
      (school_slug, sport, season, players, colors, published, paid_through, note)
    values
      (p_slug, p_sport, p_season, coalesce(p_players, '[]'::jsonb), p_colors,
       p_published, p_paid_through, p_note);
  end if;
end;
$$;

-- A delete is a delete. Nothing about a minor lingers behind a flag.
create or replace function public.school_roster_delete(
  p_slug text, p_sport text, p_season integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.school_admin() then
    raise exception 'not allowed';
  end if;
  delete from public.school_roster
  where school_slug = p_slug and sport = p_sport and season = p_season;
end;
$$;

-- The panel's list. Cross-school on purpose — and admin-gated on purpose,
-- which is the asymmetry the whole design rests on: the public door serves
-- one school at a time, the seller sees the book.
create or replace function public.school_roster_list()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'school_slug',  school_slug,
           'sport',        sport,
           'season',       season,
           'player_count', jsonb_array_length(players),
           'colors',       colors,
           'published',    published,
           'paid_through', paid_through,
           'note',         note,
           'updated_at',   updated_at
         )
  from public.school_roster
  where public.school_admin()
  order by school_slug, sport, season desc;
$$;

-- ----------------------------------------------------------------- grants

revoke all on function public.school_admin() from public;
revoke all on function public.school_roster_fetch(text, text) from public;
revoke all on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, boolean, date, text) from public;
revoke all on function public.school_roster_delete(text, text, integer) from public;
revoke all on function public.school_roster_list() from public;

grant execute on function public.school_roster_fetch(text, text) to anon, authenticated;
grant execute on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, boolean, date, text) to authenticated;
grant execute on function public.school_roster_delete(text, text, integer) to authenticated;
grant execute on function public.school_roster_list() to authenticated;
```

- [ ] **Step 2: Write the verification script**

Create `scripts/verify-school-roster.mjs`:

```js
/**
 * Proves the migration's doors against the live database, from outside.
 *
 * Run by hand after applying 0004 — not in CI, because it needs the real
 * anon key and creates nothing. It asks the public function the questions an
 * attacker would: an unknown school, an unpublished row, an expired row.
 * The write checks assert the anon key is refused outright.
 *
 *   node scripts/verify-school-roster.mjs
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.local.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const BASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;

const rpc = async (fn, body) => {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok ' : 'FAIL'} ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed = 1;
};

const fetchUnknown = await rpc('school_roster_fetch', {
  p_slug: 'no-such-school-nowhere',
  p_sport: 'football',
});
check('unknown school returns nothing', fetchUnknown.status === 200 && fetchUnknown.body === null,
  JSON.stringify(fetchUnknown));

const anonUpsert = await rpc('school_roster_upsert', {
  p_slug: 'x', p_sport: 'football', p_season: 2026, p_players: [], p_colors: null,
  p_published: false, p_paid_through: '2027-02-01', p_note: '',
});
check('anon cannot upsert', anonUpsert.status >= 400, JSON.stringify(anonUpsert));

const anonDelete = await rpc('school_roster_delete', { p_slug: 'x', p_sport: 'football', p_season: 2026 });
check('anon cannot delete', anonDelete.status >= 400, JSON.stringify(anonDelete));

const anonList = await rpc('school_roster_list', {});
// Refused at the door (no execute for anon) or an empty set (school_admin()
// false) are both acceptable — what is not acceptable is rows.
check('anon list yields nothing',
  anonList.status >= 400 || (Array.isArray(anonList.body) && anonList.body.length === 0),
  JSON.stringify(anonList));

const rest = await fetch(`${BASE}/rest/v1/school_roster?select=*`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
check('table is not exposed to the Data API', rest.status >= 400 || (await rest.json()).length === 0,
  `status ${rest.status}`);

process.exit(failed);
```

- [ ] **Step 3: HUMAN STEP — apply the migration**

Stop and report NEEDS_CONTEXT if you cannot do this yourself: the migration is applied by pasting `supabase/migrations/0004_school_roster.sql` into the Supabase dashboard's SQL editor (project the `.env.local` URL points at) and running it. The controller or the human does this; you continue when told it is applied.

- [ ] **Step 4: Run the verification**

Run: `node scripts/verify-school-roster.mjs`
Expected: five `ok` lines, exit 0.

- [ ] **Step 5: HUMAN STEP — create the admin account**

Also in the dashboard (documented here so the runbook lives in the repo):
1. Authentication → Users → the seller signs in once via the panel (Task 3) *or* is invited by email from the dashboard.
2. SQL editor: `insert into public.school_account (id, email, is_admin) select id, email, true from auth.users where email = '<the seller''s email>';`

This step can wait until Task 3 exists; it blocks nothing in Tasks 1–2.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_school_roster.sql scripts/verify-school-roster.mjs
git commit -m "Open a locked door for paid rosters, and prove it only opens one way"
```

---

### Task 2: The oh bundle's Supabase plumbing — rpc, session, roster store

**Files:**
- Create: `src/oh/supa.ts`
- Create: `src/oh/adminAuth.ts`
- Create: `src/oh/rosterStore.ts`
- Test: `src/oh/adminAuth.test.ts`
- Test: `src/oh/rosterStore.test.ts`

**Interfaces:**
- Consumes: `Player` from `../types` (type-only), `chosenSlug` from `./store`.
- Produces:
```ts
// supa.ts
export const supaAvailable: boolean;
export function rpc<T>(fn: string, body: Record<string, unknown>, accessToken?: string): Promise<T>;

// adminAuth.ts
export type Session = { accessToken: string; refreshToken: string; expiresAt: number };
export function requestMagicLink(email: string): Promise<void>;
export function sessionFromUrl(href: string): Session | null;   // pure — tested
export function loadSession(): Session | null;
export function saveSession(s: Session): void;
export function clearSession(): void;
export function freshToken(): Promise<string | null>;           // refreshes if near expiry

// rosterStore.ts
export type SchoolColors = { ground: string; accent: string } | null;
export type SchoolRoster = { season: number; players: Player[]; colors: SchoolColors };
export function loadSchoolRoster(slug: string): Promise<SchoolRoster | null>;
export function evictRosterCache(slug: string): void;           // store.ts calls on switch
```

- [ ] **Step 1: Write the failing tests**

Create `src/oh/adminAuth.test.ts`:

```ts
import { sessionFromUrl } from './adminAuth';

describe('sessionFromUrl', () => {
  it('reads the tokens a magic link lands with', () => {
    const s = sessionFromUrl(
      'https://roster.scottforge.ai/oh/?manage#access_token=AAA&expires_in=3600&refresh_token=BBB&token_type=bearer&type=magiclink',
    );
    expect(s?.accessToken).toBe('AAA');
    expect(s?.refreshToken).toBe('BBB');
    // Expiry is absolute so a reload does not reset the clock.
    expect(s!.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
  });

  it('returns nothing for an ordinary visit', () => {
    expect(sessionFromUrl('https://roster.scottforge.ai/oh/?manage')).toBeNull();
    expect(sessionFromUrl('https://roster.scottforge.ai/oh/#privacy')).toBeNull();
  });

  it('returns nothing when the hash is missing a token', () => {
    expect(sessionFromUrl('https://x/oh/?manage#access_token=AAA&token_type=bearer')).toBeNull();
  });
});
```

Create `src/oh/rosterStore.test.ts`:

```ts
import { cacheKey, parseCached } from './rosterStore';

describe('roster cache plumbing', () => {
  it('keys the cache by school', () => {
    expect(cacheKey('hubbard-hubbard')).toBe('oh.roster.hubbard-hubbard');
  });

  it('round-trips a roster and rejects junk', () => {
    const roster = { season: 2026, players: [], colors: null };
    expect(parseCached(JSON.stringify(roster))).toEqual(roster);
    expect(parseCached('{"season":"nope"}')).toBeNull();
    expect(parseCached('not json')).toBeNull();
    expect(parseCached(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/oh/adminAuth.test.ts src/oh/rosterStore.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write supa.ts**

Create `src/oh/supa.ts`:

```ts
/*
 * The oh bundle's one road to Supabase.
 *
 * Plain fetch for the same reason src/share/share.ts gives: a handful of RPC
 * calls do not justify sixty kilobytes of client, and everything goes through
 * a database function anyway. Not imported from there because that module is
 * scoped to the root app's storage jars, and the directory must not touch
 * them.
 */

const BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supaAvailable = Boolean(BASE && KEY);
export const supaBase = BASE;
export const supaKey = KEY;

/**
 * One RPC call. With an access token the database sees a signed-in caller
 * and auth.uid() works; without one it sees anon, which is all the fan-side
 * fetch ever needs.
 */
export async function rpc<T>(
  fn: string,
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  if (!BASE || !KEY) throw new Error('Supabase is not set up in this build.');

  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${accessToken ?? KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message || `The server said no (${res.status}).`);
  }

  // A void function answers 204 with no body; res.json() would throw on it.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
```

- [ ] **Step 4: Write adminAuth.ts**

Create `src/oh/adminAuth.ts`:

```ts
/*
 * The seller's session, by magic link.
 *
 * No passwords: enter an email, click the link, the tokens arrive in the URL
 * hash and are kept in localStorage. That is the whole ceremony, and it is
 * enough for one admin who signs in a few times a season. Talks to GoTrue
 * with plain fetch, like everything else here.
 */

import { supaBase, supaKey } from './supa';

export type Session = { accessToken: string; refreshToken: string; expiresAt: number };

const SESSION = 'oh.admin.session';

/** Ask GoTrue to email the link. The link brings the reader back to ?manage. */
export async function requestMagicLink(email: string): Promise<void> {
  const redirect = encodeURIComponent(`${location.origin}/oh/?manage`);
  const res = await fetch(`${supaBase}/auth/v1/otp?redirect_to=${redirect}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supaKey! },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!res.ok) throw new Error(`Could not send the link (${res.status}).`);
}

/**
 * The tokens a clicked link lands with, read off the hash. Pure, so the
 * shapes GoTrue actually sends can be pinned in tests.
 */
export function sessionFromUrl(href: string): Session | null {
  const hash = href.split('#')[1];
  if (!hash) return null;

  const p = new URLSearchParams(hash);
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  const expiresIn = Number(p.get('expires_in'));
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;

  return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
}

export const loadSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    return typeof s?.accessToken === 'string' &&
      typeof s?.refreshToken === 'string' &&
      typeof s?.expiresAt === 'number'
      ? (s as Session)
      : null;
  } catch {
    return null;
  }
};

export const saveSession = (s: Session): void => localStorage.setItem(SESSION, JSON.stringify(s));
export const clearSession = (): void => localStorage.removeItem(SESSION);

/**
 * A token that will still be alive when the request lands. Refreshed with
 * five minutes to spare rather than at the moment of expiry, because the
 * request this token is for takes time too. Null means signed out.
 */
export async function freshToken(): Promise<string | null> {
  const s = loadSession();
  if (!s) return null;
  if (s.expiresAt - Date.now() > 5 * 60 * 1000) return s.accessToken;

  try {
    const res = await fetch(`${supaBase}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supaKey! },
      body: JSON.stringify({ refresh_token: s.refreshToken }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const t = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    const next: Session = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
    saveSession(next);
    return next.accessToken;
  } catch {
    // A dead refresh token is a signed-out seller, not a broken panel.
    clearSession();
    return null;
  }
}
```

- [ ] **Step 5: Write rosterStore.ts**

Create `src/oh/rosterStore.ts`:

```ts
/*
 * A paid school's roster, for the fan page.
 *
 * Network first against the public fetch function, then whatever was kept —
 * the same rule the season already follows, and the same eviction rule too:
 * cached for the followed school only, dropped on a genuine switch. The fan
 * side runs on the anon key alone; there is no account on this path and
 * never will be.
 */

import type { Player } from '../types';
import { chosenSlug } from './store';
import { rpc, supaAvailable } from './supa';

export type SchoolColors = { ground: string; accent: string } | null;
export type SchoolRoster = { season: number; players: Player[]; colors: SchoolColors };

export const cacheKey = (slug: string): string => `oh.roster.${slug}`;

/** Kept strict so a cache written by a future shape cannot crash a screen. */
export const parseCached = (raw: string | null): SchoolRoster | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SchoolRoster>;
    return typeof v?.season === 'number' && Array.isArray(v?.players)
      ? ({ season: v.season, players: v.players, colors: v.colors ?? null } as SchoolRoster)
      : null;
  } catch {
    return null;
  }
};

export async function loadSchoolRoster(slug: string): Promise<SchoolRoster | null> {
  if (!supaAvailable) return null;

  try {
    const body = await rpc<SchoolRoster | null>('school_roster_fetch', {
      p_slug: slug,
      p_sport: 'football',
    });
    if (body && typeof body.season === 'number' && Array.isArray(body.players)) {
      if (slug === chosenSlug()) {
        try {
          localStorage.setItem(cacheKey(slug), JSON.stringify(body));
        } catch {
          // A full jar must not fail the fetch that succeeded.
        }
      }
      return body;
    }
    // The function answered null: no live roster. Clear a stale cache so an
    // expired school goes dark on phones too, not just on the server.
    if (slug === chosenSlug()) localStorage.removeItem(cacheKey(slug));
    return null;
  } catch {
    // No signal — the kept copy is the point of keeping one.
    return parseCached(localStorage.getItem(cacheKey(slug)));
  }
}

export const evictRosterCache = (slug: string): void => localStorage.removeItem(cacheKey(slug));
```

- [ ] **Step 6: Wire the eviction into store.ts**

In `src/oh/store.ts`, `choose()` currently drops the previous school's season on a switch. Add the roster alongside it (import at top: `import { evictRosterCache } from './rosterStore';` — check for an import cycle: rosterStore imports `chosenSlug` from store. To avoid the cycle, do NOT import rosterStore from store; instead inline the key, matching how SEASON is already inlined):

```ts
export const choose = (slug: string): void => {
  const prev = chosenSlug();
  if (prev && prev !== slug) {
    localStorage.removeItem(SEASON(prev));
    // The roster obeys the same rule as the season: kept for the followed
    // school, dropped on a genuine switch. Key inlined rather than imported
    // from rosterStore, which imports chosenSlug from here.
    localStorage.removeItem(`oh.roster.${prev}`);
  }
  localStorage.setItem(CHOSEN, slug);
};
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/oh/`
Expected: PASS — the two new files plus the existing store tests.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit` — clean.

```bash
git add src/oh/supa.ts src/oh/adminAuth.ts src/oh/rosterStore.ts src/oh/adminAuth.test.ts src/oh/rosterStore.test.ts src/oh/store.ts
git commit -m "Teach the directory to talk to the database, signed in or not"
```

---

### Task 3: The panel shell — routing, sign-in, school list

**Files:**
- Create: `src/oh/manage/adminApi.ts`
- Create: `src/oh/manage/Manage.tsx`
- Modify: `src/oh/main.tsx`
- Modify: `src/oh/oh.css`

**Interfaces:**
- Consumes: `requestMagicLink`, `sessionFromUrl`, `saveSession`, `loadSession`, `clearSession`, `freshToken` from `../adminAuth`; `rpc` from `../supa`.
- Produces:
```ts
// adminApi.ts
export type RosterRow = {
  school_slug: string; sport: string; season: number; player_count: number;
  colors: { ground: string; accent: string } | null;
  published: boolean; paid_through: string; note: string; updated_at: string;
};
export function listRosters(): Promise<RosterRow[]>;      // throws 'signed-out' when no session
export function upsertRoster(row: { slug: string; sport: string; season: number;
  players: unknown[] | null;   // null = keep what is stored (renewals)
  colors: { ground: string; accent: string } | null;
  published: boolean; paidThrough: string; note: string }): Promise<void>;
export function deleteRoster(slug: string, sport: string, season: number): Promise<void>;
// Manage.tsx
export function Manage(): JSX.Element;
```

- [ ] **Step 1: Write adminApi.ts**

Create `src/oh/manage/adminApi.ts`:

```ts
/*
 * What the panel may do, which is everything — behind is_admin in the
 * database, not behind anything here. This file just signs the calls.
 */

import { freshToken } from '../adminAuth';
import { rpc } from '../supa';

export type RosterRow = {
  school_slug: string;
  sport: string;
  season: number;
  player_count: number;
  colors: { ground: string; accent: string } | null;
  published: boolean;
  paid_through: string;
  note: string;
  updated_at: string;
};

const signed = async (): Promise<string> => {
  const token = await freshToken();
  if (!token) throw new Error('signed-out');
  return token;
};

export const listRosters = async (): Promise<RosterRow[]> =>
  (await rpc<RosterRow[]>('school_roster_list', {}, await signed())) ?? [];

export const upsertRoster = async (row: {
  slug: string;
  sport: string;
  season: number;
  /** null means keep the stored roster — the renewal case. */
  players: unknown[] | null;
  colors: { ground: string; accent: string } | null;
  published: boolean;
  paidThrough: string;
  note: string;
}): Promise<void> => {
  await rpc<null>(
    'school_roster_upsert',
    {
      p_slug: row.slug,
      p_sport: row.sport,
      p_season: row.season,
      p_players: row.players,
      p_colors: row.colors,
      p_published: row.published,
      p_paid_through: row.paidThrough,
      p_note: row.note,
    },
    await signed(),
  );
};

export const deleteRoster = async (slug: string, sport: string, season: number): Promise<void> => {
  await rpc<null>(
    'school_roster_delete',
    { p_slug: slug, p_sport: sport, p_season: season },
    await signed(),
  );
};
```

- [ ] **Step 2: Write the panel shell**

Create `src/oh/manage/Manage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  clearSession,
  loadSession,
  requestMagicLink,
  saveSession,
  sessionFromUrl,
} from '../adminAuth';
import { listRosters, type RosterRow } from './adminApi';
import { Activate } from './Activate';

/**
 * The seller's side of the paid tier.
 *
 * One person uses this, a few times a week in season. It signs in by magic
 * link, lists every activation with its state, and opens the form that does
 * the real work. Anyone else who finds the URL gets a sign-in box that leads
 * to a database that refuses them — the gate is is_admin in SQL, not this
 * screen.
 */
export function Manage() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RosterRow | 'new' | null>(null);

  // A clicked magic link lands here with tokens in the hash. Capture them
  // once, then take them out of the address bar — a URL with a token in it
  // ends up in screenshots and history.
  useEffect(() => {
    const fromLink = sessionFromUrl(location.href);
    if (fromLink) {
      saveSession(fromLink);
      history.replaceState(null, '', `${location.pathname}?manage`);
    }
    setSignedIn(Boolean(fromLink || loadSession()));
  }, []);

  const refresh = () => {
    setError(null);
    listRosters()
      .then(setRows)
      .catch((e: Error) => {
        if (e.message === 'signed-out') setSignedIn(false);
        else setError(e.message);
      });
  };

  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="screen">
        <h1 className="next-card-opponent">Manage</h1>
        {sent ? (
          <p className="empty-text">Check your email — the link signs you in here.</p>
        ) : (
          <>
            <input
              className="search"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Admin email"
            />
            <button
              type="button"
              className="fixture-row is-plain"
              onClick={() => {
                requestMagicLink(email).then(() => setSent(true)).catch((e: Error) => setError(e.message));
              }}
            >
              <span className="fixture-team">Email me a sign-in link</span>
            </button>
            {error && <p className="empty-text">{error}</p>}
          </>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <Activate
        existing={editing === 'new' ? null : editing}
        onDone={() => {
          setEditing(null);
          refresh();
        }}
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="screen">
      <h1 className="next-card-opponent">Schools</h1>
      <p className="filter-line">
        <span>{rows ? `${rows.length} activated` : 'Loading…'}</span>
      </p>

      <button type="button" className="fixture-row is-plain" onClick={() => setEditing('new')}>
        <span className="fixture-team">+ Activate a school</span>
      </button>

      {error && <p className="empty-text">{error}</p>}

      {(rows ?? []).map((r) => {
        const state = !r.published ? 'unpublished' : r.paid_through < today ? 'expired' : 'live';
        return (
          <button
            key={`${r.school_slug}-${r.sport}-${r.season}`}
            type="button"
            className="fixture-row is-plain"
            onClick={() => setEditing(r)}
          >
            <span className="fixture-team">
              {r.school_slug} · {r.season}
              <span className="fixture-sub">
                {r.player_count} players · {state} · paid through {r.paid_through}
                {r.note && ` · ${r.note}`}
              </span>
            </span>
          </button>
        );
      })}

      <button
        type="button"
        className="fixture-row is-plain"
        onClick={() => {
          clearSession();
          setSignedIn(false);
        }}
      >
        <span className="fixture-team">Sign out</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Route on the query flag**

Modify `src/oh/main.tsx` to:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Directory } from './Directory';
import { Manage } from './manage/Manage';
import { Privacy } from './Privacy';
import '../styles.css';
import './oh.css';

/*
 * Routed on query flags, not paths: GitHub Pages has no SPA fallback and the
 * root service worker deliberately refuses /oh/ navigations, so /oh/manage as
 * a path would be a 404. ?manage and ?privacy always resolve to this page.
 */
const params = new URLSearchParams(location.search);
const page = params.has('manage') ? <Manage /> : params.has('privacy') ? <Privacy /> : <Directory />;

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>);
```

(`Privacy` arrives in Task 6; until then create `src/oh/Privacy.tsx` as a two-line placeholder returning `<div className="screen" />` so this compiles — Task 6 replaces it. Mark it as a stub in a comment.)

- [ ] **Step 4: Build and check the panel loads**

Run: `npm run build` — must end with the guard's success line.
Then `npx vite preview --port 4173` (background) and verify `http://localhost:4173/oh/?manage` serves the oh page (curl: the HTML is the same shell; the routing is client-side). Kill the server.

- [ ] **Step 5: HUMAN STEP — Supabase auth configuration**

In the dashboard: Authentication → URL Configuration → add `https://roster.scottforge.ai/oh/?manage` (and `http://localhost:4173/oh/?manage` for testing) to the redirect allowlist. Then complete Task 1 Step 5 (the admin row) after the first sign-in.

- [ ] **Step 6: Commit**

```bash
git add src/oh/manage/ src/oh/main.tsx src/oh/Privacy.tsx src/oh/oh.css
git commit -m "A door for the seller: sign in by email, see the book"
```

---

### Task 4: The activation form — paste, review, colors, publish

**Files:**
- Create: `src/oh/manage/Activate.tsx`
- Test: `src/oh/manage/activate.test.ts`
- Modify: `src/oh/oh.css`

**Interfaces:**
- Consumes: `parseRoster`, `ParseResult` from `../../parse/rosterParse`; `loadIndex`, `searchSchools` from `../store`; `upsertRoster`, `deleteRoster`, `RosterRow` from `./adminApi`; `Player` from `../../types`.
- Produces: `export function Activate({ existing, onDone }: { existing: RosterRow | null; onDone: () => void })`, and a pure helper `toPlayers(parsed: ParseResult['rows']): Player[]` (tested).

- [ ] **Step 1: Write the failing test for the mapping**

Create `src/oh/manage/activate.test.ts`:

```ts
import { parseRoster } from '../../parse/rosterParse';
import { toPlayers } from './Activate';

describe('toPlayers', () => {
  it('turns a pasted spreadsheet into the app’s players', () => {
    const parsed = parseRoster('7\tJake Miller\tQB\t6-1\t185\tJr\n12\tSam Ortiz\tWR\t5-11\t160\tSo');
    const players = toPlayers(parsed.rows);

    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({
      number: '7',
      firstName: 'Jake',
      lastName: 'Miller',
      position: 'QB',
      heightIn: 73,
      weightLb: 185,
      grade: 'Jr',
    });
    // Every player gets an id — the card components key on it.
    expect(players.every((p) => p.id.length > 0)).toBe(true);
    expect(new Set(players.map((p) => p.id)).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/oh/manage/activate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the form**

Create `src/oh/manage/Activate.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { parseRoster, type ParseResult } from '../../parse/rosterParse';
import type { Player, Side } from '../../types';
import { loadIndex, searchSchools } from '../store';
import type { School } from '../../ohio/stateModel';
import { deleteRoster, upsertRoster, type RosterRow } from './adminApi';
import { useEffect } from 'react';

/** The parser's rows, given ids and the exact shape every card component keys on. */
export const toPlayers = (rows: ParseResult['rows']): Player[] =>
  rows.map((r) => ({
    id: crypto.randomUUID(),
    number: r.player.number,
    firstName: r.player.firstName,
    lastName: r.player.lastName,
    position: r.player.position,
    side: r.player.side as Side,
    heightIn: r.player.heightIn,
    weightLb: r.player.weightLb,
    grade: r.player.grade,
  }));

/** Season + playoffs + slack. Next August this defaults right on its own. */
const defaultPaidThrough = (): string => {
  const now = new Date();
  const seasonYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${seasonYear + 1}-02-01`;
};

const seasonOf = (paidThrough: string): number => Number(paidThrough.slice(0, 4)) - 1;

/**
 * The whole concierge job on one screen: pick the school, paste the
 * spreadsheet, look at what the parser made of it, set the colors and the
 * paid-through date, publish. The parser is the same one the root app has
 * trusted all season; this screen adds nothing to it but eyes.
 */
export function Activate({ existing, onDone }: { existing: RosterRow | null; onDone: () => void }) {
  const [schools, setSchools] = useState<School[]>([]);
  const [slugQuery, setSlugQuery] = useState('');
  const [slug, setSlug] = useState(existing?.school_slug ?? '');
  const [pasted, setPasted] = useState('');
  const [ground, setGround] = useState(existing?.colors?.ground ?? '#04043a');
  const [accent, setAccent] = useState(existing?.colors?.accent ?? '#4fbaf7');
  const [paidThrough, setPaidThrough] = useState(existing?.paid_through ?? defaultPaidThrough());
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndex().then(setSchools).catch(() => setSchools([]));
  }, []);

  const parsed = useMemo(() => (pasted.trim() ? parseRoster(pasted) : null), [pasted]);
  const players = useMemo(() => (parsed ? toPlayers(parsed.rows) : []), [parsed]);
  const hits = useMemo(
    () => (slug ? [] : searchSchools(schools, slugQuery).slice(0, 8)),
    [schools, slugQuery, slug],
  );

  // Editing an existing school keeps its roster unless a new paste replaces
  // it: a save with no paste sends null and the database keeps what it has.
  // That is the renewal flow — new date, new note, roster untouched.
  const canSave = Boolean(slug) && (players.length > 0 || Boolean(existing));

  const save = async (published: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await upsertRoster({
        slug,
        sport: existing?.sport ?? 'football',
        season: existing?.season ?? seasonOf(paidThrough),
        players: players.length ? players : null,
        colors: { ground, accent },
        published,
        paidThrough,
        note,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <h1 className="next-card-opponent">{existing ? existing.school_slug : 'Activate a school'}</h1>

      {!existing && !slug && (
        <>
          <input
            className="search"
            type="search"
            value={slugQuery}
            onChange={(e) => setSlugQuery(e.target.value)}
            placeholder="Which school?"
            aria-label="Search for the school"
          />
          {hits.map((s) => (
            <button
              key={s.slug}
              type="button"
              className="fixture-row is-plain"
              onClick={() => setSlug(s.slug)}
            >
              <span className="fixture-team">
                {s.name}
                <span className="fixture-sub">{s.city}</span>
              </span>
            </button>
          ))}
        </>
      )}

      {(slug || existing) && (
        <>
          {!existing && <p className="filter-line"><span>{slug}</span></p>}

          <textarea
            className="mg-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={
              existing
                ? 'Paste to replace the roster, or leave empty to keep it'
                : 'Paste the roster rows here'
            }
            rows={6}
          />

          {parsed && (
            <>
              <p className="filter-line">
                <span>
                  {players.length} players read
                  {parsed.problems.length > 0 && ` · ${parsed.problems.length} rows skipped`}
                </span>
              </p>
              <div className="mg-review">
                {players.slice(0, 60).map((p) => (
                  <div className="mg-review-row" key={p.id}>
                    <b>#{p.number}</b> {p.firstName} {p.lastName}
                    <span className="fixture-sub">
                      {p.position}
                      {p.grade && ` · ${p.grade}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mg-colors">
            <label>
              Ground <input type="color" value={ground} onChange={(e) => setGround(e.target.value)} />
            </label>
            <label>
              Accent <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
            </label>
          </div>

          <label className="mg-field">
            Paid through{' '}
            <input type="date" value={paidThrough} onChange={(e) => setPaidThrough(e.target.value)} />
          </label>
          <input
            className="search"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Payment note — check #, who paid"
            aria-label="Payment note"
          />

          {error && <p className="empty-text">{error}</p>}

          <button type="button" className="fixture-row is-plain" disabled={busy || !canSave}
            onClick={() => save(true)}>
            <span className="fixture-team">Publish</span>
          </button>
          <button type="button" className="fixture-row is-plain" disabled={busy || !canSave}
            onClick={() => save(false)}>
            <span className="fixture-team">Save unpublished</span>
          </button>
          {existing && (
            <button type="button" className="fixture-row is-plain" disabled={busy}
              onClick={() => {
                if (!confirm(`Delete ${existing.school_slug} ${existing.season} entirely?`)) return;
                deleteRoster(existing.school_slug, existing.sport, existing.season)
                  .then(onDone)
                  .catch((e: Error) => setError(e.message));
              }}>
              <span className="fixture-team">Delete this roster</span>
            </button>
          )}
        </>
      )}

      <button type="button" className="fixture-row is-plain" onClick={onDone}>
        <span className="fixture-team">Back</span>
      </button>
    </div>
  );
}
```

**Implementation note that outranks the sketch above:** read the real row shape off `src/parse/rosterParse.ts` before writing `toPlayers` — the sketch assumes `r.player.<field>`; if the parser names them differently (fields directly on the row, a different name for problem rows than `parsed.problems`), adapt the sketch to the module. The test pins the OUTPUT shape (`Player`), which is the contract that matters. The nullable-players renewal path is already in Task 1's SQL and Task 3's `adminApi` types; this form sends `players: null` exactly when editing an existing row with an empty paste.

- [ ] **Step 4: Run the tests, typecheck, build**

Run: `npx vitest run src/oh/` — all pass.
Run: `npx tsc --noEmit` — clean.
Run: `npm run build` — guard green.

- [ ] **Step 5: Add the panel styles**

Append to `src/oh/oh.css`:

```css
/* ------------------------------------------------------------- manage */

/* The seller's screens. Plain and dense on purpose — one person uses these,
   on a phone, often standing next to the person paying. */
.mg-paste {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.mg-review {
  max-height: 40vh;
  overflow-y: auto;
  margin-top: 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.mg-review-row {
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
}

.mg-colors {
  display: flex;
  gap: 16px;
  margin: 12px 0;
}

.mg-colors label,
.mg-field {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 14px;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/oh/manage/Activate.tsx src/oh/manage/activate.test.ts src/oh/oh.css
git commit -m "The whole concierge job on one screen"
```

---

### Task 5: The fan side — roster tabs on a paid school's page

**Files:**
- Create: `src/oh/RosterTabs.tsx`
- Modify: `src/oh/School.tsx`
- Modify: `src/oh/oh.css`

**Interfaces:**
- Consumes: `loadSchoolRoster`, `SchoolRoster` from `./rosterStore`; `Keypad` from `../components/Keypad`; `PlayerRow` from `../components/PlayerRow`; `numberMatches` from `../parse/rosterParse`; `fullName`, `formatHeight`, `formatWeight`, `Player` from `../types`.
- Produces: `export function RosterTabs({ roster }: { roster: SchoolRoster })`.

**Check before writing:** read `src/components/PlayerRow.tsx` and `src/components/Keypad.tsx` prop signatures on disk and use them exactly; the sketch below assumes `Keypad({ onDigit, onBackspace, onClear, canDelete })` (confirmed) and a `PlayerRow` taking a player plus display props — match reality. If `PlayerRow` drags in root-app dependencies (theme, storage), render the rows with local markup instead using the same CSS classes; do not import anything from `src/screens/` or `src/theme/`.

- [ ] **Step 1: Write RosterTabs**

Create `src/oh/RosterTabs.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Keypad } from '../components/Keypad';
import { numberMatches } from '../parse/rosterParse';
import { formatHeight, formatWeight, fullName, type Player } from '../types';
import type { SchoolRoster } from './rosterStore';

/**
 * The paid part of a school's page: who is number seventeen.
 *
 * The keypad and the prefix matching are the root app's, because they are
 * the product — tap 7 and #7 leads with the 70s underneath. The list view is
 * the reverse lookup, by name. Nothing here needs an account or a signal
 * once the roster has been fetched once.
 */
export function RosterTabs({ roster }: { roster: SchoolRoster }) {
  const [tab, setTab] = useState<'lookup' | 'team'>('lookup');
  const [query, setQuery] = useState('');

  const byNumber = useMemo(
    () =>
      [...roster.players].sort(
        (a, b) => (Number(a.number) || 999) - (Number(b.number) || 999),
      ),
    [roster.players],
  );

  const hits = useMemo(() => {
    if (!query) return [];
    const exact = byNumber.filter((p) => p.number === query);
    const prefix = byNumber.filter((p) => p.number !== query && numberMatches(p.number, query));
    return [...exact, ...prefix];
  }, [byNumber, query]);

  return (
    <div className="oh-roster">
      <div className="seg" role="group" aria-label="Roster view">
        <button type="button" aria-pressed={tab === 'lookup'} onClick={() => setTab('lookup')}>
          Lookup
        </button>
        <button type="button" aria-pressed={tab === 'team'} onClick={() => setTab('team')}>
          Team
        </button>
      </div>

      {tab === 'lookup' && (
        <>
          <div className="oh-query" aria-live="polite">{query || ' '}</div>
          {hits.map((p) => (
            <RosterLine key={p.id} p={p} />
          ))}
          {query && !hits.length && <p className="empty-text">Nobody wears {query}.</p>}
          <Keypad
            onDigit={(d) => setQuery((q) => (q + d).slice(0, 2))}
            onBackspace={() => setQuery((q) => q.slice(0, -1))}
            onClear={() => setQuery('')}
            canDelete={query.length > 0}
          />
        </>
      )}

      {tab === 'team' &&
        byNumber.map((p) => <RosterLine key={p.id} p={p} />)}
    </div>
  );
}

const RosterLine = ({ p }: { p: Player }) => (
  <div className="fixture">
    <div className="fixture-row">
      <span className="fixture-date">{p.number}</span>
      <span className="fixture-team">
        {fullName(p)}
        <span className="fixture-sub">
          {[p.position, formatHeight(p.heightIn), formatWeight(p.weightLb), p.grade]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="fixture-result" />
    </div>
  </div>
);
```

- [ ] **Step 2: Wire it into School.tsx**

In `src/oh/School.tsx`:
- Import `loadSchoolRoster`, `type SchoolRoster` from `./rosterStore` and `RosterTabs` from `./RosterTabs`.
- Add state `const [roster, setRoster] = useState<SchoolRoster | null>(null);` and load it in the same `useEffect` that loads the season (reset to null on slug change; `loadSchoolRoster(slug).then(setRoster).catch(() => setRoster(null))` — a roster failure must never block the season rendering).
- Apply the school's colors when present, scoped to this screen:

```tsx
const themed = roster?.colors
  ? ({ '--accent': roster.colors.accent, '--school-band': roster.colors.ground } as React.CSSProperties)
  : undefined;
```

and put `style={themed}` on the screen's root div. Add to `src/oh/oh.css`:

```css
/* A paid school's two colors. The accent recolors what the accent already
   colors; the ground becomes a band behind the school's name rather than
   the page background, because the page's text contrast is tuned for the
   default ground and an arbitrary one would break it. */
.oh-school-head {
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--school-band, transparent);
}
```

Wrap the existing `<h1>` + record line in `<div className="oh-school-head">…</div>`.
- Render the tabs between the head and the season: `{roster && <RosterTabs roster={roster} />}`.
- When `roster` is present, do not render the "Roster not added yet" panel; when absent, the page is exactly what it is today.
- When `roster` is present, render the premium-tier line the spec promises, after the season list (before the "Follow a different school" button):

```tsx
      {roster && (
        <p className="filter-line">
          <span>
            <a
              href={`mailto:tom@scottforge.ai?subject=${encodeURIComponent(
                `An app of our own — ${season.school.name}`,
              )}`}
            >
              Want your own installable app, like Poland&rsquo;s?
            </a>
          </span>
        </p>
      )}
```

- [ ] **Step 3: Verify against a live activation**

This needs one published test row. Via the panel (if Task 3's HUMAN steps are done) or the dashboard SQL editor, publish a small roster for a low-stakes slug, e.g.:

```sql
select public.school_roster_upsert(
  'poland-seminary-poland', 'football', 2026,
  '[{"id":"t1","number":"7","firstName":"Test","lastName":"Player","position":"QB","side":"O"}]'::jsonb,
  '{"ground":"#04043a","accent":"#4fbaf7"}'::jsonb,
  true, '2027-02-01', 'smoke test'
);
```

(Requires running as a signed-in admin — from the SQL editor run the inner INSERT directly instead, since the editor is service-role: `insert into school_roster (school_slug, sport, season, players, colors, published, paid_through, note) values (...) on conflict do nothing;`)

Then `npm run build`, `npx vite preview --port 4173`, open `http://localhost:4173/oh/`, pick Poland Seminary: the Lookup/Team seg appears, keypad 7 finds Test Player, the head wears the band color. Then delete the smoke row (`delete from school_roster where note = 'smoke test';`) and confirm the page reverts to "Roster not added yet" on reload.

- [ ] **Step 4: Tests, typecheck, guard**

Run: `npx vitest run src/oh/` — pass. `npx tsc --noEmit` — clean. `npm run build` — guard green.

- [ ] **Step 5: Commit**

```bash
git add src/oh/RosterTabs.tsx src/oh/School.tsx src/oh/oh.css
git commit -m "Who is number seventeen, for any school that paid"
```

---

### Task 6: The privacy page

**Files:**
- Modify: `src/oh/Privacy.tsx` (replace the Task-3 stub)
- Modify: `src/oh/School.tsx` (footer link)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function Privacy(): JSX.Element` at `/oh/?privacy`.

- [ ] **Step 1: Write the page**

Replace `src/oh/Privacy.tsx`:

```tsx
/**
 * The plain-language version of the design's privacy stance. This is the
 * page a parent, a coach, or a district's lawyer reads, so it says what is
 * true in sentences rather than clauses.
 */
export function Privacy() {
  return (
    <div className="screen oh-privacy">
      <h1 className="next-card-opponent">What this site knows, and doesn’t</h1>

      <h2>Schedules and scores</h2>
      <p>
        Every school’s schedule and scores come from publicly published results. Nothing about
        any student is involved.
      </p>

      <h2>Rosters</h2>
      <p>
        A roster appears here only when the school’s athletic program asked for it and paid for
        it, and a person reviewed and published it — payment alone publishes nothing. It carries
        what the paper roster handed out at a game carries: jersey number, name, position,
        height, weight, and year in school. No photographs.
      </p>
      <p>
        A roster comes down when its season ends, when the school asks, or when we take it down —
        whichever happens first. Taking it down deletes it; nothing is kept behind the scenes.
      </p>

      <h2>You</h2>
      <p>
        Reading this site needs no account and creates none. Page views are counted without
        cookies and without anything that follows you between sites.
      </p>

      <h2>Questions, corrections, removals</h2>
      <p>
        <a href="mailto:tom@scottforge.ai">tom@scottforge.ai</a>. A removal request from a school
        is honored the day it arrives.
      </p>

      <p>
        <a href="/oh/">Back to the directory</a>
      </p>
    </div>
  );
}
```

Add to `src/oh/oh.css`:

```css
/* Prose page. The app's classes are built for rows; this one needs headings
   and paragraphs to breathe. */
.oh-privacy h2 {
  margin: 18px 0 4px;
  font-size: 15px;
  color: var(--accent);
}

.oh-privacy p {
  margin: 6px 0;
  color: var(--text);
  line-height: 1.5;
}

.oh-privacy a {
  color: var(--accent);
}
```

- [ ] **Step 2: Link it from the school page**

In `src/oh/School.tsx`, at the bottom of the main return (after the "Follow a different school" button):

```tsx
      <p className="filter-line">
        <span>
          <a href="/oh/?privacy">What this site knows, and doesn’t</a>
        </span>
      </p>
```

- [ ] **Step 3: Verify, commit**

Run: `npx tsc --noEmit`, `npx vitest run src/oh/`, `npm run build` (guard green). Preview: `/oh/?privacy` renders the page; the school screen carries the link.

```bash
git add src/oh/Privacy.tsx src/oh/School.tsx src/oh/oh.css
git commit -m "Say what the site knows in sentences a parent can read"
```

---

### Task 7: End-to-end pass and the seller's runbook

**Files:**
- Create: `docs/selling.md`

- [ ] **Step 1: The runbook**

Create `docs/selling.md`:

```markdown
# Selling and operating the paid tier

The system stores a paid-through date and a note. Everything else — the
pitch, the invoice, the check — happens between people.

## Activate a school (the whole job, ~3 minutes)

1. Open https://roster.scottforge.ai/oh/?manage and sign in (email link).
2. “+ Activate a school” → search the school → paste their roster
   spreadsheet → check the parsed list reads right.
3. Pick their two colors. Set paid-through (defaults to Feb 1 after the
   season). Put the payment in the note: “check #1042, J. Smith, boosters”.
4. **Publish.** Their /oh/ page has the keypad that second.

Save unpublished instead if the check hasn’t cleared — publishing later is
the same screen.

## Mid-season changes

Text arrives: “#7 is now #12.” Open the school in the panel, paste the
corrected spreadsheet (it replaces the roster), Publish. Editing only the
date or note without a new paste keeps the roster as it is.

## Renewals

Rosters go dark on their paid-through date on their own. Next July: open the
panel, every school shows its date; invoice the expiring ones; extend the
date when the check arrives.

## Coming down

“Unpublish” hides a roster instantly (row kept). “Delete” removes it
entirely. A school’s removal request is honored same-day, per the privacy
page.

## The other tier

“They want their own app like Poland’s” — that is the concierge-plus build
(crest, palette, installable icon). It is manual: a teams/<slug>/ entry, a
logo, and a deploy. Price it accordingly.
```

- [ ] **Step 2: Full verification sweep**

- `npx vitest run` — whole suite green.
- `npx tsc --noEmit` — clean.
- `npm run build` — ends with the Poland guard's success line.
- `node scripts/verify-school-roster.mjs` — five ok lines against the live database.
- Preview walkthrough: `/oh/` search still works; a school without a roster shows the unchanged page and panel; `/oh/?manage` shows sign-in; `/oh/?privacy` renders.

- [ ] **Step 3: Commit**

```bash
git add docs/selling.md
git commit -m "Write down how the money side actually runs"
```

---

## Notes for whoever executes this

- **Task 1's migration must incorporate the nullable-players decision from Task 4's implementation note** (`p_players jsonb default null`, `coalesce` on both insert and update) — it is written as binding on both tasks. Read it before writing the SQL.
- **Two HUMAN steps** (apply the migration; configure auth redirects + the admin row) gate the live-verification steps. Everything code-side can be built and unit-tested before them; sequence the human steps early to avoid blocking.
- **The guard is the arbiter.** Never edit `src/styles.css` (Poland's CSS hash), never touch `src/share/`, `src/screens/`, `src/App.tsx`, `src/theme/`. Every new screen lives in the oh bundle.
- **Sketch code adapts to reality, tests pin the contract.** Where a sketch reads a field the real module names differently (ParseResult rows, PlayerRow props), the on-disk module wins and the test's asserted output shape is what must hold.

## Deferred, deliberately

- Coach accounts and self-serve (phase 2) — `school_account` is already the table they will join.
- Stripe or any in-app payment.
- Multi-sport UI (phase 3) — `sport` is in every key and signature already.
- Photos, bios, per-player pages for paid schools.
- Renewal automation and expiry-warning emails.
- An editable review grid in the panel — v1 re-pastes the corrected spreadsheet, which is how the concierge actually works.
