import { gameOptions } from './gameOptions';
import type { Game } from '../schedule/icalParse';

const g = (date: string, opponent: string, home: boolean, scrimmage = false): Game => ({
  date,
  opponent,
  opponentKey: opponent.toLowerCase(),
  home,
  scrimmage,
});

const SEASON: Game[] = [
  g('2026-08-07', 'Streetsboro', true, true),
  g('2026-08-21', 'Salem', true),
  g('2026-08-28', 'Kirtland', true),
  g('2026-09-04', 'Field', false),
  g('2026-09-11', 'Canfield', false),
  g('2026-09-18', 'Hubbard', true),
  g('2026-09-25', 'South Range', false),
];

describe('gameOptions', () => {
  it('lists the real games oldest first, worded like the Schedule tab', () => {
    const { options } = gameOptions(SEASON, new Set(), '2026-09-21');
    expect(options.map((o) => o.label)).toEqual([
      'Aug 21 · vs Salem',
      'Aug 28 · vs Kirtland',
      'Sep 4 · at Field',
      'Sep 11 · at Canfield',
      'Sep 18 · vs Hubbard',
      'Sep 25 · at South Range',
    ]);
    expect(options[0]).toMatchObject({ date: '2026-08-21', opponent: 'Salem' });
  });

  it('leaves scrimmages out', () => {
    const { options } = gameOptions(SEASON, new Set(), '2026-09-21');
    expect(options.map((o) => o.opponent)).not.toContain('Streetsboro');
  });

  it('marks a game whose stats are already in', () => {
    const { options } = gameOptions(SEASON, new Set(['2026-08-21', '2026-09-11']), '2026-09-21');
    expect(options.find((o) => o.opponent === 'Salem')?.label).toBe('Aug 21 · vs Salem · in');
    expect(options.find((o) => o.opponent === 'Kirtland')?.label).toBe('Aug 28 · vs Kirtland');
  });

  it('suggests the most recent game played that has no stats yet', () => {
    expect(gameOptions(SEASON, new Set(), '2026-09-21').suggested).toBe('2026-09-18');
    expect(gameOptions(SEASON, new Set(['2026-09-18']), '2026-09-21').suggested).toBe('2026-09-11');
    // Saturday morning after the South Range game.
    expect(gameOptions(SEASON, new Set(), '2026-09-26').suggested).toBe('2026-09-25');
  });

  it('falls back to the latest game played when every played game is in, and to the first game before the season', () => {
    const all = new Set(SEASON.map((x) => x.date));
    expect(gameOptions(SEASON, all, '2026-09-21').suggested).toBe('2026-09-18');
    expect(gameOptions(SEASON, new Set(), '2026-08-01').suggested).toBe('2026-08-21');
  });

  it('answers nothing for a schedule with no real games', () => {
    expect(gameOptions([g('2026-08-07', 'Streetsboro', true, true)], new Set(), '2026-09-21')).toEqual({
      options: [],
      suggested: null,
    });
  });

  it('sorts whatever order the schedule arrived in', () => {
    const { options } = gameOptions([...SEASON].reverse(), new Set(), '2026-09-21');
    expect(options[0].opponent).toBe('Salem');
  });
});
