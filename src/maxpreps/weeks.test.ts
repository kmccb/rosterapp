import { describe, expect, it } from 'vitest';
import type { ParsedStatRow } from '../stats/statsParse';
import { difference, recordSnapshot, weeksFrom } from './weeks';

const rush = (name: string, carries: number, yds: number, td: number, extra: Record<string, number> = {}): ParsedStatRow => ({
  name,
  number: '4',
  category: 'rushing',
  values: { games: 8, carries, yds, td, ydsPerCarry: yds / carries, lng: 78, ...extra },
});

const played = [
  { date: '2026-08-21', opponent: 'Lakeview' },
  { date: '2026-08-28', opponent: 'Brookfield' },
  { date: '2026-09-04', opponent: 'Garfield' },
];

describe('the difference between two copies of the totals', () => {
  it('is the week’s counting numbers, with the averages worked out again and maxima dropped', () => {
    const week = difference([rush('Alex Caldwell', 98, 709, 8)], [rush('Alex Caldwell', 113, 812, 9)]);
    expect(week).toEqual([
      { name: 'Alex Caldwell', number: '4', category: 'rushing', values: { carries: 15, yds: 103, td: 1, ydsPerCarry: 6.87 } },
    ]);
  });

  it('includes a player who appeared for the first time, and leaves out anybody who did not move', () => {
    const before = [rush('Alex Caldwell', 98, 709, 8), rush('Marco Gentile', 36, 363, 6)];
    const after = [rush('Alex Caldwell', 98, 709, 8), rush('Marco Gentile', 36, 363, 6), rush('Jake Gentile', 3, 12, 0)];
    expect(difference(before, after).map((r) => r.name)).toEqual(['Jake Gentile']);
  });

  it('adds up the rows a category arrives in, as defense does from three tables', () => {
    const tackles: ParsedStatRow = { name: 'Dominick Jones', number: '55', category: 'defense', values: { tackles: 80, tfl: 9 } };
    const sacks: ParsedStatRow = { name: 'Dominick Jones', number: '55', category: 'defense', values: { sacks: 7 } };
    const later: ParsedStatRow[] = [
      { ...tackles, values: { tackles: 91, tfl: 10 } },
      { ...sacks, values: { sacks: 8 } },
    ];
    expect(difference([tackles, sacks], later)[0].values).toEqual({ tackles: 11, tfl: 1, sacks: 1 });
  });

  it('keeps a correction that takes a number down, since the weeks must still add up to the season', () => {
    expect(difference([rush('A B', 10, 50, 1)], [rush('A B', 10, 45, 1)])[0].values).toEqual({ carries: 0, yds: -5, td: 0 });
  });

  it('keeps the zeros of a category a player moved in, and never prints an average of nothing', () => {
    const pass = (cmp: number, att: number): ParsedStatRow => ({ name: 'Q B', number: '2', category: 'passing', values: { cmp, att, yds: 40, td: 0, int: 1 } });
    expect(difference([pass(5, 10)], [pass(5, 13)])[0].values).toEqual({ cmp: 0, att: 3, yds: 0, td: 0, int: 0, cmpPct: 0 });
    const stuffed = difference([rush('A B', 10, 50, 1)], [rush('A B', 13, 50, 1)])[0].values;
    expect(stuffed).toEqual({ carries: 3, yds: 0, td: 0, ydsPerCarry: 0 });
    expect(Object.values(stuffed).some(Number.isNaN)).toBe(false);
  });

  it('leaves out a player whose whole season would land in one week, as when his name is corrected', () => {
    // "Brady Lweis" becomes "Brady Lewis" after eight games.
    const before = [{ ...rush('Brady Lweis', 20, 80, 1), values: { games: 8, carries: 20, yds: 80, td: 1 } }];
    const after = [{ ...rush('Brady Lewis', 22, 90, 1), values: { games: 9, carries: 22, yds: 90, td: 1 } }];
    expect(difference(before, after, 1)).toEqual([]);
    // A freshman in his first game is new, and his game is his week.
    const debut = [{ ...rush('New Kid', 2, 9, 0), values: { games: 1, carries: 2, yds: 9, td: 0 } }];
    expect(difference(before, [...before, ...debut], 1).map((r) => r.name)).toEqual(['New Kid']);
  });
});

describe('the weeks', () => {
  it('are the stretch before tracking, then a week per game, named for its game', () => {
    const weeks = weeksFrom(
      [
        { games: 1, rows: [rush('A B', 10, 50, 1)] },
        { games: 2, rows: [rush('A B', 20, 120, 2)] },
      ],
      played,
    );
    expect(weeks.map((w) => [w.from, w.to, w.game?.opponent ?? null, w.beforeTracking])).toEqual([
      [1, 1, 'Lakeview', false],
      [2, 2, 'Brookfield', false],
    ]);
    expect(weeks[1].rows[0].values).toMatchObject({ carries: 10, yds: 70, td: 1 });
  });

  it('cannot split the games before the first copy, and says so', () => {
    const weeks = weeksFrom([{ games: 8, rows: [rush('A B', 98, 709, 8)] }, { games: 9, rows: [rush('A B', 113, 812, 9)] }], played);
    expect(weeks[0]).toMatchObject({ from: 1, to: 8, game: null, beforeTracking: true });
    expect(weeks[0].rows[0].values).toMatchObject({ carries: 98, yds: 709 });
    expect(weeks[1]).toMatchObject({ from: 9, to: 9, beforeTracking: false });
  });

  it('runs two games together when a copy was missed between them', () => {
    const weeks = weeksFrom([{ games: 1, rows: [] }, { games: 3, rows: [rush('A B', 5, 10, 0)] }], played);
    expect(weeks[1]).toMatchObject({ from: 2, to: 3, game: null, beforeTracking: false });
  });

  it('reads the copies in games order, keeps the later of two at one count, and ignores nonsense', () => {
    const weeks = weeksFrom(
      [
        { games: 2, rows: [rush('A B', 20, 100, 1)] },
        { games: 1, rows: [rush('A B', 10, 40, 0)] },
        { games: 2, rows: [rush('A B', 21, 104, 1)] },
        { games: 0, rows: [] },
        { games: 1.5, rows: [] },
      ],
      played,
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[1].rows[0].values).toMatchObject({ carries: 11, yds: 64, td: 1 });
  });
});

describe('keeping the copies', () => {
  const a = [rush('A B', 10, 50, 1)];
  const b = [rush('A B', 20, 120, 2)];

  it('adds a copy when a game has been played, and replaces the newest when one has not', () => {
    expect(recordSnapshot(undefined, 8, a)).toEqual([{ games: 8, rows: a }]);
    expect(recordSnapshot([{ games: 8, rows: a }], 9, b)).toEqual([{ games: 8, rows: a }, { games: 9, rows: b }]);
    expect(recordSnapshot([{ games: 8, rows: a }, { games: 9, rows: a }], 9, b)).toEqual([
      { games: 8, rows: a },
      { games: 9, rows: b },
    ]);
  });

  it('starts again for a new season, skips a dip, and changes nothing when the page gives no count', () => {
    expect(recordSnapshot([{ games: 10, rows: a }], 1, b)).toEqual([{ games: 1, rows: b }]);
    expect(recordSnapshot([{ games: 8, rows: a }, { games: 9, rows: a }], 8, b)).toEqual([
      { games: 8, rows: a },
      { games: 9, rows: a },
    ]);
    expect(recordSnapshot([{ games: 8, rows: a }], null, b)).toEqual([{ games: 8, rows: a }]);
  });
});
