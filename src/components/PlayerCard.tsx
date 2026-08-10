import { categoriesAcross, summarise } from '../stats/statsFormat';
import { playerKey, type PlayerStats } from '../stats/statsMatch';
import type { StatsStore } from '../stats/statsStore';
import { formatHeight, formatWeight, fullName, SIDE_LABEL, type Player } from '../types';

type Props = { player: Player; onBack?: () => void; stats?: StatsStore };

/** The answer to "who is #7" — sized to be read at arm's length in the stands. */
export function PlayerCard({ player, onBack, stats }: Props) {
  const meta = [
    player.position,
    player.side ? SIDE_LABEL[player.side] : '',
    player.grade ? gradeLabel(player.grade) : '',
  ].filter(Boolean);

  const body = [formatHeight(player.heightIn), formatWeight(player.weightLb)].filter(Boolean);

  const key = playerKey(player);
  const previous = stats?.previous?.byPlayer[key];
  const current = stats?.current?.byPlayer[key];

  /*
   * With stats to show, the number stops being the headline and becomes a
   * label: you just typed it, so you know it. It moves beside the name instead
   * of above it, which buys back the height the table needs — otherwise the
   * card is a huge digit and you scroll to reach the thing you came for.
   * With no stats there's nothing to make room for, so it stays big.
   */
  const hasStats = Boolean(previous || current) || Boolean(player.lines?.length);

  return (
    <div className={`card${hasStats ? ' card-with-stats' : ''}`}>
      {onBack && (
        <button type="button" className="card-back" onClick={onBack}>
          ← back to matches
        </button>
      )}

      <div className="card-head">
        {player.photo ? (
          // Loaded from where it lives rather than copied into this site. It
          // is decoration, not information — the number and the name are the
          // information — so a picture that never arrives leaves no gap.
          <img
            className="card-photo"
            src={player.photo}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="card-number" aria-label={`Number ${player.number}`}>
            {player.number || '—'}
          </div>
        )}
        <div className="card-who">
          <div className="card-name">{fullName(player) || 'Unnamed player'}</div>
          {player.photo && (
            <div className="card-jersey" aria-label={`Number ${player.number}`}>
              #{player.number || '—'}
            </div>
          )}
          {meta.length > 0 && <div className="card-meta">{meta.join(' · ')}</div>}
          {body.length > 0 && <div className="card-body">{body.join('   ·   ')}</div>}
          {player.hometown && <div className="card-home">{player.hometown}</div>}
        </div>
      </div>

      {player.bio && <p className="card-bio">{player.bio}</p>}

      {player.lines && player.lines.length > 0 && (
        <div className="card-lines">
          {player.lines.map((l) => (
            <div key={l.label} className="card-line">
              <span className="card-line-value">{l.value}</span>
              <span className="card-line-label">{l.label}</span>
            </div>
          ))}
        </div>
      )}

      <StatsTable
        previous={previous}
        current={current}
        previousLabel={stats?.previous?.label ?? 'Last season'}
        currentLabel={stats?.current?.label ?? 'This season'}
      />
    </div>
  );
}

function StatsTable({
  previous,
  current,
  previousLabel,
  currentLabel,
}: {
  previous?: PlayerStats;
  current?: PlayerStats;
  previousLabel: string;
  currentLabel: string;
}) {
  // Rows come from both seasons at once, so a category the player only played
  // in one of them still lines up against a blank in the other.
  const categories = categoriesAcross(previous, current);
  if (categories.length === 0) return null;

  const prevByCategory = new Map(summarise(previous).map((s) => [s.category, s]));
  const currByCategory = new Map(summarise(current).map((s) => [s.category, s]));

  return (
    <div className="stats">
      <div className="stats-row stats-head">
        <span />
        <span>{previousLabel}</span>
        <span>{currentLabel}</span>
      </div>

      {categories.map((category) => {
        const a = prevByCategory.get(category);
        const b = currByCategory.get(category);
        return (
          <div className="stats-row" key={category}>
            <span className="stats-cat">{(a ?? b)?.label}</span>
            <span>{a ? a.parts.join(' · ') : <i className="stats-none">—</i>}</span>
            <span>{b ? b.parts.join(' · ') : <i className="stats-none">—</i>}</span>
          </div>
        );
      })}
    </div>
  );
}

const GRADE_WORDS: Record<string, string> = {
  Fr: 'Freshman',
  So: 'Sophomore',
  Jr: 'Junior',
  Sr: 'Senior',
  '9': '9th grade',
  '10': '10th grade',
  '11': '11th grade',
  '12': '12th grade',
};

const gradeLabel = (grade: string): string => GRADE_WORDS[grade] ?? grade;
