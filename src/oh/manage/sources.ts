import type { SideState, SyncState } from '../../sync/types';

/*
 * What the panel says about a link before it is saved, and about a sync
 * after. The database checks the same rules again; these exist so the seller
 * reads the reason in plain words before pressing anything.
 */

const SHEET = /^https:\/\/docs\.google\.com\/spreadsheets\//;

export function sheetLinkProblem(url: string): string | null {
  if (!SHEET.test(url)) return 'A roster link has to be a Google Sheet (https://docs.google.com/spreadsheets/…).';
  // The address-bar link answers with Google's sign-in page, not the rows.
  if (!/output=csv/.test(url)) {
    return 'That’s the sheet’s editing link. Publish it instead: File → Share → Publish to web → the roster tab → Comma-separated values (.csv), and paste that link.';
  }
  return null;
}

export const calendarUrl = (raw: string): string => raw.trim().replace(/^webcals?:\/\//i, 'https://');

export const calendarLinkProblem = (url: string): string | null =>
  /^https:\/\/\S+$/i.test(url) ? null : 'A calendar link has to start with https:// or webcal://.';

export const when = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(/[  ]/g, ' ');

export function ago(iso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `on ${when(iso)}`;
}

export function sideLine(side: SideState | undefined, now: Date): string {
  if (!side) return 'not synced yet';
  if (side.problem) return `⚠ ${side.problem}${side.problem_since ? ` — since ${when(side.problem_since)}` : ''}`;
  return side.ok_at ? `synced ${ago(side.ok_at, now)}` : 'not synced yet';
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function rowProblems(row: { sport: string; sync_state?: SyncState }): string[] {
  const out: string[] = [];
  for (const side of ['roster', 'schedule'] as const) {
    const s = row.sync_state?.[side];
    if (s?.problem) {
      out.push(`⚠ ${capital(row.sport)} ${side}: ${s.problem}${s.problem_since ? `, since ${when(s.problem_since)}` : ''}`);
    }
  }
  return out;
}
