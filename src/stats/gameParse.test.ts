import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseGameStats } from './gameParse';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

const HOME = fixture('hudl-game-home.txt');
const AWAY = fixture('hudl-game-away.txt');

const find = (rows: ReturnType<typeof parseGameStats>['rows'], category: string, name: string) =>
  rows.find((r) => r.category === category && r.name === name);

describe('parseGameStats', () => {
  it('keeps Poland’s tables and drops the opponent’s, which Hudl prints second', () => {
    const { rows } = parseGameStats(HOME);
    expect(rows.map((r) => r.name)).not.toContain('B. Bezon');
    expect(rows.map((r) => r.name)).not.toContain('B. Kana');
    expect(rows.map((r) => r.name)).not.toContain('L. Mayhew');
    expect(rows.filter((r) => r.category === 'passing')).toHaveLength(1);
  });

  it('reads every category on the home page', () => {
    const { rows, categories } = parseGameStats(HOME);
    expect(categories.sort()).toEqual(
      ['defense', 'kickReturn', 'kicking', 'passing', 'punting', 'receiving', 'rushing'].sort(),
    );
    // 1 passing + 5 rushing + 5 receiving + 14 defense + 1 kicking + 1 punting + 3 kick returns.
    expect(rows).toHaveLength(30);
  });

  it('splits Comp/Att into two fields and maps the rest by name', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'passing', 'D. Xipolitas')?.values).toEqual({
      cmp: 6, att: 11, yds: 83, td: 1, int: 1, lng: 30,
    });
    expect(find(rows, 'passing', 'D. Xipolitas')?.number).toBe('1');
  });

  it('reads rushing and receiving with the season parser’s names', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'rushing', 'C. Jones')?.values).toEqual({ carries: 13, yds: 23, td: 1, lng: 12 });
    expect(find(rows, 'receiving', 'G. Seifert')?.values).toEqual({ rec: 1, yds: 13, td: 1, lng: 13 });
  });

  it('reads the defense table, whose header has no category cell, from the section heading', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'defense', 'P. Zoumis')?.values).toEqual({ tackles: 12, assist: 2, int: 1 });
    expect(find(rows, 'defense', 'D. Delluomo')?.values).toEqual({ tackles: 4, assist: 1, sacks: 1 });
    expect(find(rows, 'defense', 'N. Minehart')?.values).toEqual({ assist: 1 });
    expect(rows.filter((r) => r.category === 'defense')).toHaveLength(14);
  });

  it('turns an average into yards so totals can add up', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'punting', 'D. Xipolitas')?.values).toEqual({
      punts: 4, ydsPerPunt: 34, yds: 136, lng: 40,
    });
    expect(find(rows, 'kickReturn', 'C. Scott')?.values).toEqual({
      returns: 2, ydsPerReturn: 60, yds: 120, lng: 60,
    });
  });

  it('reads kicking as made counts and points, since attempts are not printed per game', () => {
    const { rows } = parseGameStats(HOME);
    expect(find(rows, 'kicking', 'S. (Salvi) Carramusa')?.values).toEqual({ fgMade: 1, xpMade: 2, pts: 5 });
  });

  it('drops a row with no numbers at all, and the Kickoff table, which is not a category', () => {
    const { rows, categories } = parseGameStats(HOME);
    // A. Sattarelle's punt return row is all dashes.
    expect(rows.filter((r) => r.category === 'puntReturn')).toHaveLength(0);
    expect(categories).not.toContain('puntReturn');
    expect(rows.every((r) => Object.keys(r.values).length > 0)).toBe(true);
    // The Kickoff table (4 kickoffs) follows Kicking; its row must not become kicking numbers.
    expect(rows.filter((r) => r.category === 'kicking')).toHaveLength(1);
    expect(find(rows, 'kicking', 'S. (Salvi) Carramusa')?.values.fgMade).toBe(1);
  });

  it('drops opponent rows that are only a number, and Rest of team', () => {
    const { rows } = parseGameStats(AWAY);
    expect(rows.map((r) => r.name)).not.toContain('');
    expect(rows.map((r) => r.name)).not.toContain('Rest of team');
    expect(rows.map((r) => r.name)).not.toContain('J. Pannunzio');
  });

  it('reads the away page, where Poland’s tables still come first', () => {
    const { rows } = parseGameStats(AWAY);
    expect(find(rows, 'passing', 'A. Sattarelle')?.values).toEqual({ cmp: 0, att: 1 });
    expect(find(rows, 'rushing', 'C. Jones')?.values).toEqual({ carries: 26, yds: 163, td: 1, lng: 51 });
    expect(find(rows, 'defense', 'M. Purins')?.values).toEqual({ tackles: 2, sacks: 2 });
    expect(find(rows, 'defense', 'A. Sattarelle')?.values).toEqual({ tackles: 1, assist: 2, int: 1 });
    expect(find(rows, 'defense', 'N. Nittoli')?.values).toEqual({ tackles: 1, fum: 1 });
    expect(find(rows, 'puntReturn', 'N. Nittoli')?.values).toEqual({ returns: 1, ydsPerReturn: 3, yds: 3, lng: 3 });
    expect(find(rows, 'punting', 'D. Xipolitas')?.values).toEqual({ punts: 1, ydsPerPunt: 25, in20: 1, yds: 25, lng: 25 });
    expect(find(rows, 'kicking', 'S. (Salvi) Carramusa')?.values).toEqual({ fgMade: 1, xpMade: 3, pts: 6 });
    expect(rows.map((r) => r.name)).not.toContain('L. Goodrich');
  });

  it('still reads Defense when the paste lost the leading tab on its header row', () => {
    const spaced = HOME.replace(/^\tTk/gm, 'Tk');
    const { rows } = parseGameStats(spaced);
    expect(find(rows, 'defense', 'P. Zoumis')?.values).toEqual({ tackles: 12, assist: 2, int: 1 });
    expect(rows.filter((r) => r.category === 'defense')).toHaveLength(14);
  });

  it('copes with a paste that lost its tabs to plain text', () => {
    const spaced = HOME.split('\n').map((l) => l.split('\t').join('   ')).join('\n');
    const { rows } = parseGameStats(spaced);
    expect(find(rows, 'rushing', 'C. Jones')?.values.yds).toBe(23);
  });

  it('returns nothing for text that isn’t a game page', () => {
    expect(parseGameStats('Passing Stats\n#\tNAME\tGAMES\tCMP\n1\tD. Xipolitas\t5\t27')).toEqual({
      rows: [],
      categories: [],
    });
    expect(parseGameStats('')).toEqual({ rows: [], categories: [] });
  });
});
