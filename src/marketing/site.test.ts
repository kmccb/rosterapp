import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The marketing page, pinned.
 *
 * It is plain HTML that no build reads, so nothing else would notice a dead
 * anchor, a price that drifted from docs/selling.md, or a sentence promising
 * something the app does not do. Read off disk as text — it is one small page,
 * and a DOM would be a dependency to keep for the sake of four regexes.
 */
const file = new URL('../../marketing/index.html', import.meta.url);
const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
/** What a reader sees: tags, scripts and styles out, entities left alone. */
const text = html
  .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
const attrs = (name: string) => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) => m[1]);

describe('the marketing page', () => {
  it('exists and is one page with one h1', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1"/);
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/getroster\.scottforge\.ai\/"/);
  });

  it('has every section its own links point at', () => {
    const ids = new Set(attrs('id'));
    for (const id of ['what', 'inside', 'setup', 'families', 'cost', 'launch', 'questions', 'start']) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const href of attrs('href').filter((h) => h.startsWith('#'))) {
      expect(ids.has(href.slice(1)), href).toBe(true);
    }
  });

  it('links out only to the addresses the spec names', () => {
    const allowed = [
      'https://roster.scottforge.ai/oh/demo/',
      'https://roster.scottforge.ai/oh/',
      'https://roster.scottforge.ai/oh/?privacy',
      'https://scottforge.ai/',
      'https://getroster.scottforge.ai/',
      'mailto:tom@scottforge.ai?subject=Roster%20for%20our%20school',
    ];
    const out = attrs('href').filter(
      (h) => /^(https?:|mailto:)/.test(h) && !h.includes('fonts.g'),
    );
    for (const href of out) expect(allowed, href).toContain(href);
    expect(out).toContain('https://roster.scottforge.ai/oh/demo/');
    expect(out.some((h) => h.startsWith('mailto:'))).toBe(true);
  });

  // A reader with no mail program can still copy the address.
  it('prints the email address where it can be read', () => {
    expect(text).toContain('tom@scottforge.ai');
  });

  it('quotes the prices docs/selling.md quotes', () => {
    expect(text).toMatch(/\$400\s*\/ season/);
    expect(text).toMatch(/\$1,200\s*\/ year/);
    expect(text).toMatch(/first season is free/i);
    const selling = readFileSync(new URL('../../docs/selling.md', import.meta.url), 'utf8');
    expect(selling).toContain('$400');
    expect(selling).toContain('$1,200');
  });

  it('promises nothing the app does not do, and names no real school', () => {
    for (const word of [
      'Hudl', 'MaxPreps', 'stats', 'Region', 'rSchoolToday', 'ArbiterGame',
      'DragonFly', 'Presented by', 'sponsor', 'Springfield', 'Tigers',
    ]) {
      expect(text.toLowerCase().includes(word.toLowerCase()), word).toBe(false);
    }
  });

  it('writes its apostrophes and quotes the way the app does', () => {
    expect(text).not.toMatch(/[A-Za-z]'[a-z]/);
    expect(text).not.toContain('"');
  });

  it('gives every picture a size, a description and a file', () => {
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBeGreaterThanOrEqual(4);
    for (const img of imgs) {
      expect(img, img).toMatch(/\balt="[^"]{8,}"/);
      expect(img, img).toMatch(/\bwidth="\d+"/);
      expect(img, img).toMatch(/\bheight="\d+"/);
    }
    for (const src of attrs('src')) {
      expect(existsSync(new URL(`../../marketing/${src}`, import.meta.url)), src).toBe(true);
    }
    expect(existsSync(new URL('../../marketing/img/share.png', import.meta.url))).toBe(true);
  });

  it('carries no tracker', () => {
    expect(html).not.toMatch(/<script[^>]*\bsrc=/);
    expect(html).not.toMatch(/gtag|analytics|beacon/i);
  });
});
