/**
 * Fills the content security policy's hash slots in dist/_headers.
 *
 * Runs after build-teams --post, because that step writes the team pages and
 * their window.__TEAMS__ script, and before check-untouched, so the guard sees
 * the finished dist. It reads every built HTML page and writes dist/_headers
 * and nothing else: Poland's pages are hashed, never touched.
 *
 * Fail-closed. A dist/_headers without its slots, or a dist with no inline
 * script anywhere, stops the build rather than deploy a policy that would
 * report every page.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampHeaders } from '../src/security/csp.ts';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const file = join(dist, '_headers');

const pages = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.html'))
  .map((e) => join(e.parentPath, e.name));

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('base64');

try {
  const stamped = stampHeaders(
    readFileSync(file, 'utf8'),
    pages.map((p) => readFileSync(p, 'utf8')),
    sha256,
  );
  writeFileSync(file, stamped);
  console.log(`stamp-csp: hashed the inline scripts and styles of ${pages.length} pages into dist/_headers.`);
} catch (err) {
  console.error(`stamp-csp: ${err.message}`);
  process.exit(1);
}
