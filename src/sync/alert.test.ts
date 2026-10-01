import { emailFor, nextSide, stamp } from './alert';
import type { SideState } from './types';

const T0 = '2026-09-30T20:15:00.000Z';
const T1 = '2026-09-30T20:30:00.000Z';
const T2 = '2026-09-30T20:45:00.000Z';

const healthy: SideState = { ok_at: T0, problem: null, problem_since: null, alerted: false, changed_at: T0 };

describe('nextSide', () => {
  it('records a first success, and nothing is emailed', () => {
    expect(nextSide(undefined, { kind: 'ok', changed: true }, T0)).toEqual({
      state: { ok_at: T0, problem: null, problem_since: null, alerted: false, changed_at: T0 },
      email: null,
    });
  });

  it('keeps changed_at when nothing changed', () => {
    expect(nextSide(healthy, { kind: 'ok', changed: false }, T1).state.changed_at).toBe(T0);
  });

  it('emails on the first failure', () => {
    expect(nextSide(healthy, { kind: 'problem', reason: 'r' }, T1)).toEqual({
      state: { ok_at: T0, problem: 'r', problem_since: T1, alerted: false, changed_at: T0 },
      email: { kind: 'problem', reason: 'r' },
    });
  });

  it('stays quiet while the same problem persists and has been emailed', () => {
    const failing: SideState = { ...healthy, problem: 'r', problem_since: T1, alerted: true };
    expect(nextSide(failing, { kind: 'problem', reason: 'r' }, T2)).toEqual({ state: failing, email: null });
  });

  it('tries again when the last email didn\'t go out', () => {
    const unsent: SideState = { ...healthy, problem: 'r', problem_since: T1, alerted: false };
    expect(nextSide(unsent, { kind: 'problem', reason: 'r' }, T2).email).toEqual({ kind: 'problem', reason: 'r' });
  });

  it('emails again when the reason changes, keeping when the trouble began', () => {
    const failing: SideState = { ...healthy, problem: 'r', problem_since: T1, alerted: true };
    expect(nextSide(failing, { kind: 'problem', reason: 's' }, T2)).toEqual({
      state: { ...failing, problem: 's', alerted: false },
      email: { kind: 'problem', reason: 's' },
    });
  });

  it('emails on recovery only if the problem was emailed', () => {
    const emailed: SideState = { ...healthy, problem: 'r', problem_since: T1, alerted: true };
    expect(nextSide(emailed, { kind: 'ok', changed: false }, T2).email).toEqual({ kind: 'recovered' });
    const unsent: SideState = { ...emailed, alerted: false };
    expect(nextSide(unsent, { kind: 'ok', changed: false }, T2).email).toBeNull();
  });
});

describe('stamp', () => {
  it('prints Eastern time with plain spaces', () => {
    expect(stamp(T0)).toBe('Sep 30, 4:15 PM');
  });
});

describe('emailFor', () => {
  const t = { slug: 'springfield-new-middletown', sport: 'volleyball' };

  it('says what was refused and what fans still see', () => {
    const state: SideState = { ...healthy, problem: 'r', problem_since: T1 };
    expect(emailFor(t, 'roster', { kind: 'problem', reason: 'a row is missing a number or a name ("Mia")' }, state)).toEqual({
      subject: 'Sync refused: springfield-new-middletown volleyball roster',
      text:
        'springfield-new-middletown volleyball roster: sync refused — a row is missing a number or a name ("Mia").\n\n' +
        'Fans still see the roster from Sep 30, 4:15 PM.\n\n' +
        'https://roster.scottforge.ai/oh/?manage',
    });
  });

  it('says so when nothing has ever synced from the link', () => {
    const state: SideState = { ok_at: null, problem: 'r', problem_since: T1, alerted: false, changed_at: null };
    expect(emailFor(t, 'schedule', { kind: 'problem', reason: 'r' }, state).text).toContain(
      'Nothing has synced from this link yet, so fans see the schedule that was there before.',
    );
  });

  it('announces a recovery', () => {
    expect(emailFor(t, 'roster', { kind: 'recovered' }, healthy)).toEqual({
      subject: 'Syncing again: springfield-new-middletown volleyball roster',
      text: 'springfield-new-middletown volleyball roster is syncing again.\n\nhttps://roster.scottforge.ai/oh/?manage',
    });
  });
});
