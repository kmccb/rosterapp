// scripts/lib/ohio-state.mjs

/**
 * Sixteen pages, and the whole state is on them.
 *
 * Deliberately separate from ohio.mjs, which serves the League tab for one
 * team and must keep working exactly as it does. Nothing here is imported by
 * that path.
 *
 * A week is fetched, parsed, and either yields games or is reported as failed.
 * It is never half-trusted: the caller keeps whatever was committed for a week
 * that came back wrong, because a week that has quietly lost half its games is
 * worse than last night's copy of it.
 */
import { parseScoreboard } from '../../src/ohio/stateParse.ts';

const WEEK = (year, n) => `https://joeeitel.com/hsfoot/scoreboard/${year}/week-${n}`;

/** Ohio plays ten regular-season weeks and up to six of playoffs. */
export const WEEKS = 16;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchSeason(year, { pause = 400 } = {}) {
  const games = [];
  const weeks = [];
  const failed = [];

  for (let n = 1; n <= WEEKS; n++) {
    try {
      const res = await fetch(WEEK(year, n), {
        headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const week = parseScoreboard(await res.text(), n);
      /*
       * Late playoff weeks are legitimately empty before the brackets are
       * drawn, so an empty week is not a failure on its own. The caller
       * decides, by comparing against what is already committed.
       */
      weeks.push(n);
      games.push(...week);
    } catch (err) {
      console.warn(`  ! week ${n}: ${err.message}`);
      failed.push(n);
    }

    // One page at a time, with a pause. This is somebody's hobby site.
    if (n < WEEKS) await sleep(pause);
  }

  return { games, weeks, failed };
}
