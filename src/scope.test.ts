import { beforeEach, describe, expect, it } from 'vitest';
import { scopedKey, teamScope } from './scope';
import { clearRoster, loadRoster, saveRoster } from './storage';
import type { Player } from './types';

/*
 * The bug these pin down: every team is served from the same origin, and
 * browser storage is per-origin, so all of them shared one jar. Loading a
 * second team's roster replaced the first's, and its badge, stats and share
 * code went with it — in both directions.
 */

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    keys: () => [...map.keys()],
  };
};

let store: ReturnType<typeof memoryStorage>;

/** Stands where the browser would be: one origin, one jar, a path per team. */
const visit = (pathname: string) => {
  (globalThis as Record<string, unknown>).window = { location: { pathname } };
  (globalThis as Record<string, unknown>).localStorage = store;
};

const player = (number: string, lastName: string): Player => ({
  id: `id-${number}`,
  number,
  firstName: '',
  lastName,
  position: '',
  side: 'O',
});

beforeEach(() => {
  store = memoryStorage();
});

describe('teamScope', () => {
  it('is empty at the root, so the original team keeps the keys it already has', () => {
    visit('/');
    expect(teamScope()).toBe('');
    expect(scopedKey('rosterapp.v1')).toBe('rosterapp.v1');
  });

  it('names the team when the path does', () => {
    visit('/victorychristian/');
    expect(teamScope()).toBe('victorychristian');
    expect(scopedKey('rosterapp.v1')).toBe('rosterapp.v1:victorychristian');
  });

  it('treats a filename as the root, not as a team', () => {
    visit('/index.html');
    expect(teamScope()).toBe('');
  });

  it('reads the team from a deeper path too', () => {
    visit('/victorychristian/index.html');
    expect(teamScope()).toBe('victorychristian');
  });
});

describe('two teams on one origin', () => {
  it('keeps each team’s roster to itself', () => {
    visit('/');
    saveRoster({ teamName: 'Poland', season: '2026', players: [player('7', 'Kelly')], updatedAt: '' });

    visit('/victorychristian/');
    expect(loadRoster().players).toHaveLength(0); // not Poland's
    saveRoster({ teamName: 'Victory', season: '2026', players: [player('3', 'Reed')], updatedAt: '' });

    visit('/');
    const poland = loadRoster();
    expect(poland.teamName).toBe('Poland');
    expect(poland.players.map((p) => p.number)).toEqual(['7']);

    visit('/victorychristian/');
    expect(loadRoster().teamName).toBe('Victory');
  });

  it('does not delete the other team’s roster when one is cleared', () => {
    visit('/');
    saveRoster({ teamName: 'Poland', season: '2026', players: [player('7', 'Kelly')], updatedAt: '' });
    visit('/victorychristian/');
    saveRoster({ teamName: 'Victory', season: '2026', players: [player('3', 'Reed')], updatedAt: '' });

    clearRoster();
    expect(loadRoster().players).toHaveLength(0);

    visit('/');
    expect(loadRoster().teamName).toBe('Poland');
  });

  it('stores them under separate keys, so nothing depends on load order', () => {
    visit('/');
    saveRoster({ teamName: 'Poland', season: '', players: [], updatedAt: '' });
    visit('/victorychristian/');
    saveRoster({ teamName: 'Victory', season: '', players: [], updatedAt: '' });

    expect(store.keys().sort()).toEqual(['rosterapp.v1', 'rosterapp.v1:victorychristian']);
  });
});
