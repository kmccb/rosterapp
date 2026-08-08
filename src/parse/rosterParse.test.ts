import { describe, expect, it } from 'vitest';
import {
  numberMatches,
  parseGrade,
  parseHeight,
  parseRoster,
  parseWeight,
  sideFromPosition,
  splitName,
} from './rosterParse';
import { formatHeight } from '../types';

const byNumber = (text: string) => {
  const { rows } = parseRoster(text);
  return new Map(rows.map((r) => [r.player.number, r.player]));
};

describe('parseHeight', () => {
  it('reads the shapes rosters actually use', () => {
    expect(parseHeight(`6'1"`)).toBe(73);
    expect(parseHeight("6'1")).toBe(73);
    expect(parseHeight('6-1')).toBe(73);
    expect(parseHeight('6 1')).toBe(73);
    expect(parseHeight('6ft1in')).toBe(73);
    expect(parseHeight('73')).toBe(73);
    expect(parseHeight(`5'11"`)).toBe(71);
    expect(parseHeight(`6'`)).toBe(72);
    expect(parseHeight('6’1”')).toBe(73); // curly quotes from Google Sheets
  });

  it('rejects nonsense rather than guessing', () => {
    expect(parseHeight('')).toBeUndefined();
    expect(parseHeight('n/a')).toBeUndefined();
    expect(parseHeight('6-13')).toBeUndefined(); // 13 inches isn't a height
    expect(parseHeight('185')).toBeUndefined(); // that's a weight
  });

  it('round-trips back to a readable height', () => {
    expect(formatHeight(73)).toBe(`6'1"`);
    expect(formatHeight(72)).toBe(`6'0"`);
    expect(formatHeight(71)).toBe(`5'11"`);
    expect(formatHeight(undefined)).toBe('');
  });
});

describe('parseWeight', () => {
  it('accepts plain and suffixed pounds', () => {
    expect(parseWeight('175')).toBe(175);
    expect(parseWeight('175 lbs')).toBe(175);
    expect(parseWeight('285#')).toBe(285);
  });

  it('rejects values outside a plausible range', () => {
    expect(parseWeight('12')).toBeUndefined();
    expect(parseWeight('900')).toBeUndefined();
    expect(parseWeight('')).toBeUndefined();
  });
});

describe('parseGrade', () => {
  it('normalises words and numbers', () => {
    expect(parseGrade('Jr')).toBe('Jr');
    expect(parseGrade('junior')).toBe('Jr');
    expect(parseGrade('SO.')).toBe('So');
    expect(parseGrade('11')).toBe('11');
    expect(parseGrade('12th')).toBe('12');
    expect(parseGrade('8')).toBeUndefined();
  });
});

describe('splitName', () => {
  it('handles both orderings and suffixes', () => {
    expect(splitName('John Smith')).toEqual({ firstName: 'John', lastName: 'Smith' });
    expect(splitName('Smith, John')).toEqual({ firstName: 'John', lastName: 'Smith' });
    expect(splitName('Smith , John')).toEqual({ firstName: 'John', lastName: 'Smith' });
    expect(splitName('John Robert Smith')).toEqual({
      firstName: 'John Robert',
      lastName: 'Smith',
    });
    expect(splitName('John Smith Jr.')).toEqual({ firstName: 'John', lastName: 'Smith Jr.' });
    expect(splitName('Cher')).toEqual({ firstName: '', lastName: 'Cher' });
  });
});

describe('sideFromPosition', () => {
  it('maps positions to a side of the ball', () => {
    expect(sideFromPosition('QB')).toBe('O');
    expect(sideFromPosition('WR')).toBe('O');
    expect(sideFromPosition('CB')).toBe('D');
    expect(sideFromPosition('K')).toBe('ST');
    expect(sideFromPosition('WR/CB')).toBe(''); // goes both ways
    expect(sideFromPosition('WR/KR')).toBe('O'); // returner alongside a real position
    expect(sideFromPosition('')).toBe('');
  });
});

describe('parseRoster — tab paste with a header', () => {
  // What you get copying cells out of Excel or Google Sheets.
  const text = [
    '#\tName\tPos\tHt\tWt\tGrade',
    '7\tJake Miller\tQB\t6-1\t185\tJr',
    '12\tAnthony Rodriguez\tWR\t5-10\t165\tSo',
    '72\tMarcus Webb\tOT\t6-4\t285\tSr',
    '55\tD.J. Cole\tLB\t6-0\t210\tJr',
  ].join('\n');

  it('maps every column from the header', () => {
    const result = parseRoster(text);
    expect(result.delimiter).toBe('tab');
    expect(result.header).toEqual(['#', 'Name', 'Pos', 'Ht', 'Wt', 'Grade']);
    expect(result.columns).toEqual(['number', 'name', 'position', 'height', 'weight', 'grade']);
    expect(result.rows).toHaveLength(4);
    expect(result.rows.every((r) => r.issues.length === 0)).toBe(true);
  });

  it('produces usable players', () => {
    const players = byNumber(text);
    expect(players.get('7')).toMatchObject({
      number: '7',
      firstName: 'Jake',
      lastName: 'Miller',
      position: 'QB',
      side: 'O',
      heightIn: 73,
      weightLb: 185,
      grade: 'Jr',
    });
    expect(players.get('72')).toMatchObject({ lastName: 'Webb', heightIn: 76, weightLb: 285 });
    expect(players.get('55')).toMatchObject({ firstName: 'D.J.', lastName: 'Cole', side: 'D' });
  });
});

describe('parseRoster — comma CSV with no header', () => {
  const text = [
    '7,"Miller, Jake",QB,6-1,185,Jr',
    '12,"Rodriguez, Anthony",WR,5-10,165,So',
    '72,"Webb, Marcus",OT,6-4,285,Sr',
    '9,"Nguyen, Kevin",WR/CB,5-9,160,So',
  ].join('\n');

  it('infers the columns from the values', () => {
    const result = parseRoster(text);
    expect(result.delimiter).toBe('comma');
    expect(result.header).toBeUndefined();
    expect(result.columns).toEqual(['number', 'name', 'position', 'height', 'weight', 'grade']);
  });

  it('unswaps "Last, First" inside quoted fields', () => {
    const players = byNumber(text);
    expect(players.get('7')).toMatchObject({ firstName: 'Jake', lastName: 'Miller' });
    // Both ways: no single side of the ball.
    expect(players.get('9')).toMatchObject({ position: 'WR/CB', side: '' });
  });
});

describe('parseRoster — ambiguous numeric columns', () => {
  it('tells a grade column apart from jersey numbers', () => {
    // Grades repeat and sit in 9-12; jersey numbers are spread and unique.
    const text = [
      '3\tTyler Brooks\tRB\t5-8\t170\t9',
      '21\tSam Fields\tCB\t5-11\t175\t12',
      '44\tOwen Hart\tLB\t6-2\t205\t11',
      '58\tLuis Ortega\tDT\t6-0\t250\t9',
    ].join('\n');
    const result = parseRoster(text);
    expect(result.columns).toEqual(['number', 'name', 'position', 'height', 'weight', 'grade']);
    expect(byNumber(text).get('21')).toMatchObject({ grade: '12', weightLb: 175, heightIn: 71 });
  });

  it('keeps height in inches apart from weight', () => {
    const text = ['7\tJake Miller\tQB\t73\t185', '72\tMarcus Webb\tOT\t76\t285'].join('\n');
    const players = byNumber(text);
    expect(players.get('7')).toMatchObject({ heightIn: 73, weightLb: 185 });
    expect(players.get('72')).toMatchObject({ heightIn: 76, weightLb: 285 });
  });
});

describe('parseRoster — separate first and last name columns', () => {
  it('uses the header to keep them straight', () => {
    const text = [
      'No.\tFirst\tLast\tPos\tHt\tWt\tYr',
      '7\tJake\tMiller\tQB\t6-1\t185\tJr',
      '72\tMarcus\tWebb\tOT\t6-4\t285\tSr',
    ].join('\n');
    const players = byNumber(text);
    expect(players.get('7')).toMatchObject({ firstName: 'Jake', lastName: 'Miller' });
  });
});

describe('parseRoster — messy input', () => {
  it('keeps a bad row as an editable row instead of throwing', () => {
    const text = [
      '#\tName\tPos\tHt\tWt',
      '7\tJake Miller\tQB\t6-1\t185',
      '\tUnknown Kid\t\tTBD\t',
      '99\t\tDE\t6-3\t240',
    ].join('\n');
    const { rows } = parseRoster(text);
    expect(rows).toHaveLength(3);
    expect(rows[1].issues).toContain('No jersey number');
    expect(rows[1].issues).toContain(`Couldn't read height "TBD"`);
    expect(rows[1].player.firstName).toBe('Unknown');
    expect(rows[2].issues).toContain('No name');
    expect(rows[2].player.side).toBe('D');
  });

  it('survives blank lines, stray whitespace and a trailing newline', () => {
    const text = '\n#\tName\tPos\n  7\t Jake Miller \tQB\n\n12\tSam Fields\tCB\n\n';
    const { rows } = parseRoster(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].player).toMatchObject({ number: '7', firstName: 'Jake', lastName: 'Miller' });
  });

  it('returns nothing for empty input', () => {
    expect(parseRoster('').rows).toHaveLength(0);
    expect(parseRoster('   \n  ').rows).toHaveLength(0);
  });

  it('strips a leading # from the jersey column', () => {
    const { rows } = parseRoster('#7\tJake Miller\tQB');
    expect(rows[0].player.number).toBe('7');
  });
});

describe('parseRoster — space-separated text', () => {
  it('peels fields off single-spaced lines', () => {
    const text = [
      '7 Jake Miller QB 6-1 185 Jr',
      '12 Anthony Rodriguez WR 5-10 165 So',
      '72 Marcus Webb OT 6-4 285 Sr',
    ].join('\n');
    const players = byNumber(text);
    expect(players.get('7')).toMatchObject({
      firstName: 'Jake',
      lastName: 'Miller',
      position: 'QB',
      heightIn: 73,
      weightLb: 185,
      grade: 'Jr',
    });
    expect(players.get('12')).toMatchObject({ firstName: 'Anthony', lastName: 'Rodriguez' });
  });

  it('handles column-aligned text padded with runs of spaces', () => {
    const text = ['7    Jake Miller     QB   6-1   185', '72   Marcus Webb     OT   6-4   285'].join(
      '\n',
    );
    const players = byNumber(text);
    expect(players.get('7')).toMatchObject({ lastName: 'Miller', position: 'QB', weightLb: 185 });
  });
});

describe('parseRoster — pipe-delimited team sheet', () => {
  // The shape a real program roster arrives in: pipes, a header, footnote
  // asterisks marking varsity letters, heights with no closing inch mark, and
  // nearly everyone listed at two positions because they go both ways.
  // (Names here are invented — real roster data stays on the device.)
  const text = [
    `# | NAME | HT | WT | POS | YR`,
    `1 | Aaron Whitfield* | 5'8 | 185 | QB/DB | JR`,
    `5 | Devon Marsh** | 5'8 | 165 | RB/DB | SR`,
    `13 | Petros Anagnostou | 5'6 | 125 | WR/DB | JR`,
    `42 | Nolan Pierce* | 5'8 | 185 | RB/DL | SR`,
    `71 | Isaac Bourne* | 6'4 | 270 | OL/DL | JR`,
    `75 | Wesley Cain | 6'0 | 270 | OL/DL | FR`,
    `81 | Mateo Ferraro* | 6'2 | 190 | PK | SO`,
  ].join('\n');

  it('splits on pipes and reads the header', () => {
    const result = parseRoster(text);
    expect(result.delimiter).toBe('pipe');
    expect(result.header).toEqual(['#', 'NAME', 'HT', 'WT', 'POS', 'YR']);
    // Column order follows the sheet: HT and WT come before POS.
    expect(result.columns).toEqual(['number', 'name', 'height', 'weight', 'position', 'grade']);
  });

  it('parses every row without complaint', () => {
    const { rows } = parseRoster(text);
    expect(rows).toHaveLength(7);
    expect(rows.flatMap((r) => r.issues)).toEqual([]);
  });

  it('drops the footnote asterisks from names', () => {
    const players = byNumber(text);
    expect(players.get('1')).toMatchObject({ firstName: 'Aaron', lastName: 'Whitfield' });
    expect(players.get('5')).toMatchObject({ firstName: 'Devon', lastName: 'Marsh' });
  });

  it("reads heights written without the closing inch mark", () => {
    const players = byNumber(text);
    expect(players.get('1')?.heightIn).toBe(68); // 5'8
    expect(players.get('71')?.heightIn).toBe(76); // 6'4
    expect(players.get('13')?.heightIn).toBe(66); // 5'6
  });

  it('leaves the side blank for two-way players and flags the kicker', () => {
    const players = byNumber(text);
    expect(players.get('1')).toMatchObject({ position: 'QB/DB', side: '' });
    expect(players.get('42')).toMatchObject({ position: 'RB/DL', side: '' });
    expect(players.get('81')).toMatchObject({ position: 'PK', side: 'ST' });
  });

  it('keeps FR through SR straight', () => {
    const players = byNumber(text);
    expect(players.get('75')?.grade).toBe('Fr');
    expect(players.get('81')?.grade).toBe('So');
    expect(players.get('1')?.grade).toBe('Jr');
    expect(players.get('5')?.grade).toBe('Sr');
  });
});

describe('parseRoster — markdown table', () => {
  it('ignores the rule row and the wrapping pipes', () => {
    const text = [
      '| # | Name | Pos | Ht | Wt |',
      '| --- | --- | :-: | --- | --- |',
      `| 7 | Jake Miller | QB | 6-1 | 185 |`,
      `| 72 | Marcus Webb | OT | 6-4 | 285 |`,
    ].join('\n');
    const { rows, columns } = parseRoster(text);
    expect(columns).toEqual(['number', 'name', 'position', 'height', 'weight']);
    expect(rows).toHaveLength(2);
    expect(rows[0].player).toMatchObject({ number: '7', lastName: 'Miller', heightIn: 73 });
  });
});

describe('numberMatches', () => {
  it('treats the typed digits as a prefix', () => {
    expect(numberMatches('7', '7')).toBe(true);
    expect(numberMatches('72', '7')).toBe(true);
    expect(numberMatches('12', '7')).toBe(false);
    expect(numberMatches('72', '72')).toBe(true);
    expect(numberMatches('7', '72')).toBe(false);
    expect(numberMatches('7', '')).toBe(true);
  });

  it('matches a leading-zero jersey either way', () => {
    expect(numberMatches('07', '7')).toBe(true);
    expect(numberMatches('07', '0')).toBe(true);
    expect(numberMatches('07', '07')).toBe(true);
  });
});
