import { useMemo, useState, type ReactNode } from 'react';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerRow } from '../components/PlayerRow';
import { numberKey } from '../parse/rosterParse';
import { inArea, positionsForArea, positionsOf, sidesOf } from '../roster/filters';
import type { StatsStore } from '../stats/statsStore';
import { fullName, type Player, type Roster, type Side } from '../types';

const AREAS: Array<{ value: Side; label: string }> = [
  { value: 'O', label: 'Offense' },
  { value: 'D', label: 'Defense' },
  { value: 'ST', label: 'Special' },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`chip${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

/** The reverse lookup: "what number is Jake?", now narrowable by area and position. */
export function RosterList({ roster, stats }: { roster: Roster; stats?: StatsStore }) {
  const [search, setSearch] = useState('');
  const [area, setArea] = useState<Side | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);

  const byNumber = useMemo(
    () =>
      [...roster.players].sort(
        (a, b) => Number(numberKey(a.number) || 0) - Number(numberKey(b.number) || 0),
      ),
    [roster.players],
  );

  // Only offer areas the roster actually uses. A roster imported without a side
  // column, and without recognisable positions, would otherwise get three chips
  // that all filter to nothing.
  const areas = useMemo(
    () => AREAS.filter((a) => byNumber.some((p) => sidesOf(p).includes(a.value))),
    [byNumber],
  );

  const pool = useMemo(() => byNumber.filter((p) => inArea(p, area)), [byNumber, area]);

  // Positions come from the roster itself, narrowed to the chosen area, so a
  // chip never leads to an empty list.
  const positions = useMemo(() => positionsForArea(byNumber, area), [byNumber, area]);

  const players = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((p) => {
      if (position && !positionsOf(p).includes(position)) return false;
      if (!q) return true;
      return (
        fullName(p).toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        p.number.includes(q)
      );
    });
  }, [pool, position, search]);

  // Switching area can strand a position that isn't played on that side.
  const pickArea = (next: Side | null) => {
    setArea(next);
    if (position && !positionsForArea(byNumber, next).includes(position)) setPosition(null);
  };

  if (selected) {
    return (
      <div className="screen">
        <PlayerCard player={selected} onBack={() => setSelected(null)} stats={stats} />
      </div>
    );
  }

  const filtering = area !== null || position !== null;

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

      {roster.players.length > 0 && (
        <>
          {areas.length > 0 && (
            <div className="chips" role="group" aria-label="Filter by area">
              <Chip active={area === null} onClick={() => pickArea(null)}>
                All
              </Chip>
              {areas.map((a) => (
                <Chip key={a.value} active={area === a.value} onClick={() => pickArea(a.value)}>
                  {a.label}
                </Chip>
              ))}
            </div>
          )}

          {positions.length > 1 && (
            <div className="chips" role="group" aria-label="Filter by position">
              <Chip active={position === null} onClick={() => setPosition(null)}>
                All
              </Chip>
              {positions.map((pos) => (
                <Chip key={pos} active={position === pos} onClick={() => setPosition(pos)}>
                  {pos}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}

      {roster.players.length === 0 ? (
        <p className="empty-text">No roster yet — add one from Lookup.</p>
      ) : players.length === 0 ? (
        <p className="empty-text">Nobody matches that.</p>
      ) : (
        <>
          {(filtering || search.trim()) && (
            <p className="results-count">
              {players.length} {players.length === 1 ? 'player' : 'players'}
            </p>
          )}
          <div className="rows">
            {players.map((p) => (
              <PlayerRow key={p.id} player={p} onSelect={() => setSelected(p)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
