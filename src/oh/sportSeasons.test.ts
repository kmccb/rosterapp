import { describe, expect, it } from 'vitest';
import { hubSports, inSeason, sortSportsForNow, sportEmoji, sportLabel } from './sportSeasons';

describe('sport seasons', () => {
  it('knows the Ohio calendar', () => {
    expect(inSeason('football', 9)).toBe(true);
    expect(inSeason('football', 2)).toBe(false);
    expect(inSeason('basketball', 12)).toBe(true);
    expect(inSeason('basketball', 9)).toBe(false);
    // Winter sports wrap the year boundary.
    expect(inSeason('basketball', 1)).toBe(true);
    expect(inSeason('softball', 4)).toBe(true);
    expect(inSeason('softball', 10)).toBe(false);
  });

  it('treats a sport it has never heard of as always in season', () => {
    expect(inSeason('esports', 1)).toBe(true);
    expect(inSeason('esports', 7)).toBe(true);
  });

  it('puts in-season sports first, alphabetical within each group', () => {
    const november = new Date('2026-11-15T12:00:00');
    expect(sortSportsForNow(['football', 'basketball', 'baseball', 'wrestling'], november))
      .toEqual(['basketball', 'football', 'wrestling', 'baseball']);
    const april = new Date('2027-04-15T12:00:00');
    expect(sortSportsForNow(['football', 'basketball', 'baseball'], april))
      .toEqual(['baseball', 'basketball', 'football']);
  });

  it('always includes football in the hub, without duplicating it', () => {
    expect(hubSports(['basketball'])).toEqual(['basketball', 'football']);
    expect(hubSports(['football', 'volleyball'])).toEqual(['football', 'volleyball']);
    expect(hubSports([])).toEqual(['football']);
  });

  it('labels and badges', () => {
    expect(sportLabel('cross country')).toBe('Cross Country');
    expect(sportEmoji('football')).toBe('🏈');
    expect(sportEmoji('esports')).toBe('🎽');
  });
});
