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
 * "1 touchdown", "26 touchdowns" — the count arrives as a display string.
 *
 * Sacks come through as "10.5", which is never "1", so the plural there is
 * right by accident; it goes through here anyway so it stays right the season
 * somebody finishes on one.
 */
const many = (count, noun, plural = `${noun}s`) =>
  `${count} ${String(count) === '1' ? noun : plural}`;

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
        ? ` and ${many(s.passingTouchdowns, 'touchdown')}`
        : '')],
  ['rushing', (s) =>
    s.rushingYards && `Ran for ${s.rushingYards} yards on ${many(s.rushingAttempts, 'carry', 'carries')}`],
  ['receiving', (s) =>
    s.receptions && `Caught ${many(s.receptions, 'pass', 'passes')} for ${s.receivingYards} yards`],
  ['defensive', (s) =>
    s.soloTackles && `Made ${many(s.soloTackles, 'solo tackle')}${s.sacks && s.sacks !== '0' ? ` and ${many(s.sacks, 'sack')}` : ''}`],
  ['defensiveInterceptions', (s) =>
    s.interceptions && s.interceptions !== '0' && `Picked off ${many(s.interceptions, 'pass', 'passes')}`],
  ['kicking', (s) =>
    s.totalKickingPoints && `Scored ${many(s.totalKickingPoints, 'point')} off the tee`],
  ['punting', (s) =>
    s.punts && `Punted ${many(s.punts, 'time')}, averaging ${s.grossAvgPuntYards} yards`],
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
  // Each clause is written as an opener; only the first one still is.
  if (said.length) {
    const [first, ...rest] = said;
    parts.push(`${[first, ...rest.map(lower)].join(', and ')} ${when}.`);
  }

  return parts.join(' ');
};

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * A zero here almost never means zero.
 *
 * ESPN carries the full schema for every division but only fills in what it
 * compiles, so this team's older seasons report 0 tackles and 0 red zone
 * attempts beside 21 sacks. Printing those as facts is worse than leaving the
 * row out — a season where nobody made a tackle is obviously wrong, and it
 * makes the figures beside it look wrong too.
 *
 * The same zero wears several coats depending on the stat — '0', '0.0', '0-0',
 * '0/0', '0.0%' — so the shape is matched rather than the string.
 *
 * The cost is dropping the occasional true zero, which nobody misses.
 */
const isUnfilled = (value) => /^(0(\.0+)?%?|0-0|0\/0)$/.test(String(value).trim());

/** The numbers worth putting on the card, already formatted for reading. */
const linesFor = (categories) =>
  categories.flatMap((c) =>
    (c.stats ?? [])
      .filter(Boolean)
      .filter((s) => s.displayValue && s.displayValue !== '--' && !isUnfilled(s.displayValue))
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

/*
 * The team stats worth a screen, and nothing else.
 *
 * The API hands over about two hundred figures a season — forced fumbles by
 * primary defender, average stuff yards, kickoff return yards allowed. Dumped
 * whole under their own headings it reads as a database rather than a season.
 * This is the set somebody actually asks about, in the order they'd ask.
 *
 * Named by the API's own keys rather than its display text, which changes.
 *
 * One thing genuinely isn't here: total yards, for or against. ESPN stopped
 * compiling team offensive totals for this division around 2012, and building
 * them out of the player rows would be wrong in the years where player
 * coverage is thin. Better absent than wrong.
 */
const TEAM_SECTIONS = [
  ['Scoring', [
    ['scoring', 'totalPoints', 'Points'],
    ['scoring', 'totalPointsPerGame', 'Points per game'],
    ['scoring', 'passingTouchdowns', 'Passing TD'],
    ['scoring', 'rushingTouchdowns', 'Rushing TD'],
    ['scoring', 'receivingTouchdowns', 'Receiving TD'],
    ['scoring', 'returnTouchdowns', 'Return TD'],
    ['scoring', 'fieldGoals', 'Field goals'],
    ['scoring', 'kickExtraPointsMade', 'Extra points'],
  ]],
  ['Moving the ball', [
    ['miscellaneous', 'firstDowns', 'First downs'],
    ['miscellaneous', 'firstDownsPerGame', 'First downs per game'],
    ['miscellaneous', 'firstDownsPassing', 'Passing first downs'],
    ['miscellaneous', 'firstDownsRushing', 'Rushing first downs'],
    ['miscellaneous', 'thirdDownConvPct', 'Third down'],
    ['miscellaneous', 'fourthDownConvPct', 'Fourth down'],
    ['miscellaneous', 'redzoneScoringPct', 'Red zone'],
    ['miscellaneous', 'redzoneTouchdownPct', 'Red zone TD'],
    ['miscellaneous', 'totalDrives', 'Drives'],
    ['miscellaneous', 'possessionTimeSeconds', 'Time of possession'],
  ]],
  ['Defence', [
    ['defensive', 'totalTackles', 'Tackles'],
    ['defensive', 'soloTackles', 'Solo tackles'],
    ['defensive', 'sacks', 'Sacks'],
    ['defensive', 'sackYards', 'Sack yards'],
    ['defensive', 'tacklesForLoss', 'Tackles for loss'],
    ['defensive', 'passesDefended', 'Passes defended'],
    ['defensiveInterceptions', 'interceptions', 'Interceptions'],
    ['defensiveInterceptions', 'interceptionTouchdowns', 'Pick sixes'],
  ]],
  ['Turnovers and discipline', [
    ['miscellaneous', 'totalTakeaways', 'Takeaways'],
    ['miscellaneous', 'totalGiveaways', 'Giveaways'],
    ['miscellaneous', 'turnOverDifferential', 'Turnover margin'],
    ['general', 'fumblesForced', 'Fumbles forced'],
    ['general', 'fumblesRecovered', 'Fumbles recovered'],
    ['miscellaneous', 'totalPenalties', 'Penalties'],
    ['miscellaneous', 'totalPenaltyYards', 'Penalty yards'],
  ]],
];

/**
 * Possession, per game.
 *
 * The API reports it as seconds for the whole season, which comes out as
 * "405:49" and means nothing to anyone. Divided by games played it is the
 * half-hour or so people picture.
 */
const asTimePerGame = (seconds, games) => {
  const n = Number(seconds) / (Number(games) || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n / 60) + ':' + String(Math.round(n % 60)).padStart(2, '0');
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

/**
 * Every season the API will admit to, newest first.
 *
 * A year with no statistics is dropped rather than shown empty — 2020 is a
 * hole in the record for everyone, and a dropdown entry leading to nothing is
 * worse than one that isn't there.
 */
export async function fetchEspnSeasons(id, from, to) {
  const years = [];
  for (let y = to; y >= from; y--) years.push(y);

  // Three requests a year rather than two, so the walk takes about three times
  // as long — inBatches already paces it at four years at a time, which is six
  // rounds of twelve instead of sixty-six requests at once.
  const seasons = await inBatches(years, 4, async (year) => {
    const [stats, record, players] = await Promise.all([
      getJson(`${CORE}/seasons/${year}/types/2/teams/${id}/statistics`),
      getJson(`${CORE}/seasons/${year}/types/2/teams/${id}/record`),
      playersFor(id, year),
    ]);

    const raw = new Map();
    for (const c of stats?.splits?.categories ?? []) {
      for (const s of c.stats ?? []) {
        if (s && s.displayValue != null && s.displayValue !== '') {
          raw.set(c.name + '.' + s.name, String(s.displayValue));
        }
      }
    }

    const games = raw.get('general.gamesPlayed');

    const categories = TEAM_SECTIONS.map(([label, wanted]) => ({
      name: label.toLowerCase().replace(/\W+/g, '-'),
      label,
      stats: wanted
        .map(([cat, key, as]) => {
          const value = raw.get(cat + '.' + key);
          if (value == null || isUnfilled(value)) return null;
          if (key === 'possessionTimeSeconds') {
            const t = asTimePerGame(value, games);
            return t ? { label: as + ' per game', value: t } : null;
          }
          // Two decimal places on a conversion rate is false precision, and
          // '47.47%' is harder to read than '47%' without telling you more.
          const n = Number(value);
          if (key.endsWith('Pct')) return { label: as, value: Math.round(n) + '%' };
          if (Number.isFinite(n) && !Number.isInteger(n)) {
            return { label: as, value: String(Math.round(n * 10) / 10) };
          }
          return { label: as, value };
        })
        .filter(Boolean),
    })).filter((c) => c.stats.length > 0);

    const overall = record?.items?.find((i) => i.type === 'total') ?? record?.items?.[0];
    const summary = overall?.displayValue ?? '';

    // A season with a record and no statistics is one that hasn't been played
    // yet. Listing it would put an empty year at the top of the dropdown.
    if (!categories.length) return null;
    return { year, record: summary, categories, players };
  });

  return seasons.filter(Boolean);
}
