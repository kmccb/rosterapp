import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { weeksFrom } from '../maxpreps/weeks';
import { leaders } from '../stats/leaders';
import { playerKey } from '../stats/statsMatch';
import type { Player } from '../types';
import { asTeamStats, matchTeamStats } from './teamStats';

/*
 * The demo's sample stats, pinned.
 *
 * scripts/build-demo.mjs writes them beside public/oh/demo.json, and the page
 * reads them through the same doors a paid school's MaxPreps file goes
 * through. So the useful questions are the page's own: does the validator take
 * the whole file, does every row land on a player through the real matcher —
 * a row that matches nobody is silently not shown — and can the player card
 * work weeks out of the copies. Read against the committed demo, never against
 * the directory's files.
 */

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const demo = read('public/oh/demo.json') as {
  slug: string;
  sports: { football: { players: Player[] } };
  seasons: Record<string, { games: Array<{ date: string; opponent: string; result?: unknown }> }>;
};
const STATS = `public/oh/stats/${demo.slug}-football.json`;
const hasFile = existsSync(new URL(`../../${STATS}`, import.meta.url));
const players = demo.sports.football.players;
const played = demo.seasons[demo.slug].games
  .filter((g) => g.result)
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((g) => ({ date: g.date, opponent: g.opponent }));

type Row = { name: string; number: string; category: string; values: Record<string, number> };
type File = { slug: string; sport: string; source: string; games: number; rows: Row[]; snapshots: Array<{ games: number; rows: Row[] }> };
const file = (): File => read(STATS) as File;

/** Worked out from other numbers, so free to fall: a bad night lowers an average. */
const AVERAGES = new Set(['cmpPct', 'ydsPerGame', 'rating', 'ydsPerCarry', 'ydsPerRec', 'ydsPerPunt', 'ydsPerReturn']);

describe('the demo’s sample stats', () => {
  // Out of season the generator writes none, and a missing file is how the
  // page already reads a school with no stats yet.
  it('exist exactly when the committed season has games played', () => {
    expect(hasFile).toBe(played.length > 0);
  });

  it.runIf(hasFile)('are taken whole by the page’s validator, and say they are a sample', () => {
    const raw = file();
    const stats = asTeamStats(raw);
    expect(stats).not.toBeNull();
    expect(stats!.rows).toHaveLength(raw.rows.length);
    expect(stats!.snapshots).toHaveLength(raw.snapshots.length);
    expect(raw.slug).toBe(demo.slug);
    expect(raw.sport).toBe('football');
    expect(stats!.source).toBe('Sample');
  });

  it.runIf(hasFile)('cover the games the demo has played, no more', () => {
    const raw = file();
    expect(raw.games).toBe(played.length);
    for (const r of raw.rows) expect(r.values.games, r.name).toBeLessThanOrEqual(raw.games);
    expect(Math.max(...raw.snapshots.map((s) => s.games))).toBe(raw.games);
  });

  it.runIf(hasFile)('land every row on its own player through the real matcher', () => {
    const raw = file();
    for (const row of [...raw.rows, ...raw.snapshots.flatMap((s) => s.rows)]) {
      const matched = matchTeamStats([row as never], players);
      const owner = players.find((p) => p.number === row.number)!;
      expect(owner, `#${row.number}`).toBeDefined();
      expect(Object.keys(matched), `${row.name} ${row.category}`).toEqual([playerKey(owner)]);
    }
  });

  it.runIf(hasFile)('only ever grow from one copy of the totals to the next', () => {
    const { snapshots } = file();
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].games).toBeGreaterThan(snapshots[i - 1].games);
      for (const before of snapshots[i - 1].rows) {
        const after = snapshots[i].rows.find((r) => r.name === before.name && r.category === before.category);
        expect(after, `${before.name} ${before.category} after game ${snapshots[i].games}`).toBeDefined();
        for (const [field, n] of Object.entries(before.values)) {
          if (AVERAGES.has(field)) continue;
          expect(after!.values[field] ?? 0, `${before.name} ${before.category} ${field}`).toBeGreaterThanOrEqual(n);
        }
      }
    }
  });

  it.runIf(hasFile)('give a starter a week on the card for every game, each named for its opponent', () => {
    const stats = asTeamStats(file())!;
    const weeks = weeksFrom(stats.snapshots, played);
    expect(weeks).toHaveLength(played.length);
    weeks.forEach((w, i) => {
      expect(w.from).toBe(i + 1);
      expect(w.to).toBe(i + 1);
      expect(w.beforeTracking).toBe(false);
      expect(w.game).toEqual(played[i]);
    });
    // #24, the player the marketing site's Lookup picture shows.
    const cole = players.find((p) => p.number === '24')!;
    const his = weeks.filter((w) => matchTeamStats(w.rows, players)[playerKey(cole)]?.rushing);
    expect(his.length).toBe(played.length);
  });

  it.runIf(hasFile)('fill the Stats tab’s leader boards, kicking included', () => {
    const stats = asTeamStats(file())!;
    const blocks = leaders(matchTeamStats(stats.rows, players), players);
    expect(blocks.map((b) => b.category)).toEqual(
      expect.arrayContaining(['passing', 'rushing', 'receiving', 'defense', 'kicking']),
    );
    for (const b of blocks) expect(b.rows.length, b.category).toBeGreaterThan(0);
  });
});

/*
 * The demo page fetches the file the way any paid page does, and keeps none
 * of it: a prospect's visit is not a school followed.
 */
describe('the stats, on the demo page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.runIf(hasFile)('are fetched from this origin and never kept in the phone', async () => {
    vi.resetModules();
    vi.stubGlobal('location', { pathname: '/oh/demo/', search: '' });
    const jar: Record<string, string> = { 'oh.school': demo.slug };
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => jar[k] ?? null,
      setItem: (k: string, v: string) => {
        jar[k] = v;
      },
      removeItem: (k: string) => {
        delete jar[k];
      },
    });
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(String(url).split('?')[0]);
        return { ok: true, status: 200, json: async () => file() };
      }),
    );
    const { loadTeamStats } = await import('./teamStats');

    const stats = await loadTeamStats(demo.slug, 'football');
    expect(stats).not.toBeNull();
    expect(asked).toEqual([`/oh/stats/${demo.slug}-football.json`]);
    expect(Object.keys(jar)).toEqual(['oh.school']);
  });
});
