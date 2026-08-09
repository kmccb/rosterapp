import { useMemo, useState } from 'react';
import { Import } from './screens/Import';
import { Lookup } from './screens/Lookup';
import { RosterList } from './screens/RosterList';
import { Settings } from './screens/Settings';
import { SignIn } from './screens/SignIn';
import { useTeam } from './useTeam';

type Tab = 'lookup' | 'team' | 'roster' | 'settings';

const SYNC_LABEL: Record<string, string> = {
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline — showing your last download',
  error: 'Sync problem',
  local: 'On this device',
};

export default function App() {
  const [tab, setTab] = useState<Tab>('lookup');
  const team = useTeam();

  const tabs = useMemo(() => {
    const all: Array<{ id: Tab; label: string }> = [
      { id: 'lookup', label: 'Lookup' },
      { id: 'team', label: 'Team' },
      { id: 'roster', label: 'Roster' },
      { id: 'settings', label: 'Settings' },
    ];
    // Viewers can't import, so the tab would only lead to a dead end.
    return team.canEdit ? all : all.filter((t) => t.id !== 'roster');
  }, [team.canEdit]);

  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'lookup';

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <h1 className="title">{team.roster.teamName || 'Roster Lookup'}</h1>
          {team.shared && (
            <span className={`sync sync-${team.syncState}`} title={team.error || undefined}>
              {SYNC_LABEL[team.syncState]}
            </span>
          )}
        </div>
        {!team.needsSignIn && (
          <nav className="tabs" aria-label="Sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
                aria-current={activeTab === t.id ? 'page' : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="main">
        {team.needsSignIn ? (
          <SignIn onSignIn={team.signIn} hasCachedRoster={team.roster.players.length > 0} />
        ) : (
          <>
            {activeTab === 'lookup' && (
              <Lookup
                roster={team.roster}
                canEdit={team.canEdit}
                onGoToImport={() => setTab('roster')}
              />
            )}
            {activeTab === 'team' && <RosterList roster={team.roster} />}
            {activeTab === 'roster' && team.canEdit && (
              <Import
                roster={team.roster}
                shared={team.shared}
                onSave={async (players) => {
                  await team.savePlayers(players);
                  // Straight back to the keypad — that's what the import was for.
                  setTab('lookup');
                }}
              />
            )}
            {activeTab === 'settings' && (
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
