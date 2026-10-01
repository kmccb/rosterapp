/*
 * What the panel may do, which is everything — behind is_admin in the
 * database, not behind anything here. This file just signs the calls.
 */

import { freshToken } from '../adminAuth';
import { rpc, supaBase, supaKey } from '../supa';
import type { ScheduleRow } from '../scheduleParse';
import type { Preview } from '../../sync/run';
import type { SourceSide, SyncState } from '../../sync/types';

export type RosterRow = {
  school_slug: string;
  sport: string;
  season: number;
  player_count: number;
  colors: { ground: string; accent: string } | null;
  has_logo: boolean;
  has_schedule: boolean;
  has_league: boolean;
  published: boolean;
  paid_through: string;
  note: string;
  updated_at: string;
  /** Set by migration 0008; absent from a database that doesn't have it yet. */
  roster_source_url?: string | null;
  schedule_source_url?: string | null;
  schedule_source_filter?: string | null;
  sync_state?: SyncState;
};

const signed = async (): Promise<string> => {
  const token = await freshToken();
  if (!token) throw new Error('signed-out');
  return token;
};

export const listRosters = async (): Promise<RosterRow[]> =>
  (await rpc<RosterRow[]>('school_roster_list', {}, await signed())) ?? [];

export const upsertRoster = async (row: {
  slug: string;
  sport: string;
  season: number;
  /** null means keep the stored roster — the renewal case. */
  players: unknown[] | null;
  colors: { ground: string; accent: string } | null;
  /** null keeps the stored theme (renewal case), {} clears it, {logo} sets it. */
  theme: { logo: string } | Record<string, never> | null;
  /** null keeps the stored schedule (renewal case), [] clears it, rows set it. */
  schedule: ScheduleRow[] | [] | null;
  /** A league is an object, so it follows the theme's contract rather than the
   * schedule's: null keeps the stored conference, {} clears it, an object
   * sets it. */
  league: { name: string; members: string[] } | Record<string, never> | null;
  published: boolean;
  paidThrough: string;
  note: string;
}): Promise<void> => {
  await rpc<null>(
    'school_roster_upsert',
    {
      p_slug: row.slug,
      p_sport: row.sport,
      p_season: row.season,
      p_players: row.players,
      p_colors: row.colors,
      p_theme: row.theme,
      p_schedule: row.schedule,
      p_league: row.league,
      p_published: row.published,
      p_paid_through: row.paidThrough,
      p_note: row.note,
    },
    await signed(),
  );
};

export const deleteRoster = async (slug: string, sport: string, season: number): Promise<void> => {
  await rpc<null>(
    'school_roster_delete',
    { p_slug: slug, p_sport: sport, p_season: season },
    await signed(),
  );
};

export const setSources = async (r: {
  slug: string;
  sport: string;
  season: number;
  /** null unlinks; the last synced roster stays. */
  rosterUrl: string | null;
  scheduleUrl: string | null;
  scheduleFilter: string | null;
}): Promise<void> => {
  await rpc<null>(
    'school_roster_set_sources',
    {
      p_slug: r.slug,
      p_sport: r.sport,
      p_season: r.season,
      p_roster_url: r.rosterUrl,
      p_schedule_url: r.scheduleUrl,
      p_schedule_filter: r.scheduleFilter,
    },
    await signed(),
  );
};

/*
 * The sync-sources Edge Function, called with the seller's own session. It
 * checks that session against the database before it does anything.
 */
const callSync = async <T>(body: Record<string, unknown>): Promise<T> => {
  const token = await signed();
  const res = await fetch(`${supaBase}/functions/v1/sync-sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supaKey ?? '', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const answer = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !answer) throw new Error(answer?.error ?? `The sync service said no (${res.status}).`);
  return answer;
};

export const checkSource = (r: { kind: SourceSide; url: string; filter: string | null; season: number }) =>
  callSync<Preview>({ action: 'check', ...r });

export const syncNow = (slug: string, sport: string, season: number) =>
  callSync<{ state: SyncState }>({ action: 'sync', slug, sport, season });
