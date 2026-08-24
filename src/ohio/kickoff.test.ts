import { describe, it, expect } from 'vitest';
import { clockOf, easternOffset, kickoffAt, nextFixture } from './kickoff';
import type { SchoolGame } from './stateModel';

const game = (over: Partial<SchoolGame>): SchoolGame => ({
  week: 1,
  date: '2026-08-28',
  kickoff: '7pm',
  home: true,
  opponent: 'Catholic Central',
  opponentCity: 'Steubenville',
  opponentSlug: 'catholic-central-steubenville',
  ...over,
});

describe('clockOf', () => {
  it('reads the shape the directory actually writes', () => {
    expect(clockOf('7pm')).toEqual({ hour: 19, minute: 0 });
  });

  it('takes minutes, spaces and case as they come', () => {
    expect(clockOf('7:30 PM')).toEqual({ hour: 19, minute: 30 });
    expect(clockOf('10am')).toEqual({ hour: 10, minute: 0 });
    expect(clockOf('  6:45p.m. ')).toEqual({ hour: 18, minute: 45 });
  });

  it('gets noon and midnight the right way round', () => {
    expect(clockOf('12pm')).toEqual({ hour: 12, minute: 0 });
    expect(clockOf('12am')).toEqual({ hour: 0, minute: 0 });
  });

  it('refuses anything that is not a time', () => {
    // Each of these is a thing a scoreboard has printed in a time column.
    for (const junk of ['', '   ', 'TBA', 'TBD', 'Noon', '7', '19:00', '0pm', '13pm', '7:99pm']) {
      expect(clockOf(junk)).toBeNull();
    }
    expect(clockOf(undefined)).toBeNull();
    expect(clockOf(null)).toBeNull();
  });
});

describe('easternOffset', () => {
  it('is on daylight time in the football season', () => {
    expect(easternOffset('2026-08-28')).toBe('-04:00');
  });

  it('is on standard time by the playoffs', () => {
    expect(easternOffset('2026-11-20')).toBe('-05:00');
  });
});

describe('kickoffAt', () => {
  it('places a seven o’clock kickoff at seven, Eastern', () => {
    expect(kickoffAt(game({})).toISOString()).toBe('2026-08-28T23:00:00.000Z');
  });

  it('follows the clock into standard time', () => {
    expect(kickoffAt(game({ date: '2026-11-20' })).toISOString()).toBe('2026-11-21T00:00:00.000Z');
  });

  /*
   * The one that matters. A time nobody anticipated must not throw and must
   * not skip the school — seven on a Friday night is right nearly always, and
   * an hour's error beats no forecast at all.
   */
  it('falls back to Friday night rather than giving up', () => {
    for (const odd of ['TBA', '', 'Noon']) {
      expect(kickoffAt(game({ kickoff: odd })).toISOString()).toBe('2026-08-28T23:00:00.000Z');
    }
  });
});

describe('nextFixture', () => {
  const season = [
    game({ week: 1, date: '2026-08-21', result: { us: 43, them: 14, won: true } }),
    game({ week: 2, date: '2026-08-28' }),
    game({ week: 3, date: '2026-09-04' }),
  ];

  it('is the first game not yet played', () => {
    expect(nextFixture(season, new Date('2026-08-25T12:00:00Z'))?.date).toBe('2026-08-28');
  });

  it('holds the game through kickoff and the hours it is being played', () => {
    // Half past eight Eastern on the night itself: still tonight's game.
    expect(nextFixture(season, new Date('2026-08-29T00:30:00Z'))?.date).toBe('2026-08-28');
  });

  /*
   * A score that has not been posted yet is the case this exists for. Left to
   * "not played", the forecast would sit on a game that finished on Friday for
   * the rest of the week.
   */
  it('steps over a game that has happened but has no score on it', () => {
    expect(nextFixture(season, new Date('2026-08-30T12:00:00Z'))?.date).toBe('2026-09-04');
  });

  it('is undefined once the season is out', () => {
    expect(nextFixture(season, new Date('2026-12-01T12:00:00Z'))).toBeUndefined();
  });

  it('does not care what order the games arrive in', () => {
    expect(nextFixture([...season].reverse(), new Date('2026-08-25T12:00:00Z'))?.date).toBe(
      '2026-08-28',
    );
  });

  it('leaves the caller’s array alone', () => {
    const given = [...season].reverse();
    nextFixture(given, new Date('2026-08-25T12:00:00Z'));
    expect(given[0].date).toBe('2026-09-04');
  });
});
