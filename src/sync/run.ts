import type { ScheduleRow } from '../oh/scheduleParse';
import type { Player } from '../types';
import { nextSide, type Email, type Outcome } from './alert';
import { calendarToSchedule } from './calendar';
import { canon } from './canon';
import { checkRoster, sameRoster } from './rosterCheck';
import type { Fetched, FetchText, SourceSide, SyncState, Target } from './types';

/*
 * One activation's sync, with the network handed in. The Edge Function passes
 * a real fetch with a timeout and a size cap; the tests pass a table. Nothing
 * here writes anywhere — the caller sends `players`, `schedule` and `state` to
 * school_roster_sync_apply, which is the only thing that can.
 */

export type SyncResult = {
  /** Non-null only when the sheet passed and differs from what fans see. */
  players: Player[] | null;
  schedule: ScheduleRow[] | null;
  state: SyncState;
  emails: { side: SourceSide; email: Email }[];
};

export type Preview =
  | { ok: true; players?: Player[]; rows?: ScheduleRow[]; warnings: string[]; skipped: number }
  | { ok: false; reason: string };

// A sheet that isn't published answers 200 with Google's sign-in page; a
// calendar page copied from the browser's address bar does the same.
const isWebPage = (f: Extract<Fetched, { ok: true }>): boolean =>
  /text\/html/i.test(f.contentType) || /^\s*<(!doctype|html)/i.test(f.text);

const NOT_A_SHEET = 'the link opens a web page, not a sheet — publish the roster tab to the web as CSV';
const NOT_A_CALENDAR = 'the link opens a web page, not a calendar — copy the calendar’s iCal or subscribe link';

async function rosterOutcome(t: Target, fetchText: FetchText): Promise<{ outcome: Outcome; players: Player[] | null }> {
  const got = await fetchText(t.roster_source_url as string);
  if (!got.ok) return { outcome: { kind: 'problem', reason: `the sheet didn’t answer (${got.reason})` }, players: null };
  if (isWebPage(got)) return { outcome: { kind: 'problem', reason: NOT_A_SHEET }, players: null };
  const v = checkRoster(got.text, t.players.length);
  if (!v.ok) return { outcome: { kind: 'problem', reason: v.reason }, players: null };
  const changed = !sameRoster(t.players, v.players);
  return { outcome: { kind: 'ok', changed }, players: changed ? v.players : null };
}

async function scheduleOutcome(
  t: Target,
  fetchText: FetchText,
): Promise<{ outcome: Outcome; schedule: ScheduleRow[] | null }> {
  const got = await fetchText(t.schedule_source_url as string);
  if (!got.ok) return { outcome: { kind: 'problem', reason: `the calendar didn’t answer (${got.reason})` }, schedule: null };
  if (isWebPage(got)) return { outcome: { kind: 'problem', reason: NOT_A_CALENDAR }, schedule: null };
  const v = calendarToSchedule(got.text, { filter: t.schedule_source_filter, seasonYear: t.season });
  if (!v.ok) return { outcome: { kind: 'problem', reason: v.reason }, schedule: null };
  const changed = !t.schedule || canon(t.schedule) !== canon(v.rows);
  return { outcome: { kind: 'ok', changed }, schedule: changed ? v.rows : null };
}

export async function syncTarget(t: Target, fetchText: FetchText, now: string): Promise<SyncResult> {
  const state: SyncState = { ...t.sync_state };
  const emails: SyncResult['emails'] = [];
  let players: Player[] | null = null;
  let schedule: ScheduleRow[] | null = null;

  if (t.roster_source_url) {
    const r = await rosterOutcome(t, fetchText);
    const next = nextSide(t.sync_state.roster, r.outcome, now);
    state.roster = next.state;
    players = r.players;
    if (next.email) emails.push({ side: 'roster', email: next.email });
  }

  // Football's schedule is the directory's; the database refuses to store a
  // calendar link for it, and this refuses to read one that got there anyway.
  if (t.schedule_source_url && t.sport !== 'football') {
    const s = await scheduleOutcome(t, fetchText);
    const next = nextSide(t.sync_state.schedule, s.outcome, now);
    state.schedule = next.state;
    schedule = s.schedule;
    if (next.email) emails.push({ side: 'schedule', email: next.email });
  }

  return { players, schedule, state, emails };
}

/** The panel's Check link: the same reading, no history, nothing written. */
export async function previewSource(
  req: { kind: SourceSide; url: string; filter: string | null; season: number },
  fetchText: FetchText,
): Promise<Preview> {
  const got = await fetchText(req.url);
  if (!got.ok) return { ok: false, reason: `the link didn’t answer (${got.reason})` };
  if (req.kind === 'roster') {
    if (isWebPage(got)) return { ok: false, reason: NOT_A_SHEET };
    const v = checkRoster(got.text, 0);
    return v.ok ? { ok: true, players: v.players, warnings: v.warnings, skipped: 0 } : v;
  }
  if (isWebPage(got)) return { ok: false, reason: NOT_A_CALENDAR };
  const v = calendarToSchedule(got.text, { filter: req.filter, seasonYear: req.season });
  return v.ok ? { ok: true, rows: v.rows, warnings: [], skipped: v.skipped } : v;
}
