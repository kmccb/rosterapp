/*
 * Ties "D. Xipolitas" in a Hudl table back to a player on the roster.
 *
 * Matching is by name rather than jersey number on purpose: numbers get
 * reassigned between seasons, so last year's #10 is often this year's someone
 * else. A surname plus a first initial is the strongest thing both sides share.
 *
 * Anything that isn't a single confident match is reported rather than guessed.
 * Attributing a season of tackles to the wrong brother is worse than saying so.
 */

import { fullName, type Player } from '../types';
import type { ParsedStatRow } from './statsParse';

export type PrintedName = { initial: string; last: string };

const tidy = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * "D. Xipolitas" -> D + Xipolitas. Also copes with "Xipolitas, D." and a plain
 * "Dominic Xipolitas", which is what a hand-typed table tends to look like.
 */
export const parsePrintedName = (raw: string): PrintedName => {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return { initial: '', last: '' };

  if (text.includes(',')) {
    const [last, rest = ''] = text.split(',');
    return { initial: tidy(rest).slice(0, 1), last: tidy(last) };
  }

  const parts = text.split(' ');
  if (parts.length === 1) return { initial: '', last: tidy(parts[0]) };

  return {
    initial: tidy(parts[0]).slice(0, 1),
    last: tidy(parts.slice(1).join('')),
  };
};

export type MatchOutcome =
  | { kind: 'matched'; player: Player }
  | { kind: 'ambiguous'; candidates: Player[] }
  | { kind: 'unmatched' };

export const matchName = (raw: string, players: Player[]): MatchOutcome => {
  const printed = parsePrintedName(raw);
  if (!printed.last) return { kind: 'unmatched' };

  const sameSurname = players.filter((p) => tidy(p.lastName) === printed.last);
  if (sameSurname.length === 0) return { kind: 'unmatched' };

  /*
   * The initial is checked even when only one player carries the surname. A
   * lone Xipolitas on this year's roster does not make him last year's
   * "P. Xipolitas" — that is the brother who graduated, and quietly handing his
   * season to whoever is left is the worst thing this function could do.
   *
   * A roster entry with no first name can't contradict an initial, so it stays
   * eligible; that's a roster typed surname-only, not a different person.
   */
  if (printed.initial) {
    const fits = sameSurname.filter((p) => {
      const first = tidy(p.firstName);
      return !first || first.startsWith(printed.initial);
    });
    if (fits.length === 1) return { kind: 'matched', player: fits[0] };
    if (fits.length === 0) return { kind: 'unmatched' };
    return { kind: 'ambiguous', candidates: fits };
  }

  if (sameSurname.length === 1) return { kind: 'matched', player: sameSurname[0] };
  return { kind: 'ambiguous', candidates: sameSurname };
};

/** Everything a category holds for one player, keyed by category. */
export type PlayerStats = Record<string, Record<string, number>>;

/*
 * Stats are filed under a name key, not a player id. Ids are minted fresh on
 * every import, and jersey numbers change between seasons — either would strand
 * a season of stats the first time the roster was pasted again. The surname and
 * first initial are the one thing that survives both.
 */
export const playerKey = (player: Player): string =>
  `${tidy(player.lastName)}|${tidy(player.firstName).slice(0, 1)}`;

export type MatchReport = {
  /** playerKey -> category -> values. */
  byPlayer: Record<string, PlayerStats>;
  matched: Array<{ printed: string; player: Player }>;
  /** Printed names with no one on the roster — usually players who left. */
  unmatched: string[];
  /** Printed names that fit more than one player; left out until resolved. */
  ambiguous: Array<{ printed: string; candidates: string[] }>;
};

export function matchStats(rows: ParsedStatRow[], players: Player[]): MatchReport {
  const byPlayer: Record<string, PlayerStats> = {};
  const matchedNames = new Map<string, Player>();
  const unmatched = new Set<string>();
  const ambiguous = new Map<string, string[]>();

  for (const row of rows) {
    const outcome = matchName(row.name, players);

    if (outcome.kind === 'unmatched') {
      unmatched.add(row.name);
      continue;
    }
    if (outcome.kind === 'ambiguous') {
      ambiguous.set(row.name, outcome.candidates.map(fullName));
      continue;
    }

    const { player } = outcome;
    matchedNames.set(row.name, player);
    const key = playerKey(player);
    const existing = byPlayer[key] ?? {};
    // A player can appear once per category; merge rather than overwrite so a
    // paste covering several tables accumulates.
    existing[row.category] = { ...(existing[row.category] ?? {}), ...row.values };
    byPlayer[key] = existing;
  }

  return {
    byPlayer,
    matched: [...matchedNames].map(([printed, player]) => ({ printed, player })),
    unmatched: [...unmatched],
    ambiguous: [...ambiguous].map(([printed, candidates]) => ({ printed, candidates })),
  };
}
