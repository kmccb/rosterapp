/**
 * Ohio high school football, read off the one site that publishes it.
 *
 * There is no API. This parses `joeeitel.com`, which is a person rather than a
 * company, so the target can change without warning — everything here is a
 * pure function over a string and every one of them is pinned to a saved copy
 * of a real page. A change in shape fails a test on this machine instead of
 * emptying the screen on somebody's phone.
 */

export type TeamGame = {
  /** ISO, e.g. "2025-08-22". The season never crosses a new year. */
  date: string;
  home: boolean;
  opponent: string;
  opponentId: number;
  /** Their record as printed, e.g. "7-5". */
  opponentRecord: string;
  /** Absent until played. Us first, them second. */
  result?: { us: number; them: number };
};

export type TeamPage = {
  name: string;
  record: string;
  /** Roman, as printed: "IV". */
  division: string;
  region: number;
  games: TeamGame[];
};

/** Cell contents by class, with the tags and the whitespace taken out. */
const cell = (row: string, className: string): string => {
  const m = row.match(new RegExp(`<td[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`));
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
};

export function parseTeamPage(html: string, year: number): TeamPage {
  const caption = html.match(/<caption>\s*<strong>\s*\d{4}\s+([\s\S]+?)\s+Football\s+\((\d+-\d+)\)/);
  const filed = html.match(/Division\s+([IVXL]+),\s*Region\s+(\d+)/);

  const games: TeamGame[] = [];
  for (const [, row] of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const date = cell(row, 'gameDate');
    if (!/^\d{1,2}\/\d{1,2}$/.test(date)) continue; // header and footnote rows

    const link = row.match(/<a class="teamLink" href="teams\.jsp\?teamID=(\d+)/);
    if (!link) continue;

    const [month, day] = date.split('/');
    // A playoff row marks the opponent with a '#' in its own span, still inside
    // the opponent cell, so it comes out glued to the front of the name once
    // tags are stripped and must be peeled off separately from the record.
    const opponentCell = cell(row, 'opponent');
    const opponent = opponentCell.replace(/^#\s*/, '').replace(/\s*\(\d+-\d+\)\s*$/, '').trim();
    const score = cell(row, 'score').match(/^(\d+)-(\d+)$/);

    games.push({
      date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      home: cell(row, 'homeAway').toUpperCase().startsWith('H'),
      opponent,
      opponentId: Number(link[1]),
      opponentRecord: (opponentCell.match(/\((\d+-\d+)\)/) ?? [, ''])[1],
      ...(score ? { result: { us: Number(score[1]), them: Number(score[2]) } } : {}),
    });
  }

  return {
    name: caption?.[1].trim() ?? '',
    record: caption?.[2] ?? '',
    division: filed?.[1] ?? '',
    region: Number(filed?.[2] ?? 0),
    games,
  };
}
