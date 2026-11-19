import { beforeEach, describe, expect, it } from 'vitest';
import { loadTheme } from './theme';

const palette = {
  ground: '#04043a',
  surface: '#163a76',
  line: '#2f5f9e',
  text: '#ffffff',
  muted: '#a8c6e8',
  accent: '#4fbaf7',
  accentInk: '#04043a',
};
const memory = new Map<string, string>();
const stored = (theme: unknown) => memory.set('rosterapp.theme.v1', JSON.stringify({ schema: 1, theme }));

beforeEach(() => {
  memory.clear();
  (globalThis as Record<string, unknown>).window = { location: { pathname: '/' } };
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  };
});

describe('a theme kept on this phone', () => {
  it.each(['/badge.jpg', '/ysu/badge.jpg', '/victorychristian/badge.jpg'])('keeps the baked badge %s', (logo) => {
    stored({ logo, palette, seedHue: -1 });
    expect(loadTheme()?.logo).toBe(logo);
  });

  it('keeps an uploaded badge', () => {
    const logo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    stored({ logo, palette, seedHue: 200, origin: 'local' });
    expect(loadTheme()?.logo).toBe(logo);
  });

  it.each([
    'data:image/png;base64,AAAA"),url("https://tracker.example/p.gif',
    'data:image/svg+xml;base64,AAAA',
    '/badge.jpg"),url("https://tracker.example/p.gif',
    '//tracker.example/badge.jpg',
    '/../badge.jpg',
    'https://tracker.example/badge.jpg',
  ])('refuses the logo %s', (logo) => {
    stored({ logo, palette, seedHue: 1 });
    expect(loadTheme()).toBeNull();
  });

  it('refuses a palette that cannot be painted', () => {
    stored({ logo: '/badge.jpg', palette: { ...palette, surface: 'red' }, seedHue: 1 });
    expect(loadTheme()).toBeNull();
    stored({ logo: '/badge.jpg', palette: { ground: '#000000', accent: '#ffffff' }, seedHue: 1 });
    expect(loadTheme()).toBeNull();
  });
});
