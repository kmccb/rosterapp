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

import { liftBackdrop } from './backdrop';
import { bestInk, contrast, luminance, mix, readable } from './contrast';
import { plateColor, type CrestPlate } from './plate';

// The plate rule lives in ./plate so the home-screen icon script can share it.
export { plateColor, type CrestPlate };

/** The three colors a seller can choose for the light page. All three or
 * none: a light page is worked out from the dark colors unless somebody chose
 * it whole. */
export type LightColors = { ground: string; accent: string; text: string };

/** `text` is optional: a school that never chose one reads in white, as every
 * school did before there was a third color to choose. `plate` is optional the
 * same way: none means the crest sits straight on the page. `light` is the
 * seller's own light page; none means it is derived from the dark colors. */
export type SchoolLook = {
  ground: string;
  accent: string;
  text?: string;
  plate?: CrestPlate;
  logo?: string;
  light?: LightColors;
};

/** Which way round a paid page is painted. Dark — the school's ground behind
 * light words — is how every page has always looked and stays the default;
 * light is what a fan can switch to (src/oh/mode.ts). */
export type Mode = 'dark' | 'light';

/** An element-like target for CSS custom properties — real usage defaults to
 * document.documentElement; tests pass a recording stub, since the vitest
 * environment for this project is `node` and has no DOM. The attribute calls
 * are optional so a stub that only records styles still serves. */
export type StyleTarget = {
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  };
  setAttribute?(name: string, value: string): void;
  removeAttribute?(name: string): void;
};

const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const isHex = (v: string | undefined): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v);

/** The light colors the seller chose, or null when there is no whole set —
 * half a set is never painted, the same rule the stored colors follow. */
const chosenLight = (look: SchoolLook): LightColors | null => {
  const l = look.light;
  return l && isHex(l.ground) && isHex(l.accent) && isHex(l.text) ? l : null;
};

/** The colors a mode is painted from. A light page the seller chose is painted
 * exactly as the dark page is, from its own three colors, so it gets the same
 * surfaces, the same second voice and the same readability floor; only a
 * light page nobody chose is worked out by turning the dark one over. */
const sourceFor = (look: SchoolLook, mode: Mode): { look: SchoolLook; mode: Mode } => {
  const light = mode === 'light' ? chosenLight(look) : null;
  return light ? { look: { ...look, ...light, light: undefined }, mode: 'dark' } : { look, mode };
};

/** The dark offered for ink on an accent fill when the ground itself is too
 * light to read there — not pure black, which looks like a hole on a phone. */
const NEAR_BLACK = '#111111';

/** The attribute on <html> that oh.css keys its light-mode overrides on. */
export const MODE_ATTR = 'data-oh-mode';

/**
 * Every CSS custom property applyLook sets and clearLook removes. Kept as one
 * list so the two can never drift — clearLook must remove exactly what
 * applyLook set, or a stale value survives a theme switch.
 */
export const LOOK_VARS = [
  '--bg', '--chrome', '--surface', '--surface-2', '--line',
  '--text', '--muted', '--accent', '--accent-ink', '--ghost', '--wallpaper',
  '--scrim-near', '--scrim-far', '--scrim-top', '--scrim-bottom', '--crest-plate',
] as const;

/** The page's background in a mode: the ground itself, or in light mode a
 * near-white with just enough of the ground in it to still be this school's. */
export const pageGround = (ground: string, mode: Mode = 'dark'): string =>
  mode === 'light' ? mix(ground, '#ffffff', 0.94) : ground;

/** The page's background for a whole look: the seller's own light ground when
 * one was chosen, else pageGround's. What the address bar is tinted with. */
export const lookGround = (look: SchoolLook, mode: Mode = 'dark'): string => {
  const src = sourceFor(look, mode);
  return pageGround(src.look.ground, src.mode);
};

/** How colorful a color is: the spread of its channels, 0 for any grey. */
const chroma = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (Math.max(...c) - Math.min(...c)) / 255;
};

/** Below this a color reads as a grey, black or white rather than a hue. */
const NEUTRAL = 0.08;
/** Closer than this, two colors count as equally colorful. */
const NEAR_TIE = 0.05;

/**
 * Which school color the light page carries as its accent — the active tab's
 * underline, the jersey numbers, the section labels.
 *
 * The more colorful of the two, because on near-white a school is known by
 * its hue: a black ground with an orange accent must come out orange (made
 * dark enough to read by readable()), not black, or the light page is
 * anybody's. On a near-tie the ground wins, being the color the school is
 * painted in. Only when both are greys does it fall back to whichever stands
 * out more on the light background.
 */
export function lightAccent(ground: string, accent: string, bg: string): string {
  const g = chroma(ground);
  const a = chroma(accent);
  if (g < NEUTRAL && a < NEUTRAL) return contrast(ground, bg) >= contrast(accent, bg) ? ground : accent;
  return a > g + NEAR_TIE ? accent : ground;
}

/** The colors the page is painted in, with the ones used for words both as
 * chosen and as made readable — what deriveVars paints with, and what the
 * panel's hint reads. */
type Words = {
  bg: string;
  /** The card color, laid over the page at 72% and 90%. */
  surface: string;
  text: string;
  muted: string;
  accent: string;
  chosen: { text: string; muted: string; accent: string };
};

function words(look: SchoolLook, mode: Mode): Words {
  const { ground, accent } = look;
  const bg = pageGround(ground, mode);
  const chosenText = isHex(look.text) ? look.text : null;

  // A step up from the ground, the way palette.ts's surface is a step up from
  // its own ground — but built by mixing toward white rather than by a second
  // HSL pass, since this module only has two colors to work with. In light
  // mode the step up from a near-white page is white itself.
  const surface = mode === 'light' ? '#ffffff' : mix(ground, '#ffffff', 0.16);
  // Cards are that surface at 72% over the page, and a word on a card is read
  // against what that comes out as, not against the surface alone.
  const grounds = [bg, mix(bg, surface, 0.72)];

  if (mode === 'light') {
    // A chosen text color was chosen for the ground, and a light page needs
    // its opposite: near-black, carrying a trace of the ground so it is the
    // school's black rather than the browser's.
    const rawText = mix(ground, '#000000', 0.82);
    const text = readable(rawText, grounds);
    const rawMuted = mix(text, bg, 0.35);
    const rawAccent = lightAccent(ground, accent, bg);
    return {
      bg,
      surface,
      text,
      muted: readable(rawMuted, grounds),
      accent: readable(rawAccent, grounds),
      chosen: { text: rawText, muted: rawMuted, accent: rawAccent },
    };
  }

  const rawText = chosenText ?? '#ffffff';
  const text = readable(rawText, grounds);
  // The second voice — a player's details, a heading over a list. Lightened
  // from the accent when the text is white, as it always was; taken from the
  // chosen text when there is one, a third of the way back toward the ground,
  // because a school that picks dark text on a light ground would otherwise
  // get its details in a pale accent nobody could read.
  const rawMuted = chosenText ? mix(text, ground, 0.35) : mix(accent, '#ffffff', 0.55);

  return {
    bg,
    surface,
    text,
    muted: readable(rawMuted, grounds),
    accent: readable(accent, grounds),
    chosen: { text: rawText, muted: rawMuted, accent },
  };
}

/**
 * Works out every CSS variable value from the two colors a school's fetch
 * hands over. Pure, so the exact numbers can be pinned in tests rather than
 * eyeballed on a phone.
 *
 * The three colors used for words — text, muted and accent — are passed
 * through readable() against the page and the card surface, so a school
 * can choose any colors at all and still be read; colors that already work
 * come through untouched. The ghost numeral and the hairlines are decoration,
 * and keep the school's colors as chosen.
 *
 * Light mode is the same page turned over: a near-white tinted with the
 * ground, near-black words, and the scrims over the crest built from that
 * near-white at the same strengths, so the crest is exactly as faint.
 */
export function deriveVars(look: SchoolLook, mode: Mode = 'dark'): Record<string, string> {
  const { logo } = look;
  // The crest's plate is left out of this on purpose: it is the crest's own
  // fill, read from the dark colors in either mode, as the home-screen icon is.
  const src = sourceFor(look, mode);
  const { ground } = src.look;
  const w = words(src.look, src.mode);
  const { bg } = w;
  // Ink on an accent fill — the active tab, a filled button. The ground was
  // always the answer and still is when it reads best; an accent the ground
  // cannot be read on gets near-black or white instead.
  const accentInk = bestInk(w.accent, [ground, NEAR_BLACK, '#ffffff']);

  return {
    '--bg': bg,
    '--chrome': rgba(bg, 0.82),
    '--surface': rgba(w.surface, 0.72),
    '--surface-2': rgba(w.surface, 0.9),
    '--line': rgba(w.chosen.muted, 0.24),
    '--text': w.text,
    '--muted': w.muted,
    '--accent': w.accent,
    '--accent-ink': accentInk,
    '--ghost': rgba(w.chosen.accent, 0.22),
    '--wallpaper': logo ? `url("${logo}")` : 'none',
    '--scrim-near': rgba(bg, 0.78),
    '--scrim-far': rgba(bg, 0.93),
    '--scrim-top': rgba(bg, 0.72),
    '--scrim-bottom': rgba(bg, 0.88),
    '--crest-plate': plateColor(look),
  };
}

/**
 * The light page as fans see it when nobody chose one: its background, and
 * its words as made readable. The panel starts the light pickers from this,
 * so a seller who ticks the box begins from the page fans already have.
 */
export function derivedLight(look: SchoolLook): LightColors {
  const w = words({ ...look, light: undefined }, 'light');
  return { ground: w.bg, accent: w.accent, text: w.text };
}

/**
 * What the panel says under the color pickers when a color was moved to stay
 * readable. The second voice is derived rather than picked, and a hint about
 * a color nobody can choose would only puzzle, so it is left out. The color is
 * never refused: the page shows the adjusted one, and the seller is told why
 * it looks different from the swatch. A light page is reported only when the
 * seller chose it: one worked out from the dark colors has no swatch for a
 * note to explain.
 */
export function lookNotes(look: SchoolLook, mode: Mode = 'dark'): string[] {
  if (mode === 'light' && !chosenLight(look)) return [];
  const src = sourceFor(look, mode);
  const w = words(src.look, src.mode);
  const moved = (label: string, from: string, to: string) =>
    from.toLowerCase() === to.toLowerCase()
      ? []
      : [`${label} ${luminance(to) > luminance(from) ? 'lightened' : 'darkened'} so it reads on the ground`];
  return [
    ...moved('Accent', w.chosen.accent, w.accent),
    // White is the text nobody chose, but a page whose text has turned dark
    // is the biggest change of all, so it is reported the same.
    ...moved('Text', w.chosen.text, w.text),
  ];
}

const defaultTarget = (): StyleTarget => document.documentElement as unknown as StyleTarget;

/** Writes every variable deriveVars produces onto the target's style, and marks
 * the mode on it for the few rules oh.css has to turn over by hand. */
export function applyLook(look: SchoolLook, target: StyleTarget = defaultTarget(), mode: Mode = 'dark'): void {
  const vars = deriveVars(look, mode);
  for (const name of LOOK_VARS) target.style.setProperty(name, vars[name]);
  target.setAttribute?.(MODE_ATTR, mode);
}

/** Removes exactly what applyLook can set, leaving the stylesheet's own
 * defaults in charge — the mode mark too, so a free page shown after a paid
 * one is never left turned light. */
export function clearLook(target: StyleTarget = defaultTarget()): void {
  for (const name of LOOK_VARS) target.style.removeProperty(name);
  target.removeAttribute?.(MODE_ATTR);
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
 * Reads a picked file into a square, re-encoded badge. It pads where
 * src/theme/theme.ts's themeFromFile crops — see below for why — and skips the
 * palette extraction this bundle has no use for.
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

  /*
   * Padded to a square, never cropped. Crests are usually wider than they are
   * tall — Springfield's tiger is an oval twice as wide as it is high — and a
   * centre crop took both ends off it.
   *
   * And transparent, not on its backdrop. The crest is drawn at size on its
   * own canvas first and its flat backdrop is lifted off there (src/oh/
   * backdrop.ts) — the white square a tiger usually comes on — so the page
   * shows the oval on the school's own colour, and the home-screen icon is
   * built from the same clean artwork. A crest with no flat backdrop to take
   * off, or one cropped at its edges, is kept as it came, on a square of its
   * own corner colour, as a JPEG.
   */
  const scale = WALLPAPER_PX / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const art = document.createElement('canvas');
  art.width = w;
  art.height = h;
  const actx = art.getContext('2d');
  if (!actx) throw new Error('This browser will not let the app read the image.');
  actx.drawImage(img, 0, 0, w, h);
  const pixels = actx.getImageData(0, 0, w, h);
  const corner = Array.from(pixels.data.slice(0, 3));
  const outcome = liftBackdrop(pixels.data, w, h);
  const clear = outcome === 'lifted' || outcome === 'already-clear';
  if (outcome === 'lifted') actx.putImageData(pixels, 0, 0);

  if (!clear) {
    ctx.fillStyle = `rgb(${corner[0]}, ${corner[1]}, ${corner[2]})`;
    ctx.fillRect(0, 0, WALLPAPER_PX, WALLPAPER_PX);
  }
  ctx.drawImage(art, Math.round((WALLPAPER_PX - w) / 2), Math.round((WALLPAPER_PX - h) / 2));
  if (!clear) return canvas.toDataURL('image/jpeg', 0.85);

  /*
   * Transparency needs PNG (or WebP), which runs larger than the JPEG it
   * replaces, and the database refuses a look over 500 kB. Flat artwork is
   * well under that as PNG; a busy one is tried as WebP, then smaller.
   */
  const LIMIT = 450_000;
  const png = canvas.toDataURL('image/png');
  if (png.length <= LIMIT) return png;
  const webp = canvas.toDataURL('image/webp', 0.9);
  if (webp.startsWith('data:image/webp') && webp.length <= LIMIT) return webp;
  const small = document.createElement('canvas');
  small.width = 480;
  small.height = 480;
  small.getContext('2d')?.drawImage(canvas, 0, 0, 480, 480);
  return small.toDataURL('image/png');
}
