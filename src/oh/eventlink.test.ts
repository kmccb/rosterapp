import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clockText, opponentName, parseEventlink, readEvents, sportName } from './eventlink';

/*
 * Pinned to a capture of Poland's calendar taken 2026-09-11. The feed is one
 * school's Eventlink export; a shape change in it fails here rather than in a
 * generator run the night before a demo.
 */
const FIXTURE = new URL('./fixtures/eventlink-poland-2026.ics', import.meta.url);
const feed = readFileSync(FIXTURE, 'utf8');
const parsed = parseEventlink(feed, 2026);
const bySport = Object.fromEntries(parsed.map((s) => [s.sport, s.rows]));

describe('the Eventlink calendar', () => {
  it('yields every varsity sport on the 2026-27 calendar, and exactly its games', () => {
    expect(Object.fromEntries(parsed.map((s) => [s.sport, s.rows.length]))).toEqual({
      volleyball: 22,
      'girls tennis': 18,
      'girls soccer': 20,
      'cross country': 15,
      'boys basketball': 22,
      'girls basketball': 22,
      'girls golf': 13,
      baseball: 8,
      'boys soccer': 20,
      football: 12,
      'boys golf': 21,
    });
  });

  it('keeps varsity only', () => {
    // The feed carries JV and freshman rows; Girard's JV plays at 5:30 on the
    // same day the varsity plays at 7, and only the varsity row survives.
    expect(feed).toMatch(/\(Girls JV\)/);
    expect(bySport.volleyball.filter((r) => r.date === '2026-09-01')).toEqual([
      { date: '2026-09-01', opponent: 'Girard', home: true, time: '7:00 PM' },
    ]);
  });

  it('drops a cancelled game', () => {
    expect(feed).toMatch(/CANCELED - Golf \(Girls V\) @ Girard/);
    expect(bySport['girls golf'].some((r) => r.date === '2026-08-11' && r.opponent === 'Girard')).toBe(false);
  });

  it('drops the rows that match the pattern but are not games', () => {
    expect(feed).toMatch(/Volleyball \(Girls V\) - Scrimmage/);
    const all = parsed.flatMap((s) => s.rows);
    expect(all.some((r) => /scrimmage|banquet|pictures|meeting/i.test(r.opponent))).toBe(false);
  });

  it('keeps only the season it was asked for', () => {
    const all = parsed.flatMap((s) => s.rows);
    expect(all.every((r) => r.date >= '2026-07-01' && r.date < '2027-07-01')).toBe(true);
    // Last season is in the feed too, and asking for it gives a different set.
    expect(parseEventlink(feed, 2025).length).toBeGreaterThan(0);
  });

  it('reads a home row and an away row field by field', () => {
    expect(bySport.football.find((r) => r.date === '2026-09-11')).toEqual({
      date: '2026-09-11',
      opponent: 'Canfield',
      home: false,
      time: '7:00 PM',
    });
    expect(bySport.football.find((r) => r.date === '2026-09-18')).toEqual({
      date: '2026-09-18',
      opponent: 'Hubbard',
      home: true,
      time: '7:00 PM',
    });
  });

  it('keeps a meet under its own name, with the minute the feed gave it', () => {
    // 110008 in the feed — Eventlink stamps odd seconds; only the minute prints.
    expect(bySport['cross country'].find((r) => r.date === '2026-09-12')).toEqual({
      date: '2026-09-12',
      opponent: 'Streetsboro Invitational',
      home: false,
      time: '11:00 AM',
    });
  });

  it('sorts each sport by date', () => {
    for (const { rows } of parsed) {
      const dates = rows.map((r) => r.date);
      expect(dates).toEqual([...dates].sort());
    }
  });

  it('lists football first, then the rest in the order the feed introduced them', () => {
    expect(parsed[0].sport).toBe('football');
  });
});

describe('one event at a time', () => {
  it('reads an all-day row with no time, and drops a recurring one', () => {
    const tiny = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261010',
      'SUMMARY:Golf (Boys V) @ Kiely Cup',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART;TZID=America/New_York:20260901T150000',
      'RRULE:FREQ=WEEKLY',
      'SUMMARY:Golf (Boys V) - Practice Round',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseEventlink(tiny, 2026)).toEqual([
      { sport: 'boys golf', rows: [{ date: '2026-10-10', opponent: 'Kiely Cup', home: false }] },
    ]);
  });

  it('unfolds a wrapped line and unescapes the commas in it', () => {
    const folded =
      'BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20270415T160000\r\n' +
      'SUMMARY:Track & Field (Coed V) - Lakeview High School\\, Struthers High Scho\r\n ol\\, Girard Sr High School\r\nEND:VEVENT\r\n';
    expect(parseEventlink(folded, 2026)).toEqual([
      { sport: 'track', rows: [{ date: '2027-04-15', opponent: 'Lakeview, Struthers, Girard', home: true, time: '4:00 PM' }] },
    ]);
  });

  it('exposes the events it read', () => {
    const events = readEvents('BEGIN:VEVENT\r\nUID:x\r\nDTSTART;TZID=America/New_York:20260911T190000\r\nEND:VEVENT\r\n');
    expect(events).toEqual([{ UID: 'x', DTSTART: '20260911T190000' }]);
  });
});

describe('the pieces', () => {
  it('prints a clock the way a fan reads it', () => {
    expect(clockText('20260911T190000')).toBe('7:00 PM');
    expect(clockText('20260912T110008')).toBe('11:00 AM');
    expect(clockText('20260912T120000')).toBe('12:00 PM');
    expect(clockText('20260912T000000')).toBe('12:00 AM');
    expect(clockText('20261010')).toBeUndefined();
  });

  it('strips the school suffix and nothing else', () => {
    expect(opponentName('Girard Sr High School')).toBe('Girard');
    expect(opponentName('St. Vincent-St. Mary H.S.')).toBe('St. Vincent-St. Mary');
    expect(opponentName('Crestview High School (Columbiana)')).toBe('Crestview (Columbiana)');
    expect(opponentName('Boardman Invite')).toBe('Boardman Invite');
  });

  it('names a sport the way the hub does', () => {
    expect(sportName('Football', 'Boys')).toBe('football');
    expect(sportName('Basketball', 'Girls')).toBe('girls basketball');
    expect(sportName('Tennis', 'Boys')).toBe('boys tennis');
    expect(sportName('Cross Country', 'Coed')).toBe('cross country');
    expect(sportName('Track & Field', 'Coed')).toBe('track');
    expect(() => sportName('Esports', 'Boys')).toThrow(/does not know/);
  });
});
