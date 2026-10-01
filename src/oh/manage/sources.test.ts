import type { SideState } from '../../sync/types';
import { ago, calendarLinkProblem, calendarUrl, rowProblems, sheetLinkProblem, sideLine, when } from './sources';

const PUBLISHED = 'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=0&single=true&output=csv';

describe('sheetLinkProblem', () => {
  it('accepts a published CSV link', () => {
    expect(sheetLinkProblem(PUBLISHED)).toBeNull();
  });
  it('explains the editing link', () => {
    expect(sheetLinkProblem('https://docs.google.com/spreadsheets/d/abc/edit#gid=0')).toBe(
      'That’s the sheet’s editing link. Publish it instead: File → Share → Publish to web → the roster tab → Comma-separated values (.csv), and paste that link.',
    );
  });
  it('refuses anything that isn’t a Google Sheet', () => {
    expect(sheetLinkProblem('https://example.com/roster.csv')).toBe(
      'A roster link has to be a Google Sheet (https://docs.google.com/spreadsheets/…).',
    );
  });
});

describe('calendar links', () => {
  it('turns webcal into https', () => {
    expect(calendarUrl('  webcal://example.test/cal.ics ')).toBe('https://example.test/cal.ics');
    expect(calendarUrl('webcals://example.test/cal.ics')).toBe('https://example.test/cal.ics');
  });
  it('wants https after that', () => {
    expect(calendarLinkProblem('https://example.test/cal.ics')).toBeNull();
    expect(calendarLinkProblem('http://example.test/cal.ics')).toBe('A calendar link has to start with https:// or webcal://.');
  });
});

describe('status wording', () => {
  const now = new Date('2026-09-30T20:21:00.000Z');
  const ok: SideState = { ok_at: '2026-09-30T20:15:00.000Z', problem: null, problem_since: null, alerted: false, changed_at: null };

  it('says how long ago', () => {
    expect(ago('2026-09-30T20:20:40.000Z', now)).toBe('just now');
    expect(ago('2026-09-30T20:15:00.000Z', now)).toBe('6 min ago');
    expect(ago('2026-09-30T17:15:00.000Z', now)).toBe('3 h ago');
    expect(ago('2026-09-28T17:15:00.000Z', now)).toBe(`on ${when('2026-09-28T17:15:00.000Z')}`);
  });

  it('prints Eastern weekday and time', () => {
    expect(when('2026-09-29T22:40:00.000Z')).toBe('Tue 6:40 PM');
  });

  it('describes a side', () => {
    expect(sideLine(undefined, now)).toBe('not synced yet');
    expect(sideLine(ok, now)).toBe('synced 6 min ago');
    expect(sideLine({ ...ok, problem: 'r', problem_since: '2026-09-29T22:40:00.000Z' }, now)).toBe(
      '⚠ r — since Tue 6:40 PM',
    );
  });

  it('lists a row’s open problems for the school list', () => {
    expect(rowProblems({ sport: 'volleyball' })).toEqual([]);
    expect(
      rowProblems({
        sport: 'volleyball',
        sync_state: { roster: { ...ok, problem: 'r', problem_since: '2026-09-29T22:40:00.000Z' }, schedule: ok },
      }),
    ).toEqual(['⚠ Volleyball roster: r, since Tue 6:40 PM']);
  });
});
