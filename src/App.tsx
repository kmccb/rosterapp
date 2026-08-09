import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchShared,
  forgetSource,
  loadSource,
  normalizeCode,
  rememberSource,
  sharingAvailable,
  takeCodeFromUrl,
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

/*
 * Read once, at module load, rather than inside the effect — reading it strips
 * the code from the address bar, and StrictMode runs effects twice in
 * development. The first pass consumed the code and the second found an empty
 * hash, so a followed link quietly did nothing at all.
 */
const LINK_CODE = takeCodeFromUrl();

export default function App() {
  const [tab, setTab] = useState<Tab>('lookup');
  const [roster, setRoster] = useState<Roster>(() => loadRoster());
  const [restoring, setRestoring] = useState(false);
  /** A code from a share link that needs reviewing before it replaces anything. */
  const [pendingCode, setPendingCode] = useState<string | null>(null);

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

    const existing = loadRoster();
    const linked = LINK_CODE;

    /*
     * Someone followed a share link. With nothing to lose, load it and put them
     * straight on the keypad — that is the whole promise of the link. If they
     * already have a *different* roster, don't silently replace it: open the
     * import screen with the code filled in so they see what's arriving first.
     */
    if (linked && existing.players.length > 0 && linked !== loadSource()) {
      setPendingCode(linked);
      setTab('roster');
      return;
    }

    const code = linked ?? loadSource();
    if (!code) return;
    if (!linked && existing.players.length > 0) return;

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
        // A followed link ties this device to that roster from now on, so it
        // restores itself later exactly like a code typed in by hand.
        rememberSource(code);
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

  /*
   * Tapping a share link while the app is already open is a fragment change,
   * not a page load, so none of the above would run and the link would appear
   * to do nothing. Reload and let the normal path handle it — the code is still
   * in the URL at that point, and gets consumed on the way through.
   */
  useEffect(() => {
    const onHashChange = () => {
      if (normalizeCode(window.location.hash.replace(/^#/, '')).length === 8) {
        window.location.reload();
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
            initialCode={pendingCode ?? undefined}
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
