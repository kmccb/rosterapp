/*
 * Light or dark, as a fan wants it.
 *
 * A paid page follows the phone: a phone set to light gets the light page.
 * The sun/moon button overrides that, and the choice is kept on the phone
 * under one key for every school — a fan who wants light wants it at every
 * school they follow, not just the one they were looking at when they asked.
 * Until they tap it, nothing is stored, and the page keeps following the phone
 * as it changes (an iPhone that turns dark at sunset turns the page with it).
 *
 * Storage can be missing or throw — a private window, blocked site data — and
 * then the page simply follows the phone; a choice that cannot be remembered
 * still applies until the page is closed.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Mode } from './look';

export const MODE_KEY = 'oh.mode';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const localStore = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** The fan's own choice, or null when they have not made one (or it cannot be read). */
export function storedMode(store: Store | null = localStore()): Mode | null {
  try {
    const v = store?.getItem(MODE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Keeps the fan's choice; quietly does nothing where it cannot. */
export function storeMode(mode: Mode, store: Store | null = localStore()): void {
  try {
    store?.setItem(MODE_KEY, mode);
  } catch {
    // Nowhere to keep it: the choice still holds for as long as the page is open.
  }
}

/** The fan's choice if there is one, otherwise the phone's. */
export const resolveMode = (stored: Mode | null, phoneIsDark: boolean): Mode =>
  stored ?? (phoneIsDark ? 'dark' : 'light');

/** The other one — what the button switches to, and so what it says. */
export const otherMode = (mode: Mode): Mode => (mode === 'light' ? 'dark' : 'light');

const darkQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

/**
 * The page's mode and a way to flip it. Follows the phone, live, until the fan
 * taps; from then on their choice wins, on this page and every page after.
 * A browser that cannot say what the phone prefers gets dark, the way every
 * paid page looked before there was a choice.
 */
export function useMode(): [Mode, () => void] {
  const [stored, setStored] = useState<Mode | null>(() => storedMode());
  const [phoneDark, setPhoneDark] = useState<boolean>(() => darkQuery()?.matches ?? true);

  useEffect(() => {
    if (stored) return;
    const query = darkQuery();
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setPhoneDark(e.matches);
    setPhoneDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [stored]);

  const mode = resolveMode(stored, phoneDark);
  const toggle = useCallback(() => {
    const next = otherMode(mode);
    storeMode(next);
    setStored(next);
  }, [mode]);

  return [mode, toggle];
}
