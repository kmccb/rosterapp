import { describe, expect, it } from 'vitest';
import { applyLook, clearLook, deriveVars, LOOK_VARS, resizeLogo, type StyleTarget } from './look';

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

  it('sets --accent-ink to the ground, having no badge to sample an ink from', () => {
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
