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
import type { Weather } from '../schedule/weather';
import { isDemo } from './demo';
import type { LeagueRow } from './leagueTable';

const CHOSEN = 'oh.school';
const INDEX = 'oh.index';
const SEASON = (slug: string) => `oh.season.${slug}`;
const SPORT = (slug: string) => `oh.sport.${slug}`;
const LEAGUE = (slug: string) => `oh.league.${slug}`;
const WEATHER = (slug: string) => `oh.weather.${slug}`;

/**
 * A forecast with the fixture it is for written on it.
 *
 * The date is what keeps a stale file honest. `scripts/paid-weather.mjs` writes
 * the weather for whichever game is next when it runs, and the page draws it on
 * the fixture naming that same day and on no other — so a refresh that failed
 * to run leaves last week's forecast attached to last week's game, where
 * nothing will ever show it, rather than on tonight's.
 */
export type FixtureWeather = Weather & { date: string };

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
    // Every jar the old school filled: its season above, the pre-sport
    // roster key, one roster per sport, the live-sports list, and the
    // remembered sport. Prefix sweep rather than a list of names, so a
    // future jar under the same prefix cannot be forgotten here. Keys
    // inlined rather than imported from rosterStore, which imports
    // chosenSlug from here.
    for (const key of Object.keys(localStorage)) {
      if (key === `oh.roster.${prev}` || key.startsWith(`oh.roster.${prev}.`)) {
        localStorage.removeItem(key);
      }
    }
    localStorage.removeItem(`oh.livesports.${prev}`);
    localStorage.removeItem(SPORT(prev));
    localStorage.removeItem(LEAGUE(prev));
    localStorage.removeItem(WEATHER(prev));
  }
  localStorage.setItem(CHOSEN, slug);
};

export const forget = (): void => localStorage.removeItem(CHOSEN);

/*
 * The sport this reader last opened at this school, so a basketball parent
 * lands on basketball next time.
 *
 * The demo remembers nothing, and both halves of that are the same decision.
 * The hub — six bands in the school's own colors — is the screen the demo
 * exists to open on, and a seller who tapped Volleyball to show a prospect
 * would otherwise hand the next prospect a volleyball roster. It would also
 * leave a key behind for ever: choose()'s sweep evicts the school a reader
 * was following, and nobody follows the demo. Because the demo's slug is
 * Poland's own real one, rememberLeagueTable below checks the same guard —
 * otherwise a phone that had followed Poland on /oh/ before opening the demo
 * would let the demo overwrite Poland's own kept league table.
 */
export const chosenSport = (slug: string): string | null => {
  if (isDemo()) return null;
  return localStorage.getItem(SPORT(slug));
};

export const rememberSport = (slug: string, sport: string | null): void => {
  if (isDemo()) return;
  if (sport) localStorage.setItem(SPORT(slug), sport);
  else localStorage.removeItem(SPORT(slug));
};

/*
 * The League tab's kept copy.
 *
 * The tab is built from nine or ten other schools' seasons, and loadSeason
 * keeps a copy of exactly one school — the followed one, because caching every
 * school anybody browsed would fill the jar with counties nobody reopens. So
 * the member seasons are network-only, and at a ground with no signal the tab
 * would resolve one season and say the conference hadn't reported, while every
 * other tab served happily from cache. That is the one place this app is not
 * allowed to fail.
 *
 * What is kept is the computed table rather than the seasons behind it: it is
 * a kilobyte instead of thirty, and it is exactly what the tab draws. Stored
 * for the followed school only, on the same rule as the season above it, and
 * stamped with the member list it was computed from so that a conference the
 * seller has since changed cannot be served under the new one's name.
 */
const isLeagueRow = (v: unknown): v is LeagueRow => {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.slug !== 'string' || typeof r.name !== 'string') return false;
  return (['leagueWon', 'leagueLost', 'overallWon', 'overallLost'] as const).every(
    (k) => typeof r[k] === 'number' && Number.isFinite(r[k]),
  );
};

/** The kept table, or null — for a different conference, or for junk. */
export const keptLeagueTable = (slug: string, members: string): LeagueRow[] | null => {
  if (!members) return null;
  try {
    const raw = localStorage.getItem(LEAGUE(slug));
    if (!raw) return null;
    const kept = JSON.parse(raw) as { members?: unknown; rows?: unknown };
    if (kept?.members !== members) return null;
    return Array.isArray(kept.rows) && kept.rows.every(isLeagueRow) ? (kept.rows as LeagueRow[]) : null;
  } catch {
    return null;
  }
};

export const rememberLeagueTable = (slug: string, members: string, rows: LeagueRow[]): void => {
  if (isDemo()) return;
  if (slug !== chosenSlug()) return;
  try {
    localStorage.setItem(LEAGUE(slug), JSON.stringify({ members, rows }));
  } catch {
    // A full jar must not fail the fetch that already succeeded.
  }
};

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
  // The demo page takes no branch here: its slug is Poland's real one, so the
  // season it reads — and every conference member's — is the directory's own.

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

/*
 * The weather at kickoff.
 *
 * One committed file holds a line for each school that pays for a page, so
 * this is a couple of hundred bytes however many schools are in it. It is
 * fetched rather than computed and it is fetched from this origin: the
 * forecast itself was asked for once, in the refresh workflow, precisely so
 * that nobody reading the site has to ask a weather service anything. See
 * scripts/paid-weather.mjs.
 *
 * Junk is treated as nothing. The file is small enough to hand-edit and one
 * missing field would otherwise print "NaN°" next to a school's name on the
 * one screen its parents opened.
 */
const isFixtureWeather = (v: unknown): v is FixtureWeather => {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Record<string, unknown>;
  if (typeof w.date !== 'string' || typeof w.day !== 'boolean' || typeof w.at !== 'string') {
    return false;
  }
  return (['code', 'tempF', 'precipChance', 'windMph'] as const).every(
    (k) => typeof w[k] === 'number' && Number.isFinite(w[k]),
  );
};

/** Network first, then whatever was kept — the same rule as the season. */
export async function loadWeather(slug: string): Promise<FixtureWeather | null> {
  try {
    const res = await fetch(`/oh/weather.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const all = (await res.json()) as Record<string, unknown>;
      const mine = isFixtureWeather(all?.[slug]) ? (all[slug] as FixtureWeather) : null;
      // Only the followed school's copy is kept, as with the season — and an
      // answer of "no forecast for this school" clears it, so a school that
      // stops paying, or whose next game has gone past the forecast's range,
      // does not keep serving one out of a phone for ever.
      if (slug === chosenSlug()) {
        try {
          if (mine) localStorage.setItem(WEATHER(slug), JSON.stringify(mine));
          else localStorage.removeItem(WEATHER(slug));
        } catch {
          // A full jar must not fail a fetch that already succeeded.
        }
      }
      return mine;
    }
  } catch {
    /* no signal */
  }
  try {
    const kept = localStorage.getItem(WEATHER(slug));
    const parsed = kept ? (JSON.parse(kept) as unknown) : null;
    return isFixtureWeather(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
