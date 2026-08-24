import {
  choose,
  chosenSport,
  keptLeagueTable,
  rememberLeagueTable,
  rememberSport,
  searchSchools,
} from './store';
import type { LeagueRow } from './leagueTable';

const schools = [
  { slug: 'jackson-jackson', name: 'Jackson', city: 'Jackson' },
  { slug: 'jackson-massillon', name: 'Jackson', city: 'Massillon' },
  { slug: 'poland-seminary-poland', name: 'Poland Seminary', city: 'Poland' },
  { slug: 'st-edward-lakewood', name: 'St Edward', city: 'Lakewood' },
];

describe('searchSchools', () => {
  it('finds a school by the start of its name', () => {
    expect(searchSchools(schools, 'pol').map((s) => s.slug)).toEqual(['poland-seminary-poland']);
  });

  it('finds both schools that share a name', () => {
    expect(searchSchools(schools, 'jackson')).toHaveLength(2);
  });

  it('lets the town narrow it down', () => {
    expect(searchSchools(schools, 'jackson mass').map((s) => s.slug)).toEqual(['jackson-massillon']);
  });

  it('ignores case and punctuation', () => {
    expect(searchSchools(schools, 'ST. EDWARD').map((s) => s.slug)).toEqual(['st-edward-lakewood']);
  });

  it('returns nothing for an empty query rather than the whole state', () => {
    expect(searchSchools(schools, '   ')).toEqual([]);
  });
});

describe('choose', () => {
  beforeEach(() => {
    // choose() now sweeps `Object.keys(localStorage)` to find every
    // per-sport roster key, so the stub has to be a real object with the
    // stored keys as its own enumerable properties — a Map-backed
    // getItem/setItem stub (as used elsewhere in this repo's tests) would
    // answer Object.keys() with its method names instead of the data.
    const store: Record<string, string> = {};
    vi.stubGlobal(
      'localStorage',
      new Proxy(store, {
        get(target, prop: string) {
          if (prop === 'getItem') return (key: string) => (key in target ? target[key] : null);
          if (prop === 'setItem') return (key: string, value: string) => { target[key] = value; };
          if (prop === 'removeItem') return (key: string) => { delete target[key]; };
          if (prop === 'clear') return () => { for (const k of Object.keys(target)) delete target[k]; };
          return target[prop];
        },
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a genuine school switch drops every jar the old school filled', () => {
    localStorage.setItem('oh.school', 'old-school');
    localStorage.setItem('oh.season.old-school', '{}');
    localStorage.setItem('oh.roster.old-school', '{}');            // pre-sport legacy key
    localStorage.setItem('oh.roster.old-school.football', '{}');
    localStorage.setItem('oh.roster.old-school.basketball', '{}');
    localStorage.setItem('oh.livesports.old-school', '[]');
    localStorage.setItem('oh.sport.old-school', 'basketball');
    localStorage.setItem('oh.league.old-school', '{}');
    choose('new-school');
    expect(localStorage.getItem('oh.league.old-school')).toBeNull();
    expect(localStorage.getItem('oh.roster.old-school')).toBeNull();
    expect(localStorage.getItem('oh.roster.old-school.football')).toBeNull();
    expect(localStorage.getItem('oh.roster.old-school.basketball')).toBeNull();
    expect(localStorage.getItem('oh.livesports.old-school')).toBeNull();
    expect(localStorage.getItem('oh.sport.old-school')).toBeNull();
  });

  it('remembers a sport per school and forgets it on request', () => {
    rememberSport('hubbard-hubbard', 'basketball');
    expect(chosenSport('hubbard-hubbard')).toBe('basketball');
    rememberSport('hubbard-hubbard', null);
    expect(chosenSport('hubbard-hubbard')).toBeNull();
  });
});

/*
 * The League tab's kept copy. It is the only jar in the app that stands in for
 * data nobody caches — the member schools' seasons — so an offline reader at a
 * ground sees the table instead of a sentence saying nobody reported.
 */
describe('the kept league table', () => {
  const members = 'a-town,b-town,c-town';
  const rows: LeagueRow[] = [
    { slug: 'a-town', name: 'Ash', leagueWon: 2, leagueLost: 0, overallWon: 3, overallLost: 0 },
    { slug: 'b-town', name: 'Birch', leagueWon: 0, leagueLost: 2, overallWon: 0, overallLost: 3 },
  ];

  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a table for the followed school', () => {
    choose('a-town');
    rememberLeagueTable('a-town', members, rows);

    expect(keptLeagueTable('a-town', members)).toEqual(rows);
  });

  it('keeps nothing for a school the reader is only browsing', () => {
    // The same rule loadSeason follows: caching every school anybody opens
    // would fill the jar with counties nobody will reopen.
    choose('a-town');
    rememberLeagueTable('z-town', members, rows);

    expect(keptLeagueTable('z-town', members)).toBeNull();
  });

  it('refuses a table computed for a different conference', () => {
    // The seller adds a school to the conference; the kept table is now a
    // table of somebody else's league, and must not be served under the new
    // one's name.
    choose('a-town');
    rememberLeagueTable('a-town', members, rows);

    expect(keptLeagueTable('a-town', `${members},d-town`)).toBeNull();
  });

  it('rejects junk rather than handing a screen half a row', () => {
    choose('a-town');

    localStorage.setItem('oh.league.a-town', 'not json');
    expect(keptLeagueTable('a-town', members)).toBeNull();

    // A row missing its numbers, from a jar written by some future shape.
    localStorage.setItem(
      'oh.league.a-town',
      JSON.stringify({ members, rows: [{ slug: 'a-town', name: 'Ash' }] }),
    );
    expect(keptLeagueTable('a-town', members)).toBeNull();

    // A win count that is not a number.
    localStorage.setItem(
      'oh.league.a-town',
      JSON.stringify({ members, rows: [{ ...rows[0], leagueWon: '2' }] }),
    );
    expect(keptLeagueTable('a-town', members)).toBeNull();

    localStorage.setItem('oh.league.a-town', JSON.stringify({ members, rows: 'nope' }));
    expect(keptLeagueTable('a-town', members)).toBeNull();
  });

  it('has nothing to say about a school with no conference at all', () => {
    expect(keptLeagueTable('a-town', '')).toBeNull();
  });
});
