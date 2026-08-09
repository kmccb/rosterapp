import { useMemo, useState, type ReactNode } from 'react';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerRow } from '../components/PlayerRow';
import { numberKey } from '../parse/rosterParse';
import { fullName, type Player, type Roster, type Side } from '../types';

/**
 * "WR/CB" is one player who plays two positions, so it has to count as both —
 * filtering to CB and not finding your two-way corner would just look broken.
 */
const positionsOf = (p: Player): string[] =>
  p.position
    .split('/')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

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
export function RosterList({ roster }: { roster: Roster }) {
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
  // column would otherwise get three chips that all filter to nothing.
  const areas = useMemo(
    () => AREAS.filter((a) => byNumber.some((p) => p.side === a.value)),
    [byNumber],
  );

  const inArea = useMemo(
    () => (area ? byNumber.filter((p) => p.side === area) : byNumber),
    [byNumber, area],
  );

  // Positions come from the roster itself, narrowed to the chosen area, so a
  // chip never leads to an empty list.
  const positions = useMemo(() => {
    const seen = new Set<string>();
    inArea.forEach((p) => positionsOf(p).forEach((pos) => seen.add(pos)));
    return [...seen].sort();
  }, [inArea]);

  const players = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inArea.filter((p) => {
      if (position && !positionsOf(p).includes(position)) return false;
      if (!q) return true;
      return (
        fullName(p).toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        p.number.includes(q)
      );
    });
  }, [inArea, position, search]);

  // Switching area can strand a position that doesn't exist on that side.
  const pickArea = (next: Side | null) => {
    setArea(next);
    if (!position) return;
    const pool = next ? byNumber.filter((p) => p.side === next) : byNumber;
    if (!pool.some((p) => positionsOf(p).includes(position))) setPosition(null);
  };

  if (selected) {
    return (
      <div className="screen">
        <PlayerCard player={selected} onBack={() => setSelected(null)} />
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
