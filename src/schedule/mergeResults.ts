/*
 * Puts scores on the season.
 *
 * The school's calendar feed publishes fixtures and nothing else — no result
 * has ever appeared in it, so the Schedule tab showed a season that was never
 * played and a record stuck on 0-0. joeeitel carries the scores, and the
 * League tab already fetches them, so they are merged onto the schedule here
 * rather than scraped a second time.
 *
 * Pure, and matching two sources by name is exactly the kind of thing that
 * goes quietly wrong, so every rule below is pinned in tests.
 */

/*
 * Extension deliberate, and the one place in src/ that carries one. The build
 * script imports this module directly under Node, which strips the types but
 * resolves imports the way Node does — an extensionless specifier is not found.
 */
import { canonicalOpponent, type Game, type OpponentAliases } from './icalParse.ts';

/** The shape the league build writes, narrowed to what a merge needs. */
export type LeagueResult = {
  date: string;
  home: string;
  away: string;
  result?: { home: number; away: number };
};

/** One of our games as the league prints it: who we played, and the score. */
type Played = { date: string; opponentKey: string; us: number; them: number };

const daysApart = (a: string, b: string): number =>
  Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000;

/**
 * Our played games, from the league's side of the fixture.
 *
 * The league file is the whole conference, so most of it is other people's
 * games. `us` is matched on the name the league prints for us, which is the
 * name it also prints in every fixture — the two always agree because they
 * come off the same page.
 */
const ourPlayedGames = (
  league: LeagueResult[],
  team: string,
  aliases: OpponentAliases,
): Played[] => {
  const mine: Played[] = [];

  for (const g of league) {
    if (!g.result) continue;

    const home = g.home === team;
    if (!home && g.away !== team) continue;

    mine.push({
      date: g.date,
      opponentKey: canonicalOpponent(home ? g.away : g.home, aliases).opponentKey,
      us: home ? g.result.home : g.result.away,
      them: home ? g.result.away : g.result.home,
    });
  }

  return mine;
};

/**
 * The season with scores filled in.
 *
 * Matched on the opponent rather than the date, because the two sources can
 * disagree about a date — a game moves to the Saturday and only one of them
 * says so — but never about who played. Both sides go through the same alias
 * table, so the school the feed calls "Niles McKinley High School" and the
 * league calls "Niles" is one key.
 *
 * The date is the tie-breaker, not the key, and it is needed: a conference
 * school can be played twice in a season. Poland met Girard in week 8 of 2025
 * and again in the regional semi-final three weeks later, and putting the
 * November score on the October fixture would be wrong twice over.
 */
export function mergeResults(
  games: Game[],
  league: LeagueResult[],
  team: string,
  aliases: OpponentAliases = {},
): Game[] {
  const played = ourPlayedGames(league, team, aliases);
  if (played.length === 0) return games;

  return games.map((game) => {
    /*
     * A score already on the game came from the school's own feed, which is
     * closer to the source than a third party reading a table. It stays.
     */
    if (game.result || game.scrimmage) return game;

    const candidates = played.filter((p) => p.opponentKey === game.opponentKey);
    if (candidates.length === 0) return game;

    const match = candidates.reduce((best, p) =>
      daysApart(p.date, game.date) < daysApart(best.date, game.date) ? p : best,
    );

    return { ...game, result: { us: match.us, them: match.them, won: match.us > match.them } };
  });
}

/**
 * The season record — what the top of the screen says.
 *
 * Scrimmages are left out because they are not part of a record, and a
 * fixture nobody has a score for is not a loss. Playoff games are counted:
 * 9-3 is Poland's 2025 season and the November games are three of those
 * twelve, which is how the league prints it too.
 */
export const seasonRecord = (games: Game[]): { won: number; lost: number; played: number } => {
  const results = games.filter((g) => g.result && !g.scrimmage);
  const won = results.filter((g) => g.result!.won).length;
  return { won, lost: results.length - won, played: results.length };
};
