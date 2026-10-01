import type { SideState, SourceSide } from './types';

/*
 * One email when something goes wrong, one when it's fixed, and silence in
 * between. The job runs every fifteen minutes; an email per run would be
 * ninety-six a day about one coach's typo.
 */

export type Outcome = { kind: 'ok'; changed: boolean } | { kind: 'problem'; reason: string };
export type Email = { kind: 'problem'; reason: string } | { kind: 'recovered' };

export function nextSide(
  prev: SideState | undefined,
  outcome: Outcome,
  now: string,
): { state: SideState; email: Email | null } {
  if (outcome.kind === 'ok') {
    return {
      state: {
        ok_at: now,
        problem: null,
        problem_since: null,
        alerted: false,
        changed_at: outcome.changed ? now : prev?.changed_at ?? null,
      },
      email: prev?.problem && prev.alerted ? { kind: 'recovered' } : null,
    };
  }

  const same = prev?.problem === outcome.reason;
  const state: SideState = {
    ok_at: prev?.ok_at ?? null,
    problem: outcome.reason,
    problem_since: prev?.problem ? prev.problem_since : now,
    // A send that failed leaves alerted false, so the next run tries again.
    alerted: same ? Boolean(prev?.alerted) : false,
    changed_at: prev?.changed_at ?? null,
  };
  return { state, email: state.alerted ? null : { kind: 'problem', reason: outcome.reason } };
}

/** "Sep 30, 4:15 PM". ICU puts a narrow no-break space before PM; mail clients don't need it. */
export const stamp = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(/[  ]/g, ' ');

const PANEL = 'https://roster.scottforge.ai/oh/?manage';

export function emailFor(
  t: { slug: string; sport: string },
  side: SourceSide,
  email: Email,
  state: SideState,
): { subject: string; text: string } {
  const what = `${t.slug} ${t.sport} ${side}`;
  if (email.kind === 'recovered') {
    return { subject: `Syncing again: ${what}`, text: `${what} is syncing again.\n\n${PANEL}` };
  }
  const kept = state.ok_at
    ? `Fans still see the ${side} from ${stamp(state.ok_at)}.`
    : `Nothing has synced from this link yet, so fans see the ${side} that was there before.`;
  return {
    subject: `Sync refused: ${what}`,
    text: `${what}: sync refused — ${email.reason}.\n\n${kept}\n\n${PANEL}`,
  };
}
