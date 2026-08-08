import { formatHeight, formatWeight, fullName, type Player } from '../types';

/** One line in a list of matches — number, name, and the vitals at a glance. */
export function PlayerRow({ player, onSelect }: { player: Player; onSelect?: () => void }) {
  const details = [player.position, formatHeight(player.heightIn), formatWeight(player.weightLb), player.grade]
    .filter(Boolean)
    .join(' · ');

  return (
    <button type="button" className="row" onClick={onSelect} disabled={!onSelect}>
      <span className="row-number">{player.number || '—'}</span>
      <span className="row-text">
        <span className="row-name">{fullName(player) || 'Unnamed player'}</span>
        {details && <span className="row-details">{details}</span>}
      </span>
    </button>
  );
}
