# Roster Lookup

Type a jersey number, see the player. Built for standing in the bleachers asking "who is #7?"
and getting an answer before the next snap.

- **Big keypad, not a text field.** The phone keyboard would cover the results.
- **Prefix matching.** Tap `7` and #7 is on top with the 70s underneath. Tap `2` and you're on #72.
- **Works offline.** It's an installable web app; once it's on your home screen it doesn't need a
  signal, which is the whole point at a packed stadium.
- **Nothing leaves the phone unless you publish it.** No accounts, ever. The roster lives in
  browser storage, and the only thing that reaches a server is a roster someone deliberately
  shared — see below.

## Getting the roster in

Tap **Add the roster** on the empty Lookup screen, paste the rows straight out of the spreadsheet
(or pick a `.csv`/`.tsv` file), and hit Review. It works out which column is the number, the name, the position, the height, the weight
and the grade — with or without a header row, tab- comma- or space-separated, names as either
`Jake Miller` or `Miller, Jake`, heights as `6-1`, `6'1"` or `73`.

Then **check the review table before saving**. Nothing is stored until you press save, and every
cell is editable, so a column that landed wrong takes a second to fix.

**Back it up.** Settings → Copy as CSV. Browser storage is not forever — if you clear site data or
switch phones, the roster goes with it.

Unless it was shared. Publishing a roster, or pulling one with a code, records that code on the
device. If the app then opens to empty storage it fetches the roster back on its own, instead of
showing a first-run screen to someone who has used it all season. Deleting the roster deliberately
drops the code too, so a delete stays deleted.

That matters more than it sounds: browser storage gets evicted without asking, iOS especially. It
is also why the site must serve over HTTPS only — `http://` and `https://` are separate origins
with separate storage, so a roster typed in over one is invisible to the other. `Enforce HTTPS`
under Settings → Pages is what prevents that, and it is not optional.

## Stats

A player's card shows last season next to this season. Both come from Hudl: open the season stats
page, select the tables — **headings included** — copy, and paste the lot into **Stats**, reached
from the Roster screen. Passing, rushing, defence and the rest can go in together.

Players are matched by **surname plus first initial**, never by jersey number, because numbers get
reassigned between seasons — last year's #1 is often this year's #7. For the same reason stats are
filed under that name key rather than a player id, so re-importing the roster doesn't strand them.

Nothing is guessed. A name that fits nobody is reported and dropped (usually a player who left);
a name that fits more than one player is reported and left out until the roster has enough of a
first name to tell them apart. The initial is checked even when only one player carries the
surname — a lone Xipolitas on this year's roster is not last year's "P. Xipolitas".

Two caveats worth knowing:

- The kick-return and punt-return tables have **identical columns**. The heading above them is the
  only thing that separates the two, which is why the paste has to include headings.
- Hudl's kicking table often lists everything under "Rest of team" with no named player, in which
  case there is nothing to attach to anyone.

`src/stats/statsParse.ts` does the reading and `src/stats/statsMatch.ts` the matching; both are
pure and covered by tests, including a table copied verbatim off the live Hudl page.

## Sharing by code

One person types the roster in and hits **Settings → Publish to a code**. That returns eight
characters like `BXQ4-T9KM`. Everyone else opens the app, taps **Add the roster**, enters the code,
checks the same review table, and saves. From then on it's a local roster like any other and works
with no signal.

Worth being clear about what this is: a roster is a list of minors with their heights, weights and
year in school, and anyone holding the code can read it. It's the paper roster handed round at a
game, not a secret. Publishing is opt-in per roster, the publisher can take it down from Settings,
and a code that nobody refreshes expires after 400 days.

What stops the code being the *only* thing protecting it is that there's nothing else to find. The
anon key ships inside the JavaScript bundle where anyone can read it, so `shared_roster` is not
exposed to the Data API at all — RLS on with no policies, grants revoked, and access only through
the security-definer functions in `supabase/migrations/0001_shared_roster.sql`. Those take a code
and return at most one roster. There is no function that lists, counts or searches, by design.

## Screens

Only the two screens a spectator uses are on the tab bar. Setting a roster up is a once-a-season
job, so it sits behind the "No roster yet" state instead of a permanent tab that's wrong for
everyone holding a phone in the stands.

| Screen | What it does | How you get there |
| --- | --- | --- |
| Lookup | The keypad, and the page you land on. Number in, player out. | Tab |
| Team | Every player by number, filtered by area and position, searchable by name — the reverse lookup. | Tab |
| Roster | Paste, or enter a share code, then review before saving. | "Add the roster", on the empty Lookup screen |
| Settings | Team name, season, sharing, CSV/JSON backup, delete. | Link at the foot of Roster |

**Press and hold the team name** to reach setup at any time. It's the escape hatch: auto-restore
(below) refills the empty Lookup screen before you can use it, which would otherwise leave a coach
unable to reach Settings at all — including to stop sharing.

**Setup is one sitting, and leaving ends it.** The empty state is the only entrance, so saving a
roster deliberately keeps you on the Roster screen rather than bouncing you to Lookup — publishing
needs a saved roster *and* a route to Settings, and that is the only moment you have both. Pressing
"Done — go to Lookup" is what closes the door. After that nothing reaches Roster or Settings again
until the roster is deleted, which drops you back on the empty state and reopens it.

That is deliberate, and it is a real constraint: on a phone with a roster loaded there is no
re-import, no re-publish and no backup without deleting first.

## What gets counted

One thing does leave the phone that nobody published: a page view.

Cloudflare Web Analytics is attached to every page — no cookie, no device fingerprint, no
identifier that follows anyone between sites, and nothing that survives the visit. It reports that
a page was opened and where the link came from. It never sees a roster: those live in browser
storage, and there is nothing on the page for a script from another origin to read even if it
tried.

It is off unless `VITE_CF_BEACON` is set at build time, so a fork, a local `npm run dev` and
anyone else's copy attach nothing at all.

Worth knowing what the numbers are not: this is an installable app that works with no signal, and a
launch from a home screen with the phone in aeroplane mode reports nothing. The count is a floor,
not an attendance figure.

## Development

Sharing needs two environment variables — copy `.env.example` to `.env.local` and fill them from
the Supabase project (Settings → API). Without them everything else still runs; the share UI just
hides itself. `VITE_CF_BEACON` is the third and is best left unset locally, so development doesn't
count itself as traffic.

```sh
npm install
npm run dev      # --host, so you can open it on your phone over the same wifi
npm test         # parser tests
npm run build    # typecheck + production build
npm run preview  # serve the build, for checking offline behaviour
npm run icons    # regenerate every team's icons after changing a logo
```

The parsing logic lives in `src/parse/rosterParse.ts` and is pure and covered by tests — that's
where to go when a real roster paste doesn't come out right.

## More than one team

Each folder in `teams/` is a team, and each gets its own page on the same site:

```
teams/
  poland/   team.json  logo.jpg     -> /            ("root": true)
  eagles/   team.json  logo.jpg     -> /eagles/
```

`npm run build` turns each one into its own icon set, manifest, badge and `index.html`. A phone
adding `/eagles/` to its home screen gets that team's crest and name, because the OS reads those
from files on disk at install time — which is the one piece of branding a runtime upload can never
reach. Everything else is shared: same JavaScript, same database, same deploy.

To add a team: make the folder, drop in a square `logo.jpg` and a `team.json` with `name` and
`short`, then build and push. Exactly one team carries `"root": true` and lives at `/` — that's
the original, whose installed apps and existing links already point there.

Colours come off the badge. The most saturated colour in it sets the hue, and a dark ground and
bright accent are generated from that — generated rather than sampled, because sampling a pale
badge gives a pale ground and unreadable text. `src/theme/palette.ts` does it, the build imports
the same module so a baked theme and an uploaded one can't drift, and the contrast guarantees are
asserted across eight team colour families in its tests. A team can pin its own palette in
`team.json` instead; the root team does, so its look predates and survives all of this.

Anyone can also add a badge from **Settings → Add the team badge** without a rebuild. That gets
them the colours and the watermark, and travels with the share link — just not the home screen
icon.

## Deploying

Live at **https://roster.scottforge.ai**, on Cloudflare Pages. The Pages project is connected to
this repo, so every push to `main` is built and published by Cloudflare itself — no deploy
workflow in `.github/`. Each other branch gets a preview build on its own `*.pages.dev` address,
which is also what puts a pass or fail on a pull request.

The build command, set in the Pages project:

```sh
env -u VITE_SUPABASE_URL -u VITE_SUPABASE_ANON_KEY -u VITE_CF_BEACON npm test && (node scripts/paid-weather.mjs || true) && npm run build
```

Tests first, with the variables stripped, because they must pass with no Supabase configured;
then the paying schools' forecast, which is allowed to fail; then the build, which ends in the
Poland guard. Anything but a clean pass publishes nothing. Output directory `dist`.

The variables live in the Pages project too, under **Settings → Variables and secrets**, set in
*both* the Production and the Preview environment — they're separate, and a preview missing one
fails the guard: `NODE_VERSION` = `22`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_CF_BEACON` present but empty until the beacon is switched on. Plain text rather than
secrets, deliberately — every one is readable in the shipped bundle anyway, and hiding them would
only make the build harder to audit.

Cloudflare rebuilds on a push and on nothing else, and the six-hourly schedule refresh has nothing
to push, so `refresh.yml` asks for a rebuild through a Pages deploy hook whose URL is the
`CF_PAGES_DEPLOY_HOOK` repository secret. The directory refresh does commit, and that push is its
rebuild.

DNS is the `scottforge.ai` zone on the same Cloudflare account, where `roster` is a proxied
`CNAME` to the project's `pages.dev` name — attaching the custom domain in the Pages project writes
it. Plain `http://` redirects to `https://`, which matters more than it looks: they are different
storage origins, so rosters would vanish depending on which one you arrived at, and service workers
refuse to register outside a secure context. Because a custom domain serves from the root,
`vite.config.ts` sets `base: '/'`.
