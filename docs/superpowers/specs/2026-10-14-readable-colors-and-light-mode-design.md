# Readable school colors, a fill on the home-screen icon, and a light mode

**Date:** 2026-10-14 · **Branch:** `color-tune` (from main after PR #26)

## Why
The seller is dialling in a school's colors in the panel and finds that some accents leave
words too faint. The crest fill chosen in the panel (PR #24) shows on the page but not on the
installed app's icon. And the owner wants fans to have a light/dark toggle.

## 1. The home-screen icon uses the crest fill
- `scripts/paid-apps.mjs` draws the crest on the school's `ground` (`icon(art, ground, …)`).
- When `colors.plate` is set, the icon's tile is the plate color instead. `'ground'` and
  `'accent'` are resolved to the school's colors, and a hex is used as given.
- With no plate, the tile stays on `ground`, exactly as now.
- Resolve the plate with the same rule as `plateColor` in `src/oh/look.ts`: share the code
  rather than copy it, if the script can import it the way `ohio-state.mjs` imports `.ts`.
- The manifest's `background_color`/`theme_color` stay `ground`.
- Add a test where the repo already tests these scripts' pure parts.

## 2. Colors that are always readable
Faint words come from `deriveVars` (`src/oh/look.ts`) handing out colors with no regard for
contrast:
- `--accent` is used as **text** throughout `src/styles.css`: row numbers, "vs"/"at", records,
  section labels, the active tab, links.
- `--muted` is the accent lightened when the text is white.
- `--accent-ink` (text on an accent fill) is always the ground.
- A chosen `text` is used as given.

Rule: every color used for words must reach **WCAG contrast 4.5:1** against the surfaces it sits
on. That means both `--bg` and the lighter card surface (`--surface` composited over `--bg`);
take the worse of the two.
- Write a pure `readable(fg, against[], min = 4.5)`. When the color already passes, it returns
  it **unchanged**, so a school whose colors already work sees no change at all.
- When it fails, it moves the color's lightness, keeping its hue, toward whichever end
  (lighter/darker) reaches the minimum soonest, and stops at the first passing step.
- Apply it to `--text`, `--muted` and `--accent`.
- `--ghost` and `--line` are decoration, not words, so they are untouched.
- `--accent-ink` becomes whichever of ground / near-black / white reads best on the accent.
- The panel's preview already uses `deriveVars`, so it shows the corrected result. Add one quiet
  hint under the color pickers when a chosen color was adjusted ("Accent lightened so it reads
  on the ground"). Tell the seller; don't refuse the color.
- Tests:
  - contrast math against known pairs
  - passing colors returned untouched (Springfield `#c75000` + its accent; Poland-like navy +
    `#4fbaf7`)
  - failing ones fixed to ≥ 4.5 with the hue kept
  - pathological inputs (accent equal to ground; mid-grey ground)

## 3. A light mode fans can toggle
- **Who:** fans, on the page.
- **Where:** a small sun/moon button on paid pages, at the right end of the header line (sport
  pages and the hub). Free directory pages don't get it.
- **Default:** follows the phone (`prefers-color-scheme`). A tap overrides it and is remembered
  per phone in `localStorage` (`oh.mode`, read in try/catch), applying to every school. The
  button's label says what it switches to.
- **Light look:** `deriveVars(look, 'light')`. The dark path stays the default.
  - background: a near-white very lightly tinted with the ground, e.g. `mix(ground, '#fff', 0.94)`
  - text: near-black tinted with the ground
  - surfaces: white-ish
  - muted: derived from the text
  - accent: the school color that reads better on the light background (usually the ground,
    e.g. Springfield's orange), passed through `readable`
  - accent-ink: chosen as above
  - scrims: the light background's rgba, so the crest is just as faint
  - `--crest-plate` unchanged
- **CSS:** `src/styles.css` must not be edited, and parts of it hard-code dark-mode colors
  (white-alpha borders, keypad faces, chips, shadows, `rgba(255,255,255,…)`).
  - Audit every rule the paid page uses.
  - Override what light mode needs in `src/oh/oh.css` under `html[data-oh-mode="light"]`, set on
    `<html>` only while a paid look is applied. `clearLook` removes it.
  - W/L chips, the keypad, cards, tabs, the player screen, the Next up card, the Stats tables,
    the League tables and the panel are all checked in both modes. The panel itself stays as it
    is; only its preview could show light, and that's optional.
- `<meta name="theme-color">` follows the mode if the page sets it today.

## Rules
- Poland must not change: no edits to `src/styles.css`, `src/screens`, `src/App.tsx` or `teams`.
- `src/oh` imports no root runtime.
- Tests run env-free. `npx vitest run` and `npx tsc --noEmit` are clean.
- Comments are prose about why. User copy uses typographic apostrophes.

## Order
1, then 2, then 3 (3 uses 2's `readable`). Commit each separately.
