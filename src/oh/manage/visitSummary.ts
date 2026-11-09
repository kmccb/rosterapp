/*
 * The arithmetic behind the panel's Visitors card. Pure, so it is tested here
 * rather than through a browser.
 */
import type { VisitDay } from './adminApi';

export type VisitTotals = { visitors: number; opens: number };
export type VisitSummary = {
  today: VisitTotals;
  week: VisitTotals;
  month: VisitTotals;
  /** The last `span` days oldest first, gaps filled with zeros — the bars. */
  days: VisitDay[];
  /** The busiest day of `days`, for scaling the bars; at least 1. */
  peak: number;
};

/** YYYY-MM-DD `n` days before `iso`, by the calendar rather than the clock. */
export const daysBefore = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const add = (rows: VisitDay[]): VisitTotals =>
  rows.reduce((t, r) => ({ visitors: t.visitors + r.visitors, opens: t.opens + r.opens }), { visitors: 0, opens: 0 });

export function summarizeVisits(rows: VisitDay[], today: string, span = 14): VisitSummary {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const within = (n: number) => rows.filter((r) => r.day > daysBefore(today, n) && r.day <= today);
  const days = Array.from({ length: span }, (_, i) => {
    const day = daysBefore(today, span - 1 - i);
    return byDay.get(day) ?? { day, opens: 0, visitors: 0 };
  });
  return {
    today: add(within(1)),
    week: add(within(7)),
    month: add(within(30)),
    days,
    peak: Math.max(1, ...days.map((d) => d.visitors)),
  };
}
