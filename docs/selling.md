# Selling and operating the paid tier

First time? Work through docs/going-live.md before the first sale.

The system stores a paid-through date and a note. Everything else — the
pitch, the invoice, the check — happens between people.

One team is $400 a season. A whole school — every sport — is $1,200
a year. A district or conference is quoted. A school's first season is free.
These lines are the one place those numbers live — change them here and on
the site (`marketing/index.html`) together, and quote whatever they say.

One roster per sport today: the panel has no separate entry for a second level or for boys’ and girls’ teams of the same sport. Say so before a school assumes otherwise.

## What to show a prospect

https://getroster.scottforge.ai — the site. Send this to someone you have not
met.

https://roster.scottforge.ai/oh/demo/ — the demo. Open it on a phone and hand
it over. No login, no setup, nothing to explain first.

It is Harlow Valley, a school that does not exist, in violet and gold with its
own crest. Three sports — Football, Volleyball, Basketball — each opening the
way a paying school's does: keypad, roster, schedule. Football also carries
scores, a forecast at the next kickoff, and a standings table for a conference
of five more invented schools.

The school is fictional on purpose. For one pitch the demo was the real
Springfield with sample players on it; the site now sends strangers here, and
invented players do not belong on a real school's page in front of them. A
quiet line in the footer says it is all sample data.

It works with no signal once loaded, and it asks the database and the
directory for nothing — safe on a school's guest wifi or in a car park.

**Maintenance:** the page carries a sport that has results on it forward by whole weeks as it ages, so what has been played and what is coming split at today — but only until that sport's own months run out, and a sport with nothing played yet is never moved. The file generated on 2026-10-13 is right until 17 November. So run `node scripts/build-demo.mjs` and commit `public/oh/demo.json` **by 17 November, again on 1 December, and near the start of each autumn** — and look at the page before any demo that matters. From December to August it shows fixtures and no scores, because nothing in an invented autumn has been played yet. It refuses to write a season that would argue with itself, or a school that turns out to be real, and prints the dates it wrote.

After a re-run that changes how the page looks, re-take the site's
screenshots: `node scripts/shoot-marketing.mjs` (see README, Deploying). Do not re-take them from a file generated out of season: the pictures are of football, which then has no scores, no forecast and a table of 0–0.

## Activate a school (the whole job, ~3 minutes)

1. Open https://roster.scottforge.ai/oh/?manage and sign in (email link).
2. "+ Activate a school" → search the school → paste their roster
   spreadsheet → check the parsed list reads right. Or a CSV file, above
   the paste box — it fills the paste box the same way and gets the same
   review.
3. Pick their two colors. Set paid-through (defaults to Feb 1 after the
   season). Put the payment in the note: "check #1042, J. Smith, boosters".
4. **Publish.** Their /oh/ page has the keypad that second.

Save unpublished instead if the check hasn't cleared — publishing later is
the same screen.

### The school's address

Add `/oh/<short-name>` lines to `public/_redirects` (both slash forms) and
push. Then make the QR code from `https://roster.scottforge.ai/oh/<short-name>`
— never from `/oh/?school=…`. The printed code has to survive any later
change to how the page is addressed; the short link redirects to whatever
the real query is today, and keeps doing that if it ever changes.

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
page opens on a hub instead of straight to the roster. The whole-school
price at the top covers it.

### The conference

On a football activation, ask which conference the school plays in and who
else is in it — that's the whole input the League tab's standings run on;
everything else (who played whom, who won) already lives in the directory
data. Type the conference name and pick the member schools in the panel.

Re-picking members **replaces** the stored list, it doesn't add to it — the
panel has no way to show what's already saved, so treat every save here as
the full roster of the conference, not an addition to it. Leaving the
picker empty and saving clears the league instead, and the tab disappears
from that school's fan page.

### Colors and crest are effectively a set

Pick both at activation if you can. A crest with no colors dresses the
header but leaves the rest of the page unthemed — the two want to arrive
together, not one now and the other at renewal.

### Roster from the coach's Google Sheet

Save the activation unpublished first. Ask the coach to publish the roster
tab (File → Share → Publish to web → the tab → CSV) and send the link. In
the panel, paste the link, Check link, Link. Publish once it says "synced".
From then on the coach edits the sheet and the changes are live within 15
minutes — the roster section of the panel goes read-only for that row, since
the sheet owns it now.

### Schedule from a calendar (non-football)

Ask for the calendar's iCal/subscribe link from whoever keeps the school's
schedule. Check link with a filter naming the sport and level the way the
calendar itself writes it — for Eventlink that reads like
`Volleyball (Girls V)`. Only promise this for a scheduling system that has a
passing sample in `src/sync/fixtures/` — today that's ScheduleStar and
Eventlink; anything else, paste the schedule by hand as before.

### When an email arrives

The reason is in the subject line and the body. Fans still see the last
good data the whole time — nothing on the fan page breaks while a sync is
refused. Fix the sheet (or tell the coach what to fix) and the next run
sends "Syncing again."

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

A linked sheet or calendar keeps syncing — and can keep emailing you about a
broken one — whether or not the school is still paying; `paid_through`
lapsing doesn't stop the 15-minute job. Unlink both at the end of an
engagement, not just let the date run out.

## The other tier

"They want their own app like Poland's" — that is the concierge-plus build
(crest, palette, installable icon). It is manual: a teams/<slug>/ entry, a
logo, and a deploy. Price it accordingly.
