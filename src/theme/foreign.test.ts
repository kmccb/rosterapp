import { beforeEach, describe, expect, it } from 'vitest';
import { initialTheme, loadTheme, saveTheme, type Theme } from './theme';
import type { Palette } from './palette';

/*
 * Before the storage keys were scoped, both teams wrote their badge to the same
 * place, so opening one team's page repainted the other's. The root team keeps
 * its unsuffixed keys, so a badge left there by the other team is still sitting
 * on those phones — recognisable because a baked theme names its team's badge
 * by path, and that path is not this page's.
 */

const palette = (accent: string): Palette =>
  ({
    ground: '#04083e',
    surface: '#0b1150',
    muted: '#8f97c8',
    text: '#ffffff',
    accent,
    accentInk: '#000000',
  }) as Palette;

const POLAND = { slug: 'poland', name: 'Poland', palette: palette('#c8102e'), wallpaper: '/badge.jpg' };
const VICTORY = {
  slug: 'victorychristian',
  name: 'Victory Christian',
  palette: palette('#7a1420'),
  wallpaper: '/victorychristian/badge.jpg',
};
const TABLE = { '': POLAND, victorychristian: VICTORY };

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

/** Every shell carries every team; only the address says which one you're on. */
const visit = (pathname: string) => {
  (globalThis as Record<string, unknown>).window = { location: { pathname }, __TEAMS__: TABLE };
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = memoryStorage();
  visit('/');
});

describe('which team the page is', () => {
  it('is read from the address, not from the shell that was served', () => {
    // The service worker answers with the root team's shell whatever the path,
    // so this is the case that came up as the wrong team entirely.
    visit('/victorychristian/');
    expect(initialTheme()?.logo).toBe('/victorychristian/badge.jpg');
    expect(initialTheme()?.palette.accent).toBe('#7a1420');
  });

  it('falls back to the root team for an address naming no team', () => {
    visit('/somewhere-else/');
    expect(initialTheme()?.logo).toBe('/badge.jpg');
  });
});

describe('a badge left behind by another team', () => {
  it('is discarded, and the page returns to its own', () => {
    // What Victory Christian's page wrote into the shared jar.
    saveTheme({ logo: '/victorychristian/badge.jpg', palette: palette('#7a1420'), seedHue: -1 });

    const theme = initialTheme();

    expect(theme?.logo).toBe('/badge.jpg');
    expect(theme?.palette.accent).toBe('#c8102e');
    expect(loadTheme()?.logo).toBe('/badge.jpg');
  });

  it('leaves this team’s own baked badge alone', () => {
    saveTheme({ logo: '/badge.jpg', palette: palette('#c8102e'), seedHue: -1 });
    expect(initialTheme()?.logo).toBe('/badge.jpg');
  });

  it('never throws away a badge the coach uploaded', () => {
    // An uploaded crest is a data URI, so it can't be traced to a team — and a
    // shared roster carries one. Discarding it would undo somebody's own work.
    const uploaded: Theme = {
      logo: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      palette: palette('#0f7b3f'),
      seedHue: 142,
    };
    saveTheme(uploaded);

    expect(initialTheme()?.logo).toBe(uploaded.logo);
    expect(initialTheme()?.palette.accent).toBe('#0f7b3f');
  });

  it('adopts the page’s own badge when there is nothing stored', () => {
    expect(initialTheme()?.logo).toBe('/badge.jpg');
  });
});
