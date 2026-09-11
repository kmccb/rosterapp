import { describe, expect, it } from 'vitest';
import { landingTab } from './landing';

/*
 * Times below are Eastern Daylight Time, so 7:00 PM on 2026-09-11 is
 * 23:00Z. Every boundary is checked a minute either side.
 */
const friday = [{ date: '2026-09-11', time: '7:00 PM' }];
const at = (iso: string) => new Date(iso);

describe('where a sport lands', () => {
  it('lands on the keypad from an hour before kickoff to four hours after', () => {
    expect(landingTab(friday, 40, at('2026-09-11T22:01:00Z'))).toBe('lookup');
    expect(landingTab(friday, 40, at('2026-09-11T23:00:00Z'))).toBe('lookup');
    expect(landingTab(friday, 40, at('2026-09-12T02:59:00Z'))).toBe('lookup');
  });

  it('lands on the schedule outside that window', () => {
    expect(landingTab(friday, 40, at('2026-09-11T21:59:00Z'))).toBe('schedule');
    expect(landingTab(friday, 40, at('2026-09-12T03:01:00Z'))).toBe('schedule');
    expect(landingTab(friday, 40, at('2026-09-08T23:00:00Z'))).toBe('schedule');
  });

  it('reads the directory’s own clock strings', () => {
    expect(landingTab([{ date: '2026-09-11', time: '7pm' }], 40, at('2026-09-11T23:30:00Z'))).toBe('lookup');
  });

  it('gives an untimed fixture its whole day, Eastern', () => {
    const untimed = [{ date: '2026-09-11' }];
    // 11 in the morning Eastern on the day.
    expect(landingTab(untimed, 40, at('2026-09-11T15:00:00Z'))).toBe('lookup');
    // 11 at night Eastern on the day is 03:00Z the next calendar day in UTC.
    expect(landingTab(untimed, 40, at('2026-09-12T03:00:00Z'))).toBe('lookup');
    // The day after.
    expect(landingTab(untimed, 40, at('2026-09-12T15:00:00Z'))).toBe('schedule');
  });

  it('treats a time it cannot read as no time, never as seven o’clock', () => {
    const tba = [{ date: '2026-09-11', time: 'TBA' }];
    expect(landingTab(tba, 40, at('2026-09-11T15:00:00Z'))).toBe('lookup');
    expect(landingTab(tba, 40, at('2026-09-12T15:00:00Z'))).toBe('schedule');
    expect(landingTab([{ date: '2026-09-11', time: null }], 40, at('2026-09-11T15:00:00Z'))).toBe('lookup');
  });

  it('never lands an empty roster on the keypad', () => {
    expect(landingTab(friday, 0, at('2026-09-11T23:00:00Z'))).toBe('schedule');
  });

  it('lands on the schedule with nothing to go on', () => {
    expect(landingTab([], 40, at('2026-09-11T23:00:00Z'))).toBe('schedule');
  });

  it('looks at every fixture, not the first', () => {
    const two = [{ date: '2026-09-04', time: '7:00 PM' }, ...friday];
    expect(landingTab(two, 40, at('2026-09-11T23:00:00Z'))).toBe('lookup');
  });

  it('survives a date it cannot parse', () => {
    expect(landingTab([{ date: 'soon', time: '7:00 PM' }], 40, at('2026-09-11T23:00:00Z'))).toBe('schedule');
  });

  it('survives a date it cannot parse, even one that looks the right shape', () => {
    // Date.parse rolls Feb 30 into March 2 instead of failing; the overflow
    // must not quietly become a game next month.
    expect(landingTab([{ date: '2026-02-30', time: '7:00 PM' }], 40, at('2026-03-02T23:30:00Z'))).toBe('schedule');
    // Same overflow, untimed: 2026-03-02T20:00:00Z is 2026-03-02 Eastern (EST, UTC-5).
    expect(landingTab([{ date: '2026-02-30' }], 40, at('2026-03-02T20:00:00Z'))).toBe('schedule');
    // An out-of-range month already yields Invalid Date, but covered here too.
    expect(landingTab([{ date: '2026-13-01', time: '7:00 PM' }], 40, at('2026-03-02T23:30:00Z'))).toBe('schedule');
  });
});
