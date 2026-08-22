import { canonicalOpponent, daysToKickoff, headToHead, isDone, nextGame, opponentKey, parseIcal, tidyOpponent } from './icalParse';

/*
 * Copied from the school's live ScheduleStar feed, folding and all. The folded
 * SUMMARY is the part worth keeping honest: iCal wraps at 75 octets and
 * continues on a line starting with a space, so a naive line-based reader sees
 * "Poland Seminary vs Streetsboro High School (Scrimmage) | Boys" and loses the
 * venue that says whether it's a home game.
 */
const FEED = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Poland Seminary vs Streetsboro High School (Scrimmage) | Boys
 Varsity Football | Home - Get school branded gear at 20% off
DTSTART:20260807T140000Z
LOCATION:3199 Dobbins Rd\\, Poland\\, OH 44514
END:VEVENT
BEGIN:VEVENT
SUMMARY:Poland Seminary vs Salem Jr/Sr High School | Boys Varsity Foot
 ball | Home (Season Opener) - Get school branded gear
DTSTART:20260821T230000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:Poland Seminary vs Field High School | Boys Varsity Football |
  Away - Get school branded gear
DTSTART:20260904T230000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:Poland Seminary vs Hubbard High School | Boys Varsity Football
  | Home (Homecoming) - Get school branded gear
DTSTART:20260918T230000Z
END:VEVENT
BEGIN:VEVENT
SUMMARY:Poland Seminary vs Girard Jr/Sr HS | Boys Varsity Football | H
 ome (Football/ Cheer  Senior Night) - Get school branded gear
DTSTART:20261009T230000Z
END:VEVENT
END:VCALENDAR`;

describe('parseIcal', () => {
  const { games, teamName } = parseIcal(FEED);

  it('reads every fixture', () => {
    expect(games).toHaveLength(5);
  });

  it('works out which side is us', () => {
    expect(teamName).toBe('Poland Seminary');
  });

  it('unfolds wrapped lines to reach the venue', () => {
    // Without unfolding, "Home" is on the continuation line and lost.
    expect(games.find((g) => g.opponent === 'Streetsboro')?.home).toBe(true);
    expect(games.find((g) => g.opponent === 'Field')?.home).toBe(false);
  });

  it('tidies school names down to what people say', () => {
    expect(games.map((g) => g.opponent)).toEqual([
      'Streetsboro',
      'Salem',
      'Field',
      'Hubbard',
      'Girard',
    ]);
  });

  it('marks scrimmages', () => {
    expect(games.find((g) => g.opponent === 'Streetsboro')?.scrimmage).toBe(true);
    expect(games.find((g) => g.opponent === 'Salem')?.scrimmage).toBe(false);
  });

  it('keeps the occasion the school tagged the night with', () => {
    expect(games.find((g) => g.opponent === 'Hubbard')?.occasion).toBe('Homecoming');
    expect(games.find((g) => g.opponent === 'Salem')?.occasion).toBe('Season Opener');
    // Double space in the feed, tidied.
    expect(games.find((g) => g.opponent === 'Girard')?.occasion).toBe('Football/ Cheer Senior Night');
  });

  it('dates a Friday-night kickoff as Friday', () => {
    // 23:00Z is 7pm in Ohio; a naive UTC read would call the late ones Saturday.
    expect(games.find((g) => g.opponent === 'Salem')?.date).toBe('2026-08-21');
    expect(new Date(games.find((g) => g.opponent === 'Salem')!.kickoff!).getUTCHours()).toBe(23);
  });

  it('sorts by date', () => {
    expect(games.map((g) => g.date)).toEqual([...games.map((g) => g.date)].sort());
  });

  it('leaves a game unplayed when the feed carries no score', () => {
    expect(games.every((g) => g.result === undefined)).toBe(true);
  });

  it('ignores anything that is not an event', () => {
    expect(parseIcal('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR').games).toEqual([]);
  });
});

describe('tidyOpponent', () => {
  it('strips the school furniture but keeps the name', () => {
    expect(tidyOpponent('Salem Jr/Sr High School')).toBe('Salem');
    expect(tidyOpponent('Girard Jr/Sr HS')).toBe('Girard');
    expect(tidyOpponent('Niles McKinley High School')).toBe('Niles McKinley');
    expect(tidyOpponent('South Range')).toBe('South Range');
  });

  it('matches the same school written two ways', () => {
    // Hudl says "Salem High School", the calendar says "Salem Jr/Sr High School".
    expect(opponentKey('Salem High School')).toBe(opponentKey('Salem Jr/Sr High School'));
    expect(opponentKey('Girard High School')).toBe(opponentKey('Girard Jr/Sr HS'));
  });
});

describe('score parsing', () => {
  const withSummary = (s: string) =>
    parseIcal(`BEGIN:VEVENT\nSUMMARY:${s}\nDTSTART:20251003T230000Z\nEND:VEVENT`).games[0];

  it('reads a W/L result', () => {
    expect(withSummary('Poland Seminary vs Salem HS | Football | Home W 35-14').result).toEqual({
      us: 35,
      them: 14,
      won: true,
    });
    expect(withSummary('Poland Seminary vs Salem HS | Football | Away L 7-21').result).toEqual({
      us: 7,
      them: 21,
      won: false,
    });
  });

  it('reads a Final score, taking the home side first', () => {
    expect(withSummary('Poland Seminary vs Salem HS | Football | Home - Final 28-10').result).toEqual(
      { us: 28, them: 10, won: true },
    );
    expect(withSummary('Poland Seminary vs Salem HS | Football | Away - Final 28-10').result).toEqual(
      { us: 10, them: 28, won: false },
    );
  });

  it('does not invent a result from a date or a time', () => {
    expect(withSummary('Poland Seminary vs Salem HS | Football | Home 7-00 p.m.').result)
      .toBeUndefined();
  });
});

describe('nextGame', () => {
  const { games } = parseIcal(FEED);

  it('finds the next unplayed fixture', () => {
    expect(nextGame(games, new Date('2026-08-18T12:00:00Z'))?.opponent).toBe('Salem');
  });

  it('still counts today', () => {
    expect(nextGame(games, new Date('2026-08-21T12:00:00Z'))?.opponent).toBe('Salem');
  });

  it('moves on once a date has passed', () => {
    expect(nextGame(games, new Date('2026-08-22T12:00:00Z'))?.opponent).toBe('Field');
  });

  it('returns nothing when the season is over', () => {
    expect(nextGame(games, new Date('2027-01-01T12:00:00Z'))).toBeUndefined();
  });

  /*
   * The gap this closes: a Friday night game ends around ten and the rebuild
   * that fetches the score does not run until two in the morning. Before this,
   * "Next up" pointed at a finished game for those four hours — the ones when
   * the most people are looking at it.
   */
  it('moves on once a game is over, before any score exists', () => {
    const kickoff = new Date('2026-08-21T23:00:00Z');
    const hours = (n: number) => new Date(kickoff.getTime() + n * 3600000);

    expect(nextGame(games, hours(2))?.opponent).toBe('Salem');
    expect(nextGame(games, hours(4))?.opponent).toBe('Field');
  });
});

describe('isDone', () => {
  const game = {
    date: '2026-08-21',
    kickoff: '2026-08-21T23:00:00.000Z',
    opponent: 'Salem',
    opponentKey: 'salem',
    home: true,
    scrimmage: false,
  };
  const after = (hours: number) => new Date(new Date(game.kickoff).getTime() + hours * 3600000);

  it('is false while the game is being played', () => {
    expect(isDone(game, after(1))).toBe(false);
    expect(isDone(game, after(3))).toBe(false);
  });

  it('is true once long enough has passed for it to be over', () => {
    expect(isDone(game, after(4))).toBe(true);
  });

  it('is true the moment there is a score, whatever the clock says', () => {
    const played = { ...game, result: { us: 48, them: 26, won: true } };
    expect(isDone(played, after(-24))).toBe(true);
  });

  /*
   * A fixture with no kickoff time gets the end of its day rather than a
   * guessed kickoff. Being late to move on is a smaller error than declaring a
   * game finished while the teams are still out there.
   */
  it('waits for the end of the day when the feed gave no kickoff time', () => {
    const dateOnly = { ...game, kickoff: undefined };
    expect(isDone(dateOnly, new Date('2026-08-21T21:00:00'))).toBe(false);
    expect(isDone(dateOnly, new Date('2026-08-22T00:30:00'))).toBe(true);
  });
});

describe('daysToKickoff', () => {
  /*
   * The card counts down from this, so it changes on its own between one
   * render and the next. Every case fixes "now" rather than trusting the clock.
   */
  const game = { date: '2026-09-11', scrimmage: false, home: true, opponent: 'Salem', opponentKey: 'salem' };
  const at = (local: string) => new Date(local);

  it('counts calendar days, not twenty-four hour blocks', () => {
    // Both of these are one sleep away. Dividing the gap by 24 hours would
    // call the first of them game day, a day early.
    expect(daysToKickoff(game, at('2026-09-10T23:30:00'))).toBe(1);
    expect(daysToKickoff(game, at('2026-09-10T00:30:00'))).toBe(1);
  });

  it('is zero all through game day', () => {
    expect(daysToKickoff(game, at('2026-09-11T08:00:00'))).toBe(0);
    // Still game day after kickoff has been and gone.
    expect(daysToKickoff(game, at('2026-09-11T23:00:00'))).toBe(0);
  });

  it('counts whole days however far out the fixture is', () => {
    expect(daysToKickoff(game, at('2026-09-08T12:00:00'))).toBe(3);
    expect(daysToKickoff(game, at('2026-09-04T12:00:00'))).toBe(7);
    expect(daysToKickoff(game, at('2026-08-28T12:00:00'))).toBe(14);
  });

  it('gives nothing for a fixture already played', () => {
    expect(daysToKickoff(game, at('2026-09-12T00:30:00'))).toBeNull();
  });

  it('reads a kickoff instant in the local zone, like the screen does', () => {
    const timed = { ...game, kickoff: '2026-09-12T00:00:00Z' };
    expect(daysToKickoff(timed, new Date(Date.parse('2026-09-12T00:00:00Z')))).toBe(0);
  });
});

describe('headToHead', () => {
  const history = parseIcal(
    [
      'BEGIN:VEVENT\nSUMMARY:Poland Seminary vs Salem HS | F | Home W 35-14\nDTSTART:20250822T230000Z\nEND:VEVENT',
      'BEGIN:VEVENT\nSUMMARY:Poland Seminary vs Salem HS | F | Away L 7-21\nDTSTART:20240823T230000Z\nEND:VEVENT',
      'BEGIN:VEVENT\nSUMMARY:Poland Seminary vs Salem HS | F | Home W 28-0\nDTSTART:20230825T230000Z\nEND:VEVENT',
      'BEGIN:VEVENT\nSUMMARY:Poland Seminary vs Salem HS (Scrimmage) | F | Home W 40-0\nDTSTART:20220812T230000Z\nEND:VEVENT',
      'BEGIN:VEVENT\nSUMMARY:Poland Seminary vs Girard HS | F | Home W 14-7\nDTSTART:20251010T230000Z\nEND:VEVENT',
    ].join('\n'),
  ).games;

  it('counts the record against one opponent', () => {
    const h = headToHead(history, opponentKey('Salem High School'));
    expect(h.played).toBe(3);
    expect(h.won).toBe(2);
    expect(h.lost).toBe(1);
  });

  it('leaves scrimmages out of the record', () => {
    expect(headToHead(history, opponentKey('Salem')).meetings.every((m) => !m.scrimmage)).toBe(true);
  });

  it('puts the most recent meeting first', () => {
    expect(headToHead(history, opponentKey('Salem')).meetings[0].date).toBe('2025-08-22');
  });

  it('reports nothing rather than guessing for a new opponent', () => {
    const h = headToHead(history, opponentKey('Kirtland'));
    expect(h).toEqual({ played: 0, won: 0, lost: 0, meetings: [] });
  });

  /*
   * The screen passes the committed history and this season's played games as
   * one list, because history.json stops at the end of last season. Without
   * that, four days after losing to Salem the panel under Salem still read
   * 2-1 from three meetings and made no mention of the game just played.
   */
  it('counts a game played this season alongside the record book', () => {
    const thisSeason = parseIcal(
      'BEGIN:VEVENT\nSUMMARY:Poland Seminary vs Salem HS | F | Home L 17-21\nDTSTART:20260821T230000Z\nEND:VEVENT',
    ).games;

    const h = headToHead([...history, ...thisSeason], opponentKey('Salem'));

    expect({ played: h.played, won: h.won, lost: h.lost }).toEqual({ played: 4, won: 2, lost: 2 });
    expect(h.meetings[0].date).toBe('2026-08-21');
  });
});

describe('canonicalOpponent', () => {
  // Poland's record book files fifteen meetings under "McKinley"; the school's
  // calendar feed calls the same school Niles McKinley. Nothing matched, so a
  // team they have played every year since 2011 showed no previous meetings.
  const aliases = {
    mckinley: 'Niles McKinley',
    niles: 'Niles McKinley',
    nilesmckinley: 'Niles McKinley',
  };

  it('lands every spelling of one school on the same key', () => {
    const keys = ['McKinley', 'Niles', 'Niles McKinley', 'Niles McKinley High School'].map(
      (name) => canonicalOpponent(name, aliases).opponentKey,
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(opponentKey('Niles McKinley'));
  });

  it('prints the name the team actually uses', () => {
    expect(canonicalOpponent('McKinley', aliases).opponent).toBe('Niles McKinley');
  });

  it('leaves a school with no alias exactly as it was', () => {
    expect(canonicalOpponent('Struthers High School', aliases)).toEqual({
      opponent: 'Struthers',
      opponentKey: 'struthers',
    });
  });

  it('changes nothing at all when a team declares no aliases', () => {
    expect(canonicalOpponent('McKinley')).toEqual({ opponent: 'McKinley', opponentKey: 'mckinley' });
  });

  it('matches a feed fixture to the record book through the alias', () => {
    const feed = parseIcal(
      'BEGIN:VEVENT\nSUMMARY:Poland Seminary vs Niles McKinley High School | F | Home\nDTSTART:20260925T230000Z\nEND:VEVENT',
      aliases,
    ).games;

    // How the build expands a terse history row, aliases and all.
    const book = [
      { date: '2025-09-26', ...canonicalOpponent('McKinley', aliases), home: true, scrimmage: false, result: { us: 21, them: 14, won: true } },
      { date: '2024-09-27', ...canonicalOpponent('McKinley', aliases), home: false, scrimmage: false, result: { us: 7, them: 28, won: false } },
    ];

    expect(headToHead(book, feed[0].opponentKey).played).toBe(2);
  });
});
