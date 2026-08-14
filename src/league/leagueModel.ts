/**
 * Turns the per-team pages the parser hands back into what the screen
 * actually shows: one deduplicated game list, a standings table, and games
 * grouped into football weeks. The site has no concept of "the league" or
 * "week 6" — both are derived here from a roster of member schools and the
 * dates that happen to appear.
 */

import type { TeamPage } from './leagueParse';

export type LeagueGame = {
  date: string;
  home: string;
  away: string;
  result?: { home: number; away: number };
  /**
   * Both schools in the conference AND a regular-season meeting. A November
   * playoff rematch between two members is not a conference game, so this is
   * false for it however familiar the two names look.
   */
  isLeagueGame: boolean;
  isPlayoff: boolean;
};

export type Standing = { name: string; overall: string; leagueRecord: string };
export type Week = { week: number; label: string; games: LeagueGame[] };

/**
 * One fixture appears on two teams' pages, so it arrives twice and has to be
 * collapsed. Keyed on the date and the two schools sorted, which is the same
 * key whichever side reported it.
 */
const keyOf = (g: LeagueGame) => `${g.date}|${[g.home, g.away].sort().join('|')}`;

export function toLeagueGames(pages: TeamPage[], members: string[]): LeagueGame[] {
  const seen = new Map<string, LeagueGame>();

  for (const page of pages) {
    for (const g of page.games) {
      const home = g.home ? page.name : g.opponent;
      const away = g.home ? g.opponent : page.name;
      const one: LeagueGame = {
        date: g.date,
        home,
        away,
        isLeagueGame: !g.playoff && members.includes(page.name) && members.includes(g.opponent),
        isPlayoff: g.playoff,
        ...(g.result
          ? { result: g.home
              ? { home: g.result.us, away: g.result.them }
              : { home: g.result.them, away: g.result.us } }
          : {}),
      };
      // First writer wins unless the second carries a score the first lacked.
      const existing = seen.get(keyOf(one));
      if (!existing || (!existing.result && one.result)) seen.set(keyOf(one), one);
    }
  }

  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Records, twice over. With no `only` this is the overall record and every
 * played game counts, playoffs included — 9-3 is Poland's 2025 season and the
 * two November wins and the November loss are part of it. With `only` it is
 * the conference record, and a playoff game is excluded even when the other
 * school is a member: Poland lost to Girard twice in 2025, once in week 8 and
 * once in the regional semi-final, and only the first is a Northeast 8 result.
 */
const tally = (games: TeamPage['games'], only?: string[]) => {
  let won = 0;
  let lost = 0;
  for (const g of games) {
    if (!g.result) continue;
    if (only && (g.playoff || !only.includes(g.opponent))) continue;
    if (g.result.us > g.result.them) won += 1;
    else lost += 1;
  }
  return `${won}-${lost}`;
};

const asPair = (record: string) => record.split('-').map(Number);

/**
 * Win/loss differential ties a 2-0 team with a 5-3 team (both +2), which
 * mid-season is the normal state once bye weeks stagger how many games each
 * school has played. Conference tables are read by winning percentage
 * everywhere this app would be read, so that is what orders them. A team
 * with no games yet has no percentage — 0-0 counts as 0 rather than NaN, so
 * it sorts to the bottom instead of scrambling the table.
 */
const winPct = (record: string): number => {
  const [w, l] = asPair(record);
  return w + l === 0 ? 0 : w / (w + l);
};

export function standings(pages: TeamPage[], members: string[]): Standing[] {
  return pages
    .filter((p) => members.includes(p.name))
    .map((p) => ({
      name: p.name,
      overall: tally(p.games),
      leagueRecord: tally(p.games, members),
    }))
    .sort((a, b) => {
      const league = winPct(b.leagueRecord) - winPct(a.leagueRecord);
      if (league !== 0) return league;
      const overall = winPct(b.overall) - winPct(a.overall);
      if (overall !== 0) return overall;
      // In August every team is 0-0 and both percentages tie, which leaves the
      // order to whatever sequence the pages happened to be fetched in — that
      // is, to Poland's schedule. Alphabetical is not a tie-breaker in any
      // sporting sense and is not claimed as one; it is simply the order a
      // reader can predict on the day the table has nothing to say.
      return a.name.localeCompare(b.name);
    });
}

/**
 * A football week is Monday to Sunday, because a Thursday game and the
 * Saturday after it belong to the same round and dividing on the date alone
 * would split them.
 */
const mondayOf = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/*
 * In week order, earliest first — the way a season is read and the way the
 * Schedule tab already lists its fixtures. Newest-first was tried and is
 * wrong: before a ball is thrown it puts week ten, the furthest away, at the
 * top of the screen, and the next game — the only one anybody is looking for
 * — at the bottom.
 */
export function byWeek(games: LeagueGame[]): Week[] {
  const buckets = new Map<string, LeagueGame[]>();
  for (const g of games) {
    const k = mondayOf(g.date);
    buckets.set(k, [...(buckets.get(k) ?? []), g]);
  }

  return [...buckets.keys()].sort().map((monday, i) => ({
    week: i + 1,
    label: new Date(`${monday}T12:00:00`).toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
    }),
    games: buckets.get(monday)!,
  }));
}
