/*
 * The games a paste can belong to, from the schedule the app already carries.
 *
 * Typing an opponent and a date is a chance to misspell one or pick a
 * Thursday; the Schedule tab knows both. So the One game form offers the
 * season's real games instead, worded the way that tab words them, and opens
 * on the game most likely to be the one just played: the latest one played
 * that has no stats yet.
 */

import type { Game } from '../schedule/icalParse';
import { gameLabel } from './leaders';

export type GameOption = { date: string; opponent: string; label: string };

export function gameOptions(
  games: Game[],
  pasted: Set<string>,
  today: string,
): { options: GameOption[]; suggested: string | null } {
  const real = games.filter((g) => !g.scrimmage).sort((a, b) => a.date.localeCompare(b.date));

  const options = real.map((g) => ({
    date: g.date,
    opponent: g.opponent,
    label: `${gameLabel(g.date, `${g.home ? 'vs' : 'at'} ${g.opponent}`)}${pasted.has(g.date) ? ' · in' : ''}`,
  }));

  const played = real.filter((g) => g.date <= today);
  const waiting = played.filter((g) => !pasted.has(g.date));
  const pick = waiting[waiting.length - 1] ?? played[played.length - 1] ?? real[0];

  return { options, suggested: pick?.date ?? null };
}
