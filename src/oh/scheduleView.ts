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

import { isDone, nextGame, type Game, type HeadToHead } from '../schedule/icalParse';
import { seasonRecord } from '../schedule/mergeResults';
import { kickoffAt } from '../ohio/kickoff';
import type { SchoolGame } from '../ohio/stateModel';
import type { FixtureWeather } from './store';
import { keyFor, meetings, type SchoolHistory } from './history';

/** A directory fixture in Poland's shape, with the two things only the directory has. */
export type Fixture = Game & { opponentCity: string; overtime?: string };

/*
 * The directory prints a kickoff as "7pm" beside a date, which isn't a moment;
 * kickoffAt makes it one, in Eastern time, with seven o'clock standing in for a
 * time it can't read. Written out as an instant, so isDone and daysToKickoff
 * read it exactly as they read a calendar feed's.
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

export const recordOf = (fixtures: Fixture[]) => seasonRecord(fixtures);

/** "10 games · 5–3 — tap one for the record against them". No record before a game is played. */
export function summaryLine(fixtures: Fixture[]): string {
  const r = seasonRecord(fixtures);
  const record = r.played > 0 ? ` · ${r.won}–${r.lost}` : '';
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
): HeadToHead => meetings(history, season, opponentKey);

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
  return h.played === 0 ? null : `${h.won}–${h.lost}`;
}

/** "10–2 in 12 meetings since 2011" — the year only when there is more than one meeting. */
export function meetingsLine(h: HeadToHead): { record: string; rest: string } | null {
  if (h.played === 0) return null;
  const since = h.meetings[h.meetings.length - 1]?.date.slice(0, 4);
  return {
    record: `${h.won}–${h.lost}`,
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
