import { describe, expect, it } from 'vitest';
import { seasonTotals } from './seasonTotals';
import { summarise } from './statsFormat';
import { tidyStore, type StatsStore } from './statsStore';

const season = (byPlayer: unknown, games?: unknown) => ({
  current: { label: 'This season', updatedAt: '2026-11-01', byPlayer, ...(games ? { games } : {}) },
});

describe('stats from outside this device', () => {
  it('leaves honest stats exactly as they were', () => {
    const honest: StatsStore = {
      previous: {
        label: '2025',
        updatedAt: 'x',
        byPlayer: { 'r|s': { rushing: { yds: 410, td: 3, ydsPerCarry: 4.5 } } },
      },
      current: {
        label: 'This season',
        updatedAt: 'y',
        byPlayer: {},
        games: [{ date: '2026-08-21', opponent: 'Salem', byPlayer: { 'r|s': { passing: { yds: 12 } } } }],
      },
    };
    expect(tidyStore(honest)).toEqual(honest);
  });

  it.each([[null], ['many'], [{}], [[]], [true]])('drops the stat value %j, which the card would crash on', (yds) => {
    const tidied = tidyStore(season({ 'r|s': { rushing: { yds, td: 2 } } }));
    expect(tidied.current?.byPlayer['r|s'].rushing).toEqual({ td: 2 });
    expect(() => summarise(tidied.current?.byPlayer['r|s'])).not.toThrow();
  });

  it.each([[null], ['rushing'], [7], [[]]])('drops the category %j', (rushing) => {
    expect(tidyStore(season({ 'r|s': { rushing } })).current?.byPlayer['r|s']).toEqual({});
  });

  it.each([[null], ['player'], [7], [[]]])('drops the player %j', (player) => {
    expect(tidyStore(season({ 'r|s': player })).current?.byPlayer).toEqual({});
  });

  it.each([[[]], ['x'], [7]])('refuses a season whose players are %j', (byPlayer) => {
    expect(tidyStore(season(byPlayer)).current).toBeUndefined();
  });

  it('refuses a season whose label is not text', () => {
    expect(tidyStore({ current: { label: {}, byPlayer: {} } }).current).toBeUndefined();
  });

  it('drops a malformed game and keeps the good one', () => {
    const good = { date: '2026-08-21', opponent: 'Salem', byPlayer: {} };
    const games = [good, { date: {}, opponent: 'x', byPlayer: {} }, { date: 'd', opponent: 'x', byPlayer: [] }, null];
    expect(tidyStore(season({}, games)).current?.games).toEqual([good]);
  });

  it('cleans the numbers inside a game too', () => {
    const games = [{ date: '2026-08-21', opponent: 'Salem', byPlayer: { 'r|s': { rushing: { yds: 'x', td: 1 } } } }];
    expect(tidyStore(season({}, games)).current?.games?.[0].byPlayer['r|s'].rushing).toEqual({ td: 1 });
  });

  it('caps the words a season and a game can carry', () => {
    const long = 'x'.repeat(5000);
    const tidied = tidyStore({
      current: { label: long, updatedAt: '', byPlayer: {}, games: [{ date: long, opponent: long, byPlayer: {} }] },
    });
    expect(tidied.current?.label.length).toBeLessThanOrEqual(60);
    expect(tidied.current?.games?.[0].opponent.length).toBeLessThanOrEqual(80);
    expect(tidied.current?.games?.[0].date.length).toBeLessThanOrEqual(20);
  });

  it.each(['__proto__', 'constructor', 'prototype'])('cannot reach Object.prototype through a key named %s', (key) => {
    const crafted = JSON.parse(
      `{"current":{"label":"S","updatedAt":"","byPlayer":{},"games":[{"date":"2026-08-21","opponent":"x","byPlayer":{"${key}":{"polluted":{"yds":1}},"r|s":{"${key}":{"yds":1},"rushing":{"${key}":1,"yds":2}}}}]}}`,
    ) as unknown;

    seasonTotals(tidyStore(crafted).current);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).yds).toBeUndefined();
  });
});
