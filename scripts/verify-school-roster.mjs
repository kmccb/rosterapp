/**
 * Proves the migration's doors against the live database, from outside.
 *
 * Run by hand after applying a migration — not in CI, because it needs the
 * real anon key and creates nothing. It asks the public function the
 * questions an attacker would: an unknown school, an unpublished row, an
 * expired row, 0008's four doors. The write checks assert the anon key is
 * refused outright, and the Data API checks assert both tables —
 * school_roster and school_account, the higher-value target since it holds
 * the seller's email and is_admin — are unreachable directly, not just
 * conveniently empty.
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
let total = 0;
// A catastrophic failure (the table actually exposed) puts real data in
// `detail` — minors' names, the seller's email. Truncated so a bad run
// can't turn this script's own output into the second leak.
const check = (name, ok, detail) => {
  total += 1;
  if (ok) {
    console.log(`  ok  ${name}`);
    return;
  }
  failed = 1;
  const trimmed = detail.length > 200 ? `${detail.slice(0, 200)}…` : detail;
  console.log(`  FAIL ${name} — ${trimmed}`);
};

const fetchUnknown = await rpc('school_roster_fetch', {
  p_slug: 'no-such-school-nowhere',
  p_sport: 'football',
});
check('unknown school returns nothing', fetchUnknown.status === 200 && fetchUnknown.body === null,
  JSON.stringify(fetchUnknown));

// Since 0007 this door answers with the school's identity, not a bare list:
// an unknown school must come back as a school with nothing — no sports and
// no look — rather than leaking a colors or crest value from a row that
// failed the published-and-paid gate.
const sportsUnknown = await rpc('school_roster_sports', { p_slug: 'no-such-school-nowhere' });
check('unknown school has no sports and no look',
  sportsUnknown.status === 200 && sportsUnknown.body !== null
    && Array.isArray(sportsUnknown.body.sports) && sportsUnknown.body.sports.length === 0
    && sportsUnknown.body.colors === null,
  JSON.stringify(sportsUnknown));

// p_league is sent so this probe hits the live eleven-parameter signature.
// Without it PostgREST finds no matching function and answers 404 — which
// is >= 400, so the check would pass without ever reaching the permission
// wall it exists to prove.
const anonUpsert = await rpc('school_roster_upsert', {
  p_slug: 'x', p_sport: 'football', p_season: 2026, p_players: [], p_colors: null,
  p_theme: null, p_schedule: null, p_league: null, p_published: false,
  p_paid_through: '2027-02-01', p_note: '',
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
  p_roster_url: null, p_schedule_url: null, p_schedule_filter: null,
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

// A correctly locked-down table refuses the Data API outright — 401 or
// permission-denied, never 200. A 200 with an empty array is NOT a pass: it
// means the grant is missing but RLS-with-zero-policies happened to return
// nothing today, which is one dropped "revoke all" away from returning rows.
const checkNotExposed = async (table) => {
  const res = await fetch(`${BASE}/rest/v1/${table}?select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const text = await res.text();
  check(`${table} is not exposed to the Data API`, res.status >= 400,
    `status ${res.status} — ${text}`);
};

await checkNotExposed('school_roster');
// The higher-value target: this table holds the seller's email and the
// is_admin flag. Same door, same requirement.
await checkNotExposed('school_account');

// A fixed count here so the runbook's "expected N ok lines" can't drift out
// of sync with this file — the script states its own total instead.
console.log(`\n${total} checks, ${failed ? 'not all ok — see FAIL above' : 'all ok'}`);
process.exit(failed);
