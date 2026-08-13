/*
 * Reads a team's season out of a ScheduleStar iCal feed.
 *
 * The feed is the school's own, so it stays right without anyone retyping it —
 * fixtures move, and this moves with them. It carries no CORS header, so a phone
 * can't fetch it directly; the build does that instead and bakes the result in,
 * which is fine because a schedule is the same for everyone on the team.
 *
 * Pure, so the awkward parts — folded lines, "Home (Homecoming)", a school
 * called "Jr/Sr HS" in one place and "Jr/Sr High School" in another — can be
 * pinned in tests against the real feed.
 */

export type Game = {
  /** ISO date, e.g. "2026-08-21". */
  date: string;
  /** Kickoff in UTC, ISO. Absent when the feed gives a date with no time. */
  kickoff?: string;
  /** As printed, tidied: "Salem", "Niles McKinley". */
  opponent: string;
  /** Lower-case key for matching the same school across sources. */
  opponentKey: string;
  home: boolean;
  /** "Homecoming", "Senior Night" — whatever the school tagged the night as. */
  occasion?: string;
  scrimmage: boolean;
  /** Present once played. */
  result?: { us: number; them: number; won: boolean };
};

/** iCal folds long values onto continuation lines beginning with a space or tab. */
const unfold = (text: string): string => text.replace(/\r?\n[ \t]/g, '');

const field = (body: string, key: string): string => {
  const m = body.match(new RegExp(`^${key}[^:\\r\\n]*:(.*)$`, 'm'));
  return m ? m[1].trim().replace(/\\,/g, ',').replace(/\\n/g, ' ').trim() : '';
};

/** `20260821T230000Z` or `20260821` -> ISO date and, when given, a kickoff. */
const parseStamp = (raw: string): { date: string; kickoff?: string } | null => {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (!hh) return { date: `${y}-${mo}-${d}` };

  const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}${z ? 'Z' : ''}`;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return { date: `${y}-${mo}-${d}` };

  /*
   * The calendar date is taken locally, not from the UTC stamp. A 7pm Friday
   * kickoff in Ohio is Saturday 00:00 UTC, and a schedule that calls Friday's
   * game Saturday is wrong to everyone reading it.
   */
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000);
  return { date: local.toISOString().slice(0, 10), kickoff: when.toISOString() };
};

/** "Salem Jr/Sr High School" -> "Salem". Also the key used to match schools. */
export const tidyOpponent = (raw: string): string =>
  raw
    .replace(/\((?:scrimmage|jamboree)\)/gi, '')
    .replace(/\b(jr\.?\/sr\.?|senior|junior)\b/gi, '')
    .replace(/\b(high\s+school|high|school|hs)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,\-–]+$/, '')
    .trim();

export const opponentKey = (name: string): string =>
  tidyOpponent(name).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Maps the names one school goes by onto a single one.
 *
 * Schools rarely answer to one name. A calendar feed prints the legal one and a
 * record book prints what everyone says — Poland's own history has fifteen
 * meetings filed under "McKinley" while the feed calls the same school Niles
 * McKinley, so the head-to-head found nothing against a team they play every
 * year.
 *
 * Deliberately per-team and hand-written rather than fuzzy: "McKinley" means
 * Niles to Poland and Canton to half of Stark County, and no amount of string
 * distance knows which. Each team declares its own in teams/<slug>/team.json.
 */
export type OpponentAliases = Record<string, string>;

/**
 * Resolve a name to the one this team files that school under.
 * Unknown names pass straight through, so an empty table changes nothing.
 */
export const canonicalOpponent = (
  raw: string,
  aliases: OpponentAliases = {},
): { opponent: string; opponentKey: string } => {
  const key = opponentKey(raw);
  const alias = aliases[key];
  if (!alias) return { opponent: tidyOpponent(raw), opponentKey: key };
  return { opponent: tidyOpponent(alias), opponentKey: opponentKey(alias) };
};

/**
 * A played game's score, if the feed has started carrying one.
 *
 * The feed showed no results while the season was still ahead of it, so the
 * exact shape a score arrives in is unconfirmed. These are the forms these
 * calendars normally use; anything unrecognised simply leaves the game
 * unplayed rather than inventing a result.
 */
const parseScore = (text: string, weAreHome: boolean): Game['result'] | undefined => {
  const wl = text.match(/\b([WL])\s*[,:]?\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\b/i);
  if (wl) {
    const [, letter, a, b] = wl;
    const us = Number(a);
    const them = Number(b);
    return { us, them, won: letter.toUpperCase() === 'W' };
  }

  const bare = text.match(/\bFinal\b[^\d]{0,12}(\d{1,3})\s*[-–]\s*(\d{1,3})\b/i);
  if (bare) {
    const a = Number(bare[1]);
    const b = Number(bare[2]);
    // Without a W/L marker the home side is listed first by convention.
    const us = weAreHome ? a : b;
    const them = weAreHome ? b : a;
    return { us, them, won: us > them };
  }

  return undefined;
};

export type ParsedSchedule = { games: Game[]; teamName: string };

export function parseIcal(text: string, aliases: OpponentAliases = {}): ParsedSchedule {
  const unfolded = unfold(text);
  const chunks = unfolded.split('BEGIN:VEVENT').slice(1);

  const games: Game[] = [];
  const names = new Map<string, number>();

  for (const chunk of chunks) {
    const body = chunk.split('END:VEVENT')[0];
    const summary = field(body, 'SUMMARY');
    if (!summary) continue;

    const when = parseStamp(field(body, 'DTSTART'));
    if (!when) continue;

    // "Poland Seminary vs Salem Jr/Sr High School | Boys Varsity Football | Home (Homecoming) - ..."
    const [matchup = '', , venueRaw = ''] = summary.split('|').map((s) => s.trim());

    // The promotional tail after " - " is not part of the venue.
    const venue = venueRaw.split(' - ')[0].trim();
    const home = /^home/i.test(venue);
    const occasion = venue.match(/\(([^)]+)\)/)?.[1]?.replace(/\s{2,}/g, ' ').trim();

    const vs = matchup.split(/\s+(?:vs\.?|at|@)\s+/i);
    if (vs.length < 2) continue;
    const [us, them] = vs;
    names.set(us.trim(), (names.get(us.trim()) ?? 0) + 1);

    const scrimmage = /\(scrimmage\)|\bscrimmage\b/i.test(summary);

    games.push({
      ...when,
      ...canonicalOpponent(them, aliases),
      home,
      occasion,
      scrimmage,
      result: parseScore(`${summary} ${field(body, 'DESCRIPTION')}`, home),
    });
  }

  games.sort((a, b) => a.date.localeCompare(b.date));

  // Whichever side of the fixture is always us.
  const teamName = [...names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return { games, teamName };
}

/** The next game not yet played, from a given day. */
export const nextGame = (games: Game[], today = new Date()): Game | undefined => {
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  return games.find((g) => !g.result && g.date >= iso);
};

/**
 * How many sleeps until kickoff. 0 is game day; null once it has been played.
 *
 * Counted off the calendar rather than in hours, because that is how anyone
 * waiting for a game counts. A Friday night kickoff is one sleep away from
 * Thursday lunchtime and from Thursday midnight alike, which is not what
 * dividing the gap by twenty-four gives you — that would call the first of
 * those "today" and put the card a day out for most of the day before a game.
 */
export const daysToKickoff = (game: Game, today = new Date()): number | null => {
  const kickoff = game.kickoff ? new Date(game.kickoff) : new Date(`${game.date}T12:00:00`);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(kickoff) - midnight(today)) / 86400000);

  return Number.isFinite(days) && days >= 0 ? days : null;
};

export type HeadToHead = {
  played: number;
  won: number;
  lost: number;
  /** Most recent first. */
  meetings: Game[];
};

/**
 * The record against one opponent, across every season the app holds.
 * Scrimmages are left out — nobody counts them.
 */
export function headToHead(history: Game[], key: string): HeadToHead {
  const meetings = history
    .filter((g) => g.opponentKey === key && g.result && !g.scrimmage)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    played: meetings.length,
    won: meetings.filter((g) => g.result!.won).length,
    lost: meetings.filter((g) => !g.result!.won).length,
    meetings,
  };
}
