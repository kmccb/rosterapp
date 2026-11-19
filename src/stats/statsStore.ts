/*
 * Two seasons of stats, kept beside the roster in browser storage.
 *
 * Deliberately two buckets rather than an open-ended list of seasons: the card
 * shows last year next to this year, and anything more would be a filing system
 * nobody asked for. Each bucket carries its own label so "2024-2025" can be
 * printed rather than "previous".
 */

import type { PlayerStats } from './statsMatch';
import { scopedKey } from '../scope';

export type SeasonBucket = 'previous' | 'current';

/** One game, pasted from Hudl's game page. `date` is YYYY-MM-DD; `opponent` is as typed. */
export type GameStats = {
  date: string;
  opponent: string;
  /** playerKey -> category -> values. */
  byPlayer: Record<string, PlayerStats>;
};

export type SeasonStats = {
  label: string;
  /** playerKey -> category -> values. The whole-season paste; ignored while games exist. */
  byPlayer: Record<string, PlayerStats>;
  updatedAt: string;
  /** Kept sorted by date. When present, the season's numbers are the sum of these. */
  games?: GameStats[];
};

export type StatsStore = Partial<Record<SeasonBucket, SeasonStats>>;

const KEY = () => scopedKey('rosterapp.stats.v1');

type Stored = { schema: 1; stats: StatsStore };

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isGame = (v: unknown): v is GameStats =>
  isPlain(v) && typeof v.date === 'string' && typeof v.opponent === 'string' && isPlain(v.byPlayer);

const isSeason = (v: unknown): v is SeasonStats =>
  isPlain(v) && typeof v.label === 'string' && isPlain(v.byPlayer);

/*
 * Stats travel in shares, so these names can be anybody's. seasonTotals builds
 * its answer by assigning to whatever key it is given, and JSON.parse makes
 * `__proto__` an ordinary key: one crafted game would write onto Object.prototype
 * for the whole page.
 */
const UNSAFE_KEY = new Set(['__proto__', 'constructor', 'prototype']);

const safeEntries = (v: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(v).filter(([key]) => !UNSAFE_KEY.has(key));

/** Numbers only: the card calls toFixed on these, and a null or a string throws there. */
const cleanValues = (v: Record<string, unknown>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [field, value] of safeEntries(v)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[field] = value;
  }
  return out;
};

const cleanByPlayer = (v: Record<string, unknown>): Record<string, PlayerStats> => {
  const out: Record<string, PlayerStats> = {};
  for (const [key, player] of safeEntries(v)) {
    if (!isPlain(player)) continue;
    const categories: PlayerStats = {};
    for (const [category, values] of safeEntries(player)) {
      if (isPlain(values)) categories[category] = cleanValues(values);
    }
    out[key] = categories;
  }
  return out;
};

const cleanGame = (g: GameStats): GameStats => ({
  date: g.date.slice(0, 20),
  opponent: g.opponent.slice(0, 80),
  byPlayer: cleanByPlayer(g.byPlayer),
});

/**
 * A season as stored, keeping only the well-formed games. One corrupt entry
 * used to drop the whole list — and the next save would write that loss back
 * — so a bad game is dropped on its own and the good ones stay; `games` is
 * omitted entirely once none remain, rather than kept as an empty list.
 */
/**
 * Games pasted before 2026-11-09 filed a game page's Tk (solo tackles only)
 * as `tackles`, so every defender's season came up short by his assists. Such
 * a game has `tackles` with no `solo`; it is read the way the parser now files
 * it, so nobody has to paste the season again.
 */
const upgradeGame = (g: GameStats): GameStats => {
  let changed = false;
  const byPlayer: Record<string, PlayerStats> = {};
  for (const [key, player] of Object.entries(g.byPlayer)) {
    const d = player?.defense;
    if (d && d.tackles !== undefined && d.solo === undefined) {
      byPlayer[key] = { ...player, defense: { ...d, solo: d.tackles, tackles: d.tackles + (d.assist ?? 0) } };
      changed = true;
    } else {
      byPlayer[key] = player;
    }
  }
  return changed ? { ...g, byPlayer } : g;
};

const tidySeason = (s: SeasonStats): SeasonStats => {
  const games: unknown = s.games;
  const kept = Array.isArray(games) ? games.filter(isGame).map(cleanGame).map(upgradeGame) : [];
  const season: SeasonStats = {
    label: s.label.slice(0, 60),
    byPlayer: cleanByPlayer(s.byPlayer),
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : '',
  };
  return kept.length ? { ...season, games: kept } : season;
};

/** Applies the same season/game rules `loadStats` uses to stats already in memory. */
export const tidyStore = (stats: unknown): StatsStore => {
  if (!stats || typeof stats !== 'object') return {};
  const s = stats as Partial<Record<SeasonBucket, unknown>>;
  const out: StatsStore = {};
  if (isSeason(s.previous)) out.previous = tidySeason(s.previous);
  if (isSeason(s.current)) out.current = tidySeason(s.current);
  return out;
};

/** Anything unreadable reads as "no stats", exactly like the roster does. */
export const loadStats = (): StatsStore => {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return tidyStore(parsed?.stats);
  } catch {
    return {};
  }
};

export const saveStats = (stats: StatsStore): void => {
  const stored: Stored = { schema: 1, stats };
  try {
    localStorage.setItem(KEY(), JSON.stringify(stored));
  } catch (err) {
    console.error('Could not save the stats', err);
    throw new Error('Could not save the stats — device storage may be full or blocked.');
  }
};

export const putSeason = (
  bucket: SeasonBucket,
  label: string,
  byPlayer: Record<string, PlayerStats>,
): StatsStore => {
  const next: StatsStore = { ...loadStats() };
  const games = next[bucket]?.games;
  next[bucket] = { label, byPlayer, updatedAt: new Date().toISOString(), ...(games ? { games } : {}) };
  saveStats(next);
  return next;
};

export const clearSeason = (bucket: SeasonBucket): StatsStore => {
  const next: StatsStore = { ...loadStats() };
  delete next[bucket];
  saveStats(next);
  return next;
};

export const clearStats = (): void => localStorage.removeItem(KEY());

const byDate = (a: GameStats, b: GameStats): number => a.date.localeCompare(b.date);

/** Files one game under This season; a game on the same date is replaced, not doubled. */
export const putGame = (
  date: string,
  opponent: string,
  byPlayer: Record<string, PlayerStats>,
): StatsStore => {
  const next: StatsStore = { ...loadStats() };
  const current: SeasonStats = next.current ?? { label: 'This season', byPlayer: {}, updatedAt: '' };
  const games = (current.games ?? []).filter((g) => g.date !== date);
  games.push({ date, opponent, byPlayer });
  games.sort(byDate);
  next.current = { ...current, games, updatedAt: new Date().toISOString() };
  saveStats(next);
  return next;
};

export const removeGame = (date: string): StatsStore => {
  const next: StatsStore = { ...loadStats() };
  if (!next.current?.games) return next;
  const games = next.current.games.filter((g) => g.date !== date);
  next.current = { ...next.current, games, updatedAt: new Date().toISOString() };
  saveStats(next);
  return next;
};
