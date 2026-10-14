/*
 * What a paying school's page installs as: its name, its crest, its colors.
 *
 * /oh/ has no app manifest of its own, deliberately — it is a directory of 717
 * schools, and "Add to Home Screen" on it used to save a grey letter that
 * opened the school picker. A school that pays gets better: for each slug in
 * paid-schools.json this writes public/oh/apps/<slug>/ — a manifest that
 * names the school and opens straight onto its page, and icons cut from the
 * crest the seller uploaded, on the school's own ground. The page links them
 * in once it knows the school is live (src/oh/install.ts).
 *
 * The crest lives in the database, not the repository, so this asks for it —
 * through school_roster_sports, the same public door the fan page uses, which
 * answers only for a school that is published and paid. It runs at the start
 * of every build, and the six-hourly rebuild means a crest changed in the
 * panel reaches the home-screen icon the same day. The files are not
 * committed (public/oh/apps/ is ignored): they are rebuilt from the database
 * every time, so there is nothing to go stale.
 *
 * It is fail-soft, like the forecast: an icon is not a reason for a deploy not
 * to happen. Whatever goes wrong, this exits 0 and the page installs as it did.
 *
 *   node scripts/paid-apps.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/oh/apps');

/* The build has these in its environment; a laptop has them in .env.local. */
const env = (name) => {
  if (process.env[name]) return process.env[name];
  const file = join(root, '.env.local');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() || undefined;
};

const HEX = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The crest on the school's own ground, with room round it for a phone's mask. */
async function icon(crest, ground, size, padding) {
  const inner = Math.round(size * (1 - 2 * padding));
  const art = crest
    ? await sharp(crest).resize(inner, inner, { fit: 'contain', background: ground }).png().toBuffer()
    : null;
  return sharp({ create: { width: size, height: size, channels: 3, background: ground } })
    .composite(art ? [{ input: art, gravity: 'center' }] : [])
    .png()
    .toBuffer();
}

/** No crest uploaded: the school's initial in its accent, so it is still its own. */
const monogram = (name, accent, ground) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
       <rect width="512" height="512" fill="${ground}"/>
       <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
             font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="300"
             fill="${accent}">${(name.trim()[0] ?? '?').toUpperCase().replace(/[<&>]/g, '')}</text>
     </svg>`,
  );

async function main() {
  const base = env('VITE_SUPABASE_URL');
  const key = env('VITE_SUPABASE_ANON_KEY');
  if (!base || !key) {
    console.log('paid-apps: no Supabase settings here — schools install as the plain page');
    return;
  }

  const slugs = JSON.parse(readFileSync(join(root, 'paid-schools.json'), 'utf8')).slugs ?? [];
  const index = JSON.parse(readFileSync(join(root, 'public/oh/index.json'), 'utf8')).schools ?? [];

  for (const slug of slugs) {
    if (typeof slug !== 'string' || !SLUG.test(slug)) continue;
    try {
      const res = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/rpc/school_roster_sports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ p_slug: slug }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`${res.status} from the database`);
      const identity = await res.json();
      if (!identity || !Array.isArray(identity.sports) || identity.sports.length === 0) {
        console.log(`paid-apps: ${slug} is not live — no app`);
        continue;
      }

      const ground = HEX.test(identity.colors?.ground ?? '') ? identity.colors.ground : '#04043a';
      const accent = HEX.test(identity.colors?.accent ?? '') ? identity.colors.accent : '#4fbaf7';
      const logo = identity.theme?.logo;
      const crest =
        typeof logo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(logo)
          ? Buffer.from(logo.slice(logo.indexOf(',') + 1), 'base64')
          : null;
      const school = index.find((s) => s.slug === slug);
      const name = school?.name ?? slug;
      const art = crest ?? (await sharp(monogram(name, accent, ground)).png().toBuffer());

      const dir = join(outDir, slug);
      mkdirSync(dir, { recursive: true });
      // "any" icons fill the square; the maskable one keeps the crest inside the
      // circle Android may cut it to, and the iPhone's gets a little room too.
      writeFileSync(join(dir, 'icon-192.png'), await icon(art, ground, 192, 0.06));
      writeFileSync(join(dir, 'icon-512.png'), await icon(art, ground, 512, 0.06));
      writeFileSync(join(dir, 'icon-maskable-512.png'), await icon(art, ground, 512, 0.16));
      writeFileSync(join(dir, 'apple-touch-icon.png'), await icon(art, ground, 180, 0.08));
      writeFileSync(
        join(dir, 'manifest.webmanifest'),
        JSON.stringify(
          {
            // One id per school, so two schools installed on one phone are two apps.
            id: `/oh/?school=${slug}`,
            name,
            short_name: name.length > 12 ? name.split(/\s+/)[0] : name,
            description: `${name}${school?.city ? ` (${school.city})` : ''} — rosters, schedule and scores`,
            start_url: `/oh/?school=${slug}`,
            scope: '/oh/',
            display: 'standalone',
            background_color: ground,
            theme_color: ground,
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          null,
          1,
        ),
      );
      console.log(`paid-apps: ${slug} — ${crest ? 'crest' : 'monogram'} icons and a manifest`);
    } catch (err) {
      console.log(`paid-apps: ${slug} skipped — ${err.message}`);
    }
  }
}

await main().catch((err) => console.log(`paid-apps: ${err.message} — schools install as the plain page`));
