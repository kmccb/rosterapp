import { useEffect, useMemo, useState } from 'react';
import {
  clearSession,
  loadSession,
  requestMagicLink,
  saveSession,
  sessionFromUrl,
} from '../adminAuth';
import type { School } from '../../ohio/stateModel';
import { loadIndex, searchSchools } from '../store';
import { listRosters, type RosterRow } from './adminApi';
import { todayIso } from './saveArgs';
import { capital, groupSchools, longDate, STATUS_LABEL } from './schools';
import { SchoolPage } from './SchoolPage';

/**
 * The seller's side of the paid tier.
 *
 * One person uses this, a few times a week in season, at a laptop. It signs in
 * by magic link, lists every school with what it is selling and whether
 * anything needs attention, and opens a school to do the real work. Anyone
 * else who finds the URL gets a sign-in box that leads to a database that
 * refuses them — the gate is is_admin in SQL, not this screen.
 *
 * It is drawn in its own clothes (`.mg` in oh.css) rather than the fan page's.
 * For its first year every control here was a schedule row, because those were
 * the classes to hand, and Save, Delete and Back were three identical bars.
 */
export function Manage() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  // A clicked magic link lands here with tokens in the hash. Capture them
  // once, then take them out of the address bar — a URL with a token in it
  // ends up in screenshots and history.
  useEffect(() => {
    const fromLink = sessionFromUrl(location.href);
    if (fromLink) {
      saveSession(fromLink);
      history.replaceState(null, '', `${location.pathname}?manage`);
    }
    setSignedIn(Boolean(fromLink || loadSession()));
  }, []);

  const refresh = (): Promise<void> => {
    setError(null);
    return listRosters()
      .then(setRows)
      .catch((e: Error) => {
        if (e.message === 'signed-out') setSignedIn(false);
        else setError(e.message);
      });
  };

  useEffect(() => {
    if (!signedIn) return;
    void refresh();
    // Names for slugs, and the search behind Activate. A list without it still
    // works; it just reads in slugs.
    loadIndex().then(setSchools).catch(() => setSchools([]));
  }, [signedIn]);

  const today = todayIso();
  const groups = useMemo(() => groupSchools(rows ?? [], today), [rows, today]);
  const nameOf = (slug: string): School | undefined => schools.find((s) => s.slug === slug);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const school = schools.find((s) => s.slug === g.slug);
      return `${g.slug} ${school?.name ?? ''} ${school?.city ?? ''}`.toLowerCase().includes(q);
    });
  }, [groups, query, schools]);

  // Activate searches the whole directory, minus the schools already here —
  // those are opened from the list, not activated twice.
  const candidates = useMemo(
    () =>
      picking && query.trim()
        ? searchSchools(schools, query)
            .filter((s) => !groups.some((g) => g.slug === s.slug))
            .slice(0, 8)
        : [],
    [picking, query, schools, groups],
  );

  let body;
  if (!signedIn) {
    body = (
      <div className="mg-signin">
        <h1 className="mg-h1">Manage</h1>
        {sent ? (
          <p className="mg-sub">Check your email. The link signs you in here.</p>
        ) : (
          <form
            className="mg-inline"
            onSubmit={(e) => {
              e.preventDefault();
              requestMagicLink(email).then(() => setSent(true)).catch((err: Error) => setError(err.message));
            }}
          >
            <input
              className="mg-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Admin email"
            />
            <button type="submit" className="mg-btn is-primary">
              Email me a sign-in link
            </button>
          </form>
        )}
        {error && <p className="mg-error">{error}</p>}
      </div>
    );
  } else if (open) {
    body = (
      <SchoolPage
        key={open}
        slug={open}
        rows={groups.find((g) => g.slug === open)?.rows ?? []}
        schools={schools}
        onRefresh={refresh}
        onBack={() => {
          setOpen(null);
          void refresh();
        }}
      />
    );
  } else {
    const live = groups.filter((g) => g.status === 'live' || g.status === 'attention').length;
    body = (
      <>
        <header className="mg-school-head">
          <div>
            <h1 className="mg-h1">Schools</h1>
            <p className="mg-sub">
              {rows === null ? 'Loading…' : `${groups.length} activated · ${live} live`}
            </p>
          </div>
          <button
            type="button"
            className="mg-btn is-quiet"
            onClick={() => {
              clearSession();
              setSignedIn(false);
            }}
          >
            Sign out
          </button>
        </header>

        <div className="mg-toolbar">
          <input
            className="mg-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={picking ? 'Which school? Search all of Ohio' : 'Find a school'}
            aria-label={picking ? 'Search for the school to activate' : 'Find an activated school'}
            autoFocus={picking}
          />
          <button
            type="button"
            className={`mg-btn${picking ? '' : ' is-primary'}`}
            onClick={() => {
              setPicking(!picking);
              setQuery('');
            }}
          >
            {picking ? 'Cancel' : 'Activate a school'}
          </button>
        </div>

        {error && <p className="mg-error">{error}</p>}

        {picking ? (
          <div className="mg-card mg-list">
            {candidates.map((s) => (
              <button
                key={s.slug}
                type="button"
                className="mg-hit"
                onClick={() => {
                  setPicking(false);
                  setQuery('');
                  setOpen(s.slug);
                }}
              >
                {s.name} <span className="mg-hint">{s.city}</span>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="mg-hint mg-empty">
                {query.trim() ? 'No school by that name that isn’t already activated.' : 'Type a school’s name or town.'}
              </p>
            )}
          </div>
        ) : (
          <div className="mg-card mg-list">
            <div className="mg-list-row mg-list-head">
              <span>School</span>
              <span>Sports</span>
              <span>Status</span>
              <span>Paid through</span>
            </div>
            {shown.map((g) => {
              const school = nameOf(g.slug);
              return (
                <button key={g.slug} type="button" className="mg-list-row" onClick={() => setOpen(g.slug)}>
                  <span>
                    <span className="mg-list-name">{school?.name ?? g.slug}</span>
                    <span className="mg-hint">{school?.city ?? g.slug}</span>
                  </span>
                  <span>
                    <span className="mg-list-sports">
                      {g.rows.map((r) => `${capital(r.sport)} ${r.player_count}`).join(' · ')}
                    </span>
                    {g.problems.map((p) => (
                      <span className="mg-list-problem" key={p}>
                        {p}
                      </span>
                    ))}
                    {g.rows.find((r) => r.note)?.note && (
                      <span className="mg-hint">{g.rows.find((r) => r.note)?.note}</span>
                    )}
                  </span>
                  <span>
                    <span className={`mg-pill is-${g.status}`}>{STATUS_LABEL[g.status]}</span>
                  </span>
                  <span>{longDate(g.paidThrough)}</span>
                </button>
              );
            })}
            {rows !== null && shown.length === 0 && (
              <p className="mg-hint mg-empty">
                {groups.length ? 'No activated school matches that.' : 'No schools yet. Activate the first one.'}
              </p>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mg">
      <div className="mg-wrap">{body}</div>
    </div>
  );
}
