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
        // jpg covers each team's badge.jpg, which is the page background. Left
        // out of the precache the app comes up bare with no signal, which is
        // the one condition it exists to survive. png covers the icon sets.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2}'],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
