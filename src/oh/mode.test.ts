import { describe, expect, it } from 'vitest';
import { MODE_KEY, otherMode, resolveMode, storedMode, storeMode } from './mode';
import { modeButtonLabel } from './ModeButton';

const memory = () => {
  const map = new Map<string, string>();
  return {
    map,
    store: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) },
  };
};

const broken = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('the fan’s mode', () => {
  it('follows the phone until the fan has chosen', () => {
    expect(resolveMode(null, true)).toBe('dark');
    expect(resolveMode(null, false)).toBe('light');
  });

  it('lets the fan’s choice win over the phone either way', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('keeps the choice under one key for every school', () => {
    const { map, store } = memory();
    expect(storedMode(store)).toBeNull();
    storeMode('light', store);
    expect(map.get(MODE_KEY)).toBe('light');
    expect(MODE_KEY).toBe('oh.mode');
    expect(storedMode(store)).toBe('light');
  });

  it('treats anything else stored there as no choice', () => {
    const { map, store } = memory();
    map.set(MODE_KEY, 'sepia');
    expect(storedMode(store)).toBeNull();
  });

  it('follows the phone where storage throws or is missing, rather than failing', () => {
    expect(storedMode(broken)).toBeNull();
    expect(() => storeMode('dark', broken)).not.toThrow();
    expect(storedMode(null)).toBeNull();
    // This test environment is node, with no localStorage at all.
    expect(storedMode()).toBeNull();
    expect(() => storeMode('light')).not.toThrow();
  });

  it('labels the button with what it switches to', () => {
    expect(otherMode('dark')).toBe('light');
    expect(modeButtonLabel('dark')).toBe('Switch to light mode');
    expect(modeButtonLabel('light')).toBe('Switch to dark mode');
  });
});
