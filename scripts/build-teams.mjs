/**
 * Gives every team in teams/ its own page on the same site.
 *
 * One team is the root — the original, whose installed apps and links already
 * point at `/`. The rest get `/<slug>/`, each with its own manifest, icon set
 * and badge, so adding a home screen shortcut from that page produces that
 * team's crest and name rather than the site's. That is the one piece of
 * branding a runtime upload can never reach, because the OS reads it at install
 * time from files that have to exist on disk.
 *
 * Runs in two passes around the Vite build, and the split matters:
 *
 *   --pre   writes the icons, badges and manifests into public/, so Vite copies
 *           them into the build and the service worker precaches them. Skipping
 *           this and writing them afterwards leaves the wallpaper out of the
 *           precache, and the app comes up bare with no signal — which is the
 *           one condition it exists to survive.
 *
 *   --post  writes each team's index.html, which can only happen afterwards
 *           because it has to reference the hashed asset names Vite produced.
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paletteFor, writeIcons, writeWallpaper } from './lib/badge.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const teamsDir = join(root, 'teams');
const publicDir = join(root, 'public');
const dist = join(root, 'dist');

const phase = process.argv.includes('--post') ? 'post' : 'pre';

const readTeams = async () => {
  const slugs = (await readdir(teamsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const teams = [];
  for (const slug of slugs) {
    const config = JSON.parse(await readFile(join(teamsDir, slug, 'team.json'), 'utf8'));
    const logo = ['logo.jpg', 'logo.png', 'logo.jpeg']
      .map((f) => join(teamsDir, slug, f))
      .find((p) => existsSync(p));
    if (!logo) throw new Error(`teams/${slug} has no logo.jpg or logo.png`);
    teams.push({ slug, logo, base: config.root ? '/' : `/${slug}/`, ...config });
  }

  const roots = teams.filter((t) => t.root);
  if (roots.length !== 1) {
    throw new Error(`Exactly one team must have "root": true — found ${roots.length}`);
  }
  return teams;
};

const manifestFor = (team, palette) => ({
  name: team.name,
  short_name: team.short ?? team.name,
  description: 'Type a jersey number, see the player.',
  start_url: team.base,
  scope: team.base,
  display: 'standalone',
  orientation: 'portrait',
  lang: 'en',
  background_color: palette.ground,
  theme_color: palette.ground,
  icons: [
    { src: `${team.base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${team.base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
    {
      src: `${team.base}icons/icon-512-maskable.png`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
});

/**
 * The built page, rewritten for one team.
 *
 * The icon and manifest links stay relative, so `/eagles/index.html` resolves
 * them to `/eagles/...` on its own — no rewriting, and nothing to get wrong
 * when a link is added. Only the things a browser can't infer are changed: the
 * name, the theme colour, and the palette inlined so the first paint is already
 * in the team's colours instead of flashing the site's and correcting itself.
 */
const pageFor = (html, team, palette) => {
  const baked = {
    slug: team.slug,
    name: team.name,
    palette,
    wallpaper: `${team.base}badge.jpg`,
  };

  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${team.name}</title>`)
    .replace(
      /<meta name="theme-color" content="[^"]*"\s*\/?>/,
      `<meta name="theme-color" content="${palette.ground}" />`,
    )
    .replace(
      /<meta name="apple-mobile-web-app-title" content="[^"]*"\s*\/?>/,
      `<meta name="apple-mobile-web-app-title" content="${team.short ?? team.name}" />`,
    )
    .replace('</head>', `  <script>window.__TEAM__=${JSON.stringify(baked)}</script>\n  </head>`);
};

const teams = await readTeams();

if (phase === 'pre') {
  for (const team of teams) {
    const out = team.root ? publicDir : join(publicDir, team.slug);
    // Cleared first so a renamed or removed team doesn't leave orphans behind
    // in the build.
    if (!team.root) await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });

    const palette = await paletteFor(team.logo, team.palette);
    const { artFraction } = await writeIcons(team.logo, join(out, 'icons'));
    const bytes = await writeWallpaper(team.logo, join(out, 'badge.jpg'));
    await writeFile(join(out, 'manifest.webmanifest'), JSON.stringify(manifestFor(team, palette)));

    console.log(
      `${team.base.padEnd(10)} ${team.name.padEnd(16)} ground ${palette.ground} ` +
        `accent ${palette.accent}  badge ${(bytes / 1024).toFixed(0)}kB` +
        `${team.palette ? '  (palette pinned)' : ''}`,
    );

    if (artFraction > 0.72) {
      console.warn(
        `  ! ${team.slug}: the artwork fills ${(artFraction * 100).toFixed(0)}% of the maskable ` +
          `icon, so a round mask may clip it. Leave more margin around the badge.`,
      );
    }
  }
  console.log(`\n${teams.length} teams staged.`);
} else {
  const builtIndex = await readFile(join(dist, 'index.html'), 'utf8');

  for (const team of teams) {
    const palette = await paletteFor(team.logo, team.palette);
    const out = team.root ? dist : join(dist, team.slug);
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'index.html'), pageFor(builtIndex, team, palette));
  }
  console.log(`${teams.length} team pages written.`);
}
