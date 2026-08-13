import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

/** Numbers in tens, the way a programme lists them. */
const byDecade = (players: Player[]) => {
  const groups: Array<{ label: string; players: Player[] }> = [];
  for (const p of players) {
    const tens = Math.floor(Number(numberKey(p.number) || 0) / 10) * 10;
    const label = tens === 0 ? 'Single digits' : `${tens}s`;
    const last = groups[groups.length - 1];
    if (last?.label === label) last.players.push(p);
    else groups.push({ label, players: [p] });
  }
  return groups;
};

/**
 * What is applied, and what it left — one line instead of three rows of chips
 * you have to read back to work out why the list is short.
 */
const summarise = (area: Side | null, position: string | null, search: string, n: number) => {
  const named = [
    area && AREAS.find((a) => a.value === area)?.label,
    position,
    search.trim() && `“${search.trim()}”`,
  ].filter(Boolean);
  const noun = n === 1 ? 'player' : 'players';
  return named.length ? `${named.join(' · ')} — ${n} ${noun}` : `${n} ${noun}, by number`;
};

/** The reverse lookup: "what number is Jake?", now narrowable by area and position. */
export function RosterList({ roster, stats }: { roster: Roster; stats?: StatsStore }) {
  const [search, setSearch] = useState('');
  const [area, setArea] = useState<Side | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);
  const [posOpen, setPosOpen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

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
    // The positions on offer just changed; showing them beats leaving them
    // behind a pill nobody knows to tap.
    if (next !== null) setPosOpen(true);
  };

  const hasPlayers = roster.players.length > 0;

  /*
   * The decade headers pin directly under the bar, so they need its height —
   * and it does not have a fixed one. It grows when the position chips open,
   * and again whenever a control wraps. A guess is wrong the moment either
   * happens, so the bar measures itself and publishes the answer.
   */
  useEffect(() => {
    const el = bar.current;
    if (!el) return;

    const publish = () =>
      el.closest<HTMLElement>('.screen')?.style.setProperty('--bar-h', `${el.offsetHeight}px`);

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasPlayers, selected]);

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
      {/*
        One bar rather than three stacked rows of controls. It pins, so the
        way out of a filter is still on screen at player 140, and the count
        line under it says what is applied instead of leaving you to read it
        back off the chips.
      */}
      {hasPlayers && (
        <div className="control-bar" ref={bar}>
          <div className="control-row">
            <input
              className="input search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, number or position"
              aria-label="Search the roster"
            />
            {positions.length > 1 && (
              <button
                type="button"
                className="pos-pill"
                aria-pressed={position !== null}
                aria-expanded={posOpen}
                onClick={() => setPosOpen((v) => !v)}
              >
                {position ?? 'Position'}
              </button>
            )}
          </div>

          {areas.length > 0 && (
            <div className="seg" role="group" aria-label="Filter by area">
              <button type="button" aria-pressed={area === null} onClick={() => pickArea(null)}>
                All
              </button>
              {areas.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  aria-pressed={area === a.value}
                  onClick={() => pickArea(a.value)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {posOpen && positions.length > 1 && (
            <div className="pos-chips" role="group" aria-label="Filter by position">
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

          <p className="filter-line">
            <span>{summarise(area, position, search, players.length)}</span>
            {(filtering || search.trim()) && (
              <button
                type="button"
                className="filter-clear"
                onClick={() => {
                  setArea(null);
                  setPosition(null);
                  setPosOpen(false);
                  setSearch('');
                }}
              >
                Clear
              </button>
            )}
          </p>
        </div>
      )}

      {!hasPlayers ? (
        <p className="empty-text">No roster yet — add one from Lookup.</p>
      ) : players.length === 0 ? (
        <p className="empty-text">Nobody matches that.</p>
      ) : (
        <div className="rows rows-dense">
          {byDecade(players).map((g) => (
            <div key={g.label}>
              <div className="group-head">{g.label}</div>
              {g.players.map((p) => (
                <PlayerRow key={p.id} player={p} dense onSelect={() => setSelected(p)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
