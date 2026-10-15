# Selling and operating the paid tier

First time? Work through docs/going-live.md before the first sale.

The system stores a paid-through date and a note. Everything else — the
pitch, the invoice, the check — happens between people.

One team is $400 a season. A whole school — every sport — is $1,800
a year. A district or conference is quoted. A school's first season is free.
Stats are an add-on: $150 per sport per season, or $600 a year for every
sport that keeps stats. They come from wherever the team keeps them —
MaxPreps (football runs on its own, below), Hudl, or the coach's spreadsheet —
and only football from MaxPreps is built today, so set the source up with the
coach before promising another sport a Stats tab.
These lines are the one place those numbers live — change them here and on
the site (`marketing/index.html`) together, and quote whatever they say.

One roster per sport today: the panel has no separate entry for a second level or for boys’ and girls’ teams of the same sport. Say so before a school assumes otherwise.

## What to show a prospect

https://getroster.scottforge.ai — the site. Send this to someone you have not
met.

https://roster.scottforge.ai/oh/demo/ — the demo. Open it on a phone and hand
it over. No login, no setup, nothing to explain first.

It is Millbrook — "Millbrook Tigers" in its header — a school that does not
exist, in Springfield's peach and black with its own MT crest, dressed the way a paying
school's page is. Three sports — Football, Volleyball, Basketball — each
opening the way a paying school's does: keypad, roster, schedule. Football
also carries scores, a forecast at the next kickoff, a standings table for a
conference of five more invented schools, and a Stats tab: sample season
stats for the invented players, with leaders and a player card that goes week
by week. They live in `public/oh/stats/millbrook-demo-football.json`, written
by the same script and in the same shape the MaxPreps job writes for a real
school; the tab reads "Season stats from a sample season", not MaxPreps.

The school is fictional on purpose. For one pitch the demo was the real
Springfield with sample players on it; the site now sends strangers here, and
invented players do not belong on a real school's page in front of them. A
quiet line in the footer says it is all sample data.

It works with no signal once loaded, and it asks the database and the
directory for nothing — safe on a school's guest wifi or in a car park.

**Maintenance:** the page carries a sport that has results on it forward by whole weeks as it ages, so what has been played and what is coming split at today — but only until that sport's own months run out, and a sport with nothing played yet is never moved. The file generated on 2026-10-14 is right through 17 November and first goes stale on 18 November, when volleyball cannot move past November and its 17 November match is left unscored in the past (football follows on 21 November, basketball's opener on 28 November). So run `node scripts/build-demo.mjs` and commit `public/oh/demo.json` and the stats file **by 17 November, again on 1 December, and near the start of each autumn** — and look at the page before any demo that matters. From December to August it shows fixtures and no scores, because nothing in an invented autumn has been played yet — and no Stats tab, because it then removes the stats file (commit the removal). It refuses to write a season that would argue with itself, or a school that turns out to be real, and prints the dates it wrote.

After a re-run that changes how the page looks, re-take the site's
screenshots: `node scripts/shoot-marketing.mjs` (see README, Deploying). Do not re-take them from a file generated out of season: the pictures are of football, which then has no scores, no forecast and a table of 0–0.

## Activate a school (the whole job, ~3 minutes)

1. Open https://roster.scottforge.ai/oh/?manage and sign in (email link).
2. **Activate a school** → search the school → pick it. Its page opens on
   a first sport card: choose the sport, paste their roster spreadsheet (or
   **Import a CSV**, which fills the same box and gets the same review) and
   check the parsed list reads right.
3. On the same page set **Look** (their two colors and the crest) and
   **Billing** (paid-through, which defaults to Feb 1 after the season, and
   the payment in the note: "check #1042, J. Smith, boosters"). For a new
   school these are saved with the first sport.
4. **Save and publish** on the sport card. Their /oh/ page has the keypad
   that second. Save unpublished instead if the check hasn't cleared.

After that, Look and Billing each have their own Save, and write to every
   sport at once. Renew a year moves the date on.

The school list is the dashboard: one line per school, worst first — a
refused sheet, then expired, then live, then unpublished.

### On a phone's home screen

A live paid school installs as its own app: "Add to Home Screen" (Share →
Add to Home Screen on an iPhone) from its page gives the crest as the icon,
the school's name under it, and opens straight onto the school. The icons are
made from the crest at every deploy, so a new crest reaches them within six
hours. The school has to be in `paid-schools.json` for this, as for the
forecast. A crest uploaded on a white square installs as a white square —
the icon builder lifts a flat backdrop off a crest uploaded whole, so upload the full crest (not one cropped at its edges) for the best icon.

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

### Playoff rankings

A paid football page shows its playoff region on the League tab — Division,
Region, every team's Harbin average, the school's own row picked out — with
nothing to set up. It refreshes with the directory, Saturday and Wednesday.
Two things to know: add the school to `paid-schools.json` (that list is which
regions get refreshed), and if the refresh warns that a school "is not in the
regions index", run `node scripts/build-regions.mjs --all` once and commit.
Run that each August too, when the regions are redrawn.

### Past results

A paid football page's Schedule tab gives each opponent's all-time record back
to 2011. That comes from a committed file per school, written by hand: after
adding the school to `paid-schools.json`, run `node scripts/build-history.mjs`
and commit `public/oh/history/`. Until then the page simply shows this season's
meetings and no all-time line. Each winter, bump `TO` in the script to the
season just finished and run it again.

### The conference

On a football activation, ask which conference the school plays in and who
else is in it — that's the whole input the League tab's standings run on;
everything else (who played whom, who won) already lives in the directory
data. Type the conference name and pick the *other* member schools in the
panel; the school itself is in its own table without being picked.

If the school's stats come from MaxPreps, don't type anything: once the stats
job has run for it, the Conference section offers **Fill from MaxPreps** — the
conference as MaxPreps lists it, already matched to our schools. Check the
list (it says so if it couldn't place one), then save the card.

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

### Season stats from MaxPreps (football)

If the coach keeps stats on MaxPreps, the school's football page gets a Stats
tab (Leaders, Offense, Defense, Special) and each Lookup hit shows that
player's season. Nobody types anything after setup.

1. Open the team's football page on MaxPreps and copy its address
   (`https://www.maxpreps.com/oh/<town>/<school>/football/`).
2. In the panel, open the school, open Football, and paste it into
   **Stats** → Set. (The Print link at the bottom of the team's Stats page
   also works, but then the conference can't be filled in from MaxPreps.) (Needs migration 0009. Until it is applied, add the
   school to `maxpreps-teams.json` and `paid-schools.json` instead.) The next
   scheduled run writes the stats file; to have it at once, run the "Refresh
   season stats from MaxPreps" workflow by hand.
3. For MaxPreps' roster as a CSV: add the school to `maxpreps-teams.json` with
   its stats and roster addresses, and to `paid-schools.json`, and run
   `node scripts/maxpreps.mjs --roster`. The CSV lands in `scripts/data/`,
   which is not committed. (Without the `paid-schools.json` line a local run
   skips the school and removes its local stats file.)
4. Give the CSV to the sport's **Import a CSV** in the panel, if the school
   wants MaxPreps' roster rather than its own sheet.

After that `.github/workflows/maxpreps.yml` looks on Saturday, Sunday, Monday
and Wednesday mornings and commits only when the numbers moved. A run that
cannot read the page leaves last week's numbers up and fails, and GitHub's
failed-workflow email is the alert. Stats attach to players by full name, or
by jersey number when the surname agrees, so a player whose name and number
both differ from MaxPreps is simply missing from the tab — fix the roster.
Two players with the same surname and first initial get no stats at all, on
purpose. When a school comes down, take it out of `paid-schools.json` and the
next run removes its stats. Tell the AD this is where the numbers
come from: MaxPreps asks crawlers to stay off its print pages, and this reads
one a few times a week for his team only, at his say-so.

### When an email arrives

The reason is in the subject line and the body. Fans still see the last
good data the whole time — nothing on the fan page breaks while a sync is
refused. Fix the sheet (or tell the coach what to fix) and the next run
sends "Syncing again."

## Mid-season changes

Text arrives: "#7 is now #12." Open the school in the panel, open the sport,
paste the corrected spreadsheet (it replaces the roster), Save. Saving with
nothing pasted keeps the roster as it is.

## Renewals

Rosters go dark on their paid-through date on their own. Next July: open the
panel, every school shows its date; invoice the expiring ones; extend the
date when the check arrives — Billing → Renew a year → Save billing moves
every sport at once.

## Coming down

"Unpublish" on a sport hides it instantly (row kept); "Take this school
down" under Billing unpublishes every sport at once. "Delete this sport"
removes a sport's roster and schedule entirely. A school's removal request is honored same-day, per the
privacy page.

A linked sheet or calendar keeps syncing — and can keep emailing you about a
broken one — whether or not the school is still paying; `paid_through`
lapsing doesn't stop the 15-minute job. Unlink both at the end of an
engagement, not just let the date run out.

## The other tier

"They want their own app like Poland's" — that is the concierge-plus build
(crest, palette, installable icon). It is manual: a teams/<slug>/ entry, a
logo, and a deploy. Price it accordingly.
