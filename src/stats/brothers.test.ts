/*
 * The Xipolitas brothers, pinned down.
 *
 * P. Xipolitas graduated; D. Xipolitas still plays. They share a surname and
 * both appear in last season's tables, and in the rushing table they appear in
 * consecutive rows with similar-looking numbers. Handing Peter's season to
 * Dominic is the single worst thing this code could do, so every roster shape
 * that could cause it gets a test.
 *
 * All numbers below are copied verbatim from the live Hudl page.
 */

import { parseStats } from './statsParse';
import { matchStats } from './statsMatch';
import type { Player } from '../types';

const T = (...c: string[]) => c.join('\t');

const HUDL = [
  'Passing Stats',
  T('#', 'NAME', 'GAMES', 'CMP', 'ATT', 'CMP %', 'YDS', 'YDS/ATT', 'YDS/GAME', 'LNG', 'TD', 'INT', 'SACKED', 'RAT'),
  T('1', 'D. Xipolitas', '11', '54', '92', '58.70 %', '1,086', '11.80', '98.73', '89', '14', '-', '5', '139'),
  '',
  'Rushing Stats',
  T('#', 'NAME', 'GAMES', 'CARRIES', 'YDS', 'YDS/CARRY', 'YDS/GAME', 'LNG', 'TD', 'FUM'),
  T('1', 'D. Xipolitas', '11', '56', '620', '11.07', '56.36', '72', '8', '-'),
  T('43', 'P. Xipolitas', '12', '35', '170', '4.86', '14.17', '21', '9', '-'),
  '',
  'Defensive Stats',
  T('#', 'NAME', 'GAMES', 'TACKLE', 'SOLO', 'ASSIST', 'SACK', 'TFL', 'SAFETY', 'INT', 'INT RET YDS', 'FF', 'FUM REC', 'FUM RET YDS', 'DEF TD'),
  T('43', 'P. Xipolitas', '12', '82', '43', '39', '4', '9', '-', '-', '-', '3', '4', '35', '2'),
].join('\n');

const player = (firstName: string, lastName: string, number = '7'): Player => ({
  id: `${firstName}-${lastName}`,
  number,
  firstName,
  lastName,
  position: '',
  side: '',
});

const rows = () => parseStats(HUDL).rows;

const DOMINIC = 'xipolitas|d';
const PETER = 'xipolitas|p';

describe('the Xipolitas brothers', () => {
  it('gives Dominic his own season and none of Peter’s', () => {
    const report = matchStats(rows(), [player('Dominic', 'Xipolitas')]);

    expect(report.byPlayer[DOMINIC].passing.yds).toBe(1086);
    expect(report.byPlayer[DOMINIC].passing.td).toBe(14);

    // Rushing is the trap: both brothers have a line, Peter's is 170 yds / 9 TD.
    expect(report.byPlayer[DOMINIC].rushing.yds).toBe(620);
    expect(report.byPlayer[DOMINIC].rushing.td).toBe(8);

    // Peter's defensive season must not surface anywhere on Dominic.
    expect(report.byPlayer[DOMINIC].defense).toBeUndefined();
    expect(report.byPlayer[PETER]).toBeUndefined();
  });

  it('reports Peter as gone rather than attaching him to anyone', () => {
    const report = matchStats(rows(), [player('Dominic', 'Xipolitas')]);
    expect(report.unmatched).toContain('P. Xipolitas');
    expect(report.matched.map((m) => m.printed)).not.toContain('P. Xipolitas');
  });

  it('keeps them apart when both are on the roster', () => {
    const report = matchStats(rows(), [
      player('Dominic', 'Xipolitas', '7'),
      player('Peter', 'Xipolitas', '43'),
    ]);

    expect(report.byPlayer[DOMINIC].rushing.yds).toBe(620);
    expect(report.byPlayer[DOMINIC].rushing.td).toBe(8);
    expect(report.byPlayer[PETER].rushing.yds).toBe(170);
    expect(report.byPlayer[PETER].rushing.td).toBe(9);
    expect(report.byPlayer[PETER].defense.tackles).toBe(82);
    expect(report.byPlayer[PETER].defense.sacks).toBe(4);
    expect(report.byPlayer[DOMINIC].defense).toBeUndefined();
  });

  it('refuses to merge them onto a surname-only roster entry', () => {
    // The roster was typed without first names, so nothing can tell them apart.
    const report = matchStats(rows(), [player('', 'Xipolitas')]);

    expect(Object.keys(report.byPlayer)).toHaveLength(0);
    expect(report.ambiguous.map((a) => a.printed).sort()).toEqual([
      'D. Xipolitas',
      'P. Xipolitas',
    ]);
  });

  it('is not confused by the same player written two ways', () => {
    // "D. Xipolitas" in one table and "Dominic Xipolitas" in another is one man.
    const mixed = HUDL.replace('1\tD. Xipolitas\t11\t56', '1\tDominic Xipolitas\t11\t56');
    const report = matchStats(parseStats(mixed).rows, [player('Dominic', 'Xipolitas')]);

    expect(report.byPlayer[DOMINIC].passing.yds).toBe(1086);
    expect(report.byPlayer[DOMINIC].rushing.yds).toBe(620);
    expect(report.ambiguous).toHaveLength(0);
  });

  it('does not hand Peter’s season to a different Xipolitas entirely', () => {
    // A younger brother arrives; still nobody whose initial is P.
    const report = matchStats(rows(), [player('Sam', 'Xipolitas')]);
    expect(Object.keys(report.byPlayer)).toHaveLength(0);
    expect(report.unmatched.sort()).toEqual(['D. Xipolitas', 'P. Xipolitas']);
  });
});
