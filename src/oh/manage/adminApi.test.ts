import { vi } from 'vitest';

vi.mock('../supa', () => ({
  rpc: vi.fn(async () => null),
  supaBase: 'https://db.test',
  supaKey: 'anon-key',
  supaAvailable: true,
}));
vi.mock('../adminAuth', () => ({ freshToken: vi.fn(async () => 'session-token') }));

import { rpc } from '../supa';
import { checkSource, setSources, syncNow } from './adminApi';

describe('setSources', () => {
  it('signs the call and sends every argument by name', async () => {
    await setSources({
      slug: 's', sport: 'volleyball', season: 2026,
      rosterUrl: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv', scheduleUrl: null, scheduleFilter: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      'school_roster_set_sources',
      {
        p_slug: 's', p_sport: 'volleyball', p_season: 2026,
        p_roster_url: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv',
        p_schedule_url: null, p_schedule_filter: null,
      },
      'session-token',
    );
  });
});

describe('the sync function', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('posts a check with the seller’s session', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, reason: 'r' }), { status: 200 }));
    const out = await checkSource({ kind: 'roster', url: 'u', filter: null, season: 2026 });
    expect(out).toEqual({ ok: false, reason: 'r' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://db.test/functions/v1/sync-sources');
    expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer session-token' });
    expect(JSON.parse(init.body)).toEqual({ action: 'check', kind: 'roster', url: 'u', filter: null, season: 2026 });
  });

  it('turns an error answer into a thrown message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'That activation has no linked sheet or calendar.' }), { status: 404 }));
    await expect(syncNow('s', 'volleyball', 2026)).rejects.toThrow('That activation has no linked sheet or calendar.');
  });
});
