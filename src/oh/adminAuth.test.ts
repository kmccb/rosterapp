import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sessionFromUrl, freshToken, saveSession, loadSession } from './adminAuth';

describe('sessionFromUrl', () => {
  it('reads the tokens a magic link lands with', () => {
    const s = sessionFromUrl(
      'https://roster.scottforge.ai/oh/?manage#access_token=AAA&expires_in=3600&refresh_token=BBB&token_type=bearer&type=magiclink',
    );
    expect(s?.accessToken).toBe('AAA');
    expect(s?.refreshToken).toBe('BBB');
    // Expiry is absolute so a reload does not reset the clock.
    expect(s!.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
  });

  it('returns nothing for an ordinary visit', () => {
    expect(sessionFromUrl('https://roster.scottforge.ai/oh/?manage')).toBeNull();
    expect(sessionFromUrl('https://roster.scottforge.ai/oh/#privacy')).toBeNull();
  });

  it('returns nothing when the hash is missing a token', () => {
    expect(sessionFromUrl('https://x/oh/?manage#access_token=AAA&token_type=bearer')).toBeNull();
  });
});

describe('freshToken', () => {
  let localStorageMock: Map<string, string>;

  beforeEach(() => {
    localStorageMock = new Map();
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (key: string) => localStorageMock.get(key) ?? null,
        setItem: (key: string, value: string) => localStorageMock.set(key, value),
        removeItem: (key: string) => localStorageMock.delete(key),
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null and keeps session on network failure', async () => {
    const session = { accessToken: 'old', refreshToken: 'refresh_old', expiresAt: Date.now() - 1 };
    saveSession(session);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const token = await freshToken();
    expect(token).toBeNull();
    expect(loadSession()).toEqual(session);
  });

  it('returns null and clears session on bad refresh response', async () => {
    const session = { accessToken: 'old', refreshToken: 'refresh_old', expiresAt: Date.now() - 1 };
    saveSession(session);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const token = await freshToken();
    expect(token).toBeNull();
    expect(loadSession()).toBeNull();
  });
});
