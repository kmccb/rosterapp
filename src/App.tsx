import { useCallback, useState } from 'react';
import { Import, type ImportMeta } from './screens/Import';
import { Lookup } from './screens/Lookup';
import { RosterList } from './screens/RosterList';
import { Settings } from './screens/Settings';
import { clearRoster, loadRoster, saveRoster } from './storage';
import { emptyRoster, type Player, type Roster } from './types';

type Tab = 'lookup' | 'team' | 'roster' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'team', label: 'Team' },
  { id: 'roster', label: 'Roster' },
  { id: 'settings', label: 'Settings' },
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
      setTab('lookup');
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
        {tab === 'roster' && <Import roster={roster} onSave={handleImport} />}
        {tab === 'settings' && (
          <Settings
            roster={roster}
            onChange={(patch) => persist({ ...roster, ...patch })}
            onClear={() => {
              clearRoster();
              setRoster(emptyRoster());
            }}
          />
        )}
      </main>
    </div>
  );
}
