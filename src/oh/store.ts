/*
 * What the directory remembers.
 *
 * No service worker here — the root app has one and a second on the same
 * origin is a way to break the first. localStorage is enough: an index of
 * seven hundred schools is forty kilobytes and a season is three, so the
 * school a reader actually follows survives a dead signal at a ground, which
 * is the only offline case that matters.
 */

import type { School, SchoolSeason } from '../ohio/stateModel';

const CHOSEN = 'oh.school';
const INDEX = 'oh.index';
const SEASON = (slug: string) => `oh.season.${slug}`;

/** Punctuation and case are noise when somebody is typing at a game. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Every word typed has to match, against either the school or its town.
 *
 * "jackson mass" has to reach Jackson of Massillon, because there are three
 * Jacksons and the town is the only thing that separates them.
 */
export function searchSchools(schools: School[], q: string): School[] {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return [];

  return schools.filter((s) => {
    const hay = norm(`${s.name} ${s.city}`);
    return words.every((w) => hay.includes(w));
  });
}

export const chosenSlug = (): string | null => localStorage.getItem(CHOSEN);
export const choose = (slug: string): void => localStorage.setItem(CHOSEN, slug);
export const forget = (): void => localStorage.removeItem(CHOSEN);

/** Network first, then whatever was kept — the schedule screen's rule. */
export async function loadIndex(): Promise<School[]> {
  try {
    const res = await fetch(`/oh/index.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json();
      localStorage.setItem(INDEX, JSON.stringify(body.schools));
      return body.schools as School[];
    }
  } catch {
    // No signal, which is the normal case at a ground.
  }
  const kept = localStorage.getItem(INDEX);
  if (kept) return JSON.parse(kept) as School[];
  throw new Error('no index');
}

export async function loadSeason(slug: string): Promise<SchoolSeason> {
  try {
    const res = await fetch(`/oh/data/${slug}.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const season = (await res.json()) as SchoolSeason;
      // Only the followed school is kept. Caching every school browsed would
      // fill the jar with counties nobody will open again.
      if (slug === chosenSlug()) localStorage.setItem(SEASON(slug), JSON.stringify(season));
      return season;
    }
  } catch {
    /* no signal */
  }
  const kept = localStorage.getItem(SEASON(slug));
  if (kept) return JSON.parse(kept) as SchoolSeason;
  throw new Error('no season');
}
