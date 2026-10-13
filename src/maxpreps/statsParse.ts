/*
 * Reads a team's season stats off MaxPreps' printable stats page.
 *
 * The page is sixteen tables under four headings. Every cell carries a class
 * naming the stat it holds — `rushingyards`, `totaltackles` — so nothing here
 * depends on a column's position or on what its heading is abbreviated to this
 * year. What the classes do not say is which table a cell is in: `rushingyards`
 * is a column of Rushing, of All Purpose Yards and of Total Yards alike. So a
 * table is recognised by the id on the heading above it, and only the tables
 * named below are read.
 *
 * The output is the same shape the Hudl paste produces — one row per player per
 * category, in the field names src/stats already formats and ranks — because
 * the Stats tab should not care which company a coach types his numbers into.
 * MaxPreps splits defense over three tables and prints both kinds of return in
 * one; rows that share a category are merged by whoever matches them to a
 * roster, exactly as a paste covering several tables is.
 *
 * Pure, and pinned to a saved page in fixtures/, so a change of shape at their
 * end fails a test here rather than a Stats tab on a Friday night.
 */

import type { ParsedStatRow, StatCategory, StatValues } from '../stats/statsParse';

type TableSpec = {
  category: StatCategory;
  /** Cell class -> field name. */
  fields: Record<string, string>;
  /** The numbers that say a player did this at all. A row where they are all
   * zero is the page listing everybody who dressed, not somebody's stats. */
  counts: string[];
  /** Defense is three tables of mostly zeros; a linebacker's line should not
   * read "0 INT" because he appears in the table that has an Int column. */
  dropZeros?: boolean;
};

/** Heading id -> what to take from the table under it. A table can feed two
 * categories: returns are one table on the page and two on the card. */
const TABLES: Record<string, TableSpec[]> = {
  offense_passing: [
    {
      category: 'passing',
      fields: {
        gamesplayed: 'games', passingcomp: 'cmp', passingatt: 'att', passingyards: 'yds',
        completionpercentage: 'cmpPct', passingyardspergame: 'ydsPerGame', passingtd: 'td',
        passingint: 'int', passinglong: 'lng', qbrating: 'rating',
      },
      counts: ['att'],
    },
  ],
  offense_rushing: [
    {
      category: 'rushing',
      fields: {
        gamesplayed: 'games', rushingnum: 'carries', rushingyards: 'yds',
        yardspercarry: 'ydsPerCarry', rushingyardspergame: 'ydsPerGame', rushinglong: 'lng',
        rushingtdnum: 'td',
      },
      counts: ['carries'],
    },
  ],
  offense_receiving: [
    {
      category: 'receiving',
      fields: {
        gamesplayed: 'games', receivingnum: 'rec', receivingyards: 'yds',
        yardspercatch: 'ydsPerRec', receivingyardspergame: 'ydsPerGame', receivinglong: 'lng',
        receivingtdnum: 'td',
      },
      counts: ['rec'],
    },
  ],
  defense_tackles: [
    {
      category: 'defense',
      fields: {
        gamesplayed: 'games', tackles: 'solo', assists: 'assist', totaltackles: 'tackles',
        tacklesforloss: 'tfl',
      },
      counts: ['tackles', 'tfl'],
      dropZeros: true,
    },
  ],
  defense_sacks: [
    { category: 'defense', fields: { sacks: 'sacks' }, counts: ['sacks'], dropZeros: true },
  ],
  defense_defensive_statistics: [
    {
      category: 'defense',
      fields: {
        ints: 'int', intyards: 'intRetYds', fumblerecoveries: 'fumRec',
        fumblerecoveryyards: 'fumRetYds', causedfumbles: 'ff',
      },
      counts: ['int', 'fumRec', 'ff'],
      dropZeros: true,
    },
  ],
  special_teams_punts: [
    {
      category: 'punting',
      fields: {
        gamesplayed: 'games', puntnum: 'punts', puntyards: 'yds', puntaverage: 'ydsPerPunt',
        puntlong: 'lng', puntinside20: 'in20',
      },
      counts: ['punts'],
    },
  ],
  special_teams_kickoff_and_punt_returns: [
    {
      category: 'kickReturn',
      fields: {
        gamesplayed: 'games', kickoffreturnnum: 'returns', kickoffreturnyards: 'yds',
        kickoffreturnyardsavg: 'ydsPerReturn', kickoffreturnlong: 'lng',
      },
      counts: ['returns'],
    },
    {
      category: 'puntReturn',
      fields: {
        gamesplayed: 'games', puntreturnnum: 'returns', puntreturnyards: 'yds',
        puntreturnyardsavg: 'ydsPerReturn', puntreturnlong: 'lng',
      },
      counts: ['returns'],
    },
  ],
  scoring_pats_and_field_goals: [
    {
      category: 'kicking',
      fields: {
        gamesplayed: 'games', patkickingmade: 'xpMade', patkickingatt: 'xpAtt',
        fgmade: 'fgMade', fgattempted: 'fgAtt', fglong: 'lng', totalkickingpoints: 'pts',
      },
      counts: ['xpAtt', 'fgAtt'],
    },
  ],
  // Return touchdowns are printed with the scoring, not with the returns. Only
  // a real one is taken: a zero here would invent a returns line for every
  // player who has ever scored any other way.
  scoring_touchdowns: [
    { category: 'kickReturn', fields: { kickoffreturnedtdnum: 'td' }, counts: ['td'], dropZeros: true },
    { category: 'puntReturn', fields: { puntreturnedtdnum: 'td' }, counts: ['td'], dropZeros: true },
  ],
};

/** The tables a football team with any season at all will have rows in. Their
 * absence means the page changed or came back empty, not that nobody ran. */
const REQUIRED = ['offense_rushing', 'defense_tackles'];

export type MaxPrepsStats = {
  rows: ParsedStatRow[];
  /** Heading ids of the tables that were found and read. */
  tables: string[];
  /** Why this page should not replace what is already published; empty when it may. */
  problems: string[];
};

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '')
    .trim();

/** ".441" is forty-four percent; the card's field is the percentage. */
const toNumber = (raw: string): number | undefined => {
  const cleaned = decode(raw).replace(/,/g, '');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

const TABLE = /<h3 id="([a-z0-9_]+)"[^>]*>[^<]*<\/h3>\s*<table\b[\s\S]*?<\/table>/g;
const BODY = /<tbody>([\s\S]*?)<\/tbody>/;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
const CELL = /<td class="([a-z0-9]+)[^"]*"[^>]*>([\s\S]*?)<\/td>/g;
/* The link's title is the name in full; its text is "M. Tuscano", which cannot
   tell two brothers with one initial apart and the title can. */
const NAME = /<th class="name"[^>]*>\s*<a\b[^>]*\btitle="([^"]*)"/;

export function parseMaxPrepsStats(html: string): MaxPrepsStats {
  const rows: ParsedStatRow[] = [];
  const tables: string[] = [];

  for (const table of html.matchAll(TABLE)) {
    const specs = TABLES[table[1]];
    if (!specs) continue;
    // The season's totals sit in the foot; only the body is players.
    const body = table[0].match(BODY)?.[1];
    if (body === undefined) continue;
    tables.push(table[1]);

    for (const tr of body.matchAll(ROW)) {
      const name = decode(tr[1].match(NAME)?.[1] ?? '');
      if (!name) continue;

      const cells = new Map<string, string>();
      for (const td of tr[1].matchAll(CELL)) cells.set(td[1], td[2]);
      const number = decode(cells.get('jersey') ?? '');

      for (const spec of specs) {
        const values: StatValues = {};
        for (const [cls, field] of Object.entries(spec.fields)) {
          const n = toNumber(cells.get(cls) ?? '');
          if (n === undefined) continue;
          values[field] = field === 'cmpPct' ? Math.round(n * 1000) / 10 : n;
        }
        if (!spec.counts.some((f) => (values[f] ?? 0) !== 0)) continue;
        if (spec.dropZeros) {
          for (const [field, n] of Object.entries(values)) {
            if (n === 0) delete values[field];
          }
        }
        rows.push({ name, number, category: spec.category, values });
      }
    }
  }

  const problems: string[] = [];
  for (const id of REQUIRED) {
    if (!tables.includes(id)) problems.push(`The ${id} table is missing from the page.`);
    else if (!rows.some((r) => TABLES[id].some((s) => s.category === r.category))) {
      problems.push(`The ${id} table has nobody in it.`);
    }
  }

  return { rows, tables, problems };
}
