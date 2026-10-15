/*
 * Takes the flat backdrop off a crest, so the crest is the artwork alone.
 *
 * Crests arrive as pictures: a tiger in a black oval on a white square. On a
 * school's page the white square is a white box sitting on an orange header,
 * and in a home-screen icon it is a white tile with an orange rim. What is
 * wanted is the oval on the school's own colour, the way Poland's badge sits.
 *
 * The backdrop is whatever is close to the colour of the four corners and can
 * be reached from the edge without crossing the artwork. "Reached from the
 * edge" is the whole trick: the white of the tiger's face is the same white,
 * but it is inside the black ring, so the flood never gets to it.
 *
 * It declines, and leaves the picture alone, when that would go wrong:
 *  - the corners disagree — the picture has no flat backdrop (Poland's badge
 *    is a gradient), so there is nothing to take off;
 *  - artwork runs off the edge — the crest was cropped, its ring is open at
 *    the cut, and the flood would pour through into the artwork's own white;
 *  - the corners are already transparent — somebody uploaded a crest that has
 *    no backdrop, and there is nothing to do.
 *
 * Pure — RGBA bytes in, the same bytes changed in place — so the panel's upload
 * (a canvas, src/oh/look.ts) and the home-screen icon builder (sharp,
 * scripts/lib/school-icon.mjs) take a backdrop off in exactly the same way, and
 * the tests here are the tests for both.
 */

export type Lifted = 'lifted' | 'already-clear' | 'no-flat-backdrop' | 'cropped';

/** How far, in summed RGB, a pixel may be from the corners' colour and still be backdrop. */
const BACKDROP = 90;
/** How far the four corners may be from their own average and still be one flat colour. */
const FLAT = 60;
/** Transparent enough to count as no pixel at all. */
const CLEAR = 16;

export function liftBackdrop(data: Uint8Array | Uint8ClampedArray, width: number, height: number): Lifted {
  const W = width;
  const H = height;
  const at = (x: number, y: number) => (y * W + x) * 4;
  const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];

  const solid = corners.filter((i) => data[i + 3] >= CLEAR);
  if (solid.length === 0) return 'already-clear';
  const bg = [0, 1, 2].map((c) => solid.reduce((s, i) => s + data[i + c], 0) / solid.length);
  /** Distance from the backdrop; a clear pixel is backdrop by definition. */
  const off = (i: number): number =>
    data[i + 3] < CLEAR ? 0 : Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);

  if (corners.some((i) => off(i) > FLAT)) return 'no-flat-backdrop';

  let edgeArt = 0;
  for (let x = 0; x < W; x++) edgeArt += Number(off(at(x, 0)) > BACKDROP) + Number(off(at(x, H - 1)) > BACKDROP);
  for (let y = 0; y < H; y++) edgeArt += Number(off(at(0, y)) > BACKDROP) + Number(off(at(W - 1, y)) > BACKDROP);
  if (edgeArt > 0.02 * 2 * (W + H)) return 'cropped';

  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  const push = (x: number, y: number) => {
    const p = y * W + x;
    if (seen[p] || off(p * 4) > BACKDROP) return;
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

  // The anti-aliased fringe just inside the artwork: faded by how near it is
  // to the backdrop, so the edge sits on the new colour without a pale halo.
  for (let p = 0; p < W * H; p++) {
    if (seen[p]) continue;
    const x = p % W;
    const y = (p - x) / W;
    const touches =
      (x > 0 && seen[p - 1]) || (x < W - 1 && seen[p + 1]) || (y > 0 && seen[p - W]) || (y < H - 1 && seen[p + W]);
    if (touches) data[p * 4 + 3] = Math.min(data[p * 4 + 3], Math.round(255 * Math.min(1, off(p * 4) / 200)));
  }
  return 'lifted';
}
