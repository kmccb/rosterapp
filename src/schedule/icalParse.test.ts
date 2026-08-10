import { headToHead, nextGame, opponentKey, parseIcal, tidyOpponent } from './icalParse';

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
});
