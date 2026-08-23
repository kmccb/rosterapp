import { choose, chosenSport, rememberSport, searchSchools } from './store';

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
    choose('new-school');
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
