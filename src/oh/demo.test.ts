import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The demo shim, pinned.
 *
 * Two kinds of thing are tested. The shim's own judgement — which pages count
 * as the demo, what it does with a mangled file, what it hands the store
 * guards. And the store, in demo mode, reached with no Supabase variables and
 * no rpc mocked: the demo has to work in a build with no database at all,
 * which is how CI runs, and getting a roster back here is that claim being
 * demonstrated.
 *
 * Everything is loaded through a fresh module instance because loadDemo
 * memoizes for the life of the page.
 *
 * The body here is synthetic. The committed file is pinned by its own block in
 * this file once the generator has written it (see the "committed file" tests).
 */

const SLUG = 'poland-seminary-poland';

const player = (n: number) => ({
  id: `p${n}`,
  number: String(n),
  firstName: 'Test',
  lastName: `Player${n}`,
  position: '',
  side: '' as const,
});

const body = () => ({
  slug: SLUG,
  season: 2026,
  generatedOn: '2026-09-11',
  school: { slug: SLUG, name: 'Poland Seminary', city: 'Poland' },
  colors: { ground: '#04043a', accent: '#4fbaf7' },
  logo: 'data:image/jpeg;base64,/9j/4AAQ',
  league: { name: 'Northeast 8', members: ['hubbard-hubbard', 'girard-girard'] },
  sportNames: ['football', 'volleyball'],
  sports: {
    football: { players: [player(1), player(2)], schedule: null },
    volleyball: {
      players: [player(3)],
      schedule: [{ date: '2026-09-01', opponent: 'Girard', home: true, time: '7:00 PM' }],
    },
  },
});

type Page = { pathname?: string; search?: string };

/** An empty jar. The store reads localStorage on the way back from a fetch
 * (to decide whether the followed school's copy is kept), and node has no
 * such global. */
const jar = () => {
  const kept: Record<string, string> = {};
  return {
    getItem: (k: string) => kept[k] ?? null,
    setItem: (k: string, v: string) => {
      kept[k] = v;
    },
    removeItem: (k: string) => {
      delete kept[k];
    },
    key: (i: number) => Object.keys(kept)[i] ?? null,
    get length() {
      return Object.keys(kept).length;
    },
  };
};

/** The demo page, with fetch answering the demo file and the directory's own
 * files — the season and the forecast are no longer baked, so the store reads
 * the same committed files a real school's page does. */
const load = async (demo: unknown, page: Page = {}) => {
  vi.resetModules();
  vi.stubGlobal('location', { pathname: page.pathname ?? '/oh/demo/', search: page.search ?? '' });
  vi.stubGlobal('localStorage', jar());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url).split('?')[0];
      if (path === '/oh/demo.json') return { ok: true, json: async () => demo };
      const data = /^\/oh\/data\/([a-z0-9-]+)\.json$/.exec(path);
      if (data) {
        const file = new URL(`../../public/oh/data/${data[1]}.json`, import.meta.url);
        return { ok: true, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
      }
      if (path === '/oh/weather.json') return { ok: true, json: async () => ({}) };
      return { ok: false, json: async () => null };
    }),
  );
  return import('./demo');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('which page is the demo', () => {
  it('knows the path, with or without the trailing slash', async () => {
    expect((await load(body(), { pathname: '/oh/demo/' })).isDemo()).toBe(true);
    expect((await load(body(), { pathname: '/oh/demo' })).isDemo()).toBe(true);
    expect((await load(body(), { pathname: '/oh/demo/index.html' })).isDemo()).toBe(true);
  });

  it('accepts ?demo as an alias, so a link cannot land on the directory', async () => {
    expect((await load(body(), { pathname: '/oh/', search: '?demo' })).isDemo()).toBe(true);
    expect((await load(body(), { pathname: '/oh/', search: '?demo=1' })).isDemo()).toBe(true);
  });

  it('reads ?demo=false as somebody turning it off', async () => {
    expect((await load(body(), { pathname: '/oh/', search: '?demo=false' })).isDemo()).toBe(false);
    expect((await load(body(), { pathname: '/oh/', search: '?demo=0' })).isDemo()).toBe(false);
  });

  it('leaves every other page alone', async () => {
    expect((await load(body(), { pathname: '/oh/' })).isDemo()).toBe(false);
    expect((await load(body(), { pathname: '/' })).isDemo()).toBe(false);
    expect((await load(body(), { pathname: '/oh/', search: '?manage' })).isDemo()).toBe(false);
  });

  it('is false off a page altogether, which is where the tests run', async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    const { isDemo } = await import('./demo');
    expect(isDemo()).toBe(false);
  });
});

describe('what the store guards ask for', () => {
  it('is Poland', async () => {
    const { DEMO_SLUG } = await load(body());
    expect(DEMO_SLUG).toBe('poland-seminary-poland');
  });

  it('hangs the conference on football and on nothing else', async () => {
    const { demoRosterBody, DEMO_SLUG } = await load(body());
    const football = (await demoRosterBody(DEMO_SLUG, 'football')) as Record<string, unknown>;
    expect(football.league).not.toBeNull();
    // Football's fixtures come from the directory, exactly as a real paid
    // school's do — there is nothing pasted for it.
    expect(football.schedule).toBeNull();
    const volleyball = (await demoRosterBody(DEMO_SLUG, 'volleyball')) as Record<string, unknown>;
    expect(volleyball.league).toBeNull();
    expect(Array.isArray(volleyball.schedule)).toBe(true);
  });

  it('answers for the demo school only', async () => {
    const { demoRosterBody, demoIdentity } = await load(body());
    expect(await demoRosterBody('hubbard-hubbard', 'football')).toBeNull();
    expect(await demoIdentity('hubbard-hubbard')).toBeNull();
  });

  it('answers nothing for a sport the school does not sell', async () => {
    const { demoRosterBody, DEMO_SLUG } = await load(body());
    expect(await demoRosterBody(DEMO_SLUG, 'bowling')).toBeNull();
  });

  it('has no kept identity until the file has landed', async () => {
    const { keptDemoIdentity, loadDemo, DEMO_SLUG } = await load(body());
    expect(keptDemoIdentity(DEMO_SLUG)).toBeNull();
    await loadDemo();
    expect(keptDemoIdentity(DEMO_SLUG)).not.toBeNull();
  });

  it('leaves the dates exactly as written', async () => {
    const { loadDemo } = await load(body());
    const demo = await loadDemo();
    expect(demo!.sports.volleyball.schedule![0].date).toBe('2026-09-01');
  });
});

describe('the store, in demo mode', () => {
  const stores = async () => {
    const { DEMO_SLUG } = await import('./demo');
    return { DEMO_SLUG, store: await import('./store'), rosterStore: await import('./rosterStore') };
  };

  it('serves the roster and the identity out of the file, and the season out of the directory', async () => {
    await load(body());
    const { DEMO_SLUG, store, rosterStore } = await stores();

    const identity = await rosterStore.loadSchoolSports(DEMO_SLUG);
    expect(identity!.sports).toEqual(['football', 'volleyball']);
    expect(identity!.colors).toEqual({ ground: '#04043a', accent: '#4fbaf7' });
    expect(identity!.logo).toMatch(/^data:image\/jpeg;base64,/);

    const roster = await rosterStore.loadSchoolRoster(DEMO_SLUG, 'volleyball');
    expect(roster!.players).toHaveLength(1);
    expect(roster!.schedule).toHaveLength(1);
    expect(roster!.league).toBeNull();

    // Poland's real season, from public/oh/data — real scores, weekly.
    const season = await store.loadSeason(DEMO_SLUG);
    expect(season.school.name).toBe('Poland Seminary');
    expect(season.games.length).toBeGreaterThanOrEqual(10);
  });

  it('asks the directory for a conference member the same way', async () => {
    await load(body());
    const { store } = await stores();
    const hubbard = await store.loadSeason('hubbard-hubbard');
    expect(hubbard.school.slug).toBe('hubbard-hubbard');
  });

  it('reads the forecast file like any school, and finds nothing in an empty one', async () => {
    await load(body());
    const { DEMO_SLUG, store } = await stores();
    expect(await store.loadWeather(DEMO_SLUG)).toBeNull();
  });

  it('leaves the kept-identity door where it was: null until the file lands', async () => {
    await load(body());
    const { DEMO_SLUG, rosterStore } = await stores();
    expect(rosterStore.keptSchoolSports(DEMO_SLUG)).toBeNull();
    await rosterStore.loadSchoolSports(DEMO_SLUG);
    expect(rosterStore.keptSchoolSports(DEMO_SLUG)!.sports).toHaveLength(2);
  });

  it('refuses to remember a sport, so every prospect gets the hub', async () => {
    await load(body());
    const { DEMO_SLUG, store } = await stores();
    const jar: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => jar[k] ?? null,
      setItem: (k: string, v: string) => {
        jar[k] = v;
      },
      removeItem: (k: string) => {
        delete jar[k];
      },
    });
    store.rememberSport(DEMO_SLUG, 'volleyball');
    expect(Object.keys(jar)).toEqual([]);
    expect(store.chosenSport(DEMO_SLUG)).toBeNull();
    jar[`oh.sport.${DEMO_SLUG}`] = 'basketball';
    expect(store.chosenSport(DEMO_SLUG)).toBeNull();
  });

  it('refuses to remember a league table, even for a phone that followed Poland before opening the demo', async () => {
    await load(body());
    const { DEMO_SLUG, store } = await stores();
    // A phone that follows Poland on /oh/ has oh.school set to Poland's real
    // slug already — the same slug the demo uses — so without the isDemo()
    // guard this write would look exactly like the followed school saving its
    // own table.
    const jar: Record<string, string> = { 'oh.school': DEMO_SLUG };
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => jar[k] ?? null,
      setItem: (k: string, v: string) => {
        jar[k] = v;
      },
      removeItem: (k: string) => {
        delete jar[k];
      },
    });
    store.rememberLeagueTable(DEMO_SLUG, 'members', []);
    expect(Object.keys(jar).some((k) => k.startsWith('oh.league.'))).toBe(false);
  });
});

describe('a file that is not what it should be', () => {
  const mangled: Array<[string, unknown]> = [
    ['not an object', 'nope'],
    ['no slug', { ...body(), slug: '' }],
    ['no sport names', { ...body(), sportNames: [] }],
    ['a sport with no squad', { ...body(), sports: { ...body().sports, football: { players: [], schedule: null } } }],
    ['a sport the names promise and the file has not got', { ...body(), sportNames: ['football', 'volleyball', 'lacrosse'] }],
    ['a schedule that is not a list', { ...body(), sports: { ...body().sports, volleyball: { players: [player(3)], schedule: 'soon' } } }],
  ];

  it.each(mangled)('reads %s as no demo rather than throwing', async (_label, mangledBody) => {
    const { loadDemo } = await load(mangledBody);
    await expect(loadDemo()).resolves.toBeNull();
  });

  it('ignores the seasons and weather an older generator baked in', async () => {
    const { loadDemo } = await load({ ...body(), seasons: {}, weather: { date: '2026-09-25' } });
    await expect(loadDemo()).resolves.not.toBeNull();
  });

  it('reads a file that will not come at all as no demo', async () => {
    vi.resetModules();
    vi.stubGlobal('location', { pathname: '/oh/demo/', search: '' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('no signal');
      }),
    );
    const { loadDemo } = await import('./demo');
    await expect(loadDemo()).resolves.toBeNull();
  });
});

/*
 * The committed file itself. public/oh/demo.json is written by a hand-run
 * script and read by the store, so a regeneration that changes its shape
 * fails here rather than on a prospect's phone.
 */
describe('the committed file', () => {
  const DEMO_FILE = new URL('../../public/oh/demo.json', import.meta.url);
  const committed = () => JSON.parse(readFileSync(DEMO_FILE, 'utf8')) as Record<string, unknown>;

  it('reads as the demo, for Poland, with football first', async () => {
    const { loadDemo, DEMO_SLUG } = await load(committed());
    const demo = await loadDemo();
    expect(demo).not.toBeNull();
    expect(demo!.slug).toBe(DEMO_SLUG);
    expect(demo!.school.name).toBe('Poland Seminary');
    expect(demo!.sportNames[0]).toBe('football');
    expect(demo!.sportNames.length).toBeGreaterThanOrEqual(10);
  });

  it('carries a squad for every sport, and pasted fixtures for every sport but football', async () => {
    const { loadDemo } = await load(committed());
    const demo = (await loadDemo())!;
    for (const name of demo.sportNames) {
      const entry = demo.sports[name];
      expect(entry.players.length, name).toBeGreaterThan(0);
      const numbers = entry.players.map((p) => p.number);
      expect(new Set(numbers).size, `${name} numbers`).toBe(numbers.length);
      if (name === 'football') expect(entry.schedule).toBeNull();
      else expect(entry.schedule!.length, name).toBeGreaterThan(0);
    }
  });

  it('scores only what has been played, and only where a score means something', async () => {
    const { loadDemo } = await load(committed());
    const demo = (await loadDemo())!;
    const generatedOn = committed().generatedOn as string;
    for (const name of demo.sportNames) {
      for (const row of demo.sports[name].schedule ?? []) {
        if (row.score) {
          expect(['volleyball', 'boys soccer', 'girls soccer'], `${name} ${row.date}`).toContain(name);
          expect(row.date < generatedOn, `${name} ${row.date} scored ahead of time`).toBe(true);
          expect(row.score.us, `${name} ${row.date} drawn`).not.toBe(row.score.them);
        }
      }
    }
  });

  it('names the conference by the seven league games in the directory', async () => {
    const { loadDemo } = await load(committed());
    const demo = (await loadDemo())!;
    const league = demo.league as { name: string; members: string[] };
    expect(league.name).toBe('Northeast 8');
    expect(league.members).toHaveLength(7);
    const seasonFile = new URL('../../public/oh/data/poland-seminary-poland.json', import.meta.url);
    const games = (JSON.parse(readFileSync(seasonFile, 'utf8')) as { games: { week: number; opponentSlug: string }[] }).games;
    expect(league.members).toEqual(games.filter((g) => g.week >= 4 && g.week <= 10).map((g) => g.opponentSlug));
  });

  it('passes the store’s own colour and badge checks', async () => {
    await load(committed());
    const { DEMO_SLUG } = await import('./demo');
    const rosterStore = await import('./rosterStore');
    const identity = await rosterStore.loadSchoolSports(DEMO_SLUG);
    expect(identity!.colors).toEqual({ ground: '#04043a', accent: '#4fbaf7' });
    expect(identity!.logo).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('names only sports the hub can draw and place in a season', async () => {
    const { knownSports } = await import('./sportSeasons');
    const { glyphFor } = await import('./SportGlyph');
    const known = new Set(knownSports());
    for (const name of committed().sportNames as string[]) {
      const bare = name.replace(/^(boys|girls|coed) /, '');
      expect(known.has(name) || known.has(bare), name).toBe(true);
      expect(glyphFor(name), name).not.toBe('generic');
    }
  });
});
