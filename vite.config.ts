import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
