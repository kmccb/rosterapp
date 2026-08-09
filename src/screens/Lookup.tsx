import { useEffect, useMemo, useState } from 'react';
import { Keypad } from '../components/Keypad';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerRow } from '../components/PlayerRow';
import { numberKey, numberMatches } from '../parse/rosterParse';
import type { Player, Roster } from '../types';

type Props = { roster: Roster; onGoToImport: () => void; restoring?: boolean };

export function Lookup({ roster, onGoToImport, restoring = false }: Props) {
  const [query, setQuery] = useState('');
  const [pinned, setPinned] = useState<Player | null>(null);

  const matches = useMemo(() => {
    if (!query) return [];
    return roster.players
      .filter((p) => numberMatches(p.number, query))
      .sort((a, b) => {
        // Exact match first, then ascending by number.
        const aExact = numberKey(a.number) === numberKey(query) ? 0 : 1;
        const bExact = numberKey(b.number) === numberKey(query) ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return Number(numberKey(a.number) || 0) - Number(numberKey(b.number) || 0);
      });
  }, [roster.players, query]);

  // Any change to the query invalidates a pinned selection.
  useEffect(() => setPinned(null), [query]);

  // Physical keyboard, for using this on a laptop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) setQuery((q) => (q.length >= 3 ? q : q + e.key));
      else if (e.key === 'Backspace') setQuery((q) => q.slice(0, -1));
      else if (e.key === 'Escape') setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addDigit = (d: string) => setQuery((q) => (q.length >= 3 ? q : q + d));

  const featured = pinned ?? (matches.length === 1 ? matches[0] : null);

  return (
    <div className="lookup">
      <div className="results">
        {roster.players.length === 0 ? (
          // Someone who has used this for weeks shouldn't be told there's no
          // roster while we're in the middle of fetching theirs back.
          restoring ? (
            <div className="empty">
              <p className="empty-title">Getting the roster</p>
              <p className="empty-text">This phone had one saved. Fetching it again…</p>
            </div>
          ) : (
            <div className="empty">
              <p className="empty-title">No roster yet</p>
              <p className="empty-text">Paste the team roster once and it stays on this phone.</p>
              <button type="button" className="btn btn-primary" onClick={onGoToImport}>
                Add the roster
              </button>
            </div>
          )
        ) : featured ? (
          <PlayerCard
            player={featured}
            onBack={pinned && matches.length > 1 ? () => setPinned(null) : undefined}
          />
        ) : query ? (
          matches.length > 0 ? (
            <>
              <p className="results-count">
                {matches.length} players starting with {query}
              </p>
              <div className="rows">
                {matches.map((p) => (
                  <PlayerRow key={p.id} player={p} onSelect={() => setPinned(p)} />
                ))}
              </div>
            </>
          ) : (
            <div className="empty">
              <p className="empty-number">{query}</p>
              <p className="empty-text">Nobody on the roster wears that.</p>
            </div>
          )
        ) : (
          <div className="empty">
            <p className="empty-text">Tap a jersey number.</p>
            <p className="empty-hint">
              {roster.players.length} players
              {roster.teamName ? ` · ${roster.teamName}` : ''}
            </p>
          </div>
        )}
      </div>

      <Keypad
        onDigit={addDigit}
        onBackspace={() => setQuery((q) => q.slice(0, -1))}
        onClear={() => setQuery('')}
        canDelete={query.length > 0}
      />
    </div>
  );
}
