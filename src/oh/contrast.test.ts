import { describe, expect, it } from 'vitest';
import { bestInk, contrast, luminance, mix, readable, worstContrast } from './contrast';

const hue = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};

describe('contrast', () => {
  it('matches the WCAG figures for known pairs', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // #767676 on white is the classic just-passes grey; #777777 just fails.
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(contrast('#0000ff', '#ffffff')).toBeCloseTo(8.59, 2);
    expect(contrast('#ff0000', '#ffffff')).toBeCloseTo(4.0, 2);
  });

  it('is the same whichever way round', () => {
    expect(contrast('#c75000', '#04043a')).toBe(contrast('#04043a', '#c75000'));
  });

  it('weighs green heaviest, as the eye does', () => {
    expect(luminance('#00ff00')).toBeGreaterThan(luminance('#ff0000'));
    expect(luminance('#ff0000')).toBeGreaterThan(luminance('#0000ff'));
  });
});

describe('readable', () => {
  it('returns a color that already passes exactly as it came', () => {
    expect(readable('#4fbaf7', ['#04043a'])).toBe('#4fbaf7');
    expect(readable('#ffffff', ['#04043a', '#2a2a5c'])).toBe('#ffffff');
    expect(readable('#292929', ['#e8d6ca'])).toBe('#292929');
  });

  it('lightens a dark color on a dark ground until it passes, keeping its hue', () => {
    const fixed = readable('#1b3a8c', ['#04043a']);
    expect(worstContrast(fixed, ['#04043a'])).toBeGreaterThanOrEqual(4.5);
    expect(luminance(fixed)).toBeGreaterThan(luminance('#1b3a8c'));
    expect(Math.abs(hue(fixed) - hue('#1b3a8c'))).toBeLessThan(3);
  });

  it('darkens a light color on a light ground, keeping its hue', () => {
    const fixed = readable('#f26722', ['#fdf3ee', '#ffffff']);
    expect(worstContrast(fixed, ['#fdf3ee', '#ffffff'])).toBeGreaterThanOrEqual(4.5);
    expect(luminance(fixed)).toBeLessThan(luminance('#f26722'));
    expect(Math.abs(hue(fixed) - hue('#f26722'))).toBeLessThan(3);
  });

  it('stops at the first step that passes rather than running to white or black', () => {
    const fixed = readable('#1b3a8c', ['#04043a']);
    expect(fixed).not.toBe('#ffffff');
    expect(worstContrast(fixed, ['#04043a'])).toBeLessThan(5.5);
  });

  it('takes the worse of every surface it is given', () => {
    const page = '#04043a';
    const card = mix(page, '#ffffff', 0.12);
    const fixed = readable('#3a5ab0', [page, card]);
    expect(contrast(fixed, page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fixed, card)).toBeGreaterThanOrEqual(4.5);
  });

  it('copes with a color the same as its ground', () => {
    const fixed = readable('#04043a', ['#04043a']);
    expect(contrast(fixed, '#04043a')).toBeGreaterThanOrEqual(4.5);
  });

  it('copes with a mid-grey ground, where only one end can win', () => {
    const fixed = readable('#ff0000', ['#777777']);
    expect(contrast(fixed, '#777777')).toBeGreaterThanOrEqual(4.5);
  });

  it('gives the best it can find when nothing reaches the minimum', () => {
    // Against both black and white nothing reaches 4.5 — 4.58 is the ceiling.
    const fixed = readable('#ff0000', ['#000000', '#ffffff']);
    expect(worstContrast(fixed, ['#000000', '#ffffff'])).toBeGreaterThan(worstContrast('#ff0000', ['#000000', '#ffffff']));
  });

  it('leaves anything that is not a hex alone', () => {
    expect(readable('red', ['#000000'])).toBe('red');
  });
});

describe('bestInk', () => {
  it('picks whichever option reads best, the first on a tie', () => {
    expect(bestInk('#4fbaf7', ['#04043a', '#111111', '#ffffff'])).toBe('#04043a');
    expect(bestInk('#04043a', ['#04043a', '#111111', '#ffffff'])).toBe('#ffffff');
    expect(bestInk('#808080', ['#000000', '#000000'])).toBe('#000000');
  });
});
