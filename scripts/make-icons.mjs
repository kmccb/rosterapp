/**
 * Rasterises the team logo into the PNGs the manifest, iOS and the browser tab
 * need. Run with `npm run icons` after replacing img/logo.jpg, then commit the
 * output — the build itself doesn't depend on sharp.
 *
 * The source is a square badge with a fair amount of empty backdrop around the
 * artwork, so this finds the artwork first and crops to it. Resizing the raw
 * file instead would spend about a third of a 192px icon on plain blue, which
 * is the difference between a recognisable mascot and a smudge on a home
 * screen.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'img', 'logo.jpg');
const outDir = join(root, 'public', 'icons');

/** Breathing room left around the artwork, as a fraction of its longest side. */
const MARGIN = 0.1;

/**
 * Android crops maskable icons to a shape it doesn't tell us in advance, with
 * only the central 80% circle guaranteed. 72% keeps the face and jaw safely
 * inside; the ear tips and collar spikes are what a round mask nibbles, and
 * losing those still leaves the logo readable.
 */
const MASKABLE_SCALE = 0.72;

/**
 * Palette PNGs, because these are precached for offline use and the whole point
 * of the app is opening without a signal. The source is a JPEG, so its gradient
 * carries compression noise that defeats PNG's row filters — truecolour output
 * ran to 660 kB across the set. The artwork is two flat colours over a smooth
 * wash, which a 256-entry palette reproduces with no visible difference.
 */
const encode = (pipeline) => pipeline.png({ palette: true, colours: 256, effort: 10 }).toBuffer();

/**
 * The artwork is white fill and near-black navy line work; the backdrop is a
 * mid-blue wash. Neither of those extremes appears in the wash, so a simple
 * brightness test separates them without needing an alpha channel.
 */
const isArt = (r, g, b) => Math.min(r, g, b) > 200 || (r < 45 && g < 45 && b < 150);

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

if (maxX < 0) throw new Error(`Found no artwork in ${source} — is it the right image?`);

// A square crop centred on the artwork, clamped so it can't run off the canvas.
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const half = (Math.max(maxX - minX, maxY - minY) / 2) * (1 + MARGIN);
const limit = Math.min(cx, cy, info.width - cx, info.height - cy);
const size = Math.floor(Math.min(half, limit)) * 2;
const crop = {
  left: Math.round(cx - size / 2),
  top: Math.round(cy - size / 2),
  width: size,
  height: size,
};

const badge = await sharp(source).extract(crop).png().toBuffer();

await mkdir(outDir, { recursive: true });

const write = async (file, buffer, note) => {
  await writeFile(join(outDir, file), buffer);
  console.log(`wrote ${file}${note ? ` — ${note}` : ''}`);
};

const plain = [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
  ['favicon-16.png', 16],
];

for (const [file, px] of plain) {
  const png = await encode(sharp(badge).resize(px, px, { fit: 'cover' }));
  await write(file, png, `${px}x${px}`);
}

/*
 * Maskable is the uncropped logo rather than the badge, because the source
 * already sits at roughly the proportion a maskable icon wants — it just isn't
 * quite centred. Compositing the badge onto a generated gradient instead left a
 * visible square seam where the two washes failed to line up, so this grows the
 * canvas until the artwork is centred and lets the original wash run edge to
 * edge. The padding replicates the edge pixels, so the gradient stops changing
 * near the border rather than butting against a hard line.
 */
const padX = Math.round(Math.abs(info.width - 2 * cx));
const padY = Math.round(Math.abs(info.height - 2 * cy));
const centred = {
  left: cx < info.width / 2 ? padX : 0,
  right: cx < info.width / 2 ? 0 : padX,
  top: cy < info.height / 2 ? padY : 0,
  bottom: cy < info.height / 2 ? 0 : padY,
};

// Square it off, splitting the difference so the artwork stays centred.
const padded = { w: info.width + padX, h: info.height + padY };
const short = Math.abs(padded.w - padded.h);
if (padded.w < padded.h) {
  centred.left += Math.floor(short / 2);
  centred.right += Math.ceil(short / 2);
} else {
  centred.top += Math.floor(short / 2);
  centred.bottom += Math.ceil(short / 2);
}

const canvas = Math.max(padded.w, padded.h);
const artFraction = Math.max(maxX - minX, maxY - minY) / canvas;

const maskable = await encode(
  sharp(source).extend({ ...centred, extendWith: 'copy' }).resize(512, 512, { fit: 'cover' }),
);

await write(
  'icon-512-maskable.png',
  maskable,
  `512x512, art at ${(artFraction * 100).toFixed(0)}% (safe zone wants under ${MASKABLE_SCALE * 100}%)`,
);

if (artFraction > MASKABLE_SCALE) {
  console.warn(
    `\n! The artwork fills ${(artFraction * 100).toFixed(0)}% of the maskable icon, so a round ` +
      `mask may clip it. Add more margin around the logo in ${source}.`,
  );
}

console.log(
  `\nartwork found at ${minX},${minY}–${maxX},${maxY}; cropped ${size}x${size} from ${info.width}x${info.height}`,
);
