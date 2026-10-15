/*
 * A player's week by week, out of a source that only publishes season totals.
 *
 * MaxPreps prints each team's totals and nothing per game — not on the stats
 * page, not on a game's page (which shows three top performers), not on a
 * player's page. Poland's weeks come from a coach pasting each game out of
 * Hudl; a coach who keeps MaxPreps has nothing to paste. But the totals after
 * game nine, less the totals after game eight, are game nine. So the stats
 * job keeps a copy of the totals each time the team's games-played count goes
 * up, and this works the weeks out from those copies.
 *
 * What that costs, said plainly so nobody is surprised by it:
 *  - Weeks before the first copy cannot be pulled apart. They come back as one
 *    stretch ("before tracking"), honestly labelled, rather than as a guess.
 *  - A correction a coach makes to an old game lands in whichever week is
 *    next copied. The season's total is still right; the weeks add up to it.
 *  - Two games between copies — a run that failed for a week — come back as
 *    one stretch covering both.
 *  - Only counting numbers can be subtracted. Yards per carry is worked out
 *    again from the week's own yards and carries; a long run is not a week's.
 *
 * Pure: the job keeps the copies, the page asks this for the weeks.
 */

import type { ParsedStatRow, StatCategory } from '../stats/statsParse';

/** The season's totals as they stood after `games` games. */
export type Snapshot = { games: number; rows: ParsedStatRow[] };

/** The numbers in each category that add up game to game. Everything else is derived or a maximum. */
const COUNTING: Record<StatCategory, string[]> = {
  passing: ['cmp', 'att', 'yds', 'td', 'int'],
  rushing: ['carries', 'yds', 'td'],
  receiving: ['rec', 'yds', 'td'],
  defense: ['tackles', 'solo', 'assist', 'sacks', 'tfl', 'int', 'intRetYds', 'ff', 'fumRec', 'fumRetYds'],
  kicking: ['xpMade', 'xpAtt', 'fgMade', 'fgAtt', 'pts'],
  punting: ['punts', 'yds', 'in20'],
  kickReturn: ['returns', 'yds', 'td'],
  puntReturn: ['returns', 'yds', 'td'],
};

const round = (n: number): number => Math.round(n * 100) / 100;

/** The derived numbers the card prints, worked out again from a week's own counts. */
const derive = (category: StatCategory, v: Record<string, number>): Record<string, number> => {
  const out = { ...v };
  // Every counting field is present by now (see `difference`), but a ratio is
  // only worth printing over something: three carries for nothing is 0.0 a
  // carry, no carries at all is no average.
  const per = (top: number | undefined, under: number | undefined) =>
    top !== undefined && under ? round(top / under) : undefined;
  const set = (field: string, value: number | undefined) => {
    if (value !== undefined) out[field] = value;
  };
  if (category === 'rushing') set('ydsPerCarry', per(v.yds, v.carries));
  if (category === 'receiving') set('ydsPerRec', per(v.yds, v.rec));
  if (category === 'punting') set('ydsPerPunt', per(v.yds, v.punts));
  if (category === 'passing') set('cmpPct', per(v.cmp === undefined ? undefined : 100 * v.cmp, v.att));
  if (category === 'kickReturn' || category === 'puntReturn') set('ydsPerReturn', per(v.yds, v.returns));
  return out;
};

/** One player's counting numbers in one category, summed over however many rows the page gave. */
type Book = Map<string, { name: string; number: string; category: StatCategory; values: Record<string, number> }>;

const book = (rows: ParsedStatRow[]): Book => {
  const out: Book = new Map();
  for (const row of rows) {
    const key = `${row.name}\u0000${row.category}`;
    const entry = out.get(key) ?? { name: row.name, number: row.number, category: row.category, values: {} };
    for (const field of COUNTING[row.category]) {
      const n = row.values[field];
      if (typeof n === 'number' && Number.isFinite(n)) entry.values[field] = (entry.values[field] ?? 0) + n;
    }
    out.set(key, entry);
  }
  return out;
};

/**
 * What changed between two copies, as rows the card can print.
 *
 * A category nobody moved in is left out; one a player did move in keeps all
 * its numbers, zeros included — a quarterback who went 0 for 3 is "0/3", not
 * a line with nothing on it, and three carries for no gain is still three
 * carries.
 *
 * `gamesBetween` is how many games the two copies are apart. A player who is
 * in the later copy and not the earlier one is new to the stats — unless his
 * own games-played count says he has played more games than that, which means
 * he was there all along under another spelling (MaxPreps corrects names). His
 * whole season would otherwise land in one week under one opponent's name, so
 * he is left out of that week instead.
 */
export function difference(before: ParsedStatRow[], after: ParsedStatRow[], gamesBetween = Infinity): ParsedStatRow[] {
  const was = book(before);
  const playedFor = new Map<string, number>();
  for (const row of after) {
    const g = row.values.games;
    if (typeof g === 'number') playedFor.set(row.name, Math.max(playedFor.get(row.name) ?? 0, g));
  }
  const named = new Set(before.map((r) => r.name));
  const rows: ParsedStatRow[] = [];
  for (const [key, now] of book(after)) {
    if (!named.has(now.name) && (playedFor.get(now.name) ?? 0) > gamesBetween) continue;
    const then = was.get(key)?.values ?? {};
    const deltas = COUNTING[now.category].map((field) => [field, round((now.values[field] ?? 0) - (then[field] ?? 0))] as const);
    if (deltas.every(([, d]) => d === 0)) continue;
    // Only fields the source prints for this category: a punter has no
    // in-20 column in some years, and an invented zero would be a claim.
    const values: Record<string, number> = {};
    for (const [field, d] of deltas) {
      if (field in now.values || field in then) values[field] = d;
    }
    rows.push({ name: now.name, number: now.number, category: now.category, values: derive(now.category, values) });
  }
  return rows;
}

/** A game the team has played, from the schedule: what a week is called. */
export type PlayedGame = { date: string; opponent: string };

export type Week = {
  /** The first and last game this covers, counting from 1. */
  from: number;
  to: number;
  /** The game, when it is one: what the week is called. */
  game: PlayedGame | null;
  /** True for the stretch before the first copy, which cannot be split. */
  beforeTracking: boolean;
  rows: ParsedStatRow[];
};

/**
 * The weeks, oldest first. `played` is the team's results in date order, so
 * that game n is `played[n - 1]`; a week covering one game is named for it.
 * Copies are read in games order, and a copy that does not move the count
 * forward is ignored rather than trusted — the job replaces a same-count copy
 * instead of adding one, so two such copies would mean a file that was edited
 * by hand, and the newer one is the one kept.
 */
export function weeksFrom(snapshots: Snapshot[], played: PlayedGame[]): Week[] {
  const ordered: Snapshot[] = [];
  for (const s of [...snapshots].sort((a, b) => a.games - b.games)) {
    if (!Number.isInteger(s.games) || s.games < 1) continue;
    if (ordered.length && ordered[ordered.length - 1].games === s.games) ordered[ordered.length - 1] = s;
    else ordered.push(s);
  }

  const weeks: Week[] = [];
  ordered.forEach((s, i) => {
    const before = i === 0 ? null : ordered[i - 1];
    const from = before ? before.games + 1 : 1;
    const to = s.games;
    weeks.push({
      from,
      to,
      game: from === to ? (played[to - 1] ?? null) : null,
      // A first copy taken after game one is still exactly game one.
      beforeTracking: !before && to > 1,
      rows: before ? difference(before.rows, s.rows, s.games - before.games) : difference([], s.rows),
    });
  });
  return weeks;
}

/**
 * The copies after this run, for the stats job. One copy per games count:
 *  - the count went up — a game was played — so this run's totals are added;
 *  - the count is the same — stats entered over a weekend, or corrected — so
 *    the newest copy is replaced, and the change lands in the newest week;
 *  - the count went back to one or two, which is a new season, so the copies
 *    start again; a smaller dip is a misread or a struck-off game, and that
 *    run's copy is skipped rather than the season's weeks being thrown away.
 * A page that does not say how many games have been played changes nothing.
 */
export function recordSnapshot(existing: Snapshot[] | undefined, games: number | null, rows: ParsedStatRow[]): Snapshot[] {
  const kept = (existing ?? []).filter((s) => Number.isInteger(s.games) && s.games > 0);
  if (games === null || !Number.isInteger(games) || games < 1) return kept;
  const last = kept[kept.length - 1];
  if (!last) return [{ games, rows }];
  // A count that goes back to the start is a new season. One that merely dips
  // — a misread, a duplicate game struck off — is not a reason to throw away
  // every week so far; that run's copy is skipped and the next one carries on.
  if (games < last.games) return games <= 2 ? [{ games, rows }] : kept;
  if (games === last.games) return [...kept.slice(0, -1), { games, rows }];
  return [...kept, { games, rows }];
}
