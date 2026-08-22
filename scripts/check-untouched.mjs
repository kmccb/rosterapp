/**
 * Poland must not change.
 *
 * People have this on a home screen and open it at a ground with no signal. The
 * Ohio directory is worth nothing next to that, so this fails the build rather
 * than let a config change reach an installed phone.
 *
 * Four things are checked, and each has already gone wrong somewhere:
 *   - the three built pages are byte-identical to the recorded baseline
 *   - the precache has not grown, so no phone starts downloading the state
 *   - the worker refuses /oh/, so it stops answering it with Poland's shell
 *   - the directory's own page was actually built, so a green guard cannot
 *     simply mean the second build never ran
 *
 * If this fails on the page hashes, the fix is in the build config. It is never
 * in scripts/untouched-baseline.json — rewriting that file turns the one alarm
 * in this repository into a rubber stamp.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const baseline = JSON.parse(await readFile(join(root, 'scripts/untouched-baseline.json'), 'utf8'));
const problems = [];

const pages = {
  root: 'dist/index.html',
  ysu: 'dist/ysu/index.html',
  vc: 'dist/victorychristian/index.html',
};

for (const [key, file] of Object.entries(pages)) {
  const got = sha(await readFile(join(root, file)));
  if (got !== baseline[key]) problems.push(`${file} changed — it must not.`);
}

const sw = await readFile(join(root, 'dist/sw.js'), 'utf8');
/*
 * The manifest is inlined into sw.js, and it is minified — the entries read
 * `url:"index.html"`, not `"url":"index.html"`. The optional quotes matter: a
 * regex that insisted on them matched nothing, counted a precache of zero, and
 * would have passed every build for ever after.
 */
const urls = [...sw.matchAll(/"?url"?\s*:\s*"([^"]+)"/g)].map((m) => m[1]);

if (!urls.length) {
  problems.push('no precache entries were found in dist/sw.js — this check is not looking at one.');
}
if (urls.length > baseline.precache) {
  problems.push(`precache grew from ${baseline.precache} to ${urls.length} entries.`);
}
if (urls.some((u) => u.startsWith('oh/'))) {
  problems.push('the directory is being precached — globIgnores is not working.');
}
if (!/denylist/.test(sw)) {
  problems.push('the worker has no navigateFallbackDenylist, so it will answer /oh/ with Poland.');
}
if (!existsSync(join(root, 'dist/oh/index.html'))) {
  problems.push('dist/oh/index.html is missing — the directory build did not run.');
}

if (problems.length) {
  console.error('\n  Poland regression guard FAILED:');
  for (const p of problems) console.error(`   ! ${p}`);
  process.exit(1);
}
console.log(
  `  Poland, YSU and Victory Christian are byte-identical. Precache unchanged at ${urls.length}.`,
);
