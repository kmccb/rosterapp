import type { ReactNode } from 'react';
import type { Week } from '../maxpreps/weeks';
import { gameLabel } from '../stats/leaders';
import type { PlayerStats } from '../stats/statsMatch';
import { summarise } from '../stats/statsFormat';
import { formatHeight, formatWeight, fullName, type Player } from '../types';

/** A week as the card prints it: its name, and what this player did in it. */
export type PlayerWeek = { week: Week; stats: PlayerStats | undefined };

const GRADE_WORDS: Record<string, string> = {
  Fr: 'Freshman',
  So: 'Sophomore',
  Jr: 'Junior',
  Sr: 'Senior',
};

/** "Sep 4 · Garfield", or a stretch of games when a week cannot be one game. */
export const weekLabel = (week: Week): string => {
  if (week.game) return gameLabel(week.game.date, week.game.opponent);
  if (week.beforeTracking) return `Games ${week.from}–${week.to}, before week by week began`;
  return week.from === week.to ? `Game ${week.to}` : `Games ${week.from}–${week.to}`;
};

const Lines = ({ stats }: { stats: PlayerStats | undefined }): ReactNode =>
  summarise(stats).map((l) => (
    <div className="lg-game" key={l.category}>
      <span className="lg-side">{l.label}</span>
      <span className="lg-score">{l.parts.join(' · ')}</span>
    </div>
  ));

/**
 * One player, opened from Lookup, Team or Stats: who he is, his season, and
 * his season a game at a time.
 *
 * Poland's card, rebuilt from the root app's own classes because
 * src/components/PlayerCard.tsx belongs to that app's bundle and may not be
 * imported here. It is shorter on purpose — there is no last season on a paid
 * page — and its weeks come from src/maxpreps/weeks.ts rather than from games
 * a coach pasted: the newest first, because the question is "what did he do
 * on Friday", and a stretch nobody could split is said to be one.
 */
export function PlayerSheet({
  player,
  season,
  weeks,
  onBack,
}: {
  player: Player;
  season: PlayerStats | undefined;
  weeks: PlayerWeek[];
  onBack: () => void;
}) {
  const meta = [player.position, player.grade ? (GRADE_WORDS[player.grade] ?? player.grade) : '']
    .filter(Boolean)
    .join(' · ');
  const body = [formatHeight(player.heightIn), formatWeight(player.weightLb)].filter(Boolean).join(' · ');
  const seasonLines = summarise(season);
  const played = weeks.filter((w) => summarise(w.stats).length > 0).reverse();
  // The stretch before tracking began is the season itself until a game has
  // been tracked; printed under its own heading it would only repeat it.
  const tracked = played.some((w) => !w.week.beforeTracking);

  return (
    <div className={`card oh-card${seasonLines.length ? ' card-with-stats' : ''}`}>
      {/* Focused on open, so a keyboard or a screen reader starts on the card. */}
      <button type="button" className="card-back" onClick={onBack} autoFocus>
        ‹ Back
      </button>
      <div className="card-head">
        <div className="card-number" aria-label={`Number ${player.number}`}>
          {player.number || '—'}
        </div>
        <div className="card-who">
          <div className="card-name">{fullName(player) || 'Unnamed player'}</div>
          {meta && <div className="card-meta">{meta}</div>}
          {body && <div className="card-body">{body}</div>}
        </div>
      </div>

      {seasonLines.length > 0 && (
        <div className="oh-card-section">
          <div className="group-head">This season</div>
          <Lines stats={season} />
        </div>
      )}

      {seasonLines.length > 0 && (
        <div className="oh-card-section">
          <div className="group-head">Week by week</div>
          {!tracked ? (
            <p className="empty-text">Week by week starts with the next game.</p>
          ) : (
            played.map(({ week, stats }) => (
              <div key={`${week.from}-${week.to}`} className="oh-card-week">
                <div className="lg-game">
                  <span className="lg-side">
                    <strong>{weekLabel(week)}</strong>
                  </span>
                  <span className="lg-score" />
                </div>
                <Lines stats={stats} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
