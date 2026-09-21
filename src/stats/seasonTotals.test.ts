import { seasonTotals } from './seasonTotals';
import type { SeasonStats } from './statsStore';

const season = (games: SeasonStats['games'], byPlayer: SeasonStats['byPlayer'] = {}): SeasonStats => ({
  label: '2026',
  byPlayer,
  updatedAt: '2026-09-21T00:00:00.000Z',
  games,
});

describe('seasonTotals', () => {
  it('sums counting fields across games', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'jones|c': { rushing: { carries: 13, yds: 23, td: 1, lng: 12 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: { 'jones|c': { rushing: { carries: 26, yds: 163, td: 1, lng: 51 } } } },
      ]),
    );
    expect(t['jones|c'].rushing.carries).toBe(39);
    expect(t['jones|c'].rushing.yds).toBe(186);
    expect(t['jones|c'].rushing.td).toBe(2);
  });

  it('takes the longest for lng rather than adding it', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'jones|c': { rushing: { carries: 1, yds: 12, lng: 12 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: { 'jones|c': { rushing: { carries: 1, yds: 51, lng: 51 } } } },
      ]),
    );
    expect(t['jones|c'].rushing.lng).toBe(51);
  });

  it('recomputes averages from the sums instead of averaging the averages', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'x|d': { punting: { punts: 4, yds: 136, ydsPerPunt: 34 }, passing: { cmp: 6, att: 11, yds: 83 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: { 'x|d': { punting: { punts: 1, yds: 25, ydsPerPunt: 25 }, passing: { cmp: 3, att: 6, yds: 33 } } } },
      ]),
    );
    expect(t['x|d'].punting.ydsPerPunt).toBeCloseTo(161 / 5);
    expect(t['x|d'].passing.cmpPct).toBeCloseTo((9 / 17) * 100);
    expect(t['x|d'].passing.ydsPerAtt).toBeCloseTo(116 / 17);
  });

  it('adds ydsPerCarry, ydsPerRec and ydsPerReturn when their parts are present', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'j|c': { rushing: { carries: 10, yds: 55 }, receiving: { rec: 2, yds: 30 }, kickReturn: { returns: 2, yds: 120 } } } },
      ]),
    );
    expect(t['j|c'].rushing.ydsPerCarry).toBeCloseTo(5.5);
    expect(t['j|c'].receiving.ydsPerRec).toBe(15);
    expect(t['j|c'].kickReturn.ydsPerReturn).toBe(60);
  });

  it('does not zero a total because one game lacked the field', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'z|p': { defense: { tackles: 12, int: 1 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: { 'z|p': { defense: { tackles: 6 } } } },
      ]),
    );
    expect(t['z|p'].defense).toEqual({ tackles: 18, int: 1 });
  });

  it('keeps a player who appears in one game only', () => {
    const t = seasonTotals(
      season([
        { date: '2026-08-21', opponent: 'Salem', byPlayer: { 'a|b': { receiving: { rec: 1, yds: 9 } } } },
        { date: '2026-09-11', opponent: 'Canfield', byPlayer: {} },
      ]),
    );
    expect(t['a|b'].receiving).toEqual({ rec: 1, yds: 9, ydsPerRec: 9 });
  });

  it('falls back to the whole-season paste when there are no games', () => {
    const pasted = { 'j|c': { rushing: { carries: 73, yds: 481, td: 4 } } };
    expect(seasonTotals(season(undefined, pasted))).toBe(pasted);
    expect(seasonTotals(season([], pasted))).toBe(pasted);
  });

  it('answers an empty object for no season at all', () => {
    expect(seasonTotals(undefined)).toEqual({});
  });
});
