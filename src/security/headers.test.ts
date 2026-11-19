import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LINE_LIMIT, SCRIPT_SLOT, STYLE_SLOT, inlineSources, stampHeaders } from './csp';

/*
 * Cloudflare reads _headers silently: a misspelt header or a rule that no
 * longer covers /oh/ is not an error anywhere, just a page without the
 * protection. So the files are held here, and the hash stamping that fills
 * the policy at build time is held to the browser's own arithmetic.
 */

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64');

/** Each rule's path and its headers, in file order. */
const rules = (file: string) => {
  const out: { path: string; headers: Map<string, string> }[] = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      out.push({ path: line.trim(), headers: new Map() });
      continue;
    }
    const at = line.indexOf(':');
    out.at(-1)!.headers.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return out;
};

const BASIC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

describe.each(['public/_headers', 'marketing/_headers'])('%s', (file) => {
  const all = rules(file);

  it('is one rule for every path, which covers /oh/ too', () => {
    expect(all.map((r) => r.path)).toEqual(['/*']);
  });

  it('sends the basic headers, and refuses framing in an enforcing policy', () => {
    const { headers } = all[0];
    for (const [name, value] of Object.entries(BASIC)) expect(headers.get(name), name).toBe(value);
    expect(headers.get('Permissions-Policy')).toMatch(/camera=\(\)/);
    // The phone's clipboard is how a coach copies a share link.
    expect(headers.get('Permissions-Policy')).not.toMatch(/clipboard/);
  });
});

describe('the report-only policy in public/_headers', () => {
  const file = readFileSync('public/_headers', 'utf8');
  const policy = rules('public/_headers')[0].headers.get('Content-Security-Policy-Report-Only')!;
  const directive = (name: string) =>
    policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .find(([n]) => n === name)
      ?.slice(1);

  it('reports and does not block', () => {
    expect(policy).toBeTruthy();
    expect(rules('public/_headers')[0].headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
  });

  it('carries each hash slot once, where the stamp step looks for it', () => {
    expect(directive('script-src')).toContain(SCRIPT_SLOT);
    expect(directive('style-src')).toContain(STYLE_SLOT);
    expect(file.split(SCRIPT_SLOT)).toHaveLength(2);
    expect(file.split(STYLE_SLOT)).toHaveLength(2);
  });

  it('lets in what the pages really load', () => {
    expect(directive('default-src')).toEqual(["'self'"]);
    // Cloudflare injects its Web Analytics beacon at the edge.
    expect(directive('script-src')).toContain('https://static.cloudflareinsights.com');
    expect(directive('connect-src')).toEqual(
      expect.arrayContaining([
        "'self'",
        'https://jkuocstqtveuymfqqlwg.supabase.co',
        'https://cloudflareinsights.com',
        'https://static.cloudflareinsights.com',
      ]),
    );
    // YSU's photos are on another site; crests are data: URLs.
    expect(directive('img-src')).toEqual(["'self'", 'data:', 'https:']);
    expect(directive('manifest-src')).toEqual(["'self'"]);
    expect(directive('worker-src')).toEqual(["'self'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
  });

  it('never allows inline code wholesale, which would make the hashes pointless', () => {
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it('stays inside Cloudflare’s line limit with room for a page’s worth of hashes', () => {
    const many = Array.from({ length: 12 }, (_, i) => `<script>${i}</script><style>${i}</style>`);
    for (const line of stampHeaders(file, many, sha256).split(/\r?\n/)) {
      expect(line.length).toBeLessThanOrEqual(LINE_LIMIT);
    }
  });
});

describe('inlineSources', () => {
  it('finds inline scripts and styles, and skips a script that loads a file', () => {
    const page = `<style>
  a {}
</style><script type="module" crossorigin src="/assets/index-x.js"></script>
<script>one()</script><SCRIPT id="x">two()</SCRIPT >`;
    expect(inlineSources(page)).toEqual({ scripts: ['one()', 'two()'], styles: ['\n  a {}\n'] });
  });

  it('reads CRLF as the browser does, so a Windows build hashes like Linux', () => {
    expect(inlineSources('<script>a\r\nb\rc</script>').scripts).toEqual(['a\nb\nc']);
  });
});

describe('stampHeaders', () => {
  const template = `/*\n  X: y\n  P: script-src 'self' ${SCRIPT_SLOT} https://a; style-src 'self' ${STYLE_SLOT}; img-src 'self'\n`;

  it('fills both slots with the base64 SHA-256 of each inline block, once each', () => {
    // The hash a browser prints for alert('Hello, world.'); in CSP's own examples.
    expect(sha256("alert('Hello, world.');")).toBe('qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=');
    const pages = ["<script>alert('Hello, world.');</script><style>b{}</style>", "<script>alert('Hello, world.');</script>"];
    expect(stampHeaders(template, pages, sha256)).toBe(
      `/*\n  X: y\n  P: script-src 'self' 'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=' https://a; style-src 'self' '${'sha256-' + sha256('b{}')}'; img-src 'self'\n`,
    );
  });

  it('closes up a slot with nothing to put in it', () => {
    expect(stampHeaders(template, ['<script>a</script>'], sha256)).toContain("style-src 'self'; img-src");
  });

  it('refuses a file without its slots, so the build fails instead of shipping one', () => {
    expect(() => stampHeaders(template.replace(SCRIPT_SLOT, ''), ['<script>a</script>'], sha256)).toThrow(
      SCRIPT_SLOT,
    );
    expect(() => stampHeaders(template.replace(STYLE_SLOT, ''), ['<script>a</script>'], sha256)).toThrow(
      STYLE_SLOT,
    );
    expect(() => stampHeaders(`${template}${SCRIPT_SLOT}`, ['<script>a</script>'], sha256)).toThrow(/2 times/);
  });

  it('refuses pages with no inline script, which are not the built pages', () => {
    expect(() => stampHeaders(template, ['<p>hi</p>'], sha256)).toThrow(/No inline script/);
  });

  it('refuses a policy longer than Cloudflare will read', () => {
    const pages = Array.from({ length: 60 }, (_, i) => `<script>${i}</script>`);
    expect(() => stampHeaders(template, pages, sha256)).toThrow(/2000/);
  });
});
