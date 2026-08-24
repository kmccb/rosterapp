import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// loadSchoolRoster gates everything on supaAvailable, which supa.ts computes
// once from import.meta.env at module load. Locally .env.local supplies real
// values so it's true; CI's test step deliberately runs with no env at all
// (the repo contract: everything works with the vars unset, forks included),
// so supaAvailable is false there and loadSchoolRoster returns null before
// ever calling rpc(). Mocking the whole module — supaAvailable forced true,
// rpc a vi.fn() steered per test — makes these tests exercise the same code
// path on every machine, with or without secrets in the environment.
vi.mock('./supa', () => ({
  supaAvailable: true,
  rpc: vi.fn(),
}));

import { cacheKey, keptSchoolSports, loadSchoolRoster, loadSchoolSports, parseCached } from './rosterStore';
import { rpc } from './supa';

const mockedRpc = vi.mocked(rpc);

describe('roster cache plumbing', () => {
  it('keys the cache by school and sport', () => {
    expect(cacheKey('hubbard-hubbard', 'football')).toBe('oh.roster.hubbard-hubbard.football');
  });

  it('round-trips a roster and rejects junk', () => {
    const roster = { season: 2026, players: [], colors: null, logo: null, schedule: null, league: null };
    expect(parseCached(JSON.stringify(roster))).toEqual(roster);
    expect(parseCached('{"season":"nope"}')).toBeNull();
    expect(parseCached('not json')).toBeNull();
    expect(parseCached(null)).toBeNull();
  });

  it('accepts only well-formed colors, defaulting anything else to no theme', () => {
    const good = { season: 2026, players: [], colors: { ground: '#04043a', accent: '#4fbaf7' }, logo: null, schedule: null, league: null };
    expect(parseCached(JSON.stringify(good))).toEqual(good);

    // Not hex — a CSS color name would paint fine in a browser but is not
    // the shape the school themed the page with.
    const notHex = { season: 2026, players: [], colors: { ground: 'blue', accent: '#4fbaf7' }, logo: null };
    expect(parseCached(JSON.stringify(notHex))?.colors).toBeNull();

    // Half a colors object — an accent with no ground.
    const half = { season: 2026, players: [], colors: { ground: '#04043a' }, logo: null };
    expect(parseCached(JSON.stringify(half))?.colors).toBeNull();
  });

  it('accepts a logo only as a data:image/ URI, defaulting anything else to none', () => {
    const dataUri = 'data:image/jpeg;base64,AAAA';
    const good = { season: 2026, players: [], colors: null, logo: dataUri, schedule: null, league: null };
    expect(parseCached(JSON.stringify(good))).toEqual(good);

    // A baked path — meaningful to the root app's own build, not to a shared
    // roster page that has no build of its own to serve it from.
    const path = { season: 2026, players: [], colors: null, logo: '/victorychristian/badge.jpg' };
    expect(parseCached(JSON.stringify(path))?.logo).toBeNull();

    // A remote URL — not what an uploaded badge ever produces.
    const http = { season: 2026, players: [], colors: null, logo: 'https://example.com/badge.jpg' };
    expect(parseCached(JSON.stringify(http))?.logo).toBeNull();

    // Not a string at all.
    const junk = { season: 2026, players: [], colors: null, logo: 42 };
    expect(parseCached(JSON.stringify(junk))?.logo).toBeNull();

    // Quote/comma smuggling — this value lands straight inside a CSS
    // url("...") custom property in look.ts, so a prefix check alone would
    // let a real data:image/ opening close its own quote early and inject a
    // second, attacker-chosen url(...) right behind it.
    const smuggled = {
      season: 2026,
      players: [],
      colors: null,
      logo: 'data:image/png;base64,AAA") ,url(evil',
    };
    expect(parseCached(JSON.stringify(smuggled))?.logo).toBeNull();

    // Missing entirely — an older cache entry written before logo existed.
    const missing = { season: 2026, players: [] };
    expect(parseCached(JSON.stringify(missing))?.logo).toBeNull();
  });

  it('accepts only well-formed schedule rows, defaulting anything else to none', () => {
    const rows = [{ date: '2026-11-27', opponent: 'Boardman', home: true, time: '7:00 PM' }];
    const good = { season: 2026, players: [], colors: null, logo: null, schedule: rows };
    expect(parseCached(JSON.stringify(good))?.schedule).toEqual(rows);

    // One malformed row poisons the lot — half a schedule rendered as whole
    // is worse than the fixtures simply not showing.
    const half = { season: 2026, players: [], colors: null, logo: null,
      schedule: [{ date: '2026-11-27', opponent: 'Boardman', home: true }, { opponent: 'Fitch' }] };
    expect(parseCached(JSON.stringify(half))?.schedule).toBeNull();

    const notArray = { season: 2026, players: [], colors: null, logo: null, schedule: 'soon' };
    expect(parseCached(JSON.stringify(notArray))?.schedule).toBeNull();

    const missing = { season: 2026, players: [], colors: null, logo: null };
    expect(parseCached(JSON.stringify(missing))?.schedule).toBeNull();
  });

  it('accepts a league only whole, defaulting anything else to none', () => {
    const league = { name: 'Inter-Valley Conference', members: ['strasburg-franklin', 'tuscarawas-valley'] };
    const good = { season: 2026, players: [], colors: null, logo: null, schedule: null, league };
    expect(parseCached(JSON.stringify(good))?.league).toEqual(league);

    // One member that isn't a slug poisons the lot — a standings table
    // missing a school says the wrong team is top.
    const badMember = { season: 2026, players: [], colors: null, logo: null,
      league: { name: 'Inter-Valley Conference', members: ['strasburg-franklin', 7] } };
    expect(parseCached(JSON.stringify(badMember))?.league).toBeNull();

    const blankMember = { season: 2026, players: [], colors: null, logo: null,
      league: { name: 'Inter-Valley Conference', members: ['strasburg-franklin', '  '] } };
    expect(parseCached(JSON.stringify(blankMember))?.league).toBeNull();

    // No name to head the table with.
    const noName = { season: 2026, players: [], colors: null, logo: null,
      league: { members: ['strasburg-franklin'] } };
    expect(parseCached(JSON.stringify(noName))?.league).toBeNull();

    const noMembers = { season: 2026, players: [], colors: null, logo: null,
      league: { name: 'Inter-Valley Conference', members: [] } };
    expect(parseCached(JSON.stringify(noMembers))?.league).toBeNull();

    const absent = { season: 2026, players: [], colors: null, logo: null };
    expect(parseCached(JSON.stringify(absent))?.league).toBeNull();
  });
});

describe('loadSchoolRoster', () => {
  let localStorageMock: Map<string, string>;

  beforeEach(() => {
    mockedRpc.mockReset();
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
    mockedRpc.mockResolvedValue(roster);

    const got = await loadSchoolRoster('hubbard-hubbard', 'football');
    expect(got).toEqual({ ...roster, logo: null, schedule: null, league: null });
    expect(localStorageMock.get(cacheKey('hubbard-hubbard', 'football'))).toBe(
      JSON.stringify({ ...roster, logo: null, schedule: null, league: null }),
    );
  });

  it('carries the conference the school told us about', async () => {
    const league = { name: 'Inter-Valley Conference', members: ['strasburg-franklin', 'tuscarawas-valley'] };
    mockedRpc.mockResolvedValue({ season: 2026, players: [], colors: null, league });

    const got = await loadSchoolRoster('hubbard-hubbard', 'football');
    expect(got?.league).toEqual(league);
    expect(JSON.parse(localStorageMock.get(cacheKey('hubbard-hubbard', 'football'))!).league).toEqual(league);
  });

  it('pulls a data-URI logo out of the fetched theme', async () => {
    const dataUri = 'data:image/png;base64,BBBB';
    mockedRpc.mockResolvedValue({
      season: 2026,
      players: [],
      colors: null,
      theme: { logo: dataUri },
    });

    const got = await loadSchoolRoster('hubbard-hubbard', 'football');
    expect(got?.logo).toBe(dataUri);
    expect(JSON.parse(localStorageMock.get(cacheKey('hubbard-hubbard', 'football'))!).logo).toBe(dataUri);
  });

  it('drops a theme logo that is not a data URI', async () => {
    mockedRpc.mockResolvedValue({
      season: 2026,
      players: [],
      colors: null,
      theme: { logo: 'https://example.com/badge.jpg' },
    });

    const got = await loadSchoolRoster('hubbard-hubbard', 'football');
    expect(got?.logo).toBeNull();
  });

  it('returns null and clears the stale cache when the function answers null', async () => {
    localStorageMock.set(
      cacheKey('hubbard-hubbard', 'football'),
      JSON.stringify({ season: 2025, players: [], colors: null, logo: null }),
    );
    mockedRpc.mockResolvedValue(null);

    const got = await loadSchoolRoster('hubbard-hubbard', 'football');
    expect(got).toBeNull();
    expect(localStorageMock.has(cacheKey('hubbard-hubbard', 'football'))).toBe(false);
  });

  it('falls back to the cached copy when the fetch throws', async () => {
    const cached = { season: 2025, players: [{ id: '2', number: '12' }], colors: null, logo: null };
    localStorageMock.set(cacheKey('hubbard-hubbard', 'football'), JSON.stringify(cached));
    mockedRpc.mockRejectedValue(new Error('Network error'));

    const got = await loadSchoolRoster('hubbard-hubbard', 'football');
    expect(got).toEqual({ ...cached, schedule: null, league: null });
  });

  it('falls back to a cached logo when the fetch throws', async () => {
    const dataUri = 'data:image/png;base64,CCCC';
    const cached = { season: 2025, players: [], colors: null, logo: dataUri };
    localStorageMock.set(cacheKey('hubbard-hubbard', 'football'), JSON.stringify(cached));
    mockedRpc.mockRejectedValue(new Error('Network error'));

    const got = await loadSchoolRoster('hubbard-hubbard', 'football');
    expect(got?.logo).toBe(dataUri);
  });
});

describe('loadSchoolSports', () => {
  // Same stub shape as loadSchoolRoster above, plus clear() — this block's
  // tests reset state with localStorage.clear() rather than a fresh Map, so
  // the mock needs to support it.
  let localStorageMock: Map<string, string>;

  beforeEach(() => {
    localStorageMock = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageMock.set(key, value),
      removeItem: (key: string) => localStorageMock.delete(key),
      clear: () => localStorageMock.clear(),
    });
    localStorage.clear();
    mockedRpc.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const dataUri = 'data:image/png;base64,DDDD';

  it('answers who the school is and caches it for the chosen school', async () => {
    localStorage.setItem('oh.school', 'hubbard-hubbard');
    mockedRpc.mockResolvedValueOnce({
      sports: ['football', 'volleyball'],
      colors: { ground: '#04043a', accent: '#4fbaf7' },
      theme: { logo: dataUri },
    });

    expect(await loadSchoolSports('hubbard-hubbard')).toEqual({
      sports: ['football', 'volleyball'],
      colors: { ground: '#04043a', accent: '#4fbaf7' },
      logo: dataUri,
    });
    // Kept in the sanitized shape, and read back out of the jar unchanged —
    // otherwise a returning reader loses the crest the network just handed us.
    expect(keptSchoolSports('hubbard-hubbard')).toEqual({
      sports: ['football', 'volleyball'],
      colors: { ground: '#04043a', accent: '#4fbaf7' },
      logo: dataUri,
    });
  });

  it('drops a look it cannot use without losing the sports', async () => {
    mockedRpc.mockResolvedValueOnce({
      sports: ['football'],
      colors: { ground: 'navy', accent: '#4fbaf7' },
      theme: { logo: 'https://example.com/badge.jpg' },
    });
    expect(await loadSchoolSports('hubbard-hubbard')).toEqual({
      sports: ['football'],
      colors: null,
      logo: null,
    });
  });

  it('treats junk answers as unknown, not as an empty school', async () => {
    mockedRpc.mockResolvedValueOnce({ nope: true });
    expect(await loadSchoolSports('hubbard-hubbard')).toBeNull();
  });

  it('falls back to the kept copy without a signal', async () => {
    localStorage.setItem(
      'oh.livesports.hubbard-hubbard',
      JSON.stringify({ sports: ['basketball'], colors: null, logo: null }),
    );
    mockedRpc.mockRejectedValueOnce(new Error('no signal'));
    expect(await loadSchoolSports('hubbard-hubbard')).toEqual({
      sports: ['basketball'],
      colors: null,
      logo: null,
    });
  });

  it('is unknown with no signal and no kept copy', async () => {
    mockedRpc.mockRejectedValueOnce(new Error('no signal'));
    expect(await loadSchoolSports('hubbard-hubbard')).toBeNull();
  });

  it('an empty answer is a real answer — no live sports', async () => {
    mockedRpc.mockResolvedValueOnce({ sports: [], colors: null, theme: null });
    expect(await loadSchoolSports('hubbard-hubbard')).toEqual({ sports: [], colors: null, logo: null });
  });

  it('reads the old bare-array answer as a school with no look of its own', async () => {
    // What the live function still answers with in the window between this
    // deploy and 0007 being applied by hand. Sending every school back to a
    // football-only page for the length of that window would be a worse
    // outcome than simply not having a crest yet.
    mockedRpc.mockResolvedValueOnce(['football', 'volleyball']);
    expect(await loadSchoolSports('hubbard-hubbard')).toEqual({
      sports: ['football', 'volleyball'],
      colors: null,
      logo: null,
    });
  });
});

describe('keptSchoolSports', () => {
  let localStorageMock: Map<string, string>;

  beforeEach(() => {
    localStorageMock = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock.get(key) ?? null,
      setItem: (key: string, value: string) => localStorageMock.set(key, value),
      removeItem: (key: string) => localStorageMock.delete(key),
      clear: () => localStorageMock.clear(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the kept identity without asking the network', () => {
    const kept = {
      sports: ['football', 'volleyball'],
      colors: { ground: '#04043a', accent: '#4fbaf7' },
      logo: 'data:image/png;base64,EEEE',
    };
    localStorage.setItem('oh.livesports.hubbard-hubbard', JSON.stringify(kept));
    expect(keptSchoolSports('hubbard-hubbard')).toEqual(kept);
  });

  it('reads a jar written before the identity shape as sports with no look', () => {
    // Every returning reader's jar holds a bare array today. Throwing it away
    // would put them back on the network — and on a first paint held behind
    // it — to learn something they already knew.
    localStorage.setItem('oh.livesports.hubbard-hubbard', JSON.stringify(['football', 'volleyball']));
    expect(keptSchoolSports('hubbard-hubbard')).toEqual({
      sports: ['football', 'volleyball'],
      colors: null,
      logo: null,
    });
  });

  it('is unknown when nothing was ever kept', () => {
    expect(keptSchoolSports('hubbard-hubbard')).toBeNull();
  });

  it('treats junk in the jar as unknown, not as an empty school', () => {
    localStorage.setItem('oh.livesports.hubbard-hubbard', 'not json');
    expect(keptSchoolSports('hubbard-hubbard')).toBeNull();

    localStorage.setItem('oh.livesports.hubbard-hubbard', JSON.stringify({ nope: true }));
    expect(keptSchoolSports('hubbard-hubbard')).toBeNull();

    localStorage.setItem('oh.livesports.hubbard-hubbard', JSON.stringify(['football', 7]));
    expect(keptSchoolSports('hubbard-hubbard')).toBeNull();

    localStorage.setItem('oh.livesports.hubbard-hubbard', JSON.stringify({ sports: 'football' }));
    expect(keptSchoolSports('hubbard-hubbard')).toBeNull();
  });
});
