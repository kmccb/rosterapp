import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sidesOf } from '../roster/filters';
import { bySide, leaders } from '../stats/leaders';
import { matchTeamStats } from '../oh/teamStats';
import type { Player } from '../types';
import { toPlayers } from '../oh/manage/saveArgs';
import { parseRoster } from '../parse/rosterParse';
import { parseMaxPrepsRoster, rosterCsv } from './rosterParse';
import { parseMaxPrepsStats } from './statsParse';

/*
 * Both pages as MaxPreps served them for Springfield on 2026-10-13, eight games
 * into the season. Every number asserted below was read off the rendered page
 * the same day, so a failure here means their markup moved, not that a kid had
 * a good Friday.
 */
const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const statsPage = fixture('springfield-stats-2026-10-13.html');
const rosterPage = fixture('springfield-roster-2026-10-13.html');

const withIds = (players: Array<Omit<Player, 'id'>>): Player[] =>
  players.map((p, i) => ({ id: `p${i}`, ...p }));

describe('the MaxPreps roster page', () => {
  const roster = parseMaxPrepsRoster(rosterPage);

  it('reads the forty-one athletes the page prints and none it has hidden', () => {
    expect(roster.problems).toEqual([]);
    expect(roster.players).toHaveLength(41);
    // #32 is a number Alex Caldwell used to wear; the page lists him once, at #4.
    expect(roster.players.filter((p) => p.lastName === 'Caldwell' && p.firstName === 'Alex')).toEqual([
      { number: '4', firstName: 'Alex', lastName: 'Caldwell', position: 'RB/ILB', side: '', heightIn: 68, weightLb: 181, grade: 'Jr' },
    ]);
  });

  it('prints in jersey order, with what is unknown left off rather than zeroed', () => {
    expect(roster.players[0]).toEqual({
      number: '1', firstName: 'Kaden', lastName: 'Carruthers', position: 'WR/DB', side: '',
      heightIn: 67, weightLb: 120, grade: 'Sr',
    });
    expect(roster.players.at(-1)?.number).toBe('88');
    const jones = roster.players.find((p) => p.number === '55');
    expect(jones).toEqual({ number: '55', firstName: 'Dominick', lastName: 'Jones', position: 'MLB', side: '', grade: 'Sr' });
  });

  it('keeps a third position, and lands every listed position on a side of the ball', () => {
    const masello = withIds(roster.players).find((p) => p.number === '36')!;
    expect(masello.position).toBe('WR/DB/K');
    expect(sidesOf(masello).sort()).toEqual(['D', 'O', 'ST']);
    for (const p of withIds(roster.players)) {
      if (p.position) expect(sidesOf(p).length, `#${p.number} ${p.position}`).toBeGreaterThan(0);
    }
  });

  it('writes a file the panel reads back as the same forty-one players', () => {
    const back = toPlayers(parseRoster(rosterCsv(roster.players)).rows);
    // The panel works a one-way player's side out of his position; everything
    // the file itself says has to come back as written.
    expect(back.map(({ id: _id, side: _side, ...p }) => p)).toEqual(
      roster.players.map(({ side: _side, ...p }) => p),
    );
  });

  it('refuses a page whose count disagrees with what was read', () => {
    const short = rosterPage.replace('"athleteCount":41', '"athleteCount":44');
    const out = parseMaxPrepsRoster(short);
    expect(out.players).toEqual([]);
    expect(out.problems[0]).toMatch(/44 athletes and 41 were read/);
  });

  it('refuses a page that no longer states its count, since nothing else can contradict the slots', () => {
    const out = parseMaxPrepsRoster(rosterPage.replace('"athleteCount":41', '"athletes":41'));
    expect(out.players).toEqual([]);
    expect(out.problems[0]).toMatch(/cannot be checked/);
  });

  it('carries nobody the coach removed, and no ids', () => {
    expect(roster.players.some((p) => /Sample|Placeholder/.test(p.lastName))).toBe(false);
    expect(rosterPage).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/);
  });

  it('refuses a page with no data on it', () => {
    expect(parseMaxPrepsRoster('<html><body>Access denied</body></html>').problems).toHaveLength(1);
  });
});

describe('the MaxPreps stats page', () => {
  const stats = parseMaxPrepsStats(statsPage);
  const of = (name: string, category: string) =>
    Object.assign({}, ...stats.rows.filter((r) => r.name === name && r.category === category).map((r) => r.values));

  it('finds every table it reads and has nothing to complain of', () => {
    expect(stats.problems).toEqual([]);
    expect(stats.tables).toHaveLength(10);
  });

  it('reads passing by the full name, with the percentage as a percentage', () => {
    expect(of('Michael Tuscano', 'passing')).toEqual({
      games: 8, cmp: 26, att: 59, yds: 397, cmpPct: 44.1, ydsPerGame: 49.6, td: 3, int: 5, lng: 64, rating: 48.5,
    });
  });

  it('reads rushing, and a loss as a loss', () => {
    expect(of('Alex Caldwell', 'rushing')).toMatchObject({ games: 7, carries: 98, yds: 709, ydsPerCarry: 7.2, td: 8 });
    expect(of('Carson Timmins', 'rushing')).toMatchObject({ carries: 3, yds: -22 });
  });

  it('folds three defense tables into one line and leaves the zeros out of it', () => {
    const jones = of('Dominick Jones', 'defense');
    expect(jones.sacks).toBe(8);
    expect(jones.ff).toBe(3);
    expect(jones.tackles).toBeGreaterThan(80);
    expect(jones).not.toHaveProperty('int');
  });

  it('leaves out the season totals and anybody with nothing in a table', () => {
    expect(stats.rows.some((r) => /total/i.test(r.name))).toBe(false);
    // Twenty-three players are listed under Sacks; most have none.
    expect(stats.rows.filter((r) => r.category === 'defense' && 'sacks' in r.values).length).toBeLessThan(10);
    for (const r of stats.rows) expect(Object.keys(r.values).length, r.name).toBeGreaterThan(0);
  });

  it('splits the one returns table into the two the card has', () => {
    const kick = stats.rows.filter((r) => r.category === 'kickReturn');
    const punt = stats.rows.filter((r) => r.category === 'puntReturn');
    expect(kick.length + punt.length).toBeGreaterThan(0);
    for (const r of [...kick, ...punt]) {
      if ('returns' in r.values) expect(r.values.returns).toBeGreaterThan(0);
    }
  });

  it('matches every name it read to the roster from the same day', () => {
    const players = withIds(parseMaxPrepsRoster(rosterPage).players);
    // The page's own matcher: nobody the stats name is missing from the tab.
    const byPlayer = matchTeamStats(stats.rows, players);
    expect(Object.keys(byPlayer)).toHaveLength(new Set(stats.rows.map((r) => r.name)).size);
    const report = { byPlayer };

    const blocks = leaders(report.byPlayer, players);
    const rushing = blocks.find((b) => b.category === 'rushing')!;
    expect(rushing.rows[0]).toMatchObject({ number: '4', name: 'Alex Caldwell', value: 709 });
    expect(blocks.find((b) => b.category === 'defense')!.rows[0].name).toBe('Dominick Jones');
    expect(bySide(report.byPlayer, players, 'special').length).toBeGreaterThan(0);
  });

  it('says so when the tables it needs are not there', () => {
    expect(parseMaxPrepsStats('<html><body>Access denied</body></html>').problems).toHaveLength(2);
    const emptied = statsPage.replace(/<tbody>[\s\S]*?<\/tbody>/g, '<tbody></tbody>');
    expect(parseMaxPrepsStats(emptied).problems).toHaveLength(2);
  });
});
