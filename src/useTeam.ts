import { useCallback, useEffect, useState } from 'react';
import * as api from './api/client';
import { clearRoster, loadRoster, saveRoster } from './storage';
import { emptyRoster, type Player, type Roster } from './types';

export type SyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'error';

/**
 * Holds the roster and keeps it in step with the shared database.
 *
 * The local cache is the read path — always. A lookup never waits on the
 * network, so the app behaves the same in a dead-signal stadium as it does at
 * home. Syncing happens around that, not in front of it.
 *
 * With no backend configured the whole thing collapses to the original
 * on-device app, which is what keeps it usable before Supabase is set up.
 */
export function useTeam() {
  const shared = api.isSharingConfigured();

  const [roster, setRoster] = useState<Roster>(() => loadRoster());
  const [role, setRole] = useState<api.Role>(shared ? 'viewer' : 'editor');
  const [signedIn, setSignedIn] = useState<boolean>(() => !shared || api.getToken() !== '');
  const [syncState, setSyncState] = useState<SyncState>(shared ? 'syncing' : 'local');
  const [error, setError] = useState('');

  const cache = useCallback((next: Roster) => {
    saveRoster(next);
    setRoster(loadRoster());
  }, []);

  const applySnapshot = useCallback(
    (snapshot: api.Snapshot) => {
      setRole(snapshot.role);
      cache(api.snapshotToRoster(snapshot));
      setSyncState('synced');
      setError('');
    },
    [cache],
  );

  const refresh = useCallback(async () => {
    if (!shared || !api.getToken()) return;
    setSyncState('syncing');
    try {
      applySnapshot(await api.fetchSnapshot());
    } catch (err) {
      const status = err instanceof api.ApiError ? err.status : -1;
      if (status === 401) {
        // Session expired. The cached roster stays readable meanwhile.
        setSignedIn(false);
        setSyncState('local');
      } else if (status === 0) {
        setSyncState('offline');
      } else {
        setSyncState('error');
        setError(err instanceof Error ? err.message : 'Could not reach the team database.');
      }
    }
  }, [applySnapshot, shared]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pick the sync back up when the phone reconnects.
  useEffect(() => {
    if (!shared) return;
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh, shared]);

  const signIn = useCallback(
    async (code: string) => {
      const { role: newRole } = await api.signIn(code);
      setRole(newRole);
      setSignedIn(true);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(() => {
    api.signOut();
    setSignedIn(false);
    setRole('viewer');
    setSyncState('local');
  }, []);

  const savePlayers = useCallback(
    async (players: Player[]) => {
      if (!shared) {
        cache({ ...roster, players });
        return;
      }
      applySnapshot(await api.pushRoster(players));
    },
    [applySnapshot, cache, roster, shared],
  );

  const saveTeamDetails = useCallback(
    async (patch: Partial<Roster>) => {
      const next = { ...roster, ...patch };
      cache(next); // optimistic, so typing in the field stays responsive
      if (shared && role === 'editor') {
        applySnapshot(await api.pushTeam(next.teamName, next.season));
      }
    },
    [applySnapshot, cache, role, roster, shared],
  );

  const clearLocal = useCallback(() => {
    clearRoster();
    setRoster(emptyRoster());
  }, []);

  return {
    roster,
    role,
    shared,
    needsSignIn: shared && !signedIn,
    syncState,
    error,
    canEdit: role === 'editor',
    signIn,
    signOut,
    refresh,
    savePlayers,
    saveTeamDetails,
    clearLocal,
  };
}
