/**
 * A college roster, from the public scoreboard API.
 *
 * A high school roster is typed in by a coach and shared with a code, because
 * nobody publishes it. A college roster is already public, so this team gets
 * its whole squad — photographs, home towns and last season's numbers — baked
 * into the site at build time. Nothing to set up, nothing to share, and the
 * same rebuild that carries the schedule keeps it current.
 *
 * One request does it: the roster endpoint carries the statistics inline when
 * asked, so this does not hammer the API once per player.
 */
import { sideFromPosition } from '../../src/parse/rosterParse.ts';

const ROSTER = (id) =>
  `https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/teams/${id}/roster?enable=stats`;

/** Abbreviations read fine on a card but not in a sentence. */
const POSITIONS = {
  QB: 'quarterback', RB: 'running back', FB: 'fullback', WR: 'wide receiver',
  TE: 'tight end', OL: 'offensive lineman', OT: 'offensive tackle', OG: 'offensive guard',
  G: 'offensive guard', C: 'center', DL: 'defensive lineman', DE: 'defensive end',
  DT: 'defensive tackle', NT: 'nose tackle', LB: 'linebacker', ILB: 'inside linebacker',
  OLB: 'outside linebacker', MLB: 'middle linebacker', CB: 'cornerback', S: 'safety',
  FS: 'free safety', SS: 'strong safety', DB: 'defensive back', K: 'kicker',
  PK: 'kicker', P: 'punter', LS: 'long snapper', ATH: 'athlete',
};

/**
 * How each kind of season reads as a sentence, in the order a player's own
 * story would be told: what they did with the ball first, then what they did
 * without it. Only one or two ever apply to the same player.
 */
const SENTENCES = [
  ['passing', (s) =>
    s.passingYards &&
    `Threw for ${s.passingYards} yards` +
      (s.passingTouchdowns && s.passingTouchdowns !== '0'
        ? ` and ${s.passingTouchdowns} touchdowns`
        : '')],
  ['rushing', (s) =>
    s.rushingYards && `Ran for ${s.rushingYards} yards on ${s.rushingAttempts} carries`],
  ['receiving', (s) =>
    s.receptions && `Caught ${s.receptions} passes for ${s.receivingYards} yards`],
  ['defensive', (s) =>
    s.soloTackles && `Made ${s.soloTackles} solo tackles${s.sacks && s.sacks !== '0' ? ` and ${s.sacks} sacks` : ''}`],
  ['defensiveInterceptions', (s) =>
    s.interceptions && s.interceptions !== '0' && `Picked off ${s.interceptions} passes`],
  ['kicking', (s) =>
    s.totalKickingPoints && `Scored ${s.totalKickingPoints} points off the tee`],
  ['punting', (s) =>
    s.punts && `Punted ${s.punts} times, averaging ${s.grossAvgPuntYards} yards`],
];

/** ESPN pads the array with nulls, and a missing stat is not a zero. */
const statsByName = (category) =>
  Object.fromEntries((category.stats ?? []).filter(Boolean).map((s) => [s.name, s.displayValue]));

const inchesFrom = (height) => (Number.isFinite(height) ? Math.round(height) : undefined);

/**
 * "Hubbard, OH". This endpoint gives the parts and no assembled form, unlike
 * its sibling — the state is dropped outside the US, where it is usually empty
 * and never what anyone means by where somebody is from.
 */
const hometownOf = (birthPlace) => {
  if (!birthPlace?.city) return undefined;
  const region = birthPlace.country === 'USA' ? birthPlace.state : birthPlace.country;
  return [birthPlace.city, region].filter(Boolean).join(', ');
};

/**
 * A write-up assembled from what is known, rather than lifted from the
 * university's own page. It stays true as the numbers change, and it exists
 * for all hundred players instead of the handful somebody got round to.
 */
const bioFor = (athlete, categories, when) => {
  const parts = [];

  const position = POSITIONS[athlete.position?.abbreviation] ?? athlete.position?.name?.toLowerCase();
  const year = athlete.experience?.displayValue;
  const home = hometownOf(athlete.birthPlace);
  if (position) {
    parts.push([year, position].filter(Boolean).join(' ') + (home ? ` from ${home}.` : '.'));
  } else if (home) {
    parts.push(`From ${home}.`);
  }

  const said = [];
  for (const [name, phrase] of SENTENCES) {
    const category = categories.find((c) => c.name === name);
    if (!category) continue;
    const line = phrase(statsByName(category));
    if (line) said.push(line);
    if (said.length === 2) break;
  }
  if (said.length) parts.push(`${said.join(', and ')} ${when}.`);

  return parts.join(' ');
};

/** The numbers worth putting on the card, already formatted for reading. */
const linesFor = (categories) =>
  categories.flatMap((c) =>
    (c.stats ?? [])
      .filter(Boolean)
      .filter((s) => s.displayValue && s.displayValue !== '0')
      .map((s) => ({ label: s.shortDisplayName || s.displayName, value: s.displayValue })),
  );

export async function fetchEspnRoster(id) {
  const res = await fetch(ROSTER(id), {
    headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  // Before a ball is thrown the numbers on file are last year's; once the
  // season is under way they are this year's, and the sentence has to say so.
  const when = data.season?.type === 2 || data.season?.type === 3 ? 'this season' : 'last season';

  const athletes = (data.positionGroups ?? []).flatMap((g) => g.athletes ?? []);
  const seen = new Set();
  const players = [];

  for (const a of athletes) {
    if (seen.has(a.id)) continue; // a two-way player is listed under both groups
    seen.add(a.id);

    const categories = a.statistics?.splits?.categories ?? [];
    const position = a.position?.abbreviation ?? '';

    players.push({
      id: `espn-${a.id}`,
      number: String(a.jersey ?? '').trim(),
      firstName: a.firstName ?? '',
      lastName: a.lastName ?? '',
      position,
      side: sideFromPosition(position),
      heightIn: inchesFrom(a.height),
      weightLb: Number.isFinite(a.weight) ? Math.round(a.weight) : undefined,
      grade: a.experience?.displayValue,
      hometown: hometownOf(a.birthPlace),
      // Linked rather than copied here: the picture belongs to whoever took
      // it, and the app keeps its own copy only once someone has looked at it.
      photo: a.headshot?.href,
      bio: bioFor(a, categories, when),
      lines: linesFor(categories),
    });
  }

  players.sort((x, y) => (Number(x.number) || 999) - (Number(y.number) || 999));

  return {
    teamName: data.team?.displayName ?? '',
    season: String(data.season?.year ?? ''),
    players,
    updatedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------- season stats

const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';

/** ESPN's own words for each bucket; its category names are code, not English. */
const CATEGORY_LABELS = {
  general: 'General',
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  defensive: 'Defence',
  defensiveInterceptions: 'Interceptions',
  kicking: 'Kicking',
  returning: 'Returning',
  punting: 'Punting',
  scoring: 'Scoring',
  miscellaneous: 'Drives and downs',
};

const getJson = async (url) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' },
    signal: AbortSignal.timeout(20000),
  });
  return res.ok ? res.json() : null;
};

/** Four at a time: this walks twenty-odd seasons and should not arrive as a flood. */
const inBatches = async (items, size, fn) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
};

/**
 * Every season the API will admit to, newest first.
 *
 * A year with no statistics is dropped rather than shown empty — 2020 is a
 * hole in the record for everyone, and a dropdown entry leading to nothing is
 * worse than one that isn't there.
 */
/**
 * Who played that year, and what they did.
 *
 * The same roster endpoint answers for any past season, statistics included,
 * so a whole year costs one request rather than one per player. Only players
 * who actually recorded something are kept: a squad list is 170 names and the
 * question here is what happened, not who was on the sideline.
 */
async function playersFor(id, year) {
  const data = await getJson(`${ROSTER(id)}&season=${year}`);
  const athletes = (data?.positionGroups ?? []).flatMap((g) => g.athletes ?? []);

  const seen = new Set();
  const players = [];
  for (const a of athletes) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const lines = linesFor(a.statistics?.splits?.categories ?? []);
    if (!lines.length) continue;
    players.push({
      name: a.displayName ?? [a.firstName, a.lastName].filter(Boolean).join(' '),
      number: String(a.jersey ?? '').trim(),
      position: a.position?.abbreviation ?? '',
      lines,
    });
  }

  players.sort((x, y) => (Number(x.number) || 999) - (Number(y.number) || 999));
  return players;
}

export async function fetchEspnSeasons(id, from, to) {
  const years = [];
  for (let y = to; y >= from; y--) years.push(y);

  const seasons = await inBatches(years, 4, async (year) => {
    const [stats, record, players] = await Promise.all([
      getJson(`${CORE}/seasons/${year}/types/2/teams/${id}/statistics`),
      getJson(`${CORE}/seasons/${year}/types/2/teams/${id}/record`),
      playersFor(id, year),
    ]);

    const categories = (stats?.splits?.categories ?? [])
      .map((c) => ({
        name: c.name,
        label: CATEGORY_LABELS[c.name] ?? c.displayName ?? c.name,
        stats: (c.stats ?? [])
          .filter((s) => s && s.displayValue != null && s.displayValue !== '')
          .map((s) => ({ label: s.displayName ?? s.name, value: String(s.displayValue) })),
      }))
      .filter((c) => c.stats.length > 0);

    const overall = record?.items?.find((i) => i.type === 'total') ?? record?.items?.[0];
    const summary = overall?.displayValue ?? '';

    // A season with a record and no statistics is one that hasn't been played
    // yet. Listing it would put an empty year at the top of the dropdown.
    if (!categories.length) return null;
    return { year, record: summary, categories, players };
  });

  return seasons.filter(Boolean);
}
