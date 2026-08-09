/*
 * Parses stats tables copied out of Hudl.
 *
 * Copying an HTML table out of a browser gives tab-separated cells and one row
 * per line, so the shape is predictable — but the columns are not. Hudl prints
 * a different set for every category, and two of them (kick returns and punt
 * returns) are column-for-column identical. So this reads the header row to
 * learn the columns, and leans on the "… Stats" heading above it to tell those
 * two apart.
 *
 * Everything here is pure, so the awkward real-world pastes can be pinned down
 * in tests rather than discovered at a game.
 */

export type StatCategory =
  | 'passing'
  | 'rushing'
  | 'receiving'
  | 'defense'
  | 'kicking'
  | 'punting'
  | 'kickReturn'
  | 'puntReturn';

export const CATEGORY_LABEL: Record<StatCategory, string> = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
  defense: 'Defense',
  kicking: 'Kicking',
  punting: 'Punting',
  kickReturn: 'Kick returns',
  puntReturn: 'Punt returns',
};

/** One player's numbers for one category. Absent fields simply weren't printed. */
export type StatValues = Record<string, number>;

export type ParsedStatRow = {
  /** As printed, e.g. "D. Xipolitas". */
  name: string;
  /** Jersey number from the table, kept only to help a human resolve clashes. */
  number: string;
  category: StatCategory;
  values: StatValues;
};

export type ParseStatsResult = {
  rows: ParsedStatRow[];
  /** Categories that had at least one usable row. */
  categories: StatCategory[];
  /** Header rows we recognised but whose category we couldn't name. */
  skippedTables: number;
};

/*
 * Column heading -> field name, per category. Headings are matched after being
 * squashed to lowercase with runs of spaces collapsed, so "FUM REC" and
 * "Fum  Rec" land on the same key.
 */
const COLUMNS: Record<StatCategory, Record<string, string>> = {
  passing: {
    games: 'games', cmp: 'cmp', att: 'att', 'cmp %': 'cmpPct', yds: 'yds',
    'yds/att': 'ydsPerAtt', 'yds/game': 'ydsPerGame', lng: 'lng', td: 'td',
    int: 'int', sacked: 'sacked', rat: 'rating',
  },
  rushing: {
    games: 'games', carries: 'carries', yds: 'yds', 'yds/carry': 'ydsPerCarry',
    'yds/game': 'ydsPerGame', lng: 'lng', td: 'td', fum: 'fum',
  },
  receiving: {
    games: 'games', rec: 'rec', yds: 'yds', 'yds/rec': 'ydsPerRec',
    'yds/game': 'ydsPerGame', lng: 'lng', td: 'td', fum: 'fum',
  },
  defense: {
    games: 'games', tackle: 'tackles', solo: 'solo', assist: 'assist',
    sack: 'sacks', tfl: 'tfl', safety: 'safety', int: 'int',
    'int ret yds': 'intRetYds', ff: 'ff', 'fum rec': 'fumRec',
    'fum ret yds': 'fumRetYds', 'def td': 'defTd',
  },
  kicking: {
    games: 'games', 'fgm/fga': 'fg', 'fg %': 'fgPct', lng: 'lng',
    'xpm/xpa': 'xp', 'xp %': 'xpPct', pts: 'pts',
  },
  punting: {
    games: 'games', punts: 'punts', yds: 'yds', 'yds/punt': 'ydsPerPunt',
    'yds/game': 'ydsPerGame', 'in 20': 'in20', lng: 'lng',
  },
  kickReturn: {
    games: 'games', returns: 'returns', yds: 'yds', 'yds/return': 'ydsPerReturn',
    'yds/game': 'ydsPerGame', td: 'td', lng: 'lng',
  },
  puntReturn: {
    games: 'games', returns: 'returns', yds: 'yds', 'yds/return': 'ydsPerReturn',
    'yds/game': 'ydsPerGame', td: 'td', lng: 'lng',
  },
};

/** Columns holding "made / attempted", which become two fields. */
const PAIRS: Record<string, [string, string]> = {
  fg: ['fgMade', 'fgAtt'],
  xp: ['xpMade', 'xpAtt'],
};

const squash = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const splitCells = (line: string): string[] => {
  // Tabs when copied from a browser; two-plus spaces when it has been through
  // a plain-text editor on the way.
  const cells = line.includes('\t') ? line.split('\t') : line.split(/ {2,}/);
  return cells.map((c) => c.trim());
};

/**
 * Hudl prints "1,006", "58.70 %", "-" for nothing, and "(47.37 %) 36" in the
 * team summary. Only a leading number is ever wanted.
 */
const toNumber = (raw: string): number | undefined => {
  const cleaned = raw.replace(/,/g, '').replace(/%/g, '').replace(/[()]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '—') return undefined;
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : undefined;
};

/** "3 / 5" -> [3, 5]. */
const toPair = (raw: string): [number | undefined, number | undefined] => {
  const [a, b] = raw.split('/');
  return [toNumber(a ?? ''), toNumber(b ?? '')];
};

/** Which category a header row belongs to, using the heading above it to break ties. */
const categoryFor = (headings: string[], heading: string): StatCategory | null => {
  const has = (h: string) => headings.includes(h);

  if (has('cmp') && has('att')) return 'passing';
  if (has('carries')) return 'rushing';
  if (has('rec')) return 'receiving';
  if (has('tackle')) return 'defense';
  if (has('fgm/fga') || has('xpm/xpa')) return 'kicking';
  if (has('punts')) return 'punting';

  // Identical columns; only the heading above the table separates them.
  if (has('returns')) {
    if (/punt/.test(heading)) return 'puntReturn';
    if (/kick/.test(heading)) return 'kickReturn';
    return null;
  }
  return null;
};

const isHeaderRow = (cells: string[]): boolean =>
  cells.some((c) => squash(c) === 'name') && cells.some((c) => squash(c) === 'games');

/** Rows that are totals, blanks or the "Rest of team" catch-all carry no player. */
const isSkippableRow = (name: string): boolean => {
  const n = squash(name);
  return !n || n.startsWith('total') || n.startsWith('rest of team');
};

export function parseStats(input: string): ParseStatsResult {
  const rows: ParsedStatRow[] = [];
  const categories = new Set<StatCategory>();
  let skippedTables = 0;

  let heading = '';
  let category: StatCategory | null = null;
  let columns: string[] = [];
  let nameAt = -1;
  let numberAt = -1;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const cells = splitCells(line);

    // A lone "Passing Stats" line: remember it for the table that follows.
    if (cells.length === 1) {
      heading = squash(cells[0]);
      continue;
    }

    if (isHeaderRow(cells)) {
      const squashed = cells.map(squash);
      category = categoryFor(squashed, heading);
      if (!category) {
        skippedTables += 1;
        columns = [];
        continue;
      }
      const map = COLUMNS[category];
      columns = squashed.map((h) => map[h] ?? '');
      nameAt = squashed.indexOf('name');
      numberAt = squashed.indexOf('#');
      continue;
    }

    if (!category || nameAt < 0 || nameAt >= cells.length) continue;

    const name = cells[nameAt];
    if (isSkippableRow(name)) continue;

    const values: StatValues = {};
    cells.forEach((cell, i) => {
      const field = columns[i];
      if (!field) return;
      if (PAIRS[field]) {
        const [made, att] = toPair(cell);
        const [madeKey, attKey] = PAIRS[field];
        if (made !== undefined) values[madeKey] = made;
        if (att !== undefined) values[attKey] = att;
        return;
      }
      const n = toNumber(cell);
      if (n !== undefined) values[field] = n;
    });

    // A row with nothing but a name is noise, not a player who did nothing.
    if (Object.keys(values).length === 0) continue;

    rows.push({
      name,
      number: numberAt >= 0 ? (cells[numberAt] ?? '').trim() : '',
      category,
      values,
    });
    categories.add(category);
  }

  return { rows, categories: [...categories], skippedTables };
}
