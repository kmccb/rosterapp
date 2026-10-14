import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { divisionOf, parseRegionPage, slugForRow } from './regionParse';

// The page Poland's own league parser is pinned to: Region 13, saved before a
// game had been played, so every team is level on nothing.
const page = readFileSync(new URL('../league/fixtures/region-2026-13.html', import.meta.url), 'utf8');
const directory = (
  JSON.parse(readFileSync('public/oh/index.json', 'utf8')) as {
    schools: Array<{ slug: string; name: string; city: string }>;
  }
).schools;

describe('a region’s rankings page', () => {
  const region = parseRegionPage(page);

  it('knows which region it is and what the page says qualifies', () => {
    expect(region).not.toBeNull();
    expect(region!.region).toBe(13);
    expect(region!.year).toBe(2026);
    expect(region!.caption).toMatch(/qualify for playoffs/);
  });

  it('reads each team with its mailing city, not its id number', () => {
    expect(region!.rows.length).toBeGreaterThan(20);
    expect(region!.rows[0]).toEqual({
      rank: '1t',
      record: '0-0',
      school: 'Cleveland Central Catholic',
      city: 'Cleveland',
      average: 0,
      // Nobody has played, so nobody is in a playoff place whatever the site marks.
      qualifying: false,
    });
    expect(region!.rows.find((r) => r.school === 'Poland Seminary')?.city).toBe('Poland');
    for (const r of region!.rows) expect(r.school, r.rank).not.toMatch(/^\d+$/);
  });

  it('places nearly every row in the directory by name and city', () => {
    const placed = region!.rows.filter((r) => slugForRow(r, directory));
    expect(placed.length / region!.rows.length).toBeGreaterThan(0.9);
    expect(slugForRow({ school: 'Poland Seminary', city: 'Poland' }, directory)).toBe('poland-seminary-poland');
  });

  it('finds its columns by heading, so one more column in front does not shift them', () => {
    const wider = page
      .replace(/<th>Current<br>Rank<\/th>/, '<th>New</th><th>Current<br>Rank</th>')
      .replace(/(<tr class="(?:odd|even)[^"]*"[^>]*>)/g, '$1<td>x</td>');
    const again = parseRegionPage(wider);
    expect(again!.rows[0].school).toBe('Cleveland Central Catholic');
    expect(again!.rows[0].city).toBe('Cleveland');
  });

  it('is nothing when the page is not a region’s table', () => {
    expect(parseRegionPage('<html><title>Not found</title></html>')).toBeNull();
    expect(parseRegionPage(page.replace(/<thead>[\s\S]*?<\/thead>/, '<thead></thead>'))).toBeNull();
    expect(parseRegionPage(page.replace(/Region 13/, 'Region 99'))).toBeNull();
  });
});

describe('a row’s school', () => {
  it('needs the city as well as the name', () => {
    const springfields = directory.filter((s) => s.name === 'Springfield');
    expect(springfields.length).toBeGreaterThan(1);
    expect(slugForRow({ school: 'Springfield', city: 'New Middletown' }, directory)).toBe('springfield-new-middletown');
    expect(slugForRow({ school: 'Springfield', city: 'Nowhere' }, directory)).toBeNull();
  });

  it('ignores case and punctuation, and gives up on two schools that fit', () => {
    const made = [
      { slug: 'st-johns-toledo', name: "St. John's", city: 'Toledo' },
      { slug: 'a', name: 'Twin', city: 'Same' },
      { slug: 'b', name: 'Twin', city: 'Same' },
    ];
    expect(slugForRow({ school: 'St Johns', city: 'TOLEDO' }, made)).toBe('st-johns-toledo');
    expect(slugForRow({ school: 'Twin', city: 'Same' }, made)).toBeNull();
  });
});

describe('a region’s division', () => {
  it('is four regions to a division, in order', () => {
    expect([1, 4, 5, 13, 25, 28].map(divisionOf)).toEqual(['I', 'I', 'II', 'IV', 'VII', 'VII']);
    expect([0, 29, 2.5, NaN].map(divisionOf)).toEqual(['', '', '', '']);
  });
});
