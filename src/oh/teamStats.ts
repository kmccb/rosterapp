/*
 * A team's season stats, as a committed file.
 *
 * public/oh/stats/<slug>-<sport>.json is written by scripts/maxpreps.mjs on a
 * schedule and reaches the site the way the directory does: a commit, then the
 * ordinary deploy. So this is a fetch from our own origin and nothing here
 * knows or cares that the numbers began on MaxPreps — a coach on Hudl could be
 * fed by a different script into the same file.
 *
 * The file holds rows as they were printed, one per player per category, and
 * not a table keyed by player. Who a row belongs to is decided here on the
 * page, against the roster the page actually has (`matchTeamStats`, below) — a
 * row for somebody the roster does not carry is simply not shown, rather than
 * shown under a name nobody can look up.
 *
 * Most schools have no such file and never will; a 404 is the normal answer
 * and means no Stats tab, not a fault.
 */

import { CATEGORY_LABEL, type ParsedStatRow, type StatCategory } from '../stats/statsParse';
import type { Snapshot } from '../maxpreps/weeks';
import { playerKey, type PlayerStats } from '../stats/statsMatch';
import type { Player } from '../types';
import { isDemo } from './demo';
import { chosenSlug } from './store';

export type TeamStats = {
  /** The day the numbers last changed, `YYYY-MM-DD`. */
  updated: string;
  /** Who keeps them, printed under the tab: "MaxPreps". */
  source: string;
  rows: ParsedStatRow[];
  /** The totals after each game since tracking began, oldest first. */
  snapshots: Snapshot[];
};

const KEPT = (slug: string, sport: string): string => `oh.stats.${slug}.${sport}`;

const isCategory = (v: unknown): v is StatCategory =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, v);

/**
 * Junk is treated as nothing, row by row. The file is written by a script but
 * it is still a file, and one bad value would otherwise print "NaN yds" beside
 * a kid's name.
 */
const cleanRows = (list: unknown): ParsedStatRow[] => {
  if (!Array.isArray(list)) return [];
  const rows: ParsedStatRow[] = [];
  for (const r of list as Array<Record<string, unknown> | null>) {
    if (typeof r !== 'object' || r === null) continue;
    if (typeof r.name !== 'string' || !r.name.trim() || !isCategory(r.category)) continue;
    if (typeof r.values !== 'object' || r.values === null) continue;
    const values: Record<string, number> = {};
    for (const [field, n] of Object.entries(r.values)) {
      if (typeof n === 'number' && Number.isFinite(n)) values[field] = n;
    }
    if (Object.keys(values).length === 0) continue;
    rows.push({
      name: r.name,
      number: typeof r.number === 'string' ? r.number : '',
      category: r.category,
      values,
    });
  }
  return rows;
};

export const asTeamStats = (v: unknown): TeamStats | null => {
  if (typeof v !== 'object' || v === null) return null;
  const file = v as Record<string, unknown>;
  if (!Array.isArray(file.rows)) return null;
  const rows = cleanRows(file.rows);
  if (rows.length === 0) return null;

  // The copies of the totals the weeks are worked out from. Each is checked
  // the way the totals are; one that is not a copy is left out, and a file
  // with none simply has no weeks yet.
  const snapshots: Snapshot[] = [];
  for (const s of Array.isArray(file.snapshots) ? (file.snapshots as Array<Record<string, unknown> | null>) : []) {
    if (typeof s !== 'object' || s === null || !Number.isInteger(s.games) || (s.games as number) < 1) continue;
    const rows = cleanRows(s.rows);
    // A copy with nothing usable in it would make the next week the whole
    // season; it is left out, and that week runs into the one before.
    if (rows.length) snapshots.push({ games: s.games as number, rows });
  }

  return {
    updated: typeof file.updated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(file.updated) ? file.updated : '',
    source: typeof file.source === 'string' ? file.source.slice(0, 40) : '',
    rows,
    snapshots,
  };
};

/** Network first, then whatever was kept — the same rule as the season. */
export async function loadTeamStats(slug: string, sport: string): Promise<TeamStats | null> {
  try {
    const res = await fetch(`/oh/stats/${slug}-${sport}.json?t=${Date.now()}`, { cache: 'no-store' });
    // A host can answer a missing file with a page of its own and a 200, so
    // "ok" is not enough to call it a stats file; the parse below decides.
    if (res.ok) {
      const stats = asTeamStats(await res.json().catch(() => null));
      // Kept for the followed school only, and never by the demo — the season's
      // rule, for the season's reasons.
      if (stats && !isDemo() && slug === chosenSlug()) {
        try {
          localStorage.setItem(KEPT(slug, sport), JSON.stringify(stats));
        } catch {
          // A full jar must not fail a fetch that already succeeded.
        }
      }
      // A school whose file has gone is a school without stats now, not one
      // whose last copy should be shown for ever.
      if (!stats && !isDemo()) localStorage.removeItem(KEPT(slug, sport));
      return stats;
    }
    // Gone is gone: a school that stopped paying, or stopped keeping stats,
    // must not go on showing its last copy out of a phone.
    if (res.status === 404 || res.status === 410) {
      if (!isDemo()) localStorage.removeItem(KEPT(slug, sport));
      return null;
    }
  } catch {
    /* no signal */
  }
  if (isDemo()) return null;
  try {
    return asTeamStats(JSON.parse(localStorage.getItem(KEPT(slug, sport)) ?? 'null'));
  } catch {
    return null;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const letters = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * Whose row is whose, on this page.
 *
 * Poland's paste is matched on a surname and an initial because that is all
 * Hudl prints. This file has more — the name in full, and the jersey from the
 * same season — and uses it, because the paid page has nowhere to show a
 * seller the names that fit nobody: whatever is not matched here is simply
 * absent, so it had better be absent for a reason.
 *
 *  - The whole name, letter for letter, when exactly one player has it.
 *  - Failing that, the jersey, provided that player's surname is somewhere in
 *    the printed name — "John Smith Jr." on a roster that says Smith, or a
 *    Mike the stats call Michael. The number alone is never enough: a roster
 *    out of date by one reassigned jersey would hand a season to a stranger.
 *
 * What comes back is keyed the way `src/stats` keys it, surname and initial,
 * since that is what the leader tables and the card look up. Two players on
 * the roster who share that key — brothers with one initial — cannot be told
 * apart downstream, so neither is given anything: no line on a card is
 * recoverable, the wrong brother's nine touchdowns is not. A field arriving
 * twice for one player in one category is a duplicate entry upstream, and the
 * first is kept rather than the two being guessed into one.
 */
export function matchTeamStats(
  rows: ParsedStatRow[],
  players: Player[],
): Record<string, PlayerStats> {
  const keyCount = new Map<string, number>();
  for (const p of players) keyCount.set(playerKey(p), (keyCount.get(playerKey(p)) ?? 0) + 1);

  const find = (row: ParsedStatRow): Player | null => {
    const printed = letters(row.name);
    const byName = players.filter((p) => letters(p.firstName + p.lastName) === printed);
    if (byName.length === 1) return byName[0];
    if (byName.length > 1 || !row.number) return null;
    const byJersey = players.filter(
      (p) => p.number === row.number && letters(p.lastName) && printed.includes(letters(p.lastName)),
    );
    return byJersey.length === 1 ? byJersey[0] : null;
  };

  const out: Record<string, PlayerStats> = {};
  for (const row of rows) {
    const player = find(row);
    if (!player) continue;
    const key = playerKey(player);
    if (keyCount.get(key) !== 1) continue;
    const stats = (out[key] ??= {});
    stats[row.category] = { ...row.values, ...(stats[row.category] ?? {}) };
  }
  return out;
}

/** "2026-10-10" → "Oct 10". A calendar day, never shifted by a zone. */
export const updatedLabel = (updated: string): string => {
  const m = updated.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m && MONTHS[Number(m[1]) - 1] ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : '';
};
