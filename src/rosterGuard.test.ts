import { describe, expect, it } from 'vitest';
import { repairStoredPlayers, sharedPlayers } from './rosterGuard';
import type { Player } from './types';

const plain = { number: '7', firstName: 'Sam', lastName: 'Reed', position: 'QB', side: 'O' };

describe('players arriving in a share', () => {
  it('keeps every field a typed roster has', () => {
    const [p] = sharedPlayers([{ ...plain, id: 'theirs', heightIn: 73, weightLb: 185, grade: 'Jr' }]);
    expect(p).toMatchObject({ ...plain, heightIn: 73, weightLb: 185, grade: 'Jr' });
  });

  it('mints its own id rather than trusting the one that came', () => {
    const [a, b] = sharedPlayers([{ ...plain, id: 'same' }, { ...plain, id: 'same' }]);
    expect(a.id).not.toBe('same');
    expect(a.id).not.toBe(b.id);
  });

  it('drops what only a baked roster may carry', () => {
    const [p] = sharedPlayers([
      { ...plain, photo: 'https://tracker.example/p.gif', hometown: 'X', bio: 'Y', lines: [{ label: 'a', value: 'b' }] },
    ]);
    expect(p).not.toHaveProperty('photo');
    expect(p).not.toHaveProperty('hometown');
    expect(p).not.toHaveProperty('bio');
    expect(p).not.toHaveProperty('lines');
  });

  it('drops any field it does not know', () => {
    const [p] = sharedPlayers([{ ...plain, onClick: 'x', style: {} }]);
    expect(Object.keys(p).sort()).toEqual(['firstName', 'id', 'lastName', 'number', 'position', 'side']);
  });

  it.each([
    ['an object', { first: 'x' }],
    ['an array', ['x']],
    ['null', null],
    ['a boolean', true],
  ])('reads a name that is %s as no name', (_label, firstName) => {
    const [p] = sharedPlayers([{ ...plain, firstName }]);
    expect(p.firstName).toBe('');
  });

  it('caps the length of every string', () => {
    const long = 'x'.repeat(5000);
    const [p] = sharedPlayers([
      { number: long, firstName: long, lastName: long, position: long, grade: long, side: 'O' },
    ]);
    expect(p.number.length).toBeLessThanOrEqual(8);
    expect(p.firstName.length).toBeLessThanOrEqual(60);
    expect(p.lastName.length).toBeLessThanOrEqual(60);
    expect(p.position.length).toBeLessThanOrEqual(20);
    expect(p.grade?.length).toBeLessThanOrEqual(20);
  });

  it.each(['X', 'o', 7, {}, null])('reads the side %j as unknown', (side) => {
    expect(sharedPlayers([{ ...plain, side }])[0].side).toBe('');
  });

  it.each([NaN, Infinity, -1, 0, 20, 500, '73', {}, null])('refuses the height %j', (heightIn) => {
    expect(sharedPlayers([{ ...plain, heightIn }])[0]).not.toHaveProperty('heightIn');
  });

  it.each([NaN, Infinity, -1, 0, 20, 9000, '185', [], null])('refuses the weight %j', (weightLb) => {
    expect(sharedPlayers([{ ...plain, weightLb }])[0]).not.toHaveProperty('weightLb');
  });

  it.each([[{}], [[]], [null], [true]])('refuses the grade %j', (grade) => {
    expect(sharedPlayers([{ ...plain, grade }])[0]).not.toHaveProperty('grade');
  });

  it('drops a player with neither a number nor a name', () => {
    expect(sharedPlayers([{ position: 'QB' }, { number: ' ', firstName: '', lastName: ' ' }])).toEqual([]);
  });

  it('keeps a player with only a number, and one with only a name', () => {
    expect(sharedPlayers([{ number: '7' }, { lastName: 'Reed' }])).toHaveLength(2);
  });

  it.each([null, 'player', 7, [['7']]])('drops the entry %j', (entry) => {
    expect(sharedPlayers([entry])).toEqual([]);
  });

  it.each([null, 'players', 7, { length: 3 }])('reads the list %j as empty', (list) => {
    expect(sharedPlayers(list)).toEqual([]);
  });

  it('stops at the most the database would ever have accepted', () => {
    expect(sharedPlayers(Array.from({ length: 900 }, () => plain))).toHaveLength(300);
  });
});

describe('players already on a phone', () => {
  const baked: Player = {
    id: 'p1',
    number: '7',
    firstName: 'Sam',
    lastName: 'Reed',
    position: 'QB',
    side: 'O',
    heightIn: 73,
    weightLb: 185,
    grade: 'Sophomore',
    photo: 'https://a.espncdn.com/i/headshots/college-football/players/full/1.png',
    hometown: 'Springfield, OH',
    bio: 'A paragraph about him.',
    lines: [{ label: 'Pass Yds', value: '1,204' }],
  };

  it('leaves a baked-style player exactly as it was', () => {
    expect(repairStoredPlayers([baked])).toEqual([baked]);
  });

  it('leaves a typed player exactly as it was', () => {
    const typed: Player = { id: 'p2', number: '12', firstName: 'A', lastName: 'B', position: '', side: '' };
    expect(repairStoredPlayers([typed])).toEqual([typed]);
  });

  it('does not shorten a long value that was already here', () => {
    const bio = 'x'.repeat(5000);
    expect(repairStoredPlayers([{ ...baked, bio }])[0].bio).toBe(bio);
  });

  it('corrects a wrong-shaped name without losing the player', () => {
    const [p] = repairStoredPlayers([{ ...baked, firstName: { a: 1 } }]);
    expect(p.firstName).toBe('');
    expect(p.lastName).toBe('Reed');
  });

  it('keeps a jersey number stored as a number', () => {
    expect(repairStoredPlayers([{ ...baked, number: 7 }])[0].number).toBe('7');
  });

  it('gives a player with no usable id a fresh one', () => {
    const [p] = repairStoredPlayers([{ ...baked, id: 42 }]);
    expect(typeof p.id).toBe('string');
    expect(p.id).not.toBe('');
  });

  it.each([
    'javascript:alert(1)',
    'http://tracker.example/p.gif',
    'data:image/png;base64,AAAA',
    '//x.example/p.gif',
    42,
    {},
  ])('drops the photo %j and keeps the player', (photo) => {
    const [p] = repairStoredPlayers([{ ...baked, photo }]);
    expect(p).not.toHaveProperty('photo');
    expect(p.lastName).toBe('Reed');
  });

  it('drops only the malformed lines', () => {
    const good = { label: 'Rec', value: '12' };
    const [p] = repairStoredPlayers([{ ...baked, lines: [good, { label: {} }, 'x', null] }]);
    expect(p.lines).toEqual([good]);
  });

  it.each(['lines', { a: 1 }, 7])('drops lines that are %j', (lines) => {
    expect(repairStoredPlayers([{ ...baked, lines }])[0]).not.toHaveProperty('lines');
  });

  it('drops wrong-shaped extras and keeps the rest', () => {
    const [p] = repairStoredPlayers([
      { ...baked, hometown: {}, bio: [], heightIn: '73', weightLb: NaN, side: 'X' },
    ]);
    expect(p).not.toHaveProperty('hometown');
    expect(p).not.toHaveProperty('bio');
    expect(p).not.toHaveProperty('heightIn');
    expect(p).not.toHaveProperty('weightLb');
    expect(p.side).toBe('');
    expect(p.photo).toBe(baked.photo);
  });

  it('removes only entries that could never be a player', () => {
    expect(repairStoredPlayers([null, 'x', 7, {}, baked])).toEqual([baked]);
  });
});
