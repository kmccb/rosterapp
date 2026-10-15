import { describe, expect, it } from 'vitest';
import { colorHint, colorsChanged, DEFAULT_COLORS, panelColors, type LookState } from './lookColors';

const state = (over: Partial<LookState> = {}): LookState => ({
  // Navy and sky blue, which read as chosen, so only what a test changes is reported.
  ground: '#04043a',
  accent: '#4fbaf7',
  text: '#ffffff',
  nickname: 'Tigers',
  plate: 'ground',
  light: null,
  ...over,
});
const light = { ground: '#fff4ec', accent: '#a33f00', text: '#1a1a1a' };

describe('panelColors', () => {
  it('carries the light set with the nickname and the fill when the box is ticked', () => {
    expect(panelColors(state({ light }))).toEqual({
      ground: '#04043a',
      accent: '#4fbaf7',
      text: '#ffffff',
      nickname: 'Tigers',
      plate: 'ground',
      light,
    });
  });

  it('leaves the light set out when the box is unticked, which is what clears it', () => {
    expect(panelColors(state())).not.toHaveProperty('light');
    expect(panelColors(state({ nickname: '', plate: '' }))).toEqual({ ground: '#04043a', accent: '#4fbaf7', text: '#ffffff' });
  });
});

describe('colorsChanged', () => {
  const stored = panelColors(state({ light }));

  it('is quiet when nothing moved', () => {
    expect(colorsChanged(stored, state({ light }))).toBe(false);
    expect(colorsChanged(null, state({ ...DEFAULT_COLORS, nickname: '', plate: '' }))).toBe(false);
  });

  it('notices a light color moving, the set being taken away, or one being added', () => {
    expect(colorsChanged(stored, state({ light: { ...light, accent: '#990000' } }))).toBe(true);
    expect(colorsChanged(stored, state())).toBe(true);
    expect(colorsChanged(panelColors(state()), state({ light }))).toBe(true);
  });

  it('still notices the dark colors, the nickname and the fill', () => {
    expect(colorsChanged(stored, state({ light, ground: '#000000' }))).toBe(true);
    expect(colorsChanged(stored, state({ light, nickname: 'Lions' }))).toBe(true);
    expect(colorsChanged(stored, state({ light, plate: '' }))).toBe(true);
  });
});

describe('colorHint', () => {
  it('names the mode each moved color belongs to', () => {
    expect(colorHint(state({ accent: '#04043a' }))).toBe(
      'Dark mode: accent lightened so it reads on the ground.',
    );
    expect(colorHint(state({ light: { ground: '#ffffff', accent: '#ffe066', text: '#dddddd' } }))).toBe(
      'Light mode: accent darkened so it reads on the ground; text darkened so it reads on the ground.',
    );
  });

  it('says nothing about a light page nobody chose, or when nothing moved', () => {
    expect(colorHint(state())).toBeNull();
    expect(colorHint(state({ light }))).toBeNull();
  });
});
