import { describe, expect, it } from 'vitest';
import { parseRoster } from '../../parse/rosterParse';
import { toPlayers } from './Activate';

describe('toPlayers', () => {
  it('turns a pasted spreadsheet into the app’s players', () => {
    const parsed = parseRoster('7\tJake Miller\tQB\t6-1\t185\tJr\n12\tSam Ortiz\tWR\t5-11\t160\tSo');
    const players = toPlayers(parsed.rows);

    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({
      number: '7',
      firstName: 'Jake',
      lastName: 'Miller',
      position: 'QB',
      heightIn: 73,
      weightLb: 185,
      grade: 'Jr',
    });
    // Every player gets an id — the card components key on it.
    expect(players.every((p) => p.id.length > 0)).toBe(true);
    expect(new Set(players.map((p) => p.id)).size).toBe(2);
  });
});
