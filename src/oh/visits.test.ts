import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same reason as rosterStore.test.ts: CI runs with no Supabase env, so the
// module is mocked whole and supaAvailable forced on.
vi.mock('./supa', () => ({
  supaAvailable: true,
  rpc: vi.fn(),
}));

import { rpc } from './supa';
import { countVisit, easternDay, resetCounted, visitKey } from './visits';

const mockedRpc = vi.mocked(rpc);

const memoryStore = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

const SLUG = 'springfield-new-middletown';
// 02:30 UTC on the 14th is still the evening of the 13th in Ohio.
const LATE = new Date('2026-11-14T02:30:00Z');

beforeEach(() => {
  mockedRpc.mockReset();
  mockedRpc.mockResolvedValue(null);
  resetCounted();
});

describe('easternDay', () => {
  it('names the day the way Ohio would, not UTC', () => {
    expect(easternDay(LATE)).toBe('2026-11-13');
    expect(easternDay(new Date('2026-11-14T15:00:00Z'))).toBe('2026-11-14');
  });
});

describe('countVisit', () => {
  it("counts a phone's first open of the day as a visitor, and remembers the day", async () => {
    const store = memoryStore();
    await countVisit(SLUG, { store, now: LATE, demo: false });
    expect(mockedRpc).toHaveBeenCalledWith('school_visit_count', { p_slug: SLUG, p_first_today: true });
    expect(store.data.get(visitKey(SLUG))).toBe('2026-11-13');
  });

  it('counts a later open the same day as an open only', async () => {
    const store = memoryStore({ [visitKey(SLUG)]: '2026-11-13' });
    await countVisit(SLUG, { store, now: LATE, demo: false });
    expect(mockedRpc).toHaveBeenCalledWith('school_visit_count', { p_slug: SLUG, p_first_today: false });
  });

  it('counts a school once per page load, however often the effect re-runs', async () => {
    const store = memoryStore();
    await countVisit(SLUG, { store, now: LATE, demo: false });
    await countVisit(SLUG, { store, now: LATE, demo: false });
    expect(mockedRpc).toHaveBeenCalledTimes(1);
  });

  it("doesn't count the demo, or a browser signed in to the panel", async () => {
    await countVisit('millbrook-demo', { store: memoryStore(), now: LATE, demo: true });
    await countVisit(SLUG, { store: memoryStore({ 'oh.admin.session': '{}' }), now: LATE, demo: false });
    expect(mockedRpc).not.toHaveBeenCalled();
  });

  it('still counts when the phone keeps no storage', async () => {
    await countVisit(SLUG, { store: null, now: LATE, demo: false });
    expect(mockedRpc).toHaveBeenCalledWith('school_visit_count', { p_slug: SLUG, p_first_today: true });
  });

  it('never lets a failed call reach the page', async () => {
    mockedRpc.mockRejectedValue(new Error('no signal'));
    await expect(countVisit(SLUG, { store: memoryStore(), now: LATE, demo: false })).resolves.toBeUndefined();
  });
});
