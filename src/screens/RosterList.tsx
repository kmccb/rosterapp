import { useMemo, useState } from 'react';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerRow } from '../components/PlayerRow';
import { numberKey } from '../parse/rosterParse';
import { fullName, type Player, type Roster } from '../types';

/** The reverse lookup: "what number is Jake?" */
export function RosterList({ roster }: { roster: Roster }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Player | null>(null);

  const players = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...roster.players].sort(
      (a, b) => Number(numberKey(a.number) || 0) - Number(numberKey(b.number) || 0),
    );
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        fullName(p).toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        p.number.includes(q),
    );
  }, [roster.players, search]);

  if (selected) {
    return (
      <div className="screen">
        <PlayerCard player={selected} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="screen">
      <input
        className="input search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, position or number"
        aria-label="Search the roster"
      />
      {roster.players.length === 0 ? (
        <p className="empty-text">No roster yet — add one from the Roster tab.</p>
      ) : players.length === 0 ? (
        <p className="empty-text">No players match “{search}”.</p>
      ) : (
        <div className="rows">
          {players.map((p) => (
            <PlayerRow key={p.id} player={p} onSelect={() => setSelected(p)} />
          ))}
        </div>
      )}
    </div>
  );
}
