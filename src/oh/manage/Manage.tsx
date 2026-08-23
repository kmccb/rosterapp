import { useEffect, useState } from 'react';
import {
  clearSession,
  loadSession,
  requestMagicLink,
  saveSession,
  sessionFromUrl,
} from '../adminAuth';
import { listRosters, type RosterRow } from './adminApi';
import { Activate } from './Activate';

/**
 * The seller's side of the paid tier.
 *
 * One person uses this, a few times a week in season. It signs in by magic
 * link, lists every activation with its state, and opens the form that does
 * the real work. Anyone else who finds the URL gets a sign-in box that leads
 * to a database that refuses them — the gate is is_admin in SQL, not this
 * screen.
 */
export function Manage() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RosterRow | 'new' | null>(null);

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

  const refresh = () => {
    setError(null);
    listRosters()
      .then(setRows)
      .catch((e: Error) => {
        if (e.message === 'signed-out') setSignedIn(false);
        else setError(e.message);
      });
  };

  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="screen">
        <h1 className="next-card-opponent">Manage</h1>
        {sent ? (
          <p className="empty-text">Check your email — the link signs you in here.</p>
        ) : (
          <>
            <input
              className="search"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Admin email"
            />
            <button
              type="button"
              className="fixture-row is-plain"
              onClick={() => {
                requestMagicLink(email).then(() => setSent(true)).catch((e: Error) => setError(e.message));
              }}
            >
              <span className="fixture-team">Email me a sign-in link</span>
            </button>
            {error && <p className="empty-text">{error}</p>}
          </>
        )}
      </div>
    );
  }

  if (editing) {
    return (
      <Activate
        existing={editing === 'new' ? null : editing}
        onDone={() => {
          setEditing(null);
          refresh();
        }}
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="screen">
      <h1 className="next-card-opponent">Schools</h1>
      <p className="filter-line">
        <span>{rows ? `${rows.length} activated` : 'Loading…'}</span>
      </p>

      <button type="button" className="fixture-row is-plain" onClick={() => setEditing('new')}>
        <span className="fixture-team">+ Activate a school</span>
      </button>

      {error && <p className="empty-text">{error}</p>}

      {(rows ?? []).map((r) => {
        const state = !r.published ? 'unpublished' : r.paid_through < today ? 'expired' : 'live';
        return (
          <button
            key={`${r.school_slug}-${r.sport}-${r.season}`}
            type="button"
            className="fixture-row is-plain"
            onClick={() => setEditing(r)}
          >
            <span className="fixture-team">
              {r.school_slug} · {r.season}
              <span className="fixture-sub">
                {r.player_count} players · {state} · paid through {r.paid_through}
                {r.note && ` · ${r.note}`}
              </span>
            </span>
          </button>
        );
      })}

      <button
        type="button"
        className="fixture-row is-plain"
        onClick={() => {
          clearSession();
          setSignedIn(false);
        }}
      >
        <span className="fixture-team">Sign out</span>
      </button>
    </div>
  );
}
