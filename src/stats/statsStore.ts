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

const isGame = (v: unknown): v is GameStats => {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return typeof g.date === 'string' && typeof g.opponent === 'string' && typeof g.byPlayer === 'object' && g.byPlayer !== null;
};

const isSeason = (v: unknown): v is SeasonStats => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.label === 'string' && typeof s.byPlayer === 'object' && s.byPlayer !== null;
};

/** A season as stored, with a games field only if every game in it is well-formed. */
const tidySeason = (s: SeasonStats): SeasonStats => {
  const { games, ...rest } = s as SeasonStats & { games?: unknown };
  if (Array.isArray(games) && games.every(isGame)) return { ...rest, games };
  return rest;
};

/** Anything unreadable reads as "no stats", exactly like the roster does. */
export const loadStats = (): StatsStore => {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const stats = parsed?.stats;
    if (!stats || typeof stats !== 'object') return {};
    const out: StatsStore = {};
    if (isSeason(stats.previous)) out.previous = tidySeason(stats.previous);
    if (isSeason(stats.current)) out.current = tidySeason(stats.current);
    return out;
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
