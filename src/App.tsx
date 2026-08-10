import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  fetchShared,
  forgetSource,
  loadShareKey,
  loadSource,
  loadSynced,
  normalizeCode,
  releaseShareKeyUnless,
  rememberSource,
  rememberSynced,
  sharingAvailable,
  takeCodeFromUrl,
} from './share/share';
import { loadStats, saveStats, type StatsStore } from './stats/statsStore';
import { applyTheme, bakedTeam, initialTheme, saveTheme, teamBase, type Theme } from './theme/theme';
import { Import, type ImportMeta } from './screens/Import';
import { StatsImport } from './screens/StatsImport';
import { Lookup } from './screens/Lookup';
import { RosterList } from './screens/RosterList';
import { Schedule } from './screens/Schedule';
import { Settings } from './screens/Settings';
import { clearRoster, loadRoster, saveRoster } from './storage';
import { emptyRoster, type Player, type Roster } from './types';

type Tab = 'lookup' | 'team' | 'schedule' | 'roster' | 'settings' | 'stats';

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
/*
 * Schedule only appears for a team whose build actually produced one. A tab
 * that opens on "no schedule for this team" is worse than no tab.
 */
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'team', label: 'Team' },
  ...(bakedTeam()?.schedule === false ? [] : [{ id: 'schedule' as Tab, label: 'Schedule' }]),
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
  const [stats, setStats] = useState<StatsStore>(() => loadStats());
  const [theme, setTheme] = useState<Theme | null>(() => initialTheme());

  // Paint the team's colours on before anything renders in the default ones.
  useLayoutEffect(() => applyTheme(theme), [theme]);

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
    const hasRoster = existing.players.length > 0;
    const linked = LINK_CODE;
    const source = loadSource();
    const code = linked ?? source;
    if (!code) return;

    /*
     * A link for a *different* roster than the one already here. Don't replace
     * it silently: open the import screen with the code filled in so they see
     * what's arriving first.
     */
    if (linked && hasRoster && linked !== source) {
      setPendingCode(linked);
      setTab('roster');
      return;
    }

    /*
     * This device published that code, so its copy is the source of truth.
     * Pulling the server's version back over it would be a round trip at best,
     * and would undo an edit that hasn't been uploaded yet. Matched on the code
     * rather than merely "has a key", because the link now stays in the address
     * and a publisher can arrive with someone else's code in hand.
     */
    if (hasRoster && loadShareKey()?.code === code) return;

    /*
     * With no roster this is a restore, and the screen says so. With one already
     * here it's a quiet check for a newer version — the coach uploads and every
     * phone picks it up next launch. Keyed on whether there's a roster rather
     * than on how the code arrived: the code is in the address on every launch
     * now, so treating its presence as "first visit" would show the restoring
     * screen every single time.
     */
    const topUp = hasRoster;

    let cancelled = false;
    if (!topUp) setRestoring(true);

    // Bounded, so a connection that hangs rather than fails can't leave the app
    // sitting on "Getting the roster" with no way forward.
    fetchShared(code, 8000)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          // Taken down. A phone that already has the roster keeps it — that was
          // the promise when sharing stopped — so only give up when there's
          // nothing local to lose.
          if (!topUp) forgetSource();
          return;
        }
        // Already have this exact version; leave everything alone.
        if (topUp && found.updatedAt === loadSynced()) return;

        persist({
          teamName: found.teamName,
          season: found.season,
          players: found.players,
          updatedAt: new Date().toISOString(),
        });
        // Only overwrite local stats when the share actually carried some. An
        // older publish, or one from a phone that never pasted any, must not
        // wipe what's already here.
        if (Object.keys(found.stats).length > 0) {
          saveStats(found.stats);
          setStats(found.stats);
        }
        // The badge travels too, so a second school's link brings its own look.
        if (found.theme) {
          saveTheme(found.theme);
          setTheme(found.theme);
        }
        // A followed link ties this device to that roster from now on, so it
        // restores itself later exactly like a code typed in by hand.
        rememberSource(code);
        releaseShareKeyUnless(code);
        // The publisher's own stamp, so the next launch can tell a fresh
        // upload from the copy already sitting here.
        rememberSynced(found.updatedAt);
      })
      // No signal is the normal case at a ground; leave the empty state be and
      // try again next launch rather than showing an error nobody can act on.
      .catch(() => {})
      .finally(() => {
        if (!cancelled && !topUp) setRestoring(false);
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
      if (meta?.sourceCode) {
        rememberSource(meta.sourceCode);
        releaseShareKeyUnless(meta.sourceCode);
      }
      if (meta?.stats && Object.keys(meta.stats).length > 0) {
        saveStats(meta.stats);
        setStats(meta.stats);
      }
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
          {roster.teamName || bakedTeam()?.name || 'Roster Lookup'}
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
          <Lookup
            roster={roster}
            onGoToImport={() => setTab('roster')}
            restoring={restoring}
            stats={stats}
          />
        )}
        {tab === 'team' && <RosterList roster={roster} stats={stats} />}
        {tab === 'schedule' && <Schedule base={teamBase()} />}
        {tab === 'roster' && (
          <Import
            roster={roster}
            onSave={handleImport}
            onGoToSettings={() => setTab('settings')}
            onGoToStats={() => setTab('stats')}
            onFinish={() => setTab('lookup')}
            initialCode={pendingCode ?? undefined}
          />
        )}
        {tab === 'stats' && (
          <StatsImport
            roster={roster}
            stats={stats}
            onSaved={setStats}
            onBack={() => setTab('roster')}
            onGoToSettings={() => setTab('settings')}
          />
        )}
        {tab === 'settings' && (
          <Settings
            roster={roster}
            onChange={(patch) => persist({ ...roster, ...patch })}
            onBack={() => setTab('roster')}
            onGoToStats={() => setTab('stats')}
            stats={stats}
            theme={theme}
            onThemeChange={setTheme}
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
