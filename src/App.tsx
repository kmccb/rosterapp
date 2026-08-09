import { useCallback, useEffect, useState } from 'react';
import { Import, type ImportMeta } from './screens/Import';
import { Lookup } from './screens/Lookup';
import { RosterList } from './screens/RosterList';
import { Settings } from './screens/Settings';
import { clearRoster, loadRoster, saveRoster } from './storage';
import { emptyRoster, type Player, type Roster } from './types';

type View = 'lookup' | 'team' | 'roster' | 'settings';

const TITLES: Record<Exclude<View, 'lookup'>, string> = {
  team: 'Full roster',
  roster: 'Import roster',
  settings: 'Settings',
};

export default function App() {
  const [view, setView] = useState<View>('lookup');
  const [menuOpen, setMenuOpen] = useState(false);
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
      setView('lookup');
    },
    [persist, roster],
  );

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

  // The keypad is the landing page. Everything else you navigated to on purpose.
  const onLanding = view === 'lookup';

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          {onLanding ? (
            <h1 className="title">{roster.teamName || 'Roster Lookup'}</h1>
          ) : (
            <button type="button" className="back-btn" onClick={() => setView('lookup')}>
              ← {TITLES[view as Exclude<View, 'lookup'>]}
            </button>
          )}

          <button
            type="button"
            className="menu-btn"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <span className="menu-icon" aria-hidden="true" />
          </button>
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
            <button type="button" className="menu-item" onClick={() => go('roster')}>
              Import roster
            </button>
            <button type="button" className="menu-item" onClick={() => go('settings')}>
              Settings
            </button>
          </nav>
        </>
      )}

      <main className="main">
        {view === 'lookup' && <Lookup roster={roster} onGoToImport={() => setView('roster')} />}
        {view === 'team' && <RosterList roster={roster} />}
        {view === 'roster' && <Import roster={roster} onSave={handleImport} />}
        {view === 'settings' && (
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
