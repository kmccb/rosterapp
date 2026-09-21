import { useMemo, useState } from 'react';
import { bySide, gameLabel, leaders, type Side } from '../stats/leaders';
import { seasonTotals } from '../stats/seasonTotals';
import { summarise } from '../stats/statsFormat';
import { playerKey } from '../stats/statsMatch';
import type { StatsStore } from '../stats/statsStore';
import { fullName, type Roster } from '../types';

type Segment = 'leaders' | Side;

type Props = {
  roster: Roster;
  stats: StatsStore;
  /** The player whose weeks are open, held by App so the card's link can set it. */
  player: string | null;
  onPlayer: (key: string | null) => void;
};

const SEGMENTS: Array<{ id: Segment; label: string }> = [
  { id: 'leaders', label: 'Leaders' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'special', label: 'Special' },
];

/*
 * Three questions, one tab: who leads, who has done anything on each side,
 * and what one kid did each Friday. Every number here is the season's games
 * summed — the same sum the card reads — so nothing on this screen can be
 * out of step with anything else.
 */
export function TeamStats({ roster, stats, player, onPlayer }: Props) {
  const [segment, setSegment] = useState<Segment>('leaders');

  const season = stats.current;
  const totals = useMemo(() => seasonTotals(season), [season]);
  const players = roster.players;

  const blocks = useMemo(() => leaders(totals, players), [totals, players]);
  const side = useMemo(
    () => (segment === 'leaders' ? [] : bySide(totals, players, segment)),
    [totals, players, segment],
  );

  const open = player ? players.find((p) => playerKey(p) === player) ?? null : null;

  return (
    <div className="screen">
      <div className="control-bar">
        <div className="seg" role="group" aria-label="What to show">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={segment === s.id}
              onClick={() => { setSegment(s.id); onPlayer(null); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <>
          <p className="filter-line">
            <button type="button" className="link-btn" onClick={() => onPlayer(null)}>
              ‹ Back
            </button>
          </p>
          <div className="group-head">#{open.number} {fullName(open)}</div>

          {(season?.games ?? []).map((g) => {
            const lines = summarise(g.byPlayer[player as string]);
            if (lines.length === 0) return null;
            return (
              <div key={g.date}>
                <div className="lg-game">
                  <span className="lg-side"><strong>{gameLabel(g.date, g.opponent)}</strong></span>
                  <span className="lg-score" />
                </div>
                {lines.map((l) => (
                  <div className="lg-game" key={l.category}>
                    <span className="lg-side">{l.label}</span>
                    <span className="lg-score">{l.parts.join(' · ')}</span>
                  </div>
                ))}
              </div>
            );
          })}

          <div className="lg-game">
            <span className="lg-side"><strong>Season</strong></span>
            <span className="lg-score" />
          </div>
          {summarise(totals[player as string]).map((l) => (
            <div className="lg-game" key={l.category}>
              <span className="lg-side">{l.label}</span>
              <span className="lg-score">{l.parts.join(' · ')}</span>
            </div>
          ))}
          {(season?.games ?? []).length === 0 && (
            // A season paste has no weeks in it. Say so, or a bare Season block
            // reads as the weeks having gone missing.
            <p className="empty-text">
              Weeks appear once games are pasted one at a time — Setup → Stats → This season → One
              game. A whole-season paste holds only the totals.
            </p>
          )}
        </>
      )}

      {!open && segment === 'leaders' && (
        blocks.length === 0 ? (
          <p className="empty-text">No stats pasted for this season yet.</p>
        ) : (
          blocks.map((b) => (
            <div key={b.category}>
              <div className="group-head">{b.label}</div>
              <div className="rows">
                {b.rows.map((r) => (
                  <button type="button" className="row" key={r.key} onClick={() => onPlayer(r.key)}>
                    <span className="row-number">#{r.number}</span>
                    <span>{r.name}</span>
                    <span>{r.parts.join(' · ')}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )
      )}

      {!open && segment !== 'leaders' && (
        side.length === 0 ? (
          <p className="empty-text">Nobody has a stat on this side yet.</p>
        ) : (
          <div className="rows">
            {side.map((r) => (
              <button type="button" className="row" key={r.key} onClick={() => onPlayer(r.key)}>
                <span className="row-number">#{r.number}</span>
                <span>
                  <strong>{r.name}</strong>
                  {r.lines.map((l) => (
                    <span key={l.category}>
                      <br />
                      {l.label} · {l.parts.join(' · ')}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
