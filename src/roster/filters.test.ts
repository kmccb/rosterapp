import { describe, expect, it } from 'vitest';
import { inArea, positionsForArea, sidesOf } from './filters';
import { sideFromPosition } from '../parse/rosterParse';
import type { Player } from '../types';

/*
 * The roster stores one side per player, which cannot describe a team where
 * half the squad goes both ways. A WR/CB was filed under neither offence nor
 * defence, and a kicker listed K/WR meant the Special chip never appeared at
 * all. Filtering derives the sides instead.
 */

let n = 0;
const player = (position: string, side: Player['side'] = ''): Player => ({
  id: `p${n++}`,
  number: `${n}`,
  firstName: 'A',
  lastName: 'Player',
  position,
  side,
});

describe('sidesOf', () => {
  it('keeps both sides for a two-way player', () => {
    expect(sidesOf(player('WR/CB')).sort()).toEqual(['D', 'O']);
  });

  it('counts a kicker who also plays as special teams and offence', () => {
    expect(sidesOf(player('K/WR')).sort()).toEqual(['O', 'ST']);
  });

  it('is the one side for a specialist', () => {
    expect(sidesOf(player('QB'))).toEqual(['O']);
    expect(sidesOf(player('LB'))).toEqual(['D']);
    expect(sidesOf(player('K'))).toEqual(['ST']);
  });

  it('falls back to the roster’s own column when the position says nothing', () => {
    expect(sidesOf(player('ATH', 'D'))).toEqual(['D']);
  });

  it('combines the column with the positions rather than choosing', () => {
    // The column can only hold one, so it is never evidence against the rest.
    expect(sidesOf(player('WR/CB', 'O')).sort()).toEqual(['D', 'O']);
  });

  it('has no side at all when nothing says one', () => {
    expect(sidesOf(player('ATH'))).toEqual([]);
  });
});

describe('inArea', () => {
  const squad = [player('QB'), player('WR/CB'), player('LB'), player('K/WR'), player('ATH', 'ST')];

  it('takes everyone when nothing is chosen', () => {
    expect(squad.filter((p) => inArea(p, null))).toHaveLength(5);
  });

  it('finds the two-way player under both sides', () => {
    const twoWay = squad[1];
    expect(inArea(twoWay, 'O')).toBe(true);
    expect(inArea(twoWay, 'D')).toBe(true);
    expect(inArea(twoWay, 'ST')).toBe(false);
  });

  it('counts the squad by side', () => {
    expect(squad.filter((p) => inArea(p, 'O'))).toHaveLength(3); // QB, WR/CB, K/WR
    expect(squad.filter((p) => inArea(p, 'D'))).toHaveLength(2); // WR/CB, LB
    expect(squad.filter((p) => inArea(p, 'ST'))).toHaveLength(2); // K/WR, ATH
  });
});

describe('positionsForArea', () => {
  const squad = [player('QB'), player('WR/CB'), player('LB'), player('K/WR')];

  it('offers every position when no side is chosen', () => {
    expect(positionsForArea(squad, null)).toEqual(['CB', 'K', 'LB', 'QB', 'WR']);
  });

  it('offers only the positions played on that side', () => {
    // The WR/CB is in the offence list, but as WR — not as CB.
    expect(positionsForArea(squad, 'O')).toEqual(['QB', 'WR']);
    expect(positionsForArea(squad, 'D')).toEqual(['CB', 'LB']);
    expect(positionsForArea(squad, 'ST')).toEqual(['K']);
  });

  it('keeps a position nobody recognises, so its player is still reachable', () => {
    const withAth = [...squad, player('ATH', 'D')];
    expect(positionsForArea(withAth, 'D')).toEqual(['ATH', 'CB', 'LB']);
  });

  it('never offers a position that finds nobody', () => {
    for (const area of [null, 'O', 'D', 'ST'] as const) {
      for (const pos of positionsForArea(squad, area)) {
        const found = squad.filter(
          (p) => inArea(p, area) && p.position.toUpperCase().split('/').includes(pos),
        );
        expect(found.length, `${area ?? 'all'} / ${pos}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the stored side column', () => {
  it('still gives up on a two-way player, because it can only hold one', () => {
    expect(sideFromPosition('WR/CB')).toBe('');
    expect(sideFromPosition('QB')).toBe('O');
    expect(sideFromPosition('K/WR')).toBe('O');
  });
});
