import { readFileSync } from 'node:fs';
import type { Player } from '../types';
import { canon } from './canon';
import { checkRoster, sameRoster, stripBom, tidySheet } from './rosterCheck';

const sheet = readFileSync('src/sync/fixtures/sheet-roster.csv', 'utf8');

describe('tidySheet', () => {
  it('drops a BOM, blank rows and a title above the header', () => {
    expect(tidySheet('﻿Title,,,\r\n,,,\r\n#,Name\r\n1,Ava Carter\r\n,,\r\n')).toBe('#,Name\n1,Ava Carter');
  });
  it('keeps a sheet with no title as it is', () => {
    expect(tidySheet('#,Name\n1,Ava Carter')).toBe('#,Name\n1,Ava Carter');
  });
});

describe('stripBom', () => {
  it('removes only a leading BOM', () => {
    expect(stripBom('﻿#,Name')).toBe('#,Name');
    expect(stripBom('#,Name')).toBe('#,Name');
  });
});

describe('checkRoster', () => {
  it('reads the published-sheet fixture', () => {
    const v = checkRoster(sheet, 0);
    if (!v.ok) throw new Error(v.reason);
    expect(v.players.map((p) => p.number)).toEqual(['1', '2', '3', '3', '7']);
    // A quoted "Last, First" survives the comma.
    expect(v.players[1].lastName).toBe('Smith');
    // An unreadable height is dropped, not fatal.
    expect(v.players[1].heightIn).toBeUndefined();
    expect(v.players[0].heightIn).toBe(68);
  });

  it('warns, never refuses, on a shared number and a bad height', () => {
    const v = checkRoster(sheet, 0);
    if (!v.ok) throw new Error(v.reason);
    expect(v.warnings).toContain('#3 is worn by 2 players');
    expect(v.warnings.some((w) => w.startsWith('#2 Jordan Smith: ') && w.includes('height'))).toBe(true);
  });

  it('refuses an empty sheet', () => {
    expect(checkRoster(',,,,\n,,,,\n', 0)).toEqual({ ok: false, reason: 'the sheet has no player rows' });
  });

  it('refuses a row with no number or no name, naming the first one', () => {
    const v = checkRoster('#,Name\n1,Ava Carter\n,Mia Lopez\n', 0);
    expect(v).toEqual({ ok: false, reason: 'a row is missing a number or a name (“Mia Lopez”)' });
    const two = checkRoster('#,Name\n1,Ava Carter\n,Mia Lopez\n,Kate Ryan\n', 0);
    expect(two).toEqual({ ok: false, reason: '2 rows are missing a number or a name (“Mia Lopez”)' });
  });

  it('refuses more than 300 rows', () => {
    const rows = Array.from({ length: 301 }, (_, i) => `${i % 99},Player ${i}`).join('\n');
    expect(checkRoster(`#,Name\n${rows}`, 0)).toEqual({
      ok: false,
      reason: 'the sheet has 301 rows, and a roster stops at 300',
    });
  });

  it('refuses a roster that lost more than half its players', () => {
    expect(checkRoster('#,Name\n1,Ava Carter\n2,Mia Lopez\n', 5)).toEqual({
      ok: false,
      reason: 'the sheet has 2 players where it had 5 — was it cleared, or the wrong tab published?',
    });
    expect(checkRoster('#,Name\n1,Ava Carter\n2,Mia Lopez\n3,Kate Ryan\n', 5).ok).toBe(true);
  });
});

describe('sameRoster', () => {
  const p = (over: Partial<Player>): Player => ({
    id: 'x', number: '1', firstName: 'Ava', lastName: 'Carter', position: 'S', side: 'D', ...over,
  });

  it('ignores ids, which the parser makes up on every read', () => {
    expect(sameRoster([p({ id: 'a' })], [p({ id: 'b' })])).toBe(true);
  });
  it('ignores key order, which jsonb rewrites', () => {
    const reordered = JSON.parse('{"side":"D","id":"z","number":"1","position":"S","lastName":"Carter","firstName":"Ava"}');
    expect(sameRoster([p({})], [reordered])).toBe(true);
  });
  it('sees a changed number or a different length', () => {
    expect(sameRoster([p({})], [p({ number: '2' })])).toBe(false);
    expect(sameRoster([p({})], [p({}), p({})])).toBe(false);
  });
});

describe('canon', () => {
  it('sorts keys at every depth and drops undefined', () => {
    expect(canon({ b: 1, a: { d: 2, c: undefined, b: [{ y: 1, x: 2 }] } })).toBe(
      '{"a":{"b":[{"x":2,"y":1}],"d":2},"b":1}',
    );
  });
});
