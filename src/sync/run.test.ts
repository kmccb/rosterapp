import type { Player } from '../types';
import { previewSource, syncTarget } from './run';
import type { Fetched, Target } from './types';

const NOW = '2026-09-30T20:15:00.000Z';

const answering = (byUrl: Record<string, Fetched>) => async (url: string): Promise<Fetched> =>
  byUrl[url] ?? { ok: false, reason: 'HTTP 404' };

const csv = (text: string): Fetched => ({ ok: true, text, contentType: 'text/csv' });
const ics = (text: string): Fetched => ({ ok: true, text, contentType: 'text/calendar' });

const SHEET = 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv';
const CAL = 'https://example.test/cal.ics';

const target = (over: Partial<Target> = {}): Target => ({
  slug: 'springfield-new-middletown',
  sport: 'volleyball',
  season: 2026,
  roster_source_url: SHEET,
  schedule_source_url: null,
  schedule_source_filter: null,
  sync_state: {},
  players: [],
  schedule: null,
  ...over,
});

const ROSTER = '#,Name\n1,Ava Carter\n2,Mia Lopez\n';
const GAME = 'BEGIN:VEVENT\r\nSUMMARY:Girls Volleyball vs Canfield\r\nDTSTART:20260910T170000\r\nEND:VEVENT';

describe('syncTarget — roster', () => {
  it('writes a new roster and records the success', async () => {
    const r = await syncTarget(target(), answering({ [SHEET]: csv(ROSTER) }), NOW);
    expect(r.players?.map((p) => p.lastName)).toEqual(['Carter', 'Lopez']);
    expect(r.state.roster).toEqual({ ok_at: NOW, problem: null, problem_since: null, alerted: false, changed_at: NOW });
    expect(r.emails).toEqual([]);
    expect(r.schedule).toBeNull();
  });

  it('writes nothing when the sheet hasn’t changed', async () => {
    const first = await syncTarget(target(), answering({ [SHEET]: csv(ROSTER) }), NOW);
    const again = await syncTarget(
      target({ players: first.players as Player[], sync_state: first.state }),
      answering({ [SHEET]: csv(ROSTER) }),
      NOW,
    );
    expect(again.players).toBeNull();
    expect(again.state.roster?.ok_at).toBe(NOW);
  });

  it('refuses a sheet that answers with a web page (not published)', async () => {
    const r = await syncTarget(
      target(),
      answering({ [SHEET]: { ok: true, text: '<!DOCTYPE html><html>', contentType: 'text/html; charset=utf-8' } }),
      NOW,
    );
    expect(r.players).toBeNull();
    expect(r.state.roster?.problem).toBe(
      'the link opens a web page, not a sheet — publish the roster tab to the web as CSV',
    );
    expect(r.emails).toEqual([{ side: 'roster', email: { kind: 'problem', reason: r.state.roster?.problem } }]);
  });

  it('records a dead link as a problem', async () => {
    const r = await syncTarget(target(), answering({}), NOW);
    expect(r.state.roster?.problem).toBe('the sheet didn’t answer (HTTP 404)');
  });
});

describe('syncTarget — schedule', () => {
  it('reads a linked calendar for a non-football sport', async () => {
    const r = await syncTarget(
      target({ roster_source_url: null, schedule_source_url: CAL }),
      answering({ [CAL]: ics(GAME) }),
      NOW,
    );
    expect(r.schedule).toEqual([{ date: '2026-09-10', opponent: 'Canfield', home: true, time: '5:00 PM' }]);
    expect(r.state.schedule?.ok_at).toBe(NOW);
    expect(r.state.roster).toBeUndefined();
  });

  it('never touches football’s schedule', async () => {
    let asked = 0;
    const r = await syncTarget(
      target({ sport: 'football', roster_source_url: null, schedule_source_url: CAL }),
      async () => {
        asked += 1;
        return ics(GAME);
      },
      NOW,
    );
    expect(asked).toBe(0);
    expect(r.schedule).toBeNull();
  });

  it('writes nothing when the calendar hasn’t changed, whatever order jsonb stored the keys in', async () => {
    const stored = [JSON.parse('{"time":"5:00 PM","home":true,"date":"2026-09-10","opponent":"Canfield"}')];
    const r = await syncTarget(
      target({ roster_source_url: null, schedule_source_url: CAL, schedule: stored }),
      answering({ [CAL]: ics(GAME) }),
      NOW,
    );
    expect(r.schedule).toBeNull();
  });
});

describe('previewSource', () => {
  it('shows a sheet’s players and warnings without any history', async () => {
    const p = await previewSource(
      { kind: 'roster', url: SHEET, filter: null, season: 2026 },
      answering({ [SHEET]: csv('#,Name\n3,Ava Carter\n3,Mia Lopez\n') }),
    );
    expect(p.ok && p.players?.length).toBe(2);
    expect(p.ok && p.warnings).toEqual(['#3 is worn by 2 players']);
  });

  it('shows a calendar’s games and how many it skipped', async () => {
    const p = await previewSource(
      { kind: 'schedule', url: CAL, filter: null, season: 2026 },
      answering({ [CAL]: ics(GAME) }),
    );
    expect(p).toEqual({
      ok: true,
      rows: [{ date: '2026-09-10', opponent: 'Canfield', home: true, time: '5:00 PM' }],
      warnings: [],
      skipped: 0,
    });
  });

  it('passes a refusal through', async () => {
    expect(await previewSource({ kind: 'schedule', url: CAL, filter: null, season: 2026 }, answering({}))).toEqual({
      ok: false,
      reason: 'the link didn’t answer (HTTP 404)',
    });
  });
});
