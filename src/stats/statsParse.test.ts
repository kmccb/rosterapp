import { parseStats } from './statsParse';
import { matchName, matchStats, parsePrintedName } from './statsMatch';
import type { Player } from '../types';

const tab = (...cells: string[]) => cells.join('\t');

const PASSING = [
  'Passing Stats',
  tab('#', 'NAME', 'GAMES', 'CMP', 'ATT', 'CMP %', 'YDS', 'YDS/ATT', 'YDS/GAME', 'LNG', 'TD', 'INT', 'SACKED', 'RAT'),
  tab('1', 'D. Xipolitas', '11', '60', '92', '58.70 %', '1,006', '11.80', '68.73', '89', '14', '-', '5', '139'),
  tab('10', 'V. Komara', '12', '3', '17', '52.94 %', '95', '5.92', '8.25', '27', '1', '2', '-', '50'),
  tab('', 'Total:', '', '63', '109', '57.80 %', '1,195', '10.87', '99.75', '', '15', '2', '5', '127'),
].join('\n');

const RUSHING = [
  'Rushing Stats',
  tab('#', 'NAME', 'GAMES', 'CARRIES', 'YDS', 'YDS/CARRY', 'YDS/GAME', 'LNG', 'TD', 'FUM'),
  tab('5', 'C. Jones', '12', '93', '696', '7.48', '58.00', '53', '7', '2'),
  tab('43', 'P. Xipolitas', '12', '35', '170', '4.86', '14.17', '21', '9', '-'),
  tab('', 'Rest of team', '', '2', '-17', '-8.50', '-1.42', '', '', '-'),
].join('\n');

// Kick and punt return tables are column-for-column identical.
const KICK_RETURN = [
  'Kickoff Return Stats',
  tab('#', 'NAME', 'GAMES', 'RETURNS', 'YDS', 'YDS/RETURN', 'YDS/GAME', 'TD', 'LNG'),
  tab('21', 'N. Nittoli', '9', '7', '196', '28.00', '21.78', '1', '88'),
].join('\n');

const PUNT_RETURN = [
  'Punt Return Stats',
  tab('#', 'NAME', 'GAMES', 'RETURNS', 'YDS', 'YDS/RETURN', 'YDS/GAME', 'TD', 'LNG'),
  tab('10', 'V. Komara', '12', '18', '309', '17.17', '25.75', '1', '78'),
].join('\n');

const KICKING = [
  'Kicking Stats',
  tab('#', 'NAME', 'GAMES', 'FGM/FGA', 'FG %', 'LNG', 'XPM/XPA', 'XP %', 'PTS'),
  tab('7', 'A. Kicker', '12', '3 / 5', '60.00 %', '43', '57 / 59', '96.61 %', '66'),
].join('\n');

const player = (id: string, firstName: string, lastName: string): Player => ({
  id,
  number: '0',
  firstName,
  lastName,
  position: '',
  side: '',
});

describe('parseStats', () => {
  it('reads a passing table, commas and percentages included', () => {
    const { rows, categories } = parseStats(PASSING);
    expect(categories).toEqual(['passing']);
    expect(rows).toHaveLength(2);

    const d = rows[0];
    expect(d.name).toBe('D. Xipolitas');
    expect(d.number).toBe('1');
    expect(d.values.yds).toBe(1006);
    expect(d.values.cmp).toBe(60);
    expect(d.values.att).toBe(92);
    expect(d.values.td).toBe(14);
    expect(d.values.cmpPct).toBeCloseTo(58.7);
    expect(d.values.rating).toBe(139);
  });

  it('treats a dash as no value rather than zero', () => {
    const { rows } = parseStats(PASSING);
    expect(rows[0].values.int).toBeUndefined();
    expect(rows[1].values.sacked).toBeUndefined();
  });

  it('drops Total and Rest of team rows', () => {
    const { rows } = parseStats([PASSING, RUSHING].join('\n'));
    expect(rows.map((r) => r.name)).not.toContain('Total:');
    expect(rows.map((r) => r.name)).not.toContain('Rest of team');
  });

  it('keeps negative yardage', () => {
    const { rows } = parseStats(RUSHING);
    expect(rows.find((r) => r.name === 'C. Jones')?.values.yds).toBe(696);
  });

  it('separates kick returns from punt returns using the heading', () => {
    const { rows } = parseStats([KICK_RETURN, PUNT_RETURN].join('\n'));
    expect(rows.find((r) => r.name === 'N. Nittoli')?.category).toBe('kickReturn');
    expect(rows.find((r) => r.name === 'V. Komara')?.category).toBe('puntReturn');
  });

  it('cannot place a return table with no heading, and says so', () => {
    const headless = PUNT_RETURN.split('\n').slice(1).join('\n');
    const { rows, skippedTables } = parseStats(headless);
    expect(rows).toHaveLength(0);
    expect(skippedTables).toBe(1);
  });

  it('splits made/attempted pairs into two fields', () => {
    const { rows } = parseStats(KICKING);
    expect(rows[0].values.fgMade).toBe(3);
    expect(rows[0].values.fgAtt).toBe(5);
    expect(rows[0].values.xpMade).toBe(57);
    expect(rows[0].values.xpAtt).toBe(59);
  });

  it('reads several tables in one paste', () => {
    const { rows, categories } = parseStats([PASSING, RUSHING, PUNT_RETURN].join('\n'));
    expect(categories.sort()).toEqual(['passing', 'puntReturn', 'rushing']);
    expect(rows).toHaveLength(5);
  });

  it('copes with a paste that lost its tabs to plain text', () => {
    const spaced = PASSING.split('\n')
      .map((l) => l.split('\t').join('   '))
      .join('\n');
    const { rows } = parseStats(spaced);
    expect(rows[0].values.yds).toBe(1006);
  });

  it('returns nothing for text that isn’t a stats table', () => {
    expect(parseStats('7\tJake Miller\tQB\t6-1\t185').rows).toHaveLength(0);
  });
});

// Copied from the real Hudl page rather than written from memory. The screenshot
// of this table read as "BACK", which mapped a column of sacks onto nothing.
const DEFENSE_REAL = [
  'Defensive Stats',
  tab('#', 'NAME', 'GAMES', 'TACKLE', 'SOLO', 'ASSIST', 'SACK', 'TFL', 'SAFETY', 'INT', 'INT RET YDS', 'FF', 'FUM REC', 'FUM RET YDS', 'DEF TD'),
  tab('43', 'P. Xipolitas', '12', '82', '43', '39', '4', '9', '-', '-', '-', '3', '4', '35', '2'),
  tab('5', 'C. Jones', '12', '50', '36', '14', '-', '2', '-', '3', '45', '-', '1', '-9', '-'),
  tab('', 'Rest of team', '', '33', '28', '5', '-', '2', '-', '1', '29', '3', '-', '-', '-'),
  tab('', 'Total:', '', '549', '353', '196', '8', '36', '-', '13', '161', '8', '10', '102', '5'),
].join('\n');

describe('parseStats on the real defensive table', () => {
  it('reads SACK as sacks', () => {
    const { rows } = parseStats(DEFENSE_REAL);
    const p = rows.find((r) => r.name === 'P. Xipolitas');
    expect(p?.values.sacks).toBe(4);
    expect(p?.values.tackles).toBe(82);
    expect(p?.values.tfl).toBe(9);
    expect(p?.values.defTd).toBe(2);
  });

  it('keeps a negative fumble return', () => {
    const { rows } = parseStats(DEFENSE_REAL);
    expect(rows.find((r) => r.name === 'C. Jones')?.values.fumRetYds).toBe(-9);
  });

  it('leaves out Rest of team and Total', () => {
    expect(parseStats(DEFENSE_REAL).rows).toHaveLength(2);
  });
});

describe('parsePrintedName', () => {
  it('splits an initial and surname', () => {
    expect(parsePrintedName('D. Xipolitas')).toEqual({ initial: 'd', last: 'xipolitas' });
  });

  it('handles a full first name', () => {
    expect(parsePrintedName('Dominic Xipolitas')).toEqual({ initial: 'd', last: 'xipolitas' });
  });

  it('handles surname-first', () => {
    expect(parsePrintedName('Xipolitas, D.')).toEqual({ initial: 'd', last: 'xipolitas' });
  });

  it('handles a surname on its own', () => {
    expect(parsePrintedName('Komara')).toEqual({ initial: '', last: 'komara' });
  });
});

describe('matchName', () => {
  const roster = [
    player('a', 'Dominic', 'Xipolitas'),
    player('b', 'Peter', 'Xipolitas'),
    player('c', 'Vinny', 'Komara'),
  ];

  it('matches a unique surname without needing the initial', () => {
    expect(matchName('Komara', roster)).toEqual({ kind: 'matched', player: roster[2] });
  });

  it('uses the initial to separate two brothers', () => {
    expect(matchName('P. Xipolitas', roster)).toEqual({ kind: 'matched', player: roster[1] });
    expect(matchName('D. Xipolitas', roster)).toEqual({ kind: 'matched', player: roster[0] });
  });

  it('refuses to guess when the surname is shared and no initial is given', () => {
    const out = matchName('Xipolitas', roster);
    expect(out.kind).toBe('ambiguous');
  });

  it('reports a player who is no longer on the roster', () => {
    expect(matchName('E. Smith', roster)).toEqual({ kind: 'unmatched' });
  });
});

describe('matchStats', () => {
  const roster = [
    player('a', 'Dominic', 'Xipolitas'),
    player('c', 'Vinny', 'Komara'),
  ];

  it('files stats under the player and reports the ones it could not place', () => {
    const { rows } = parseStats([PASSING, RUSHING].join('\n'));
    const report = matchStats(rows, roster);

    expect(report.byPlayer['xipolitas|d'].passing.yds).toBe(1006);
    expect(report.byPlayer['komara|v'].passing.yds).toBe(95);
    // C. Jones and P. Xipolitas left the team.
    expect(report.unmatched.sort()).toEqual(['C. Jones', 'P. Xipolitas']);
  });

  it('merges categories for the same player', () => {
    const { rows } = parseStats([PASSING, PUNT_RETURN].join('\n'));
    const report = matchStats(rows, roster);
    expect(Object.keys(report.byPlayer['komara|v']).sort()).toEqual(['passing', 'puntReturn']);
    expect(report.byPlayer['komara|v'].puntReturn.returns).toBe(18);
  });
});
