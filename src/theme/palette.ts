/*
 * Works out a team's colours from its badge.
 *
 * The rule that generalises isn't "use the background" or "use the ink" — a
 * navy-on-blue bulldog and a red-on-white eagle want opposite treatments of
 * both. What does hold is that a team's identity lives in its most *saturated*
 * colour, whichever part of the badge carries it. So: find that hue, then build
 * a dark ground and a bright accent from it. The app stays legible because both
 * ends are generated, not sampled — sampling a pale badge would produce a pale
 * ground and unreadable text.
 *
 * Pure, so the awkward cases can be pinned in tests rather than found later on
 * someone's phone.
 */

export type Palette = {
  /** Page ground: the hue, very dark. */
  ground: string;
  /** Panels and keys, a step up from the ground. */
  surface: string;
  /** Hairlines and dividers. */
  line: string;
  /** Body text. */
  text: string;
  /** Secondary text. */
  muted: string;
  /** Jersey numbers, active tabs, primary actions. */
  accent: string;
  /** Text that sits on the accent. */
  accentInk: string;
};

export type Hsl = { h: number; s: number; l: number };

export const rgbToHsl = (r: number, g: number, b: number): Hsl => {
  const rd = r / 255;
  const gd = g / 255;
  const bd = b / 255;
  const max = Math.max(rd, gd, bd);
  const min = Math.min(rd, gd, bd);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rd) h = ((gd - bd) / d + (gd < bd ? 6 : 0)) / 6;
  else if (max === gd) h = ((bd - rd) / d + 2) / 6;
  else h = ((rd - gd) / d + 4) / 6;

  return { h: h * 360, s, l };
};

export const hslToHex = ({ h, s, l }: Hsl): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[seg];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
};

/** Relative luminance, for contrast checks. */
const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};

export const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * The badge's defining hue.
 *
 * Colours are bucketed coarsely and weighted by how saturated they are as well
 * as how much of the image they cover — a badge is mostly white and outline, and
 * neither of those is the team's colour. Near-greys are ignored entirely for the
 * same reason.
 */
export function dominantHue(pixels: Uint8ClampedArray, channels = 4): Hsl | null {
  const buckets = new Map<number, { weight: number; h: number; s: number; l: number; n: number }>();

  for (let i = 0; i < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] < 128) continue; // transparent
    const { h, s, l } = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);

    /*
     * Greys carry no hue, and near-black says nothing about identity. The
     * ceiling is 0.88 rather than near-white because cream and off-white read
     * as a faintly saturated orange — a badge printed on cream would otherwise
     * hand back "orange" as the team colour purely on area.
     */
    if (s < 0.18 || l < 0.06 || l > 0.88) continue;

    const key = Math.round(h / 15);
    const prev = buckets.get(key) ?? { weight: 0, h: 0, s: 0, l: 0, n: 0 };
    // Cubed, not squared: a small vivid crest has to beat a large washed-out
    // field, and squaring wasn't a steep enough penalty to manage it.
    const weight = s * s * s;
    buckets.set(key, {
      weight: prev.weight + weight,
      h: prev.h + h * weight,
      s: prev.s + s * weight,
      l: prev.l + l * weight,
      n: prev.n + 1,
    });
  }

  let best: { weight: number; h: number; s: number; l: number; n: number } | null = null;
  for (const b of buckets.values()) if (!best || b.weight > best.weight) best = b;
  if (!best || best.weight === 0) return null;

  return { h: best.h / best.weight, s: best.s / best.weight, l: best.l / best.weight };
}

/** Fallback when a badge has no usable colour at all — the app's own blue. */
export const DEFAULT_SEED: Hsl = { h: 205, s: 0.8, l: 0.45 };

export function paletteFrom(seed: Hsl | null): Palette {
  const { h } = seed ?? DEFAULT_SEED;
  // Clamp saturation: an almost-grey badge shouldn't produce a dead grey app,
  // and a fluorescent one shouldn't produce a vibrating background.
  const s = Math.min(0.95, Math.max(0.45, seed?.s ?? DEFAULT_SEED.s));

  const ground = hslToHex({ h, s: Math.min(0.9, s * 1.05), l: 0.115 });
  const surface = hslToHex({ h, s: s * 0.75, l: 0.22 });
  const text = '#ffffff';

  // Lift the accent until white-on-ground and accent-on-ground both hold up.
  let accent = hslToHex({ h, s: Math.min(1, s * 1.1), l: 0.63 });
  for (let l = 0.63; l <= 0.86 && contrast(accent, ground) < 6.5; l += 0.03) {
    accent = hslToHex({ h, s: Math.min(1, s * 1.1), l });
  }

  const muted = hslToHex({ h, s: s * 0.45, l: 0.78 });

  return {
    ground,
    surface,
    line: hslToHex({ h, s: s * 0.5, l: 0.42 }),
    text,
    muted,
    accent,
    // Dark ink on the accent unless the accent is itself dark.
    accentInk: contrast('#ffffff', accent) >= 4.5 ? '#ffffff' : ground,
  };
}
