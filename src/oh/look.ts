/*
 * A shared school's look: two colors and, maybe, a badge.
 *
 * The paid page carries a whole Theme (ground, surface, muted, accent,
 * accentInk, text — five colors plus provenance) because a device can pick its
 * own badge there and needs somewhere to keep what it derived. A follower's
 * roster page never picks anything; the school's fetch hands over ground and
 * accent and this module builds everything the stylesheet reads from just
 * those two, the same way src/theme/palette.ts builds a whole Palette from one
 * hue.
 *
 * The formulas below are copied from src/theme/theme.ts's applyTheme, not
 * imported from it: the oh bundle is built and shipped separately from the
 * root app (see vite.oh.config.ts and scripts/check-untouched.mjs), precisely
 * so a bug in one cannot ship in the other's bundle. Importing across that
 * line would defeat the split this file is not allowed to touch. If the root
 * app's alpha values or scrim formula change, this file has to be updated by
 * hand to match.
 */

export type SchoolLook = { ground: string; accent: string; logo?: string };

/** An element-like target for CSS custom properties — real usage defaults to
 * document.documentElement; tests pass a recording stub, since the vitest
 * environment for this project is `node` and has no DOM. */
export type StyleTarget = {
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  };
};

const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** Moves a hex color a fraction `t` of the way toward another. */
const mix = (from: string, to: string, t: number): string => {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const chan = (shift: number) => {
    const av = (a >> shift) & 255;
    const bv = (b >> shift) & 255;
    return Math.round(av + (bv - av) * t);
  };
  const to2 = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to2(chan(16))}${to2(chan(8))}${to2(chan(0))}`;
};

/**
 * Every CSS custom property applyLook sets and clearLook removes. Kept as one
 * list so the two can never drift — clearLook must remove exactly what
 * applyLook set, or a stale value survives a theme switch.
 */
export const LOOK_VARS = [
  '--bg', '--chrome', '--surface', '--surface-2', '--line',
  '--text', '--muted', '--accent', '--accent-ink', '--ghost', '--wallpaper',
  '--scrim-near', '--scrim-far', '--scrim-top', '--scrim-bottom',
] as const;

/**
 * Works out every CSS variable value from the two colors a school's fetch
 * hands over. Pure, so the exact numbers can be pinned in tests rather than
 * eyeballed on a phone.
 */
export function deriveVars(look: SchoolLook): Record<string, string> {
  const { ground, accent, logo } = look;

  // A step up from the ground, the way palette.ts's surface is a step up from
  // its own ground — but built by mixing toward white rather than by a second
  // HSL pass, since this module only has two colors to work with.
  const surface = mix(ground, '#ffffff', 0.16);
  const muted = mix(accent, '#ffffff', 0.55);
  const text = '#ffffff';
  // No badge to sample for an ink color here, so the ground stands in — the
  // same dark that reads against white text reads against the accent too,
  // for every accent this derivation is asked to lighten toward readability.
  const accentInk = ground;

  return {
    '--bg': ground,
    '--chrome': rgba(ground, 0.82),
    '--surface': rgba(surface, 0.72),
    '--surface-2': rgba(surface, 0.9),
    '--line': rgba(muted, 0.24),
    '--text': text,
    '--muted': muted,
    '--accent': accent,
    '--accent-ink': accentInk,
    '--ghost': rgba(accent, 0.22),
    '--wallpaper': logo ? `url("${logo}")` : 'none',
    '--scrim-near': rgba(ground, 0.78),
    '--scrim-far': rgba(ground, 0.93),
    '--scrim-top': rgba(ground, 0.72),
    '--scrim-bottom': rgba(ground, 0.88),
  };
}

const defaultTarget = (): StyleTarget => document.documentElement as unknown as StyleTarget;

/** Writes every variable deriveVars produces onto the target's style. */
export function applyLook(look: SchoolLook, target: StyleTarget = defaultTarget()): void {
  const vars = deriveVars(look);
  for (const name of LOOK_VARS) target.style.setProperty(name, vars[name]);
}

/** Removes exactly the variables applyLook can set, leaving the stylesheet's
 * own defaults in charge. */
export function clearLook(target: StyleTarget = defaultTarget()): void {
  for (const name of LOOK_VARS) target.style.removeProperty(name);
}

// ------------------------------------------------------------------ badge

/** Longest edge of the resized badge — matches src/theme/theme.ts's WALLPAPER_PX. */
const WALLPAPER_PX = 720;
/** Reject anything bigger than this before ever decoding it. */
const MAX_BYTES = 8 * 1024 * 1024;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = src;
  });

/**
 * Reads a picked file into a square, re-encoded badge — the same centre-crop
 * and resize src/theme/theme.ts's themeFromFile applies, minus the palette
 * extraction this bundle has no use for.
 *
 * Only meaningful in a browser: it draws through a canvas, which the vitest
 * environment (node, no DOM) does not have. Called there, it throws rather
 * than reaching for a document that does not exist.
 */
export async function resizeLogo(file: File): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Images can only be processed in a browser.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('That is not an image. A PNG or JPEG of the badge works best.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That image is too large. Something under 8 MB works best.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });

  const img = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = WALLPAPER_PX;
  canvas.height = WALLPAPER_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser will not let the app read the image.');

  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, WALLPAPER_PX, WALLPAPER_PX);

  return canvas.toDataURL('image/jpeg', 0.85);
}
