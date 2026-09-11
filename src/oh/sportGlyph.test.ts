import { describe, expect, it } from 'vitest';
import { glyphFor } from './SportGlyph';
import { knownSports } from './sportSeasons';

describe('sport glyphs', () => {
  it('draws every sport the season table knows', () => {
    for (const sport of knownSports()) {
      // Both tennis entries share one mark, so the key is not always the name.
      expect(glyphFor(sport)).not.toBe('generic');
    }
  });

  it('falls back rather than leaving a row blank', () => {
    expect(glyphFor('esports')).toBe('generic');
    expect(glyphFor('')).toBe('generic');
  });

  it('gives the same sport the same mark however it was typed', () => {
    expect(glyphFor('Cross Country')).toBe('cross country');
    expect(glyphFor(' FOOTBALL ')).toBe('football');
    expect(glyphFor('football')).toBe(glyphFor('Football'));
  });

  it('draws a gendered sport with the mark of the sport behind it', () => {
    expect(glyphFor('boys golf')).toBe('golf');
    expect(glyphFor('Girls Basketball')).toBe('basketball');
    expect(glyphFor('coed swimming')).toBe('swimming');
  });
});
