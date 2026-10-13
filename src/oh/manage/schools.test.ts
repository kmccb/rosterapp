import { describe, expect, it } from 'vitest';
import type { RosterRow } from './adminApi';
import { groupSchools, longDate, renewedThrough, schoolStatus } from './schools';

const TODAY = '2026-10-13';

const refusing = (problem: string, since: string | null = null) => ({
  ok_at: null, problem, problem_since: since, alerted: true, changed_at: since,
});

const row = (over: Partial<RosterRow>): RosterRow => ({
  school_slug: 'springfield-new-middletown',
  sport: 'football',
  season: 2026,
  player_count: 41,
  colors: null,
  has_logo: false,
  has_schedule: false,
  has_league: false,
  published: true,
  paid_through: '2027-02-01',
  note: '',
  updated_at: '2026-10-13T12:00:00Z',
  ...over,
});

describe('a school’s status', () => {
  it('is live when any published sport is paid for', () => {
    expect(schoolStatus([row({}), row({ sport: 'volleyball', published: false })], TODAY)).toBe('live');
    expect(schoolStatus([row({ paid_through: TODAY })], TODAY)).toBe('live');
  });

  it('is expired only when every published sport has run out', () => {
    expect(schoolStatus([row({ paid_through: '2026-10-12' })], TODAY)).toBe('expired');
    expect(
      schoolStatus([row({ paid_through: '2026-02-01' }), row({ sport: 'volleyball' })], TODAY),
    ).toBe('live');
  });

  it('is unpublished when nothing is shown to anybody, whatever the dates say', () => {
    expect(schoolStatus([row({ published: false, paid_through: '2020-01-01' })], TODAY)).toBe('unpublished');
  });

  it('needs a look when a published sport’s link is being refused', () => {
    const refused = { roster: refusing('a name is blank', '2026-10-12T16:00:00Z') };
    expect(schoolStatus([row({ sync_state: refused })], TODAY)).toBe('attention');
    // Nobody can see an unpublished sport, so its sheet is not yet anybody's problem.
    expect(schoolStatus([row({ published: false, sync_state: refused })], TODAY)).toBe('unpublished');
  });
});

describe('folding rows into schools', () => {
  it('makes one school of its sports, football first and the newest season first', () => {
    const [school] = groupSchools(
      [
        row({ sport: 'volleyball', paid_through: '2027-06-01' }),
        row({ sport: 'football', season: 2025, paid_through: '2026-02-01' }),
        row({ sport: 'basketball' }),
        row({ sport: 'football' }),
      ],
      TODAY,
    );
    expect(school.rows.map((r) => `${r.sport} ${r.season}`)).toEqual([
      'football 2026', 'football 2025', 'basketball 2026', 'volleyball 2026',
    ]);
    expect(school.paidThrough).toBe('2027-06-01');
    expect(school.status).toBe('live');
  });

  it('puts what needs attention at the top and the rest by name', () => {
    const refused = { schedule: refusing('no events matched') };
    const schools = groupSchools(
      [
        row({ school_slug: 'zanesville-zanesville' }),
        row({ school_slug: 'akron-east-akron', published: false }),
        row({ school_slug: 'lowellville-lowellville', paid_through: '2026-02-01' }),
        row({ school_slug: 'poland-seminary-poland', sport: 'volleyball', sync_state: refused }),
        row({ school_slug: 'canfield-canfield' }),
      ],
      TODAY,
    );
    expect(schools.map((s) => `${s.slug.split('-')[0]} ${s.status}`)).toEqual([
      'poland attention', 'lowellville expired', 'canfield live', 'zanesville live', 'akron unpublished',
    ]);
    expect(schools[0].problems).toHaveLength(1);
  });
});

describe('dates on the panel', () => {
  it('prints a day in full, and a dash for none', () => {
    expect(longDate('2027-02-01')).toBe('Feb 1, 2027');
    expect(longDate('2026-10-13T12:00:00Z')).toBe('Oct 13, 2026');
    expect(longDate(null)).toBe('—');
  });

  it('renews a year on from the later of the paid date and today', () => {
    expect(renewedThrough('2027-02-01', TODAY)).toBe('2028-02-01');
    expect(renewedThrough('2026-02-01', TODAY)).toBe('2027-10-13');
    expect(renewedThrough(null, TODAY)).toBe('2027-10-13');
    expect(renewedThrough('2028-02-29', TODAY)).toBe('2029-02-28');
  });
});
