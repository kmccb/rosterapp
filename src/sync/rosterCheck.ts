import { numberKey, parseRoster } from '../parse/rosterParse';
import type { Player } from '../types';
import { canon } from './canon';

/*
 * A coach's sheet, read the way a paste is.
 *
 * parseRoster already splits comma rows with a quote-aware splitter, so this
 * adds only what a published sheet brings that a paste doesn't — a BOM, a
 * title row above the header, empty ",,,," rows — and the rules for when a
 * sheet is too broken to put in front of fans. A refused sheet changes
 * nothing: the page keeps the last roster that passed.
 */

export type RosterVerdict =
  | { ok: true; players: Player[]; warnings: string[] }
  | { ok: false; reason: string };

const MAX_ROWS = 300;

export const stripBom = (text: string): string => text.replace(/^﻿/, '');

const isEmptyRow = (line: string): boolean => /^[\s,;\t]*$/.test(line);

/** Fewer than two filled cells: "2026 Varsity Roster" sitting above the header. */
const isTitleRow = (line: string): boolean =>
  line.split(',').filter((c) => c.replace(/"/g, '').trim() !== '').length < 2;

export function tidySheet(text: string): string {
  const lines = stripBom(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => !isEmptyRow(l));
  let start = 0;
  while (start < lines.length - 1 && isTitleRow(lines[start])) start += 1;
  return lines.slice(start).join('\n');
}

const label = (p: Player, raw: string[]): string => {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return name || raw.filter(Boolean).join(' ') || '(blank row)';
};

export function checkRoster(text: string, previousCount: number): RosterVerdict {
  const { rows } = parseRoster(tidySheet(text));

  if (rows.length === 0) return { ok: false, reason: 'the sheet has no player rows' };
  if (rows.length > MAX_ROWS) {
    return { ok: false, reason: `the sheet has ${rows.length} rows, and a roster stops at ${MAX_ROWS}` };
  }

  const unnamed = rows.filter((r) => !r.player.number || (!r.player.firstName && !r.player.lastName));
  if (unnamed.length) {
    const lead = unnamed.length === 1 ? 'a row is' : `${unnamed.length} rows are`;
    return {
      ok: false,
      reason: `${lead} missing a number or a name (“${label(unnamed[0].player, unnamed[0].raw)}”)`,
    };
  }

  // A cleared sheet, or the wrong tab published, looks like a roster that
  // lost most of its players overnight. A real roster doesn't.
  if (previousCount > 0 && rows.length < previousCount / 2) {
    return {
      ok: false,
      reason: `the sheet has ${rows.length} players where it had ${previousCount} — was it cleared, or the wrong tab published?`,
    };
  }

  const players = rows.map((r) => ({ ...r.player }));
  const warnings: string[] = [];
  for (const r of rows) {
    for (const issue of r.issues) warnings.push(`#${r.player.number} ${label(r.player, r.raw)}: ${issue}`);
  }
  // Two players can share a number on purpose (Player says so), so this is
  // worth a look, never a refusal.
  const worn = new Map<string, number>();
  for (const p of players) worn.set(numberKey(p.number), (worn.get(numberKey(p.number)) ?? 0) + 1);
  for (const [n, count] of worn) if (count > 1) warnings.push(`#${n} is worn by ${count} players`);

  return { ok: true, players, warnings };
}

const withoutId = (p: Player) => {
  const { id, ...rest } = p;
  void id;
  return rest;
};

/** The same roster, ignoring the ids the parser makes up fresh on every read. */
export const sameRoster = (a: Player[], b: Player[]): boolean =>
  a.length === b.length && canon(a.map(withoutId)) === canon(b.map(withoutId));
