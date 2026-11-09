/*
 * Counting the people who open a paying school's page.
 *
 * One call per school per page load, to migration 0010's school_visit_count,
 * carrying the slug and whether this is the phone's first open of that school
 * today. The phone decides "first today" itself from a date it keeps in its own
 * storage; the date never leaves it. The database keeps two numbers per school
 * per day and nothing about who.
 *
 * Fire and forget: no signal, a database without 0010 yet, a school that isn't
 * live — every failure is swallowed, because a reader has nothing to do about
 * any of them and the page must not change for them. Not counted: the demo
 * (nobody's school) and a browser the seller is signed in to the panel on, so
 * his own checking doesn't count as interest.
 */

import { isDemo } from './demo';
import { rpc, supaAvailable } from './supa';

/** The panel's session key in adminAuth.ts. Read as a string, not imported, so a
 * fan page doesn't pull the sign-in code in for one key name. */
const ADMIN_SESSION = 'oh.admin.session';

export const visitKey = (slug: string): string => `oh.visit.${slug}`;

/** Today in Eastern time, as the database counts days: YYYY-MM-DD. */
export const easternDay = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const storage = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // Safari private mode and friends throw on touch.
  }
};

/** Already counted in this page load — React's StrictMode and a reader
 * switching sports both re-run effects, and neither is a second visit. */
const counted = new Set<string>();

/**
 * Counts one open of `slug`. Returns the promise only so tests can await it;
 * callers drop it.
 */
export async function countVisit(
  slug: string,
  opts: { store?: Store | null; now?: Date; demo?: boolean } = {},
): Promise<void> {
  const demo = opts.demo ?? isDemo();
  if (!supaAvailable || demo || !slug || counted.has(slug)) return;
  counted.add(slug);

  const store = opts.store === undefined ? storage() : opts.store;
  let firstToday = true;
  try {
    if (store?.getItem(ADMIN_SESSION)) return;
    const today = easternDay(opts.now);
    firstToday = store?.getItem(visitKey(slug)) !== today;
    if (firstToday) store?.setItem(visitKey(slug), today);
  } catch {
    // Storage refused: count the open, and call it a first visit.
  }

  try {
    await rpc<null>('school_visit_count', { p_slug: slug, p_first_today: firstToday });
  } catch {
    // See the note at the top: never the reader's problem.
  }
}

/** For tests: forget what this page load has counted. */
export const resetCounted = (): void => counted.clear();
