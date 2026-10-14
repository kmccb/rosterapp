/*
 * Reads a team's conference off MaxPreps: which one it is in, and who else is.
 *
 * Two pages. Any page of a team's own section carries, in its data block, the
 * two ids the printable stats page is addressed by and the address of the
 * conference's page; the conference's page lists its teams. So from the one
 * address a seller can copy out of a browser — the team's page — the rest
 * follows, and nobody has to find a Print link or type seven schools in.
 *
 * What MaxPreps calls a school and what the state directory calls it do not
 * agree: Campbell Memorial is "Memorial" there, and there are two Western
 * Reserves in Ohio. But every team's address on MaxPreps begins with its
 * town, and the directory files every school under a town too, so a member is
 * placed by town first and by name only to choose within one. A member that
 * cannot be placed is reported by name rather than guessed at: a conference
 * table with the wrong Western Reserve in it is worse than one a seller has to
 * finish by hand.
 *
 * Pure, and pinned to saved pages in fixtures/.
 */

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

const pageProps = (html: string): Record<string, unknown> | null => {
  const raw = html.match(NEXT_DATA)?.[1];
  if (!raw) return null;
  try {
    const props = JSON.parse(raw)?.props?.pageProps;
    return typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const onMaxPreps = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.maxpreps.com' ? url.href : null;
  } catch {
    return null;
  }
};

export type MaxPrepsTeam = {
  /** The printable stats page for this team and season. */
  statsUrl: string;
  /** The conference's page, when the team is in one. */
  leagueUrl: string | null;
  leagueName: string | null;
};

/** Any page of a team's section → where its stats and its conference are. Null when the page is not one. */
export function parseMaxPrepsTeam(html: string): MaxPrepsTeam | null {
  const context = pageProps(html)?.teamContext as
    | { data?: Record<string, unknown>; tda?: Record<string, unknown> }
    | undefined;
  const teamId = context?.tda?.teamId;
  const seasonId = context?.tda?.sportSeasonId;
  if (typeof teamId !== 'string' || typeof seasonId !== 'string') return null;
  if (!GUID.test(teamId) || !GUID.test(seasonId)) return null;

  const leagueName = context?.data?.leagueName;
  return {
    statsUrl:
      'https://www.maxpreps.com/print/team_stats.aspx?admin=0&bygame=0&league=0&print=1' +
      `&schoolid=${teamId}&ssid=${seasonId}`,
    leagueUrl: onMaxPreps(context?.data?.leagueCanonicalUrl),
    leagueName: typeof leagueName === 'string' && leagueName.trim() ? leagueName.trim() : null,
  };
}

export type ConferenceTeam = {
  name: string;
  /** The town, as the first part of the team's address spells it: "new-middletown". */
  town: string;
};

export type MaxPrepsConference = { name: string; teams: ConferenceTeam[] };

/** A conference's page → its name and its teams. Null when the page is not one. */
export function parseMaxPrepsConference(html: string): MaxPrepsConference | null {
  const layout = pageProps(html)?.layoutProps as
    | { headerData?: { title?: unknown }; tableData?: unknown }
    | undefined;
  const name = layout?.headerData?.title;
  if (typeof name !== 'string' || !name.trim() || !Array.isArray(layout?.tableData)) return null;

  const teams: ConferenceTeam[] = [];
  for (const row of layout.tableData as Array<Record<string, unknown> | null>) {
    const school = row?.schoolName;
    const address = onMaxPreps(row?.teamCanonicalUrl);
    if (typeof school !== 'string' || !school.trim() || !address) continue;
    // /oh/campbell/memorial-red-devils/football/ — state, town, school.
    const town = new URL(address).pathname.split('/').filter(Boolean)[1] ?? '';
    teams.push({ name: school.trim(), town });
  }
  return teams.length ? { name: name.trim(), teams } : null;
}

const squash = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export type DirectorySchool = { slug: string; name: string; city: string };

export type MatchedConference = {
  /** Directory slugs of the other members, in the page's order. */
  members: string[];
  /** Names the directory could not place, as MaxPreps prints them. */
  unmatched: string[];
};

/**
 * The conference's teams as directory slugs, without `ownSlug` — the fan page
 * puts a school in its own table without being asked.
 *
 * Town first. With one school in the town, that is it, whatever the two sides
 * call it. With several, the one whose name agrees — either name contained in
 * the other, so "Memorial" finds "Campbell Memorial" — and only if exactly one
 * does. A town the directory does not have is tried by exact name across the
 * state, and taken only if the name is unique.
 */
export function matchConference(
  teams: ConferenceTeam[],
  directory: DirectorySchool[],
  ownSlug: string,
): MatchedConference {
  const members: string[] = [];
  const unmatched: string[] = [];

  for (const team of teams) {
    const town = squash(team.town);
    const name = squash(team.name);
    const inTown = directory.filter((s) => squash(s.city) === town);

    let hit: DirectorySchool | null = null;
    if (inTown.length === 1) {
      hit = inTown[0];
    } else if (inTown.length > 1) {
      const agree = inTown.filter((s) => {
        const theirs = squash(s.name);
        return theirs.includes(name) || name.includes(theirs);
      });
      hit = agree.length === 1 ? agree[0] : null;
    } else {
      const sameName = directory.filter((s) => squash(s.name) === name);
      hit = sameName.length === 1 ? sameName[0] : null;
    }

    if (!hit) unmatched.push(team.name);
    else if (hit.slug !== ownSlug && !members.includes(hit.slug)) members.push(hit.slug);
  }

  return { members, unmatched };
}
