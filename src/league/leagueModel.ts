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

export function standings(pages: TeamPage[], members: string[]): Standing[] {
  return pages
    .filter((p) => members.includes(p.name))
    .map((p) => ({
      name: p.name,
      overall: tally(p.games),
      leagueRecord: tally(p.games, members),
    }))
    .sort((a, b) => {
      const [aw, al] = asPair(a.leagueRecord);
      const [bw, bl] = asPair(b.leagueRecord);
      if (bw - bl !== aw - al) return bw - bl - (aw - al);
      const [aow, aol] = asPair(a.overall);
      const [bow, bol] = asPair(b.overall);
      return bow - bol - (aow - aol);
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
