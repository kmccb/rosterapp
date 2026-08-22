import { readFileSync } from 'node:fs';
import { parseScoreboard, type StateGame } from './stateParse';
import { directory, seasonsBySchool, slugFor } from './stateModel';

const week1 = parseScoreboard(
  readFileSync('src/ohio/fixtures/scoreboard-2026-week-1.html', 'utf8'),
  1,
);

const game = (over: Partial<StateGame> = {}): StateGame => ({
  week: 1,
  date: '2026-08-21',
  kickoff: '7pm',
  away: { name: 'Salem', city: 'Salem', state: 'OH', score: 21 },
  home: { name: 'Poland Seminary', city: 'Poland', state: 'OH', score: 17 },
  ...over,
});

describe('slugFor', () => {
  it('makes an address out of a school and its town', () => {
    expect(slugFor('Poland Seminary', 'Poland')).toBe('poland-seminary-poland');
  });

  /*
   * Forty-five school names in Ohio are shared. The town is what tells them
   * apart, and a search box that offers three schools called Jackson with no
   * way to choose between them is unusable.
   */
  it('tells two schools with the same name apart', () => {
    expect(slugFor('Jackson', 'Jackson')).not.toBe(slugFor('Jackson', 'Massillon'));
  });

  it('survives punctuation in a school name', () => {
    expect(slugFor('Notre Dame-Cathedral Latin', 'Chardon')).toBe(
      'notre-dame-cathedral-latin-chardon',
    );
    expect(slugFor('St Edward', 'Lakewood')).toBe('st-edward-lakewood');
  });
});

describe('directory', () => {
  it('lists a school once however many games it plays', () => {
    const d = directory([game(), game({ week: 2, away: { name: 'Kirtland', city: 'Kirtland', state: 'OH', score: null } })]);
    expect(d.filter((s) => s.name === 'Poland Seminary')).toHaveLength(1);
  });

  it('leaves out a school from another state, which has no page to open', () => {
    const d = directory([
      game({ away: { name: 'Everett', city: 'Everett', state: 'PA', score: 7 } }),
    ]);
    expect(d.map((s) => s.name)).toEqual(['Poland Seminary']);
  });

  /*
   * "Non-varsity opponent" ships with no city, standing in for a scrimmage
   * side the source never gave a town. It is not a school with a page of its
   * own, and it must not take up a slot in the 718 schools this once claimed.
   */
  it('leaves out a side with no city, which is a scrimmage stand-in and not a school', () => {
    const d = directory([
      game({ away: { name: 'Non-varsity opponent', city: '', state: 'OH', score: null } }),
    ]);
    expect(d.map((s) => s.name)).toEqual(['Poland Seminary']);
  });

  it('is sorted by name so the file diffs cleanly week to week', () => {
    const names = directory(week1).map((s) => s.name);
    expect(names).toEqual([...names].sort());
  });

  it('finds every Ohio school on a real week', () => {
    expect(directory(week1).length).toBeGreaterThan(600);
  });
});

describe('seasonsBySchool', () => {
  const seasons = seasonsBySchool([
    game(),
    game({
      week: 2,
      date: '2026-08-28',
      away: { name: 'Kirtland', city: 'Kirtland', state: 'OH', score: null },
      home: { name: 'Poland Seminary', city: 'Poland', state: 'OH', score: null },
    }),
  ]);
  const poland = seasons.get('poland-seminary-poland')!;

  it('puts a game on both schools', () => {
    expect(seasons.has('poland-seminary-poland')).toBe(true);
    expect(seasons.has('salem-salem')).toBe(true);
  });

  it('says which side of the fixture the school was on', () => {
    expect(poland.games[0]).toMatchObject({ home: true, opponent: 'Salem' });
    expect(seasons.get('salem-salem')!.games[0]).toMatchObject({ home: false, opponent: 'Poland Seminary' });
  });

  it('scores the game from the school\'s own side', () => {
    expect(poland.games[0].result).toEqual({ us: 17, them: 21, won: false });
    expect(seasons.get('salem-salem')!.games[0].result).toEqual({ us: 21, them: 17, won: true });
  });

  it('leaves an unplayed fixture without a result', () => {
    expect(poland.games[1].result).toBeUndefined();
  });

  it('counts the record off played games only', () => {
    expect(poland.record).toEqual({ won: 0, lost: 1, played: 1 });
  });

  it('orders a season by date', () => {
    expect(poland.games.map((g) => g.date)).toEqual(['2026-08-21', '2026-08-28']);
  });

  it('links an Ohio opponent and does not link one from out of state', () => {
    const s = seasonsBySchool([
      game({ away: { name: 'Everett', city: 'Everett', state: 'PA', score: 7 } }),
    ]);
    expect(s.get('poland-seminary-poland')!.games[0].opponentSlug).toBeNull();
    expect(seasonsBySchool([game()]).get('poland-seminary-poland')!.games[0].opponentSlug).toBe('salem-salem');
  });

  it('keeps a cityless side as an opponent name, with no season file and no link', () => {
    const s = seasonsBySchool([
      game({ away: { name: 'Non-varsity opponent', city: '', state: 'OH', score: null } }),
    ]);
    expect(s.has('non-varsity-opponent')).toBe(false);
    const poland = s.get('poland-seminary-poland')!;
    expect(poland.games[0].opponent).toBe('Non-varsity opponent');
    expect(poland.games[0].opponentSlug).toBeNull();
  });
});
