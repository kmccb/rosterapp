import { useMemo, useState } from 'react';
import { Keypad } from '../components/Keypad';
import { numberMatches } from '../parse/rosterParse';
import { formatHeight, formatWeight, fullName, type Player } from '../types';

/**
 * The paid part of a school's page: who is number seventeen.
 *
 * The keypad and the prefix matching are the root app's, because they are
 * the product — tap 7 and #7 leads with the 70s underneath. The list view is
 * the reverse lookup, by name. Nothing here needs an account or a signal
 * once the roster has been fetched once.
 *
 * `School.tsx` owns the tab bar now — it needs the same `.tabs`/`.tab` shell
 * every other tab bar on this bundle uses, sitting beside "Schedule" rather
 * than in a `.seg` of its own. This module exports the two tab bodies,
 * `LookupTab` and `TeamTab`, and keeps only what they share: the sort, the
 * match, and the row.
 *
 * `Row` below reuses the root app's `.row`/`.rows-dense` classes so this
 * looks exactly like `PlayerRow`, but it isn't `PlayerRow`: that component
 * is a `<button disabled={!onSelect}>`, and every row here is a dead end —
 * there is no card to open, so nothing was ever wired to `onSelect`. A
 * screen reader reads a permanently-disabled button as "unavailable" on
 * every single row, which is worse than not being a button at all. A plain
 * `<div>` with the same classes costs a few duplicate lines and reads
 * correctly instead.
 */

// A number that doesn't parse (blank, "N/A") sorts to the bottom; a
// player who legitimately wears #0 must not join it there, which
// `Number(n) || 999` got wrong because 0 is falsy. Number("") is 0 too,
// so blank is checked for directly rather than trusted to Number().
const sortKey = (n: string): number => {
  if (!n.trim()) return 999;
  const v = Number(n);
  return Number.isFinite(v) ? v : 999;
};

const useByNumber = (players: Player[]): Player[] =>
  useMemo(() => [...players].sort((a, b) => sortKey(a.number) - sortKey(b.number)), [players]);

export function LookupTab({ players }: { players: Player[] }) {
  const [query, setQuery] = useState('');
  const byNumber = useByNumber(players);

  const hits = useMemo(() => {
    if (!query) return [];
    const exact = byNumber.filter((p) => p.number === query);
    const prefix = byNumber.filter((p) => p.number !== query && numberMatches(p.number, query));
    return [...exact, ...prefix];
  }, [byNumber, query]);

  return (
    <>
      <div className="oh-query" aria-live="polite">{query || ' '}</div>
      {hits.length > 0 && (
        <div className="rows">
          {hits.map((p) => (
            <Row key={p.id} player={p} />
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
  );
}

export function TeamTab({ players }: { players: Player[] }) {
  const byNumber = useByNumber(players);

  return (
    <div className="rows rows-dense">
      {byNumber.map((p) => (
        <Row key={p.id} player={p} dense />
      ))}
    </div>
  );
}

const Row = ({ player, dense = false }: { player: Player; dense?: boolean }) => {
  if (dense) {
    const vitals = [formatHeight(player.heightIn), formatWeight(player.weightLb), player.grade]
      .filter(Boolean)
      .join(' · ');

    return (
      <div className="row">
        <span className="row-number">{player.number || '—'}</span>
        <span className="row-who">
          <span className="row-name">{fullName(player) || 'Unnamed player'}</span>
          {vitals && <span className="row-details">{vitals}</span>}
        </span>
        {player.position && <span className="row-pos">{player.position}</span>}
      </div>
    );
  }

  const details = [player.position, formatHeight(player.heightIn), formatWeight(player.weightLb), player.grade]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="row">
      <span className="row-number">{player.number || '—'}</span>
      <span className="row-text">
        <span className="row-name">{fullName(player) || 'Unnamed player'}</span>
        {details && <span className="row-details">{details}</span>}
      </span>
    </div>
  );
};
