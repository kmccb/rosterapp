import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iconTile, plateColor } from './plate';

describe('iconTile', () => {
  const look = { ground: '#c75000', accent: '#111111' };

  it('fills the icon with the plate the seller chose, words resolved to the school’s colors', () => {
    expect(iconTile({ ...look, plate: 'ground' })).toBe('#c75000');
    expect(iconTile({ ...look, plate: 'accent' })).toBe('#111111');
    expect(iconTile({ ...look, plate: '#ffffff' })).toBe('#ffffff');
  });

  it('keeps the ground when there is no plate, or one that is not a color', () => {
    expect(iconTile(look)).toBe('#c75000');
    expect(iconTile({ ...look, plate: 'white' })).toBe('#c75000');
  });

  it('agrees with the page wherever the page has a plate at all', () => {
    for (const plate of ['ground', 'accent', '#ffffff', '#0a0a0a']) {
      expect(iconTile({ ...look, plate })).toBe(plateColor({ ...look, plate }));
    }
  });
});

describe('the home-screen icon script', () => {
  const src = readFileSync(new URL('../../scripts/paid-apps.mjs', import.meta.url), 'utf8');

  it('takes the plate rule from this module rather than a copy of its own', () => {
    expect(src).toContain("from '../src/oh/plate.ts'");
    expect(src).toMatch(/iconTile\(\{ ground, accent, plate: identity\.colors\?\.plate \}\)/);
  });

  it('draws every icon on the tile, while the manifest keeps the ground', () => {
    expect(src.match(/await icon\(art, tile,/g)).toHaveLength(4);
    expect(src).not.toMatch(/await icon\(art, ground,/);
    expect(src).toContain('background_color: ground');
    expect(src).toContain('theme_color: ground');
  });
});
