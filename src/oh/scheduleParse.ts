/*
 * Parses schedule rows pasted out of a spreadsheet or a school's site.
 *
 * The directory can feed football fixtures for every school in the state,
 * but no scrapeable source exists for volleyball or basketball — so those
 * schedules arrive the way rosters do: the seller pastes, this reads it,
 * and the panel shows what it made before anything is saved. Cells are
 * classified by what they contain rather than which column they sat in,
 * because every school's spreadsheet is laid out differently.
 *
 * Everything here is pure and pinned in tests, the same bargain every
 * parser in this repo makes.
 */

export type ScheduleScore = { us: number; them: number };

export type ScheduleRow = {
  /** ISO date, e.g. "2026-11-27". */
  date: string;
  opponent: string;
  home: boolean;
  /** Kickoff/tip as printed for a fan, e.g. "7:00 PM". */
  time?: string;
  /** Ours first. Absent means the game hasn't been played (or reported). */
  score?: ScheduleScore;
};

export type ParsedSchedule = {
  rows: ScheduleRow[];
  skipped: { text: string; issue: string }[];
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * A date with no year files under the season's clock: July onward is the
 * season's own year, January–June the one after — a basketball season
 * labelled 2026 plays its February games in 2027.
 */
const yearFor = (month: number, seasonYear: number): number =>
  month >= 7 ? seasonYear : seasonYear + 1;

const parseDate = (cell: string, seasonYear: number): string | null => {
  const iso = cell.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return cell;

  const slash = cell.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const year = slash[3]
      ? Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3])
      : yearFor(month, seasonYear);
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const named = cell.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
  if (named) {
    const month = MONTH_NAMES[named[1].slice(0, 3).toLowerCase()];
    const day = Number(named[2]);
    if (!month || day < 1 || day > 31) return null;
    const year = named[3] ? Number(named[3]) : yearFor(month, seasonYear);
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  return null;
};

const parseTime = (cell: string): string | null => {
  const m = cell.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour < 1 || hour > 12) return null;
  return `${hour}:${m[2] ?? '00'} ${m[3].toUpperCase()}M`;
};

/** true = home, false = away, null = this cell isn't a home/away marker. */
const parseHomeAway = (cell: string): boolean | null => {
  const v = cell.trim().toLowerCase();
  if (v === 'h' || v === 'home' || v === 'vs' || v === 'vs.') return true;
  if (v === 'a' || v === 'away' || v === 'at' || v === '@') return false;
  return null;
};

/** "W 3-1", "L 1–3", or a bare "45-21". The first number is always ours —
 * the letter is a marker people type, not a field anyone trusts. */
const parseScore = (cell: string, dateClaimed: boolean): ScheduleScore | null => {
  const marked = cell.match(/^[WLwl]\s+(\d+)\s*[-–]\s*(\d+)$/);
  if (marked) return { us: Number(marked[1]), them: Number(marked[2]) };
  if (!dateClaimed) return null;
  const bare = cell.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  return bare ? { us: Number(bare[1]), them: Number(bare[2]) } : null;
};

export function parseSchedule(text: string, seasonYear: number): ParsedSchedule {
  const rows: ScheduleRow[] = [];
  const skipped: ParsedSchedule['skipped'] = [];

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/))
      .map((c) => c.trim())
      .filter(Boolean);

    let date: string | null = null;
    let dateAt = -1;
    let opponent: string | null = null;
    let home: boolean | null = null;
    let homeAt = -1;
    let time: string | undefined;
    let score: ScheduleScore | undefined;
    /** Cells no classifier wanted, in the order they were pasted. One of
     * these is the opponent; which one is decided after the whole line has
     * been read. */
    const spare: { at: number; text: string }[] = [];

    cells.forEach((cell, at) => {
      if (!date) {
        const d = parseDate(cell, seasonYear);
        if (d) { date = d; dateAt = at; return; }
      }
      const s = parseScore(cell, date !== null);
      if (s && !score) { score = s; return; }
      const t = parseTime(cell);
      if (t && !time) { time = t; return; }
      const ha = parseHomeAway(cell);
      if (ha !== null && home === null) { home = ha; homeAt = at; return; }
      spare.push({ at, text: cell });
    });

    // The opponent is the first spare cell to the RIGHT of the date, because
    // a spreadsheet that leads with a Day or Week column — "Fri", "Wk 1" —
    // is as ordinary as one that leads with the date, and the leading cell
    // used to walk off with the opponent slot. A cell before the date is
    // still better than no opponent at all, so it remains the fallback.
    const pick = spare.find((c) => c.at > dateAt) ?? spare[0];
    if (pick) {
      // The opponent may carry its own venue marker: "@ Canfield".
      const marked = pick.text.match(/^(?:@|at|vs\.?)\s+(.+)$/i);
      if (marked) {
        opponent = marked[1];
        // First cell to speak wins, the same rule every other field follows
        // — so a separate H/A column only loses to the marker if the
        // opponent sat to its left.
        if (home === null || pick.at < homeAt) home = /^vs/i.test(pick.text);
      } else {
        opponent = pick.text;
      }
    }

    const raw = cells.join(' ');
    if (!date) { skipped.push({ text: raw, issue: 'no date on this line' }); continue; }
    if (!opponent) { skipped.push({ text: raw, issue: 'no opponent on this line' }); continue; }

    const row: ScheduleRow = { date, opponent, home: home ?? true };
    if (time) row.time = time;
    if (score) row.score = score;
    rows.push(row);
  }

  return { rows, skipped };
}
