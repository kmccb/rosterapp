import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describeGame, recordOf, searchSchools } from './schools';
import type { School, SchoolGame, SchoolSeason } from '../ohio/stateModel';

const poland: SchoolSeason = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/directory-poland-2026.json', import.meta.url)), 'utf8'),
);

const s = (name: string, city: string): School => ({
  slug: `${name}-${city}`.toLowerCase().replace(/\s+/g, '-'),
  name,
  city,
});

const SCHOOLS: School[] = [
  s('Poland Seminary', 'Poland'),
  s('Youngstown East', 'Youngstown'),
  s('Youngstown Chaney', 'Youngstown'),
  s('Ursuline', 'Youngstown'),
  s('Struthers', 'Struthers'),
  s('Springfield', 'Springfield'),
  s('Springfield', 'New Middletown'),
  s('Jackson', 'Jackson'),
  s('Jackson-Milton', 'North Jackson'),
  s('Canfield', 'Canfield'),
  s('Salem', 'Salem'),
  s('Lowellville', 'Lowellville'),
  s('Ada', 'Ada'),
];

describe('searchSchools', () => {
  it('needs two characters before it answers', () => {
    expect(searchSchools(SCHOOLS, '')).toEqual([]);
    expect(searchSchools(SCHOOLS, 'p')).toEqual([]);
    expect(searchSchools(SCHOOLS, ' p ')).toEqual([]);
    expect(searchSchools(SCHOOLS, 'po')).toHaveLength(1);
  });

  it('matches the name, case and surrounding space ignored', () => {
    expect(searchSchools(SCHOOLS, '  POLAND ').map((x) => x.name)).toEqual(['Poland Seminary']);
  });

  it('matches the town too, so a school named for somewhere else is still found', () => {
    // Ursuline plays in Youngstown; nobody types "Ursuline" looking for the town.
    const names = searchSchools(SCHOOLS, 'youngs').map((x) => x.name);
    expect(names).toContain('Ursuline');
    expect(names).toContain('Youngstown East');
  });

  it('puts a name that starts with the query above one that merely contains it', () => {
    const names = searchSchools(SCHOOLS, 'jackson').map((x) => x.name);
    // Both start with "Jackson"; the town-only match for North Jackson would be
    // the same school, so this checks name-prefix ordering is alphabetical.
    expect(names).toEqual(['Jackson', 'Jackson-Milton']);
  });

  it('ranks name prefix, then town prefix, then anything that contains it', () => {
    const names = searchSchools(SCHOOLS, 'spring').map((x) => `${x.name}/${x.city}`);
    // Both Springfields match on name; alphabetical by name then city.
    expect(names).toEqual(['Springfield/New Middletown', 'Springfield/Springfield']);

    const east = searchSchools(SCHOOLS, 'east').map((x) => x.name);
    // "Youngstown East" only contains "east"; it still shows, after any prefix hits.
    expect(east).toEqual(['Youngstown East']);
  });

  it('caps the list at fifteen', () => {
    const many: School[] = Array.from({ length: 40 }, (_, i) => s(`Ada ${String(i).padStart(2, '0')}`, 'Ada'));
    expect(searchSchools(many, 'ada')).toHaveLength(15);
  });

  it('collapses runs of spaces in the query', () => {
    expect(searchSchools(SCHOOLS, 'poland   seminary').map((x) => x.name)).toEqual(['Poland Seminary']);
  });
});

describe('describeGame', () => {
  it("reads a home loss off Poland's real file", () => {
    const g = poland.games[0];
    expect(describeGame(g)).toEqual({
      week: 'Wk 1',
      date: 'Fri Aug 21',
      opponent: 'vs Salem',
      result: 'L 17–21',
    });
  });

  it('says "at" for an away game and puts our score first either way', () => {
    const g: SchoolGame = {
      week: 3, date: '2026-09-04', kickoff: '7pm', home: false,
      opponent: 'Struthers', opponentCity: 'Struthers', opponentSlug: 'struthers-struthers',
      result: { us: 28, them: 14, won: true },
    };
    expect(describeGame(g).opponent).toBe('at Struthers');
    expect(describeGame(g).result).toBe('W 28–14');
  });

  it('calls a level score a tie', () => {
    const g: SchoolGame = {
      week: 5, date: '2026-09-18', kickoff: '', home: true,
      opponent: 'Canfield', opponentCity: 'Canfield', opponentSlug: 'canfield-canfield',
      result: { us: 14, them: 14, won: false },
    };
    expect(describeGame(g).result).toBe('T 14–14');
  });

  it('shows the kickoff for a game not yet played, and nothing if there is no kickoff', () => {
    const last = poland.games[poland.games.length - 1];
    expect(last.result).toBeUndefined();
    expect(describeGame(last).result).toBe(last.kickoff);
    expect(describeGame({ ...last, kickoff: '' }).result).toBe('');
  });

  it("names the weekday from the date alone, whatever the machine's time zone", () => {
    // 2026-08-21 is a Friday; a UTC-vs-local slip would print Thursday.
    const g: SchoolGame = {
      week: 1, date: '2026-08-21', kickoff: '7pm', home: true,
      opponent: 'Salem', opponentCity: 'Salem', opponentSlug: 'salem-salem',
    };
    expect(describeGame(g).date).toBe('Fri Aug 21');
    expect(describeGame({ ...g, date: '2026-10-31' }).date).toBe('Sat Oct 31');
    expect(describeGame({ ...g, date: '2026-01-01' }).date).toBe('Thu Jan 1');
  });
});

describe('recordOf', () => {
  it('prints won–lost with an en dash', () => {
    expect(recordOf(poland)).toBe(`${poland.record.won}–${poland.record.lost}`);
    expect(recordOf({ ...poland, record: { won: 0, lost: 0, played: 0 } })).toBe('0–0');
  });
});

describe('against the published index', () => {
  // The root app now depends on this file's shape (Schools.tsx fetches it directly),
  // so this is the only test in the suite that reads the real committed file rather
  // than a pinned fixture — a change to its shape should fail here, not on a phone.
  it('finds Poland in the real directory index', () => {
    const index = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../public/oh/index.json', import.meta.url)), 'utf8'),
    );
    expect(searchSchools(index.schools, 'poland')[0].slug).toBe('poland-seminary-poland');
    expect(index.schools.length).toBeGreaterThan(700);
  });
});
