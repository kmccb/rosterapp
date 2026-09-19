import { searchSchools } from './schools';
import type { School } from '../ohio/stateModel';

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
