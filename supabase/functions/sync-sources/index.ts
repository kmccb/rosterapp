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
      // The links this run read. The database drops either half if the
      // seller changed or unlinked it while the run was in flight.
      p_roster_url: t.roster_source_url,
      p_schedule_url: t.schedule_source_url,
      p_schedule_filter: t.schedule_source_filter,
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
