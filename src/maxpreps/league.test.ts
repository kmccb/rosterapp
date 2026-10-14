import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  matchConference,
  parseMaxPrepsConference,
  parseMaxPrepsTeam,
  teamKey,
  type ConferenceTeam,
  type DirectorySchool,
} from './leagueParse';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const teamPage = fixture('springfield-team-2026-10-13.html');
const conferencePage = fixture('mvac-scarlet-2026-10-13.html');
const directory = (JSON.parse(readFileSync('public/oh/index.json', 'utf8')) as { schools: DirectorySchool[] }).schools;

const OWN = 'springfield-new-middletown';

/** A conference team as the page would give it, from a name and a town. */
const at = (name: string, town: string, state = 'oh'): ConferenceTeam => ({
  name,
  state,
  town,
  key: `${state}/${town}/${name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
});

describe('a MaxPreps team page', () => {
  const team = parseMaxPrepsTeam(teamPage);

  it('says where the printable stats are and which conference the team is in', () => {
    expect(team).not.toBeNull();
    expect(team!.statsUrl).toMatch(
      /^https:\/\/www\.maxpreps\.com\/print\/team_stats\.aspx\?admin=0&bygame=0&league=0&print=1&schoolid=[0-9a-f-]{36}&ssid=[0-9a-f-]{36}$/,
    );
    expect(team!.leagueName).toBe('Mahoning Valley - Scarlet');
    expect(team!.leagueUrl).toMatch(/^https:\/\/www\.maxpreps\.com\/oh\/football\/26-27\/conference\//);
  });

  it('is nothing when the page is not a team’s, or its ids are not ids', () => {
    expect(parseMaxPrepsTeam('<html><body>Access denied</body></html>')).toBeNull();
    expect(parseMaxPrepsTeam(conferencePage)).toBeNull();
    // An id is about to be put in an address that is then fetched.
    expect(parseMaxPrepsTeam(teamPage.replace(/"teamId":"[^"]+"/, '"teamId":"x&admin=1"'))).toBeNull();
  });

  it('keeps the stats link and drops a conference address that is not MaxPreps’', () => {
    const elsewhere = teamPage.replace(/"leagueCanonicalUrl":"[^"]+"/, '"leagueCanonicalUrl":"https://example.com/x"');
    expect(parseMaxPrepsTeam(elsewhere)).toMatchObject({ leagueUrl: null, leagueName: 'Mahoning Valley - Scarlet' });
  });
});

describe('a MaxPreps conference page', () => {
  const conference = parseMaxPrepsConference(conferencePage);

  it('names the conference and its eight teams, each with its state, town and address key', () => {
    expect(conference!.name).toBe('Mahoning Valley - Scarlet');
    expect(conference!.teams).toHaveLength(8);
    expect(conference!.teams).toContainEqual({
      name: 'Memorial',
      state: 'oh',
      town: 'campbell',
      key: 'oh/campbell/memorial-red-devils',
    });
    expect(conference!.teams.map((t) => t.town)).toContain('berlin-center');
  });

  it('is nothing when the page is not a conference’s', () => {
    expect(parseMaxPrepsConference(teamPage)).toBeNull();
    expect(parseMaxPrepsConference('<html></html>')).toBeNull();
  });
});

describe('placing a conference in the directory', () => {
  const teams = parseMaxPrepsConference(conferencePage)!.teams;

  it('finds all seven of Springfield’s rivals and leaves Springfield out', () => {
    const { members, unmatched } = matchConference(teams, directory, OWN);
    expect(unmatched).toEqual([]);
    expect([...members].sort()).toEqual([
      'campbell-memorial-campbell',
      'jackson-milton-north-jackson',
      'lowellville-lowellville',
      'mcdonald-mcdonald',
      'mineral-ridge-mineral-ridge',
      'waterloo-atwater',
      'western-reserve-berlin-center',
    ]);
  });

  it('goes by the town, so the other Western Reserve is never the one', () => {
    const reserves = directory.filter((s) => s.name === 'Western Reserve');
    expect(reserves.length).toBeGreaterThan(1);
    const { members } = matchConference([at('Western Reserve', 'berlin-center')], directory, OWN);
    expect(members).toEqual(['western-reserve-berlin-center']);
  });

  const made: DirectorySchool[] = [
    { slug: 'north-akron', name: 'North', city: 'Akron' },
    { slug: 'east-akron', name: 'East', city: 'Akron' },
    { slug: 'memorial-campbell', name: 'Campbell Memorial', city: 'Campbell' },
    { slug: 'central-toledo', name: 'Central', city: 'Toledo' },
    { slug: 'central-dayton', name: 'Central', city: 'Dayton' },
    { slug: 'unique-nowhere', name: 'Unique Academy', city: 'Nowhere' },
  ];

  it('chooses within a town by name, and gives up when the name does not settle it', () => {
    expect(matchConference([at('East', 'akron')], made, 'x')).toEqual({ members: ['east-akron'], unmatched: [] });
    expect(matchConference([at('Firestone', 'akron')], made, 'x')).toEqual({ members: [], unmatched: ['Firestone'] });
  });

  it('will not take a one-school town’s school for a different school in that town', () => {
    expect(matchConference([at('Cardinal Mooney', 'campbell')], made, 'x')).toEqual({
      members: [],
      unmatched: ['Cardinal Mooney'],
    });
  });

  it('prefers the school of exactly that name to one that merely contains it', () => {
    const troy: DirectorySchool[] = [
      { slug: 'troy-troy', name: 'Troy', city: 'Troy' },
      { slug: 'troy-christian-troy', name: 'Troy Christian', city: 'Troy' },
    ];
    expect(matchConference([at('Troy', 'troy')], troy, 'x').members).toEqual(['troy-troy']);
    expect(matchConference([at('Troy Christian', 'troy')], troy, 'x').members).toEqual(['troy-christian-troy']);
  });

  it('places nobody from another state, whatever the town is called', () => {
    expect(matchConference([at('Campbell Memorial', 'campbell', 'in')], made, 'x')).toEqual({
      members: [],
      unmatched: ['Campbell Memorial'],
    });
  });

  it('leaves the school itself out by its own address, placed or not', () => {
    const own = teamKey('https://www.maxpreps.com/oh/new-middletown/springfield-tigers/football/stats/');
    expect(own).toBe('oh/new-middletown/springfield-tigers');
    expect(matchConference(teams, directory, OWN, own).members).toHaveLength(7);
    // A directory that has never heard of it must still not call it "unplaced".
    expect(matchConference(teams, made, 'x', own).unmatched).not.toContain('Springfield');
  });

  it('tries the name across the state only for a town it does not have, and only if unique', () => {
    expect(matchConference([at('Unique Academy', 'somewhere-else')], made, 'x').members).toEqual(['unique-nowhere']);
    expect(matchConference([at('Central', 'columbus')], made, 'x')).toEqual({ members: [], unmatched: ['Central'] });
  });

  it('lists nobody twice', () => {
    const twice = [at('Memorial', 'campbell'), at('Campbell Memorial', 'campbell')];
    expect(matchConference(twice, made, 'x').members).toEqual(['memorial-campbell']);
  });
});
