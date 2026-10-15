/*
 * The marketing page's phone screenshots, taken from the real demo.
 *
 * Real screens rather than drawn ones, because the site's whole claim is "this
 * is what you get" — and so they have to be re-taken when the demo's look
 * changes. Run by hand against a built preview:
 *
 *   npm run build && npx vite preview --port 4173      (in one terminal)
 *   npm i --prefix "$TEMP/shoot" playwright-core       (once)
 *   SHOOT_FROM="$TEMP/shoot" node scripts/shoot-marketing.mjs
 *
 * SHOOT_ORIGIN overrides the default http://localhost:4173 if the preview is
 * served elsewhere. Look at the Schedule picture afterwards: its "Coming up"
 * dates come from the demo's baked calendar, so a picture taken late in a
 * season can look stale. The Stats picture needs the demo's sample stats file,
 * which scripts/build-demo.mjs writes only while football is in season — shot
 * out of season, the demo has no Stats tab and this script stops at it.
 * The screens are taken with the school's own colors on (the app's dark mode),
 * the way Springfield's page looks with them, not the near-white light page.
 *
 * playwright-core is not a dependency of this repo on purpose: the guarded
 * build installs from package-lock.json, and a screenshot tool has no business
 * in it. It drives the Edge or Chrome already on the machine.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'marketing/img');
mkdirSync(out, { recursive: true });

if (!process.env.SHOOT_FROM) throw new Error('set SHOOT_FROM to a folder with playwright-core installed');
const { chromium } = createRequire(join(process.env.SHOOT_FROM, 'package.json'))('playwright-core');

const ORIGIN = process.env.SHOOT_ORIGIN ?? 'http://localhost:4173';
const SIZE = { width: 390, height: 844 };

let browser;
for (const channel of ['msedge', 'chrome']) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch {
    /* try the next one */
  }
}
if (!browser) throw new Error('neither Edge nor Chrome could be started');

// The mode that paints the school's own colors (src/oh/mode.ts calls it dark):
// the screens should show the school's colors, the way Springfield's page looks
// with them on — its peach ground and black type. The light page washes the
// ground nearly to white and loses the brand. Said outright, because the page
// follows the phone's setting and a headless browser reports light.
const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 2, colorScheme: 'dark' });
await page.goto(`${ORIGIN}/oh/demo/`, { waitUntil: 'networkidle' });

const save = async (name) => {
  await page.waitForTimeout(400);
  const png = await page.screenshot();
  await sharp(png).resize(780).webp({ quality: 82 }).toFile(join(out, `${name}.webp`));
  console.log(`  ${name}.webp`);
  return png;
};

await page.getByText('Football', { exact: true }).first().click();
for (const digit of ['2', '4']) {
  await page.getByRole('button', { name: digit, exact: true }).click();
}
const lookup = await save('lookup');

for (const tab of ['Team', 'Schedule', 'League', 'Stats']) {
  await page.getByRole('button', { name: tab, exact: true }).click();
  await save(tab.toLowerCase());
}
await browser.close();

/*
 * The picture a link to the site unfurls with: the Lookup screen on the site's
 * own coal ground, at the size the Open Graph preview wants.
 */
const phone = await sharp(lookup).resize({ height: 560 }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#0C0B09' } })
  .composite([{ input: phone, gravity: 'centre' }])
  .png()
  .toFile(join(out, 'share.png'));
console.log('  share.png');
