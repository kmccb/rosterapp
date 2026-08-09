import { useEffect, useState } from 'react';
import { Import } from './screens/Import';
import { Lookup } from './screens/Lookup';
import { RosterList } from './screens/RosterList';
import { Settings } from './screens/Settings';
import { SignIn } from './screens/SignIn';
import { useTeam } from './useTeam';

type View = 'lookup' | 'team' | 'roster' | 'settings';

const TITLES: Record<Exclude<View, 'lookup'>, string> = {
  team: 'Full roster',
  roster: 'Import roster',
  settings: 'Settings',
};

const SYNC_LABEL: Record<string, string> = {
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline — showing your last download',
  error: 'Sync problem',
  local: 'On this device',
};

export default function App() {
  const [view, setView] = useState<View>('lookup');
  const [menuOpen, setMenuOpen] = useState(false);
  const team = useTeam();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const go = (next: View) => {
    setView(next);
    setMenuOpen(false);
  };

  // Anything but the keypad is somewhere you deliberately navigated to.
  const onLanding = view === 'lookup';

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          {onLanding ? (
            <h1 className="title">{team.roster.teamName || 'Roster Lookup'}</h1>
          ) : (
            <button type="button" className="back-btn" onClick={() => setView('lookup')}>
              ← {TITLES[view as Exclude<View, 'lookup'>]}
            </button>
          )}

          {!team.needsSignIn && (
            <button
              type="button"
              className="menu-btn"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              <span className="menu-icon" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {menuOpen && (
        <>
          <button
            type="button"
            className="scrim"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav className="menu" aria-label="Sections">
            <button type="button" className="menu-item" onClick={() => go('lookup')}>
              Number lookup
            </button>
            <button type="button" className="menu-item" onClick={() => go('team')}>
              Full roster
            </button>
            {team.canEdit && (
              <button type="button" className="menu-item" onClick={() => go('roster')}>
                Import roster
              </button>
            )}
            <button type="button" className="menu-item" onClick={() => go('settings')}>
              Settings
            </button>
            {team.shared && <p className="menu-status">{SYNC_LABEL[team.syncState]}</p>}
          </nav>
        </>
      )}

      <main className="main">
        {team.needsSignIn ? (
          <SignIn onSignIn={team.signIn} hasCachedRoster={team.roster.players.length > 0} />
        ) : (
          <>
            {view === 'lookup' && (
              <Lookup
                roster={team.roster}
                canEdit={team.canEdit}
                onGoToImport={() => setView('roster')}
              />
            )}
            {view === 'team' && <RosterList roster={team.roster} />}
            {view === 'roster' && team.canEdit && (
              <Import
                roster={team.roster}
                shared={team.shared}
                onSave={async (players) => {
                  await team.savePlayers(players);
                  // Straight back to the keypad — that's what the import was for.
                  setView('lookup');
                }}
              />
            )}
            {view === 'settings' && (
              <Settings
                roster={team.roster}
                shared={team.shared}
                canEdit={team.canEdit}
                syncLabel={SYNC_LABEL[team.syncState]}
                onChange={team.saveTeamDetails}
                onClear={team.clearLocal}
                onSignOut={team.signOut}
                onRefresh={team.refresh}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
