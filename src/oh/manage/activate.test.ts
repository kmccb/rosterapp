import { describe, expect, it } from 'vitest';
import { parseRoster } from '../../parse/rosterParse';
import { skippedRows, toPlayers } from './Activate';

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

  it('leaves a row the parser flagged out of the published roster', () => {
    // Third line has no jersey number — the parser reads a name off it but
    // flags it. A hollow player must never reach the seller's publish count.
    const parsed = parseRoster(
      '7\tJake Miller\tQB\t6-1\t185\tJr\n12\tSam Ortiz\tWR\t5-11\t160\tSo\n\tGarbled Row\t\t\t\t',
    );

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[2].issues).toContain('No jersey number');

    const players = toPlayers(parsed.rows);
    // The count that publishes must match the count of clean rows exactly —
    // the whole point is that a seller can trust "N players read" at a glance.
    expect(players).toHaveLength(2);
    expect(players.map((p) => p.lastName)).toEqual(['Miller', 'Ortiz']);
  });

  it('names the rows it left out, for the seller to go fix the paste', () => {
    const parsed = parseRoster(
      '7\tJake Miller\tQB\t6-1\t185\tJr\n12\tSam Ortiz\tWR\t5-11\t160\tSo\n\tGarbled Row\t\t\t\t',
    );

    const skipped = skippedRows(parsed.rows);
    expect(skipped).toEqual([{ text: 'Garbled Row', issue: 'No jersey number' }]);

    // The two counts always add up to every row read, so the header line
    // never lies about what actually got published.
    expect(toPlayers(parsed.rows).length + skipped.length).toBe(parsed.rows.length);
  });
});
