/*
 * Which tab a sport opens on.
 *
 * The keypad is the app — "who is number 17" — and it is asked from the
 * bleachers. The rest of the week the question is when and where the next
 * game is, and the schedule answers that with no tap at all. So a sport lands
 * on Schedule, except while a game is on or about to be, when it lands on
 * Lookup. Poland's own app has always opened on the keypad; that app was a
 * football-only, Friday-night tool, and a page with a dozen sports is not.
 *
 * Pure, so the rule is pinned by tests and School.tsx only has to call it.
 */

import { clockOf, easternOffset } from '../ohio/kickoff';

export type Landing = 'lookup' | 'schedule';

/** A fixture as either source carries it: the directory's `kickoff` ("7pm")
 * or a pasted row's `time` ("7:00 PM"). Absent or unreadable means untimed. */
export type LandingFixture = { date: string; time?: string | null };

/** An hour of pre-game — parents arrive early — and four hours after, which
 * outlasts any game with a weather delay in it. */
const BEFORE_MS = 60 * 60 * 1000;
const AFTER_MS = 4 * 60 * 60 * 1000;

/** Today's date as Ohio reads it, whatever clock the phone is on. en-CA
 * formats as YYYY-MM-DD, which is the shape every fixture date is in. */
const easternDate = (now: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/**
 * Whether `date` is a real calendar date, not just YYYY-MM-DD shaped.
 * `Date.parse` silently rolls an out-of-range day into the next month
 * (2026-02-30 becomes March 2) instead of failing, so a day that overflows
 * its month must not quietly become a game next month — round-trip it
 * through ISO and compare.
 */
const isRealDate = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const at = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(at)) return false;
  return new Date(at).toISOString().slice(0, 10) === date;
};

/**
 * The instant a timed fixture starts, or null for an untimed one. Built here
 * rather than through kickoffAt, whose seven-o'clock default is right for a
 * forecast and wrong for this: a time nobody could read must not open the
 * keypad at seven on a day with no game.
 */
const startOf = (fixture: LandingFixture): number | null => {
  const clock = clockOf(fixture.time);
  if (!clock) return null;
  const hh = String(clock.hour).padStart(2, '0');
  const mm = String(clock.minute).padStart(2, '0');
  const at = Date.parse(`${fixture.date}T${hh}:${mm}:00${easternOffset(fixture.date)}`);
  return Number.isNaN(at) ? null : at;
};

export const landingTab = (fixtures: LandingFixture[], players: number, now: Date): Landing => {
  if (players === 0) return 'schedule';
  const today = easternDate(now);
  for (const fixture of fixtures) {
    if (!isRealDate(fixture.date)) continue;
    const start = startOf(fixture);
    if (start === null) {
      if (fixture.date === today) return 'lookup';
      continue;
    }
    const since = now.getTime() - start;
    if (since >= -BEFORE_MS && since <= AFTER_MS) return 'lookup';
  }
  return 'schedule';
};
