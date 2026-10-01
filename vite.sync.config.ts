import { defineConfig } from 'vite';

/**
 * src/sync bundled for the sync-sources Edge Function.
 *
 * Deno can't follow this repo's extensionless imports, so the pure sync code
 * is bundled into one plain ES module the function imports. Unminified, so a
 * stack trace in the Supabase logs points at readable code. publicDir is off
 * or the build would copy all of public/ — seven hundred school files — next
 * to it.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'supabase/functions/sync-sources/lib',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    lib: {
      entry: 'src/sync/core.ts',
      formats: ['es'],
      fileName: () => 'core.js',
    },
  },
});
