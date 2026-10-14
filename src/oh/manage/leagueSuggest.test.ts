import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asLeagueSuggestion } from './leagueSuggest';

const OWN = 'springfield-new-middletown';
const known = new Set(
  (JSON.parse(readFileSync('public/oh/index.json', 'utf8')) as { schools: Array<{ slug: string }> }).schools.map(
    (s) => s.slug,
  ),
);

describe('a conference on file', () => {
  it('reads the committed Springfield file as seven schools the directory knows', () => {
    const file = JSON.parse(readFileSync('public/oh/leagues/springfield-new-middletown-football.json', 'utf8'));
    const found = asLeagueSuggestion(file, OWN, known);
    expect(found).toMatchObject({ name: 'Mahoning Valley - Scarlet', source: 'MaxPreps', unmatched: [] });
    expect(found!.members).toHaveLength(7);
    expect(found!.members).not.toContain(OWN);
  });

  it('drops what is not a school, the school itself and anything listed twice', () => {
    const found = asLeagueSuggestion(
      {
        name: '  MVAC Scarlet ',
        source: 'MaxPreps',
        members: ['mcdonald-mcdonald', OWN, 'not-a-school', 7, 'mcdonald-mcdonald', 'lowellville-lowellville'],
        unmatched: ['Memorial', '', 3],
      },
      OWN,
      known,
    );
    expect(found).toEqual({
      name: 'MVAC Scarlet',
      source: 'MaxPreps',
      members: ['mcdonald-mcdonald', 'lowellville-lowellville'],
      unmatched: ['Memorial'],
    });
  });

  it('is nothing without a name, or with nobody left in it', () => {
    expect(asLeagueSuggestion(null, OWN, known)).toBeNull();
    expect(asLeagueSuggestion('<!doctype html>', OWN, known)).toBeNull();
    expect(asLeagueSuggestion({ name: '', members: ['mcdonald-mcdonald'] }, OWN, known)).toBeNull();
    expect(asLeagueSuggestion({ name: 'X', members: [OWN, 'nobody'] }, OWN, known)).toBeNull();
    expect(asLeagueSuggestion({ name: 'X', members: 'mcdonald-mcdonald' }, OWN, known)).toBeNull();
  });
});
