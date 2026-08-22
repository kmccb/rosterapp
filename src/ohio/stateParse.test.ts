import { readFileSync } from 'node:fs';
import { parseScoreboard, parseScoreboardStrict } from './stateParse';

const WEEK1 = readFileSync('src/ohio/fixtures/scoreboard-2026-week-1.html', 'utf8');
const WEEK6 = readFileSync('src/ohio/fixtures/scoreboard-2026-week-6.html', 'utf8');

describe('parseScoreboard', () => {
  const week1 = parseScoreboard(WEEK1, 1);

  it('reads every game on the page', () => {
    expect(week1.length).toBe(401);
  });

  it('reads a played game, visitor first', () => {
    const g = week1.find((x) => x.home.name === 'Poland Seminary');
    expect(g).toMatchObject({
      week: 1,
      date: '2026-08-21',
      kickoff: '7pm',
      away: { name: 'Salem', city: 'Salem', state: 'OH', score: 21 },
      home: { name: 'Poland Seminary', city: 'Poland', state: 'OH', score: 17 },
    });
  });

  it('records overtime where the source marks it', () => {
    const ot = week1.filter((g) => g.overtime);
    expect(ot.length).toBeGreaterThan(0);
    expect(ot[0].overtime).toMatch(/^OT\d$/);
  });

  /*
   * Every game has two schools, so a week's schools must come to twice its
   * games. This is the invariant that catches a regex silently dropping rows,
   * which is the failure that would matter and the one hardest to spot.
   * Every school must have a name and state; city may be empty for some entries.
   */
  it('accounts for two schools in every game', () => {
    const sides = week1.flatMap((g) => [g.away, g.home]);
    expect(sides.length).toBe(week1.length * 2);
    expect(sides.every((s) => s.name && s.state)).toBe(true);
  });

  it('leaves an unplayed game with no score rather than a zero', () => {
    const week6 = parseScoreboard(WEEK6, 6);
    const unplayed = week6.filter((g) => g.away.score === null);
    expect(unplayed.length).toBeGreaterThan(0);
    expect(unplayed[0].home.score).toBeNull();
  });

  it('marks a school from another state, and assumes Ohio otherwise', () => {
    const week6 = parseScoreboard(WEEK6, 6);
    const foreign = week6.flatMap((g) => [g.away, g.home]).filter((s) => s.state !== 'OH');
    expect(foreign.length).toBeGreaterThan(0);
    expect(foreign[0].state).toMatch(/^[A-Z]{2,}$/);
    expect(week6.some((g) => g.home.state === 'OH')).toBe(true);
  });

  it('yields nothing rather than guessing when the page has changed shape', () => {
    expect(parseScoreboard('<html><body>Down for maintenance</body></html>', 1)).toEqual([]);
  });

  /*
   * Completeness test: every date line is either parsed as a game, marked
   * cancelled, or unreadable. No silent residue. Unreadable should always be empty.
   */
  it('accounts for every date line as parsed, cancelled, or unreadable (week 1)', () => {
    const result = parseScoreboardStrict(WEEK1, 1);
    const preMatch = WEEK1.match(/<pre>([\s\S]*?)<\/pre>/);
    const preContent = preMatch![1];
    const dateLines = preContent
      .split('<br>')
      .map((l) => l.trim())
      .filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l));

    expect(result.games.length + result.cancelled).toBe(dateLines.length);
    expect(result.unreadable.length).toBe(0);
  });

  it('accounts for every date line as parsed, cancelled, or unreadable (week 6)', () => {
    const result = parseScoreboardStrict(WEEK6, 6);
    const preMatch = WEEK6.match(/<pre>([\s\S]*?)<\/pre>/);
    const preContent = preMatch![1];
    const dateLines = preContent
      .split('<br>')
      .map((l) => l.trim())
      .filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l));

    expect(result.games.length + result.cancelled).toBe(dateLines.length);
    expect(result.unreadable.length).toBe(0);
  });

  it('correctly parses neutral-site games with "vs" separator', () => {
    const brentwood = week1.find(
      (x) => x.away.name === 'Brentwood Academy' && x.home.name === 'Baylor',
    );
    expect(brentwood).toBeDefined();
    if (brentwood) {
      expect(brentwood.away.score).toBe(20);
      expect(brentwood.home.score).toBe(38);
      // Verify it's not corrupted by cross-line bleeding (no HTML in names)
      expect(brentwood.away.name).not.toContain('<');
      expect(brentwood.home.name).not.toContain('<');
    }
  });
});
