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
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEspnRoster, fetchEspnSeasons } from './lib/espn.mjs';
import { fetchLeague } from './lib/ohio.mjs';
import { paletteFor, writeIcons, writeWallpaper } from './lib/badge.mjs';
import { parseIcal, nextGame, canonicalOpponent } from '../src/schedule/icalParse.ts';
import { mergeResults, seasonRecord } from '../src/schedule/mergeResults.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const teamsDir = join(root, 'teams');
const publicDir = join(root, 'public');
const cacheDir = join(root, '.cache');
const dist = join(root, 'dist');

const phase = process.argv.includes('--post') ? 'post' : 'pre';

/**
 * A crest that lives somewhere else.
 *
 * The icons have to exist as files — the OS reads them off disk when a home
 * screen shortcut is made — but a university's mark is not ours to commit to a
 * public repository. So it is fetched at build time into an ignored directory,
 * and kept there so a build without a connection still has one.
 */
const cachedLogo = async (slug, url) => {
  const file = join(cacheDir, `${slug}${extname(new URL(url).pathname) || '.png'}`);
  if (existsSync(file)) return file;

  await mkdir(cacheDir, { recursive: true });
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${slug}: could not fetch the logo (HTTP ${res.status})`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`           fetched ${slug} logo from ${new URL(url).host}`);
  return file;
};

const readTeams = async () => {
  const slugs = (await readdir(teamsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const teams = [];
  for (const slug of slugs) {
    const config = JSON.parse(await readFile(join(teamsDir, slug, 'team.json'), 'utf8'));
    const logo =
      ['logo.jpg', 'logo.png', 'logo.jpeg']
        .map((f) => join(teamsDir, slug, f))
        .find((p) => existsSync(p)) ?? (config.logoUrl ? await cachedLogo(slug, config.logoUrl) : null);
    if (!logo) throw new Error(`teams/${slug} has no logo.jpg, logo.png or logoUrl`);
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
 *
 * Every page carries the whole table, not just its own team, because the
 * service worker serves navigations from its precache and what it holds is the
 * root team's shell. A page that knew only itself came up as the wrong team the
 * moment the worker answered; with the table, the app reads the address and is
 * right whichever shell arrives.
 */
const pageFor = (html, teams, team, palette) =>
  html
    .replace(/<title>[^<]*<\/title>/, `<title>${team.name}</title>`)
    .replace(
      /<meta name="theme-color" content="[^"]*"\s*\/?>/,
      `<meta name="theme-color" content="${palette.ground}" />`,
    )
    .replace(
      /<meta name="apple-mobile-web-app-title" content="[^"]*"\s*\/?>/,
      `<meta name="apple-mobile-web-app-title" content="${team.short ?? team.name}" />`,
    )
    .replace(
      '</head>',
      `  <script>window.__TEAMS__=${JSON.stringify(teams)}</script>\n  </head>`,
    );

/**
 * The squad, for a team whose roster is already public.
 *
 * A high school roster belongs to the coach who typed it in and travels by
 * share code. A college roster is published, so it is baked in and the whole
 * apparatus of codes and setup screens simply doesn't apply to that team.
 *
 * A fetch that fails leaves the previous one in place, for the same reason the
 * schedule does: a stale roster is worth more than none.
 */
async function writeRoster(team, out) {
  if (!team.espn) return;
  try {
    const roster = await fetchEspnRoster(team.espn);
    await writeFile(join(out, 'roster.json'), JSON.stringify(roster));
    console.log(
      `           roster   ${roster.players.length} players, ` +
        `${roster.players.filter((p) => p.photo).length} with a photograph, ` +
        `${roster.players.filter((p) => p.lines.length).length} with numbers`,
    );
  } catch (err) {
    console.warn(`  ! ${team.slug}: could not read the roster (${err.message}).`);
  }
}

/**
 * Every season the record goes back to.
 *
 * Fetched rather than committed: these are somebody else's compilation, and
 * they are cheap enough to ask for. Two dozen seasons, four requests at a
 * time, on a build that already runs every six hours.
 */
async function writeSeasons(team, out) {
  if (!team.espn) return;
  try {
    const from = team.seasonsFrom ?? 2004;
    const seasons = await fetchEspnSeasons(team.espn, from, new Date().getFullYear());
    if (!seasons.length) return;

    /*
     * Player rows come from a committed file rather than from this build.
     * Splitting a player's career by season costs one request each and there
     * are 780 of them across two decades — see scripts/fetch-players.mjs, and
     * the bug that made it necessary.
     */
    const file = join(teamsDir, team.slug, 'players.json');
    const byYear = existsSync(file)
      ? (JSON.parse(await readFile(file, 'utf8')).seasons ?? {})
      : {};
    for (const season of seasons) {
      season.players = (byYear[String(season.year)] ?? []).map((p) => ({
        name: p.name,
        number: p.n,
        position: p.pos,
        lines: (p.s ?? []).map(([label, value]) => ({ label, value })),
      }));
    }
    await writeFile(join(out, 'seasons.json'), JSON.stringify({ seasons }));
    console.log(
      `           seasons  ${seasons.length} (${seasons[seasons.length - 1].year}–${seasons[0].year}), ` +
        `${seasons.reduce((n, s) => n + s.categories.reduce((m, c) => m + c.stats.length, 0), 0)} team figures, ` +
        `${seasons.reduce((n, s) => n + s.players.length, 0)} player seasons`,
    );
  } catch (err) {
    console.warn(`  ! ${team.slug}: could not read the season history (${err.message}).`);
  }
}

/**
 * The forecast for the next kickoff.
 *
 * Open-Meteo needs no key and no account. It happens here rather than on each
 * phone for the same reasons the schedule does: it lands in the precache and so
 * survives a ground with no signal, it costs one request every few hours rather
 * than one per spectator, and nobody has to announce themselves to a weather
 * service to find out whether to bring a coat.
 *
 * Only the next game gets one. Anything further out is a guess dressed up as a
 * fact, and the rebuild will reach it in time.
 */
async function forecastFor(team, games) {
  // Scrimmages are not shown any more, so the card the forecast sits on is
  // never one — in early August this was fetching the weather for a game
  // nobody would see.
  const at = team.location && nextGame(games.filter((g) => !g.scrimmage));
  if (!at?.kickoff) return undefined;

  const kickoff = Math.floor(new Date(at.kickoff).getTime() / 1000);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${team.location.lat}` +
    `&longitude=${team.location.lon}` +
    `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code,is_day` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timeformat=unixtime&forecast_days=16`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { hourly } = await res.json();

    // The forecast is hourly and kickoff is not on the hour, so take the
    // closest one — and give up rather than guess if the game is beyond range.
    let best = -1;
    let gap = Infinity;
    hourly.time.forEach((t, i) => {
      const d = Math.abs(t - kickoff);
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    if (best < 0 || gap > 3600 * 2) return undefined;

    const weather = {
      code: hourly.weather_code[best],
      tempF: Math.round(hourly.temperature_2m[best]),
      precipChance: Math.round(hourly.precipitation_probability[best] ?? 0),
      windMph: Math.round(hourly.wind_speed_10m[best]),
      day: hourly.is_day[best] === 1,
      at: new Date(hourly.time[best] * 1000).toISOString(),
    };
    console.log(
      `           weather  ${weather.tempF}°F, ${weather.precipChance}% rain, ` +
        `${weather.windMph}mph wind at ${at.opponent}`,
    );
    return weather;
  } catch (err) {
    // A schedule without a forecast is the thing this screen is actually for.
    console.warn(`  ! ${team.slug}: no forecast (${err.message}).`);
    return undefined;
  }
}

/**
 * The scores, put onto the season.
 *
 * The calendar feed publishes fixtures and only fixtures — no result has ever
 * appeared in one — so left alone the Schedule tab shows a season nobody has
 * played and a record stuck on 0-0. joeeitel has the scores and the League tab
 * already fetches them, so they are merged onto the schedule rather than
 * scraped a second time.
 *
 * This runs after the league block rather than inside writeSchedule, and reads
 * both files back off disk, for two reasons. The block above has careful
 * all-or-nothing fallback logic — republish yesterday rather than blank a
 * working table — and threading league data forward into writeSchedule would
 * mean rearranging it. And reading the file it actually wrote means a
 * republished stale copy still supplies scores, which is what we want: last
 * week's results beat none.
 *
 * Best-effort throughout. A team with no league gets nothing done to it, and a
 * failure here leaves the schedule exactly as writeSchedule left it.
 */
async function applyResults(team, out) {
  if (!team.league) return;

  const scheduleFile = join(out, 'schedule.json');
  const leagueFile = join(out, 'league.json');
  if (!existsSync(scheduleFile) || !existsSync(leagueFile)) return;

  try {
    const season = JSON.parse(await readFile(scheduleFile, 'utf8'));
    const league = JSON.parse(await readFile(leagueFile, 'utf8'));
    if (!season.games?.length || !league.games?.length || !league.team) return;

    const before = season.games.filter((g) => g.result).length;
    const games = mergeResults(season.games, league.games, league.team, team.opponentAliases ?? {});
    const record = seasonRecord(games);

    /*
     * The forecast is for whichever game is next, so it has to be redone if
     * this merge moved it — and only then. Usually it does not: a game is
     * counted as played once enough time has passed for it to be over, so the
     * fixture had already dropped off before its score arrived. The case that
     * does move it is a fixture the two sources date differently, and that is
     * rare enough not to be worth a second call to the forecast on every
     * build.
     */
    // Scrimmages excluded on both sides, to match what forecastFor aims at.
    const real = (all) => nextGame(all.filter((g) => !g.scrimmage))?.date;
    const was = real(season.games);
    const now = real(games);
    const weather = was === now ? season.weather : await forecastFor(team, games);

    await writeFile(scheduleFile, JSON.stringify({ ...season, games, weather }));

    const added = record.played - before;
    console.log(
      `           results  ${record.played} played, ${record.won}-${record.lost}` +
        `${added > 0 ? ` (${added} from the league)` : ''}`,
    );

    /*
     * A fixture that is in the past with nobody's score on it is either a game
     * the league has not posted yet or — the case worth catching — an opponent
     * the two sources spell differently enough that the merge missed it.
     */
    const missing = games.filter(
      (g) => !g.result && !g.scrimmage && new Date(`${g.date}T23:59:59`) < new Date(),
    );
    if (missing.length) {
      console.warn(
        `  ? ${team.slug}: no score for ${missing.map((g) => `${g.date} ${g.opponent}`).join(', ')}` +
          ` — not posted yet, or a name the two sources spell differently.`,
      );
    }
  } catch (err) {
    console.warn(`  ! ${team.slug}: could not merge the league's scores (${err.message}).`);
  }
}

/**
 * The season, fetched from the school's own calendar feed.
 *
 * It happens here rather than on the phone because the feed sends no CORS
 * header, so a browser can't read it — and because a schedule is the same for
 * everyone on the team, so baking it costs one fetch instead of one per phone.
 * A scheduled rebuild is what keeps it current; see .github/workflows.
 *
 * A feed that's down must not break the build. The site is mostly a roster
 * lookup, and losing the whole deploy over a calendar would be the wrong trade.
 */
async function writeSchedule(team, out) {
  /*
   * history.json is deliberately terse — [date, opponent, home, us, them] —
   * because it's 170 rows of the same shape and a diff should be readable. It's
   * expanded here into the same Game the calendar produces, so head-to-head
   * doesn't care which source a meeting came from.
   */
  const raw = existsSync(join(teamsDir, team.slug, 'history.json'))
    ? JSON.parse(await readFile(join(teamsDir, team.slug, 'history.json'), 'utf8'))
    : [];

  // Both sides go through the same alias table, so a school the record book and
  // the calendar feed name differently still lands on one key.
  const aliases = team.opponentAliases ?? {};

  const history = raw.map(([date, opponent, home, us, them]) => ({
    date,
    ...canonicalOpponent(opponent, aliases),
    home: Boolean(home),
    scrimmage: false,
    result: { us, them, won: us > them },
  }));

  if (!team.schedule) {
    if (history.length) {
      await writeFile(join(out, 'schedule.json'), JSON.stringify({ games: [], history }));
      return true;
    }
    // Nothing to show, so the team gets no Schedule tab at all rather than one
    // that opens on an apology.
    return false;
  }

  try {
    const res = await fetch(team.schedule, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { games, teamName } = parseIcal(await res.text(), aliases);
    const weather = await forecastFor(team, games);

    await writeFile(
      join(out, 'schedule.json'),
      JSON.stringify({ games, history, teamName, weather, fetched: new Date().toISOString() }),
    );

    const played = games.filter((g) => g.result).length;
    console.log(
      `           schedule ${games.length} events, ${games.filter((g) => !g.scrimmage).length} games, ` +
        `${played} played, ${history.length} in history`,
    );

    /*
     * A fixture whose opponent has no history at all is either genuinely new or
     * a name the two sources spell differently — which is exactly how fifteen
     * meetings with Niles went missing. Say so at build time rather than
     * letting the app quietly report no previous meetings.
     */
    if (history.length) {
      const known = new Set(history.map((g) => g.opponentKey));
      const unseen = games
        .filter((g) => !g.scrimmage && !known.has(g.opponentKey))
        .map((g) => g.opponent);
      if (unseen.length) {
        console.warn(
          `  ? ${team.slug}: no history against ${[...new Set(unseen)].join(', ')}. ` +
            `New opponent, or a name mismatch needing an entry in opponentAliases.`,
        );
      }
    }
    return true;
  } catch (err) {
    console.warn(
      `  ! ${team.slug}: could not read the schedule feed (${err.message}). ` +
        `Keeping whatever was built last time.`,
    );
    return existsSync(join(out, 'schedule.json'));
  }
}

const teams = await readTeams();

if (phase === 'pre') {
  /*
   * A team that was renamed or dropped leaves its whole directory behind in
   * public/, and the glob that builds the precache doesn't know it is stale —
   * so the dead team's icons and badge ship, and get cached on every phone.
   * Clearing only the directories of teams that still exist can't catch that,
   * because the orphan is by definition not one of them.
   */
  const live = new Set(teams.filter((t) => !t.root).map((t) => t.slug));
  for (const dir of await readdir(publicDir, { withFileTypes: true })) {
    if (dir.isDirectory() && dir.name !== 'icons' && !live.has(dir.name)) {
      console.log(`           removing public/${dir.name}/ — no such team`);
      await rm(join(publicDir, dir.name), { recursive: true, force: true });
    }
  }

  for (const team of teams) {
    const out = team.root ? publicDir : join(publicDir, team.slug);
    if (!team.root) await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });

    const palette = await paletteFor(team.logo, team.palette);
    const { artFraction, padded, source: src } = await writeIcons(team.logo, join(out, 'icons'));
    const bytes = await writeWallpaper(team.logo, join(out, 'badge.jpg'));
    await writeFile(join(out, 'manifest.webmanifest'), JSON.stringify(manifestFor(team, palette)));
    await writeSchedule(team, out);
    await writeRoster(team, out);
    await writeSeasons(team, out);

    /*
     * The rest of the conference, and the playoff region. Written only for a
     * team that asked for it; kept from the last run when the fetch or the
     * parse comes back empty, for the same reason the schedule is.
     *
     * fetchLeague is honest about what it got: null means the standings
     * themselves are incomplete or unreadable, and that's never publishable —
     * the previously published copy, if there is one, is republished instead.
     * A regionTable of null inside an otherwise good result is a lesser
     * problem, and it's this build's call, not fetchLeague's, whether that's
     * good enough to ship: a working playoff table that is already live must
     * not be blanked, but a team with no published file at all gets one
     * anyway, so the tab works instead of staying dead forever until the
     * region page happens to cooperate.
     */
    if (team.league) {
      const file = join(out, 'league.json');

      /*
       * "Keep the previous file" needs a previous file, and on the server there
       * isn't one: deploy.yml and refresh.yml both start from a fresh
       * actions/checkout and league.json is not tracked in git, so a
       * disk-only check is false every single time in the one environment
       * that matters — and the tab vanishes instead of going stale.
       *
       * The previous copy that genuinely exists is the one already being
       * served, so that is what gets fetched. Locally the file on disk is the
       * same thing and is cheaper, so it wins. Fetched lazily: a clean run
       * never asks. A 404 is the first-ever deploy rather than a failure, and
       * falls through to publishing whatever was scraped.
       */
      let cached;
      const lastPublished = async () => {
        if (cached !== undefined) return cached;
        cached = null;
        if (existsSync(file)) {
          cached = await readFile(file, 'utf8');
          return cached;
        }
        if (!team.site) return cached;
        try {
          const res = await fetch(`${team.site}${team.base}league.json`, {
            headers: { 'User-Agent': 'rosterapp (github.com/kmccb/rosterapp)' },
            signal: AbortSignal.timeout(20000),
          });
          if (!res.ok) return cached;
          const text = await res.text();
          JSON.parse(text); // an error page served as 200 is not a fallback
          cached = text;
        } catch (err) {
          console.warn(
            `  ! ${team.slug}: could not read the deployed league.json to fall back on (${err.message}).`,
          );
        }
        return cached;
      };

      let league = null;
      try {
        league = await fetchLeague(team.league, new Date().getFullYear());
      } catch (err) {
        // A thrown fetch is the same situation as a null one — nothing good to
        // publish — so it falls into the same decision below rather than
        // silently doing nothing on a machine that has no file to keep.
        console.warn(`  ! ${team.slug}: could not read the league (${err.message}).`);
      }

      {
        // fetchLeague is honest about what it got. null means the standings
        // themselves are short or unreadable, which is never publishable; a
        // null regionTable is a lesser loss but still worse than the copy
        // already out there. Either way the answer is the same one the human
        // ruled on: republish yesterday rather than publish something wrong.
        const previous = !league || !league.regionTable ? await lastPublished() : null;

        if (!league) {
          if (previous) {
            await writeFile(file, previous);
            console.log(`           league   republished the previous copy — this run's pages gave nothing`);
          } else {
            console.warn(
              `  ! ${team.slug}: the league pages gave nothing and there is no previous copy ` +
                `anywhere, so no league.json is written and the tab stays off this build.`,
            );
          }
        } else if (!league.regionTable && previous) {
          await writeFile(file, previous);
          console.warn(
            `  ! ${team.slug}: fresh standings but an empty region page; republishing the previous ` +
              `league.json rather than blank a working playoff table with this one.`,
          );
        } else {
          await writeFile(file, JSON.stringify(league));
          console.log(
            `           league   ${league.teams.length} teams, ${league.games.length} games, ` +
              `D-${league.division} region ${league.region}` +
              `${league.regionTable ? `, ${league.regionTable.rows.length} in the region` : ', no region table'}`,
          );
          if (!league.regionTable) {
            console.warn(
              `  ? ${team.slug}: no previous league.json anywhere to fall back on, so this one ships ` +
                `with no region table; a later run fills it in once the region page is back.`,
            );
          }
        }
      }
    }

    // After the league, because it is the league's file this reads.
    await applyResults(team, out);

    console.log(
      `${team.base.padEnd(10)} ${team.name.padEnd(16)} ground ${palette.ground} ` +
        `accent ${palette.accent}  badge ${(bytes / 1024).toFixed(0)}kB` +
        `${team.palette ? '  (palette pinned)' : ''}${padded ? '  (padded to square)' : ''}`,
    );

    if (Math.max(src.width, src.height) < 512) {
      console.warn(
        `  ! ${team.slug}: the badge is only ${src.width}x${src.height}. Icons are made at 512px, ` +
          `so it will be upscaled and look soft on a home screen. A larger original would fix it.`,
      );
    }

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

  // Keyed by the path segment each team is served from, which is what the app
  // reads out of the address. The root team's key is empty.
  const table = {};
  for (const team of teams) {
    const out = team.root ? dist : join(dist, team.slug);
    table[team.root ? '' : team.slug] = {
      slug: team.slug,
      name: team.name,
      school: team.school ?? team.name,
      palette: await paletteFor(team.logo, team.palette),
      wallpaper: `${team.base}badge.jpg`,
      schedule: existsSync(join(out, 'schedule.json')),
      roster: existsSync(join(out, 'roster.json')),
      seasons: existsSync(join(out, 'seasons.json')),
      league: existsSync(join(out, 'league.json')),
    };
  }

  for (const team of teams) {
    const out = team.root ? dist : join(dist, team.slug);
    await mkdir(out, { recursive: true });
    await writeFile(
      join(out, 'index.html'),
      pageFor(builtIndex, table, team, table[team.root ? '' : team.slug].palette),
    );
  }
  console.log(`${teams.length} team pages written.`);
}
