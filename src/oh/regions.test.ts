import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asRegionTable, averageLabel, dayLabel, seasonOf } from './regions';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/*
 * The committed files are rewritten by a scheduled job, so nothing here says
 * who is in which region or how many teams one holds — only what the job
 * promises on every run: each table reads, and the index never points a
 * school at a table it is not in.
 */
describe('the committed regions', () => {
  const index = read('public/oh/regions/index.json') as { year: number; regions: Record<string, number> };

  it('are tables the page can read, and the index agrees with every one of them', () => {
    const tables = new Map<number, ReturnType<typeof asRegionTable>>();
    for (const [slug, n] of Object.entries(index.regions)) {
      if (!tables.has(n)) tables.set(n, asRegionTable(read(`public/oh/regions/${n}.json`), index.year));
      const table = tables.get(n);
      expect(table, `region ${n}`).not.toBeNull();
      expect(table!.rows.some((r) => r.slug === slug), `${slug} in region ${n}`).toBe(true);
    }
    expect(tables.size).toBeGreaterThan(0);
  });
});

describe('a region file', () => {
  const row = { rank: '1', record: '8-0', school: 'McDonald', slug: 'mcdonald-mcdonald', average: 11.2875, qualifying: true };
  const file = { year: 2026, region: 25, caption: 'Top 12 teams qualify', fetched: '2026-10-10', rows: [row, row] };

  it('drops a row it cannot trust and keeps the rest', () => {
    const table = asRegionTable(
      { ...file, rows: [row, { ...row, school: '' }, { ...row, average: 'lots' }, null, { school: 'Lowellville', average: 4 }] },
      2026,
    );
    expect(table).toEqual({
      region: 25,
      division: 'VII',
      caption: 'Top 12 teams qualify',
      fetched: '2026-10-10',
      rows: [row, { rank: '', record: '', school: 'Lowellville', slug: null, average: 4, qualifying: false }],
    });
  });

  it('is refused for any season but the one it is', () => {
    expect(asRegionTable(file, 2026)).not.toBeNull();
    expect(asRegionTable(file, 2027)).toBeNull();
    expect(asRegionTable({ ...file, year: undefined }, 2026)).toBeNull();
  });

  it('is nothing for a region that is not one, or a table of one', () => {
    expect(asRegionTable(null, 2026)).toBeNull();
    expect(asRegionTable('<!doctype html>', 2026)).toBeNull();
    expect(asRegionTable({ ...file, region: 29 }, 2026)).toBeNull();
    expect(asRegionTable({ ...file, rows: [row] }, 2026)).toBeNull();
    expect(asRegionTable({ ...file, rows: 'none' }, 2026)).toBeNull();
  });

  it('leaves out a date it cannot read rather than printing it', () => {
    expect(asRegionTable({ ...file, fetched: 'last week' }, 2026)!.fetched).toBe('');
  });
});

describe('what the page prints', () => {
  it('counts July onward as the new season and the spring as last autumn’s', () => {
    expect(seasonOf(new Date(2026, 9, 13))).toBe(2026);
    expect(seasonOf(new Date(2027, 0, 20))).toBe(2026);
    expect(seasonOf(new Date(2027, 5, 30))).toBe(2026);
    expect(seasonOf(new Date(2027, 6, 1))).toBe(2027);
  });

  it('prints the average to the four places the source does, and the day without a year', () => {
    expect(averageLabel(6.325)).toBe('6.3250');
    expect(averageLabel(0)).toBe('0.0000');
    expect(dayLabel('2026-10-10')).toBe('Oct 10');
    expect(dayLabel('')).toBe('');
  });
});
