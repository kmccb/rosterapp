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

const EMOJI: Record<string, string> = {
  football: '🏈', volleyball: '🏐', soccer: '⚽', 'cross country': '🏃',
  golf: '⛳', tennis: '🎾', cheer: '📣', basketball: '🏀', wrestling: '🤼',
  swimming: '🏊', hockey: '🏒', bowling: '🎳', baseball: '⚾', softball: '🥎',
  track: '🏃', lacrosse: '🥍',
};

const norm = (sport: string): string => sport.trim().toLowerCase();

/** Month is 1–12. A sport the table doesn't know is always in season. */
export const inSeason = (sport: string, month: number): boolean => {
  const months = MONTHS[norm(sport)];
  return months ? months.includes(month) : true;
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

export const sportEmoji = (sport: string): string => EMOJI[norm(sport)] ?? '🎽';

/** Every sport this table has an opinion about. The hub's glyph set is held
 * to this list by a test, so a sport added above can't ship without a mark to
 * draw it by. */
export const knownSports = (): string[] => Object.keys(MONTHS);
