import { describe, expect, it } from 'vitest';
import type { SchoolGame, SchoolSeason } from '../ohio/stateModel';
import { leagueTable } from './leagueTable';

/*
 * Hand-built seasons, never a fetch. The shape is the directory's own —
 * `opponentSlug` plus `result.won` on every played game — so a change to what
 * the state parser writes fails here rather than on a phone at a ground.
 */

const played = (opponentSlug: string | null, won: boolean): SchoolGame => ({
  week: 1,
  date: '2026-08-21',
  kickoff: '7pm',
  home: true,
  opponent: opponentSlug ?? 'Out of state',
  opponentCity: 'Town',
  opponentSlug,
  result: { us: won ? 28 : 7, them: won ? 7 : 28, won },
});

const upcoming = (opponentSlug: string | null): SchoolGame => ({
  week: 9,
  date: '2026-10-16',
  kickoff: '7pm',
  home: false,
  opponent: opponentSlug ?? 'Out of state',
  opponentCity: 'Town',
  opponentSlug,
});

const season = (slug: string, name: string, games: SchoolGame[]): SchoolSeason => ({
  school: { slug, name, city: 'Town' },
  games,
  record: {
    won: games.filter((g) => g.result?.won).length,
    lost: games.filter((g) => g.result && !g.result.won).length,
    played: games.filter((g) => g.result).length,
  },
});

describe('leagueTable', () => {
  const members = ['ash', 'birch', 'cedar'];

  // Ash beat Birch and Cedar; Birch beat Cedar. The round robin every other
  // case below is a variation on.
  const ash = season('ash', 'Ash', [played('birch', true), played('cedar', true)]);
  const birch = season('birch', 'Birch', [played('ash', false), played('cedar', true)]);
  const cedar = season('cedar', 'Cedar', [played('ash', false), played('birch', false)]);

  it('counts a round robin from both sides of every game', () => {
    const rows = leagueTable([ash, birch, cedar], members);

    expect(rows.map((r) => r.slug)).toEqual(['ash', 'birch', 'cedar']);
    expect(rows[0]).toEqual({
      slug: 'ash',
      name: 'Ash',
      leagueWon: 2,
      leagueLost: 0,
      overallWon: 2,
      overallLost: 0,
    });
    expect(rows[1]).toMatchObject({ leagueWon: 1, leagueLost: 1, overallWon: 1, overallLost: 1 });
    expect(rows[2]).toMatchObject({ leagueWon: 0, leagueLost: 2, overallWon: 0, overallLost: 2 });
  });

  it('lifts the overall record with a non-member win, and leaves the league record alone', () => {
    const rows = leagueTable(
      [season('ash', 'Ash', [...ash.games, played('oak', true), played(null, true)]), birch, cedar],
      members,
    );

    // Oak is a real Ohio school with a slug; the null is an out-of-state side
    // the source gave no page to. Neither is in this conference, so both
    // belong in the overall column only.
    expect(rows[0]).toMatchObject({ leagueWon: 2, leagueLost: 0, overallWon: 4, overallLost: 0 });
  });

  it('drops a member whose season never loaded, and still renders the rest', () => {
    const rows = leagueTable([ash, cedar], [...members, 'dell']);

    expect(rows.map((r) => r.slug)).toEqual(['ash', 'cedar']);
    // Ash's win over Birch still counts: the game happened, and Birch is
    // still a member — it is only Birch's own row that has nothing to show.
    expect(rows[0]).toMatchObject({ leagueWon: 2, leagueLost: 0 });
  });

  it('ignores a season nobody listed as a member', () => {
    const rows = leagueTable([ash, birch, cedar, season('oak', 'Oak', [])], members);

    expect(rows.map((r) => r.slug)).toEqual(['ash', 'birch', 'cedar']);
  });

  it('breaks a tie on league record by overall record, then by name', () => {
    // Both level at 1–1 in the conference. Birch is 2–1 overall, Elm 1–1, and
    // Fir is 1–1 as well — so Birch leads on the overall column and the two
    // that are level on both fall alphabetically.
    const tied = ['birch', 'elm', 'fir'];
    const rows = leagueTable(
      [
        season('birch', 'Birch', [played('elm', true), played('fir', false), played('oak', true)]),
        season('fir', 'Fir', [played('birch', true), played('elm', false)]),
        season('elm', 'Elm', [played('birch', false), played('fir', true)]),
      ],
      tied,
    );

    expect(rows.map((r) => r.name)).toEqual(['Birch', 'Elm', 'Fir']);
    expect(rows.map((r) => [r.leagueWon, r.leagueLost])).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
  });

  it('sorts a member with no league games last, but still shows it', () => {
    // Dogwood has played — and won — but only outside the conference, so it
    // sits below a member that has lost every league game it has played.
    const rows = leagueTable(
      [ash, birch, cedar, season('dogwood', 'Dogwood', [played('oak', true), played('oak', true)])],
      [...members, 'dogwood'],
    );

    expect(rows.map((r) => r.slug)).toEqual(['ash', 'birch', 'cedar', 'dogwood']);
    expect(rows[3]).toMatchObject({ leagueWon: 0, leagueLost: 0, overallWon: 2, overallLost: 0 });
  });

  it('ignores fixtures that have not been played', () => {
    const rows = leagueTable(
      [season('ash', 'Ash', [played('birch', true), upcoming('cedar'), upcoming(null)]), birch],
      members,
    );

    expect(rows[0]).toMatchObject({ leagueWon: 1, leagueLost: 0, overallWon: 1, overallLost: 0 });
  });

  it('counts the games, not the season’s own record line', () => {
    // The record line is the state parser's summary of the same games. If the
    // two ever disagree the games are the truth — and this pins that nobody
    // "simplifies" the overall column into reading the summary instead, which
    // would quietly count games this conference never played.
    const lying = { ...ash, record: { won: 99, lost: 99, played: 198 } };

    expect(leagueTable([lying], members)[0]).toMatchObject({ overallWon: 2, overallLost: 0 });
  });

  it('gives an empty table for an empty conference', () => {
    expect(leagueTable([ash, birch], [])).toEqual([]);
  });
});
