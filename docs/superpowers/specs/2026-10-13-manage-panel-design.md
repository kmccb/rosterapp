# The seller's panel, rebuilt for a laptop

**Date:** 2026-10-13

## Why

The panel at `/oh/?manage` was assembled from the fan page's classes. Every control was a
schedule row, so Save, Delete, Unlink and Back were identical bars; one 700-line form held a
school's colors, crest, date and note together with one sport's roster, schedule and conference;
and the list showed a line per sport with no way to see which school needed attention. With a
first sale close, it is about to be the tool the seller actually works in, mostly at a laptop.

## What ships

- **Schools** — one row per school: sports with player counts, a status, the paid-through date,
  any refused sheet or calendar. Worst first: needs a look, expired, live, unpublished. Search
  filters the list; **Activate a school** searches the whole directory.
- **A school** — header with status and address; **Look** (two colors, crest); a card per sport;
  **Billing** (paid through, Renew a year, note, Take this school down); a preview of the fan
  page's header and a row in the colors being picked, beside the form.
- **A sport card** — Roster, Schedule, Stats, Conference, each with a line saying what is stored
  and one way to change it; Save / Unpublish / Delete this sport in the foot.
- **Stats source in the panel** — a MaxPreps print link per sport (migration 0009), read by the
  scheduled job from the database instead of from `maxpreps-teams.json`.

## Decisions

- **Look and Billing are the school's.** The database keeps them per row. The page edits them
  once and writes every row, in order, stopping at the first refusal and saying how many were
  saved. A sport's own save sends the row's stored colors, date and note back unchanged.
- **Each section saves itself.** One page-wide Save would be several calls pretending to be one.
- **The upsert contract is untouched.** `saveArgs.ts` is the old form's pure helpers moved, not
  rewritten; `activate.test.ts` still pins them.
- **The stored conference is prefilled** through the fan page's public fetch, which answers only
  for a published, paid row. Otherwise the form is empty and an empty form keeps what is stored.
- **The preview is a sketch, not the page.** An iframe of the real page would mark the school as
  followed in the seller's own browser. The preview draws the header and one row under
  `deriveVars`; "Open the fan page" is the page.
- **Its own styles.** `.mg` in `src/oh/oh.css` covers the viewport and reads none of the fan
  page's variables, so a school's colors cannot leak into the tool that sets them. Light and
  dark follow the system.
- **0009 is additive.** A new column, two new functions, one more key on `school_roster_list`.
  Until it is applied the Stats control shows the database's refusal and the job reads the file.

## Not in this round

- Editing one player in place; the roster is still replaced whole.
- Showing the stored roster or schedule themselves (the list carries counts, not rows).
- A sponsor per game; coach accounts.

## Verified, and not

Verified against a local stand-in for the database: the list, opening a school, Look and Billing
writing every sport, adding a sport from a paste with a skipped row, setting and removing a stats
link, the conference prefill. Not verified: anything against the real database, the real
sign-in, crest upload end to end, and migration 0009 against Postgres.
