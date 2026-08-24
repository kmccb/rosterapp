# Selling and operating the paid tier

First time? Work through docs/going-live.md before the first sale.

The system stores a paid-through date and a note. Everything else — the
pitch, the invoice, the check — happens between people.

The base tier is $200/season. This line is the one place that number lives —
change it here, and quote whatever it says.

## Activate a school (the whole job, ~3 minutes)

1. Open https://roster.scottforge.ai/oh/?manage and sign in (email link).
2. "+ Activate a school" → search the school → paste their roster
   spreadsheet → check the parsed list reads right.
3. Pick their two colors. Set paid-through (defaults to Feb 1 after the
   season). Put the payment in the note: "check #1042, J. Smith, boosters".
4. **Publish.** Their /oh/ page has the keypad that second.

Save unpublished instead if the check hasn't cleared — publishing later is
the same screen.

### One more line, in the repo

Add the school's slug to `paid-schools.json` at the repo root and push:

```json
{ "slugs": ["strasburg-franklin-strasburg", "their-school-theirtown"] }
```

That is the whole list the weather pass reads. Every six hours the refresh
workflow looks up the next unplayed fixture for each slug on it, fetches the
forecast for that kickoff, and writes it into the build that deploys — nothing
is committed, so the live forecast is always the one that run fetched. The
school's Schedule tab then carries the weather at kickoff the way Poland's
always has.

It is one line and it is optional: a school left off the list simply has no
forecast, and nothing else about its page changes. The slug is the one in the
school's /oh/ URL. Take a slug back off the list when a school comes down.

Nothing here is fetched from a reader's phone — that is the point, and the
privacy page says so.

The forecast needs the school's town on the map. `public/oh/geo.json` already
holds 716 of the 717, so this is nearly always already done. If the refresh log
says a school has no coordinates, run `node scripts/geocode-schools.mjs` and
commit — it tops the file up rather than rewriting it.

### More than one sport

The Activate form asks which sport. Football's schedule comes free from the
directory; for anything else, paste the schedule too (date, opponent, time
columns) — the parser preview shows what it read before you publish. Once a
school has two sports live, or any live sport that isn't football, its /oh/
page opens on a hub instead of straight to the roster. Pricing for the
all-sports package isn't set yet.

## Mid-season changes

Text arrives: "#7 is now #12." Open the school in the panel, paste the
corrected spreadsheet (it replaces the roster), Publish. Editing only the
date or note without a new paste keeps the roster as it is.

## Renewals

Rosters go dark on their paid-through date on their own. Next July: open the
panel, every school shows its date; invoice the expiring ones; extend the
date when the check arrives.

## Coming down

"Save unpublished" hides a roster instantly (row kept). "Delete this roster"
removes it entirely. A school's removal request is honored same-day, per the
privacy page.

## The other tier

"They want their own app like Poland's" — that is the concierge-plus build
(crest, palette, installable icon). It is manual: a teams/<slug>/ entry, a
logo, and a deploy. Price it accordingly.
