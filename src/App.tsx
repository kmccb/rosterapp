import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchShared,
  forgetSource,
  loadSource,
  rememberSource,
  sharingAvailable,
} from './share/share';
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
  const [restoring, setRestoring] = useState(false);

  const persist = useCallback((next: Roster) => {
    saveRoster(next);
    setRoster(loadRoster());
  }, []);

  /*
   * Browser storage can be emptied without anyone asking — iOS evicts it, and
   * "clear site data" takes it too. If the roster came from a share code we
   * still know, fetch it back on launch rather than greeting a returning user
   * with a first-run screen.
   *
   * Deliberate deletion drops the code (see onClear), so this can never undo
   * someone choosing to remove the roster.
   */
  useEffect(() => {
    if (!sharingAvailable) return;
    if (loadRoster().players.length > 0) return;

    const code = loadSource();
    if (!code) return;

    let cancelled = false;
    setRestoring(true);

    // Bounded, so a connection that hangs rather than fails can't leave the app
    // sitting on "Getting the roster" with no way forward.
    fetchShared(code, 8000)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          // Definitively gone — the publisher took it down. Stop asking.
          forgetSource();
          return;
        }
        persist({
          teamName: found.teamName,
          season: found.season,
          players: found.players,
          updatedAt: new Date().toISOString(),
        });
      })
      // No signal is the normal case at a ground; leave the empty state be and
      // try again next launch rather than showing an error nobody can act on.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, [persist]);

  /** 700ms is past a tap and a scroll-start, short of feeling stuck. */
  const holdTimer = useRef<number | null>(null);
  const holdToSetUp = {
    start: () => {
      holdTimer.current = window.setTimeout(() => setTab('roster'), 700);
    },
    cancel: () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    },
  };

  useEffect(() => () => holdToSetUp.cancel(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImport = useCallback(
    (players: Player[], meta?: ImportMeta) => {
      // A shared roster names its own team; a pasted one leaves whatever's set.
      persist({
        ...roster,
        players,
        teamName: meta?.teamName || roster.teamName,
        season: meta?.season || roster.season,
      });
      // Only once it's saved: pulling a code and then abandoning the review
      // shouldn't tie this device to someone else's roster.
      if (meta?.sourceCode) rememberSource(meta.sourceCode);
    },
    [persist, roster],
  );

  return (
    <div className="app">
      <header className="header">
        {/*
          The escape hatch. Setup is normally reached from the empty Lookup
          screen, but auto-restore refills that screen before anyone can use it,
          which would leave a coach unable to reach Settings at all — including
          to stop sharing a published roster. A press-and-hold costs the stands
          nothing: it is invisible, and no accidental tap triggers it.
        */}
        <h1
          className="title"
          onPointerDown={holdToSetUp.start}
          onPointerUp={holdToSetUp.cancel}
          onPointerLeave={holdToSetUp.cancel}
          onContextMenu={(e) => e.preventDefault()}
          title="Press and hold to set up"
        >
          {roster.teamName || 'Roster Lookup'}
        </h1>
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
        {tab === 'lookup' && (
          <Lookup roster={roster} onGoToImport={() => setTab('roster')} restoring={restoring} />
        )}
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
              // Drop the share code too, or the next launch would helpfully
              // restore the roster this button just deleted.
              forgetSource();
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
