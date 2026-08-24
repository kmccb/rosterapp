import { describe, expect, it } from 'vitest';
import { areasFor } from './RosterTabs';
import { positionsForArea, sidesOf } from '../roster/filters';
import type { Player } from '../types';

/**
 * What the Team tab's bar can offer a given roster.
 *
 * The filtering itself is `src/roster/filters.ts`, and `filters.test.ts`
 * already pins it — these tests are about the wiring and the degradation.
 * A volleyball squad carries no positions at all, so the bar has to fall back
 * to a bare search box without anyone writing a special case for it.
 */

const player = (over: Partial<Player>): Player => ({
  id: over.number ?? 'x',
  number: '1',
  firstName: 'A',
  lastName: 'B',
  position: '',
  side: '',
  ...over,
});

describe('what the Team tab can offer a roster', () => {
  it('offers nothing to a roster with no positions — a volleyball squad', () => {
    const squad = [player({ number: '2' }), player({ number: '4' })];
    expect(positionsForArea(squad, null)).toEqual([]);
    expect(squad.every((p) => sidesOf(p).length === 0)).toBe(true);
    expect(areasFor(squad)).toEqual([]);
  });

  it('offers both sides to a two-way football player', () => {
    const wrcb = player({ number: '9', position: 'WR/CB' });
    expect(sidesOf(wrcb).sort()).toEqual(['D', 'O']);
    expect(positionsForArea([wrcb], 'O')).toEqual(['WR']);
    expect(positionsForArea([wrcb], 'D')).toEqual(['CB']);
  });

  it('offers only the sides the roster actually turns out on', () => {
    // No kicker, so no Special segment — three buttons that filter to
    // nothing are worse than two that don't.
    const squad = [
      player({ number: '9', position: 'WR/CB' }),
      player({ number: '55', position: 'OL' }),
    ];
    expect(areasFor(squad).map((a) => a.value)).toEqual(['O', 'D']);

    const withKicker = [...squad, player({ number: '3', position: 'K' })];
    expect(areasFor(withKicker).map((a) => a.value)).toEqual(['O', 'D', 'ST']);
  });

  it('keeps a position nobody recognises, because the player wearing it is here', () => {
    // ATH filters to no side, so it belongs to the All list and to every
    // area — there has to be some chip that finds him.
    const ath = player({ number: '1', position: 'ATH' });
    expect(positionsForArea([ath], null)).toEqual(['ATH']);
    expect(areasFor([ath])).toEqual([]);
  });
});
