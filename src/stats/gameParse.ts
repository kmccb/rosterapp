/*
 * Parses one game's tables copied out of Hudl's Game Stats page.
 *
 * That page is shaped differently from the season page: sections headed
 * Offense, Defense and Special Teams; a table's category in its first header
 * cell ("Passing", "Kickoff Returns") — except Defense, whose header starts
 * with a blank cell and takes its name from the section; and both teams on
 * the page, ours first in every section, then the opponent's with the same
 * headers. So this keeps the first table it sees for a category and skips
 * the repeat.
 *
 * Column names are mapped onto the season parser's field names so one
 * summariser serves both. Where Hudl prints an average instead of yards
 * (punts, returns) the yards are recovered as average × count, rounded, so a
 * season can be summed from games.
 */

import type { ParsedStatRow, StatCategory } from './statsParse';

type ColumnMap = Record<string, string>;

/** First header cell (squashed) → category. Defense is matched separately. */
const TABLE_CATEGORY: Record<string, StatCategory> = {
  passing: 'passing',
  rushing: 'rushing',
  receiving: 'receiving',
  kicking: 'kicking',
  punting: 'punting',
  'kickoff returns': 'kickReturn',
  'punt returns': 'puntReturn',
};

/** Squashed game-page heading → season field name. Unlisted headings are ignored. */
const COLUMNS: Record<StatCategory, ColumnMap> = {
  passing: { 'comp/att': 'comp/att', yds: 'yds', td: 'td', int: 'int', long: 'lng' },
  rushing: { att: 'carries', yds: 'yds', td: 'td', long: 'lng', fum: 'fum' },
  receiving: { rec: 'rec', yds: 'yds', td: 'td', long: 'lng', fum: 'fum' },
  defense: {
    tk: 'tackles', ast: 'assist', sck: 'sacks', tfl: 'tfl', sfty: 'safety', int: 'int',
    fum: 'fum', blks: 'blocks', td: 'defTd',
  },
  kicking: { fg: 'fgMade', pat: 'xpMade', pts: 'pts' },
  punting: { num: 'punts', avg: 'ydsPerPunt', 'in 20': 'in20', long: 'lng' },
  kickReturn: { ret: 'returns', avg: 'ydsPerReturn', td: 'td', long: 'lng' },
  puntReturn: { ret: 'returns', avg: 'ydsPerReturn', td: 'td', long: 'lng' },
};

/** Yards recovered from an average, per category: [count field, average field]. */
const YARDS_FROM_AVERAGE: Partial<Record<StatCategory, [string, string]>> = {
  punting: ['punts', 'ydsPerPunt'],
  kickReturn: ['returns', 'ydsPerReturn'],
  puntReturn: ['returns', 'ydsPerReturn'],
};

const squash = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const splitCells = (line: string): string[] => {
  const cells = line.includes('\t') ? line.split('\t') : line.split(/ {2,}/);
  return cells.map((c) => c.trim());
};

const toNumber = (raw: string): number | undefined => {
  const cleaned = raw.replace(/,/g, '').replace(/%/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '—') return undefined;
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : undefined;
};

/** "#12 C. Scott" → { number: "12", name: "C. Scott" }; "J. Mayhew" → no number. */
const splitName = (cell: string): { number: string; name: string } => {
  const m = cell.trim().match(/^#(\d+)\s*(.*)$/);
  if (m) return { number: m[1], name: m[2].trim() };
  return { number: '', name: cell.trim() };
};

// The first cell is normally blank, but a paste that lost its leading tab
// shifts "Tk" into it — so this is Defense whenever both signature columns
// show up, not only when the first cell is empty.
const isDefenseHeader = (squashed: string[]): boolean =>
  squashed.includes('tk') && squashed.includes('ast');

const categoryOfHeader = (squashed: string[]): StatCategory | null => {
  if (isDefenseHeader(squashed)) return 'defense';
  return TABLE_CATEGORY[squashed[0]] ?? null;
};

/*
 * A data cell is a number, a dash, a pair ("6/11") or a percentage. A header
 * row has none of those after its first cell — "2PT" and "In 20" contain
 * digits but are not numbers. Recognising headers by shape rather than by
 * name is what stops the Kickoff table (Num, Yrds, Long, TB), which this app
 * has no category for, from being read as more rows of the table before it.
 */
const DATA_CELL = /^(-|-?\d+(\.\d+)?( ?%)?|\d+\/\d+)$/;
const looksLikeHeader = (cells: string[]): boolean =>
  cells.length > 1 && !cells.slice(1).some((c) => DATA_CELL.test(c.trim()));

export function parseGameStats(input: string): { rows: ParsedStatRow[]; categories: StatCategory[] } {
  const rows: ParsedStatRow[] = [];
  const seen = new Set<StatCategory>();

  let category: StatCategory | null = null;
  let columns: string[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const cells = splitCells(line);

    // Section headings and "No Punt Returns" are single cells; nothing to keep.
    if (cells.length === 1) continue;

    if (looksLikeHeader(cells)) {
      const squashed = cells.map(squash);
      const headerCategory = categoryOfHeader(squashed);
      // No category for it (Kickoff), or the opponent's copy of one already
      // read: read nothing until the next header this app wants.
      if (!headerCategory || seen.has(headerCategory)) {
        category = null;
        columns = [];
        continue;
      }
      seen.add(headerCategory);
      category = headerCategory;
      const map = COLUMNS[category];
      columns = squashed.map((h) => map[h] ?? '');
      // Defense's header normally starts with the blank cell that keeps every
      // row's data columns lined up with the header's. A paste that lost the
      // leading tab eats that cell instead of just emptying it, which would
      // shift every value one column early — so it's put back here.
      if (headerCategory === 'defense' && squashed[0] !== '') columns = ['', ...columns];
      continue;
    }

    if (!category) continue;

    const { number, name } = splitName(cells[0]);
    if (!name || squash(name).startsWith('rest of team')) continue;

    const values: Record<string, number> = {};
    for (let i = 1; i < cells.length && i < columns.length; i += 1) {
      const field = columns[i];
      if (!field) continue;
      if (field === 'comp/att') {
        const [c, a] = cells[i].split('/');
        const cmp = toNumber(c ?? '');
        const att = toNumber(a ?? '');
        if (cmp !== undefined) values.cmp = cmp;
        if (att !== undefined) values.att = att;
        continue;
      }
      const n = toNumber(cells[i]);
      if (n !== undefined) values[field] = n;
    }

    const derived = YARDS_FROM_AVERAGE[category];
    if (derived) {
      const [count, avg] = derived;
      if (values[count] !== undefined && values[avg] !== undefined) {
        values.yds = Math.round(values[count] * values[avg]);
      }
    }

    if (Object.keys(values).length === 0) continue;
    rows.push({ name, number, category, values });
  }

  const categories = [...new Set(rows.map((r) => r.category))];
  return { rows, categories };
}
