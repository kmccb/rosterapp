/*
 * A paying school's home-screen icon, from its crest. Used by
 * scripts/paid-apps.mjs; kept apart so it can be tried on a file by hand.
 */

import sharp from 'sharp';

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
  const { width: W, height: H } = info;
  const at = (x, y) => (y * W + x) * 4;
  const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, i) => s + data[i + c], 0) / 4));
  const off = (i) => Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
  if (corners.some((i) => off(i) > 60)) return sharp(source).png().toBuffer();

  // Artwork running off the edge means the crest was cropped on the way in —
  // every crest uploaded before the panel padded instead of cropping was. Its
  // ring is open at the cut, so the flood would pour through into the
  // artwork's own white and eat it. Such a crest is used whole, and looks
  // right again once it is uploaded afresh.
  let edgeArt = 0;
  for (let x = 0; x < W; x++) edgeArt += (off(at(x, 0)) > 90) + (off(at(x, H - 1)) > 90);
  for (let y = 0; y < H; y++) edgeArt += (off(at(0, y)) > 90) + (off(at(W - 1, y)) > 90);
  if (edgeArt > 0.02 * 2 * (W + H)) return sharp(source).png().toBuffer();

  // Flood from every edge pixel that matches, never through one that does not.
  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    const p = y * W + x;
    if (seen[p] || off(p * 4) > 90) return;
    seen[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % W;
    const y = (p - x) / W;
    data[p * 4 + 3] = 0;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }
  // The anti-aliased fringe just inside: fade it by how close it is to the
  // backdrop, so the edge sits on the new colour without a pale halo.
  for (let p = 0; p < W * H; p++) {
    if (seen[p]) continue;
    const x = p % W;
    const y = (p - x) / W;
    const touches =
      (x > 0 && seen[p - 1]) || (x < W - 1 && seen[p + 1]) || (y > 0 && seen[p - W]) || (y < H - 1 && seen[p + W]);
    if (touches) data[p * 4 + 3] = Math.round(255 * Math.min(1, off(p * 4) / 200));
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).trim().png().toBuffer();
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
