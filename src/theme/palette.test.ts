import { contrast, dominantHue, hslToHex, paletteFrom, rgbToHsl } from './palette';

/** Builds RGBA pixel data from a list of [colour, howManyPixels] pairs. */
const pixels = (...spec: Array<[[number, number, number], number]>): Uint8ClampedArray => {
  const out: number[] = [];
  for (const [[r, g, b], count] of spec) {
    for (let i = 0; i < count; i++) out.push(r, g, b, 255);
  }
  return new Uint8ClampedArray(out);
};

describe('colour conversion', () => {
  it('round-trips a known colour', () => {
    expect(hslToHex(rgbToHsl(0x16, 0x87, 0xcd))).toBe('#1687cd');
  });

  it('round-trips black, white and a grey', () => {
    expect(hslToHex(rgbToHsl(0, 0, 0))).toBe('#000000');
    expect(hslToHex(rgbToHsl(255, 255, 255))).toBe('#ffffff');
    expect(hslToHex(rgbToHsl(128, 128, 128))).toBe('#808080');
  });
});

describe('dominantHue', () => {
  it('finds the blue in a mostly white badge', () => {
    // The bulldog: lots of white fill, navy line work, a blue wash behind.
    const data = pixels(
      [[255, 255, 255], 500],
      [[3, 3, 103], 200],
      [[22, 135, 205], 300],
    );
    const seed = dominantHue(data);
    expect(seed).not.toBeNull();
    // Both the navy and the wash are blue; anything in that family is right.
    expect(seed!.h).toBeGreaterThan(190);
    expect(seed!.h).toBeLessThan(250);
  });

  it('picks the crest colour over a large pale field', () => {
    // A small vivid red on a big cream ground.
    const data = pixels([[244, 241, 234], 900], [[200, 30, 40], 100]);
    const seed = dominantHue(data);
    expect(seed).not.toBeNull();
    expect(seed!.h < 20 || seed!.h > 340).toBe(true);
  });

  it('ignores white, black and grey entirely', () => {
    const data = pixels([[255, 255, 255], 400], [[0, 0, 0], 400], [[128, 128, 128], 400]);
    expect(dominantHue(data)).toBeNull();
  });

  it('skips transparent pixels', () => {
    const data = new Uint8ClampedArray([200, 30, 40, 0, 200, 30, 40, 0]);
    expect(dominantHue(data)).toBeNull();
  });
});

describe('paletteFrom', () => {
  const seeds = {
    'bulldog blue': { h: 205, s: 0.8, l: 0.45 },
    'navy': { h: 240, s: 0.94, l: 0.21 },
    'crimson': { h: 355, s: 0.75, l: 0.42 },
    'forest green': { h: 140, s: 0.7, l: 0.3 },
    'gold': { h: 45, s: 0.95, l: 0.5 },
    'purple': { h: 280, s: 0.6, l: 0.4 },
    'almost grey': { h: 210, s: 0.05, l: 0.5 },
    'fluorescent': { h: 90, s: 1, l: 0.6 },
  };

  for (const [name, seed] of Object.entries(seeds)) {
    describe(name, () => {
      const p = paletteFrom(seed);

      it('keeps body text readable on the ground', () => {
        // 7:1 is AAA for normal text; this app is read at arm's length.
        expect(contrast(p.text, p.ground)).toBeGreaterThanOrEqual(7);
      });

      it('keeps secondary text readable', () => {
        expect(contrast(p.muted, p.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('keeps the accent readable on the ground', () => {
        // Jersey numbers are huge, but the accent is also used for small labels.
        expect(contrast(p.accent, p.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('keeps text on the accent readable', () => {
        expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
      });

      it('keeps text readable on a raised surface', () => {
        expect(contrast(p.text, p.surface)).toBeGreaterThanOrEqual(7);
      });
    });
  }

  it('falls back to the app blue when a badge has no colour', () => {
    const p = paletteFrom(null);
    expect(contrast(p.text, p.ground)).toBeGreaterThanOrEqual(7);
    expect(p.accent).not.toBe(p.ground);
  });

  it('does not produce a dead grey app from a washed-out badge', () => {
    const p = paletteFrom({ h: 210, s: 0.02, l: 0.5 });
    const seedless = rgbToHsl(
      parseInt(p.accent.slice(1, 3), 16),
      parseInt(p.accent.slice(3, 5), 16),
      parseInt(p.accent.slice(5, 7), 16),
    );
    expect(seedless.s).toBeGreaterThan(0.3);
  });
});
