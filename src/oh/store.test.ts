import { searchSchools } from './store';

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
