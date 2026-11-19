import { beforeEach, describe, expect, it } from 'vitest';
import { loadRoster } from './storage';
import type { Player } from './types';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  (globalThis as Record<string, unknown>).window = { location: { pathname: '/' } };
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  };
});

const store = (players: unknown) =>
  memory.set(
    'rosterapp.v1',
    JSON.stringify({
      schema: 1,
      roster: { teamName: 'Team', season: '2026', players, updatedAt: '2026-11-01T00:00:00.000Z' },
    }),
  );

describe('loadRoster', () => {
  it('returns a valid roster from a real phone unchanged', () => {
    const players: Player[] = [
      {
        id: 'a',
        number: '07',
        firstName: 'Sam',
        lastName: 'Reed',
        position: 'WR/CB',
        side: 'O',
        heightIn: 73,
        weightLb: 185,
        grade: 'Jr',
      },
      {
        id: 'b',
        number: '12',
        firstName: 'Lee',
        lastName: 'Ward',
        position: 'QB',
        side: '',
        grade: 'Sophomore',
        photo: 'https://a.espncdn.com/i/headshots/full/2.png',
        hometown: 'Canton, OH',
        bio: 'Two seasons as the starter.',
        lines: [{ label: 'Pass Yds', value: '2,310' }],
      },
    ];
    store(players);

    expect(loadRoster()).toEqual({
      teamName: 'Team',
      season: '2026',
      players,
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('repairs a crafted player rather than handing it to the screen', () => {
    store([{ id: 'a', number: '7', firstName: { evil: true }, lastName: 'Reed', position: 9, side: 'Q' }]);
    const [p] = loadRoster().players;
    expect(p).toEqual({ id: 'a', number: '7', firstName: '', lastName: 'Reed', position: '9', side: '' });
  });

  it('keeps a good player sitting beside a bad one', () => {
    store([null, { id: 'a', number: '7', firstName: 'Sam', lastName: 'Reed', position: 'QB', side: 'O' }]);
    expect(loadRoster().players.map((p) => p.id)).toEqual(['a']);
  });
});
