import { describe, expect, it } from 'vitest';
import { daysBefore, summarizeVisits } from './visitSummary';

describe('daysBefore', () => {
  it('walks back across a month end', () => {
    expect(daysBefore('2026-11-02', 3)).toBe('2026-10-30');
    expect(daysBefore('2026-11-02', 0)).toBe('2026-11-02');
  });
});

describe('summarizeVisits', () => {
  const rows = [
    { day: '2026-11-09', opens: 5, visitors: 3 },
    { day: '2026-11-07', opens: 40, visitors: 22 },
    { day: '2026-11-01', opens: 10, visitors: 6 },
    { day: '2026-10-20', opens: 4, visitors: 4 },
    { day: '2026-09-01', opens: 99, visitors: 99 },
  ];

  it('adds up today, the last 7 days and the last 30', () => {
    const s = summarizeVisits(rows, '2026-11-09');
    expect(s.today).toEqual({ visitors: 3, opens: 5 });
    expect(s.week).toEqual({ visitors: 25, opens: 45 });
    expect(s.month).toEqual({ visitors: 35, opens: 59 });
  });

  it('fills the quiet days so the bars are evenly spaced, oldest first', () => {
    const s = summarizeVisits(rows, '2026-11-09', 14);
    expect(s.days).toHaveLength(14);
    expect(s.days[0].day).toBe('2026-10-27');
    expect(s.days[13]).toEqual({ day: '2026-11-09', opens: 5, visitors: 3 });
    expect(s.days[12]).toEqual({ day: '2026-11-08', opens: 0, visitors: 0 });
    expect(s.peak).toBe(22);
  });

  it('never scales bars by zero', () => {
    expect(summarizeVisits([], '2026-11-09').peak).toBe(1);
  });
});
