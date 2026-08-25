/*
 * What the hub knows about sports without asking anybody.
 *
 * Ohio's high-school calendar is static knowledge: football is an autumn
 * sport this year and every year. A pinned table keeps the hub current on
 * its own — in November basketball leads and baseball dims — with no data
 * source, no cron, and nothing to go stale. A sport missing from the table
 * simply counts as always in season, so a new sport sells before this file
 * hears about it.
 */

const MONTHS: Record<string, number[]> = {
  football: [8, 9, 10, 11],
  volleyball: [8, 9, 10, 11],
  soccer: [8, 9, 10, 11],
  'cross country': [8, 9, 10],
  golf: [8, 9, 10],
  // Girls' tennis is autumn, boys' is spring; one entry covers the pair.
  tennis: [3, 4, 5, 8, 9, 10],
  cheer: [8, 9, 10, 11, 12, 1, 2],
  basketball: [11, 12, 1, 2, 3],
  wrestling: [11, 12, 1, 2, 3],
  swimming: [11, 12, 1, 2],
  hockey: [11, 12, 1, 2, 3],
  bowling: [11, 12, 1, 2],
  baseball: [3, 4, 5, 6],
  softball: [3, 4, 5, 6],
  track: [3, 4, 5, 6],
  lacrosse: [3, 4, 5],
};

/* Written out rather than read off a Date, because the note this feeds is a
   fixed sentence about a fixed Ohio calendar, not a formatted date: the reader
   is told the month a season opens, and pinning the words keeps the test
   honest on a machine set to any locale. */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const norm = (sport: string): string => sport.trim().toLowerCase();

/** Month is 1–12. A sport the table doesn't know is always in season. */
export const inSeason = (sport: string, month: number): boolean => {
  const months = MONTHS[norm(sport)];
  return months ? months.includes(month) : true;
};

/**
 * The line under a sport's name on the hub: whether it is on now, and if it
 * isn't, when it comes back.
 *
 * The month is found by walking forward from this one and wrapping the year,
 * so a sport is always announced by the run it is *next* in rather than the
 * one it has just left — basketball in April says November, not the March it
 * finished a fortnight ago. A sport the table doesn't know counts as in
 * season, the same charity inSeason extends it, so it never claims a start
 * date nobody told it.
 */
export const seasonNote = (sport: string, now: Date): string => {
  const month = now.getMonth() + 1;
  if (inSeason(sport, month)) return 'In season';
  const months = MONTHS[norm(sport)];
  for (let step = 1; step <= 12; step += 1) {
    const next = ((month + step - 1) % 12) + 1;
    if (months.includes(next)) return `Starts in ${MONTH_NAMES[next - 1]}`;
  }
  // Unreachable: a sport out of season has at least one month it is in.
  return 'In season';
};

/** In-season sports first, alphabetical within each group. */
export const sortSportsForNow = (sports: string[], now: Date): string[] => {
  const month = now.getMonth() + 1;
  return [...sports].sort((a, b) => {
    const liveA = inSeason(a, month) ? 0 : 1;
    const liveB = inSeason(b, month) ? 0 : 1;
    return liveA - liveB || a.localeCompare(b);
  });
};

/**
 * The tiles the hub draws: every live paid sport, plus football always —
 * football's schedule and scores come free from the directory, so the one
 * thing every school already has must not vanish behind a paid basketball
 * roster.
 */
export const hubSports = (live: string[]): string[] => {
  const seen = new Set(live.map(norm));
  return seen.has('football') ? [...seen] : [...seen, 'football'];
};

export const sportLabel = (sport: string): string =>
  norm(sport).replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Every sport this table has an opinion about. The hub's glyph set is held
 * to this list by a test, so a sport added above can't ship without a mark to
 * draw it by. */
export const knownSports = (): string[] => Object.keys(MONTHS);
