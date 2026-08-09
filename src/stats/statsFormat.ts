/*
 * Turns a pile of numbers into the two or three that answer "how did he do?".
 *
 * Hudl prints a dozen columns per category. On a phone at arm's length that is
 * unreadable, and most of it is derived anyway — yards per carry is yards over
 * carries. So each category picks the counting stats a parent in the stands
 * actually asks about, and drops the rest.
 */

import { CATEGORY_LABEL, type StatCategory } from './statsParse';
import type { PlayerStats } from './statsMatch';

export type StatSummary = { category: StatCategory; label: string; parts: string[] };

const n = (v: number | undefined): string =>
  v === undefined ? '' : Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);

/** Only emits a part when the number is actually there. */
const part = (value: number | undefined, suffix: string): string | null =>
  value === undefined ? null : `${n(value)} ${suffix}`;

const SUMMARIES: Record<StatCategory, (v: Record<string, number>) => Array<string | null>> = {
  passing: (v) => [
    part(v.yds, 'yds'),
    part(v.td, 'TD'),
    v.cmp !== undefined && v.att !== undefined ? `${n(v.cmp)}/${n(v.att)}` : null,
    part(v.int, 'INT'),
  ],
  rushing: (v) => [
    part(v.yds, 'yds'),
    part(v.td, 'TD'),
    part(v.carries, 'car'),
    part(v.ydsPerCarry, 'avg'),
  ],
  receiving: (v) => [part(v.yds, 'yds'), part(v.td, 'TD'), part(v.rec, 'rec')],
  defense: (v) => [
    part(v.tackles, 'tkl'),
    part(v.sacks, 'sacks'),
    part(v.tfl, 'TFL'),
    part(v.int, 'INT'),
  ],
  kicking: (v) => [
    v.fgMade !== undefined && v.fgAtt !== undefined ? `${n(v.fgMade)}/${n(v.fgAtt)} FG` : null,
    v.xpMade !== undefined && v.xpAtt !== undefined ? `${n(v.xpMade)}/${n(v.xpAtt)} XP` : null,
    part(v.pts, 'pts'),
  ],
  punting: (v) => [part(v.punts, 'punts'), part(v.ydsPerPunt, 'avg'), part(v.in20, 'in 20')],
  kickReturn: (v) => [part(v.returns, 'ret'), part(v.yds, 'yds'), part(v.td, 'TD')],
  puntReturn: (v) => [part(v.returns, 'ret'), part(v.yds, 'yds'), part(v.td, 'TD')],
};

/** Order they appear on the card — offence first, then the rest. */
const ORDER: StatCategory[] = [
  'passing',
  'rushing',
  'receiving',
  'defense',
  'kicking',
  'punting',
  'kickReturn',
  'puntReturn',
];

export function summarise(stats: PlayerStats | undefined): StatSummary[] {
  if (!stats) return [];
  const out: StatSummary[] = [];

  for (const category of ORDER) {
    const values = stats[category];
    if (!values) continue;
    const parts = SUMMARIES[category](values).filter((p): p is string => Boolean(p));
    if (parts.length === 0) continue;
    out.push({ category, label: CATEGORY_LABEL[category], parts });
  }

  return out;
}

/** Categories either season has, so the two columns line up row for row. */
export function categoriesAcross(...all: Array<PlayerStats | undefined>): StatCategory[] {
  const seen = new Set<StatCategory>();
  for (const stats of all) {
    if (!stats) continue;
    for (const category of ORDER) if (stats[category]) seen.add(category);
  }
  return ORDER.filter((c) => seen.has(c));
}
