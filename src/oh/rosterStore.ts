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
export type SchoolRoster = {
  season: number;
  players: Player[];
  colors: SchoolColors;
  /** The school's badge, as a data URI — never a bare path or remote URL. */
  logo: string | null;
};

/** What the fetch answers with before it is sanitized: a roster plus a theme
 * that may or may not carry a usable logo. */
type RawRosterBody = {
  season: number;
  players: Player[];
  colors: unknown;
  theme?: { logo?: unknown };
};

export const cacheKey = (slug: string): string => `oh.roster.${slug}`;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Either the default look (null) or two real hex colors — never a shape in
 * between. A colors value that is half-right (a missing accent, a CSS name
 * instead of hex) must fall back to the default theme rather than hand
 * School.tsx something it will paint verbatim into a CSS variable.
 */
const validColors = (v: unknown): SchoolColors => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return null;
  const c = v as Partial<{ ground: unknown; accent: unknown }>;
  return typeof c.ground === 'string' &&
    typeof c.accent === 'string' &&
    HEX.test(c.ground) &&
    HEX.test(c.accent)
    ? { ground: c.ground, accent: c.accent }
    : null;
};

/**
 * A logo is only ever an uploaded badge — a data URI — never a bare path or a
 * remote URL. Unlike the root app's theme, a shared roster page has no build
 * of its own to serve a baked badge from, so anything that isn't a data URI
 * is not a logo this page can use.
 */
const validLogo = (v: unknown): string | null =>
  typeof v === 'string' && v.startsWith('data:image/') ? v : null;

/** Kept strict so a cache written by a future shape cannot crash a screen. */
export const parseCached = (raw: string | null): SchoolRoster | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SchoolRoster>;
    return typeof v?.season === 'number' && Array.isArray(v?.players)
      ? ({
          season: v.season,
          players: v.players,
          colors: validColors(v.colors),
          logo: validLogo(v.logo),
        } as SchoolRoster)
      : null;
  } catch {
    return null;
  }
};

export async function loadSchoolRoster(slug: string): Promise<SchoolRoster | null> {
  if (!supaAvailable) return null;

  try {
    const body = await rpc<RawRosterBody | null>('school_roster_fetch', {
      p_slug: slug,
      p_sport: 'football',
    });
    if (body && typeof body.season === 'number' && Array.isArray(body.players)) {
      // Same shape guard as the cache: the network answer gets sanitized
      // before it reaches School.tsx, not just before it reaches localStorage.
      const clean: SchoolRoster = {
        season: body.season,
        players: body.players,
        colors: validColors(body.colors),
        logo: validLogo(body.theme?.logo),
      };
      if (slug === chosenSlug()) {
        try {
          localStorage.setItem(cacheKey(slug), JSON.stringify(clean));
        } catch {
          // A full jar must not fail the fetch that succeeded.
        }
      }
      return clean;
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
