/*
 * Reads a team's roster off its MaxPreps roster page.
 *
 * The page ships its data as JSON in a `__NEXT_DATA__` script, and each athlete
 * in it is an array rather than an object — thirty-seven unnamed slots. The
 * slots this reads were worked out against the page as it renders (fixtures/
 * holds the capture), and that is the weak point: a slot added upstream moves
 * every one after it and nothing in the data says so. So the parse checks
 * itself against the one number the page states separately, how many athletes
 * the team has, and reports a problem instead of a roster when they disagree.
 *
 * The array also carries the athletes a coach has removed — an old jersey
 * number, a player who left — flagged rather than deleted. Those are dropped;
 * the page itself does not print them.
 */

import type { Player } from '../types';

const AT = {
  firstName: 5,
  lastName: 6,
  jersey: 8,
  heightInches: 9,
  heightFeet: 10,
  weight: 11,
  positions: [12, 13, 14],
  removed: 17,
  grade: 36,
} as const;

export type MaxPrepsRoster = {
  players: Array<Omit<Player, 'id'>>;
  /** Why this roster should not be used; empty when it may. */
  problems: string[];
};

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

/** "07" is 7 and "" goes last, the order a programme prints. */
const byNumber = (a: { number: string }, b: { number: string }): number =>
  (a.number === '' ? 999 : Number(a.number)) - (b.number === '' ? 999 : Number(b.number));

export function parseMaxPrepsRoster(html: string): MaxPrepsRoster {
  const fail = (problem: string): MaxPrepsRoster => ({ players: [], problems: [problem] });

  const raw = html.match(NEXT_DATA)?.[1];
  if (!raw) return fail('The page has no data block on it.');

  let props: { athleteData?: unknown; countData?: { athleteCount?: unknown } };
  try {
    props = JSON.parse(raw).props.pageProps;
  } catch {
    return fail('The page’s data block could not be read.');
  }
  if (!Array.isArray(props?.athleteData)) return fail('The page lists no athletes.');

  const players: Array<Omit<Player, 'id'>> = [];
  for (const a of props.athleteData) {
    if (!Array.isArray(a) || a[AT.removed] === true) continue;
    const firstName = text(a[AT.firstName]);
    const lastName = text(a[AT.lastName]);
    if (!firstName && !lastName) continue;

    const feet = count(a[AT.heightFeet]);
    const inches = typeof a[AT.heightInches] === 'number' ? a[AT.heightInches] : 0;
    const grade = text(a[AT.grade]).replace(/\.$/, '');

    players.push({
      number: text(a[AT.jersey]),
      firstName,
      lastName,
      position: AT.positions.map((i) => text(a[i])).filter(Boolean).join('/'),
      // Left for the positions to say: most of a small school's roster plays
      // both ways, and a side typed here would hide a WR/DB from one of them.
      side: '',
      ...(feet ? { heightIn: feet * 12 + inches } : {}),
      ...(count(a[AT.weight]) ? { weightLb: count(a[AT.weight]) } : {}),
      ...(grade ? { grade } : {}),
    });
  }
  players.sort(byNumber);

  const problems: string[] = [];
  const stated = props.countData?.athleteCount;
  // The count is the only thing on the page that can contradict the slots, so
  // a page without one is not a page this can vouch for.
  if (typeof stated !== 'number') {
    problems.push('The page no longer says how many athletes it has, so the read cannot be checked.');
  } else if (stated !== players.length) {
    problems.push(`The page says ${stated} athletes and ${players.length} were read.`);
  }
  if (players.length === 0) problems.push('Nobody was read off the page.');
  if (players.some((p) => !/^\d{0,2}$/.test(p.number))) {
    problems.push('A jersey number is not a number, so the layout has probably moved.');
  }
  if (players.some((p) => p.heightIn !== undefined && (p.heightIn < 48 || p.heightIn > 90))) {
    problems.push('A height is not a person’s height, so the layout has probably moved.');
  }

  return problems.length ? { players: [], problems } : { players, problems };
}

/**
 * The roster as a file the panel's "Or a CSV file" takes — the route a real
 * activation goes by. Heights are written "5-7": a foot mark and an inch mark
 * would each need quoting, and the panel's parser reads the dash as readily.
 */
export const rosterCsv = (players: Array<Omit<Player, 'id'>>): string => {
  const cell = (v: string | number | undefined): string => {
    const s = v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = players.map((p) =>
    [
      p.number,
      p.firstName,
      p.lastName,
      p.position,
      p.heightIn ? `${Math.floor(p.heightIn / 12)}-${p.heightIn % 12}` : '',
      p.weightLb,
      p.grade,
    ]
      .map(cell)
      .join(','),
  );
  return ['Number,First,Last,Position,Height,Weight,Grade', ...lines].join('\n') + '\n';
};
