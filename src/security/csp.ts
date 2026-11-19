/*
 * The content security policy names every inline <script> and <style> in the
 * built pages by its hash, and those hashes can only be known after the build.
 *
 * Writing them into public/_headers by hand would be wrong in production for
 * three reasons: a Windows checkout builds the pages with CRLF line endings
 * where Cloudflare's Linux build has LF, the beacon loader carries whatever
 * VITE_CF_BEACON was substituted into it, and window.__TEAMS__ changes with
 * whatever the build fetched. So public/_headers carries two slots and
 * scripts/stamp-csp.mjs fills them from dist after every other step has
 * written its pages. This module is the pure half: it reads pages as text
 * and returns the stamped file, and leaves the files and the hashing to the
 * caller.
 */

export const SCRIPT_SLOT = '__CSP_SCRIPT_HASHES__';
export const STYLE_SLOT = '__CSP_STYLE_HASHES__';

/** Cloudflare Pages ignores a _headers line longer than this. */
export const LINE_LIMIT = 2000;

const INLINE = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

/**
 * The text of every inline script and style in a page, as the browser hashes
 * it. The HTML parser turns CRLF and lone CR into LF before a script's text
 * exists, so a page built on Windows hashes the same as it runs.
 */
export function inlineSources(html: string): { scripts: string[]; styles: string[] } {
  const scripts: string[] = [];
  const styles: string[] = [];
  for (const [, tag, attrs, body] of html.matchAll(INLINE)) {
    const isScript = tag.toLowerCase() === 'script';
    // A script with a src runs the file, not its text, and is allowed by origin.
    if (isScript && /\bsrc\s*=/i.test(attrs)) continue;
    (isScript ? scripts : styles).push(body.replace(/\r\n?/g, '\n'));
  }
  return { scripts, styles };
}

const fill = (headers: string, slot: string, tokens: string[]): string => {
  const at = headers.split(slot).length - 1;
  if (at !== 1) {
    throw new Error(`_headers must carry ${slot} exactly once, and it carries it ${at} times.`);
  }
  if (!headers.includes(` ${slot}`)) {
    throw new Error(`${slot} in _headers must follow a space, inside its directive.`);
  }
  return headers.replace(` ${slot}`, tokens.length ? ` ${tokens.join(' ')}` : '');
};

/**
 * public/_headers with its two slots replaced by the hashes of every inline
 * script and style in `pages`. `sha256` returns the base64 SHA-256 of a
 * string's UTF-8 bytes. Throws rather than write a policy that is missing a
 * slot, found no inline script at all (it is not looking at the built pages),
 * or grew past the line length Cloudflare will read.
 */
export function stampHeaders(
  headers: string,
  pages: string[],
  sha256: (text: string) => string,
): string {
  const scripts = new Set<string>();
  const styles = new Set<string>();
  for (const page of pages) {
    const found = inlineSources(page);
    for (const s of found.scripts) scripts.add(`'sha256-${sha256(s)}'`);
    for (const s of found.styles) styles.add(`'sha256-${sha256(s)}'`);
  }
  if (scripts.size === 0) {
    throw new Error('No inline script was found in any page, so these are not the built pages.');
  }
  const stamped = fill(fill(headers, SCRIPT_SLOT, [...scripts].sort()), STYLE_SLOT, [...styles].sort());
  const long = stamped.split(/\r?\n/).find((line) => line.length > LINE_LIMIT);
  if (long !== undefined) {
    throw new Error(
      `A _headers line is ${long.length} characters, and Cloudflare reads none past ${LINE_LIMIT}.`,
    );
  }
  return stamped;
}
