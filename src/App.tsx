import { useCallback, useState } from 'react';
import { Import, type ImportMeta } from './screens/Import';
import { Lookup } from './screens/Lookup';
import { RosterList } from './screens/RosterList';
import { Settings } from './screens/Settings';
import { clearRoster, loadRoster, saveRoster } from './storage';
import { emptyRoster, type Player, type Roster } from './types';

type Tab = 'lookup' | 'team' | 'roster' | 'settings';

/*
 * Only the two screens a spectator uses are on the tab bar. Setting a roster up
 * is a once-a-season job, so Roster and Settings are still routable but reached
 * through the "No roster yet" state rather than a permanent tab that's wrong
 * for everyone holding a phone in the stands.
 *
 * That makes the empty state the only entrance, so setup has to be finishable
 * in one sitting: saving a roster deliberately does NOT bounce you to Lookup,
 * because leaving is what closes the door. Publishing needs a saved roster, and
 * this is the only point where you have one and can still reach Settings.
 */
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'team', label: 'Team' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('lookup');
  const [roster, setRoster] = useState<Roster>(() => loadRoster());

  const persist = useCallback((next: Roster) => {
    saveRoster(next);
    setRoster(loadRoster());
  }, []);

  const handleImport = useCallback(
    (players: Player[], meta?: ImportMeta) => {
      // A shared roster names its own team; a pasted one leaves whatever's set.
      persist({
        ...roster,
        players,
        teamName: meta?.teamName || roster.teamName,
        season: meta?.season || roster.season,
      });
    },
    [persist, roster],
  );

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">{roster.teamName || 'Roster Lookup'}</h1>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === 'lookup' && <Lookup roster={roster} onGoToImport={() => setTab('roster')} />}
        {tab === 'team' && <RosterList roster={roster} />}
        {tab === 'roster' && (
          <Import
            roster={roster}
            onSave={handleImport}
            onGoToSettings={() => setTab('settings')}
            onFinish={() => setTab('lookup')}
          />
        )}
        {tab === 'settings' && (
          <Settings
            roster={roster}
            onChange={(patch) => persist({ ...roster, ...patch })}
            onBack={() => setTab('roster')}
            onClear={() => {
              clearRoster();
              setRoster(emptyRoster());
              // Back to Lookup, where the empty state reopens the only door in.
              setTab('lookup');
            }}
          />
        )}
      </main>
    </div>
  );
}
