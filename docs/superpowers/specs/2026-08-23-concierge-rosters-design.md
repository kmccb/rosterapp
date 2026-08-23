# Concierge rosters: the paid tier, operated by hand

**Date:** 2026-08-23

## Why

The directory at `/oh/` gives every Ohio school its schedule and scores for nothing, and every
school page carries the panel that says the roster is the missing piece. This is the piece that
lets a school say yes.

The first version was going to be self-serve: coach accounts, a claim flow, a paste-your-roster
portal, payment status. It was designed, and then set aside on a better read of the market: the
first customers will be sold in person, and the pitch that closes a booster club is not "create an
account" — it is **"send me your roster spreadsheet, I take care of everything."**

So v1 is concierge. The seller does the work in an admin panel; the school does nothing but hand
over a spreadsheet and a check. Self-serve returns as phase 2 if volume ever demands it, and the
data model is shaped now so that neither phase 2 nor the multi-sport package needs a rebuild.

## The product

**Base tier (~$200/season — the number lives in one place and is the seller's to change):**
the school's existing `/oh/` page gains the two tabs fans actually want — the Lookup keypad and
the Team list — reusing the components the root app already runs, in two school colors picked at
activation. Live through a paid-through date (default Feb 1: season, playoffs, buffer), after
which the page reverts to "roster not added yet" on its own.

**Premium tier (concierge-plus, priced by hand):** the full installable app like Poland's — own
crest, palette, home-screen icon, offline precache. Delivered manually per school, the way Poland,
YSU and Victory Christian already were. The only code this tier gets is a "want your own app?"
mailto link on the paid page.

**Payment is entirely outside the code.** Invoice, check, PO, cash at a game — however the deal
closes. What the system stores is a paid-through date and a free-text note ("check #1042,
booster treasurer J. Smith"). No Stripe, no checkout, no webhooks. When card payments are worth
having, they bolt onto this rather than replacing it.

## Who does what

```
FAN — no account, ever
  /oh/ → their school → keypad → who is #17

SCHOOL — no account either, in v1
  Hands over a spreadsheet. Texts the seller when #7 becomes #12.

SELLER (admin, the only account in the system)
  /oh/manage → activate school → paste roster → review → colors →
  paid-through date → Publish. Edits, unpublishes, deletes the same way.
```

Mid-season roster changes therefore come through the seller. That is the concierge promise
working as intended, and it is also the phase-2 trigger: when the texts become a burden, that is
the demand signal for coach self-serve.

## The admin panel — `/oh/manage`

Lives inside the directory bundle (`src/oh/manage/`), so the Poland regression guard keeps its
jurisdiction over the root app and nothing here can touch it.

- **Sign-in:** Supabase Auth email magic link. Every write function checks an `is_admin` flag on
  the caller's account row; the panel is useless to anyone else who finds the URL. There is no
  sign-up path — the admin account is created once, by hand, in the dashboard.
- **Activate a school:** pick from the 717 (the directory's own search, reused), paste the roster
  into the existing parser and review table (`src/parse/rosterParse.ts` and the Import review
  component — the same path that already handles headers, name orders and height formats), pick
  two colors, set the paid-through date and the payment note, publish.
- **School list:** every activation with its status — live, expiring soon, expired — and per-school
  edit / unpublish / delete.
- Publishing and unpublishing are instant: the fan page reads live data, no build or deploy in the
  loop.

## Data — one migration, the established security posture

Two tables, built exactly the way `shared_roster` already is: **RLS enabled with zero policies,
every grant revoked, access only through security-definer functions.** The public key that ships
in the bundle gets nothing the functions don't hand out.

```
school_account
  id            uuid pk (references auth.users)
  email         text
  is_admin      boolean default false
  created_at    timestamptz

school_roster
  school_slug   text        -- the directory's slug, e.g. "hubbard-hubbard"
  sport         text default 'football'
  season        integer     -- 2026
  players       jsonb       -- same shape the app's roster storage already uses
  colors        jsonb       -- { ground, accent } or null for the default theme
  published     boolean default false
  paid_through  date        -- page goes dark after this on its own
  note          text        -- "check #1042", free text, never shown publicly
  updated_at    timestamptz
  primary key (school_slug, sport, season)
```

Functions:

- `school_roster_fetch(slug, sport)` — public, definer. Of the rows for that school and sport, it
  returns the newest season's players and colors, and only when that row is `published` AND
  `paid_through >= today`. Both conditions live in SQL, not in the client, and `paid_through` is
  the whole notion of currency — a 2026 roster stops serving on its own date without any separate
  "current season" clock to keep right. No function lists, counts or searches across schools —
  the same deliberate omission as the share-code system.
- `school_roster_upsert / unpublish / delete (…)` — definer, first line checks the caller's
  `is_admin`. Delete is a row delete, not a flag.

The share-code system (`shared_roster`, migrations 0001–0003) is untouched and keeps serving the
Poland-style teams.

### Shaped for what comes next, without building it

- **Phase 2, coach self-serve:** `school_roster` gains an owner column when coach accounts exist;
  today every row is implicitly the admin's. `school_account` is already the account table that a
  coach signup would insert into (with `is_admin` false and an ownership link). No rebuild.
- **Phase 3, the sports package:** `sport` is in the primary key and in the fetch signature from
  day one, defaulting `'football'` everywhere the UI touches it. When "every sport at Hubbard" is
  sold, the model already holds it. The data-source note for that future: joeeitel is
  football-only, but ScheduleStar carries every sport a school plays — behind per-school uuids
  that are undiscoverable from outside. The concierge relationship is exactly the channel that
  produces those uuids. The thing that blocks multi-sport schedules today is solved by this sales
  model, not by more scraping.

## The fan page

The school screen in `/oh/` asks `school_roster_fetch(slug, 'football')` alongside the season it
already loads. When a live roster comes back:

- The Lookup keypad and Team list appear as tabs on the school's page, reusing the root app's
  `Keypad` and prefix matching. The Team list is the whole squad by number; the root app's
  area/position filters are deliberately not carried over — a paid page's first version answers
  "who is #17" and "who's on the team", and filters can follow when a school asks.
- The school's two colors are applied as CSS variables scoped to the page.
- The roster is cached in localStorage beside the season, so it survives a dead signal at the
  ground — the same offline rule, and the same eviction rule: kept for the followed school only.
- No live roster: the page is exactly what it is today, panel included.

The fetch failing (offline, or Supabase down) falls back to the cache; neither ever breaks the
schedule and scores, which render regardless.

## Privacy, made explicit

The section a district might one day read:

- **Nothing is public until the seller publishes it.** Payment does not publish; a human does.
- **The invoice is the authorization artifact** — made out to the school or booster organization,
  a paper trail that this organization asked for this roster to be public.
- **Deletion is real.** Unpublish hides instantly; delete removes the row; expiry hides
  automatically. Nothing lingers in a public git history — rosters live only in Supabase,
  which is precisely why they are not committed like the schedule data.
- **Same fields as the paper roster** handed round at a game: number, name, position, height,
  weight, grade. No photos in v1.
- A static `/oh/privacy` page saying all of this in plain language, linked from every roster page.

## Out of scope, deliberately

- Coach accounts, claim flows, self-serve upload (phase 2 — the schema is ready).
- Stripe or any in-app payment (the paid-through date and note are the whole payment system).
- Multi-sport UI and non-football schedules (phase 3 — the schema is ready).
- Photos.
- Renewal automation — next July is a query for expiring schools and twenty emails.
- Any change to the root app. The regression guard continues to enforce this mechanically.

## Testing

- Definer-function conditions pinned in SQL tests or verified via a scripted anon-key client:
  unpublished, expired, and future-season rows return nothing to the public function.
- Admin functions refuse a non-admin caller.
- The fan page with a live roster, with none, and offline-with-cache — component logic covered by
  the same test approach the store already has.
- Roster parsing is already covered; the panel reuses the tested path.
- The Poland guard stays green through every build this work ships in.
