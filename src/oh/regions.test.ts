import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asRegionTable, averageLabel } from './regions';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('the committed regions', () => {
  const index = read('public/oh/regions/index.json') as { year: number; regions: Record<string, number> };

  it('place Springfield in a region whose table has it in', () => {
    const n = index.regions['springfield-new-middletown'];
    const table = asRegionTable(read(`public/oh/regions/${n}.json`));
    expect(table).not.toBeNull();
    expect(table!.division).toBe('VII');
    expect(table!.rows.filter((r) => r.slug === 'springfield-new-middletown')).toHaveLength(1);
  });

  it('hold all twenty-eight tables, and every school the index names is in the one it names', () => {
    const tables = Array.from({ length: 28 }, (_, i) => asRegionTable(read(`public/oh/regions/${i + 1}.json`)));
    expect(tables.every(Boolean)).toBe(true);
    for (const [slug, n] of Object.entries(index.regions)) {
      expect(tables[n - 1]!.rows.some((r) => r.slug === slug), slug).toBe(true);
    }
  });
});

describe('a region file', () => {
  const row = { rank: '1', record: '8-0', school: 'McDonald', slug: 'mcdonald-mcdonald', average: 11.2875, qualifying: true };

  it('drops a row it cannot trust and keeps the rest', () => {
    const table = asRegionTable({
      region: 25,
      caption: 'Top 12 teams qualify',
      rows: [row, { ...row, school: '' }, { ...row, average: 'lots' }, null, { school: 'Lowellville', average: 4 }],
    });
    expect(table).toEqual({
      region: 25,
      division: 'VII',
      caption: 'Top 12 teams qualify',
      rows: [row, { rank: '', record: '', school: 'Lowellville', slug: null, average: 4, qualifying: false }],
    });
  });

  it('is nothing for a region that is not one, or a table of one', () => {
    expect(asRegionTable(null)).toBeNull();
    expect(asRegionTable('<!doctype html>')).toBeNull();
    expect(asRegionTable({ region: 29, rows: [row, row] })).toBeNull();
    expect(asRegionTable({ region: 25, rows: [row] })).toBeNull();
    expect(asRegionTable({ region: 25, rows: 'none' })).toBeNull();
  });

  it('prints the average to the four places the source does', () => {
    expect(averageLabel(6.325)).toBe('6.3250');
    expect(averageLabel(0)).toBe('0.0000');
  });
});
