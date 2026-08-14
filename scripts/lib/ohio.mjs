// scripts/lib/ohio.mjs

/**
 * Ohio high school football, from the one place that publishes all of it.
 *
 * Poland's own page is the entry point: it names the division and region the
 * team is in this season, and it links every conference rival by id, because
 * Poland plays all six. So the roster of teams to fetch resolves itself rather
 * than being a list that rots.
 *
 * All parsing lives in src/league/leagueParse.ts and is tested against saved
 * pages. Nothing here does any.
 */
import { parseRegionTable, parseTeamPage } from '../../src/league/leagueParse.ts';
import { standings, toLeagueGames } from '../../src/league/leagueModel.ts';

const TEAM = (id, year) => `https://joeeitel.com/hsfoot/teams.jsp?teamID=${id}&year=${year}`;
const REGION = (year, n) => `https://joeeitel.com/hsfoot/rankings/${year}/region-${n}`;

const getHtml = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' },
    signal: AbortSignal.timeout(20000),
  });
  return res.ok ? res.text() : null;
};

export async function fetchLeague(config, year) {
  const ownHtml = await getHtml(TEAM(config.teamId, year));
  if (!ownHtml) return null;

  const own = parseTeamPage(ownHtml, year);
  // An empty parse means the page changed shape. Say nothing rather than
  // something wrong — the caller keeps the previous file.
  if (!own.name || !own.games.length || !own.region) return null;

  // The rivals, by the ids printed on Poland's own schedule.
  const wanted = config.members.filter((m) => m !== own.name);
  const ids = new Map();
  for (const g of own.games) if (wanted.includes(g.opponent)) ids.set(g.opponent, g.opponentId);

  const others = [];
  for (const [name, id] of ids) {
    const html = await getHtml(TEAM(id, year));
    const page = html && parseTeamPage(html, year);
    if (page?.games.length) others.push(page);
    else console.warn(`  ! league: no page for ${name} (${id}); leaving them out of the table.`);
  }

  const pages = [own, ...others];
  const regionHtml = await getHtml(REGION(year, own.region));
  const region = regionHtml ? parseRegionTable(regionHtml) : null;

  return {
    conference: config.conference,
    team: own.name,
    division: own.division,
    region: own.region,
    teams: standings(pages, config.members),
    games: toLeagueGames(pages, config.members),
    regionTable: region?.rows.length ? region : null,
    fetched: new Date().toISOString(),
  };
}
