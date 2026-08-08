import type { Player, Side } from '../types';

/**
 * Turns whatever gets pasted out of a spreadsheet into rows of players.
 *
 * Nothing here throws on bad input: a row we can't make sense of still comes
 * back as an editable row with `issues` on it, because the import screen shows
 * every row for review before anything is saved.
 */

export type FieldKind =
  | 'number'
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'position'
  | 'side'
  | 'height'
  | 'weight'
  | 'grade'
  | 'ignore';

export type Delimiter = 'tab' | 'comma' | 'semicolon' | 'spaces';

export type ParsedRow = {
  player: Player;
  /** Human-readable problems worth flagging in the review table. */
  issues: string[];
  raw: string[];
};

export type ParseResult = {
  rows: ParsedRow[];
  /** Column index -> what we decided it holds. */
  columns: FieldKind[];
  delimiter: Delimiter;
  /** The header row, when the paste had one. */
  header?: string[];
};

// ---------------------------------------------------------------- positions

const OFFENSE = new Set([
  'QB','RB','HB','FB','TB','SB','WR','SE','FL','TE','OL','OT','OG','OC','C','G','T','LT','RT','LG','RG',
]);
const DEFENSE = new Set([
  'DL','DE','DT','NT','NG','LB','ILB','OLB','MLB','WLB','SLB','DB','CB','S','FS','SS','SAF','SAFETY','EDGE',
]);
const SPECIAL = new Set(['K', 'PK', 'P', 'LS', 'H', 'KR', 'PR', 'KOS']);
const OTHER_POS = new Set(['ATH', 'UTIL']);

const ALL_POS = new Set([...OFFENSE, ...DEFENSE, ...SPECIAL, ...OTHER_POS]);

const NAME_SUFFIXES = new Set(['JR', 'JR.', 'SR', 'SR.', 'II', 'III', 'IV', 'V']);

// ------------------------------------------------------------ small helpers

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Strip the wrapping quotes a spreadsheet adds around a field. */
const unquote = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
};

export const splitPositions = (s: string): string[] =>
  clean(s)
    .toUpperCase()
    .split(/[\/,\-|&]|\s+or\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);

export const isPositionValue = (s: string): boolean => {
  const parts = splitPositions(s);
  return parts.length > 0 && parts.length <= 3 && parts.every((p) => ALL_POS.has(p));
};

/** Side of the ball implied by a position string. '' when unknown or both ways. */
export const sideFromPosition = (position: string): Side => {
  const parts = splitPositions(position);
  if (parts.length === 0) return '';
  const sides = new Set<Side>();
  for (const p of parts) {
    if (OFFENSE.has(p)) sides.add('O');
    else if (DEFENSE.has(p)) sides.add('D');
    else if (SPECIAL.has(p)) sides.add('ST');
  }
  // A pure-special-teams player is 'ST'; K/PR alongside a real position isn't.
  if (sides.size === 1) return [...sides][0];
  if (sides.size === 2 && sides.has('ST')) {
    const other = [...sides].find((s) => s !== 'ST');
    return other ?? '';
  }
  return '';
};

export const parseSide = (s: string): Side => {
  const t = clean(s).toUpperCase().replace(/[.\s]/g, '');
  if (['O', 'OFF', 'OFFENSE'].includes(t)) return 'O';
  if (['D', 'DEF', 'DEFENSE'].includes(t)) return 'D';
  if (['ST', 'ST.', 'SPECIAL', 'SPECIALTEAMS', 'STEAMS', 'K'].includes(t)) return 'ST';
  return '';
};

const isSideValue = (s: string): boolean => parseSide(s) !== '';

/** `6'1"`, `6-1`, `6 1`, `6ft1`, or bare inches like `73` -> 73. */
export const parseHeight = (input: string): number | undefined => {
  const s = clean(input).replace(/[”″]/g, '"').replace(/[’′]/g, "'");
  if (!s) return undefined;

  const ftIn = s.match(/^(\d)\s*(?:'|-|ft\.?|feet|\s)\s*(\d{1,2})\s*(?:"|''|in\.?|inches)?$/i);
  if (ftIn) {
    const ft = Number(ftIn[1]);
    const inch = Number(ftIn[2]);
    if (inch < 12) return ft * 12 + inch;
  }

  const ftOnly = s.match(/^(\d)\s*(?:'|ft\.?|feet)$/i);
  if (ftOnly) return Number(ftOnly[1]) * 12;

  // Bare inches, e.g. a "HT" column stored as 73. Constrained to a plausible
  // range so it can't swallow a jersey or weight column.
  const bare = s.match(/^(\d{2,3})$/);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 48 && n <= 90) return n;
  }
  return undefined;
};

const isHeightValue = (s: string): boolean => parseHeight(s) !== undefined;

export const parseWeight = (input: string): number | undefined => {
  const m = clean(input).match(/^(\d{2,3})\s*(?:lbs?\.?|#)?$/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 80 && n <= 450 ? n : undefined;
};

const isWeightValue = (s: string): boolean => parseWeight(s) !== undefined;

const GRADE_WORDS: Record<string, string> = {
  FR: 'Fr', FRESH: 'Fr', FRESHMAN: 'Fr', F: 'Fr',
  SO: 'So', SOPH: 'So', SOPHOMORE: 'So',
  JR: 'Jr', JUN: 'Jr', JUNIOR: 'Jr',
  SR: 'Sr', SEN: 'Sr', SENIOR: 'Sr',
};

export const parseGrade = (input: string): string | undefined => {
  const t = clean(input).toUpperCase().replace(/\./g, '');
  if (!t) return undefined;
  if (GRADE_WORDS[t]) return GRADE_WORDS[t];
  const num = t.match(/^(9|10|11|12)(TH)?$/);
  if (num) return num[1];
  return undefined;
};

const isGradeValue = (s: string): boolean => parseGrade(s) !== undefined;

/** Digits only, with '#' and leading zeros tolerated. */
export const isJerseyValue = (s: string): boolean => /^#?\s*\d{1,2}$/.test(clean(s));

export const normalizeNumber = (s: string): string => clean(s).replace(/^#\s*/, '');

/** How much a value looks like a person's name. */
const nameScore = (s: string): number => {
  const t = clean(s);
  if (t.length < 2) return 0;
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  if (letters / t.length < 0.7) return 0;
  if (isPositionValue(t) || isGradeValue(t)) return 0;
  // Two words, or "Last, First", is a strong signal.
  return /[,\s]/.test(t) ? 1 : 0.5;
};

/** "Smith, John" / "John Smith" / "Smith" -> first + last. */
export const splitName = (input: string): { firstName: string; lastName: string } => {
  const s = clean(input).replace(/\s+,/, ',');
  if (!s) return { firstName: '', lastName: '' };

  if (s.includes(',')) {
    const [last, ...rest] = s.split(',');
    return { firstName: clean(rest.join(' ')), lastName: clean(last) };
  }

  const parts = s.split(' ');
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };

  // Keep "Jr."/"III" attached to the last name rather than treating it as one.
  let suffix = '';
  if (parts.length >= 3 && NAME_SUFFIXES.has(parts[parts.length - 1].toUpperCase())) {
    suffix = ` ${parts.pop()}`;
  }
  const last = parts.pop() ?? '';
  return { firstName: parts.join(' '), lastName: `${last}${suffix}` };
};

// ------------------------------------------------------------ line splitting

export const detectDelimiter = (lines: string[]): Delimiter => {
  const sample = lines.slice(0, 20);
  const consistent = (re: RegExp): number => {
    const counts = sample.map((l) => (l.match(re) ?? []).length);
    const withAny = counts.filter((c) => c > 0).length;
    return withAny / Math.max(1, counts.length);
  };
  if (consistent(/\t/g) > 0.8) return 'tab';
  if (consistent(/,/g) > 0.8) return 'comma';
  if (consistent(/;/g) > 0.8) return 'semicolon';
  return 'spaces';
};

/** Comma/semicolon split that respects double-quoted fields. */
const splitQuoted = (line: string, sep: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => clean(c));
};

export const splitLine = (line: string, delimiter: Delimiter): string[] => {
  switch (delimiter) {
    case 'tab':
      return line.split('\t').map((c) => clean(unquote(c)));
    case 'comma':
      return splitQuoted(line, ',');
    case 'semicolon':
      return splitQuoted(line, ';');
    case 'spaces':
      // Two or more spaces, so "John Smith" stays one field.
      return line.split(/\s{2,}/).map((c) => clean(unquote(c)));
  }
};

// --------------------------------------------------------- header detection

const HEADER_TOKENS: Array<[RegExp, FieldKind]> = [
  [/^#$|^(no|num|number|jersey|jsy|jer)\b\.?\s*#?$|^#\s*$/i, 'number'],
  [/^(first|first\s*name|fname|f\.?\s*name)$/i, 'firstName'],
  [/^(last|last\s*name|lname|l\.?\s*name|surname)$/i, 'lastName'],
  [/^(name|player|player\s*name|athlete|student)$/i, 'name'],
  [/^(pos|position|pos\.)$/i, 'position'],
  [/^(ht|ht\.|height)$/i, 'height'],
  [/^(wt|wt\.|weight|lbs?)$/i, 'weight'],
  [/^(gr|grade|yr|year|class|cl|gr\.)$/i, 'grade'],
  [/^(side|unit|squad|o\/d)$/i, 'side'],
];

const headerKind = (cell: string): FieldKind | undefined => {
  const t = clean(cell).replace(/\.$/, '');
  if (!t) return undefined;
  for (const [re, kind] of HEADER_TOKENS) if (re.test(t)) return kind;
  return undefined;
};

const looksLikeHeader = (cells: string[]): boolean => {
  const named = cells.filter((c) => headerKind(c) !== undefined).length;
  const nonEmpty = cells.filter((c) => clean(c) !== '').length;
  return nonEmpty > 0 && named >= 2 && named / nonEmpty >= 0.5;
};

// ------------------------------------------------------- column inference

type Classifier = { kind: FieldKind; test: (s: string) => boolean; priority: number };

const CLASSIFIERS: Classifier[] = [
  { kind: 'height', test: isHeightValue, priority: 6 },
  { kind: 'weight', test: isWeightValue, priority: 5 },
  { kind: 'side', test: isSideValue, priority: 4 },
  { kind: 'position', test: isPositionValue, priority: 4 },
  { kind: 'grade', test: isGradeValue, priority: 3 },
  { kind: 'number', test: isJerseyValue, priority: 2 },
];

/**
 * Score every column against every field kind, then assign greedily by
 * confidence. Each column and each kind is used at most once.
 */
const inferColumns = (rows: string[][], width: number): FieldKind[] => {
  const columns: FieldKind[] = new Array(width).fill('ignore');
  const cols: string[][] = [];
  for (let c = 0; c < width; c++) cols.push(rows.map((r) => r[c] ?? '').filter((v) => v !== ''));

  type Candidate = { col: number; kind: FieldKind; score: number; priority: number };
  const candidates: Candidate[] = [];

  for (let c = 0; c < width; c++) {
    const values = cols[c];
    if (values.length === 0) continue;
    const distinct = new Set(values.map((v) => v.toUpperCase()));

    for (const { kind, test, priority } of CLASSIFIERS) {
      let score = values.filter(test).length / values.length;
      if (score < 0.6) continue;

      // A column of only 9/10/11/12 is a grade column, not jersey numbers.
      const gradeShaped = distinct.size <= 5 && [...distinct].every((v) => isGradeValue(v));
      if (kind === 'number' && gradeShaped) score -= 0.5;
      if (kind === 'grade' && gradeShaped) score += 0.3;
      // Jersey numbers are mostly unique across a roster; grades never are.
      if (kind === 'number' && distinct.size / values.length > 0.8) score += 0.3;

      if (score >= 0.6) candidates.push({ col: c, kind, score, priority });
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.priority - a.priority);
  const usedCols = new Set<number>();
  const usedKinds = new Set<FieldKind>();
  for (const cand of candidates) {
    if (usedCols.has(cand.col) || usedKinds.has(cand.kind)) continue;
    columns[cand.col] = cand.kind;
    usedCols.add(cand.col);
    usedKinds.add(cand.kind);
  }

  // Whatever is left over: the most name-like column becomes the name.
  if (!usedKinds.has('name') && !usedKinds.has('lastName')) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < width; c++) {
      if (usedCols.has(c) || cols[c].length === 0) continue;
      const score = cols[c].reduce((sum, v) => sum + nameScore(v), 0) / cols[c].length;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best >= 0 && bestScore >= 0.4) {
      columns[best] = 'name';
      usedCols.add(best);
      usedKinds.add('name');
    }
  }

  // A second leftover name-ish column is usually "First" next to "Last".
  if (usedKinds.has('name')) {
    for (let c = 0; c < width; c++) {
      if (usedCols.has(c) || cols[c].length === 0) continue;
      const score = cols[c].reduce((sum, v) => sum + nameScore(v), 0) / cols[c].length;
      if (score >= 0.4) {
        const nameCol = columns.indexOf('name');
        // Spreadsheets put Last before First about as often as the reverse;
        // go with column order and let the review table fix the rare miss.
        columns[nameCol] = c < nameCol ? 'lastName' : 'firstName';
        columns[c] = c < nameCol ? 'firstName' : 'lastName';
        break;
      }
    }
  }

  return columns;
};

// ------------------------------------------------- loose (single-space) rows

/** Fixed layout used when a paste has no real delimiter to split on. */
const LOOSE_COLUMNS: FieldKind[] = [
  'number', 'name', 'position', 'height', 'weight', 'grade', 'side',
];

/**
 * Last resort for lines like `7 John Smith WR 6-1 175 Jr`, where a plain space
 * separates fields but also separates first and last name. Peels the jersey
 * number off the front and the typed fields off the back; whatever survives in
 * the middle is the name.
 */
const looseSplit = (line: string): string[] => {
  const out = ['', '', '', '', '', '', ''];
  const tokens = clean(line).split(' ');

  if (tokens.length > 1 && isJerseyValue(tokens[0])) out[0] = normalizeNumber(tokens.shift() as string);

  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];

    // A height can arrive as two tokens: 6' 1"
    if (tokens.length > 2 && !out[3]) {
      const pair = `${tokens[tokens.length - 2]} ${last}`;
      if (isHeightValue(pair)) {
        out[3] = pair;
        tokens.splice(-2, 2);
        continue;
      }
    }
    if (!out[5] && isGradeValue(last)) { out[5] = last; tokens.pop(); continue; }
    if (!out[4] && isWeightValue(last)) { out[4] = last; tokens.pop(); continue; }
    if (!out[3] && isHeightValue(last)) { out[3] = last; tokens.pop(); continue; }
    if (!out[2] && isPositionValue(last)) { out[2] = last; tokens.pop(); continue; }
    if (!out[6] && isSideValue(last)) { out[6] = last; tokens.pop(); continue; }
    break;
  }

  out[1] = tokens.join(' ');
  return out;
};

// --------------------------------------------------------------- main entry

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

const blankPlayer = (): Player => ({
  id: newId(),
  number: '',
  firstName: '',
  lastName: '',
  position: '',
  side: '',
});

/** Turn one row of raw cells into a player, given what each column holds. */
const buildRow = (raw: string[], columns: FieldKind[]): ParsedRow => {
  const player = blankPlayer();
  let explicitSide: Side = '';
  let nameCombined = '';
  const issues: string[] = [];

  columns.forEach((kind, i) => {
    const value = raw[i] ?? '';
    if (!value) return;
    switch (kind) {
      case 'number':
        player.number = normalizeNumber(value);
        break;
      case 'name':
        nameCombined = value;
        break;
      case 'firstName':
        player.firstName = clean(value);
        break;
      case 'lastName':
        player.lastName = clean(value);
        break;
      case 'position':
        player.position = clean(value).toUpperCase();
        break;
      case 'side':
        explicitSide = parseSide(value);
        break;
      case 'height': {
        const h = parseHeight(value);
        if (h === undefined) issues.push(`Couldn't read height "${value}"`);
        else player.heightIn = h;
        break;
      }
      case 'weight': {
        const w = parseWeight(value);
        if (w === undefined) issues.push(`Couldn't read weight "${value}"`);
        else player.weightLb = w;
        break;
      }
      case 'grade':
        player.grade = parseGrade(value) ?? clean(value);
        break;
      case 'ignore':
        break;
    }
  });

  if (nameCombined) {
    const { firstName, lastName } = splitName(nameCombined);
    player.firstName = firstName;
    player.lastName = lastName;
  }

  player.side = explicitSide || sideFromPosition(player.position);

  if (!player.number) issues.push('No jersey number');
  if (!player.firstName && !player.lastName) issues.push('No name');

  return { player, issues, raw };
};

export const parseRoster = (text: string): ParseResult => {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '');

  if (lines.length === 0) {
    return { rows: [], columns: [], delimiter: 'tab' };
  }

  const delimiter = detectDelimiter(lines);
  let cells = lines.map((l) => splitLine(l, delimiter));

  let header: string[] | undefined;
  if (looksLikeHeader(cells[0])) {
    header = cells[0];
    cells = cells.slice(1);
  }

  // Nothing to split on: fall back to peeling fields off single-spaced lines.
  const unsplit = cells.filter((r) => r.length < 2).length / Math.max(1, cells.length);
  if (delimiter === 'spaces' && unsplit > 0.6) {
    let loose = cells.map((r) => r.join(' '));
    if (!header && looksLikeHeader(clean(loose[0]).split(' '))) {
      header = clean(loose[0]).split(' ');
      loose = loose.slice(1);
    }
    return {
      rows: loose.map((line) => buildRow(looseSplit(line), LOOSE_COLUMNS)),
      columns: LOOSE_COLUMNS,
      delimiter,
      header,
    };
  }

  const width = cells.reduce((w, r) => Math.max(w, r.length), header?.length ?? 0);
  cells = cells.map((r) => {
    const padded = r.slice();
    while (padded.length < width) padded.push('');
    return padded;
  });

  let columns: FieldKind[];
  if (header) {
    columns = new Array(width).fill('ignore');
    header.forEach((cell, i) => {
      const kind = headerKind(cell);
      if (kind && !columns.includes(kind)) columns[i] = kind;
    });
    // If we recognised nothing in the header, treat the data as unlabelled.
    if (columns.every((c) => c === 'ignore')) columns = inferColumns(cells, width);
  } else {
    columns = inferColumns(cells, width);
  }

  const rows: ParsedRow[] = cells.map((raw) => buildRow(raw, columns));

  return { rows, columns, delimiter, header };
};

/** Matching key for a jersey number: digits, leading zeros dropped. */
export const numberKey = (s: string): string => {
  const digits = s.replace(/\D/g, '');
  return digits.replace(/^0+(?=\d)/, '');
};

/** True when `query` is a prefix of this jersey number ("7" matches 7 and 72). */
export const numberMatches = (playerNumber: string, query: string): boolean => {
  if (!query) return true;
  const qDigits = query.replace(/\D/g, '');
  const pDigits = playerNumber.replace(/\D/g, '');
  return numberKey(playerNumber).startsWith(numberKey(query)) || pDigits.startsWith(qDigits);
};
