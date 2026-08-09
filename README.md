# Roster Lookup

Type a jersey number, see the player. Built for standing in the bleachers asking "who is #7?"
and getting an answer before the next snap.

- **Big keypad, not a text field.** The phone keyboard would cover the results.
- **Prefix matching.** Tap `7` and #7 is on top with the 70s underneath. Tap `2` and you're on #72.
- **Works offline.** It's an installable web app; once it's on your home screen it doesn't need a
  signal, which is the whole point at a packed stadium.
- **Your data stays on your phone.** No account, no server. Roster lives in browser storage.

## Getting the roster in

Open **Roster**, paste the rows straight out of the spreadsheet (or pick a `.csv`/`.tsv` file), and
hit Review. It works out which column is the number, the name, the position, the height, the weight
and the grade — with or without a header row, tab- comma- or space-separated, names as either
`Jake Miller` or `Miller, Jake`, heights as `6-1`, `6'1"` or `73`.

Then **check the review table before saving**. Nothing is stored until you press save, and every
cell is editable, so a column that landed wrong takes a second to fix.

**Back it up.** Settings → Copy as CSV. Browser storage is not forever — if you clear site data or
switch phones, the roster goes with it.

## Screens

| Tab | What it does |
| --- | --- |
| Lookup | The keypad. Number in, player out. |
| Team | The full roster by number, searchable by name or position — the reverse lookup. |
| Roster | Paste and review the import. |
| Settings | Team name, season, CSV/JSON backup, delete. |

## Development

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

`public/CNAME` carries the domain into every build, which is what keeps the custom domain from
being dropped on each deploy. Because a custom domain serves from the root, `vite.config.ts` sets
`base: '/'`; reverting to plain `github.io` hosting means putting `/rosterapp/` back.
