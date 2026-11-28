/*
 * The way out when the app cannot draw itself.
 *
 * Saved data is the likeliest cause of a crash that survives a reload, so this
 * removes all of what a roster brings with it. The coach's share key stays: it is
 * the only right to edit a published code, and it has never drawn anything.
 */

import { forgetSource } from './share/share';
import { clearStats } from './stats/statsStore';
import { clearRoster } from './storage';
import { clearTheme } from './theme/theme';

export const clearThisRoster = (): void => {
  // One at a time, so storage refusing one removal cannot strand the others.
  for (const clear of [clearRoster, clearStats, clearTheme, forgetSource]) {
    try {
      clear();
    } catch {
      // Nothing more can be done from a crash screen.
    }
  }
};

/**
 * Without the share code, or the roster just cleared would be fetched straight
 * back. The query stays non-empty because a bare `/` is sent to the marketing
 * site (src/marketing/rootVisit.ts), and this person is here for their roster.
 */
export const addressAfterClear = (pathname: string): string => `${pathname}?cleared=1`;
