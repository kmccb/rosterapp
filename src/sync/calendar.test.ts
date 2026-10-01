import { readFileSync } from 'node:fs';
import { tidyOpponent } from '../schedule/icalParse';
import { calendarToSchedule, readOpponent, readStart } from './calendar';

const eventlink = readFileSync('src/sync/fixtures/eventlink-poland-2026.ics', 'utf8');

const vevent = (lines: string[]): string => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const calendar = (...events: string[]): string =>
  ['BEGIN:VCALENDAR', ...events, 'END:VCALENDAR'].join('\r\n');

describe('readStart', () => {
  it('prints a zoned or floating time as written', () => {
    expect(readStart('20260824T190000')).toEqual({ date: '2026-08-24', time: '7:00 PM' });
  });
  it('turns a UTC stamp into Ohio’s date and time', () => {
    // 7pm Friday in Ohio is midnight Saturday in UTC.
    expect(readStart('20260905T000000Z')).toEqual({ date: '2026-09-04', time: '8:00 PM' });
  });
  it('leaves a date-only stamp without a time', () => {
    expect(readStart('20261212')).toEqual({ date: '2026-12-12' });
  });
  it('refuses garbage', () => {
    expect(readStart('soon')).toBeNull();
  });
});

describe('readOpponent', () => {
  it('reads Eventlink: “-” is home, “@” is away', () => {
    expect(readOpponent('Volleyball (Girls V) - Campbell Memorial High School')).toEqual({
      opponent: 'Campbell Memorial', home: true,
    });
    expect(readOpponent('Basketball (Boys V) @ Boardman High School')).toEqual({
      opponent: 'Boardman', home: false,
    });
  });
  it('skips an Eventlink event that names no school', () => {
    expect(readOpponent('Baseball (Boys V) - Baseball Team Pictures')).toBeNull();
    expect(readOpponent('Basketball (Boys V) - United Way (vs Neshannock)')).toBeNull();
  });
  it('reads ScheduleStar’s pipes', () => {
    expect(
      readOpponent('Poland Seminary vs Salem Jr/Sr High School | Boys Varsity Football | Home (Homecoming)'),
    ).toEqual({ opponent: tidyOpponent('Salem Jr/Sr High School'), home: true });
  });
  it('reads a plain “vs”, “at” or “@”', () => {
    expect(readOpponent('Girls Soccer vs Canfield')).toEqual({ opponent: 'Canfield', home: true });
    expect(readOpponent('Girls Soccer at Canfield')).toEqual({ opponent: 'Canfield', home: false });
    expect(readOpponent('Girls Soccer @ Canfield')).toEqual({ opponent: 'Canfield', home: false });
  });
  it('gives up on a title with no opponent', () => {
    expect(readOpponent('Senior Night')).toBeNull();
  });
});

describe('calendarToSchedule on the Eventlink capture', () => {
  it('pulls this season’s varsity volleyball out of the whole school', () => {
    const v = calendarToSchedule(eventlink, { filter: 'Volleyball (Girls V)', seasonYear: 2026 });
    if (!v.ok) throw new Error(v.reason);
    expect(v.rows).toHaveLength(22);
    expect(v.skipped).toBe(0);
    expect(v.rows.filter((r) => r.home)).toHaveLength(10);
    expect(v.rows[0].date).toBe('2026-08-10');
    expect(v.rows.find((r) => r.date === '2026-08-24')).toEqual({
      date: '2026-08-24', opponent: 'Campbell Memorial', home: true, time: '7:00 PM',
    });
    expect(v.rows.every((r) => r.date >= '2026-08-01' && r.date <= '2027-07-31')).toBe(true);
  });

  it('counts the one unreadable basketball event and keeps the rest', () => {
    const v = calendarToSchedule(eventlink, { filter: 'Basketball (Boys V)', seasonYear: 2026 });
    if (!v.ok) throw new Error(v.reason);
    expect(v.rows).toHaveLength(21);
    expect(v.skipped).toBe(1);
  });

  it('refuses a filter that matches nothing, and says so', () => {
    expect(calendarToSchedule(eventlink, { filter: 'Curling (Boys V)', seasonYear: 2026 })).toEqual({
      ok: false,
      reason: 'no 2026–27 events match “Curling (Boys V)” — check the filter',
    });
  });

  it('refuses a whole-school calendar with no filter — too many rows for one team’s schedule', () => {
    expect(calendarToSchedule(eventlink, { filter: null, seasonYear: 2026 })).toEqual({
      ok: false,
      reason: 'the calendar has 268 games this season — more than one team’s; add or narrow the filter',
    });
  });
});

describe('calendarToSchedule rules', () => {
  const game = (summary: string, start: string, extra: string[] = []) =>
    vevent([`SUMMARY:${summary}`, `DTSTART;TZID=America/New_York:${start}`, ...extra]);

  it('drops cancelled events and anything outside the school year', () => {
    const v = calendarToSchedule(
      calendar(
        game('Girls Soccer vs Canfield', '20260910T170000'),
        game('Girls Soccer at Salem', '20260917T170000', ['STATUS:CANCELLED']),
        game('Girls Soccer vs Howland', '20260705T170000'),
      ),
      { filter: null, seasonYear: 2026 },
    );
    expect(v).toEqual({
      ok: true,
      rows: [{ date: '2026-09-10', opponent: 'Canfield', home: true, time: '5:00 PM' }],
      skipped: 0,
    });
  });

  it('matches the filter against categories and description too, ignoring case', () => {
    const v = calendarToSchedule(
      calendar(game('vs Canfield', '20260910T170000', ['CATEGORIES:Girls Varsity Soccer'])),
      { filter: 'girls varsity soccer', seasonYear: 2026 },
    );
    expect(v.ok && v.rows.length).toBe(1);
  });

  it('unfolds long lines', () => {
    const v = calendarToSchedule(
      calendar(['BEGIN:VEVENT', 'SUMMARY:Girls Soccer vs Can', ' field', 'DTSTART:20260910T170000', 'END:VEVENT'].join('\r\n')),
      { filter: null, seasonYear: 2026 },
    );
    expect(v.ok && v.rows[0].opponent).toBe('Canfield');
  });

  it('refuses when more than half the events name no opponent', () => {
    const v = calendarToSchedule(
      calendar(
        game('Girls Soccer vs Canfield', '20260910T170000'),
        game('Team pictures', '20260911T170000'),
        game('Banquet', '20260912T170000'),
      ),
      { filter: null, seasonYear: 2026 },
    );
    expect(v).toEqual({ ok: false, reason: '2 of 3 events don’t name an opponent' });
  });

  it('refuses an empty calendar', () => {
    expect(calendarToSchedule(calendar(), { filter: null, seasonYear: 2026 })).toEqual({
      ok: false,
      reason: 'the calendar has no 2026–27 events',
    });
  });

  it('sorts by date', () => {
    const v = calendarToSchedule(
      calendar(game('vs B School', '20260917T170000'), game('vs A School', '20260910T170000')),
      { filter: null, seasonYear: 2026 },
    );
    expect(v.ok && v.rows.map((r) => r.date)).toEqual(['2026-09-10', '2026-09-17']);
  });
});
