import { formatHeight, formatWeight, fullName, SIDE_LABEL, type Player } from '../types';

/** The answer to "who is #7" — sized to be read at arm's length in the stands. */
export function PlayerCard({ player, onBack }: { player: Player; onBack?: () => void }) {
  const meta = [
    player.position,
    player.side ? SIDE_LABEL[player.side] : '',
    player.grade ? gradeLabel(player.grade) : '',
  ].filter(Boolean);

  const body = [formatHeight(player.heightIn), formatWeight(player.weightLb)].filter(Boolean);

  return (
    <div className="card">
      {onBack && (
        <button type="button" className="card-back" onClick={onBack}>
          ← back to matches
        </button>
      )}
      <div className="card-number" aria-label={`Number ${player.number}`}>
        {player.number || '—'}
      </div>
      <div className="card-name">{fullName(player) || 'Unnamed player'}</div>
      {meta.length > 0 && <div className="card-meta">{meta.join(' · ')}</div>}
      {body.length > 0 && <div className="card-body">{body.join('   ·   ')}</div>}
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
