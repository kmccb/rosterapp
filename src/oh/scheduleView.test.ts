import { readFileSync } from 'node:fs';
import { daysToKickoff } from '../schedule/icalParse';
import type { SchoolGame } from '../ohio/stateModel';
import { loadHistory, parseHistory } from './history';
import {
  allTimeRecord,
  asFixtures,
  forecastFor,
  meetingsLine,
  meetingsWith,
  nextFixture,
  recordOf,
  recordText,
  scheduleSections,
  summaryLine,
} from './scheduleView';
import type { FixtureWeather } from './store';

// Invented scores in the committed file's shape.
const RAW = JSON.parse(readFileSync('src/oh/fixtures/history-springfield.json', 'utf8'));
const HISTORY = parseHistory(RAW)!;

const game = (g: Partial<SchoolGame> & Pick<SchoolGame, 'date' | 'opponent'>): SchoolGame => ({
  week: 1,
  kickoff: '7pm',
  home: true,
  opponentCity: g.opponent,
  opponentSlug: `${g.opponent.toLowerCase()}-${g.opponent.toLowerCase()}`,
  ...g,
});

// Listed out of order on purpose: the directory's order is not the page's.
const SEASON: SchoolGame[] = [
  game({ date: '2026-10-16', opponent: 'McDonald', opponentSlug: 'mcdonald-mcdonald', home: false }),
  game({ date: '2026-08-21', opponent: 'Lakeview', result: { us: 33, them: 10, won: true } }),
  game({ date: '2026-08-28', opponent: 'Brookfield', result: { us: 7, them: 21, won: false } }),
  game({ date: '2026-10-23', opponent: 'Farview', opponentSlug: null, kickoff: '7:30pm' }),
];

describe('asFixtures', () => {
  it('sorts by date and turns "7pm" into an Eastern instant', () => {
    const f = asFixtures(SEASON);
    expect(f.map((g) => g.date)).toEqual(['2026-08-21', '2026-08-28', '2026-10-16', '2026-10-23']);
    // 7pm EDT on 16 October is 23:00 UTC.
    expect(f[2].kickoff).toBe('2026-10-16T23:00:00.000Z');
    expect(f[3].kickoff).toBe('2026-10-23T23:30:00.000Z');
  });

  it('keys an opponent the way the history file does', () => {
    const f = asFixtures(SEASON);
    expect(f[2].opponentKey).toBe('mcdonald-mcdonald');
    expect(f[3].opponentKey).toBe('~farview');
  });
});

describe('which game is next', () => {
  const f = asFixtures(SEASON);

  it('is the first not yet over', () => {
    expect(nextFixture(f, new Date('2026-10-14T12:00:00Z'))?.opponent).toBe('McDonald');
  });

  it('stays on a game until three and a half hours after kickoff', () => {
    expect(nextFixture(f, new Date('2026-10-17T02:00:00Z'))?.opponent).toBe('McDonald');
    expect(nextFixture(f, new Date('2026-10-17T03:00:00Z'))?.opponent).toBe('Farview');
  });

  it('is nothing once the season is over', () => {
    expect(nextFixture(f, new Date('2026-12-01T12:00:00Z'))).toBeUndefined();
  });

  it('counts down in sleeps from the kickoff instant', () => {
    const next = nextFixture(f, new Date('2026-10-14T16:00:00Z'))!;
    expect(daysToKickoff(next, new Date('2026-10-14T16:00:00Z'))).toBe(2);
    expect(daysToKickoff(next, new Date('2026-10-16T16:00:00Z'))).toBe(0);
  });
});

describe('scheduleSections', () => {
  it('puts what is left first, then what was played, most recent first', () => {
    const s = scheduleSections(asFixtures(SEASON), new Date('2026-10-14T12:00:00Z'));
    expect(s.map((x) => x.label)).toEqual(['Coming up', 'Played']);
    expect(s[0].games.map((g) => g.opponent)).toEqual(['McDonald', 'Farview']);
    expect(s[1].games.map((g) => g.opponent)).toEqual(['Brookfield', 'Lakeview']);
  });

  it('leaves out an empty half', () => {
    const s = scheduleSections(asFixtures(SEASON.slice(1, 3)), new Date('2026-10-14T12:00:00Z'));
    expect(s.map((x) => x.label)).toEqual(['Played']);
  });
});

describe('summaryLine', () => {
  it('counts the games and gives the record', () => {
    expect(summaryLine(asFixtures(SEASON))).toBe(
      '4 games · 1–1 — tap one for the record against them',
    );
  });

  it('gives no record before a game is played', () => {
    expect(summaryLine(asFixtures([SEASON[0]]))).toBe(
      '1 game — tap one for the record against them',
    );
  });
});

describe('the record against an opponent', () => {
  it('is all-time only when there is a history file', () => {
    expect(allTimeRecord(null, SEASON, 'mcdonald-mcdonald')).toBeNull();
    const h = meetingsWith(HISTORY, SEASON, 'mcdonald-mcdonald');
    expect(allTimeRecord(HISTORY, SEASON, 'mcdonald-mcdonald')).toBe(`${h.won}–${h.lost}`);
  });

  it('is nothing against a side never met', () => {
    expect(allTimeRecord(HISTORY, SEASON, 'nobody-nowhere')).toBeNull();
  });

  it('still has this season’s meetings without a history file', () => {
    const h = meetingsWith(null, SEASON, 'lakeview-lakeview');
    expect(h.played).toBe(1);
    expect(h.meetings[0].result).toEqual({ us: 33, them: 10, won: true });
  });

  it('reads as Poland’s line', () => {
    const h = meetingsWith(HISTORY, SEASON, 'mcdonald-mcdonald');
    const oldest = h.meetings[h.meetings.length - 1].date.slice(0, 4);
    expect(meetingsLine(h)).toEqual({
      record: `${h.won}–${h.lost}`,
      rest: `in ${h.played} meetings since ${oldest}`,
    });
    const one = meetingsWith(null, SEASON, 'lakeview-lakeview');
    expect(meetingsLine(one)).toEqual({ record: '1–0', rest: 'in 1 meeting' });
    expect(meetingsLine(meetingsWith(null, SEASON, 'nobody-nowhere'))).toBeNull();
  });
});

describe('a tie', () => {
  // Neither paid school has one today; the statewide scoreboards carry a few.
  const tied: SchoolGame[] = [
    ...SEASON,
    game({ date: '2026-09-04', opponent: 'Lakeview', result: { us: 14, them: 14, won: false } }),
  ];

  it('counts as neither a win nor a loss in the season record', () => {
    expect(recordOf(asFixtures(tied))).toEqual({ won: 1, lost: 1, tied: 1, played: 3 });
    expect(summaryLine(asFixtures(tied))).toBe(
      '5 games · 1–1–1 — tap one for the record against them',
    );
  });

  it('shows a third figure only when there has been one', () => {
    expect(recordText({ won: 5, lost: 3, tied: 0 })).toBe('5–3');
    expect(recordText({ won: 5, lost: 3, tied: 1 })).toBe('5–3–1');
  });

  it('carries into the head-to-head line and the all-time record', () => {
    const h = meetingsWith(null, tied, 'lakeview-lakeview');
    expect(meetingsLine(h)).toEqual({ record: '1–0–1', rest: 'in 2 meetings since 2026' });
    const withFile = { ...HISTORY, games: [] };
    expect(allTimeRecord(withFile, tied, 'lakeview-lakeview')).toBe('1–0–1');
  });
});

describe('forecastFor', () => {
  const weather = {
    date: '2026-10-16', at: '2026-10-16T19:00', day: false,
    code: 1, tempF: 52, precipChance: 10, windMph: 6,
  } as FixtureWeather;
  const f = asFixtures(SEASON);

  it('goes on the card when it names the card’s game', () => {
    expect(forecastFor(weather, f[2])).toBe(weather);
  });

  it('goes nowhere when it names another game', () => {
    expect(forecastFor(weather, f[3])).toBeNull();
    expect(forecastFor(weather, undefined)).toBeNull();
    expect(forecastFor(null, f[2])).toBeNull();
  });
});

describe('loadHistory', () => {
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status: number, body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })),
    );

  it('reads the school’s file', async () => {
    answer(200, RAW);
    expect((await loadHistory('springfield-new-middletown'))?.games.length).toBe(HISTORY.games.length);
  });

  it('gives null for a missing file, a page in its place, or another school’s file', async () => {
    answer(404, 'Not found');
    expect(await loadHistory('springfield-new-middletown')).toBeNull();
    answer(200, '<!doctype html><html></html>');
    expect(await loadHistory('springfield-new-middletown')).toBeNull();
    answer(200, RAW);
    expect(await loadHistory('poland-seminary-poland')).toBeNull();
  });

  it('gives null rather than throwing with no signal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(await loadHistory('springfield-new-middletown')).toBeNull();
  });
});
