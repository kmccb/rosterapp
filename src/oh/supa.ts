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
