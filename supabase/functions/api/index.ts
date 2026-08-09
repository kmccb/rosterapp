/**
 * Roster Lookup API.
 *
 * The browser holds no database credentials. It sends a team code here, gets a
 * short-lived signed token back, and every later call carries that token. The
 * tables have RLS on with no policies, so this function's service role is the
 * only thing that can read or write them.
 *
 * Deploy:  supabase functions deploy api --no-verify-jwt
 * (--no-verify-jwt because we do our own auth; see checkToken below.)
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SESSION_SECRET = Deno.env.get('SESSION_SECRET') ?? '';
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SESSION_HOURS = 24 * 30; // parents shouldn't have to re-enter the code weekly
const PBKDF2_ITERATIONS = 200_000;
const RATE_LIMIT = { windowMinutes: 15, maxFailures: 10 };

type Role = 'viewer' | 'editor';

// ------------------------------------------------------------------ helpers

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlDecode = (s: string): Uint8Array => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Comparison that doesn't leak how much of the value matched. */
const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

type CodeHash = { algo: 'pbkdf2-sha256'; iterations: number; salt: string; hash: string };

const derive = async (code: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', enc.encode(code.trim()), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
};

export const hashCode = async (code: string): Promise<CodeHash> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(code, salt, PBKDF2_ITERATIONS);
  return {
    algo: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
    salt: b64url(salt),
    hash: b64url(hash),
  };
};

const verifyCode = async (code: string, stored: CodeHash | null): Promise<boolean> => {
  if (!stored?.hash || !stored?.salt) return false;
  const got = await derive(code, b64urlDecode(stored.salt), stored.iterations ?? PBKDF2_ITERATIONS);
  return timingSafeEqual(got, b64urlDecode(stored.hash));
};

// --------------------------------------------------------------- session token

const hmac = async (data: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
};

type Session = { teamId: string; role: Role; exp: number };

const signToken = async (session: Session): Promise<string> => {
  const body = b64url(enc.encode(JSON.stringify(session)));
  return `${body}.${b64url(await hmac(body))}`;
};

const readToken = async (token: string): Promise<Session | null> => {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!timingSafeEqual(await hmac(body), b64urlDecode(sig))) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Session;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------ plumbing

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

const fail = (status: number, message: string) => json({ error: message }, status);

const checkToken = async (req: Request): Promise<Session | null> => {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return token ? await readToken(token) : null;
};

/** Coarse key for rate limiting. Hashed so we aren't storing raw IPs. */
const clientKey = async (req: Request): Promise<string> => {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(ip + SESSION_SECRET));
  return b64url(new Uint8Array(digest)).slice(0, 32);
};

// ------------------------------------------------------------------- routes

const postAuth = async (req: Request): Promise<Response> => {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code || typeof code !== 'string') return fail(400, 'Enter the team code.');

  const key = await clientKey(req);
  const since = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60_000).toISOString();

  await db.from('auth_attempts').delete().lt('attempted_at', since);
  const { count } = await db
    .from('auth_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('client_key', key)
    .eq('ok', false)
    .gte('attempted_at', since);

  if ((count ?? 0) >= RATE_LIMIT.maxFailures) {
    return fail(429, 'Too many tries. Wait a few minutes and try again.');
  }

  // Single-team deployment: the first team row is the team.
  const { data: team } = await db
    .from('teams')
    .select('id, name, season, view_code, edit_code')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!team) return fail(503, 'No team has been set up yet.');

  let role: Role | null = null;
  if (await verifyCode(code, team.edit_code as CodeHash)) role = 'editor';
  else if (await verifyCode(code, team.view_code as CodeHash)) role = 'viewer';

  await db.from('auth_attempts').insert({ client_key: key, ok: role !== null });
  if (!role) return fail(401, "That code didn't work.");

  const token = await signToken({
    teamId: team.id,
    role,
    exp: Date.now() + SESSION_HOURS * 3_600_000,
  });
  return json({ token, role, team: { name: team.name, season: team.season } });
};

const getSnapshot = async (session: Session): Promise<Response> => {
  const [team, players, games, stats] = await Promise.all([
    db.from('teams').select('name, season, updated_at').eq('id', session.teamId).maybeSingle(),
    db.from('players').select('*').eq('team_id', session.teamId).order('sort_order'),
    db.from('games').select('*').eq('team_id', session.teamId).order('played_on'),
    db.from('stat_lines').select('*').eq('team_id', session.teamId),
  ]);

  return json({
    role: session.role,
    team: team.data ?? { name: '', season: '' },
    players: players.data ?? [],
    games: games.data ?? [],
    statLines: stats.data ?? [],
  });
};

type IncomingPlayer = {
  number?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  side?: string;
  heightIn?: number | null;
  weightLb?: number | null;
  grade?: string | null;
};

/**
 * Replace the roster, but reuse the row id of any player already on it.
 *
 * The importer mints a fresh uuid for every parsed row, so a naive replace
 * would delete every player and cascade away their stats on each re-import.
 * Matching on jersey number plus last name keeps those links intact.
 */
const putRoster = async (session: Session, req: Request): Promise<Response> => {
  const { players } = (await req.json().catch(() => ({}))) as { players?: IncomingPlayer[] };
  if (!Array.isArray(players)) return fail(400, 'Expected a list of players.');

  const { data: existing } = await db
    .from('players')
    .select('id, number, last_name')
    .eq('team_id', session.teamId);

  const keyOf = (number: string, last: string) => `${number.trim()}|${last.trim().toLowerCase()}`;
  const byKey = new Map((existing ?? []).map((p) => [keyOf(p.number, p.last_name), p.id]));

  const rows = players.map((p, i) => {
    const number = (p.number ?? '').trim();
    const lastName = (p.lastName ?? '').trim();
    const id = byKey.get(keyOf(number, lastName));
    byKey.delete(keyOf(number, lastName));
    return {
      ...(id ? { id } : {}),
      team_id: session.teamId,
      number,
      first_name: (p.firstName ?? '').trim(),
      last_name: lastName,
      position: (p.position ?? '').trim(),
      side: (p.side ?? '').trim(),
      height_in: p.heightIn ?? null,
      weight_lb: p.weightLb ?? null,
      grade: p.grade ?? null,
      sort_order: i,
      updated_at: new Date().toISOString(),
    };
  });

  const removed = [...byKey.values()];
  if (removed.length) await db.from('players').delete().in('id', removed);

  if (rows.length) {
    const { error } = await db.from('players').upsert(rows, { onConflict: 'id' });
    if (error) return fail(500, error.message);
  }

  await db
    .from('teams')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', session.teamId);

  return await getSnapshot(session);
};

const putTeam = async (session: Session, req: Request): Promise<Response> => {
  const { name, season } = (await req.json().catch(() => ({}))) as {
    name?: string;
    season?: string;
  };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof name === 'string') patch.name = name;
  if (typeof season === 'string') patch.season = season;

  const { error } = await db.from('teams').update(patch).eq('id', session.teamId);
  if (error) return fail(500, error.message);
  return await getSnapshot(session);
};

const putCodes = async (session: Session, req: Request): Promise<Response> => {
  const { viewCode, editCode } = (await req.json().catch(() => ({}))) as {
    viewCode?: string;
    editCode?: string;
  };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (viewCode) {
    if (viewCode.trim().length < 6) return fail(400, 'Team code must be at least 6 characters.');
    patch.view_code = await hashCode(viewCode);
  }
  if (editCode) {
    if (editCode.trim().length < 8) return fail(400, 'Editor code must be at least 8 characters.');
    patch.edit_code = await hashCode(editCode);
  }
  if (Object.keys(patch).length === 1) return fail(400, 'Nothing to change.');

  const { error } = await db.from('teams').update(patch).eq('id', session.teamId);
  if (error) return fail(500, error.message);
  return json({ ok: true });
};

// --------------------------------------------------------------------- serve

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!SUPABASE_URL || !SERVICE_KEY || !SESSION_SECRET) {
    return fail(500, 'The server is missing its configuration.');
  }

  const route = new URL(req.url).pathname.replace(/^.*\/api/, '') || '/';

  try {
    if (req.method === 'POST' && route === '/auth') return await postAuth(req);

    const session = await checkToken(req);
    if (!session) return fail(401, 'Sign in with the team code.');

    if (req.method === 'GET' && route === '/snapshot') return await getSnapshot(session);

    // Everything past here changes data.
    if (session.role !== 'editor') return fail(403, 'Read-only access.');

    if (req.method === 'PUT' && route === '/roster') return await putRoster(session, req);
    if (req.method === 'PUT' && route === '/team') return await putTeam(session, req);
    if (req.method === 'PUT' && route === '/codes') return await putCodes(session, req);

    return fail(404, 'No such endpoint.');
  } catch (err) {
    console.error(err);
    return fail(500, 'Something went wrong.');
  }
});
