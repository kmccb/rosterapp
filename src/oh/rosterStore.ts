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
import type { ScheduleRow } from './scheduleParse';
import { chosenSlug } from './store';
import { rpc, supaAvailable } from './supa';

export type SchoolColors = { ground: string; accent: string } | null;
/** The conference the school told us about: a name to head the table with and
 * the directory slugs of everyone in it. Nobody scrapes this — it arrives
 * through the concierge, or not at all. */
export type SchoolLeague = { name: string; members: string[] } | null;
export type SchoolRoster = {
  season: number;
  players: Player[];
  colors: SchoolColors;
  /** The school's badge, as a data URI — never a bare path or remote URL. */
  logo: string | null;
  schedule: ScheduleRow[] | null;
  league: SchoolLeague;
};

/** Who this school is, before a sport is chosen: the sports it has live and
 * the look to draw the whole page — hub included — in. */
export type SchoolIdentity = {
  sports: string[];
  colors: SchoolColors;
  logo: string | null;
};

/** What the fetch answers with before it is sanitized: a roster plus a theme
 * that may or may not carry a usable logo. */
type RawRosterBody = {
  season: number;
  players: Player[];
  colors: unknown;
  theme?: { logo?: unknown };
  schedule?: unknown;
  league?: unknown;
};

export const cacheKey = (slug: string, sport: string): string => `oh.roster.${slug}.${sport}`;

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
 *
 * This is a full match, not a prefix check, and that distinction is the
 * whole point: this value is substituted straight into `url("...")` inside a
 * CSS custom property in look.ts. Custom properties are parsed by the
 * browser as a raw <declaration-value> — IACVT does not save you here; there
 * is no CSS-value-type check standing between the stored string and the
 * stylesheet, so "it's going into a CSS variable" buys no safety on its own.
 * A value that starts with
 * `data:image/` can still close the surrounding quote and comma its way into
 * a second, attacker-chosen `url(...)` right behind it. Requiring the whole
 * string to be a `data:image/<type>;base64,<payload>` — nothing else,
 * anchored both ends — rules out the quote and the comma that smuggling
 * needs; there's no character left in the allowed alphabet to carry one.
 */
const LOGO_DATA_URI = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

const validLogo = (v: unknown): string | null =>
  typeof v === 'string' && LOGO_DATA_URI.test(v) ? v : null;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * All rows well-formed or no schedule at all — the colors rule. Half a
 * schedule rendered as if it were whole would misinform quietly, which is
 * worse than the tab simply not appearing.
 */
const validSchedule = (v: unknown): ScheduleRow[] | null => {
  if (!Array.isArray(v) || v.length === 0) return null;
  const rows: ScheduleRow[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) return null;
    const r = item as Record<string, unknown>;
    if (typeof r.date !== 'string' || !ISO_DATE.test(r.date)) return null;
    if (typeof r.opponent !== 'string' || !r.opponent.trim()) return null;
    if (typeof r.home !== 'boolean') return null;
    const row: ScheduleRow = { date: r.date, opponent: r.opponent, home: r.home };
    if (r.time !== undefined) {
      if (typeof r.time !== 'string') return null;
      row.time = r.time;
    }
    if (r.score !== undefined) {
      const s = r.score as Record<string, unknown>;
      if (typeof s !== 'object' || s === null) return null;
      if (typeof s.us !== 'number' || typeof s.them !== 'number'
          || !Number.isFinite(s.us) || !Number.isFinite(s.them)) return null;
      row.score = { us: s.us, them: s.them };
    }
    rows.push(row);
  }
  return rows;
};

/**
 * The whole conference or none of it — the schedule rule again. A standings
 * table missing a member it should have had is a table that says the wrong
 * school is top, which is worse than no League tab at all.
 */
const validLeague = (v: unknown): SchoolLeague => {
  if (typeof v !== 'object' || v === null) return null;
  const l = v as Record<string, unknown>;
  if (typeof l.name !== 'string' || !l.name.trim()) return null;
  if (!Array.isArray(l.members) || l.members.length === 0) return null;
  const members: string[] = [];
  for (const m of l.members) {
    if (typeof m !== 'string' || !m.trim()) return null;
    members.push(m);
  }
  return { name: l.name, members };
};

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
          schedule: validSchedule(v.schedule),
          league: validLeague(v.league),
        } as SchoolRoster)
      : null;
  } catch {
    return null;
  }
};

export async function loadSchoolRoster(slug: string, sport: string): Promise<SchoolRoster | null> {
  if (!supaAvailable) return null;

  try {
    const body = await rpc<RawRosterBody | null>('school_roster_fetch', {
      p_slug: slug,
      p_sport: sport,
    });
    if (body && typeof body.season === 'number' && Array.isArray(body.players)) {
      // Same shape guard as the cache: the network answer gets sanitized
      // before it reaches School.tsx, not just before it reaches localStorage.
      const clean: SchoolRoster = {
        season: body.season,
        players: body.players,
        colors: validColors(body.colors),
        logo: validLogo(body.theme?.logo),
        schedule: validSchedule(body.schedule),
        league: validLeague(body.league),
      };
      if (slug === chosenSlug()) {
        try {
          localStorage.setItem(cacheKey(slug, sport), JSON.stringify(clean));
        } catch {
          // A full jar must not fail the fetch that succeeded.
        }
      }
      return clean;
    }
    // The function answered null: no live roster. Clear a stale cache so an
    // expired school goes dark on phones too, not just on the server.
    if (slug === chosenSlug()) localStorage.removeItem(cacheKey(slug, sport));
    return null;
  } catch {
    // No signal — the kept copy is the point of keeping one.
    return parseCached(localStorage.getItem(cacheKey(slug, sport)));
  }
}

const sportsKey = (slug: string): string => `oh.livesports.${slug}`;

/**
 * A school's identity out of anything that has ever been an answer to it.
 *
 * Two shapes reach this. The one migration 0007 introduced — an object with
 * sports, colors and a theme — and the bare array of sport names that came
 * before it. The old shape has to keep working in two places at once: it is
 * what is sitting in every returning reader's jar today, and it is what the
 * live function still answers with through the window between this deploy
 * and the migration being applied by hand. Discarding it would send both of
 * them back to a football-only page for no reason; reading it as a school
 * with sports but no look of its own is exactly what it is.
 *
 * Junk is null, never an empty school — "couldn't ask" and "sells nothing"
 * are different answers and the hub draws them differently.
 */
const asIdentity = (v: unknown): SchoolIdentity | null => {
  if (Array.isArray(v)) {
    return v.every((s) => typeof s === 'string')
      ? { sports: v as string[], colors: null, logo: null }
      : null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as { sports?: unknown; colors?: unknown; logo?: unknown; theme?: { logo?: unknown } };
  if (!Array.isArray(o.sports) || !o.sports.every((s) => typeof s === 'string')) return null;
  return {
    sports: o.sports as string[],
    colors: validColors(o.colors),
    // The network answers with the stored shape — a theme carrying the badge
    // — and the jar holds the sanitized one, where the badge is already a
    // plain string. Same value, two spellings, and this function is the one
    // door both come through.
    logo: validLogo(o.logo) ?? validLogo(o.theme?.logo),
  };
};

/**
 * The kept copy of who this school is, read without asking anyone.
 *
 * The network answer gates the first paint — a reader who lands on football
 * and is bounced to a hub a beat later has been lied to — but a returning
 * reader already knows the answer, and making them wait on a round trip for
 * it (or on a 404, through the whole window between deploy and migration
 * 0007) buys nothing. Same validation as the fetch's own fallback path,
 * because it is the same jar.
 */
export const keptSchoolSports = (slug: string): SchoolIdentity | null => {
  try {
    const raw = localStorage.getItem(sportsKey(slug));
    return raw ? asIdentity(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
};

/**
 * Who this school is: the sports it has live, and the colors and crest to
 * paint every screen of it — the hub included, which carries no roster and
 * so had nowhere else to get a look from.
 *
 * An empty sports list is a real answer — no paid sports; null means the
 * question couldn't be asked (no signal and no kept copy), and the caller
 * falls back to behaving as the football-only site it was.
 */
export async function loadSchoolSports(slug: string): Promise<SchoolIdentity | null> {
  if (!supaAvailable) return null;
  try {
    const identity = asIdentity(await rpc<unknown>('school_roster_sports', { p_slug: slug }));
    if (identity) {
      if (slug === chosenSlug()) {
        try {
          localStorage.setItem(sportsKey(slug), JSON.stringify(identity));
        } catch {
          // A full jar must not fail the fetch that succeeded.
        }
      }
      return identity;
    }
    return null;
  } catch {
    return keptSchoolSports(slug);
  }
}
