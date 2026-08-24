/*
 * A conference table, folded out of the directory we already have.
 *
 * Poland's League tab scrapes joeeitel's team pages, and a team page is found
 * by a numeric id — which is why a statewide League tab looked like it needed
 * ninety more captures before it could exist. It doesn't. Every one of the
 * 717 committed school files carries that school's whole schedule, and every
 * played game on it names the opponent by directory slug and says who won. So
 * given a list of member slugs, the standings are arithmetic over files that
 * are already on disk: no scraping, no ids, no new pipeline, and it stays
 * current because the directory refreshes itself twice a week.
 *
 * Pure on purpose — the caller fetches, this counts.
 */

import type { SchoolSeason } from '../ohio/stateModel';

export type LeagueRow = {
  slug: string;
  name: string;
  leagueWon: number;
  leagueLost: number;
  overallWon: number;
  overallLost: number;
};

/**
 * Win rate, with "hasn't played" ranked below every real record rather than
 * tied with an 0–3.
 *
 * That is the brief's rule for the league column: a member who has not met
 * anyone in the conference yet belongs at the foot of the table, not level
 * with a team that has lost three times. The same helper does the overall
 * column, where the distinction is only ever a tiebreak between two teams
 * already level on league record.
 */
const rate = (won: number, lost: number): number =>
  won + lost === 0 ? -1 : won / (won + lost);

/**
 * The member list is what the table is keyed on, not the seasons handed in.
 *
 * A member whose file didn't load — a 404 on a slug the seller mistyped, a
 * dead signal partway through — is dropped from the table rather than shown
 * as 0–0, because a row of zeroes is a claim about a season and a missing
 * file is an absence of one. The rest of the conference still renders.
 * Anything in `seasons` that nobody listed as a member is ignored.
 */
export function leagueTable(seasons: SchoolSeason[], members: string[]): LeagueRow[] {
  const inLeague = new Set(members);
  const bySlug = new Map(seasons.map((s) => [s.school.slug, s]));

  const rows: LeagueRow[] = [];

  for (const slug of inLeague) {
    const season = bySlug.get(slug);
    if (!season) continue;

    const row: LeagueRow = {
      slug,
      name: season.school.name,
      leagueWon: 0,
      leagueLost: 0,
      overallWon: 0,
      overallLost: 0,
    };

    for (const game of season.games) {
      // No result is a fixture, not a game. `won` is authoritative: the
      // source never publishes a drawn high-school football game, so there
      // is no third state to carry through the whole table for nobody.
      if (!game.result) continue;
      if (game.result.won) row.overallWon += 1;
      else row.overallLost += 1;

      // A game counts toward the conference only when the other side is also
      // in it — the same fold, over a smaller set of opponents.
      if (game.opponentSlug === null || !inLeague.has(game.opponentSlug)) continue;
      if (game.result.won) row.leagueWon += 1;
      else row.leagueLost += 1;
    }

    rows.push(row);
  }

  return rows.sort((a, b) => {
    const league = rate(b.leagueWon, b.leagueLost) - rate(a.leagueWon, a.leagueLost);
    if (league !== 0) return league;
    const overall = rate(b.overallWon, b.overallLost) - rate(a.overallWon, a.overallLost);
    if (overall !== 0) return overall;
    return a.name.localeCompare(b.name);
  });
}
