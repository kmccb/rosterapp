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
