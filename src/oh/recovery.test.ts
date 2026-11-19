import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { PageCrash } from './PageCrash';
import { clearSchoolKept, schoolInView } from './recovery';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  };
});

describe('which school the crash screen can clear', () => {
  it('prefers the school in the address', () => {
    expect(schoolInView('?school=canfield', 'poland-seminary')).toBe('canfield');
  });

  it('falls back to the followed school', () => {
    expect(schoolInView('', 'poland-seminary')).toBe('poland-seminary');
  });

  it('has none on a bare directory', () => {
    expect(schoolInView('', null)).toBeNull();
  });

  it.each(['../rosterapp.v1', 'a.b', 'A B', ''])('refuses the slug %j', (slug) => {
    expect(schoolInView('', slug)).toBeNull();
  });
});

describe('clearing a school', () => {
  it('removes what the page keeps for that school', () => {
    for (const k of [
      'oh.roster.canfield',
      'oh.roster.canfield.football',
      'oh.roster.canfield.boys basketball',
      'oh.stats.canfield.football',
      'oh.livesports.canfield',
      'oh.sport.canfield',
      'oh.season.canfield',
      'oh.league.canfield',
      'oh.weather.canfield',
      'oh.region.canfield',
    ]) {
      memory.set(k, 'x');
    }
    clearSchoolKept('canfield');
    expect([...memory.keys()]).toEqual([]);
  });

  it('leaves the root app, other schools and the sign-in alone', () => {
    const kept = [
      'rosterapp.v1',
      'rosterapp.stats.v1',
      'rosterapp.theme.v1',
      'rosterapp.share.v1',
      'oh.school',
      'oh.index',
      'oh.mode',
      'oh.admin.session',
      'oh.roster.canfield-south.football',
      'oh.stats.canfield-south.football',
      'oh.season.canfield-south',
    ];
    for (const k of kept) memory.set(k, 'x');
    clearSchoolKept('canfield');
    expect([...memory.keys()].sort()).toEqual([...kept].sort());
  });

  it('does not throw when storage is blocked', () => {
    (globalThis as Record<string, unknown>).localStorage = undefined;
    expect(() => clearSchoolKept('canfield')).not.toThrow();
  });
});

describe('PageCrash', () => {
  it('always offers a reload', () => {
    expect(renderToStaticMarkup(createElement(PageCrash, { school: false }))).toContain('Reload');
  });

  it('offers no clearing on a page with nothing of a school’s to clear', () => {
    expect(renderToStaticMarkup(createElement(PageCrash, { school: false }))).not.toContain('Clear this roster');
  });

  it('still renders with storage and the address both unavailable', () => {
    (globalThis as Record<string, unknown>).localStorage = undefined;
    expect(() => renderToStaticMarkup(createElement(PageCrash, { school: true }))).not.toThrow();
  });
});
