import type { Player } from '../types';
import type { ScheduleRow } from '../oh/scheduleParse';

/** One half of a row's sync history, as stored in school_roster.sync_state. */
export type SideState = {
  ok_at: string | null;
  problem: string | null;
  problem_since: string | null;
  /** True once the seller has been emailed about `problem`. */
  alerted: boolean;
  changed_at: string | null;
};

export type SyncState = { roster?: SideState; schedule?: SideState };

export type SourceSide = 'roster' | 'schedule';

/** A row of school_roster_sync_targets(). */
export type Target = {
  slug: string;
  sport: string;
  season: number;
  roster_source_url: string | null;
  schedule_source_url: string | null;
  schedule_source_filter: string | null;
  sync_state: SyncState;
  players: Player[];
  schedule: ScheduleRow[] | null;
};

export type Fetched = { ok: true; text: string; contentType: string } | { ok: false; reason: string };

export type FetchText = (url: string) => Promise<Fetched>;
