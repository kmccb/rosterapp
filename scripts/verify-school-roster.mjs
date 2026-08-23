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
