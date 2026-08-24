/**
 * When a directory fixture actually kicks off, and which one is next.
 *
 * Poland's fixtures come from a calendar feed, where a kickoff is an exact
 * instant with a timezone written on it. The directory's come from a scoreboard
 * page, where it is the string "7pm" beside a date — a looser thing that still
 * has to become a moment before a forecast can be asked for.
 *
 * Here rather than beside the script that uses it, for the reason
 * `src/schedule/icalParse.ts` is: a pure module under src/ is one the test
 * suite runs, and this is exactly the code that goes wrong quietly. A time
 * written in some shape nobody anticipated would drop a paying school out of
 * the weather file, and nothing would say so until a Friday.
 *
 * `scripts/paid-weather.mjs` imports it directly, the way
 * `scripts/build-teams.mjs` imports the iCal parser.
 */

import type { SchoolGame } from './stateModel';

/*
 * Ohio high school football kicks off at seven on a Friday, near enough
 * universally. So a fixture whose time is missing, blank, "TBA", or written in
 * a shape this has never seen gets seven o'clock rather than being skipped
 * altogether. The forecast is hourly and the game is at night either way —
 * being an hour out is a much smaller error than a school that paid for a page
 * having no forecast on it.
 */
const DEFAULT_HOUR = 19;

export type Clock = { hour: number; minute: number };

/** "7pm", "7:30 PM", "10am" — and null for anything that is not a time. */
export const clockOf = (kickoff: string | undefined | null): Clock | null => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(String(kickoff ?? '').trim());
  if (!m) return null;

  let hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  const minute = Number(m[2] ?? 0);
  if (minute > 59) return null;

  // Noon and midnight are the two the twelve-hour clock gets backwards: 12am is
  // hour zero and 12pm is hour twelve, so twelve becomes zero before the pm
  // half-day is added rather than after.
  if (hour === 12) hour = 0;
  return { hour: m[3].toLowerCase() === 'p' ? hour + 12 : hour, minute };
};

/**
 * What America/New_York's offset from UTC was on a given day, as "-04:00".
 *
 * The scoreboard prints local time and says so nowhere, and the pass that reads
 * it runs on a runner set to UTC. Asking Intl rather than hard-coding the two
 * offsets is the difference between a forecast that is also right in November
 * and one that is an hour out for four months of the year. Noon UTC is the
 * probe, so that a daylight-saving changeover — which happens at two in the
 * morning — cannot land the probe on the wrong side of itself.
 */
export const easternOffset = (date: string): string => {
  const shown = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;

  // "GMT-04:00" normally. A missing or unexpected part has to still produce a
  // valid offset rather than an Invalid Date further down; standard time is
  // the safer of the two to be wrong with, being the one in football's second
  // half of the season.
  const m = /GMT([+-]\d{2}:\d{2})/.exec(shown ?? '');
  return m ? m[1] : '-05:00';
};

/** A fixture's kickoff as a moment, Eastern, with seven o'clock as the floor. */
export const kickoffAt = (game: Pick<SchoolGame, 'date' | 'kickoff'>): Date => {
  const { hour, minute } = clockOf(game.kickoff) ?? { hour: DEFAULT_HOUR, minute: 0 };
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${game.date}T${hh}:${mm}:00${easternOffset(game.date)}`);
};

/*
 * Three and a half hours, the same allowance Poland's schedule makes: long
 * enough that a game which started then is over, with room for a weather delay
 * rather than calling a game finished while it is still being played.
 */
const RUNTIME_MS = 3.5 * 60 * 60 * 1000;

/**
 * The next fixture worth a forecast: not played, and not already over.
 *
 * "Not played" alone is not enough. A score the scoreboard has not posted yet
 * would pin the forecast to a game that finished on Friday and hold it there
 * all week — wrong, and beyond the forecast's range anyway. A game that has
 * come and gone is stepped over, and the page, which does list a scoreless
 * fixture as still coming up, then shows no forecast on it: the forecast it
 * draws has to name the same date.
 */
export const nextFixture = (
  games: SchoolGame[],
  now: Date = new Date(),
): SchoolGame | undefined =>
  [...games]
    .filter((g) => !g.result)
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((g) => kickoffAt(g).getTime() + RUNTIME_MS >= now.getTime());
