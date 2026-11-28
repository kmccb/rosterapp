/*
 * A share as the database hands it over, turned into something safe to keep.
 *
 * A code is public and the row behind it was written by whoever published it, so
 * none of this is trusted. It matters more than an ordinary bad response would:
 * what comes through here is saved, so a value that crashes a screen crashes it
 * again on every launch afterwards.
 *
 * Apart from share.ts so it can be tested without a Supabase environment.
 */

import { sharedPlayers } from '../rosterGuard';
import { tidyStore, type StatsStore } from '../stats/statsStore';
import { sharedTheme, type Theme } from '../theme/theme';
import type { Player } from '../types';

export type FetchedRoster = {
  teamName: string;
  season: string;
  players: Player[];
  /** Empty when the publisher had none, or the database predates the column. */
  stats: StatsStore;
  /** Null when the publisher set no badge, or the database predates the column. */
  theme: Theme | null;
  updatedAt: string;
};

const words = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export const cleanFetched = (row: Record<string, unknown>): FetchedRoster => ({
  teamName: words(row.team_name, 80),
  season: words(row.season, 40),
  players: sharedPlayers(row.players),
  stats: tidyStore(row.stats),
  theme: sharedTheme(row.theme),
  updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
});
