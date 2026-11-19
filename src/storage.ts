import { repairStoredPlayers } from './rosterGuard';
import { scopedKey } from './scope';
import { emptyRoster, type Roster } from './types';

const KEY = () => scopedKey('rosterapp.v1');

type Stored = { schema: 1; roster: Roster };

/**
 * Anything unreadable is treated as "no roster yet" rather than crashing the app,
 * and a bad player saved by an older version is repaired here, on every launch.
 */
export const loadRoster = (): Roster => {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return emptyRoster();
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const roster = parsed?.roster;
    if (!roster || !Array.isArray(roster.players)) return emptyRoster();
    return {
      teamName: typeof roster.teamName === 'string' ? roster.teamName : '',
      season: typeof roster.season === 'string' ? roster.season : '',
      players: repairStoredPlayers(roster.players),
      updatedAt: typeof roster.updatedAt === 'string' ? roster.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyRoster();
  }
};

export const saveRoster = (roster: Roster): void => {
  const stored: Stored = { schema: 1, roster: { ...roster, updatedAt: new Date().toISOString() } };
  try {
    localStorage.setItem(KEY(), JSON.stringify(stored));
  } catch (err) {
    // Private-mode Safari and a full quota both land here.
    console.error('Could not save the roster', err);
    throw new Error('Could not save the roster — device storage may be full or blocked.');
  }
};

export const clearRoster = (): void => localStorage.removeItem(KEY());
