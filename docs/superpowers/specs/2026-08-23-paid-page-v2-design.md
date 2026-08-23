# Paid page v2: the whole app, in the school's clothes

**Date:** 2026-08-23

## Why

The first live activation proved the pipeline and exposed the gap: the paid page reads as a
directory page with a keypad bolted on, not as the app that made people at a Poland game say
"how do I get this." Three asks from that first sale's dry run, plus one bug the screenshots
caught:

1. The interface should be the real app's — a tab bar like Poland's, not a seg inside a scroll.
2. The school's colors should dress the whole page, not just a header band.
3. The seller needs a logo upload, like Poland's crest.
4. Fixture dates on the school screen overflow their column and print over the opponent's name.

## What ships

### Tabs — `Lookup | Team | Schedule`

A paid school's page restructures into the root app's shape: school header (crest, name, record),
then a tab bar using the shared `.tabs`/`.tab` classes. Lookup is the keypad; Team is the squad;
Schedule is the season list that today sits squashed underneath. A school with no live roster
keeps today's single-scroll page, panel included.

**League is deliberately absent, and the spec says why:** Poland's League tab works because
`team.json` hand-lists the Northeast 8's members. Conference membership exists in no statewide
source, so it cannot be derived for an arbitrary school. The reachable future is a Region
standings tab — joeeitel publishes all 28 region tables and the parser exists — but it waits on
the school→team-id mapping the directory build deferred. Named here as the next unlock, not faked.

### Full theming

The root app dresses itself by writing ~15 CSS variables from a palette. The oh bundle gets its
own small copy of that idea — `src/oh/look.ts` — deriving the full set from just the two colors
the seller already picks:

- `--bg` = ground; `--chrome`, scrims = alpha mixes of ground (same formulas as `applyTheme`)
- `--surface`, `--surface-2` = ground lightened toward white
- `--line`, `--muted` = accent desaturated toward white
- `--accent` as picked; `--accent-ink` = ground; `--text` = white
- `--wallpaper` = the uploaded logo, when there is one

Applied to the document root when a themed school's page mounts, removed on unmount or school
switch — the directory and un-themed schools stay in the default look. Duplicated rather than
imported from `src/theme/theme.ts`, because the isolation rule (nothing in `src/oh/` imports the
root app's runtime) is what the Poland guard enforces, and forty lines of color math is a fair
price for it.

The seller sees the result live: the Activate form previews the derived look as the colors change.

### Logo upload

Same mechanics as the coach theme upload that already ships in the root app: file picker in the
Activate form → client-side center-crop and resize to a 720px JPEG data URI (typically 40–90 kB)
→ stored in the database under the same 500 kB ceiling migration 0003 uses for share themes.
The logo becomes the page wallpaper behind the root app's scrim treatment, and the header crest.

### Migration 0005

0004 is applied, so this is a new file, following 0003's precedent exactly:

- `alter table school_roster add column theme jsonb` — `{"logo": "data:image/jpeg;base64,…"}`,
  or empty. Null column = no logo.
- `school_roster_check_theme(jsonb)` — object, `pg_column_size ≤ 500000`, errcode'd raises.
- `school_roster_upsert` gains `p_theme jsonb` with the same renewal contract as players:
  **null keeps what is stored; `'{}'::jsonb` clears it.** Signature changes, so drop and
  recreate — a defaulted parameter would leave the old overload behind to be picked at random
  (0003's own words).
- `school_roster_fetch` returns `theme` alongside players and colors, only under the same
  published-and-paid conditions.
- `school_roster_list` gains `has_logo` (boolean) so the panel can show it without shipping
  every logo in the list.
- The grants convention: schema-wide revoke, then re-grant **every** live function — the four
  `roster_*` signatures and the five `school_*` ones, with `upsert`'s new signature.

### The date fix

School-screen fixture rows use the stacked `AUG / 28` date treatment the directory list already
uses (`.fixture-month` exists in the shared stylesheet), instead of a long string overflowing the
56px column.

## Contracts

```ts
// src/oh/look.ts
export type SchoolLook = { ground: string; accent: string; logo?: string };
export function applyLook(look: SchoolLook): void;    // writes the vars
export function clearLook(): void;                    // removes every var it wrote
export function resizeLogo(file: File): Promise<string>; // 720px centre-crop JPEG data URI
```

`SchoolRoster` (rosterStore) gains `logo: string | null`, validated like colors: a data URI
starting `data:image/` or nothing.

`upsertRoster` (adminApi) gains `theme: { logo: string } | Record<string, never> | null` —
null keep, `{}` clear, object set.

## Testing

- `look.ts` derivations pure and pinned (known ground/accent → expected var values); apply/clear
  round-trips leave the root element clean.
- Renewal contract extended: upsert with `p_theme` null keeps a stored logo (SQL trace + the
  going-live sweep's live check).
- Fetch returns theme only when published and paid — same three-row live check as rosters.
- Date fix: visual check at 375px; no overlap.
- The Poland guard green on every build, as always.

## Out of scope

- League/Region tab for paid schools (needs the team-id mapping — the named next unlock).
- Deriving the palette from the logo's pixels (root app does this; seller picks two colors here,
  and can eyeball against the live preview).
- Any change to the share-code theme system.

## Also in this round's going-live

The 0004 sweep never ran (the first sale outran the checklist): `verify-school-roster.mjs`,
the share-code smoke test, and the unpublished/expired/non-admin live checks — plus applying
0005 and its own re-run. And the Strasburg test roster with two invented players is still
published; it comes down as part of this round's verification.
