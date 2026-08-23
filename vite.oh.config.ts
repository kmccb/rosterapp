import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The Ohio directory is built on its own, in a second pass after the main one.
 *
 * The obvious version — adding oh/index.html as a second input to the same
 * build — was tried and rejected on the evidence. Rollup saw two entries
 * sharing React, hoisted it into a chunk of its own, and Poland's bundle came
 * out as `main-*.js` plus `jsx-runtime-*.js` where it had been a single
 * `index-*.js`. Every one of the three shipped pages changed, which on an
 * installed phone means a full re-download of a restructured app for a feature
 * its owner never asked for. The directory's own bundle also landed in
 * dist/assets/, inside the root worker's precache, where no path-based ignore
 * could reach it.
 *
 * Building separately makes all of that impossible rather than unlikely: the
 * main build cannot see this one, and this one runs after the service worker's
 * precache manifest has already been written.
 *
 * Everything the directory emits lives under dist/oh/, which is what
 * globIgnores in vite.config.ts excludes and what the root worker's
 * navigateFallbackDenylist refuses to answer.
 */
export default defineConfig({
  base: '/',
  plugins: [react()],
  // public/ belongs to the main build, which has already copied it — including
  // public/oh. Copying it a second time would rewrite 700 files for nothing.
  publicDir: false,
  build: {
    outDir: 'dist',
    // The main build empties dist and writes the worker; this one adds to what
    // is already there.
    emptyOutDir: false,
    assetsDir: 'oh/assets',
    rollupOptions: {
      // Relative to the project root, so the page is emitted at dist/oh/index.html.
      input: 'oh/index.html',
    },
  },
});
