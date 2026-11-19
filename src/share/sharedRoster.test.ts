import { describe, expect, it } from 'vitest';
import { cleanFetched } from './sharedRoster';

const LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const palette = {
  ground: '#04043a',
  surface: '#163a76',
  line: '#2f5f9e',
  text: '#ffffff',
  muted: '#a8c6e8',
  accent: '#4fbaf7',
  accentInk: '#04043a',
};
const row = (over: Record<string, unknown> = {}) => ({
  team_name: 'Team',
  season: '2026',
  players: [{ number: '7', firstName: 'Sam', lastName: 'Reed', position: 'QB', side: 'O' }],
  updated_at: '2026-11-01T00:00:00Z',
  ...over,
});

describe('a roster fetched from a code', () => {
  it('passes an honest share through', () => {
    const found = cleanFetched(row({ theme: { logo: LOGO, palette, seedHue: 200 } }));
    expect(found.teamName).toBe('Team');
    expect(found.season).toBe('2026');
    expect(found.players).toHaveLength(1);
    expect(found.updatedAt).toBe('2026-11-01T00:00:00Z');
    expect(found.theme).toEqual({ logo: LOGO, palette, seedHue: 200 });
  });

  it.each([[{}], [[]], [7], [null]])('reads the team name and season %j as blank', (junk) => {
    const found = cleanFetched(row({ team_name: junk, season: junk }));
    expect(found.teamName).toBe('');
    expect(found.season).toBe('');
  });

  it('caps the team name and season', () => {
    const found = cleanFetched(row({ team_name: 'x'.repeat(4000), season: 'y'.repeat(4000) }));
    expect(found.teamName.length).toBeLessThanOrEqual(80);
    expect(found.season.length).toBeLessThanOrEqual(40);
  });

  it('never lets a share claim this device chose its badge', () => {
    const found = cleanFetched(row({ theme: { logo: LOGO, palette, seedHue: 200, origin: 'local' } }));
    expect(found.theme).not.toBeNull();
    expect(found.theme).not.toHaveProperty('origin');
  });

  it.each([
    ['a remote image', 'https://tracker.example/p.gif'],
    ['a baked path', '/badge.jpg'],
    ['an svg', 'data:image/svg+xml;base64,AAAA'],
    ['a quote breaking out of url()', `${LOGO}"),url("https://tracker.example/p.gif`],
    ['a trailing newline', `${LOGO}\n`],
    ['no payload', 'data:image/png;base64,'],
    ['an object', { toString: 'x' }],
  ])('refuses a theme whose logo is %s', (_label, logo) => {
    expect(cleanFetched(row({ theme: { logo, palette, seedHue: 1 } })).theme).toBeNull();
  });

  it.each(['ground', 'surface', 'text', 'muted', 'accent', 'accentInk'])(
    'refuses a theme whose %s is not a six-digit colour',
    (field) => {
      for (const bad of ['red', '#fff', '#12345g', 'url(https://x.example)', 7, undefined]) {
        const theme = { logo: LOGO, palette: { ...palette, [field]: bad }, seedHue: 1 };
        expect(cleanFetched(row({ theme })).theme).toBeNull();
      }
    },
  );

  it.each([[{}], [[]], ['theme'], [7], [null]])('reads the theme %j as none', (theme) => {
    expect(cleanFetched(row({ theme })).theme).toBeNull();
  });

  it('cleans the stats that came with it', () => {
    const stats = {
      current: { label: 'S', updatedAt: '', byPlayer: { 'r|s': { rushing: { yds: 'many', td: 2 } } } },
    };
    expect(cleanFetched(row({ stats })).stats.current?.byPlayer).toEqual({ 'r|s': { rushing: { td: 2 } } });
  });

  it.each([['stats'], [7], [null], [[]]])('reads the stats %j as none', (stats) => {
    expect(cleanFetched(row({ stats })).stats).toEqual({});
  });
});
