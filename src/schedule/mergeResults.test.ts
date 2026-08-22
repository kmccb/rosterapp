import { readFileSync } from 'node:fs';
import { canonicalOpponent, type Game } from './icalParse';
import { mergeResults, seasonRecord, type LeagueResult } from './mergeResults';
import { parseTeamPage } from '../league/leagueParse';
import { toLeagueGames } from '../league/leagueModel';

const ALIASES = {
  mckinley: 'Niles McKinley',
  niles: 'Niles McKinley',
  nilesmckinley: 'Niles McKinley',
};

/** A fixture as the calendar feed produces one — no score, because it never has one. */
const fixture = (date: string, opponent: string, extra: Partial<Game> = {}): Game => ({
  date,
  kickoff: `${date}T23:00:00.000Z`,
  ...canonicalOpponent(opponent, ALIASES),
  home: true,
  scrimmage: false,
  ...extra,
});

describe('mergeResults', () => {
  it('puts the league’s score on the matching fixture, both ways round', () => {
    const games = [fixture('2026-08-21', 'Salem'), fixture('2026-09-11', 'Canfield', { home: false })];
    const league: LeagueResult[] = [
      { date: '2026-08-21', home: 'Poland Seminary', away: 'Salem', result: { home: 48, away: 26 } },
      { date: '2026-09-11', home: 'Canfield', away: 'Poland Seminary', result: { home: 35, away: 13 } },
    ];

    const merged = mergeResults(games, league, 'Poland Seminary', ALIASES);

    expect(merged[0].result).toEqual({ us: 48, them: 26, won: true });
    // Away: we are the away score, so 13 is ours and it is a loss.
    expect(merged[1].result).toEqual({ us: 13, them: 35, won: false });
  });

  it('matches a school the two sources spell differently', () => {
    // The feed says "Niles McKinley High School"; the league prints "Niles".
    const games = [fixture('2026-10-02', 'Niles McKinley High School')];
    const league: LeagueResult[] = [
      { date: '2026-10-02', home: 'Poland Seminary', away: 'Niles', result: { home: 42, away: 6 } },
    ];

    expect(mergeResults(games, league, 'Poland Seminary', ALIASES)[0].result).toEqual({
      us: 42,
      them: 6,
      won: true,
    });
  });

  it('still matches when the two sources disagree about the date', () => {
    // A game moved to the Saturday and only one source says so. Who played is
    // the thing both agree on, so that is what the match is made on.
    const games = [fixture('2026-10-09', 'Girard')];
    const league: LeagueResult[] = [
      { date: '2026-10-10', home: 'Poland Seminary', away: 'Girard', result: { home: 28, away: 29 } },
    ];

    expect(mergeResults(games, league, 'Poland Seminary', ALIASES)[0].result).toEqual({
      us: 28,
      them: 29,
      won: false,
    });
  });

  /*
   * The case the date tie-break exists for. Poland played Girard in week 8 of
   * 2025 and again in the regional semi-final five weeks later, losing both by
   * a point. Putting November's score on October's fixture would be wrong
   * twice.
   */
  it('tells two meetings with the same school apart by date', () => {
    const games = [fixture('2025-10-10', 'Girard'), fixture('2025-11-14', 'Girard', { home: false })];
    const league: LeagueResult[] = [
      { date: '2025-10-10', home: 'Girard', away: 'Poland Seminary', result: { home: 29, away: 28 } },
      { date: '2025-11-14', home: 'Girard', away: 'Poland Seminary', result: { home: 28, away: 27 } },
    ];

    const merged = mergeResults(games, league, 'Poland Seminary', ALIASES);

    expect(merged[0].result).toEqual({ us: 28, them: 29, won: false });
    expect(merged[1].result).toEqual({ us: 27, them: 28, won: false });
  });

  it('leaves a fixture the league has no score for alone', () => {
    const games = [fixture('2026-08-28', 'Kirtland')];
    const league: LeagueResult[] = [
      { date: '2026-08-28', home: 'Poland Seminary', away: 'Kirtland' },
    ];

    expect(mergeResults(games, league, 'Poland Seminary', ALIASES)[0].result).toBeUndefined();
  });

  it('invents nothing for a fixture the league does not carry', () => {
    const games = [fixture('2026-08-28', 'Kirtland')];
    expect(mergeResults(games, [], 'Poland Seminary', ALIASES)[0].result).toBeUndefined();
  });

  it('never scores a scrimmage', () => {
    const games = [fixture('2026-08-13', 'Louisville', { scrimmage: true })];
    const league: LeagueResult[] = [
      { date: '2026-08-13', home: 'Poland Seminary', away: 'Louisville', result: { home: 20, away: 7 } },
    ];

    expect(mergeResults(games, league, 'Poland Seminary', ALIASES)[0].result).toBeUndefined();
  });

  it('does not overwrite a score the school’s own feed carried', () => {
    // If ScheduleStar ever starts publishing results, the school is closer to
    // the source than a third party reading a table.
    const games = [fixture('2026-08-21', 'Salem', { result: { us: 48, them: 26, won: true } })];
    const league: LeagueResult[] = [
      { date: '2026-08-21', home: 'Poland Seminary', away: 'Salem', result: { home: 7, away: 0 } },
    ];

    expect(mergeResults(games, league, 'Poland Seminary', ALIASES)[0].result).toEqual({
      us: 48,
      them: 26,
      won: true,
    });
  });

  it('ignores other people’s games', () => {
    const games = [fixture('2026-09-18', 'Hubbard')];
    const league: LeagueResult[] = [
      { date: '2026-09-18', home: 'Girard', away: 'Lakeview', result: { home: 41, away: 0 } },
      { date: '2026-09-18', home: 'Poland Seminary', away: 'Hubbard', result: { home: 42, away: 14 } },
    ];

    expect(mergeResults(games, league, 'Poland Seminary', ALIASES)[0].result).toEqual({
      us: 42,
      them: 14,
      won: true,
    });
  });
});

/*
 * The whole path, on the real thing: joeeitel's saved 2025 Poland page through
 * the parser and the league model, merged onto a calendar-shaped season. 2025
 * is finished, so every fixture has a score and the record is knowable — the
 * page's own caption says 9-3.
 */
describe('a finished season, end to end', () => {
  const page = parseTeamPage(
    readFileSync('src/league/fixtures/team-2025-poland.html', 'utf8'),
    2025,
  );
  const league = toLeagueGames([page], ['Poland Seminary']);

  const season: Game[] = [
    fixture('2025-08-08', 'Streetsboro', { scrimmage: true }),
    ...page.games.map((g) =>
      fixture(g.date, g.opponent, { home: g.home }),
    ),
  ];

  const merged = mergeResults(season, league, 'Poland Seminary', ALIASES);

  it('scores every fixture that was played', () => {
    const unplayed = merged.filter((g) => !g.scrimmage && !g.result);
    expect(unplayed).toEqual([]);
  });

  it('arrives at the record the page prints in its own caption', () => {
    const { won, lost } = seasonRecord(merged);
    expect(`${won}-${lost}`).toBe(page.record);
    expect(page.record).toBe('9-3');
  });

  it('gets the two one-point Girard losses on the right nights', () => {
    const girard = merged.filter((g) => g.opponentKey === 'girard');
    expect(girard).toHaveLength(2);
    expect(girard[0]).toMatchObject({ date: '2025-10-10', result: { us: 28, them: 29, won: false } });
    expect(girard[1]).toMatchObject({ date: '2025-11-14', result: { us: 27, them: 28, won: false } });
  });
});

describe('seasonRecord', () => {
  it('counts played games only, and never a scrimmage', () => {
    const games = [
      fixture('2026-08-13', 'Louisville', { scrimmage: true, result: { us: 20, them: 7, won: true } }),
      fixture('2026-08-21', 'Salem', { result: { us: 48, them: 26, won: true } }),
      fixture('2026-09-11', 'Canfield', { result: { us: 13, them: 35, won: false } }),
      fixture('2026-09-18', 'Hubbard'),
    ];

    expect(seasonRecord(games)).toEqual({ won: 1, lost: 1, played: 2 });
  });

  it('is 0-0 before a ball is thrown', () => {
    expect(seasonRecord([fixture('2026-08-21', 'Salem')])).toEqual({ won: 0, lost: 0, played: 0 });
  });
});
