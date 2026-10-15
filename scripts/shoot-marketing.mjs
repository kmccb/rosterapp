/*
 * The marketing page's phone screenshots, taken from the real demo.
 *
 * Real screens rather than drawn ones, because the site's whole claim is "this
 * is what you get" — and so they have to be re-taken when the demo's look
 * changes. Run by hand against a built preview:
 *
 *   npm run build && npx vite preview --port 4173      (in one terminal)
 *   npm i --prefix "$TEMP/shoot" playwright-core @fontsource-variable/inter   (once)
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
 * Each picture is a whole iPhone screen, not a browser window: the page is
 * shot at the height an iPhone 15 leaves it once the status bar and the home
 * indicator have taken theirs, and those two are then painted back on — the
 * time, signal, Wi-Fi and battery, the Dynamic Island, the home bar — in the
 * page's own edge colors, the way the installed app sits on a real phone. The
 * hardware around the screen (the titanium band, the bezel, the buttons) is
 * drawn by marketing/site.css, so the pictures stay plain screens.
 *
 * The page is set in Inter for the shot. The app asks for system-ui, which on
 * an iPhone is San Francisco; Inter is the nearest face that can be shipped,
 * and it keeps the pictures from showing Segoe UI or DejaVu, which no family
 * opening the link on a phone would ever see. The crest's Anton is left alone.
 *
 * playwright-core is not a dependency of this repo on purpose: the guarded
 * build installs from package-lock.json, and a screenshot tool has no business
 * in it. It drives the Edge or Chrome already on the machine, and falls back
 * to Playwright's own Chromium where neither is installed.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'marketing/img');
mkdirSync(out, { recursive: true });

if (!process.env.SHOOT_FROM) throw new Error('set SHOOT_FROM to a folder with playwright-core installed');
const need = createRequire(join(process.env.SHOOT_FROM, 'package.json'));
const { chromium } = need('playwright-core');
const inter = readFileSync(need.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')).toString('base64');

const ORIGIN = process.env.SHOOT_ORIGIN ?? 'http://localhost:4173';

// An iPhone 15, in points: the screen, and what the status bar and the home
// indicator keep of it. The page gets the height between them.
const PHONE = { width: 393, height: 852, top: 59, bottom: 34 };
const SCALE = 3;
const PAGE = { width: PHONE.width, height: PHONE.height - PHONE.top - PHONE.bottom };

let browser;
for (const channel of ['msedge', 'chrome', undefined]) {
  try {
    browser = await chromium.launch(channel ? { channel } : {});
    break;
  } catch {
    /* try the next one */
  }
}
if (!browser) throw new Error('neither Edge, Chrome nor Playwright’s Chromium could be started');

const fontFace = `@font-face{font-family:'Inter';src:url(data:font/woff2;base64,${inter}) format('woff2');font-weight:100 900;font-display:block}`;

// The mode that paints the school's own colors (src/oh/mode.ts calls it dark):
// the screens should show the school's colors, the way Springfield's page looks
// with them on — its peach ground and black type. The light page washes the
// ground nearly to white and loses the brand. Said outright, because the page
// follows the phone's setting and a headless browser reports light.
const page = await browser.newPage({ viewport: PAGE, deviceScaleFactor: SCALE, colorScheme: 'dark' });
await page.goto(`${ORIGIN}/oh/demo/`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: fontFace });

// Every element that isn't set in the crest's display face takes Inter. Done
// per element rather than with one rule, because the app sets its fonts on
// classes deep in the page and a tab change paints new ones.
const iphoneType = () =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('body, body *')) {
      if (!getComputedStyle(el).fontFamily.includes('Anton')) {
        el.style.setProperty('font-family', "'Inter', system-ui, sans-serif", 'important');
      }
    }
  });

// The colour of a strip of rows, averaged, as a CSS rgb().
const edge = async (png, fromTop) => {
  const img = sharp(png);
  const { width, height } = await img.metadata();
  const rows = 4 * SCALE;
  const { channels } = await sharp(png)
    .extract({ left: 0, top: fromTop ? 0 : height - rows, width, height: rows })
    .stats();
  const [r, g, b] = channels.map((c) => Math.round(c.mean));
  return { css: `rgb(${r},${g},${b})`, light: 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 };
};

// The status bar and home bar, drawn as an iPhone draws them over an app.
const frame = await browser.newPage({ viewport: PHONE, deviceScaleFactor: SCALE });
const onPhone = async (png) => {
  const top = await edge(png, true);
  const bottom = await edge(png, false);
  const ink = top.light ? '#000' : '#fff';
  const bar = bottom.light ? 'rgba(0,0,0,.88)' : 'rgba(255,255,255,.9)';
  await frame.setContent(`<!doctype html><html><head><style>
    ${fontFace}
    *{margin:0;box-sizing:border-box}
    body{width:${PHONE.width}px;height:${PHONE.height}px;position:relative;overflow:hidden;
      background:linear-gradient(${top.css} 0 50%, ${bottom.css} 50% 100%);font-family:Inter,sans-serif}
    .shot{position:absolute;left:0;top:${PHONE.top}px;width:${PAGE.width}px;height:${PAGE.height}px;display:block}
    .time{position:absolute;top:19px;left:0;width:133px;text-align:center;color:${ink};
      font:600 17px/22px Inter;letter-spacing:-.02em;font-feature-settings:'tnum'}
    .island{position:absolute;top:11px;left:50%;width:126px;height:37px;margin-left:-63px;border-radius:19px;background:#000}
    .icons{position:absolute;top:23px;right:26px;display:flex;align-items:center;gap:6px;color:${ink}}
    .home{position:absolute;bottom:8px;left:50%;width:139px;height:5px;margin-left:-69.5px;border-radius:3px;background:${bar}}
  </style></head><body>
    <img class="shot" src="data:image/png;base64,${png.toString('base64')}">
    <div class="time">9:41</div>
    <div class="island"></div>
    <div class="icons">
      <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.6c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .8C5.2.8 2.7 1.9.8 3.7L2 5c1.6-1.5 3.7-2.4 6-2.4Z"/><path d="M8 6.1c1.3 0 2.5.5 3.5 1.3l1.2-1.3A7 7 0 0 0 8 4.3a7 7 0 0 0-4.7 1.8l1.2 1.3c1-.8 2.2-1.3 3.5-1.3Z"/><path d="M8 9.4c.4 0 .8.2 1.1.4L8 11.2 6.9 9.8c.3-.2.7-.4 1.1-.4Z"/><path d="M8 7.9c.8 0 1.6.3 2.2.8L9.1 9.9A1.7 1.7 0 0 0 8 9.5c-.4 0-.8.1-1.1.4L5.8 8.7c.6-.5 1.4-.8 2.2-.8Z"/></svg>
      <svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x=".5" y=".5" width="23" height="12" rx="3.8" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" fill="currentColor" opacity=".45"/></svg>
    </div>
    <div class="home"></div>
  </body></html>`);
  await frame.waitForLoadState('load');
  await frame.evaluate(() => document.fonts.ready);
  return frame.screenshot();
};

const save = async (name) => {
  await iphoneType();
  await page.waitForTimeout(400);
  const screen = await onPhone(await page.screenshot());
  // Two pixels to the point: sharp on a retina laptop, light on a phone's data.
  await sharp(screen).resize(PHONE.width * 2).webp({ quality: 84 }).toFile(join(out, `${name}.webp`));
  console.log(`  ${name}.webp`);
  return screen;
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

/*
 * The picture a link to the site unfurls with: the Lookup screen in the same
 * iPhone the page draws, on the site's own coal ground, at the size the Open
 * Graph preview wants. The frame here repeats .device in marketing/site.css.
 */
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.setContent(`<!doctype html><html><head><style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;display:grid;place-items:center;
    background:radial-gradient(60% 80% at 50% 100%, rgba(232,93,47,.22), transparent 70%), #0c0b09}
  .device{position:relative;width:262px;padding:4px;border-radius:44px;
    background:linear-gradient(140deg,#9a948c,#e4dfd7 18%,#6e6a64 45%,#c9c3ba 75%,#7c7770);
    box-shadow:0 30px 60px -18px rgba(0,0,0,.7),0 60px 120px -40px rgba(232,93,47,.35)}
  .bezel{padding:7px;border-radius:40px;background:#050505;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
  img{display:block;width:100%;border-radius:33px}
</style></head><body>
  <div class="device"><div class="bezel"><img src="data:image/png;base64,${lookup.toString('base64')}"></div></div>
</body></html>`);
await card.waitForLoadState('load');
await sharp(await card.screenshot()).png().toFile(join(out, 'share.png'));
console.log('  share.png');

await browser.close();
