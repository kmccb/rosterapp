import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearTheme, loadTheme } from './theme';

// A private window, or a browser blocking site data, throws from every touch
// of storage. initialTheme clears a stale theme on launch, so a throw from
// clearTheme would stop the root app before it drew anything.
describe('a storage that refuses', () => {
  const g = globalThis as Record<string, unknown>;
  let before: unknown;
  let beforeWindow: unknown;

  beforeEach(() => {
    before = g.localStorage;
    beforeWindow = g.window;
    g.window = { location: { pathname: '/' } };
    const refuse = () => {
      throw new Error('SecurityError');
    };
    g.localStorage = { getItem: refuse, setItem: refuse, removeItem: refuse };
  });

  afterEach(() => {
    g.localStorage = before;
    g.window = beforeWindow;
  });

  it('lets clearing the theme pass quietly', () => {
    expect(() => clearTheme()).not.toThrow();
  });

  it('reads as no theme kept', () => {
    expect(loadTheme()).toBeNull();
  });
});
