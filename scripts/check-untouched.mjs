/**
 * Poland must not change.
 *
 * People have this on a home screen and open it at a ground with no signal. The
 * Ohio directory is worth nothing next to that, so this fails the build rather
 * than let a config change reach an installed phone.
 *
 * Six things are checked, and each has already gone wrong somewhere:
 *   - the three built pages are unchanged from the recorded baseline
 *   - the precache is the same size, in both directions: one that shrank means
 *     files dropped out of every installed phone's offline cache, which is the
 *     failure this app exists to survive, and it is silent
 *   - nothing under oh/ is precached, so no phone downloads the state
 *   - the worker's denylist still carries the /oh/ pattern, not merely the word
 *   - the directory's own page was built, so a green guard cannot just mean the
 *     second pass never ran
 *   - the directory's data arrived with it, because a build script once swept
 *     public/oh away and the only symptom was an empty directory
 *
 * Every one of those is written the way it is after watching a weaker version
 * pass a mutation it should have caught: a precache compared with `>` that
 * shrugged at ten deleted entries, a denylist test that passed against an empty
 * denylist, an existence check that passed with the data moved aside. If you
 * add a check here, break the thing it guards and watch it fail before you
 * believe it.
 *
 * If this fails on the page hashes, the fix is in the build config. It is never
 * in scripts/untouched-baseline.json — rewriting that file turns the one alarm
 * in this repository into a rubber stamp.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/*
 * Two things in the built page are not the build config's doing, and both are
 * removed before hashing. Neither can hide a regression, because neither is
 * something a change to vite.config.ts could produce on its own.
 *
 * Line endings are the checkout's. Git hands a Windows working copy CRLF and
 * the ubuntu runner that deploys the site LF, and the page inherits whichever
 * it was given. Comparing raw bytes made this guard pass on the machine that
 * recorded the baseline and fail on the one that ships — blocking every deploy
 * while proving nothing. Every \r is stripped rather than \r\n folded, because
 * the page carries one `\r\r\n` where the entry script tag was replaced, and
 * folding pairs leaves `\r\n` on Windows against `\n` on Linux: the same
 * mismatch, one round further along.
 *
 * The analytics token is the environment's. index.html carries
 * `var token = '%VITE_CF_BEACON%'`, and Vite substitutes it only when the
 * variable is defined — so a local build keeps the placeholder verbatim while
 * the workflow, which passes the repository variable through, bakes in its
 * value, an empty string included. Both are correct builds of identical source,
 * and the value is about to change again when the beacon is switched on. The
 * token's value is blanked rather than its line, so removing the beacon
 * altogether still reads as a change.
 *
 * The Supabase variables are coupled to the environment in the same way. They
 * are left alone because they agree between here and CI today — if that ever
 * stops being true this is the comment that explains what to do about it, and
 * re-recording the baseline is not it.
 */
const normalise = (text) =>
  text.replace(/\r/g, '').replace(/var token = '[^']*';/, "var token = '<beacon>';");

/*
 * The same page with the data-availability table taken out.
 *
 * `window.__TEAMS__` is written by build-teams --post out of what the fetches
 * actually returned — `"schedule":false` on a night the league's site was down.
 * That is a real change to a shipped page and it has to fail, but it is not a
 * build config regression, and whoever is reading a red build at 11pm deserves
 * to be told which of the two it is rather than going through vite.config.ts
 * hunting a bug that isn't there.
 */
const withoutTeams = (text) =>
  normalise(text).replace(
    /<script>window\.__TEAMS__=[\s\S]*?<\/script>/,
    '<script>__TEAMS__</script>',
  );

const baseline = JSON.parse(await readFile(join(root, 'scripts/untouched-baseline.json'), 'utf8'));
const problems = [];

const pages = {
  root: 'dist/index.html',
  ysu: 'dist/ysu/index.html',
  vc: 'dist/victorychristian/index.html',
};

for (const [key, file] of Object.entries(pages)) {
  const text = await readFile(join(root, file), 'utf8');
  if (sha(normalise(text)) === baseline[`${key}Lf`]) continue;

  if (sha(withoutTeams(text)) === baseline[`${key}Shell`]) {
    problems.push(
      `${file} changed, and the only difference is its window.__TEAMS__ table — a data ` +
        `fetch failed on this run. The build config did not change.`,
    );
  } else {
    problems.push(`${file} changed — it must not.`);
  }
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
if (urls.length !== baseline.precache) {
  const grew = urls.length > baseline.precache;
  problems.push(
    `precache ${grew ? 'grew' : 'shrank'} from ${baseline.precache} to ${urls.length} entries` +
      (grew
        ? '.'
        : ' — those files leave every installed phone the next time the worker updates.'),
  );
}
if (urls.some((u) => u.startsWith('oh/'))) {
  problems.push('the directory is being precached — globIgnores is not working.');
}
/*
 * The pattern, not the word. A bare /denylist/ test passed against a worker
 * whose denylist had been emptied to `[]`, which is the same as having none at
 * all. What ships reads: {denylist:[/^\/oh\//]}
 */
if (!/denylist:\s*\[\s*\/\^\\\/oh\\\/\/\s*\]/.test(sw)) {
  problems.push(
    'the worker has no /^\\/oh\\// in its navigateFallbackDenylist, so it will answer /oh/ with Poland.',
  );
}
if (!existsSync(join(root, 'dist/oh/index.html'))) {
  problems.push('dist/oh/index.html is missing — the directory build did not run.');
}

/*
 * The denylist keeps the fallback from answering for /oh/; it says nothing
 * about what the fallback answers for everything else. That is this literal,
 * and a workbox upgrade or a config change could point it at some other file
 * without ever touching the denylist this guard already checks.
 */
if (!sw.includes('createHandlerBoundToURL("index.html")')) {
  problems.push(
    'the worker\'s navigation fallback is not bound to "index.html" — Poland no longer ' +
      'has a fallback page, or something else does.',
  );
}

/*
 * The directory's data has to arrive with its page.
 *
 * scripts/build-teams.mjs --pre sweeps public/ for directories that are not a
 * live team, and it deleted all 719 committed files of public/oh the first time
 * it met them. Nothing failed. The build was green, the page loaded, and every
 * school in it was a 404 — which is exactly the shape of bug this guard exists
 * to make impossible.
 */
const index = join(root, 'dist/oh/index.json');
let schoolCount = 0;
if (!existsSync(index)) {
  problems.push('dist/oh/index.json is missing — the directory shipped with no schools.');
} else {
  let parsed;
  let parsedOk = false;
  try {
    parsed = JSON.parse(await readFile(index, 'utf8'));
    parsedOk = true;
  } catch (err) {
    problems.push(`dist/oh/index.json could not be read as JSON: ${err.message}`);
  }

  /*
   * A missing list is a failing build, not a quiet zero.
   *
   * This read `if (schools !== undefined)`, meant to avoid a second complaint
   * when the parse had already failed. What it actually did was let a renamed
   * or dropped `schools` key through in silence, and the guard signed off with
   * "shipped all 0 schools" — a directory with nothing in it, called green. The
   * parse failure reports itself above, so there is nothing left to suppress —
   * and the flag rather than the value, because a file holding the four bytes
   * `null` parses perfectly well and has no schools in it either.
   */
  const schools = parsed?.schools;
  if (parsedOk && (!Array.isArray(schools) || !schools.length)) {
    problems.push('dist/oh/index.json has no usable schools list.');
  } else if (parsedOk) {
    const dataDir = join(root, 'dist/oh/data');
    const files = new Set(
      existsSync(dataDir) ? (await readdir(dataDir)).filter((f) => f.endsWith('.json')) : [],
    );
    const missing = schools.filter((s) => !files.has(`${s.slug}.json`));
    if (missing.length) {
      const names = missing
        .slice(0, 3)
        .map((s) => s.slug)
        .join(', ');
      problems.push(
        `${missing.length} of ${schools.length} schools have no file in dist/oh/data/ ` +
          `(${names}${missing.length > 3 ? ', …' : ''}).`,
      );
    }
    schoolCount = schools.length;
    if (files.size !== schools.length) {
      problems.push(
        `dist/oh/index.json lists ${schools.length} schools but dist/oh/data holds ` +
          `${files.size} files.`,
      );
    }
  }
}

if (problems.length) {
  console.error('\n  Poland regression guard FAILED:');
  for (const p of problems) console.error(`   ! ${p}`);
  process.exit(1);
}
console.log(
  `  Poland, YSU and Victory Christian are unchanged. Precache still ${urls.length} entries, ` +
    `and the directory shipped all ${schoolCount} schools.`,
);
