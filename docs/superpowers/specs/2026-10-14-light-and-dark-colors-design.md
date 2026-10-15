# The seller chooses a school's light and dark colors

**Date:** 2026-10-14 · **Branch:** `mode-colors` (from main after PR #27)

## Why
PR #27 gave fans a light/dark toggle, but the light look is worked out from the school's one set
of colors. The seller wants to choose both sets themselves in the panel. Separately, a crest fill
"does nothing" when the stored crest is an old opaque JPEG: Springfield's is a 720px JPEG with
black corners, uploaded before the transparent-crest fix. The fill is behind a solid square.

## 1. Two sets of colors in the Look card
- **Dark** is today's three pickers (ground, accent, text), relabelled "Dark mode".
- **Light** is a new row of the same three pickers, "Light mode", with a **checkbox** "Choose
  light colors myself". The light pickers are enabled only while it is ticked.
  - Unticked, the light look is derived exactly as now (PR #27's `deriveVars(look, 'light')`).
  - The first time it is ticked, the pickers start from that derived light look, so the seller
    begins from what fans see today.
- **Storage:** `colors.light = { ground, accent, text }`, inside the same `colors` jsonb as
  nickname and plate, so no migration is needed. Absent means derived.
  - `validColors` in `src/oh/rosterStore.ts` sanitises it: all three must be hex or the whole
    `light` object is dropped; it is never half-applied, and the dark pair is kept.
  - Panel saves carry it like the other keys; check every place that builds `colors`.
- **The page:** in light mode, when `colors.light` exists, `deriveVars` uses those three colors
  the same way it uses the dark ones: surfaces, muted and scrims are derived from them, with the
  same contrast floor (`readable`) and the same "adjusted" notes. Otherwise it behaves as now.
- **The preview:** gains a small Dark/Light switch (a segmented control) so the seller can see
  either look. It defaults to Dark. The panel's own chrome doesn't change.
- **The adjusted-color hint** says which mode it refers to.

## 2. Say when a fill can't show
- When the crest shown in the panel is a JPEG (`data:image/jpeg`), the Crest fill section shows
  one plain line under the menu: "This crest has a solid background, so a fill won’t show behind
  it. Upload the crest again to store it with a clear background."
- Keep it a hint, not an error.

## Rules
- Poland must not change: no edits to `src/styles.css`, `src/screens`, `src/App.tsx` or `teams`.
- `src/oh` imports no root runtime.
- Tests run env-free; `npx vitest run` and `npx tsc --noEmit` are clean.
- Tests cover:
  - sanitising `colors.light` (whole, junk, partial)
  - `deriveVars` light with and without `colors.light`
  - that the dark look is unchanged by a `light` key
- Comments are prose about why; user copy uses typographic apostrophes.
