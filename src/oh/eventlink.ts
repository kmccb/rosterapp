/*
 * Reads a school's Eventlink calendar into the schedule rows the paid page
 * draws.
 *
 * Eventlink is what Poland's athletic office actually types into, and its
 * iCal export is the one place every sport's varsity schedule exists in a
 * shape a program can read — the directory scrapes football and nothing else.
 * It publishes fixtures only, never scores.
 *
 * Pure, and pinned to a captured feed in ./fixtures, the same bargain every
 * parser in this repo makes: a change in the export fails a test here rather
 * than a generator run the night before a demo.
 */

import type { ScheduleRow } from './scheduleParse';

export type EventlinkSport = { sport: string; rows: ScheduleRow[] };

/**
 * The feed's sport word, as the hub names it. A table rather than a
 * lowercase of the word, so a sport this has never seen stops the run instead
 * of inventing a tile with no glyph and no season.
 */
const SPORT_NAMES: Record<string, string> = {
  Football: 'football',
  Volleyball: 'volleyball',
  'Cross Country': 'cross country',
  Swimming: 'swimming',
  'Track & Field': 'track',
  Baseball: 'baseball',
  Softball: 'softball',
  Basketball: 'basketball',
  Soccer: 'soccer',
  Golf: 'golf',
  Tennis: 'tennis',
  Wrestling: 'wrestling',
  Lacrosse: 'lacrosse',
};

/** Sports a school fields for both boys and girls, so the gender word has to
 * stay on the front of the name for the two to be two tiles. */
const GENDERED = new Set(['basketball', 'soccer', 'golf', 'tennis', 'wrestling', 'lacrosse']);

/** "Football (Boys V) - Salem High School" / "… @ …" for away. */
const SUMMARY = /^(CANCELED - )?(.+?) \((Boys|Girls|Coed) (V|JV|F)\) (-|@) (.+)$/;

/** Rows that fit the pattern and are not games. A banquet is filed under the
 * sport like a fixture is; a fan's schedule has no line for it. */
const NOT_A_GAME = /\b(banquet|pictures?|meeting|media day|rehearsal|tryouts?|practice|scrimmage)\b/i;

/** Global, because a tri-meet names three schools in one opponent field. */
const SCHOOL_SUFFIX = / (?:Sr )?High School\b| H\.S\./g;

type Event = Record<string, string>;

/** iCal folds long lines with CRLF plus a space or tab; join them back first. */
const unfold = (text: string): string[] => text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

/** iCal escapes commas, semicolons and backslashes in text values. */
const unescape = (v: string): string => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

/**
 * Every VEVENT as a flat record of its properties. Parameters between the
 * name and the colon (DTSTART;TZID=…) are dropped: the timezone is always
 * Eastern for an Ohio school, and an all-day value shows itself by being
 * eight digits long.
 */
export const readEvents = (text: string): Event[] => {
  const events: Event[] = [];
  let current: Event | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(';')[0];
    current[name] = unescape(line.slice(colon + 1));
  }
  return events;
};

const isoDate = (start: string): string =>
  `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;

/** "20260911T190000" → "7:00 PM". Undefined for an all-day value. Seconds are
 * dropped: Eventlink stamps odd ones (T164517) that mean nothing to a fan. */
export const clockText = (start: string): string | undefined => {
  const m = /^\d{8}T(\d{2})(\d{2})/.exec(start);
  if (!m) return undefined;
  const hour24 = Number(m[1]);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${m[2]} ${hour24 < 12 ? 'AM' : 'PM'}`;
};

export const opponentName = (raw: string): string => raw.replace(SCHOOL_SUFFIX, '').trim();

export const sportName = (word: string, gender: string): string => {
  const base = SPORT_NAMES[word];
  if (!base) throw new Error(`Eventlink names a sport this parser does not know: "${word}"`);
  return GENDERED.has(base) ? `${gender.toLowerCase()} ${base}` : base;
};

/** July to June, the school year: a 2026 season runs 2026-07-01 to 2027-06-30. */
const inSeason = (start: string, season: number): boolean =>
  start >= `${season}0701` && start < `${season + 1}0701`;

/**
 * The varsity fixtures of one season, grouped by sport, football first.
 *
 * Football goes first because it is the tile every school has, paid or not;
 * after it the order is the feed's own, which is the order the athletic office
 * entered the sports. The hub re-sorts by season anyway.
 */
export const parseEventlink = (text: string, season: number): EventlinkSport[] => {
  const found = new Map<string, { start: string; row: ScheduleRow }[]>();

  for (const event of readEvents(text)) {
    if (event.RRULE) continue;
    const m = SUMMARY.exec(event.SUMMARY ?? '');
    if (!m) continue;
    const [, cancelled, word, gender, level, separator, opponent] = m;
    if (cancelled || level !== 'V') continue;
    const start = event.DTSTART ?? '';
    if (!/^\d{8}(T\d{6})?$/.test(start) || !inSeason(start, season)) continue;
    if (NOT_A_GAME.test(opponent)) continue;

    const row: ScheduleRow = {
      date: isoDate(start),
      opponent: opponentName(opponent),
      home: separator === '-',
    };
    const time = clockText(start);
    if (time) row.time = time;

    const name = sportName(word, gender);
    const rows = found.get(name) ?? [];
    rows.push({ start, row });
    found.set(name, rows);
  }

  const sports = [...found].map(([sport, rows]) => ({
    sport,
    rows: [...rows].sort((a, b) => a.start.localeCompare(b.start)).map((r) => r.row),
  }));
  const football = sports.findIndex((s) => s.sport === 'football');
  if (football > 0) sports.unshift(...sports.splice(football, 1));
  return sports;
};
