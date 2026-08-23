import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheKey, loadSchoolRoster, parseCached } from './rosterStore';

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

  it('accepts only well-formed colors, defaulting anything else to no theme', () => {
    const good = { season: 2026, players: [], colors: { ground: '#04043a', accent: '#4fbaf7' } };
    expect(parseCached(JSON.stringify(good))).toEqual(good);

    // Not hex — a CSS color name would paint fine in a browser but is not
    // the shape the school themed the page with.
    const notHex = { season: 2026, players: [], colors: { ground: 'blue', accent: '#4fbaf7' } };
    expect(parseCached(JSON.stringify(notHex))?.colors).toBeNull();

    // Half a colors object — an accent with no ground.
    const half = { season: 2026, players: [], colors: { ground: '#04043a' } };
    expect(parseCached(JSON.stringify(half))?.colors).toBeNull();
  });
});

describe('loadSchoolRoster', () => {
  let localStorageMock: Map<string, string>;

  beforeEach(() => {
    localStorageMock = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageMock.set(key, value),
      removeItem: (key: string) => localStorageMock.delete(key),
    });
    // chosenSlug() reads this key — every cache read/write in rosterStore is
    // gated on the slug asked for matching the one the reader actually follows.
    localStorageMock.set('oh.school', 'hubbard-hubbard');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a live roster and caches it for the chosen school', async () => {
    const roster = { season: 2026, players: [{ id: '1', number: '7' }], colors: null };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(roster) }),
    );

    const got = await loadSchoolRoster('hubbard-hubbard');
    expect(got).toEqual(roster);
    expect(localStorageMock.get(cacheKey('hubbard-hubbard'))).toBe(JSON.stringify(roster));
  });

  it('returns null and clears the stale cache when the function answers null', async () => {
    localStorageMock.set(
      cacheKey('hubbard-hubbard'),
      JSON.stringify({ season: 2025, players: [], colors: null }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'null' }));

    const got = await loadSchoolRoster('hubbard-hubbard');
    expect(got).toBeNull();
    expect(localStorageMock.has(cacheKey('hubbard-hubbard'))).toBe(false);
  });

  it('falls back to the cached copy when the fetch throws', async () => {
    const cached = { season: 2025, players: [{ id: '2', number: '12' }], colors: null };
    localStorageMock.set(cacheKey('hubbard-hubbard'), JSON.stringify(cached));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const got = await loadSchoolRoster('hubbard-hubbard');
    expect(got).toEqual(cached);
  });
});
