/*
 * What the directory's crash screen may clear: one school's kept copies, and
 * nothing else. The root app shares this origin and its storage, so a sweep of
 * the jar would take a parent's Poland roster with it. The followed school and
 * the panel's sign-in stay too; neither can draw a broken page.
 */

import { schoolParam } from './link';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One value per school under these. */
const SINGLE = ['season', 'sport', 'league', 'weather', 'region', 'livesports'];
/** One value per sport under these, and `oh.roster.<slug>` from before sports. */
const PER_SPORT = ['roster', 'stats'];

/** The school on screen, or null on a page that is not showing one. */
export const schoolInView = (search: string, chosen: string | null): string | null => {
  const linked = schoolParam(search);
  if (linked) return linked;
  return chosen && SLUG.test(chosen) ? chosen : null;
};

/** Read without trusting storage or the address, because this runs after a crash. */
export const currentSchool = (): string | null => {
  try {
    return schoolInView(location.search, localStorage.getItem('oh.school'));
  } catch {
    return null;
  }
};

export const clearSchoolKept = (slug: string): void => {
  try {
    const doomed = new Set(SINGLE.map((name) => `oh.${name}.${slug}`));
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && PER_SPORT.some((name) => key === `oh.${name}.${slug}` || key.startsWith(`oh.${name}.${slug}.`))) {
        doomed.add(key);
      }
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Blocked storage has nothing to clear, and the reload is still on offer.
  }
};
