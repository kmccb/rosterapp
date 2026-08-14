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
  isLeagueGame: boolean;
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
        isLeagueGame: members.includes(page.name) && members.includes(g.opponent),
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

const tally = (games: TeamPage['games'], only?: string[]) => {
  let won = 0;
  let lost = 0;
  for (const g of games) {
    if (!g.result) continue;
    if (only && !only.includes(g.opponent)) continue;
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
      return winPct(b.overall) - winPct(a.overall);
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

export function byWeek(games: LeagueGame[]): Week[] {
  const buckets = new Map<string, LeagueGame[]>();
  for (const g of games) {
    const k = mondayOf(g.date);
    buckets.set(k, [...(buckets.get(k) ?? []), g]);
  }

  const mondays = [...buckets.keys()].sort();
  return mondays
    .map((monday, i) => ({
      week: i + 1,
      label: new Date(`${monday}T12:00:00`).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      }),
      games: buckets.get(monday)!,
    }))
    .reverse();
}
