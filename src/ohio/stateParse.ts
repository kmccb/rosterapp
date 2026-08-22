/*
 * Ohio's whole season, off sixteen pages.
 *
 * joeeitel publishes a scoreboard per week, and one page carries every game in
 * the state: the date, the kickoff, both schools with the town they play in,
 * and the score once it exists. That is the entire free tier in sixteen
 * requests, and it is also the only source that prints a kickoff time for a
 * school that has not handed over a calendar feed.
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

/*
 * One side of a fixture: "Salem (Salem) " or "Everett (Everett) [PA] ",
 * followed by the score span. The class is not pinned to text-primary because
 * an unplayed game carries the same span with text-danger and "***" inside it;
 * matching on the class would drop every unplayed fixture in the season.
 */
const SIDE = String.raw`(.+?)\s*\((.+?)\)\s*(?:\[([A-Z]{2})\]\s*)?<span class="text-(?:primary|danger)">(\d+|\*\*\*)<\/span>`;

/*
 * The kickoff is required, not optional. Every one of the 4,275 games in the
 * 2026 season printed one, and an optional group here would happily swallow
 * the first word of a school's name on any line that did not.
 */
const LINE = new RegExp(
  String.raw`<br>\s*(\d{4}-\d{2}-\d{2})\s+(\S+)\s+${SIDE}\s*at\s*${SIDE}` +
    String.raw`(?:\s*<span class="text-danger">(OT\d+)<\/span>)?`,
  'g',
);

const side = (name: string, city: string, st: string | undefined, score: string): StateSide => ({
  name: name.trim(),
  city: city.trim(),
  state: st ?? 'OH',
  score: score === '***' ? null : Number(score),
});

export function parseScoreboard(html: string, week: number): StateGame[] {
  const games: StateGame[] = [];

  for (const m of html.matchAll(LINE)) {
    const [, date, kickoff, aName, aCity, aState, aScore, hName, hCity, hState, hScore, ot] = m;

    games.push({
      week,
      date,
      kickoff,
      away: side(aName, aCity, aState, aScore),
      home: side(hName, hCity, hState, hScore),
      ...(ot ? { overtime: ot } : {}),
    });
  }

  return games;
}
