import { describe, expect, it } from 'vitest';
import { sellsInstead } from './rootVisit';

const ask = (path: string, headers: Record<string, string>) =>
  sellsInstead(new URL(path, 'https://roster.scottforge.ai'), new Headers(headers));

const typed = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };

describe('the bare address out of season', () => {
  it('sends a person who types the address to the marketing page', () => {
    expect(ask('/', typed)).toBe(true);
  });

  // The failure this exists to prevent: the worker installing the marketing
  // page as Poland's own, on every phone with Poland on its home screen.
  it('gives Poland’s service worker Poland, however it asks', () => {
    expect(ask('/?__WB_REVISION__=49c7a954', { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' })).toBe(false);
    expect(ask('/', { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' })).toBe(false);
    expect(ask('/?__WB_REVISION__=49c7a954', typed)).toBe(false);
  });

  it('opens a coach’s share link on Poland', () => {
    expect(ask('/?c=ABCD-EFGH', typed)).toBe(false);
  });

  it('gives Poland to a browser that does not say what it is doing', () => {
    expect(ask('/', {})).toBe(false);
    expect(ask('/', { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' })).toBe(false);
  });

  it('leaves every other address alone', () => {
    for (const path of ['/index.html', '/ysu/', '/victorychristian/', '/oh/', '/sw.js', '/anything']) {
      expect(ask(path, typed)).toBe(false);
    }
  });
});
