import { readFileSync } from 'node:fs';
import { modernScoreboard } from './legacyScoreboard';
import { parseScoreboardStrict } from './stateParse';

const page = (name: string) => readFileSync(`src/ohio/fixtures/${name}.html`, 'utf8');

// Trimmed copies of real pages: a few lines each, markup kept byte for byte.
const Y2011 = page('scoreboard-2011-week-5');
const Y2018 = page('scoreboard-2018-week-5');
const Y2025 = page('scoreboard-2025-week-5');

const dateLines = (html: string) =>
  (html.match(/<br\s*\/?>\s*\d{4}-\d{2}-\d{2}/gi) ?? []).length;

describe('modernScoreboard', () => {
  it('is why it exists: old pages read as nothing, silently', () => {
    for (const html of [Y2011, Y2018]) {
      const r = parseScoreboardStrict(html, 5);
      expect(r.games).toEqual([]);
      expect(r.unreadable).toEqual([]);
    }
  });

  it('reads every line of the 2011 page (capitals, <BR/>, blue and red <FONT>)', () => {
    const r = parseScoreboardStrict(modernScoreboard(Y2011), 5);
    expect(r.unreadable).toEqual([]);
    expect(r.games.length + r.cancelled).toBe(dateLines(Y2011));

    const poland = r.games.find((g) => g.away.name === 'Poland Seminary')!;
    expect(poland).toMatchObject({
      date: '2011-09-23',
      kickoff: '',
      away: { name: 'Poland Seminary', city: 'Poland', state: 'OH', score: 10 },
      home: { name: 'Niles McKinley', city: 'Niles', state: 'OH', score: 7 },
    });

    expect(r.games.find((g) => g.home.name === 'River')!.overtime).toBe('OT1');
    const unplayed = r.games.find((g) => g.away.name === 'United Military Academy')!;
    expect(unplayed.away.score).toBeNull();
    expect(unplayed.home.score).toBeNull();
  });

  it('reads every line of the 2018 page, with "cancelled" counted as a called-off game', () => {
    const r = parseScoreboardStrict(modernScoreboard(Y2018), 5);
    expect(r.unreadable).toEqual([]);
    expect(r.cancelled).toBe(1);
    expect(r.games.length + r.cancelled).toBe(dateLines(Y2018));

    const poland = r.games.find((g) => g.home.name === 'Poland Seminary')!;
    expect(poland).toMatchObject({
      date: '2018-09-21',
      kickoff: '7pm',
      away: { name: 'Alliance', score: 0 },
      home: { name: 'Poland Seminary', score: 19 },
    });
    expect(r.games.find((g) => g.home.name === 'Roger Bacon')!.overtime).toBe('OT1');
  });

  it('leaves a page already in today’s shape exactly as it was', () => {
    for (const html of [Y2025, page('scoreboard-2026-week-1'), page('scoreboard-2026-week-6')]) {
      expect(modernScoreboard(html)).toBe(html);
      expect(parseScoreboardStrict(modernScoreboard(html), 5)).toEqual(parseScoreboardStrict(html, 5));
    }
  });

  it('still finds games on the 2025 page', () => {
    expect(parseScoreboardStrict(Y2025, 5).games.length).toBeGreaterThan(5);
  });
});
