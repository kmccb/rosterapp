import { sessionFromUrl } from './adminAuth';

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
