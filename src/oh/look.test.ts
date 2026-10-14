import { describe, expect, it } from 'vitest';
import { contrast, mix } from './contrast';
import { applyLook, clearLook, deriveVars, lookNotes, LOOK_VARS, plateColor, resizeLogo, type StyleTarget } from './look';

const hexChannels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbaChannels = (value: string): [number, number, number] => {
  const m = value.match(/rgba\((\d+), (\d+), (\d+), [\d.]+\)/);
  if (!m) throw new Error(`not an rgba() string: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

describe('deriveVars', () => {
  const ground = '#04043a';
  const accent = '#4fbaf7';

  it('carries the ground straight into --bg', () => {
    expect(deriveVars({ ground, accent })['--bg']).toBe(ground);
  });

  it('pins --chrome to rgba(ground, 0.82) exactly', () => {
    expect(deriveVars({ ground, accent })['--chrome']).toBe('rgba(4, 4, 58, 0.82)');
  });

  it('makes --surface lighter than the ground', () => {
    const vars = deriveVars({ ground, accent });
    const [gr, gg, gb] = hexChannels(ground);
    const [sr, sg, sb] = rgbaChannels(vars['--surface']);
    expect(sr + sg + sb).toBeGreaterThan(gr + gg + gb);
  });

  it('sets --accent-ink to the ground when the ground reads best on the accent', () => {
    expect(deriveVars({ ground, accent })['--accent-ink']).toBe(ground);
  });

  it('sets --text to white', () => {
    expect(deriveVars({ ground, accent })['--text']).toBe('#ffffff');
  });

  it('wallpapers with the logo when there is one, otherwise none', () => {
    expect(deriveVars({ ground, accent, logo: 'data:image/jpeg;base64,AAAA' })['--wallpaper']).toBe(
      'url("data:image/jpeg;base64,AAAA")',
    );
    expect(deriveVars({ ground, accent })['--wallpaper']).toBe('none');
  });

  it('carries the accent straight through', () => {
    expect(deriveVars({ ground, accent })['--accent']).toBe(accent);
  });
});

describe('a chosen text color', () => {
  it('reads in white with the accent-lightened second voice when none is chosen, as before', () => {
    const plain = deriveVars({ ground: '#0e0c0b', accent: '#f26722' });
    expect(plain['--text']).toBe('#ffffff');
    expect(deriveVars({ ground: '#0e0c0b', accent: '#f26722', text: undefined })).toEqual(plain);
  });

  it('sets the text, and takes the second voice from it rather than the accent', () => {
    const vars = deriveVars({ ground: '#e8d6ca', accent: '#292929', text: '#000000' });
    expect(vars['--text']).toBe('#000000');
    // A third of the way from the text toward the ground: still dark on beige.
    expect(vars['--muted']).toBe(mix('#000000', '#e8d6ca', 0.35));
    expect(vars['--accent']).toBe('#292929');
  });

  it('ignores a text color that is not one', () => {
    expect(deriveVars({ ground: '#0e0c0b', accent: '#f26722', text: 'red' })['--text']).toBe('#ffffff');
  });
});

describe('applyLook / clearLook', () => {
  const makeTarget = () => {
    const props = new Map<string, string>();
    const target: StyleTarget = {
      style: {
        setProperty: (name, value) => props.set(name, value),
        removeProperty: (name) => props.delete(name),
      },
    };
    return { target, props };
  };

  it('sets every declared var, and clearing removes exactly those', () => {
    const { target, props } = makeTarget();
    applyLook({ ground: '#04043a', accent: '#4fbaf7' }, target);

    expect(props.size).toBe(LOOK_VARS.length);
    for (const name of LOOK_VARS) expect(props.has(name)).toBe(true);

    clearLook(target);
    expect(props.size).toBe(0);
  });

  it('round-trips to nothing left behind even with a logo set', () => {
    const { target, props } = makeTarget();
    applyLook({ ground: '#04043a', accent: '#4fbaf7', logo: 'data:image/jpeg;base64,AAAA' }, target);
    expect(props.get('--wallpaper')).toBe('url("data:image/jpeg;base64,AAAA")');

    clearLook(target);
    expect(props.size).toBe(0);
  });
});

describe('resizeLogo', () => {
  it('refuses to run where there is no document — this vitest env is node, no DOM', async () => {
    // Guards the browser-only path rather than being unit-tested against a
    // real canvas: jsdom is not part of this project's vitest setup.
    const file = new File([new Uint8Array([1, 2, 3])], 'badge.png', { type: 'image/png' });
    await expect(resizeLogo(file)).rejects.toThrow('Images can only be processed in a browser.');
  });
});

describe('plateColor', () => {
  const look = { ground: '#c75000', accent: '#111111' };

  it('follows the school’s own colors when chosen by name, so a recolor carries the plate with it', () => {
    expect(plateColor({ ...look, plate: 'ground' })).toBe('#c75000');
    expect(plateColor({ ...look, plate: 'accent' })).toBe('#111111');
  });

  it('takes a hex as it is, and anything else as no plate', () => {
    expect(plateColor({ ...look, plate: '#ffffff' })).toBe('#ffffff');
    expect(plateColor(look)).toBe('transparent');
    expect(plateColor({ ...look, plate: 'white' })).toBe('transparent');
  });

  it('reaches the page as --crest-plate', () => {
    expect(deriveVars({ ...look, plate: '#ffffff' })['--crest-plate']).toBe('#ffffff');
    expect(deriveVars(look)['--crest-plate']).toBe('transparent');
  });
});

describe('readable words', () => {
  /** The page and a card on it, the two things every word can sit on. */
  const grounds = (ground: string) => [ground, mix(ground, mix(ground, '#ffffff', 0.16), 0.72)];
  const worst = (fg: string, ground: string) => Math.min(...grounds(ground).map((g) => contrast(fg, g)));
  const WORDS = ['--text', '--muted', '--accent'] as const;

  it('leaves Springfield’s colors exactly as chosen', () => {
    // As set in the panel on 2026-10-14: beige ground, near-black accent, black text.
    const look = { ground: '#e8d6ca', accent: '#292929', text: '#000000' };
    const vars = deriveVars(look);
    expect(vars['--accent']).toBe('#292929');
    expect(vars['--text']).toBe('#000000');
    expect(lookNotes(look)).toEqual([]);
  });

  it('leaves a Poland-like navy and sky blue exactly as chosen', () => {
    const look = { ground: '#04043a', accent: '#4fbaf7' };
    const vars = deriveVars(look);
    expect(vars['--accent']).toBe('#4fbaf7');
    expect(vars['--text']).toBe('#ffffff');
    expect(vars['--muted']).toBe(mix('#4fbaf7', '#ffffff', 0.55));
    expect(lookNotes(look)).toEqual([]);
  });

  it('brings a too-dark accent up to 4.5 on the ground and the cards, and says so', () => {
    const look = { ground: '#04043a', accent: '#1b3a8c' };
    const vars = deriveVars(look);
    expect(vars['--accent']).not.toBe('#1b3a8c');
    expect(worst(vars['--accent'], look.ground)).toBeGreaterThanOrEqual(4.5);
    expect(lookNotes(look)).toEqual(['Accent lightened so it reads on the ground']);
  });

  it('keeps every word readable whatever the seller picks', () => {
    for (const look of [
      { ground: '#04043a', accent: '#04043a' }, // accent the same as the ground
      { ground: '#777777', accent: '#ff0000' }, // mid-grey ground
      { ground: '#c75000', accent: '#111111' }, // mid orange, where white text falls short on the cards
      { ground: '#ffffff', accent: '#ffff00', text: '#eeeeee' },
      { ground: '#000000', accent: '#000080', text: '#202020' },
    ]) {
      const vars = deriveVars(look);
      for (const name of WORDS) expect(worst(vars[name], look.ground), `${name} on ${look.ground}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('says which way a color moved', () => {
    expect(lookNotes({ ground: '#04043a', accent: '#04043a' })).toEqual(['Accent lightened so it reads on the ground']);
    expect(lookNotes({ ground: '#ffffff', accent: '#ffff00', text: '#eeeeee' })).toEqual([
      'Accent darkened so it reads on the ground',
      'Text darkened so it reads on the ground',
    ]);
  });

  it('inks an accent fill in whichever of ground, near-black or white reads best', () => {
    expect(deriveVars({ ground: '#04043a', accent: '#4fbaf7' })['--accent-ink']).toBe('#04043a');
    // A light ground on a dark accent would be the old answer; white reads better.
    expect(deriveVars({ ground: '#e8d6ca', accent: '#292929', text: '#000000' })['--accent-ink']).toBe('#ffffff');
    // A dark accent on a dark ground is lightened, and then the ground reads on it.
    const vars = deriveVars({ ground: '#04043a', accent: '#04043a' });
    expect(contrast(vars['--accent-ink'], vars['--accent'])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the decoration in the school’s colors as chosen', () => {
    const vars = deriveVars({ ground: '#04043a', accent: '#1b3a8c' });
    expect(vars['--ghost']).toBe('rgba(27, 58, 140, 0.22)');
  });
});
