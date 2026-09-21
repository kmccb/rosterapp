/*
 * A season's numbers, from its games.
 *
 * The games are the truth once any have been pasted: every screen reads the
 * sum, so the Leaders, a side's list, the Season line and the card can never
 * disagree. Counting fields add; the longest play is a max; averages are
 * recomputed from the sums, because an average of averages is wrong the
 * moment two games have different counts. With no games the whole-season
 * paste stands, exactly as before games existed.
 */

import type { PlayerStats } from './statsMatch';
import type { SeasonStats } from './statsStore';

const COUNTED = new Set([
  'yds', 'td', 'cmp', 'att', 'int', 'carries', 'rec', 'fum', 'tackles', 'solo', 'assist',
  'sacks', 'tfl', 'safety', 'intRetYds', 'ff', 'fumRec', 'fumRetYds', 'defTd', 'blocks',
  'fgMade', 'fgAtt', 'xpMade', 'xpAtt', 'pts', 'punts', 'in20', 'returns', 'sacked',
]);

const MAXED = new Set(['lng']);

/** field → [numerator, denominator, multiplier]. Added when both parts are present. */
const DERIVED: Array<[string, string, string, number]> = [
  ['ydsPerCarry', 'yds', 'carries', 1],
  ['ydsPerRec', 'yds', 'rec', 1],
  ['ydsPerPunt', 'yds', 'punts', 1],
  ['ydsPerReturn', 'yds', 'returns', 1],
  ['ydsPerAtt', 'yds', 'att', 1],
  ['cmpPct', 'cmp', 'att', 100],
];

const add = (into: Record<string, number>, from: Record<string, number>): void => {
  for (const [field, value] of Object.entries(from)) {
    if (COUNTED.has(field)) into[field] = (into[field] ?? 0) + value;
    else if (MAXED.has(field)) into[field] = Math.max(into[field] ?? -Infinity, value);
    // Averages and rates are recomputed below; anything else is not carried.
  }
};

const derive = (values: Record<string, number>): void => {
  for (const [field, top, bottom, times] of DERIVED) {
    if (values[top] !== undefined && values[bottom] !== undefined && values[bottom] !== 0) {
      values[field] = (values[top] / values[bottom]) * times;
    }
  }
};

export function seasonTotals(season: SeasonStats | undefined): Record<string, PlayerStats> {
  if (!season) return {};
  if (!season.games || season.games.length === 0) return season.byPlayer;

  const out: Record<string, PlayerStats> = {};
  for (const game of season.games) {
    for (const [key, categories] of Object.entries(game.byPlayer)) {
      const player = (out[key] ??= {});
      for (const [category, values] of Object.entries(categories)) {
        add((player[category] ??= {}), values);
      }
    }
  }
  for (const player of Object.values(out)) {
    for (const values of Object.values(player)) derive(values);
  }
  return out;
}
