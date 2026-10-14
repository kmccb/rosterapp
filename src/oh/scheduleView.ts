/*
 * The arithmetic behind a paid school's Schedule tab, kept apart from the
 * drawing so it can be tested without a browser.
 *
 * Poland's screen works on the calendar feed's Game shape, and its helpers in
 * src/schedule/icalParse.ts (which game is next, how many sleeps until it, the
 * record against an opponent) are pure, so the directory's fixtures are turned
 * into that shape once here and the same helpers do the rest. That is what
 * keeps the two screens agreeing about when a game is over.
 */

import { isDone, nextGame, type Game } from '../schedule/icalParse';
import { clockOf, kickoffAt } from '../ohio/kickoff';
import type { SchoolGame } from '../ohio/stateModel';
import type { FixtureWeather } from './store';
import { keyFor, meetings, outcome, type HeadToHeadRecord, type SchoolHistory } from './history';

/**
 * A directory fixture in Poland's shape, with what only the directory has —
 * and whether its kickoff time was printed or is kickoffAt's seven o'clock.
 */
export type Fixture = Game & { opponentCity: string; overtime?: string; timeKnown: boolean };

/*
 * The directory prints a kickoff as "7pm" beside a date, which isn't a moment;
 * kickoffAt makes it one, in Eastern time, with seven o'clock standing in for a
 * time it can't read. Written out as an instant, so isDone and daysToKickoff
 * read it exactly as they read a calendar feed's.
 *
 * The stand-in hour is good enough to count down to, but not to print: a
 * playoff game posted as "TBA" would read as a promise of seven o'clock. So the
 * fixture says whether its time was printed, and only a printed one is shown.
 *
 * The opponent's key is the one history.ts files its rows under, so a row in
 * this list finds its own meetings in the history file.
 */
export function asFixtures(season: SchoolGame[]): Fixture[] {
  return [...season]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => ({
      date: g.date,
      kickoff: kickoffAt(g).toISOString(),
      opponent: g.opponent,
      opponentKey: keyFor(g.opponentSlug, g.opponent),
      home: g.home,
      scrimmage: false,
      result: g.result,
      opponentCity: g.opponentCity,
      overtime: g.overtime,
      timeKnown: clockOf(g.kickoff) !== null,
    }));
}

/** The next game not yet over, the same rule as Poland's card. */
export const nextFixture = (fixtures: Fixture[], now: Date): Fixture | undefined =>
  nextGame(fixtures, now) as Fixture | undefined;

/**
 * What is left, then what has happened, most recent first — Poland's two
 * halves, for Poland's reason: the next game and the last result end up side
 * by side near the top of the screen.
 */
export function scheduleSections(
  fixtures: Fixture[],
  now: Date,
): Array<{ label: string; done: boolean; games: Fixture[] }> {
  const coming: Fixture[] = [];
  const played: Fixture[] = [];
  for (const g of fixtures) (isDone(g, now) ? played : coming).push(g);
  return [
    { label: 'Coming up', done: false, games: coming },
    { label: 'Played', done: true, games: played.reverse() },
  ].filter((s) => s.games.length > 0);
}

export type Tally = { won: number; lost: number; tied: number; played: number };

/*
 * A season's record, ties and all. Poland's seasonRecord calls anything not won
 * a loss, which is right for a calendar feed that never carries a tie and wrong
 * for a scoreboard that occasionally does.
 */
export function recordOf(games: Game[]): Tally {
  const o = games.map(outcome).filter((x) => x !== null);
  const won = o.filter((x) => x === 'W').length;
  const lost = o.filter((x) => x === 'L').length;
  const tied = o.filter((x) => x === 'T').length;
  return { won, lost, tied, played: o.length };
}

/** "5–3", or "5–3–1" when there has been a tie — the third figure only when it says something. */
export const recordText = (r: Pick<Tally, 'won' | 'lost' | 'tied'>): string =>
  r.tied > 0 ? `${r.won}–${r.lost}–${r.tied}` : `${r.won}–${r.lost}`;

/** "10 games · 5–3 — tap one for the record against them". No record before a game is played. */
export function summaryLine(fixtures: Fixture[]): string {
  const r = recordOf(fixtures);
  const record = r.played > 0 ? ` · ${recordText(r)}` : '';
  const games = `${fixtures.length} ${fixtures.length === 1 ? 'game' : 'games'}`;
  return `${games}${record} — tap one for the record against them`;
}

/**
 * Every meeting with one opponent: the history file's and this season's.
 * With no history file this is this season's scored games alone.
 */
export const meetingsWith = (
  history: SchoolHistory | null,
  season: SchoolGame[],
  opponentKey: string,
): HeadToHeadRecord => meetings(history, season, opponentKey);

/*
 * The card's "N–M all-time", only when there is a history file to make it
 * all-time. Without one the only meetings are this season's, and calling a
 * single game this year an all-time record would be the card claiming
 * something it doesn't know.
 */
export function allTimeRecord(
  history: SchoolHistory | null,
  season: SchoolGame[],
  opponentKey: string,
): string | null {
  if (!history) return null;
  const h = meetings(history, season, opponentKey);
  return h.played === 0 ? null : recordText(h);
}

/** "10–2 in 12 meetings since 2011" — the year only when there is more than one meeting. */
export function meetingsLine(h: HeadToHeadRecord): { record: string; rest: string } | null {
  if (h.played === 0) return null;
  const since = h.meetings[h.meetings.length - 1]?.date.slice(0, 4);
  return {
    record: recordText(h),
    rest:
      `in ${h.played} ${h.played === 1 ? 'meeting' : 'meetings'}` +
      (since && h.played > 1 ? ` since ${since}` : ''),
  };
}

/*
 * The forecast belongs on the card only when it names the card's game. The
 * refresh and this page each work out "next" for themselves, and for a day
 * after a Friday whose score isn't posted yet they can disagree; then nothing
 * prints, rather than one game's weather under another's name.
 */
export const forecastFor = (
  weather: FixtureWeather | null,
  game: Fixture | undefined,
): FixtureWeather | null => (weather && game && weather.date === game.date ? weather : null);
