import { beforeEach, describe, expect, it } from 'vitest';
import { sellsInstead } from './marketing/rootVisit';
import { addressAfterClear, clearThisRoster } from './recovery';

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

describe('clearing the roster from the crash screen', () => {
  it('removes everything a share brought, so the next launch cannot crash on it', () => {
    for (const k of [
      'rosterapp.v1',
      'rosterapp.stats.v1',
      'rosterapp.theme.v1',
      'rosterapp.source.v1',
      'rosterapp.synced.v1',
    ]) {
      memory.set(k, 'x');
    }
    clearThisRoster();
    expect([...memory.keys()]).toEqual([]);
  });

  it('keeps a coach’s right to edit what they published', () => {
    memory.set('rosterapp.share.v1', '{"code":"AAAA1111","editToken":"t"}');
    clearThisRoster();
    expect(memory.has('rosterapp.share.v1')).toBe(true);
  });

  it('touches only the team whose page this is', () => {
    memory.set('rosterapp.v1:ysu', 'theirs');
    memory.set('oh.roster.springfield.football', 'directory');
    memory.set('rosterapp.v1', 'mine');
    clearThisRoster();
    expect([...memory.keys()].sort()).toEqual(['oh.roster.springfield.football', 'rosterapp.v1:ysu']);
  });

  it('finishes clearing even when storage refuses one of the removals', () => {
    memory.set('rosterapp.stats.v1', 'x');
    const jar = globalThis.localStorage as unknown as { removeItem: (k: string) => void };
    const remove = jar.removeItem;
    jar.removeItem = (k) => {
      if (k === 'rosterapp.v1') throw new Error('blocked');
      remove(k);
    };
    expect(() => clearThisRoster()).not.toThrow();
    expect(memory.has('rosterapp.stats.v1')).toBe(false);
  });
});

describe('the address to come back to', () => {
  it('leaves the share code behind, or the same roster would be fetched again', () => {
    expect(addressAfterClear('/ysu/')).toBe('/ysu/?cleared=1');
  });

  it('is not an address the root visit sends to the marketing site', () => {
    const url = new URL(addressAfterClear('/'), 'https://roster.scottforge.ai');
    const headers = new Headers({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' });
    expect(sellsInstead(url, headers)).toBe(false);
  });
});
