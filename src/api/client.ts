import type { Player, Roster, Side } from '../types';

/**
 * Talks to the shared team database.
 *
 * Nothing here is on the critical path for a lookup: the app reads the local
 * cache and syncs in the background, because the whole point is answering
 * "who is #7" on congested stadium wifi.
 */

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'rosterapp.token';

export type Role = 'viewer' | 'editor';

/** False when no backend is configured — the app then runs purely on-device. */
export const isSharingConfigured = (): boolean => API_URL !== '';

export const getToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

const setToken = (token: string): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked; the session just won't survive a reload */
  }
};

export const signOut = (): void => setToken('');

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  if (!API_URL) throw new ApiError('Sharing is not set up for this build.', 0);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    // Offline, DNS failure, function asleep — all the same to the caller.
    throw new ApiError('No connection.', 0);
  }

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 401) setToken('');
    throw new ApiError(body.error ?? 'Something went wrong.', response.status);
  }
  return body as T;
};

// ------------------------------------------------------------------ shapes

type RemotePlayer = {
  id: string;
  number: string;
  first_name: string;
  last_name: string;
  position: string;
  side: string;
  height_in: number | null;
  weight_lb: number | null;
  grade: string | null;
};

export type Snapshot = {
  role: Role;
  team: { name: string; season: string };
  players: RemotePlayer[];
};

const toPlayer = (p: RemotePlayer): Player => ({
  id: p.id,
  number: p.number,
  firstName: p.first_name,
  lastName: p.last_name,
  position: p.position,
  side: (p.side as Side) ?? '',
  heightIn: p.height_in ?? undefined,
  weightLb: p.weight_lb ?? undefined,
  grade: p.grade ?? undefined,
});

export const snapshotToRoster = (snapshot: Snapshot): Roster => ({
  teamName: snapshot.team.name ?? '',
  season: snapshot.team.season ?? '',
  players: (snapshot.players ?? []).map(toPlayer),
  updatedAt: new Date().toISOString(),
});

// ------------------------------------------------------------------- calls

export const signIn = async (code: string): Promise<{ role: Role }> => {
  const result = await request<{ token: string; role: Role }>('/auth', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  setToken(result.token);
  return { role: result.role };
};

export const fetchSnapshot = (): Promise<Snapshot> => request<Snapshot>('/snapshot');

export const pushRoster = (players: Player[]): Promise<Snapshot> =>
  request<Snapshot>('/roster', {
    method: 'PUT',
    body: JSON.stringify({
      players: players.map((p) => ({
        number: p.number,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        side: p.side,
        heightIn: p.heightIn ?? null,
        weightLb: p.weightLb ?? null,
        grade: p.grade ?? null,
      })),
    }),
  });

export const pushTeam = (name: string, season: string): Promise<Snapshot> =>
  request<Snapshot>('/team', { method: 'PUT', body: JSON.stringify({ name, season }) });

export const pushCodes = (codes: { viewCode?: string; editCode?: string }): Promise<{ ok: true }> =>
  request<{ ok: true }>('/codes', { method: 'PUT', body: JSON.stringify(codes) });
