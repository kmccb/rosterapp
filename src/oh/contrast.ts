/*
 * Keeping a school's words readable on a school's colors.
 *
 * The seller picks a ground and an accent by eye, on a laptop, and the page
 * then uses the accent as text — row numbers, "vs" and "at", records, section
 * labels, the active tab. An accent that looks fine as a swatch can be a faint
 * smear as eleven-pixel type on a phone in the sun. So every color that is
 * used for words is checked against what it sits on, using WCAG's contrast
 * ratio, and nudged until it passes.
 *
 * The nudge only moves lightness. Hue and saturation are the school's — an
 * orange that is too dark on navy becomes a lighter orange, not a white — and a
 * color that already passes comes back exactly as it went in, so a school whose
 * colors work sees no change at all.
 */

const HEX = /^#[0-9a-f]{6}$/i;

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** Moves a hex color a fraction `t` of the way toward another. Also how a
 * translucent fill is worked out as the solid color it shows: a card at 72%
 * over the ground is the ground mixed 0.72 of the way toward the card. */
export const mix = (from: string, to: string, t: number): string => {
  const a = channels(from);
  const b = channels(to);
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
};

/** WCAG relative luminance, 0 for black to 1 for white. */
export function luminance(hex: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colors, 1 (none) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const toHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = channels(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
};

const fromHsl = (h: number, s: number, l: number): string => {
  if (s === 0) return toHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return toHex(hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255);
};

/** The worst contrast `fg` has against any of the surfaces it may sit on. */
export const worstContrast = (fg: string, against: string[]): number =>
  Math.min(...against.map((bg) => contrast(fg, bg)));

/**
 * `fg`, made to reach `min` contrast against every color in `against`.
 *
 * A color that already does is returned untouched. One that does not has its
 * lightness walked a percent at a time in both directions at once, and the
 * first step that passes wins — so it lands on whichever end, lighter or
 * darker, is nearer, and moves no further than it has to. If no lightness of
 * that hue gets there (a mid-grey ground can defeat a saturated color), the
 * most readable step seen is returned rather than nothing.
 */
export function readable(fg: string, against: string[], min = 4.5): string {
  if (!HEX.test(fg) || against.length === 0) return fg;
  let best = fg;
  let bestScore = worstContrast(fg, against);
  if (bestScore >= min) return fg;
  const [h, s, l] = toHsl(fg);
  for (let step = 1; step <= 100; step++) {
    const passing: [string, number][] = [];
    for (const next of [l + step / 100, l - step / 100]) {
      if (next < 0 || next > 1) continue;
      const candidate = fromHsl(h, s, next);
      const score = worstContrast(candidate, against);
      if (score >= min) passing.push([candidate, score]);
      if (score > bestScore) [best, bestScore] = [candidate, score];
    }
    // Both directions can pass on the same step only against a mid-tone; then
    // the clearer of the two is the better choice.
    if (passing.length) return passing.sort((a, b) => b[1] - a[1])[0][0];
  }
  for (const end of ['#ffffff', '#000000']) {
    const score = worstContrast(end, against);
    if (score > bestScore) [best, bestScore] = [end, score];
  }
  return best;
}

/** Which of `options` reads best on `bg` — for ink on a filled button, where
 * the choice is between a few known colors rather than a nudge of one. */
export const bestInk = (bg: string, options: string[]): string =>
  options.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best));
