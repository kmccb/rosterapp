/**
 * Rasterises the app icon into the PNGs the manifest and iOS need.
 * Run with `npm run icons` after editing public/icons/favicon.svg, then commit
 * the output — the build itself doesn't depend on sharp.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = '#0b0f14';
const ACCENT = '#ffd60a';

/** @param {{ size: number, pad: number, rounded: boolean }} opts */
const svg = ({ size, pad, rounded }) => {
  const inner = size - pad * 2;
  const radius = rounded ? Math.round(size * 0.22) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BG}"/>
  <text x="${size / 2}" y="${size / 2}" fill="${ACCENT}"
        font-family="DejaVu Sans, system-ui, sans-serif" font-size="${Math.round(inner * 0.72)}"
        font-weight="bold" text-anchor="middle" dominant-baseline="central">7</text>
</svg>`;
};

const targets = [
  { file: 'icon-192.png', size: 192, pad: 16, rounded: true },
  { file: 'icon-512.png', size: 512, pad: 44, rounded: true },
  // Maskable icons get cropped to a circle, so keep the glyph well inside.
  { file: 'icon-512-maskable.png', size: 512, pad: 110, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, pad: 14, rounded: false },
];

await mkdir(outDir, { recursive: true });

for (const { file, ...opts } of targets) {
  const png = await sharp(Buffer.from(svg(opts))).png().toBuffer();
  await writeFile(join(outDir, file), png);
  console.log(`wrote ${file} (${opts.size}x${opts.size})`);
}
