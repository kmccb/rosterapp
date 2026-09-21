import { bySide, gameLabel, leaders } from './leaders';
import { playerKey } from './statsMatch';
import type { Player } from '../types';

const p = (number: string, firstName: string, lastName: string): Player => ({
  id: `${number}-${lastName}`,
  number,
  firstName,
  lastName,
  position: '',
  side: '',
});

const jones = p('5', 'Chase', 'Jones');
const xip = p('1', 'Dominic', 'Xipolitas');
const scott = p('12', 'Caleb', 'Scott');
const zoumis = p('28', 'Peter', 'Zoumis');
const seven = p('07', 'Tom', 'Dedo');
const PLAYERS = [jones, xip, scott, zoumis, seven];
const k = playerKey;

describe('leaders', () => {
  it("ranks the top three on the category's headline field with the card's parts", () => {
    const blocks = leaders(
      {
        [k(jones)]: { rushing: { yds: 481, td: 4, carries: 73 } },
        [k(xip)]: { rushing: { yds: 353, td: 3, carries: 47 } },
        [k(scott)]: { rushing: { yds: 18, carries: 3 } },
        [k(zoumis)]: { rushing: { yds: 7, td: 1, carries: 1 } },
      },
      PLAYERS,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].category).toBe('rushing');
    expect(blocks[0].label).toBe('Rushing');
    expect(blocks[0].rows.map((r) => r.name)).toEqual(['Chase Jones', 'Dominic Xipolitas', 'Caleb Scott']);
    expect(blocks[0].rows[0]).toMatchObject({ key: k(jones), number: '5', value: 481 });
    expect(blocks[0].rows[0].parts).toEqual(['481 yds', '4 TD', '73 car']);
  });

  it('keeps a tie for third rather than cutting it', () => {
    const blocks = leaders(
      {
        [k(jones)]: { defense: { tackles: 41 } },
        [k(zoumis)]: { defense: { tackles: 37 } },
        [k(scott)]: { defense: { tackles: 14 } },
        [k(xip)]: { defense: { tackles: 14 } },
        [k(seven)]: { defense: { tackles: 4 } },
      },
      PLAYERS,
    );
    expect(blocks[0].rows.map((r) => r.number)).toEqual(['5', '28', '12', '1']);
  });

  it('orders blocks like the card and leaves out a category nobody has', () => {
    const blocks = leaders(
      {
        [k(jones)]: { kickReturn: { yds: 228, returns: 6 }, receiving: { yds: 119, rec: 7 } },
        [k(xip)]: { passing: { yds: 513, td: 6, cmp: 27, att: 47 } },
      },
      PLAYERS,
    );
    expect(blocks.map((b) => b.category)).toEqual(['passing', 'receiving', 'kickReturn']);
  });

  it('skips a key with no roster player and a player without the headline field', () => {
    const blocks = leaders(
      {
        'ghost|g': { rushing: { yds: 999 } },
        [k(jones)]: { rushing: { td: 2 } },
        [k(xip)]: { rushing: { yds: 10 } },
      },
      PLAYERS,
    );
    expect(blocks[0].rows.map((r) => r.name)).toEqual(['Dominic Xipolitas']);
  });

  it('breaks a tie on the headline by name so the order is stable', () => {
    const blocks = leaders(
      { [k(xip)]: { rushing: { yds: 50 } }, [k(jones)]: { rushing: { yds: 50 } } },
      PLAYERS,
    );
    expect(blocks[0].rows.map((r) => r.name)).toEqual(['Chase Jones', 'Dominic Xipolitas']);
  });
});

describe('bySide', () => {
  const totals = {
    [k(jones)]: { rushing: { yds: 481, carries: 73 }, defense: { tackles: 37 }, kickReturn: { yds: 228, returns: 6 } },
    [k(xip)]: { passing: { yds: 513, cmp: 27, att: 47 }, punting: { punts: 6, ydsPerPunt: 32.5 } },
    [k(seven)]: { defense: { tackles: 4 } },
    [k(scott)]: { receiving: { yds: 103, rec: 3 } },
  } as Record<string, Record<string, Record<string, number>>>;

  it("lists a side's players by number with only that side's lines", () => {
    const rows = bySide(totals, PLAYERS, 'offense');
    expect(rows.map((r) => r.number)).toEqual(['1', '5', '12']);
    expect(rows[1].lines.map((l) => l.label)).toEqual(['Rushing']);
    expect(rows[0].lines.map((l) => l.label)).toEqual(['Passing']);
  });

  it('puts a two-way player on both lists', () => {
    expect(bySide(totals, PLAYERS, 'defense').map((r) => r.name)).toEqual(['Chase Jones', 'Tom Dedo']);
    expect(bySide(totals, PLAYERS, 'special').map((r) => r.name)).toEqual(['Dominic Xipolitas', 'Chase Jones']);
  });

  it('sorts numbers as numbers, so 07 comes before 12', () => {
    expect(bySide(totals, PLAYERS, 'defense').map((r) => r.number)).toEqual(['5', '07']);
  });

  it('leaves out a player with nothing on that side', () => {
    expect(bySide(totals, PLAYERS, 'defense').map((r) => r.name)).not.toContain('Caleb Scott');
  });
});

describe('gameLabel', () => {
  it('prints the day and the opponent as typed', () => {
    expect(gameLabel('2026-09-04', 'Field')).toBe('Sep 4 · Field');
    expect(gameLabel('2026-10-23', 'Struthers')).toBe('Oct 23 · Struthers');
  });

  it('falls back to the raw date if it is not YYYY-MM-DD', () => {
    expect(gameLabel('Friday', 'Salem')).toBe('Friday · Salem');
  });
});
