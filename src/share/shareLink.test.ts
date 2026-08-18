import { describe, expect, it } from 'vitest';
import { codeFromUrl, shareUrlFor } from './share';

/*
 * Where the share code rides in a link.
 *
 * This is the one thing that has to survive iOS "Add to Home Screen": the
 * installed app gets its own empty storage jar, so the code in the address is
 * the only way it can find the roster it was installed for. The code used to
 * ride in the fragment, which kept it out of the server's logs but did not
 * survive being installed. It rides in the query now, and old links keep
 * working — every one already sent out carries a fragment.
 */
describe('codeFromUrl', () => {
  it('reads a code out of the query', () => {
    expect(codeFromUrl('https://roster.scottforge.ai/?c=BXQ4-T9KM')).toBe('BXQ4T9KM');
  });

  it('still reads a code out of the fragment, because links already sent carry one', () => {
    expect(codeFromUrl('https://roster.scottforge.ai/#BXQ4-T9KM')).toBe('BXQ4T9KM');
  });

  it('reads one under a team, where the path is the team', () => {
    expect(codeFromUrl('https://roster.scottforge.ai/victorychristian/?c=BXQ4T9KM')).toBe(
      'BXQ4T9KM',
    );
  });

  it('prefers the query when a link somehow carries both', () => {
    expect(codeFromUrl('https://roster.scottforge.ai/?c=AAAA1111#BBBB2222')).toBe('AAAA1111');
  });

  it('gives nothing for an address with no code, which is every ordinary visit', () => {
    expect(codeFromUrl('https://roster.scottforge.ai/')).toBeNull();
    expect(codeFromUrl('https://roster.scottforge.ai/ysu/')).toBeNull();
  });

  it('gives nothing for something that is not a code', () => {
    // A stats-import link, a stray anchor, half a code typed by hand.
    expect(codeFromUrl('https://roster.scottforge.ai/#stats')).toBeNull();
    expect(codeFromUrl('https://roster.scottforge.ai/?c=BXQ4')).toBeNull();
    expect(codeFromUrl('https://roster.scottforge.ai/?c=BXQ4T9KMEXTRA')).toBeNull();
  });
});

describe('shareUrlFor', () => {
  it('puts the code in the query, so an installed app still has it', () => {
    expect(shareUrlFor('https://roster.scottforge.ai', '', 'BXQ4T9KM')).toBe(
      'https://roster.scottforge.ai/?c=BXQ4-T9KM',
    );
  });

  it('keeps the team in the path', () => {
    expect(shareUrlFor('https://roster.scottforge.ai', 'victorychristian', 'BXQ4T9KM')).toBe(
      'https://roster.scottforge.ai/victorychristian/?c=BXQ4-T9KM',
    );
  });

  it('round-trips: what it writes is what the app reads back', () => {
    const url = shareUrlFor('https://roster.scottforge.ai', 'victorychristian', 'bxq4t9km');
    expect(codeFromUrl(url)).toBe('BXQ4T9KM');
  });
});
