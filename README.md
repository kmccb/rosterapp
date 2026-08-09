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

**Setup is one sitting, and leaving ends it.** The empty state is the only entrance, so saving a
roster deliberately keeps you on the Roster screen rather than bouncing you to Lookup — publishing
needs a saved roster *and* a route to Settings, and that is the only moment you have both. Pressing
"Done — go to Lookup" is what closes the door. After that nothing reaches Roster or Settings again
until the roster is deleted, which drops you back on the empty state and reopens it.

That is deliberate, and it is a real constraint: on a phone with a roster loaded there is no
re-import, no re-publish and no backup without deleting first.

## Development

Sharing needs two environment variables — copy `.env.example` to `.env.local` and fill them from
the Supabase project (Settings → API). Without them everything else still runs; the share UI just
hides itself.

```sh
npm install
npm run dev      # --host, so you can open it on your phone over the same wifi
npm test         # parser tests
npm run build    # typecheck + production build
npm run preview  # serve the build, for checking offline behaviour
npm run icons    # regenerate PNG icons after editing public/icons/favicon.svg
```

The parsing logic lives in `src/parse/rosterParse.ts` and is pure and covered by tests — that's
where to go when a real roster paste doesn't come out right.

## Colours and the background

The palette in `src/styles.css` is sampled from `img/logo.jpg`: `#030367` from the line work,
`#1687cd` and `#1a489e` from the wash behind it, and white. The logo doubles as the page
background — `public/bulldog.jpg` is a 1200px re-encode of it, drawn `cover` behind two fixed
layers so it bleeds off every screen edge, with a scrim over it heavy enough to keep white text
above 13:1. To swap teams, drop a new square logo at `img/logo.jpg`, re-run the resize, and move
the four hex values at the top of the stylesheet.

## Deploying

Live at **https://roster.scottforge.ai**. Pushing to `main` builds and publishes via
`.github/workflows/deploy.yml`.

One-time setup, in order:

1. **The repo must be public**, unless the account is on GitHub Pro or higher — Pages doesn't
   publish from a private repo on the free plan. Public is fine here: no roster data is in the
   repo, and none ends up in the built site either. Players are entered on the device and stay
   there.
2. **Settings → Pages → Source: GitHub Actions.**
3. **DNS**: a `CNAME` record for `roster` pointing at `kmccb.github.io.` (that's the GitHub user,
   not the repo, and the trailing dot matters on some providers).
4. **Settings → Pages → Custom domain**: `roster.scottforge.ai`, then tick **Enforce HTTPS** once
   the certificate finishes provisioning — that can take a few minutes to an hour after DNS
   resolves.
5. **Get the workflow onto `main`.** It triggers on pushes to `main`, and the manual "Run workflow"
   button only appears for workflows already on the default branch — so nothing deploys while this
   lives on a feature branch.
6. **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`. Variables rather than secrets, deliberately — both are readable in
   the shipped bundle anyway, and hiding them would only make the build harder to audit. Skip
   this and the site deploys fine without sharing.

`public/CNAME` carries the domain into every build, which is what keeps the custom domain from
being dropped on each deploy. Because a custom domain serves from the root, `vite.config.ts` sets
`base: '/'`; reverting to plain `github.io` hosting means putting `/rosterapp/` back.
