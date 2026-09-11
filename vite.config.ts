import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Each team writes its own manifest in scripts/build-teams.mjs, so the
      // plugin must not generate a competing one at the root.
      manifest: false,
      workbox: {
        // Every extension here earns its place. jpg is each team's badge.jpg,
        // the page background. png is the icon sets. json is schedule.json, and
        // webmanifest each team's manifest. Anything left out of this list is
        // missing with no signal, which is the one condition the app exists to
        // survive — the wallpaper and then the schedule were each lost that way.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2,json,webmanifest}'],
        /*
         * The state is not part of anybody's home screen app. Seven hundred
         * school files match the json pattern above and would otherwise be
         * downloaded onto every installed phone the next time the worker
         * updated.
         *
         * The whole of oh/ is excluded rather than just its data, because the
         * directory's page and bundle are no more Poland's business than its
         * data is. They are built after this manifest is written, so they are
         * out of reach anyway — this is what keeps that true if the build order
         * ever changes.
         */
        globIgnores: ['**/oh/**'],
        /*
         * The fallback is bound to Poland's index.html and answers every
         * navigation from the precache. Without this the directory is served
         * Poland's shell — and because bakedTeam() falls back to the root team
         * for an unrecognised path, it would come up wearing Poland's colours.
         *
         * Bare /oh is in the pattern because somebody will always type it:
         * with only /^\/oh\//, the worker answered the slashless form with
         * Poland's empty-roster screen asking for a share code. Let through
         * to the network, the host redirects /oh to /oh/ itself.
         */
        navigateFallbackDenylist: [/^\/oh(\/|$)/],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
