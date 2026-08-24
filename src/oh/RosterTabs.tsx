import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keypad } from '../components/Keypad';
import { numberKey, numberMatches } from '../parse/rosterParse';
import { inArea, positionsForArea, positionsOf, sidesOf } from '../roster/filters';
import { formatHeight, formatWeight, fullName, type Player, type Side } from '../types';

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
 * The Team tab narrows the same way Poland's does, out of the same module:
 * `src/roster/filters` is pure — it reaches no further than `../parse` and
 * `../types` — so a WR/CB counts as both sides here exactly as he does there,
 * and a fix to that rule lands on both pages at once. What is *not* shared is
 * `src/screens/RosterList.tsx` itself, which this file may not import; the bar
 * below is that screen's markup rebuilt over `/oh/`'s own rows.
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

/**
 * `footer` is the page's own way out — "Follow a different school", and the
 * privacy notice. Poland keeps neither on its Lookup screen, but `/oh/` is a
 * public fan page and Lookup is the tab every paid school lands on, so a
 * privacy link only reachable by first tapping Team would be unreachable in
 * practice. It rides inside the scrolling half of the column, above the keys
 * rather than below them: the pad owns the bottom of the screen and there is
 * nothing underneath it to scroll to.
 */
export function LookupTab({ players, footer }: { players: Player[]; footer?: ReactNode }) {
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
      {/* Everything between the readout and the keys, in one box, because the
          column needs a single part that gives up height — the hits alone
          cannot be it once there is a footer under them. */}
      <div className="oh-lookup-body">
        {hits.length > 0 && (
          <div className="rows">
            {hits.map((p) => (
              <Row key={p.id} player={p} />
            ))}
          </div>
        )}
        {query && !hits.length && <p className="empty-text">Nobody wears {query}.</p>}
        {footer && <div className="oh-lookup-foot">{footer}</div>}
      </div>
      <Keypad
        onDigit={(d) => setQuery((q) => (q + d).slice(0, 2))}
        onBackspace={() => setQuery((q) => q.slice(0, -1))}
        onClear={() => setQuery('')}
        canDelete={query.length > 0}
      />
    </>
  );
}

const AREAS: Array<{ value: Side; label: string }> = [
  { value: 'O', label: 'Offense' },
  { value: 'D', label: 'Defense' },
  { value: 'ST', label: 'Special' },
];

/**
 * Only the sides this roster actually turns out on.
 *
 * A volleyball or basketball roster carries no positions at all, so this is
 * empty and the segment never renders — the degradation needs no special case,
 * it falls out of asking the roster rather than assuming football. A football
 * roster with no kicker listed gets Offense and Defense and no Special, for
 * the same reason: a chip that filters to nothing is worse than no chip.
 */
export const areasFor = (players: Player[]): Array<{ value: Side; label: string }> =>
  AREAS.filter((a) => players.some((p) => sidesOf(p).includes(a.value)));

/**
 * What is applied, and what it left — one line, instead of leaving a reader to
 * read three rows of chips back to work out why the list is short.
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

/** The whole roster, narrowable by side of the ball, by position and by name. */
export function TeamTab({ players }: { players: Player[] }) {
  const [search, setSearch] = useState('');
  const [area, setArea] = useState<Side | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [posOpen, setPosOpen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);

  const byNumber = useByNumber(players);
  const areas = useMemo(() => areasFor(byNumber), [byNumber]);
  const pool = useMemo(() => byNumber.filter((p) => inArea(p, area)), [byNumber, area]);

  // Positions come from the roster itself, narrowed to the chosen area, so a
  // chip never leads to an empty list.
  const positions = useMemo(() => positionsForArea(byNumber, area), [byNumber, area]);

  const shown = useMemo(() => {
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

  const hasPlayers = players.length > 0;

  /*
   * The decade headers pin directly under the bar, so they need its height,
   * and it does not have a fixed one: it grows when the position chips open
   * and again whenever a control wraps. Poland measures its bar for the same
   * reason. The one difference is where the answer is published — Poland puts
   * `--bar-h` on the enclosing `.screen`, but on this page `.screen` is shared
   * with the Schedule tab, whose own `.group-head` rows would then pin a bar's
   * height too low with no bar there to explain it. Publishing it on this
   * tab's own column keeps it scoped to the headers it is about, and it leaves
   * with them.
   */
  const publish = () => {
    const el = bar.current;
    const root = col.current;
    if (el && root) root.style.setProperty('--bar-h', `${el.offsetHeight}px`);
  };

  // Every render, because every way the bar changes height from in here — the
  // chips opening, a control appearing, a different set of chips wrapping onto
  // a second line — is a render.
  useEffect(publish);

  // And once, for the height changes no render explains: a rotation, a late
  // font, the chips rewrapping at a width nothing in this component chose.
  // `publish` is left out of the deps deliberately — it reads both elements off
  // refs, so the copy captured here stays correct however many times the
  // function itself is rebuilt, and listing it would tear the observer down and
  // put it back on every keystroke.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasPlayers]);

  const filtering = area !== null || position !== null;

  return (
    <div ref={col}>
      {/*
        One bar rather than three stacked rows of controls. It pins, so the way
        out of a filter is still on screen at player 90, and the count line
        under it says what is applied.
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
            <span>{summarise(area, position, search, shown.length)}</span>
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
        <p className="empty-text">No roster published yet.</p>
      ) : shown.length === 0 ? (
        <p className="empty-text">Nobody matches that.</p>
      ) : (
        <div className="rows rows-dense">
          {byDecade(shown).map((g) => (
            <div key={g.label}>
              <div className="group-head">{g.label}</div>
              {g.players.map((p) => (
                <Row key={p.id} player={p} dense />
              ))}
            </div>
          ))}
        </div>
      )}
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
