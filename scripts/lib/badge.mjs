/**
 * Everything that can be made from a team's badge: the icon set, the wallpaper,
 * and the palette.
 *
 * Shared by the per-team build so a second school gets exactly the treatment
 * the first one got — same crop, same encoding, same colour rules. The palette
 * comes from the app's own module rather than a copy, so what the build bakes
 * in and what a runtime upload produces can't drift apart.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { dominantHue, paletteFrom } from '../../src/theme/palette.ts';

/** Breathing room left around the artwork, as a fraction of its longest side. */
const MARGIN = 0.1;

/**
 * Android crops maskable icons to a shape it doesn't tell us in advance, with
 * only the central 80% circle guaranteed.
 */
const MASKABLE_SCALE = 0.72;

/**
 * Palette PNGs: these are precached for offline use, and a photographic badge
 * as truecolour runs to several hundred kB across the set. 256 entries
 * reproduce flat artwork over a smooth wash with no visible difference — 128
 * bands the wash badly, which is why this isn't lower.
 */
const encode = (pipeline) => pipeline.png({ palette: true, colours: 256, effort: 10 }).toBuffer();

/**
 * The artwork is line work and fill over a backdrop. Neither extreme of the
 * brightness range appears in the backdrop, so this separates them without
 * needing an alpha channel.
 */
const isArt = (r, g, b) => Math.min(r, g, b) > 200 || (r < 45 && g < 45 && b < 150);

/**
 * Squares a badge by padding it, never by cropping.
 *
 * Crests are often wider than they are tall, and the parts that reach the edges
 * — swords, wings, banner tails — are exactly what a centre-crop removes. The
 * padding replicates the edge pixels, so a flat backdrop extends invisibly and
 * a gradient one simply stops changing.
 */
export async function squareSource(source) {
  const meta = await sharp(source).metadata();
  const side = Math.max(meta.width, meta.height);
  const dx = side - meta.width;
  const dy = side - meta.height;

  const buffer =
    dx === 0 && dy === 0
      ? await sharp(source).png().toBuffer()
      : await sharp(source)
          .extend({
            left: Math.floor(dx / 2),
            right: Math.ceil(dx / 2),
            top: Math.floor(dy / 2),
            bottom: Math.ceil(dy / 2),
            extendWith: 'copy',
          })
          .png()
          .toBuffer();

  return { buffer, side, padded: dx !== 0 || dy !== 0, source: meta };
}

/** Locates the artwork inside its badge and returns a square crop around it. */
export async function findArtwork(source) {
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (!isArt(data[i], data[i + 1], data[i + 2])) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // A badge with no detectable line work still deserves icons: fall back to the
  // whole image rather than refusing.
  if (maxX < 0) {
    const side = Math.min(info.width, info.height);
    return {
      info,
      crop: {
        left: Math.round((info.width - side) / 2),
        top: Math.round((info.height - side) / 2),
        width: side,
        height: side,
      },
      centred: { left: 0, right: 0, top: 0, bottom: 0 },
      artFraction: 1,
      found: false,
    };
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = (Math.max(maxX - minX, maxY - minY) / 2) * (1 + MARGIN);
  const limit = Math.min(cx, cy, info.width - cx, info.height - cy);
  const size = Math.floor(Math.min(half, limit)) * 2;

  // Padding that centres the artwork, for the maskable icon.
  const padX = Math.round(Math.abs(info.width - 2 * cx));
  const padY = Math.round(Math.abs(info.height - 2 * cy));
  const centred = {
    left: cx < info.width / 2 ? padX : 0,
    right: cx < info.width / 2 ? 0 : padX,
    top: cy < info.height / 2 ? padY : 0,
    bottom: cy < info.height / 2 ? 0 : padY,
  };
  const padded = { w: info.width + padX, h: info.height + padY };
  const short = Math.abs(padded.w - padded.h);
  if (padded.w < padded.h) {
    centred.left += Math.floor(short / 2);
    centred.right += Math.ceil(short / 2);
  } else {
    centred.top += Math.floor(short / 2);
    centred.bottom += Math.ceil(short / 2);
  }

  return {
    info,
    crop: {
      left: Math.round(cx - size / 2),
      top: Math.round(cy - size / 2),
      width: size,
      height: size,
    },
    centred,
    artFraction: Math.max(maxX - minX, maxY - minY) / Math.max(padded.w, padded.h),
    found: true,
  };
}

/** The colours a badge implies, unless the team pinned its own. */
export async function paletteFor(source, override) {
  if (override) return override;
  const { data } = await sharp(source)
    .resize(96, 96, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return paletteFrom(dominantHue(new Uint8ClampedArray(data), 4));
}

/** Writes the full icon set for one team. Returns what it wrote, for logging. */
export async function writeIcons(source, outDir) {
  const squared = await squareSource(source);
  const { crop, artFraction, info } = await findArtwork(squared.buffer);
  const badge = await sharp(squared.buffer).extract(crop).png().toBuffer();

  await mkdir(outDir, { recursive: true });
  const written = [];

  for (const [file, px] of [
    ['icon-512.png', 512],
    ['icon-192.png', 192],
    ['apple-touch-icon.png', 180],
    ['favicon-32.png', 32],
    ['favicon-16.png', 16],
  ]) {
    const png = await encode(sharp(badge).resize(px, px, { fit: 'cover' }));
    await writeFile(join(outDir, file), png);
    written.push([file, png.length]);
  }

  /*
   * Maskable: the whole badge, grown until the artwork occupies only the part
   * Android guarantees. Growing rather than shrinking-onto-a-background keeps
   * the backdrop continuous — compositing leaves a seam where the badge's own
   * wash meets a generated one. Only enough is added to hit the target, so a
   * badge with margin already is left alone.
   */
  const artSide = artFraction * info.width;
  const target = Math.max(info.width, Math.ceil(artSide / MASKABLE_SCALE));
  const cx = crop.left + crop.width / 2;
  const cy = crop.top + crop.height / 2;
  const left = Math.max(0, Math.round(target / 2 - cx));
  const top = Math.max(0, Math.round(target / 2 - cy));

  const maskable = await encode(
    sharp(squared.buffer)
      .extend({
        left,
        top,
        right: Math.max(0, target - info.width - left),
        bottom: Math.max(0, target - info.height - top),
        extendWith: 'copy',
      })
      .resize(512, 512, { fit: 'cover' }),
  );
  await writeFile(join(outDir, 'icon-512-maskable.png'), maskable);
  written.push(['icon-512-maskable.png', maskable.length]);

  return { written, artFraction: artSide / target, padded: squared.padded, source: squared.source };
}

/** The page wallpaper: the whole badge, small enough to precache. */
export async function writeWallpaper(source, outPath) {
  const squared = await squareSource(source);
  const buf = await sharp(squared.buffer)
    .resize(1200, 1200, { fit: 'cover' })
    .jpeg({ quality: 62, mozjpeg: true, progressive: true })
    .toBuffer();
  await writeFile(outPath, buf);
  return buf.length;
}
