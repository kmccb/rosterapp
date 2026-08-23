import { describe, expect, it } from 'vitest';
import { parseSchedule } from './scheduleParse';

describe('parseSchedule', () => {
  it('reads a plain spreadsheet paste', () => {
    const text = [
      'Date\tOpponent\tH/A\tTime',
      '8/28\tCanfield\tH\t7:00 PM',
      '9/4\tHoward\tA\t7pm',
    ].join('\n');
    const { rows, skipped } = parseSchedule(text, 2026);
    expect(skipped).toEqual([{ text: 'Date Opponent H/A Time', issue: 'no date on this line' }]);
    expect(rows).toEqual([
      { date: '2026-08-28', opponent: 'Canfield', home: true, time: '7:00 PM' },
      { date: '2026-09-04', opponent: 'Howard', home: false, time: '7:00 PM' },
    ]);
  });

  it('rolls past-new-year dates into the following calendar year', () => {
    const { rows } = parseSchedule('11/27\tBoardman\n2/6\tFitch', 2026);
    expect(rows[0].date).toBe('2026-11-27');
    expect(rows[1].date).toBe('2027-02-06');
  });

  it('honors an explicit year over the season clock', () => {
    const { rows } = parseSchedule('2/6/2026\tFitch', 2026);
    expect(rows[0].date).toBe('2026-02-06');
  });

  it('reads scores, ours first regardless of the letter', () => {
    const { rows } = parseSchedule('11/27\tBoardman\tW 3-1\n12/4\tFitch\tL 1–3', 2026);
    expect(rows[0].score).toEqual({ us: 3, them: 1 });
    expect(rows[1].score).toEqual({ us: 1, them: 3 });
  });

  it('reads a bare score once the date is claimed', () => {
    const { rows } = parseSchedule('8/28\tCanfield\t45-21', 2026);
    expect(rows[0].score).toEqual({ us: 45, them: 21 });
  });

  it('takes home and away from the opponent cell when there is no marker cell', () => {
    const { rows } = parseSchedule('8/28\t@ Canfield\n9/4\tvs. Howard', 2026);
    expect(rows[0]).toMatchObject({ opponent: 'Canfield', home: false });
    expect(rows[1]).toMatchObject({ opponent: 'Howard', home: true });
  });

  it('reads past a leading day-of-week column', () => {
    // "Day" is the first column of half the spreadsheets in the state, and a
    // cell before the date used to claim the opponent slot outright.
    const { rows } = parseSchedule('Fri\t8/28\tCanfield\tH\t7:00 PM', 2026);
    expect(rows).toEqual([
      { date: '2026-08-28', opponent: 'Canfield', home: true, time: '7:00 PM' },
    ]);
  });

  it('reads past a leading score column, and does not read the score out of it', () => {
    // A score printed before the date is junk this parser deliberately drops:
    // a bare "45-21" is only a score once a date has been claimed, and
    // re-reading it after the fact would mean a second pass for a layout
    // nobody has actually pasted. The opponent is what matters — get that
    // right and the seller can see the missing score in the preview.
    const { rows } = parseSchedule('45-21\t8/28\tCanfield', 2026);
    expect(rows).toEqual([{ date: '2026-08-28', opponent: 'Canfield', home: true }]);
  });

  it('splits on runs of spaces when there are no tabs', () => {
    const { rows } = parseSchedule('Aug 28   Canfield   7:00 PM', 2026);
    expect(rows).toEqual([{ date: '2026-08-28', opponent: 'Canfield', home: true, time: '7:00 PM' }]);
  });

  it('skips a line with a date but nobody to play', () => {
    const { rows, skipped } = parseSchedule('8/28\t7:00 PM', 2026);
    expect(rows).toEqual([]);
    expect(skipped[0].issue).toBe('no opponent on this line');
  });

  it('reads month names', () => {
    const { rows } = parseSchedule('November 27\tBoardman', 2026);
    expect(rows[0].date).toBe('2026-11-27');
  });
});
