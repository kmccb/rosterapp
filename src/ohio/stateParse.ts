/*
 * Ohio's whole season, off sixteen pages.
 *
 * joeeitel publishes a scoreboard per week, and one page carries every game in
 * the state: the date, schools with the town they play in, and the score once
 * it exists. Kickoff time is optional (some games lack it); city is optional
 * (especially for out-of-state schools with a [XX] suffix). Both "at" and "vs"
 * used as separators (vs = neutral site). Cancelled games are deliberately skipped.
 *
 * Parser processes one line at a time, split on <br>, to prevent cross-line
 * regex bleeding and to make the completeness invariant testable: every date line
 * is either parsed (a game), cancelled (not a game), or unreadable (error condition).
 *
 * Pure, and pinned to saved copies of real pages, because this is one person's
 * site with no API and the shape can change without warning. A change fails a
 * test on a developer's machine instead of emptying a screen on a phone.
 */

export type StateSide = {
  name: string;
  city: string;
  /** "OH" unless the source printed a [XX] suffix. */
  state: string;
  /** Absent until played. */
  score: number | null;
};

export type StateGame = {
  week: number;
  /** ISO, e.g. "2026-08-21". */
  date: string;
  /** As printed — "7pm". Empty when the page gave none. */
  kickoff: string;
  away: StateSide;
  home: StateSide;
  /** "OT1", "OT3" — as the source marks it. */
  overtime?: string;
};

export type ParseResult = {
  games: StateGame[];
  cancelled: number;
  unreadable: string[];
};

/*
 * One side of a fixture: "Salem (Salem) " or "Everett (Everett) [PA] ",
 * or with empty city "Berea () [KY] ", followed by the score span.
 * The class is not pinned to text-primary because an unplayed game carries
 * the same span with text-danger and "***" inside it; matching on the class
 * would drop every unplayed fixture in the season. State abbreviations are
 * typically 2 letters but may be longer (e.g. [TBD], [UK]).
 */
const SIDE = String.raw`(.+?)\s*\(([^)]*)\)\s*(?:\[([A-Z]{2,})\]\s*)?<span class="text-(?:primary|danger)">(\d+|\*\*\*)<\/span>`;

/*
 * Date, optional kickoff (time-shaped), away school, then separator (at or vs),
 * then home school, optional overtime. Anchored to match one line completely.
 * For lines lacking a city, city becomes '', and state defaults to 'OH' unless
 * a [XX] suffix is present.
 */
const LINE = new RegExp(
  String.raw`^\s*(\d{4}-\d{2}-\d{2})\s+(?:(\d{1,2}(?::\d{2})?(?:am|pm|noon))\s+)?${SIDE}\s*(?:at|vs)\s*${SIDE}` +
    String.raw`(?:\s*<span class="text-danger">(OT\d+)<\/span>)?$`,
);

const side = (name: string, city: string, st: string | undefined, score: string): StateSide => ({
  name: name.trim(),
  city: city.trim(),
  state: st ?? 'OH',
  score: score === '***' ? null : Number(score),
});

export function parseScoreboardStrict(html: string, week: number): ParseResult {
  const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/);
  if (!preMatch) {
    return { games: [], cancelled: 0, unreadable: [] };
  }

  const preContent = preMatch[1];
  const lines = preContent.split('<br>');
  const games: StateGame[] = [];
  let cancelled = 0;
  const unreadable: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip lines that don't start with a date.
    if (!/^\d{4}-\d{2}-\d{2}/.test(line)) {
      continue;
    }

    // Check if this is a cancelled game.
    if (line.includes('<b>cancel</b>')) {
      cancelled++;
      continue;
    }

    // Try to parse the line.
    const m = LINE.exec(line);
    if (!m) {
      unreadable.push(line.substring(0, 150));
      continue;
    }

    const [, date, kickoff, aName, aCity, aState, aScore, hName, hCity, hState, hScore, ot] = m;

    games.push({
      week,
      date,
      kickoff: kickoff || '',
      away: side(aName, aCity, aState, aScore),
      home: side(hName, hCity, hState, hScore),
      ...(ot ? { overtime: ot } : {}),
    });
  }

  return { games, cancelled, unreadable };
}

export function parseScoreboard(html: string, week: number): StateGame[] {
  const result = parseScoreboardStrict(html, week);
  return result.games;
}
