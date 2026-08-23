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
 *
 * Distinguishes between a transient network failure (no answer at all) and a
 * dead token (the server said so). A network blip returns null without clearing,
 * so the next attempt with signal retries the same refresh token. A genuine
 * dead token (400/401) clears the session because the seller is no longer
 * authenticated.
 */
export async function freshToken(): Promise<string | null> {
  const s = loadSession();
  if (!s) return null;
  if (s.expiresAt - Date.now() > 5 * 60 * 1000) return s.accessToken;

  let res: Response;
  try {
    res = await fetch(`${supaBase}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supaKey! },
      body: JSON.stringify({ refresh_token: s.refreshToken }),
    });
  } catch {
    // No answer at all — network blip, not a dead token. Retry keeps the
    // session so the next attempt with signal will try to refresh again.
    return null;
  }

  // The server answered. If it said no, the token is dead.
  if (!res.ok) {
    clearSession();
    return null;
  }

  // Server answered ok: parse the body. If the body is garbage, the answer is
  // still an answer — the server cannot serve this refresh token. Clear the
  // session so the seller requests a new magic link.
  try {
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
    // Server answered OK but the body is corrupt. Clear the session.
    clearSession();
    return null;
  }
}
