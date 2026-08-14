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

  it('keeps the # that marks a playoff game, rather than only peeling it off', () => {
    // Two of Poland's 2025 games were playoff games. The name still comes out
    // clean; the fact that made the '#' is kept beside it, because the league
    // record is a game wrong without it.
    const marked = played.games.filter((g) => g.playoff);
    expect(marked.map((g) => `${g.date} ${g.opponent}`)).toEqual([
      '2025-11-07 Liberty', '2025-11-14 Girard',
    ]);
    expect(played.games.filter((g) => !g.playoff)).toHaveLength(10);
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

/*
 * The assumption that holds the whole build together, and the only one that
 * spans two pages: the name a rival's own <caption> gives it must be the same
 * string Poland's opponent column uses, because the ids are resolved by that
 * name on Poland's page and the standings are then filtered by it on the
 * rival's. Get it wrong and the rival is fetched, parsed, and silently dropped
 * from the table. One rival is pinned here — Girard, the school Poland plays
 * every year and met twice in 2025 — as the canary for the whole set.
 */
describe('a rival page, against the name Poland calls it', () => {
  const poland = parseTeamPage(fixture('team-2026-poland.html'), 2026);
  const girard = parseTeamPage(fixture('team-2026-girard.html'), 2026);

  it('names itself exactly as Poland opponent column spells it', () => {
    const onPolandsPage = poland.games.find((g) => g.opponentId === 644);
    expect(onPolandsPage).toBeDefined();
    expect(girard.name).toBe(onPolandsPage!.opponent);
    expect(girard.name).toBe('Girard');
  });

  it('carries a schedule and a region of its own, so it survives the fetch guard', () => {
    expect(girard.games.length).toBeGreaterThan(0);
    expect(girard.region).toBeGreaterThan(0);
  });

  it('has Poland on its page under the name Poland calls itself', () => {
    expect(girard.games.map((g) => g.opponent)).toContain(poland.name);
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
