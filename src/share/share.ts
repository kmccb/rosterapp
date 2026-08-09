/*
 * Publishing a roster to a code, and pulling one back down.
 *
 * This talks to PostgREST with plain fetch rather than supabase-js. Four RPC
 * calls don't justify ~60 kB of client on a phone that's meant to open on
 * stadium wifi, and every call here goes through a database function anyway —
 * none of the query-builder surface would get used.
 */

import type { Player, Roster } from '../types';

const BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * False in a fork or a local checkout with no .env. The share UI hides itself
 * rather than offering buttons that can only fail.
 */
export const sharingAvailable = Boolean(BASE && KEY);

/** What the coach keeps after publishing. The token is the right to re-publish. */
export type ShareKey = { code: string; editToken: string };

const SHARE_KEY = 'rosterapp.share.v1';

export const loadShareKey = (): ShareKey | null => {
  try {
    const raw = localStorage.getItem(SHARE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ShareKey>;
    return typeof v?.code === 'string' && typeof v?.editToken === 'string'
      ? { code: v.code, editToken: v.editToken }
      : null;
  } catch {
    return null;
  }
};

export const saveShareKey = (key: ShareKey): void => {
  localStorage.setItem(SHARE_KEY, JSON.stringify(key));
};

export const clearShareKey = (): void => localStorage.removeItem(SHARE_KEY);

/*
 * Where this device's roster came from, whether it was published here or pulled
 * from someone else's code. Browser storage is not durable — iOS in particular
 * evicts it, and until the site enforced HTTPS the http and https origins each
 * had their own jar — so a roster can vanish without anyone deleting it. When
 * that happens and we know the code, the app can quietly fetch it back instead
 * of showing a first-run screen to someone who has used it for weeks.
 *
 * Kept separate from the publisher's key above: a parent has a code and no
 * right to change what it points at.
 */
const SOURCE_KEY = 'rosterapp.source.v1';

export const loadSource = (): string | null => {
  try {
    const code = localStorage.getItem(SOURCE_KEY);
    return code && code.length === 8 ? code : null;
  } catch {
    return null;
  }
};

export const rememberSource = (code: string): void => {
  try {
    localStorage.setItem(SOURCE_KEY, normalizeCode(code));
  } catch {
    // Out of quota or blocked; restore is a convenience, not worth failing over.
  }
};

export const forgetSource = (): void => {
  try {
    localStorage.removeItem(SOURCE_KEY);
  } catch {
    /* as above */
  }
};

// ------------------------------------------------------------------- codes

/** `BXQ4T9KM` -> `BXQ4-T9KM`. The dash is only ever for reading aloud. */
export const formatCode = (code: string): string => {
  const c = normalizeCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};

/** Mirrors roster_normalize_code() in the database. */
export const normalizeCode = (code: string): string =>
  (code || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

// --------------------------------------------------------------------- rpc

class ShareError extends Error {}

const rpc = async <T>(
  fn: string,
  body: Record<string, unknown>,
  timeoutMs?: number,
): Promise<T> => {
  if (!BASE || !KEY) throw new ShareError('Sharing is not set up in this build.');

  // Ground wifi fails by hanging rather than refusing, and a request with no
  // ceiling means a spinner with no end. Callers that run without a user
  // watching pass a bound so they can fall back to something usable.
  const abort = timeoutMs ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify(body),
      signal: abort?.signal,
    });
  } catch {
    // Almost always no signal, which is the normal state at a game.
    throw new ShareError('No connection. This needs a signal — the saved roster still works offline.');
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message = (detail as { message?: string } | null)?.message;
    throw new ShareError(message || `The server said no (${res.status}).`);
  }

  // A void-returning function comes back 204 with no body, and res.json() throws
  // on that. Left unhandled it fails *after* the delete has already happened,
  // which strands the panel showing a code that no longer exists.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
};

// ------------------------------------------------------------------ public

type FetchedRow = {
  team_name: string;
  season: string;
  players: Player[];
  updated_at: string;
};

export type FetchedRoster = {
  teamName: string;
  season: string;
  players: Player[];
  updatedAt: string;
};

/** Null when the code doesn't match anything, which includes expired codes. */
export const fetchShared = async (
  code: string,
  timeoutMs?: number,
): Promise<FetchedRoster | null> => {
  const normalized = normalizeCode(code);
  if (normalized.length !== 8) {
    throw new ShareError('A share code is 8 characters, like BXQ4-T9KM.');
  }

  const rows = await rpc<FetchedRow[]>('roster_fetch', { p_code: normalized }, timeoutMs);
  const row = rows?.[0];
  if (!row) return null;

  return {
    teamName: row.team_name ?? '',
    season: row.season ?? '',
    // Re-id on the way in: ids came off another phone and only have to be
    // unique here, and the review table keys rows by them.
    players: (Array.isArray(row.players) ? row.players : []).map((p) => ({
      ...p,
      id: crypto.randomUUID(),
    })),
    updatedAt: row.updated_at,
  };
};

export const createShare = async (roster: Roster): Promise<ShareKey> => {
  const rows = await rpc<Array<{ code: string; edit_token: string }>>('roster_create', {
    p_team_name: roster.teamName,
    p_season: roster.season,
    p_players: roster.players,
  });

  const row = rows?.[0];
  if (!row) throw new ShareError('The server did not hand back a code.');

  const key = { code: row.code, editToken: row.edit_token };
  saveShareKey(key);
  rememberSource(key.code);
  return key;
};

export const updateShare = async (key: ShareKey, roster: Roster): Promise<void> => {
  await rpc('roster_update', {
    p_code: key.code,
    p_edit_token: key.editToken,
    p_team_name: roster.teamName,
    p_season: roster.season,
    p_players: roster.players,
  });
};

export const deleteShare = async (key: ShareKey): Promise<void> => {
  await rpc('roster_delete', { p_code: key.code, p_edit_token: key.editToken });
  clearShareKey();
  // The code is dead, so there is nothing left to restore from.
  forgetSource();
};
