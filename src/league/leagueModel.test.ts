import { describe, expect, it } from 'vitest';
import { byWeek, standings, toLeagueGames } from './leagueModel';
import type { TeamPage } from './leagueParse';

const MEMBERS = ['Poland Seminary', 'Girard', 'Hubbard'];

const page = (name: string, games: TeamPage['games']): TeamPage => ({
  name, record: '', division: 'IV', region: 13, games,
});

const game = (date: string, opponent: string, home: boolean, us?: number, them?: number) => ({
  date, home, opponent, opponentId: 0, opponentRecord: '',
  ...(us === undefined ? {} : { result: { us, them: them! } }),
});

describe('toLeagueGames', () => {
  it('collapses one game that appears on both teams pages', () => {
    const pages = [
      page('Poland Seminary', [game('2026-09-18', 'Hubbard', true, 42, 14)]),
      page('Hubbard', [game('2026-09-18', 'Poland Seminary', false, 14, 42)]),
    ];
    const games = toLeagueGames(pages, MEMBERS);
    expect(games).toHaveLength(1);
    expect(games[0]).toEqual({
      date: '2026-09-18', home: 'Poland Seminary', away: 'Hubbard',
      result: { home: 42, away: 14 }, isLeagueGame: true,
    });
  });

  it('keeps a game against an outsider, and says it is not a league game', () => {
    const pages = [page('Poland Seminary', [game('2026-08-21', 'Salem', true)])];
    const games = toLeagueGames(pages, MEMBERS);
    expect(games).toHaveLength(1);
    expect(games[0].isLeagueGame).toBe(false);
    expect(games[0].result).toBeUndefined();
  });
});

describe('standings', () => {
  it('counts only conference opponents in the league record', () => {
    const pages = [
      page('Poland Seminary', [
        game('2026-08-21', 'Salem', true, 48, 26),      // outsider, ignored
        game('2026-09-18', 'Hubbard', true, 42, 14),    // league win
        game('2026-10-09', 'Girard', true, 28, 29),     // league loss
        game('2026-10-30', 'Lakeview', true),           // unplayed, ignored
      ]),
    ];
    const [poland] = standings(pages, MEMBERS);
    expect(poland).toEqual({ name: 'Poland Seminary', overall: '2-1', leagueRecord: '1-1' });
  });

  it('sorts on league record, then overall', () => {
    const pages = [
      page('Hubbard', [game('2026-09-18', 'Poland Seminary', false, 14, 42)]),
      page('Poland Seminary', [game('2026-09-18', 'Hubbard', true, 42, 14)]),
    ];
    expect(standings(pages, MEMBERS).map((s) => s.name)).toEqual(['Poland Seminary', 'Hubbard']);
  });

  it('ranks on winning percentage, not on games won minus games lost', () => {
    // Girard is 2-0 and Poland Seminary is 5-3: both are +2 on win/loss
    // differential, and since every game below is within the league, their
    // overall differentials tie at +2 too — a differential sort has nothing
    // left to break the tie and falls back to input order. Only winning
    // percentage tells them apart: Girard's 100% belongs above Poland
    // Seminary's 62.5%, regardless of which page came first.
    const pages = [
      page('Poland Seminary', [
        game('2026-09-04', 'Girard', true, 20, 10),
        game('2026-09-11', 'Hubbard', true, 20, 10),
        game('2026-09-18', 'Girard', true, 20, 10),
        game('2026-09-25', 'Hubbard', true, 10, 20),
        game('2026-10-02', 'Girard', true, 10, 20),
        game('2026-10-09', 'Hubbard', true, 10, 20),
        game('2026-10-16', 'Girard', true, 20, 10),
        game('2026-10-23', 'Hubbard', true, 20, 10),
      ]),
      page('Girard', [
        game('2026-08-21', 'Hubbard', true, 20, 0),
        game('2026-08-28', 'Hubbard', true, 20, 0),
      ]),
    ];
    const table = standings(pages, MEMBERS);
    expect(table.map((t) => `${t.name} ${t.leagueRecord}`)).toEqual([
      'Girard 2-0', 'Poland Seminary 5-3',
    ]);
  });
});

describe('byWeek', () => {
  it('puts a Thursday and a Saturday in the same football week', () => {
    // 2026-09-17 is a Thursday, 2026-09-19 the Saturday after it.
    const weeks = byWeek([
      { date: '2026-09-17', home: 'A', away: 'B', isLeagueGame: true },
      { date: '2026-09-19', home: 'C', away: 'D', isLeagueGame: true },
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].games).toHaveLength(2);
  });

  it('numbers weeks that have games, and puts the newest first', () => {
    const weeks = byWeek([
      { date: '2026-08-21', home: 'A', away: 'B', isLeagueGame: true },
      { date: '2026-09-18', home: 'C', away: 'D', isLeagueGame: true },
    ]);
    // Two weeks apart on the calendar, but weeks are numbered by position
    // among weeks that actually have games — the source gives no season start
    // date, so numbering the empty ones would be invention. Newest first.
    expect(weeks.map((w) => w.week)).toEqual([2, 1]);
    expect(weeks[0].games[0].date).toBe('2026-09-18');
  });
});
