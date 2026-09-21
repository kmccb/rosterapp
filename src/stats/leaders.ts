/*
 * What the Stats tab prints: who leads each category, who has done anything
 * on each side of the ball, and how a game is named on a player's page.
 *
 * Leaders rank on one headline number per category - the one a parent in the
 * stands asks about - and keep a tie at third rather than cutting it, because
 * "who is third" is the question and two kids can be. A side is a set of
 * categories, not a roster column: a running back who returns kicks belongs on
 * Offense and on Special, and this is the only way he lands on both.
 */

import { summarise, type StatSummary } from './statsFormat';
import { CATEGORY_LABEL, type StatCategory } from './statsParse';
import { playerKey, type PlayerStats } from './statsMatch';
import { fullName, type Player } from '../types';

export type LeaderRow = { key: string; number: string; name: string; value: number; parts: string[] };
export type LeaderBlock = { category: StatCategory; label: string; rows: LeaderRow[] };
export type SideRow = { key: string; number: string; name: string; lines: StatSummary[] };
export type Side = 'offense' | 'defense' | 'special';

/** Card order: offence first, then the rest. */
const ORDER: StatCategory[] = [
  'passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting', 'kickReturn', 'puntReturn',
];

const HEADLINE: Record<StatCategory, string> = {
  passing: 'yds',
  rushing: 'yds',
  receiving: 'yds',
  defense: 'tackles',
  kicking: 'pts',
  punting: 'ydsPerPunt',
  kickReturn: 'yds',
  puntReturn: 'yds',
};

export const SIDE_CATEGORIES: Record<Side, StatCategory[]> = {
  offense: ['passing', 'rushing', 'receiving'],
  defense: ['defense'],
  special: ['kicking', 'punting', 'kickReturn', 'puntReturn'],
};

const TOP = 3;

const byKey = (players: Player[]): Map<string, Player> =>
  new Map(players.map((p) => [playerKey(p), p]));

/** "07" sorts as 7; two players on one number fall back to their names. */
const numberOrder = (a: { number: string; name: string }, b: { number: string; name: string }): number =>
  Number(a.number) - Number(b.number) || a.name.localeCompare(b.name);

export function leaders(totals: Record<string, PlayerStats>, players: Player[]): LeaderBlock[] {
  const roster = byKey(players);
  const blocks: LeaderBlock[] = [];

  for (const category of ORDER) {
    const field = HEADLINE[category];
    const rows: LeaderRow[] = [];

    for (const [key, stats] of Object.entries(totals)) {
      const player = roster.get(key);
      const value = stats[category]?.[field];
      if (!player || value === undefined) continue;
      const summary = summarise({ [category]: stats[category] })[0];
      rows.push({ key, number: player.number, name: fullName(player), value, parts: summary?.parts ?? [] });
    }
    if (rows.length === 0) continue;

    rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const cut = rows[TOP - 1]?.value;
    const kept = rows.filter((r, i) => i < TOP || r.value === cut);
    blocks.push({ category, label: CATEGORY_LABEL[category], rows: kept });
  }

  return blocks;
}

export function bySide(totals: Record<string, PlayerStats>, players: Player[], side: Side): SideRow[] {
  const roster = byKey(players);
  const wanted = new Set<string>(SIDE_CATEGORIES[side]);
  const rows: SideRow[] = [];

  for (const [key, stats] of Object.entries(totals)) {
    const player = roster.get(key);
    if (!player) continue;
    const onSide: PlayerStats = {};
    for (const [category, values] of Object.entries(stats)) {
      if (wanted.has(category)) onSide[category] = values;
    }
    const lines = summarise(onSide);
    if (lines.length === 0) continue;
    rows.push({ key, number: player.number, name: fullName(player), lines });
  }

  return rows.sort(numberOrder);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-04", "Field" → "Sep 4 · Field". The date is a calendar day, never shifted by a zone. */
export function gameLabel(date: string, opponent: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : date;
  return `${day} · ${opponent}`;
}
