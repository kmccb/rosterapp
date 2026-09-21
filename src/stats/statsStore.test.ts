import { beforeEach, describe, expect, it } from 'vitest';
import type { GameStats } from './statsStore';

(globalThis as unknown as { window: unknown }).window = { location: { pathname: '/' } };

const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  get length() { return memory.size; },
} as Storage;

const { loadStats, putGame, putSeason, removeGame } = await import('./statsStore');

describe('games in the store', () => {
  beforeEach(() => memory.clear());

  it('creates This season around the first game', () => {
    const next = putGame('2026-08-21', 'Salem', { 'j|c': { rushing: { yds: 23 } } });
    expect(next.current?.games).toHaveLength(1);
    expect(next.current?.games?.[0]).toEqual({ date: '2026-08-21', opponent: 'Salem', byPlayer: { 'j|c': { rushing: { yds: 23 } } } });
    expect(next.current?.byPlayer).toEqual({});
    expect(loadStats().current?.games).toHaveLength(1);
  });

  it('keeps games sorted by date whatever order they were pasted in', () => {
    putGame('2026-09-11', 'Canfield', {});
    putGame('2026-08-21', 'Salem', {});
    expect(loadStats().current?.games?.map((g) => g.opponent)).toEqual(['Salem', 'Canfield']);
  });

  it('replaces a game pasted again on the same date', () => {
    putGame('2026-08-21', 'Salem', { 'j|c': { rushing: { yds: 1 } } });
    putGame('2026-08-21', 'Salem HS', { 'j|c': { rushing: { yds: 23 } } });
    const games = loadStats().current?.games;
    expect(games).toHaveLength(1);
    expect(games?.[0].opponent).toBe('Salem HS');
    expect(games?.[0].byPlayer['j|c'].rushing.yds).toBe(23);
  });

  it('removes a game by date and leaves the rest', () => {
    putGame('2026-08-21', 'Salem', {});
    putGame('2026-09-11', 'Canfield', {});
    const next = removeGame('2026-08-21');
    expect(next.current?.games?.map((g) => g.opponent)).toEqual(['Canfield']);
  });

  it('keeps a whole-season paste beside the games', () => {
    putSeason('current', '2026', { 'j|c': { rushing: { yds: 481 } } });
    putGame('2026-08-21', 'Salem', {});
    const current = loadStats().current;
    expect(current?.label).toBe('2026');
    expect(current?.byPlayer['j|c'].rushing.yds).toBe(481);
    expect(current?.games).toHaveLength(1);
  });

  it('reads a stored season that has no games, and drops a malformed games field', () => {
    putSeason('current', '2026', {});
    expect(loadStats().current?.games).toBeUndefined();
    const raw = JSON.parse(memory.values().next().value as string);
    raw.stats.current.games = 'nope';
    memory.set([...memory.keys()][0], JSON.stringify(raw));
    expect(loadStats().current?.games).toBeUndefined();
  });

  it('keeps the well-formed games and drops only the bad one', () => {
    const good: GameStats = { date: '2026-08-21', opponent: 'Salem', byPlayer: {} };
    putSeason('current', '2026', {});
    const raw = JSON.parse(memory.values().next().value as string);
    raw.stats.current.games = [good, { bad: true }];
    memory.set([...memory.keys()][0], JSON.stringify(raw));
    expect(loadStats().current?.games).toEqual([good]);
  });
});
