import { describe, expect, it } from 'vitest';
import {
  hubSports,
  inSeason,
  knownSports,
  seasonNote,
  sortSportsForNow,
  sportLabel,
} from './sportSeasons';

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

  it('labels', () => {
    expect(sportLabel('cross country')).toBe('Cross Country');
  });

  it('says when an off-season sport comes back', () => {
    const august = new Date('2026-08-15T12:00:00');
    const december = new Date('2026-12-15T12:00:00');
    const april = new Date('2027-04-15T12:00:00');
    const september = new Date('2026-09-15T12:00:00');

    expect(seasonNote('basketball', august)).toBe('Starts in November');
    expect(seasonNote('basketball', december)).toBe('In season');
    // Forward, always: April has just left basketball's March behind, and the
    // answer is still the November it is next in.
    expect(seasonNote('basketball', april)).toBe('Starts in November');
    expect(seasonNote('baseball', september)).toBe('Starts in March');
    expect(seasonNote('football', september)).toBe('In season');
    // A sport the table has never heard of is in season by default, so it has
    // no start date to name.
    expect(seasonNote('esports', september)).toBe('In season');
  });

  it('names the run a two-season sport reaches next, over the year end', () => {
    // The same wrap from December itself, where every remaining month of the
    // year is behind the reader.
    expect(seasonNote('golf', new Date('2026-12-15T12:00:00'))).toBe('Starts in August');
    expect(seasonNote('baseball', new Date('2026-12-15T12:00:00'))).toBe('Starts in March');
  });

  it('knows every sport it has a calendar for', () => {
    expect(knownSports()).toContain('football');
    expect(knownSports()).toHaveLength(17);
  });

  it('reads a gendered name by the sport behind it', () => {
    expect(inSeason('boys basketball', 12)).toBe(true);
    expect(inSeason('girls basketball', 9)).toBe(false);
    expect(inSeason('Girls Soccer', 9)).toBe(true);
    expect(seasonNote('boys basketball', new Date('2026-09-15T12:00:00'))).toBe('Starts in November');
  });

  it('knows girls play tennis in the autumn and boys in the spring', () => {
    expect(inSeason('girls tennis', 9)).toBe(true);
    expect(inSeason('girls tennis', 4)).toBe(false);
    expect(inSeason('boys tennis', 4)).toBe(true);
    expect(inSeason('boys tennis', 9)).toBe(false);
    expect(seasonNote('girls tennis', new Date('2026-06-15T12:00:00'))).toBe('Starts in August');
    expect(seasonNote('boys tennis', new Date('2026-11-15T12:00:00'))).toBe('Starts in March');
    // Bare tennis is nobody's season now; the seller says which. Unknown means
    // always in season, the charity every unlisted sport gets.
    expect(seasonNote('tennis', new Date('2026-06-15T12:00:00'))).toBe('In season');
  });

  it('sorts a gendered pair like the sport behind it', () => {
    const november = new Date('2026-11-15T12:00:00');
    // Football is also in season in November, so it joins the two basketball
    // entries in the live group, alphabetical throughout; baseball alone is
    // out of season.
    expect(sortSportsForNow(['football', 'girls basketball', 'boys basketball', 'baseball'], november))
      .toEqual(['boys basketball', 'football', 'girls basketball', 'baseball']);
  });

  it('labels a gendered name word by word', () => {
    expect(sportLabel('girls soccer')).toBe('Girls Soccer');
  });
});
