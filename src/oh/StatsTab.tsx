import { useMemo, useState } from 'react';
import { bySide, leaders, type Side } from '../stats/leaders';
import type { PlayerStats } from '../stats/statsMatch';
import type { Player } from '../types';
import { updatedLabel } from './teamStats';

type Segment = 'leaders' | Side;

const SEGMENTS: Array<{ id: Segment; label: string }> = [
  { id: 'leaders', label: 'Leaders' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'special', label: 'Special' },
];

/**
 * Who leads, and who has done anything on each side of the ball.
 *
 * Poland's Stats tab, rebuilt over this page's own rows: the ranking and the
 * wording come from `src/stats`, which is pure and shared, while
 * `src/screens/TeamStats.tsx` is the root app's and may not be imported here.
 * Like Poland's, a row opens the player: his card, with his season a game at
 * a time (src/oh/PlayerSheet.tsx), which the page draws in place of the tab.
 */
export function StatsTab({
  players,
  totals,
  updated,
  source,
  onSelect,
}: {
  players: Player[];
  /** playerKey -> category -> values, already matched to `players`. */
  totals: Record<string, PlayerStats>;
  updated: string;
  source: string;
  /** Opens the player whose stats these are, by the key the totals are filed under. */
  onSelect: (key: string) => void;
}) {
  const [segment, setSegment] = useState<Segment>('leaders');

  const blocks = useMemo(() => leaders(totals, players), [totals, players]);
  const side = useMemo(
    () => (segment === 'leaders' ? [] : bySide(totals, players, segment)),
    [totals, players, segment],
  );

  const day = updatedLabel(updated);
  const credit = [source && `Season stats from ${source}`, day && `updated ${day}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div className="control-bar">
        <div className="seg" role="group" aria-label="What to show">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={segment === s.id}
              onClick={() => setSegment(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {segment === 'leaders' &&
        blocks.map((b) => (
          <div key={b.category}>
            <div className="group-head">{b.label}</div>
            <div className="rows">
              {b.rows.map((r) => (
                <button type="button" className="row" key={r.key} onClick={() => onSelect(r.key)}>
                  <span className="row-number">{r.number || '—'}</span>
                  <span className="row-text">
                    <span className="row-name">{r.name}</span>
                    <span className="row-details">{r.parts.join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

      {segment !== 'leaders' &&
        (side.length === 0 ? (
          <p className="empty-text">Nobody has a stat on this side yet.</p>
        ) : (
          <div className="rows">
            {side.map((r) => (
              <button type="button" className="row" key={r.key} onClick={() => onSelect(r.key)}>
                <span className="row-number">{r.number || '—'}</span>
                <span className="row-text">
                  <span className="row-name">{r.name}</span>
                  {r.lines.map((l) => (
                    <span className="row-details" key={l.category}>
                      {l.label} · {l.parts.join(' · ')}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        ))}

      {credit && (
        <p className="filter-line">
          <span>{credit}</span>
        </p>
      )}
    </>
  );
}
