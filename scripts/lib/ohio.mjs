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
 *
 * Own page, or any one of the six rivals, missing or empty: the whole fetch
 * returns null, because a standings table with a team quietly dropped from
 * it is wrong rather than merely old. The region table is different — it
 * doesn't corrupt anything else on the page, so a bad region page comes back
 * as `regionTable: null` inside an otherwise good result, and it's left to
 * the caller (which knows what's already on disk) to decide whether that is
 * worth publishing.
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

  // Every rival is required. A table missing one of the seven is wrong, not
  // merely stale, so one bad rival page abandons the whole fetch — the
  // caller keeps whatever it already had.
  const others = [];
  for (const [name, id] of ids) {
    const html = await getHtml(TEAM(id, year));
    const page = html && parseTeamPage(html, year);
    if (!page?.games.length) {
      console.warn(
        `  ! league: ${name}'s page (${id}) came back empty; a standings table short one team ` +
          `is wrong rather than stale, so this run is abandoned and the caller keeps the last good file.`,
      );
      return null;
    }
    others.push(page);
  }

  const pages = [own, ...others];

  // The region table is a lesser piece of the page: unlike a missing rival,
  // a missing region doesn't corrupt the standings or the game list, so it
  // does not sink the whole fetch. It comes back as null and the caller
  // decides — from whether a good one already exists on disk — whether that
  // is good enough to publish.
  const regionHtml = await getHtml(REGION(year, own.region));
  const region = regionHtml ? parseRegionTable(regionHtml) : null;
  if (!region?.rows.length) {
    console.warn(
      `  ! league: the region ${own.region} page came back empty; the conference table is still ` +
        `good, so it goes out with regionTable: null and the caller decides whether to publish that.`,
    );
  }

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
