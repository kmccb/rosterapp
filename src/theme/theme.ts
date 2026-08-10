/*
 * A team's look: its badge, and the colours taken from it.
 *
 * Held next to the roster and sent with it, so a second school can use the same
 * site without a second deployment — open their link and the app wears their
 * colours. When no theme is set the stylesheet's own values stand, which is why
 * the original team's app is unchanged by any of this.
 *
 * The one thing that can't follow: the home-screen icon comes from the site
 * manifest, which is fixed at build time.
 */

import { dominantHue, paletteFrom, type Palette } from './palette';

export type Theme = {
  /** The badge, as a data URI. Doubles as the page wallpaper. */
  logo: string;
  palette: Palette;
  /** What it was derived from, for the settings screen to show. */
  seedHue: number;
};

const KEY = 'rosterapp.theme.v1';

type Stored = { schema: 1; theme: Theme };

const looksLikeTheme = (v: unknown): v is Theme => {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  const p = t.palette as Record<string, unknown> | undefined;
  // Either an uploaded badge (a data URI) or one baked into the build (a path).
  const logo = typeof t.logo === 'string' ? t.logo : '';
  return (
    (logo.startsWith('data:image/') || logo.startsWith('/')) &&
    !!p &&
    typeof p.ground === 'string' &&
    typeof p.accent === 'string'
  );
};

export const loadTheme = (): Theme | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return looksLikeTheme(parsed?.theme) ? parsed.theme : null;
  } catch {
    return null;
  }
};

export const saveTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ schema: 1, theme } satisfies Stored));
  } catch (err) {
    console.error('Could not save the theme', err);
    throw new Error('Could not save the logo — it may be too large for this device.');
  }
};

export const clearTheme = (): void => localStorage.removeItem(KEY);

/*
 * A team baked into the page at build time, for sites serving more than one.
 * The per-team build writes it into that team's index.html.
 *
 * It gets copied into storage on first visit rather than read fresh each time,
 * because offline the service worker answers a navigation with the root shell —
 * which carries the *root* team's script. Left unstored, a second team's app
 * would come up in the first team's colours the moment it lost signal.
 */
type BakedTeam = { slug: string; name: string; palette: Palette; wallpaper: string };

/**
 * The path this team is served from — "/" or "/victorychristian/". Files that
 * belong to a team sit beside its page, so this is what finds them.
 */
export const teamBase = (): string => {
  const baked = bakedTeam();
  if (baked?.wallpaper) return baked.wallpaper.replace(/badge\.jpg$/, '');
  return window.location.pathname.replace(/[^/]*$/, '');
};

export const bakedTeam = (): BakedTeam | null => {
  const t = (window as unknown as { __TEAM__?: BakedTeam }).__TEAM__;
  return t && t.palette && t.wallpaper ? t : null;
};

/** The theme to start with: what's stored, else what the page was built with. */
export function initialTheme(): Theme | null {
  const stored = loadTheme();
  if (stored) return stored;

  const baked = bakedTeam();
  if (!baked) return null;

  const theme: Theme = { logo: baked.wallpaper, palette: baked.palette, seedHue: -1 };
  try {
    // Stored so an offline launch, or the root shell, can't undo it.
    localStorage.setItem(KEY, JSON.stringify({ schema: 1, theme } satisfies Stored));
  } catch {
    // Not fatal: the page carries it anyway while there's a connection.
  }
  return theme;
}

// ------------------------------------------------------------------- apply

const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * Writes the palette onto the root element. Every value the stylesheet reads is
 * set, so a theme can't half-apply and leave one screen wearing the old colours.
 */
export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement;
  const vars = [
    '--bg', '--chrome', '--surface', '--surface-2', '--line',
    '--text', '--muted', '--accent', '--accent-ink', '--ghost', '--wallpaper',
    '--scrim-near', '--scrim-far', '--scrim-top', '--scrim-bottom',
  ];

  if (!theme) {
    // Back to whatever the stylesheet says.
    vars.forEach((v) => root.style.removeProperty(v));
    return;
  }

  const p = theme.palette;
  root.style.setProperty('--bg', p.ground);
  root.style.setProperty('--chrome', rgba(p.ground, 0.82));
  root.style.setProperty('--surface', rgba(p.surface, 0.72));
  root.style.setProperty('--surface-2', rgba(p.surface, 0.9));
  root.style.setProperty('--line', rgba(p.muted, 0.24));
  root.style.setProperty('--text', p.text);
  root.style.setProperty('--muted', p.muted);
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--accent-ink', p.accentInk);
  root.style.setProperty('--ghost', rgba(p.accent, 0.22));
  root.style.setProperty('--wallpaper', `url("${theme.logo}")`);

  /*
   * The veil over the badge, in the team's own dark. Four stops rather than one
   * flat colour so the badge stays readable in the middle of the screen and
   * fades out under the header and keypad, where small text lives.
   */
  root.style.setProperty('--scrim-near', rgba(p.ground, 0.78));
  root.style.setProperty('--scrim-far', rgba(p.ground, 0.93));
  root.style.setProperty('--scrim-top', rgba(p.ground, 0.72));
  root.style.setProperty('--scrim-bottom', rgba(p.ground, 0.88));
}

// ------------------------------------------------------------------ derive

/** Longest edge of the stored badge. Big enough for a wallpaper, small enough to share. */
const WALLPAPER_PX = 720;
/** The badge is only sampled for colour at this size; more pixels buy nothing. */
const SAMPLE_PX = 96;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = src;
  });

const draw = (img: HTMLImageElement, size: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser will not let the app read the image.');

  // Square, centre-cropped: badges are square and the wallpaper is drawn `cover`.
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvas;
};

/**
 * Reads a picked file into a theme: a squared-off, re-encoded badge plus the
 * palette its colours imply.
 */
export async function themeFromFile(file: File): Promise<Theme> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That is not an image. A PNG or JPEG of the badge works best.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });

  const img = await loadImage(dataUrl);

  // Re-encoded rather than stored as picked: a photo straight off a phone can
  // be several megabytes, which neither browser storage nor the share can take.
  const logo = draw(img, WALLPAPER_PX).toDataURL('image/jpeg', 0.72);

  const sample = draw(img, SAMPLE_PX);
  const ctx = sample.getContext('2d');
  if (!ctx) throw new Error('This browser will not let the app read the image.');
  const { data } = ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX);

  const seed = dominantHue(data, 4);
  return { logo, palette: paletteFrom(seed), seedHue: Math.round(seed?.h ?? -1) };
}

/** Roughly what the badge will cost in storage and in a share. */
export const themeSizeKb = (theme: Theme): number => Math.round(theme.logo.length / 1024);
