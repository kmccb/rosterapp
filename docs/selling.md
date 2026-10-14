# Selling and operating the paid tier

First time? Work through docs/going-live.md before the first sale.

The system stores a paid-through date and a note. Everything else — the
pitch, the invoice, the check — happens between people.

The base tier is $200/season. This line is the one place that number lives —
change it here, and quote whatever it says.

## What to show a prospect

https://roster.scottforge.ai/oh/demo/ — open it on a phone and hand it over.
No login, no setup, nothing to explain first.

It is the **real** Springfield (New Middletown), the school the sales video
was made for, as its page would look the day it signed up. Black and orange,
the tiger crest, and three sports — Football, Volleyball, Basketball — each
opening the way a paying school's does: keypad, roster, schedule.

What is sample and what is real:

- **Sample:** the rosters (football starts from the video's players, #24
  Marcus Bell included), the colors and crest (what the seller would upload),
  and the volleyball and basketball schedules (what the seller would paste),
  played against the real MVAC Scarlet schools. No player stats — the app has
  none, so the demo shows none, whatever the video shows.
- **Real:** the football schedule, scores and the MVAC Scarlet standings on
  the League tab. They come from the directory, exactly as a paying school's
  do, and stay current with its Saturday and Wednesday refreshes. A quiet line
  in the footer says so: "Sample rosters — the football schedule, scores and
  standings are real."

This deliberately reverses the rule the old demo kept — no invented players on
a real school's page — for this one prospect, because the strongest thing the
demo can show an athletic director is their own season, live. The real
Springfield page at `/oh/springfield` is untouched: the sample rosters only
ever appear at `/oh/demo/`. **When Springfield buys, or the pitch moves on,**
move the demo to the next prospect (change the slug, colors, crest, rosters
and conference in `scripts/build-demo.mjs`) or back to a fictional school —
don't leave a former prospect's page dressed with invented players.

`springfield-new-middletown` is in `paid-schools.json` so the demo can show
the real kickoff forecast. That forecast also shows on Springfield's real,
free page — a free taste of the paid tier. **Take it out of
`paid-schools.json` if they don't buy.**

It needs a signal. The rosters and schedules for the other sports are baked
into the page, and it asks the database for nothing, but the football season,
the League tab and the forecast are fetched from the directory like any
school's. On a school's guest wifi that is fine; in a car park with no bars,
football will not load.

**Maintenance:** football looks after itself. For the pasted sports, the page
carries a schedule that has results (volleyball, in the autumn) forward by
whole weeks as it ages, so what has been played and what is coming split at
today — but only until that sport's own months run out. A schedule with
nothing played on it (basketball, before November) is never moved; it is
already dated inside its own season. So run `node scripts/build-demo.mjs` and
commit `public/oh/demo.json` **twice a year**: near the start of the autumn,
and again in December once volleyball is over (it rewrites the autumn as next
year's fixtures and starts basketball from a fortnight ahead). It refuses to
write a season that would argue with itself or a conference Springfield
doesn't actually play, and prints the dates it wrote.

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
page opens on a hub instead of straight to the roster. Pricing for the
all-sports package isn't set yet.

### Playoff rankings

A paid football page shows its playoff region on the League tab — Division,
Region, every team's Harbin average, the school's own row picked out — with
nothing to set up. It refreshes with the directory, Saturday and Wednesday.
Two things to know: add the school to `paid-schools.json` (that list is which
regions get refreshed), and if the refresh warns that a school "is not in the
regions index", run `node scripts/build-regions.mjs --all` once and commit.
Run that each August too, when the regions are redrawn.

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

### Season stats from MaxPreps (football)

If the coach keeps stats on MaxPreps, the school's football page gets a Stats
tab (Leaders, Offense, Defense, Special) and each Lookup hit shows that
player's season. Nobody types anything after setup.

1. On the team's MaxPreps Stats page, the **Print** link at the bottom is the
   address to copy; the Roster page's address is the other one.
2. In the panel, open the school, open Football, and paste the Print address
   into **Stats** → Set. (Needs migration 0009. Until it is applied, add the
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
