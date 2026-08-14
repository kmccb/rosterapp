import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { byWeek, standings, toLeagueGames } from './leagueModel';
import { parseTeamPage, type TeamPage } from './leagueParse';

const MEMBERS = ['Poland Seminary', 'Girard', 'Hubbard'];

const page = (name: string, games: TeamPage['games']): TeamPage => ({
  name, record: '', division: 'IV', region: 13, games,
});

const game = (date: string, opponent: string, home: boolean, us?: number, them?: number) => ({
  date, home, opponent, opponentId: 0, opponentRecord: '', playoff: false,
  ...(us === undefined ? {} : { result: { us, them: them! } }),
});

const playoffGame = (date: string, opponent: string, home: boolean, us: number, them: number) => ({
  ...game(date, opponent, home, us, them), playoff: true,
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
      result: { home: 42, away: 14 }, isLeagueGame: true, isPlayoff: false,
    });
  });

  it('does not call a playoff rematch between two members a league game', () => {
    const pages = [page('Poland Seminary', [playoffGame('2026-11-13', 'Hubbard', false, 21, 24)])];
    const games = toLeagueGames(pages, MEMBERS);
    expect(games[0].isPlayoff).toBe(true);
    expect(games[0].isLeagueGame).toBe(false);
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

  /*
   * The one that would have shipped wrong. Poland played Girard twice in 2025:
   * week 8 in the Northeast 8, and again on 14 November in the Division V
   * regional semi-final, which the source marks '#'. Counting the second as a
   * conference game gave 5-2 where the real Northeast 8 record is 5-1. The
   * overall record has to keep both, because 9-3 is the season Poland had.
   */
  it('leaves the November playoff rematch out of the league record but in the overall', () => {
    const html = readFileSync(new URL('./fixtures/team-2025-poland.html', import.meta.url), 'utf8');
    const poland = parseTeamPage(html, 2025);
    const members = [
      'Poland Seminary', 'Girard', 'Hubbard', 'Lakeview',
      'Niles McKinley', 'South Range', 'Struthers',
    ];

    // Both meetings are on the page, and only the later one is a playoff.
    const girard = poland.games.filter((g) => g.opponent === 'Girard');
    expect(girard.map((g) => `${g.date} ${g.playoff}`)).toEqual([
      '2025-10-10 false', '2025-11-14 true',
    ]);

    const [row] = standings([poland], members);
    expect(row.overall).toBe('9-3');
    expect(row.leagueRecord).toBe('5-1');
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

  it('reads alphabetically in the preseason, when nobody has played', () => {
    // Every team 0-0, every percentage equal, so a stable sort would leave the
    // table in the order the pages arrived — which is Poland's schedule order,
    // meaningless to a reader. The season opens in August with exactly this
    // table on screen.
    const pages = [
      page('Poland Seminary', []),
      page('Hubbard', []),
      page('Girard', []),
    ];
    expect(standings(pages, MEMBERS).map((s) => s.name)).toEqual([
      'Girard', 'Hubbard', 'Poland Seminary',
    ]);
  });
});

describe('byWeek', () => {
  it('puts a Thursday and a Saturday in the same football week', () => {
    // 2026-09-17 is a Thursday, 2026-09-19 the Saturday after it.
    const weeks = byWeek([
      { date: '2026-09-17', home: 'A', away: 'B', isLeagueGame: true, isPlayoff: false },
      { date: '2026-09-19', home: 'C', away: 'D', isLeagueGame: true, isPlayoff: false },
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].games).toHaveLength(2);
  });

  it('numbers weeks that have games, and puts the soonest first', () => {
    const weeks = byWeek([
      { date: '2026-09-18', home: 'C', away: 'D', isLeagueGame: true, isPlayoff: false },
      { date: '2026-08-21', home: 'A', away: 'B', isLeagueGame: true, isPlayoff: false },
    ]);
    // Weeks are numbered by position among weeks that actually have games —
    // the source gives no season start date, so numbering the empty ones would
    // be invention.
    expect(weeks.map((w) => w.week)).toEqual([1, 2]);
    // Fed in newest-first on purpose: the order out is the calendar's, not the
    // order the games happened to arrive in.
    expect(weeks[0].games[0].date).toBe('2026-08-21');
    expect(weeks[1].games[0].date).toBe('2026-09-18');
  });
});
