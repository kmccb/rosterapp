import { readFileSync } from 'node:fs';

/*
 * The short addresses are printed on gate signs and flyers, so a typo here is
 * a QR code that opens the wrong school or none. Each line is held to the
 * directory it points into.
 */
const lines = readFileSync('public/_redirects', 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

const slugs = new Set(
  (JSON.parse(readFileSync('public/oh/index.json', 'utf8')).schools as { slug: string }[]).map(
    (s) => s.slug,
  ),
);

describe('public/_redirects', () => {
  it('has at least one short address', () => {
    expect(lines.length).toBeGreaterThan(0);
  });

  it.each(lines)('%s lives under /oh/, is a 302, and opens a real school', (line) => {
    const [from, to, status, ...rest] = line.split(/\s+/);
    expect(rest).toEqual([]);
    // Poland's worker answers every navigation outside /oh/ with Poland's page.
    expect(from).toMatch(/^\/oh\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/);
    expect(status).toBe('302');
    const target = new URL(to, 'https://roster.scottforge.ai');
    expect(target.pathname).toBe('/oh/');
    expect(slugs.has(target.searchParams.get('school') ?? '')).toBe(true);
  });

  it('lists no short address twice', () => {
    const froms = lines.map((l) => l.split(/\s+/)[0]);
    expect(new Set(froms).size).toBe(froms.length);
  });
});
