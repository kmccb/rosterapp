import { readFileSync } from 'node:fs';
import { build, type Rolldown } from 'vite';

/*
 * The Edge Function runs a committed bundle of src/sync, because Deno can't
 * resolve this repo's extensionless imports. A bundle that wasn't rebuilt
 * after a change here would run yesterday's rules in production while every
 * test passed — so the test rebuilds it in memory and compares.
 */
it('supabase/functions/sync-sources/lib/core.js is built from the current src/sync', async () => {
  const out = await build({ configFile: 'vite.sync.config.ts', logLevel: 'silent', build: { write: false } });
  const result = (Array.isArray(out) ? out[0] : out) as Rolldown.RolldownOutput;
  const fresh = result.output[0].type === 'chunk' ? result.output[0].code : '';
  const committed = readFileSync('supabase/functions/sync-sources/lib/core.js', 'utf8');
  expect(committed.replace(/\r\n/g, '\n')).toBe(fresh.replace(/\r\n/g, '\n'));
}, 60_000);
