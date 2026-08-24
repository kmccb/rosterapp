import { describe, expect, it } from 'vitest';
import { parseRoster } from '../../parse/rosterParse';
import { leagueArg, scheduleArg, skippedRows, themeArg, toPlayers } from './Activate';

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

describe('themeArg', () => {
  it('sends {logo} for a fresh upload, even if the stored logo was also cleared', () => {
    expect(themeArg('data:image/png;base64,AAAA', false)).toEqual({
      logo: 'data:image/png;base64,AAAA',
    });
    expect(themeArg('data:image/png;base64,AAAA', true)).toEqual({
      logo: 'data:image/png;base64,AAAA',
    });
  });

  it('sends {} to wipe the stored logo when it was cleared and nothing new was picked', () => {
    expect(themeArg(null, true)).toEqual({});
  });

  it('sends null to keep whatever is already stored — the renewal case', () => {
    expect(themeArg(null, false)).toBeNull();
  });
});

describe('scheduleArg', () => {
  const row = { date: '2026-11-27', opponent: 'Boardman', home: true };

  it('a fresh paste sends the rows', () => {
    expect(scheduleArg([row], false)).toEqual([row]);
  });

  it('clearing sends the empty array, which the database reads as "wipe"', () => {
    expect(scheduleArg([], true)).toEqual([]);
  });

  it('neither sends null — keep whatever is stored, the renewal case', () => {
    expect(scheduleArg([], false)).toBeNull();
  });

  it('a paste wins over a stale clear flag', () => {
    expect(scheduleArg([row], true)).toEqual([row]);
  });
});

describe('leagueArg', () => {
  const members = ['strasburg-franklin-strasburg', 'malvern-malvern'];

  it('a filled form sends the conference, with the name trimmed for a heading', () => {
    expect(leagueArg('  Inter-Valley Conference ', members, false)).toEqual({
      name: 'Inter-Valley Conference',
      members,
    });
  });

  it('clearing sends {} — the theme’s contract, because a league is an object', () => {
    expect(leagueArg('', [], true)).toEqual({});
  });

  it('neither sends null — keep whatever is stored, the renewal case', () => {
    expect(leagueArg('', [], false)).toBeNull();
  });

  it('a filled form wins over a stale clear flag', () => {
    expect(leagueArg('Inter-Valley Conference', members, true)).toEqual({
      name: 'Inter-Valley Conference',
      members,
    });
  });

  it('half a form is not a form: a name with nobody in it, or the other way round', () => {
    // Neither is a conference, so neither may overwrite one. Without the
    // clear flag both read as "nothing was filled in" and keep what's stored.
    expect(leagueArg('Inter-Valley Conference', [], false)).toBeNull();
    expect(leagueArg('   ', members, false)).toBeNull();
    // With it, the clear still wins — the seller asked for the league to go.
    expect(leagueArg('Inter-Valley Conference', [], true)).toEqual({});
  });
});
