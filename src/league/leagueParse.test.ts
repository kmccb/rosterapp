import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTeamPage, parseRegionTable } from './leagueParse';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseTeamPage', () => {
  const played = parseTeamPage(fixture('team-2025-poland.html'), 2025);

  it('reads the team, its record and where it is filed', () => {
    expect(played.name).toBe('Poland Seminary');
    expect(played.record).toBe('9-3');
    // Never hardcode this: it moved to IV:13 the following season.
    expect(played.division).toBe('V');
    expect(played.region).toBe(17);
  });

  it('reads a played game, opponent id and all', () => {
    const opener = played.games[0];
    expect(opener).toMatchObject({
      date: '2025-08-22',
      home: false,
      opponent: 'Salem',
      opponentId: 1392,
      opponentRecord: '7-5',
      result: { us: 48, them: 26 },
    });
  });

  it('keeps the loss the right way round', () => {
    const girard = played.games.find((g) => g.opponent === 'Girard' && g.date === '2025-10-10');
    expect(girard?.result).toEqual({ us: 28, them: 29 });
  });

  it('finds every game on the page', () => {
    expect(played.games).toHaveLength(12);
  });

  it('leaves a fixture with no score unplayed rather than nil-nil', () => {
    const upcoming = parseTeamPage(fixture('team-2026-poland.html'), 2026);
    expect(upcoming.division).toBe('IV');
    expect(upcoming.region).toBe(13);
    expect(upcoming.games).toHaveLength(10);
    expect(upcoming.games[0]).toMatchObject({
      date: '2026-08-21',
      home: true,
      opponent: 'Salem',
    });
    expect(upcoming.games[0].result).toBeUndefined();
  });

  it('resolves every Northeast 8 rival from Poland own page', () => {
    const upcoming = parseTeamPage(fixture('team-2026-poland.html'), 2026);
    const byName = Object.fromEntries(upcoming.games.map((g) => [g.opponent, g.opponentId]));
    expect(byName).toMatchObject({
      Girard: 644, Hubbard: 738, Lakeview: 828,
      'Niles McKinley': 994, 'South Range': 1460, Struthers: 1500,
    });
  });
});

describe('parseRegionTable', () => {
  const table = parseRegionTable(fixture('region-2026-13.html'));

  it('keeps the caption, which states the cut', () => {
    expect(table.caption).toBe('Top 12 teams following week 10 qualify for playoffs');
  });

  it('reads every team in the region', () => {
    expect(table.rows).toHaveLength(24);
  });

  it('marks exactly the rows the site marks as qualifying', () => {
    expect(table.rows.filter((r) => r.qualifying)).toHaveLength(12);
  });

  it('finds Poland, which is what the screen picks out', () => {
    const poland = table.rows.find((r) => r.school === 'Poland Seminary');
    expect(poland).toBeDefined();
    expect(poland!.teamId).toBe(1264);
  });

  it('reads a row whole', () => {
    const first = table.rows[0];
    expect(first.rank).toBe('1t');
    expect(first.record).toBe('0-0');
    expect(typeof first.average).toBe('number');
    expect(Number.isNaN(first.average)).toBe(false);
  });
});
