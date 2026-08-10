import { sideOfPosition, splitPositions } from '../parse/rosterParse';
import type { Player, Side } from '../types';

/**
 * Narrowing the roster by side of the ball and by position.
 *
 * The rule throughout: a player belongs to every side they play, not to one.
 * High school teams are small enough that half the roster goes both ways, and
 * the stored `side` column can only hold a single value — so a WR/CB was filed
 * under neither offence nor defence, and a kicker listed K/WR meant the team
 * appeared to have no special teams at all.
 *
 * Where the sources disagree they're combined rather than ranked. This is a
 * tool for finding a player: showing him under one side too many costs a
 * glance, and leaving him out entirely looks broken.
 */

/** "WR/CB" is one player who plays two positions, and counts as both. */
export const positionsOf = (p: Player): string[] => splitPositions(p.position);

/** Every side this player turns out on, from their positions and their column. */
export const sidesOf = (p: Player): Side[] => {
  const sides = new Set<Side>();
  for (const pos of positionsOf(p)) {
    const side = sideOfPosition(pos);
    if (side) sides.add(side);
  }
  if (p.side) sides.add(p.side);
  return [...sides];
};

/** Null means no filter, so everyone. */
export const inArea = (p: Player, area: Side | null): boolean =>
  !area || sidesOf(p).includes(area);

/**
 * The position chips to offer for a side.
 *
 * Only positions played on that side, so filtering to Offence offers WR for
 * the WR/CB and not CB — a chip that led to an empty list, or to a defensive
 * position under an offensive heading, is worse than no chip.
 *
 * A position nobody recognises (ATH, or a typo) is kept, because the player
 * carrying it is in this list and needs some chip that finds him.
 */
export const positionsForArea = (players: Player[], area: Side | null): string[] => {
  const seen = new Set<string>();
  for (const p of players) {
    if (!inArea(p, area)) continue;
    for (const pos of positionsOf(p)) {
      const side = sideOfPosition(pos);
      if (!area || side === area || side === '') seen.add(pos);
    }
  }
  return [...seen].sort();
};
