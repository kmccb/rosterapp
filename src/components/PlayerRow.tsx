import { formatHeight, formatWeight, fullName, type Player } from '../types';

/**
 * One line in a list of matches — number, name, and the vitals at a glance.
 *
 * Two densities. Lookup shows a handful of matches and gives each one a card,
 * because there is room. The Team list is a hundred and seventy names and the
 * question is how many fit on a screen, so `dense` drops the box, shrinks the
 * digit and moves the position out to the right edge where the eye can run
 * down it.
 */
export function PlayerRow({
  player,
  onSelect,
  dense = false,
}: {
  player: Player;
  onSelect?: () => void;
  dense?: boolean;
}) {
  if (dense) {
    // The position has its own column here, so it comes out of the run-on.
    const vitals = [formatHeight(player.heightIn), formatWeight(player.weightLb), player.grade]
      .filter(Boolean)
      .join(' · ');

    return (
      <button type="button" className="row" onClick={onSelect} disabled={!onSelect}>
        <span className="row-number">{player.number || '—'}</span>
        <span className="row-who">
          <span className="row-name">{fullName(player) || 'Unnamed player'}</span>
          {vitals && <span className="row-details">{vitals}</span>}
        </span>
        {player.position && <span className="row-pos">{player.position}</span>}
      </button>
    );
  }

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
