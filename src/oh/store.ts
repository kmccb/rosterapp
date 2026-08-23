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

/**
 * The old school's season is dropped on a genuine switch, not on un-choosing.
 *
 * Evicting in forget() read as the tidier place for it and was wrong: the tap
 * that runs forget() is "follow a different school", which is also what an
 * offline reader presses — and it was deleting the one file the design
 * promises survives a dead signal at a ground. Re-picking the same school
 * keeps its cached season; picking a different one drops the stale key, so
 * nothing accumulates either way.
 */
export const choose = (slug: string): void => {
  const prev = chosenSlug();
  if (prev && prev !== slug) {
    localStorage.removeItem(SEASON(prev));
    // The roster obeys the same rule as the season: kept for the followed
    // school, dropped on a genuine switch. Key inlined rather than imported
    // from rosterStore, which imports chosenSlug from here.
    localStorage.removeItem(`oh.roster.${prev}`);
  }
  localStorage.setItem(CHOSEN, slug);
};

export const forget = (): void => localStorage.removeItem(CHOSEN);

/** Network first, then whatever was kept — the schedule screen's rule. */
export async function loadIndex(): Promise<School[]> {
  try {
    const res = await fetch(`/oh/index.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json();
      try {
        localStorage.setItem(INDEX, JSON.stringify(body.schools));
      } catch {
        // A full jar must not fail a fetch that already succeeded.
      }
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
      if (slug === chosenSlug()) {
        try {
          localStorage.setItem(SEASON(slug), JSON.stringify(season));
        } catch {
          // A full jar must not fail a fetch that already succeeded.
        }
      }
      return season;
    }
  } catch {
    /* no signal */
  }
  const kept = localStorage.getItem(SEASON(slug));
  if (kept) return JSON.parse(kept) as SchoolSeason;
  throw new Error('no season');
}
