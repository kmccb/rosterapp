/*
 * A paying school's home-screen icon, from its crest. Used by
 * scripts/paid-apps.mjs; kept apart so it can be tried on a file by hand.
 */

import sharp from 'sharp';
// The same backdrop rule the panel applies at upload, so a crest uploaded
// transparent and one uploaded on white come out the same.
import { liftBackdrop as lift } from '../../src/oh/backdrop.ts';

/*
 * The icon, made the way Poland's is: the crest's own artwork, large, on a wash
 * of the school's colour — not the uploaded picture pasted in a box.
 *
 * An uploaded crest usually comes on a flat backdrop, most often white. Left
 * in, that backdrop is a white square inside the icon with a band of ground
 * colour round it. So the backdrop is lifted off first: every pixel near the
 * corners' colour that can be reached from the edge without crossing the
 * artwork goes transparent. Reached from the edge is the point — the white of
 * a tiger's face inside its black ring is not reachable, and stays. A crest
 * whose corners disagree is a picture with no flat backdrop (Poland's own
 * badge is a gradient), and is used whole.
 */
const shade = (hex, toward, t) => {
  const n = parseInt(hex.slice(1), 16);
  const m = parseInt(toward.slice(1), 16);
  const mix = (s) => Math.round(((n >> s) & 255) + (((m >> s) & 255) - ((n >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => mix(s).toString(16).padStart(2, '0')).join('')}`;
};

export async function liftBackdrop(source) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const outcome = lift(data, info.width, info.height);
  // A crest with no flat backdrop, or one cropped at its edges, is used whole.
  if (outcome === 'no-flat-backdrop' || outcome === 'cropped') return sharp(source).png().toBuffer();
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().png().toBuffer();
}

/** The artwork, big, centred on a soft wash of the ground colour. */
export async function icon(art, ground, size, margin) {
  const wash = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <defs><radialGradient id="g" cx="35%" cy="30%" r="85%">
         <stop offset="0" stop-color="${shade(ground, '#ffffff', 0.22)}"/>
         <stop offset="0.6" stop-color="${ground}"/>
         <stop offset="1" stop-color="${shade(ground, '#000000', 0.3)}"/>
       </radialGradient></defs>
       <rect width="${size}" height="${size}" fill="url(#g)"/>
     </svg>`,
  );
  const inner = Math.round(size * (1 - 2 * margin));
  const fitted = await sharp(art)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(wash).composite([{ input: fitted, gravity: 'center' }]).png().toBuffer();
}

/** No crest uploaded: the school's initial in its accent, so it is still its own. */
export const monogram = (name, accent, ground) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
       <rect width="512" height="512" fill="${ground}"/>
       <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
             font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="300"
             fill="${accent}">${(name.trim()[0] ?? '?').toUpperCase().replace(/[<&>]/g, '')}</text>
     </svg>`,
  );
