/*
 * What the panel may do, which is everything — behind is_admin in the
 * database, not behind anything here. This file just signs the calls.
 */

import { freshToken } from '../adminAuth';
import { rpc } from '../supa';

export type RosterRow = {
  school_slug: string;
  sport: string;
  season: number;
  player_count: number;
  colors: { ground: string; accent: string } | null;
  has_logo: boolean;
  published: boolean;
  paid_through: string;
  note: string;
  updated_at: string;
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
