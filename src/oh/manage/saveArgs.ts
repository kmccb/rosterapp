/*
 * What a save sends, worked out apart from the screen that sends it.
 *
 * school_roster_upsert has a three-way contract on most of its arguments —
 * null keeps what is stored, an empty value clears it, a full one sets it —
 * and every bug this panel has had came from a piece of screen state reaching
 * that contract by accident. So each argument has one pure function here that
 * says which of the three a given state means, pinned by activate.test.ts.
 * The screens changed shape in October 2026; these did not.
 */

import type { ParseResult } from '../../parse/rosterParse';
import type { Player } from '../../types';
import type { ScheduleRow } from '../scheduleParse';

/**
 * The parser already builds a full `Player` — id, number, name, position,
 * side, height, weight, grade — on `row.player`; this lifts it out of the row
 * wrapper (which also carries `issues` and the raw cells) into the exact
 * shape every card component keys on.
 *
 * A row the parser flagged with an issue (no number, no name, an unreadable
 * height…) is excluded, not merely noted: this screen is paste-once and
 * publish, with nobody editing a row in place the way the root app's Import
 * screen lets a coach do. A hollow player — blank number, blank name —
 * publishing into a paying customer's roster because the seller didn't
 * cross-check a count by eye is worse than the seller re-pasting a fixed
 * line. `skippedRows` below is what tells them which line to fix.
 */
export const toPlayers = (rows: ParseResult['rows']): Player[] =>
  rows.filter((r) => r.issues.length === 0).map((r) => ({ ...r.player }));

/** One row the paste couldn't turn into a player, and why. */
export type SkippedRow = { text: string; issue: string };

/**
 * The rows `toPlayers` left out, in a form the seller can match back to a
 * line in their paste: best-effort name when the parser found one, the raw
 * cells otherwise, plus the first (usually only) reason it was skipped.
 */
export const skippedRows = (rows: ParseResult['rows']): SkippedRow[] =>
  rows
    .filter((r) => r.issues.length > 0)
    .map((r) => {
      const name = [r.player.firstName, r.player.lastName].filter(Boolean).join(' ');
      const raw = r.raw.filter(Boolean).join(' ');
      return { text: name || raw || '(blank row)', issue: r.issues[0] };
    });

/**
 * The football season's own clock: July onward is this year's season, the
 * rest of the year is still last year's (playoffs run into December,
 * renewals happen the following spring). Both the default paid-through
 * date and a new row's season number read this same clock, so a seller who
 * changes the editable date field can never change which season the row
 * files under. Every sport files under the school year that starts that
 * fall, so July onward is the season year for winter and spring sports too
 * — their January games belong to the season labelled with the previous
 * autumn.
 */
export const currentSeasonYear = (): number => {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
};

/** Season + playoffs + slack. Next August this defaults right on its own. */
export const defaultPaidThrough = (): string => `${currentSeasonYear() + 1}-02-01`;

/** "Today", as the plain ISO date the paid-through field itself uses. */
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/**
 * adminApi's signed() throws the bare string "signed-out" for both a dead
 * token and a network blip that kept freshToken from answering — Manage.tsx
 * translates that sentinel before showing it; every other screen of the panel
 * goes through this, so a seller mid-paste sees a sentence instead of an
 * internal token.
 */
export const friendlyError = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  return message === 'signed-out'
    ? 'Signed out, or no signal — sign in again from the Manage screen and retry.'
    : message;
};

/**
 * The theme half of upsertRoster's contract, pulled out of save() so the
 * three cases can be pinned directly: a fresh upload sends `{logo}`, a
 * cleared logo sends `{}` (wipe the stored one), and neither sends `null`
 * (keep whatever is already stored — the renewal case, same contract as
 * `players`).
 */
export function themeArg(
  logoData: string | null,
  logoCleared: boolean,
): { logo: string } | Record<string, never> | null {
  if (logoData) return { logo: logoData };
  if (logoCleared) return {};
  return null;
}

/**
 * The schedule half of upsertRoster's contract, themeArg's twin: a fresh
 * paste sends the rows, a cleared schedule sends [] (wipe the stored one),
 * and neither sends null (keep whatever is stored — the renewal case).
 */
export function scheduleArg(rows: ScheduleRow[], cleared: boolean): ScheduleRow[] | [] | null {
  if (rows.length) return rows;
  if (cleared) return [];
  return null;
}

/**
 * The roster half of the save, with a linked source folded in: once a Google
 * Sheet owns the roster its paste box is hidden, but `pasted` and `players`
 * are still state — a paste from before the link, or one left over from an
 * aborted edit, would otherwise ride along on the next Save and silently
 * overwrite whatever the sheet last synced. A linked roster always keeps
 * what's stored, the same null the renewal case already relies on.
 */
export function rosterSaveArg(players: Player[], linked: boolean): Player[] | null {
  if (linked) return null;
  return players.length ? players : null;
}

/**
 * scheduleArg's twin for a linked calendar: the schedule section is hidden
 * while a calendar owns it, but `scheduleCleared` can still be stuck true
 * from a "Remove schedule" click made before the link, and `schedParsed`
 * from a paste typed before it. Either would otherwise reach upsertRoster as
 * `[]` — which the database reads as "wipe" — and erase what the calendar
 * just synced. Linked always keeps what's stored.
 */
export function scheduleSaveArg(
  rows: ScheduleRow[],
  cleared: boolean,
  linked: boolean,
): ScheduleRow[] | [] | null {
  if (linked) return null;
  return scheduleArg(rows, cleared);
}

/**
 * The conference half of the contract. A league is an object, so it follows
 * themeArg's shape rather than scheduleArg's: a filled form sends the
 * conference, a cleared one sends {} (wipe the stored one), and neither sends
 * null (keep whatever is stored — the renewal case).
 *
 * Half a conference is not a conference: a name with nobody in it, or members
 * under no name, is treated as an unfilled form rather than saved as a table
 * that would head itself with an empty string or stand one school up alone.
 * The name is trimmed on the way out, because it is about to be a heading.
 */
export function leagueArg(
  name: string,
  members: string[],
  cleared: boolean,
): { name: string; members: string[] } | Record<string, never> | null {
  if (name.trim() && members.length) return { name: name.trim(), members };
  if (cleared) return {};
  return null;
}
