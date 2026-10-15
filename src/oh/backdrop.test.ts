import { describe, expect, it } from 'vitest';
import { liftBackdrop } from './backdrop';

type RGBA = [number, number, number, number];
const WHITE: RGBA = [255, 255, 255, 255];
const BLACK: RGBA = [0, 0, 0, 255];
const ORANGE: RGBA = [242, 103, 34, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

/** A W×H picture painted by a function of (x, y). */
const picture = (W: number, H: number, paint: (x: number, y: number) => RGBA): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(paint(x, y), (y * W + x) * 4);
  return data;
};
const alpha = (data: Uint8ClampedArray, W: number, x: number, y: number) => data[(y * W + x) * 4 + 3];

/*
 * A crest in miniature: a black ring on white, white inside the ring (the
 * tiger's face), an orange stripe across the middle.
 */
const W = 40;
const crest = (x: number, y: number): RGBA => {
  const d = Math.hypot(x - 19.5, y - 19.5);
  if (d > 14) return WHITE;
  if (d > 11) return BLACK;
  return Math.abs(y - 19.5) < 2 ? ORANGE : WHITE;
};

describe('taking a crest’s backdrop off', () => {
  it('clears the white outside the ring and keeps the white inside it', () => {
    const data = picture(W, W, crest);
    expect(liftBackdrop(data, W, W)).toBe('lifted');
    expect(alpha(data, W, 0, 0)).toBe(0);
    expect(alpha(data, W, 2, 20)).toBe(0);
    expect(alpha(data, W, 19, 12)).toBe(255);
    expect(alpha(data, W, 19, 19)).toBe(255);
    // The ring itself stays solid.
    expect(alpha(data, W, 19, 7)).toBe(255);
  });

  it('works on any flat backdrop colour, not only white', () => {
    const data = picture(W, W, (x, y) => (crest(x, y) === WHITE && Math.hypot(x - 19.5, y - 19.5) > 14 ? ORANGE : crest(x, y)));
    expect(liftBackdrop(data, W, W)).toBe('lifted');
    expect(alpha(data, W, 0, 0)).toBe(0);
  });

  it('leaves a picture with no flat backdrop alone', () => {
    const data = picture(W, W, (x) => [x * 6, 40, 120, 255]);
    const before = data.slice();
    expect(liftBackdrop(data, W, W)).toBe('no-flat-backdrop');
    expect(data).toEqual(before);
  });

  it('leaves a cropped crest alone rather than pouring through its open ring', () => {
    // The ring runs off both sides, as a centre crop of a wide oval does.
    const cropped = (_x: number, y: number): RGBA => (y > 8 && y < 31 ? (y < 11 || y > 28 ? BLACK : WHITE) : WHITE);
    const data = picture(W, W, (x, y) => (x < 2 || x > 37 ? (y > 8 && y < 31 ? BLACK : WHITE) : cropped(x, y)));
    const before = data.slice();
    expect(liftBackdrop(data, W, W)).toBe('cropped');
    expect(data).toEqual(before);
  });

  it('leaves a dark backdrop on, since a black ring touching it would go with it', () => {
    // Springfield's case: the crest kept on black, its black ring meeting the black.
    const onBlack = picture(W, W, (x, y) => (Math.hypot(x - 19.5, y - 19.5) > 14 ? BLACK : crest(x, y)));
    const before = onBlack.slice();
    expect(liftBackdrop(onBlack, W, W)).toBe('dark-backdrop');
    expect(onBlack).toEqual(before);
    const navy = picture(W, W, (x, y) => (Math.hypot(x - 19.5, y - 19.5) > 14 ? [4, 4, 58, 255] : crest(x, y)));
    expect(liftBackdrop(navy, W, W)).toBe('dark-backdrop');
  });

  it('has nothing to do for a crest that is already transparent round the outside', () => {
    const data = picture(W, W, (x, y) => (Math.hypot(x - 19.5, y - 19.5) > 14 ? CLEAR : crest(x, y)));
    expect(liftBackdrop(data, W, W)).toBe('already-clear');
  });

  it('treats clear padding as backdrop, so a padded upload still lifts', () => {
    // A wide crest padded to a square with transparent bands top and bottom.
    const data = picture(W, W, (x, y) => (y < 5 || y > 34 ? (x === 0 && y === 0 ? WHITE : CLEAR) : crest(x, y)));
    expect(liftBackdrop(data, W, W)).toBe('lifted');
    expect(alpha(data, W, 0, 20)).toBe(0);
    expect(alpha(data, W, 19, 19)).toBe(255);
  });
});
