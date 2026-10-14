import { readFileSync } from 'node:fs';
import { headToHead } from '../schedule/icalParse';
import type { SchoolGame } from '../ohio/stateModel';
import type { StateGame } from '../ohio/stateParse';
import {
  buildHistory,
  historyGames,
  historyJson,
  meetings,
  parseHistory,
  seasonGames,
} from './history';

// Invented scores in the committed file's shape.
const FILE = JSON.parse(readFileSync('src/oh/fixtures/history-springfield.json', 'utf8'));

const thisSeason: SchoolGame[] = [
  {
    week: 9, date: '2026-10-16', kickoff: '7pm', home: false, opponent: 'McDonald',
    opponentCity: 'McDonald', opponentSlug: 'mcdonald-mcdonald',
    result: { us: 20, them: 13, won: true },
  },
  {
    week: 10, date: '2026-10-23', kickoff: '7pm', home: true, opponent: 'McDonald',
    opponentCity: 'McDonald', opponentSlug: 'mcdonald-mcdonald',
  },
  {
    week: 1, date: '2026-08-21', kickoff: '7pm', home: false, opponent: 'Lakeview',
    opponentCity: 'Cortland', opponentSlug: 'lakeview-cortland',
    result: { us: 33, them: 10, won: true },
  },
];

describe('parseHistory', () => {
  it('reads the committed shape', () => {
    const h = parseHistory(FILE)!;
    expect(h.slug).toBe('springfield-new-middletown');
    expect(h.from).toBe(2023);
    expect(h.to).toBe(2025);
    expect(h.games).toHaveLength(5);
    expect(h.games[0]).toEqual(['2025-10-17', 'mcdonald-mcdonald', 'McDonald', 'home', 42, 7]);
  });

  it('keeps games newest first whatever order the file is in', () => {
    const h = parseHistory({ ...FILE, games: [...FILE.games].reverse() })!;
    expect(h.games.map((g) => g[0])).toEqual([
      '2025-10-17', '2025-08-22', '2024-10-18', '2024-09-06', '2023-10-20',
    ]);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'not json'],
    ['an array', []],
    ['an HTML error page parsed as text', '<!doctype html>'],
    ['no slug', { ...FILE, slug: '' }],
    ['years backwards', { ...FILE, from: 2025, to: 2011 }],
    ['a non-numeric year', { ...FILE, from: '2011' }],
    ['games not a list', { ...FILE, games: {} }],
  ])('gives no history for %s, without throwing', (_label, raw) => {
    expect(parseHistory(raw)).toBeNull();
  });

  it('drops a malformed row rather than showing it', () => {
    const h = parseHistory({
      ...FILE,
      games: [
        ...FILE.games,
        ['2022-10-21', 'x', 'X', 'neutral', 1, 2],
        ['2022-10-21', 'x', 'X', 'home', -1, 2],
        ['2022-10-21', 'x', 'X', 'home', 1.5, 2],
        ['21/10/2022', 'x', 'X', 'home', 1, 2],
        ['2022-10-21', 'x', '', 'home', 1, 2],
        ['2022-10-21', 'x', 'X', 'home', 1],
        'junk',
        null,
      ],
    })!;
    expect(h.games).toHaveLength(5);
  });
});

describe('meetings', () => {
  const h = parseHistory(FILE);

  it('adds this season’s scored games to the history, newest first', () => {
    const m = meetings(h, thisSeason, 'mcdonald-mcdonald');
    expect(m.meetings.map((g) => g.date)).toEqual([
      '2026-10-16', '2025-10-17', '2024-10-18', '2023-10-20',
    ]);
    expect(m).toMatchObject({ played: 4, won: 3, lost: 1 });
    expect(m.meetings[1]).toMatchObject({
      opponent: 'McDonald', home: true, result: { us: 42, them: 7, won: true },
    });
  });

  it('works with no history file at all', () => {
    expect(meetings(null, thisSeason, 'mcdonald-mcdonald')).toMatchObject({ played: 1, won: 1 });
  });

  it('counts a date in both the history and this season once', () => {
    const overlap: SchoolGame[] = [{
      week: 9, date: '2025-10-17', kickoff: '7pm', home: true, opponent: 'McDonald',
      opponentCity: 'McDonald', opponentSlug: 'mcdonald-mcdonald',
      result: { us: 42, them: 7, won: true },
    }];
    expect(meetings(h, overlap, 'mcdonald-mcdonald').played).toBe(3);
  });

  it('never matches a school with no directory page to a slug', () => {
    expect(meetings(h, [], 'westinghouse').played).toBe(0);
    expect(historyGames(h).find((g) => g.opponent === 'Westinghouse')!.opponentKey).toBe('~westinghouse');
  });

  it('agrees with Poland’s own headToHead on the same games', () => {
    const all = [...seasonGames(thisSeason), ...historyGames(h)];
    const theirs = headToHead(all, 'lakeview-cortland');
    const ours = meetings(h, thisSeason, 'lakeview-cortland');
    expect(ours).toEqual(theirs);
  });
});

describe('buildHistory', () => {
  const side = (name: string, city: string, score: number | null, state = 'OH') =>
    ({ name, city, state, score });
  const game = (date: string, away: StateGame['away'], home: StateGame['home']): StateGame =>
    ({ week: 1, date, kickoff: '', away, home });

  const games: StateGame[] = [
    game('2024-10-18', side('Springfield', 'New Middletown', 14), side('McDonald', 'McDonald', 17)),
    // The same game printed twice.
    game('2024-10-18', side('Springfield', 'New Middletown', 14), side('McDonald', 'McDonald', 17)),
    game('2024-09-06', side('Westinghouse', 'Pittsburgh', 0, 'PA'), side('Springfield', 'New Middletown', 35)),
    // An Ohio school that has since closed: no page today, so no slug.
    game('2023-09-01', side('Old School', 'Gone', 6), side('Springfield', 'New Middletown', 13)),
    // Unplayed, and outside the years asked for.
    game('2025-11-01', side('Springfield', 'New Middletown', null), side('McDonald', 'McDonald', null)),
    game('2010-09-01', side('Springfield', 'New Middletown', 7), side('McDonald', 'McDonald', 3)),
  ];
  const known = new Set(['springfield-new-middletown', 'mcdonald-mcdonald']);

  it('files each game from the school’s side, newest first, once', () => {
    const h = buildHistory(games, 'springfield-new-middletown', 2011, 2025, known);
    expect(h).toEqual({
      slug: 'springfield-new-middletown',
      from: 2011,
      to: 2025,
      games: [
        ['2024-10-18', 'mcdonald-mcdonald', 'McDonald', 'away', 14, 17],
        ['2024-09-06', null, 'Westinghouse', 'home', 35, 0],
        ['2023-09-01', null, 'Old School', 'home', 13, 6],
      ],
    });
  });

  it('writes a file parseHistory reads back unchanged', () => {
    const h = buildHistory(games, 'springfield-new-middletown', 2011, 2025, known);
    expect(parseHistory(JSON.parse(historyJson(h)))).toEqual(h);
    const empty = buildHistory([], 'nobody', 2011, 2025, known);
    expect(parseHistory(JSON.parse(historyJson(empty)))).toEqual(empty);
  });
});
