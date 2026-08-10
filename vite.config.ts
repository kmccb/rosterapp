import { readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/*
 * Each team's page is written after the build, because it has to name the
 * hashed assets Vite produced — which is too late for the glob that builds the
 * precache. Listed here by hand so those pages are cached like any other, and
 * a team's app opens with no signal instead of showing the browser's error.
 *
 * The revision changes every deploy, so a rebuilt page is picked up rather
 * than served from the previous one forever.
 */
const teamPages = readdirSync('teams', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({ url: `${d.name}/index.html`, revision: process.env.GITHUB_SHA ?? `${Date.now()}` }));

// Served from the custom domain in public/CNAME, so the site lives at the root.
// If you ever drop the custom domain, this has to go back to '/rosterapp/' to
// match the github.io project-pages subpath.
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
        additionalManifestEntries: teamPages,
        /*
         * Every team shares this origin, so without this the fallback answered
         * a navigation to /victorychristian/ with the ROOT team's shell: its
         * badge, its name, its schedule tab, on somebody else's roster. Team
         * pages are real files and are precached above, so let them be fetched
         * as themselves. Matches any path inside a directory, which is exactly
         * the set of non-root teams, and never `/` or `/index.html`.
         */
        navigateFallbackDenylist: [/^\/[^/]+\//],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
