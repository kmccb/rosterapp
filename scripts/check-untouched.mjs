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

/*
 * Line endings are the checkout's, not the build's.
 *
 * The pages are compared with every carriage return stripped, because git
 * hands a Windows working copy CRLF and the Linux runner that deploys the site
 * LF, and the built page inherits whichever it was given. Comparing the raw
 * bytes made this guard pass on the machine that recorded the baseline and
 * fail on the one that ships — which would have blocked every deploy while
 * proving nothing. Nothing a build config can do shows up only as a line
 * ending, so dropping them costs no coverage.
 *
 * Stripping every \r rather than folding \r\n pairs is deliberate: the built
 * page contains one `\r\r\n`, left where the entry script tag was replaced, and
 * folding pairs turns that into `\r\n` on Windows and `\n` on Linux — the same
 * mismatch again, one round further down.
 *
 * The raw hashes stay in the baseline file as the record of the exact bytes
 * that were measured on the machine that recorded them.
 */
const shaLf = (text) => sha(text.replace(/\r/g, ''));

const baseline = JSON.parse(await readFile(join(root, 'scripts/untouched-baseline.json'), 'utf8'));
const problems = [];

const pages = {
  root: 'dist/index.html',
  ysu: 'dist/ysu/index.html',
  vc: 'dist/victorychristian/index.html',
};

for (const [key, file] of Object.entries(pages)) {
  const text = await readFile(join(root, file), 'utf8');
  if (shaLf(text) !== baseline[`${key}Lf`]) problems.push(`${file} changed — it must not.`);
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
