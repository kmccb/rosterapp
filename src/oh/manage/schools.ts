/*
 * The database's rows, as the seller thinks of them.
 *
 * school_roster holds one row per school, sport and season, and for its first
 * year the panel listed exactly that: three lines for a school with three
 * sports, each to be opened to find out how it was doing. But a school is what
 * gets sold, renewed and taken down, and a sport is a part of one. This folds
 * the rows into schools and answers, for each, the only question the list is
 * there for — does anything here need me?
 *
 * Pure, so the answer is pinned by tests rather than by somebody remembering
 * what "expired" meant in February.
 */

import type { RosterRow } from './adminApi';
import { rowProblems } from './sources';

/**
 * Worst first, because that is the order to read them in:
 *  - `attention` — a linked sheet or calendar is being refused. Fans still see
 *    the last good copy, so nothing is on fire, but it will not fix itself.
 *  - `expired` — published, and every published sport is past its date: the
 *    page has gone dark and somebody may be about to ask why.
 *  - `live` — at least one sport is published and paid for.
 *  - `unpublished` — saved and not yet shown to anybody.
 */
export type SchoolStatus = 'attention' | 'expired' | 'live' | 'unpublished';

export const STATUS_LABEL: Record<SchoolStatus, string> = {
  attention: 'Needs a look',
  expired: 'Expired',
  live: 'Live',
  unpublished: 'Unpublished',
};

export type SchoolGroup = {
  slug: string;
  /** Football first, then by name; within a sport, the newest season first. */
  rows: RosterRow[];
  status: SchoolStatus;
  /** The latest date any of its sports is paid to — what a renewal moves. */
  paidThrough: string | null;
  problems: string[];
};

const bySport = (a: RosterRow, b: RosterRow): number =>
  Number(b.sport === 'football') - Number(a.sport === 'football') ||
  a.sport.localeCompare(b.sport) ||
  b.season - a.season;

export const rowIsLive = (row: RosterRow, today: string): boolean =>
  row.published && row.paid_through >= today;

export function schoolStatus(rows: RosterRow[], today: string): SchoolStatus {
  const published = rows.filter((r) => r.published);
  if (published.some((r) => rowProblems(r).length > 0)) return 'attention';
  if (published.some((r) => r.paid_through >= today)) return 'live';
  return published.length ? 'expired' : 'unpublished';
}

/** `today` is a plain `YYYY-MM-DD`, the same clock the paid-through field uses. */
export function groupSchools(rows: RosterRow[], today: string): SchoolGroup[] {
  const bySlug = new Map<string, RosterRow[]>();
  for (const row of rows) {
    const list = bySlug.get(row.school_slug);
    if (list) list.push(row);
    else bySlug.set(row.school_slug, [row]);
  }

  const order: SchoolStatus[] = ['attention', 'expired', 'live', 'unpublished'];
  return [...bySlug]
    .map(([slug, list]) => {
      const sorted = [...list].sort(bySport);
      return {
        slug,
        rows: sorted,
        status: schoolStatus(sorted, today),
        paidThrough: sorted.reduce<string | null>(
          (latest, r) => (latest === null || r.paid_through > latest ? r.paid_through : latest),
          null,
        ),
        problems: sorted.flatMap(rowProblems),
      };
    })
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.slug.localeCompare(b.slug));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-02-01" → "Feb 1, 2027". A calendar day, never shifted by a zone. */
export const longDate = (iso: string | null): string => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : '—';
};

export const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A year on from whichever is later, the date already paid to or today — so
 * renewing early does not throw away the months still owed, and renewing a
 * lapsed school does not sell it a year that is already half over.
 */
export const renewedThrough = (paidThrough: string | null, today: string): string => {
  const from = paidThrough && paidThrough > today ? paidThrough : today;
  const [y, m, d] = from.split('-').map(Number);
  // Feb 29 has no anniversary three years in four; the 28th is the day meant.
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** The sports a school can be sold, in the order the picker offers them. */
export const SPORTS = [
  'football', 'volleyball', 'soccer', 'cross country', 'golf', 'tennis', 'cheer',
  'basketball', 'wrestling', 'swimming', 'hockey', 'bowling',
  'baseball', 'softball', 'track', 'lacrosse',
];
