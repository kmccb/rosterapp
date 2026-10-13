import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ParsedStatRow } from '../stats/statsParse';
import type { Player } from '../types';
import { asTeamStats, matchTeamStats, updatedLabel } from './teamStats';

describe('a team’s stats file', () => {
  it('reads the committed Springfield file whole', () => {
    const file = JSON.parse(
      readFileSync('public/oh/stats/springfield-new-middletown-football.json', 'utf8'),
    );
    const stats = asTeamStats(file);
    expect(stats).not.toBeNull();
    expect(stats!.source).toBe('MaxPreps');
    expect(stats!.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stats!.rows).toHaveLength(file.rows.length);
  });

  it('drops a row it cannot trust and keeps the rest', () => {
    const stats = asTeamStats({
      source: 'MaxPreps',
      updated: '2026-10-10',
      rows: [
        { name: 'Alex Caldwell', number: '4', category: 'rushing', values: { yds: 709, td: 8 } },
        { name: 'Alex Caldwell', number: '4', category: 'juggling', values: { yds: 1 } },
        { name: '', number: '9', category: 'rushing', values: { yds: 5 } },
        { name: 'Nobody Home', number: '9', category: 'rushing', values: { yds: 'lots' } },
        { name: 'No Jersey', category: 'defense', values: { tackles: 3, sacks: null } },
        null,
      ],
    });
    expect(stats!.rows).toEqual([
      { name: 'Alex Caldwell', number: '4', category: 'rushing', values: { yds: 709, td: 8 } },
      { name: 'No Jersey', number: '', category: 'defense', values: { tackles: 3 } },
    ]);
  });

  it('is nothing at all when there is nothing usable in it', () => {
    expect(asTeamStats(null)).toBeNull();
    expect(asTeamStats('<!doctype html>')).toBeNull();
    expect(asTeamStats({ rows: [] })).toBeNull();
    expect(asTeamStats({ rows: [{ name: 'A B', category: 'rushing', values: {} }] })).toBeNull();
  });

  it('prints the day without a year, and nothing for a date it cannot read', () => {
    expect(updatedLabel('2026-10-10')).toBe('Oct 10');
    expect(updatedLabel('2026-09-04')).toBe('Sep 4');
    expect(updatedLabel('')).toBe('');
    expect(updatedLabel('2026-13-01')).toBe('');
    expect(asTeamStats({ updated: 'yesterday', rows: [{ name: 'A B', category: 'rushing', values: { yds: 1 } }] })!.updated).toBe('');
  });
});

describe('matching a stats file to the roster on the page', () => {
  const player = (number: string, firstName: string, lastName: string): Player => ({
    id: `p${number}`, number, firstName, lastName, position: '', side: '',
  });
  const row = (name: string, number: string, values: Record<string, number>, category = 'rushing') =>
    ({ name, number, category, values }) as ParsedStatRow;

  it('goes by the whole name, whatever the jersey says', () => {
    const out = matchTeamStats([row('Alex Caldwell', '32', { yds: 709 })], [player('4', 'Alex', 'Caldwell')]);
    expect(out).toEqual({ 'caldwell|a': { rushing: { yds: 709 } } });
  });

  it('falls back to the jersey when the surname is in the printed name', () => {
    const roster = [player('12', 'Mike', 'Smith'), player('7', 'John', 'Smith')];
    const out = matchTeamStats(
      [row('Michael Smith', '12', { yds: 50 }), row('John Smith Jr.', '7', { yds: 9 })],
      roster,
    );
    expect(out).toEqual({ 'smith|m': { rushing: { yds: 50 } }, 'smith|j': { rushing: { yds: 9 } } });
  });

  it('never goes by the jersey alone', () => {
    // #4 was reassigned and the roster is a week behind.
    expect(matchTeamStats([row('Alex Caldwell', '4', { yds: 709 })], [player('4', 'Owen', 'Carter')])).toEqual({});
  });

  it('gives a brother only his own season', () => {
    const rows = [row('Michael Tuscano', '2', { yds: 343 }), row('Mason Tuscano', '18', { yds: 12 })];
    // Only Michael on the roster: Mason's row must not land on him.
    expect(matchTeamStats(rows, [player('2', 'Michael', 'Tuscano')])).toEqual({
      'tuscano|m': { rushing: { yds: 343 } },
    });
    // Both on it: the tables downstream cannot tell them apart, so neither is shown.
    expect(matchTeamStats(rows, [player('2', 'Michael', 'Tuscano'), player('18', 'Mason', 'Tuscano')])).toEqual({});
  });

  it('merges tables that share a category and keeps the first of a duplicate', () => {
    const out = matchTeamStats(
      [
        row('Dominick Jones', '55', { tackles: 87, tfl: 9 }, 'defense'),
        row('Dominick Jones', '55', { sacks: 8 }, 'defense'),
        row('Dominick Jones', '55', { tackles: 2 }, 'defense'),
      ],
      [player('55', 'Dominick', 'Jones')],
    );
    expect(out).toEqual({ 'jones|d': { defense: { tackles: 87, tfl: 9, sacks: 8 } } });
  });
});
