/*
 * The state, turned into the two things the screen asks for: a list of schools
 * to search, and one season per school.
 *
 * The scoreboard is written from the game's point of view — a visitor, a home
 * side and two numbers. A reader is only ever interested in one school, so
 * every game is filed twice, once from each side, with the score turned round
 * to match whichever school is being read.
 */

import type { StateGame, StateSide } from './stateParse';

export type School = { slug: string; name: string; city: string };

export type SchoolGame = {
  week: number;
  date: string;
  kickoff: string;
  home: boolean;
  opponent: string;
  opponentCity: string;
  /** An Ohio school has a page to open; anyone else is a name on a fixture. */
  opponentSlug: string | null;
  result?: { us: number; them: number; won: boolean };
  overtime?: string;
};

export type SchoolSeason = {
  school: School;
  games: SchoolGame[];
  record: { won: number; lost: number; played: number };
};

/**
 * A school's address, from its name and the town it plays in.
 *
 * The town is not decoration. Forty-five school names in Ohio are shared —
 * three Jacksons, two Springfields — and the name alone cannot say which one a
 * reader meant.
 */
export const slugFor = (name: string, city: string): string =>
  `${name}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Only Ohio schools get a page; everyone else is an opponent's name. */
const isOhio = (s: StateSide) => s.state === 'OH';

export function directory(games: StateGame[]): School[] {
  const schools = new Map<string, School>();

  for (const g of games) {
    for (const s of [g.away, g.home]) {
      if (!isOhio(s)) continue;
      const slug = slugFor(s.name, s.city);
      if (!schools.has(slug)) schools.set(slug, { slug, name: s.name, city: s.city });
    }
  }

  // Sorted so the committed file changes only where the season changed.
  return [...schools.values()].sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    if (a.city < b.city) return -1;
    if (a.city > b.city) return 1;
    return 0;
  });
}

export function seasonsBySchool(games: StateGame[]): Map<string, SchoolSeason> {
  const seasons = new Map<string, SchoolSeason>();

  const file = (us: StateSide, them: StateSide, atHome: boolean, g: StateGame) => {
    if (!isOhio(us)) return;

    const slug = slugFor(us.name, us.city);
    const season =
      seasons.get(slug) ??
      ({
        school: { slug, name: us.name, city: us.city },
        games: [],
        record: { won: 0, lost: 0, played: 0 },
      } satisfies SchoolSeason);

    const played = us.score !== null && them.score !== null;

    season.games.push({
      week: g.week,
      date: g.date,
      kickoff: g.kickoff,
      home: atHome,
      opponent: them.name,
      opponentCity: them.city,
      opponentSlug: isOhio(them) ? slugFor(them.name, them.city) : null,
      ...(played
        ? { result: { us: us.score!, them: them.score!, won: us.score! > them.score! } }
        : {}),
      ...(g.overtime ? { overtime: g.overtime } : {}),
    });

    if (played) {
      season.record.played += 1;
      if (us.score! > them.score!) season.record.won += 1;
      else season.record.lost += 1;
    }

    seasons.set(slug, season);
  };

  for (const g of games) {
    file(g.home, g.away, true, g);
    file(g.away, g.home, false, g);
  }

  for (const season of seasons.values()) {
    season.games.sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);
  }

  return seasons;
}
