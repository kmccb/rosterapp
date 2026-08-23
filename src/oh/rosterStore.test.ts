import { cacheKey, parseCached } from './rosterStore';

describe('roster cache plumbing', () => {
  it('keys the cache by school', () => {
    expect(cacheKey('hubbard-hubbard')).toBe('oh.roster.hubbard-hubbard');
  });

  it('round-trips a roster and rejects junk', () => {
    const roster = { season: 2026, players: [], colors: null };
    expect(parseCached(JSON.stringify(roster))).toEqual(roster);
    expect(parseCached('{"season":"nope"}')).toBeNull();
    expect(parseCached('not json')).toBeNull();
    expect(parseCached(null)).toBeNull();
  });
});
