import { useMemo, useState } from 'react';
import { Keypad } from '../components/Keypad';
import { PlayerRow } from '../components/PlayerRow';
import { numberMatches } from '../parse/rosterParse';
import type { SchoolRoster } from './rosterStore';

/**
 * The paid part of a school's page: who is number seventeen.
 *
 * The keypad and the prefix matching are the root app's, because they are
 * the product — tap 7 and #7 leads with the 70s underneath. The list view is
 * the reverse lookup, by name. Nothing here needs an account or a signal
 * once the roster has been fetched once. `PlayerRow` is the root app's too:
 * it only reaches into `../types`, so it costs nothing to reuse, and a
 * second implementation of "number, name, vitals" would just be a second
 * place for those two to drift apart.
 */
export function RosterTabs({ roster }: { roster: SchoolRoster }) {
  const [tab, setTab] = useState<'lookup' | 'team'>('lookup');
  const [query, setQuery] = useState('');

  const byNumber = useMemo(
    () =>
      [...roster.players].sort(
        (a, b) => (Number(a.number) || 999) - (Number(b.number) || 999),
      ),
    [roster.players],
  );

  const hits = useMemo(() => {
    if (!query) return [];
    const exact = byNumber.filter((p) => p.number === query);
    const prefix = byNumber.filter((p) => p.number !== query && numberMatches(p.number, query));
    return [...exact, ...prefix];
  }, [byNumber, query]);

  return (
    <div className="oh-roster">
      <div className="seg" role="group" aria-label="Roster view">
        <button type="button" aria-pressed={tab === 'lookup'} onClick={() => setTab('lookup')}>
          Lookup
        </button>
        <button type="button" aria-pressed={tab === 'team'} onClick={() => setTab('team')}>
          Team
        </button>
      </div>

      {tab === 'lookup' && (
        <>
          <div className="oh-query" aria-live="polite">{query || ' '}</div>
          {hits.length > 0 && (
            <div className="rows">
              {hits.map((p) => (
                <PlayerRow key={p.id} player={p} />
              ))}
            </div>
          )}
          {query && !hits.length && <p className="empty-text">Nobody wears {query}.</p>}
          <Keypad
            onDigit={(d) => setQuery((q) => (q + d).slice(0, 2))}
            onBackspace={() => setQuery((q) => q.slice(0, -1))}
            onClear={() => setQuery('')}
            canDelete={query.length > 0}
          />
        </>
      )}

      {tab === 'team' && (
        <div className="rows rows-dense">
          {byNumber.map((p) => (
            <PlayerRow key={p.id} player={p} dense />
          ))}
        </div>
      )}
    </div>
  );
}
