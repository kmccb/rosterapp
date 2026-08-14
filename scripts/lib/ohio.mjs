// scripts/lib/ohio.mjs

/**
 * Ohio high school football, from the one place that publishes all of it.
 *
 * Poland's own page is the entry point: it names the division and region the
 * team is in this season, and it links every conference rival by id, because
 * Poland plays all six. So the roster of teams to fetch resolves itself rather
 * than being a list that rots. For the season a fixture doesn't happen, or a
 * school the source respells in the opponent column, `league.ids` in team.json
 * supplies the id by hand for that one name.
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

  // The rivals, by the ids printed on Poland's own schedule, with `config.ids`
  // as the escape hatch for a name the schedule doesn't yield — a school the
  // source respells in the opponent column (it prints "East" on the region page
  // for what the team page calls "Youngstown East"), or a member Poland simply
  // doesn't play that season.
  const wanted = config.members.filter((m) => m !== own.name);
  const ids = new Map();
  for (const g of own.games) if (wanted.includes(g.opponent)) ids.set(g.opponent, g.opponentId);
  for (const name of wanted) {
    const override = config.ids?.[name];
    if (!ids.has(name) && override) ids.set(name, override);
  }

  // Nothing above guarantees all six were found, and a six-team Northeast 8
  // table that ships without saying so is exactly the "wrong rather than
  // merely old" outcome this whole file is arranged to avoid. So it is checked,
  // by name, and a short list abandons the run.
  if (ids.size !== wanted.length) {
    const missing = wanted.filter((m) => !ids.has(m));
    console.warn(
      `  ! league: ${missing.join(', ')} ${missing.length === 1 ? 'was' : 'were'} not found on ` +
        `${own.name}'s page and ${missing.length === 1 ? 'has' : 'have'} no id in the config's ` +
        `"ids" block, so the standings would be short ${missing.length} of ${config.members.length}. ` +
        `That is wrong rather than stale, so this run is abandoned; add the id to team.json's ` +
        `league.ids to fix it.`,
    );
    return null;
  }

  // Every rival is required. A table missing one of the seven is wrong, not
  // merely stale, so one bad rival page abandons the whole fetch — the
  // caller keeps whatever it already had.
  const others = [];
  for (const [name, id] of ids) {
    const html = await getHtml(TEAM(id, year));
    const page = html && parseTeamPage(html, year);
    // A page whose <caption> breaks parses to name: '' but keeps its rows, and
    // an unnamed page is worse than an empty one: it survives a games-only
    // guard, then standings() drops it on `members.includes(p.name)` and its
    // games get filed under the empty string. Nameless counts as empty.
    if (!page?.games.length || !page.name) {
      console.warn(
        `  ! league: ${name}'s page (${id}) came back empty or unnamed; a standings table short one team ` +
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
    // The id as well as the name, so the screen can pick our row out of the
    // region table on the thing that cannot be respelled.
    teamId: config.teamId,
    division: own.division,
    region: own.region,
    teams: standings(pages, config.members),
    games: toLeagueGames(pages, config.members),
    regionTable: region?.rows.length ? region : null,
    fetched: new Date().toISOString(),
  };
}
