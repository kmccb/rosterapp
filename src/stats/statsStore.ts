/*
 * Two seasons of stats, kept beside the roster in browser storage.
 *
 * Deliberately two buckets rather than an open-ended list of seasons: the card
 * shows last year next to this year, and anything more would be a filing system
 * nobody asked for. Each bucket carries its own label so "2024-2025" can be
 * printed rather than "previous".
 */

import type { PlayerStats } from './statsMatch';

export type SeasonBucket = 'previous' | 'current';

export type SeasonStats = {
  label: string;
  /** playerKey -> category -> values. */
  byPlayer: Record<string, PlayerStats>;
  updatedAt: string;
};

export type StatsStore = Partial<Record<SeasonBucket, SeasonStats>>;

const KEY = 'rosterapp.stats.v1';

type Stored = { schema: 1; stats: StatsStore };

const isSeason = (v: unknown): v is SeasonStats => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.label === 'string' && typeof s.byPlayer === 'object' && s.byPlayer !== null;
};

/** Anything unreadable reads as "no stats", exactly like the roster does. */
export const loadStats = (): StatsStore => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const stats = parsed?.stats;
    if (!stats || typeof stats !== 'object') return {};
    const out: StatsStore = {};
    if (isSeason(stats.previous)) out.previous = stats.previous;
    if (isSeason(stats.current)) out.current = stats.current;
    return out;
  } catch {
    return {};
  }
};

export const saveStats = (stats: StatsStore): void => {
  const stored: Stored = { schema: 1, stats };
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
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
  next[bucket] = { label, byPlayer, updatedAt: new Date().toISOString() };
  saveStats(next);
  return next;
};

export const clearSeason = (bucket: SeasonBucket): StatsStore => {
  const next: StatsStore = { ...loadStats() };
  delete next[bucket];
  saveStats(next);
  return next;
};

export const clearStats = (): void => localStorage.removeItem(KEY);
