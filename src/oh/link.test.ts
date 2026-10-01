import { resolveLink, schoolParam } from './link';

describe('schoolParam', () => {
  it('reads a slug', () => {
    expect(schoolParam('?school=springfield-new-middletown')).toBe('springfield-new-middletown');
  });
  it('ignores an absent or empty parameter', () => {
    expect(schoolParam('')).toBeNull();
    expect(schoolParam('?school=')).toBeNull();
    expect(schoolParam('?manage')).toBeNull();
  });
  it('refuses anything that is not slug-shaped', () => {
    expect(schoolParam('?school=Springfield')).toBeNull();
    expect(schoolParam('?school=a/../b')).toBeNull();
    expect(schoolParam('?school=-a')).toBeNull();
    expect(schoolParam('?school=a--b')).toBeNull();
  });
});

describe('resolveLink', () => {
  const schools = [{ slug: 'springfield-new-middletown' }, { slug: 'poland-seminary-poland' }];

  it('opens the linked school when the directory has it', () => {
    expect(resolveLink('springfield-new-middletown', schools, 'poland-seminary-poland')).toBe(
      'springfield-new-middletown',
    );
  });
  it('falls back to the followed school for an unknown slug', () => {
    expect(resolveLink('no-such-school', schools, 'poland-seminary-poland')).toBe('poland-seminary-poland');
  });
  it('falls back to the picker when nothing is followed', () => {
    expect(resolveLink('no-such-school', schools, null)).toBeNull();
    expect(resolveLink(null, schools, null)).toBeNull();
  });
});
