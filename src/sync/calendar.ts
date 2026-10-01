import type { ScheduleRow } from '../oh/scheduleParse';
import { tidyOpponent } from '../schedule/icalParse';

/*
 * A school's calendar, read into the same rows a pasted schedule makes.
 *
 * Poland's football parser (src/schedule/icalParse.ts) is in Poland's bundle
 * and is not touched; this is the any-sport reader the paid tier needs. It
 * knows three ways a game is titled — Eventlink's "Sport (Gender Level) - X"
 * and "@ X", ScheduleStar's pipes, and a plain "vs X" / "at X" — and treats
 * anything else as not a game. Calendars carry fixtures, never results.
 */

export type ScheduleVerdict =
  | { ok: true; rows: ScheduleRow[]; skipped: number }
  | { ok: false; reason: string };

const unfold = (text: string): string => text.replace(/\r?\n[ \t]/g, '');

const field = (body: string, key: string): string => {
  const m = body.match(new RegExp(`^${key}[^:\\r\\n]*:(.*)$`, 'm'));
  return m
    ? m[1].trim().replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ').trim()
    : '';
};

const clock = (hh: number, mm: number): string =>
  `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;

/**
 * A DTSTART value as an Ohio fan reads it. A zoned or floating stamp is the
 * wall clock the school typed, printed as is. A UTC stamp is moved to Eastern,
 * because a 7pm Friday game is midnight Saturday in UTC.
 */
export function readStart(value: string): { date: string; time?: string } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, z] = m;
  if (!hh) return { date: `${y}-${mo}-${d}` };
  if (!z) return { date: `${y}-${mo}-${d}`, time: clock(+hh, +mm) };

  const at = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: clock(+parts.hour, +parts.minute) };
}

const EVENTLINK = /^.+?\([^)]*\)\s*([-@])\s*(.+)$/;
// Eventlink puts banquets and picture days in the same feed, titled the same
// way; a real fixture names a school.
const NAMES_A_SCHOOL = /\b(high\s+school|hs|academy|college|school)\b/i;
const PLAIN = /(?:^|\s)(vs\.?|versus|at|@)\s+(.+)$/i;

export function readOpponent(summary: string): { opponent: string; home: boolean } | null {
  const el = summary.match(EVENTLINK);
  if (el) {
    if (!NAMES_A_SCHOOL.test(el[2])) return null;
    return { opponent: tidyOpponent(el[2]), home: el[1] === '-' };
  }

  if (summary.includes('|')) {
    const [matchup = '', , venue = ''] = summary.split('|').map((s) => s.trim());
    const sides = matchup.split(/\s+(?:vs\.?|at|@)\s+/i);
    if (sides.length < 2) return null;
    return { opponent: tidyOpponent(sides[1]), home: /^home/i.test(venue) };
  }

  const plain = summary.match(PLAIN);
  if (!plain) return null;
  const opponent = tidyOpponent(plain[2]);
  return opponent ? { opponent, home: !/^(at|@)$/i.test(plain[1]) } : null;
}

export function calendarToSchedule(
  text: string,
  opts: { filter: string | null; seasonYear: number },
): ScheduleVerdict {
  const from = `${opts.seasonYear}-08-01`;
  const to = `${opts.seasonYear + 1}-07-31`;
  const season = `${opts.seasonYear}–${String((opts.seasonYear + 1) % 100).padStart(2, '0')}`;
  const filter = opts.filter?.trim() || null;
  const needle = filter?.toLowerCase() ?? null;

  const rows: ScheduleRow[] = [];
  let considered = 0;
  let skipped = 0;

  for (const chunk of unfold(text).split('BEGIN:VEVENT').slice(1)) {
    const body = chunk.split('END:VEVENT')[0];
    const summary = field(body, 'SUMMARY');

    if (needle) {
      const hay = `${summary} ${field(body, 'CATEGORIES')} ${field(body, 'DESCRIPTION')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    if (/^STATUS:CANCELLED/im.test(body)) continue;

    const dt = body.match(/^DTSTART[^:\r\n]*:(\S+)/m);
    const start = dt ? readStart(dt[1]) : null;
    if (!start || start.date < from || start.date > to) continue;

    considered += 1;
    const who = readOpponent(summary);
    if (!who) {
      skipped += 1;
      continue;
    }
    rows.push({
      date: start.date,
      opponent: who.opponent,
      home: who.home,
      ...(start.time ? { time: start.time } : {}),
    });
  }

  if (considered === 0) {
    return {
      ok: false,
      reason: filter
        ? `no ${season} events match “${filter}” — check the filter`
        : `the calendar has no ${season} events`,
    };
  }
  if (skipped * 2 > considered) {
    return { ok: false, reason: `${skipped} of ${considered} events don’t name an opponent` };
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, rows, skipped };
}
