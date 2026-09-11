/**
 * The forecast for each paying school's next fixture, fetched once.
 *
 * Poland's Schedule screen has carried the weather at kickoff since it existed,
 * and a school that pays for a page gets the same line on its own next game.
 * The mechanism is deliberately the one Poland uses rather than the obvious
 * one: the forecast is fetched here, in the workflow, and committed — not from
 * the fan's browser.
 *
 * That is not an optimisation. /oh/ is the one surface in this repository with
 * a privacy page promising that reading the site involves nothing that follows
 * you, and a call to Open-Meteo from a phone at a ground would quietly make it
 * untrue: one request per spectator, each carrying an address and a location,
 * to a company nobody standing in the stand has heard of. Fetched here it is
 * one request per school per refresh, from a GitHub runner, and the answer
 * rides into the deploy like every other fact on the page.
 *
 * Everything about this is fail-soft. It writes one file that three schools
 * read a line out of; a weather service having a bad morning must never be the
 * reason a deploy does not happen, so this exits 0 whatever went wrong.
 *
 *   node scripts/paid-weather.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forecastAt } from './lib/forecast.mjs';
// Imported straight out of src/, the way build-teams.mjs imports the iCal
// parser: the kickoff parsing is where this goes wrong quietly, and under src/
// it is code the test suite runs.
import { kickoffAt, nextFixture } from '../src/ohio/kickoff.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const paidFile = join(root, 'paid-schools.json');
const geoFile = join(root, 'public/oh/geo.json');
const weatherFile = join(root, 'public/oh/weather.json');
const seasonFile = (slug) => join(root, `public/oh/data/${slug}.json`);

const read = async (file) => JSON.parse(await readFile(file, 'utf8'));

/** Whatever this run managed to learn; a school it could not is absent. */
const forecasts = {};

/** What was found where a list of slugs should have been, for the log. */
const shapeOf = (v) =>
  v === undefined ? 'missing' : v === null ? 'null' : `a ${typeof v}`;

try {
  /*
   * The paid list, and whether it is a list at all.
   *
   * `{"school":[…]}`, `{"slugs":"strasburg-…"}` and `{}` all parse perfectly
   * well and all yield no slugs, and so does the file not being there. Reading
   * that as "nobody is paying" was a quiet way to lose data: the seller adds a
   * school, fat-fingers the key, pushes — and the next refresh strips the
   * forecast off every paying page while the log reads a wholly plausible
   * "0 of 0 paid schools".
   *
   * So the two are told apart. A real `"slugs": []` is an instruction and is
   * obeyed. Anything else is a file this cannot read, and a file it cannot read
   * gets to change nothing.
   */
  const havePaidFile = existsSync(paidFile);
  const listed = havePaidFile ? (await read(paidFile)).slugs : undefined;
  const usable = Array.isArray(listed);
  const paid = usable ? listed : [];

  if (!usable) {
    console.warn(
      havePaidFile
        ? `! paid-schools.json parsed, but its "slugs" is ${shapeOf(listed)} rather than an ` +
            `array — a mistyped key, most likely. It should read ` +
            `{"slugs":["their-school-theirtown"]}.`
        : '! paid-schools.json is not there.',
    );
    console.warn('  Nothing was written — the forecasts already committed stand.');
  }

  /*
   * The demo page is forecast too. It is not a paying school and must never be
   * written into paid-schools.json, so its slug is read off its own file: the
   * seller's demo shows the kickoff sky the way a paying page does, and a
   * missing demo file is one quiet line, not a failed run.
   */
  const demoFile = join(root, 'public/oh/demo.json');
  let demoSlug = null;
  try {
    const demo = await read(demoFile);
    if (typeof demo.slug === 'string' && demo.slug) {
      demoSlug = demo.slug;
    } else {
      console.log('  · demo file has no slug to forecast for.');
    }
  } catch {
    console.log('  · no demo file to forecast for.');
  }
  const slugs = demoSlug && !paid.includes(demoSlug) ? [...paid, demoSlug] : paid;

  const geo = existsSync(geoFile) ? await read(geoFile) : {};

  for (const slug of slugs) {
    try {
      if (!existsSync(seasonFile(slug))) {
        console.warn(`  ! ${slug}: not a school in the directory.`);
        continue;
      }

      const season = await read(seasonFile(slug));
      const game = nextFixture(season.games ?? []);
      if (!game) {
        console.log(`  · ${slug}: nothing left to play.`);
        continue;
      }

      /*
       * The forecast is for wherever the game is, not wherever the school is.
       * An away game an hour up the road can be raining while home is dry, and
       * the directory names the opponent's town on every fixture — so use it,
       * falling back to the school's own town when the opponent is one of the
       * few with no point on the map (an out-of-state side, most often).
       */
      const at = (game.home ? null : geo[game.opponentSlug]) ?? geo[slug];
      if (!at) {
        console.warn(`  ! ${slug}: no coordinates — run scripts/geocode-schools.mjs.`);
        continue;
      }

      const weather = await forecastAt({ lat: at.lat, lon: at.lon, at: kickoffAt(game) });
      if (!weather) {
        console.log(`  · ${slug}: ${game.date} is beyond the forecast.`);
        continue;
      }

      // The fixture's date travels with the forecast. The page draws it on the
      // fixture that names the same day and on no other, so a file left behind
      // by a refresh that could not run cannot put last week's weather on this
      // week's game.
      forecasts[slug] = { ...weather, date: game.date };
      console.log(
        `  ✓ ${slug}: ${weather.tempF}°F, ${weather.precipChance}% rain, ` +
          `${weather.windMph}mph wind at ${game.opponent}, ${game.date}`,
      );
    } catch (err) {
      // One school's bad morning is one school's missing line, not the file's.
      console.warn(`  ! ${slug}: no forecast (${err.message}).`);
    }
  }

  /*
   * A run that learned nothing does not get to erase a run that did.
   *
   * Every school failing at once is what an outage looks like from here, and
   * overwriting the file with {} would strip the forecast off pages that had a
   * perfectly good one an hour ago. What is already there stays until a run
   * has something to replace it with — and it cannot go stale on screen,
   * because each entry names the date it is for. A paid list that is genuinely
   * empty is a different thing and does clear the file; a list this could not
   * read is not an empty one, and was said so above.
   */
  const kept = existsSync(weatherFile) ? await read(weatherFile) : {};
  if (!usable) {
    // Already explained, in more detail than a second line here could add.
  } else if (!Object.keys(forecasts).length && paid.length && Object.keys(kept).length) {
    console.warn('  ! nothing came back — keeping the forecasts already committed.');
  } else {
    /*
     * And a school that failed on its own keeps the forecast it had.
     *
     * The guard above only catches an outage that took everybody down at once.
     * Two schools answering and a third timing out is far likelier, and writing
     * only what this run learned would strip the line off that third page for
     * six hours over one bad request. So the file starts as what is already
     * committed and this run is written over the top of it — restricted to the
     * schools still on the paid list, because a school that stopped paying
     * should lose its line and would otherwise be carried forward for ever.
     *
     * Nothing here can go stale on screen: every entry names the fixture date
     * it is for, and the page draws a forecast on the fixture that names the
     * same day and on no other.
     */
    const out = {};
    for (const slug of slugs) if (kept[slug]) out[slug] = kept[slug];
    Object.assign(out, forecasts);

    await writeFile(weatherFile, `${JSON.stringify(out)}\n`);
    console.log(`weather.json: ${Object.keys(forecasts).length} of ${slugs.length} schools (${paid.length} paid).`);
    const carried = Object.keys(out).length - Object.keys(forecasts).length;
    if (carried) console.log(`  · ${carried} kept from an earlier run.`);
  }
} catch (err) {
  // The whole pass failing is still not a reason to fail a deploy. Poland's
  // pages, the directory and every free school page are unaffected by this
  // file not existing at all.
  console.warn(`! the paid weather pass did not run (${err.message}).`);
}
