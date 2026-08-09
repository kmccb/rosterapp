# Setting up the shared team database

The app works with no backend at all — the roster just lives on whichever phone
typed it in. This guide adds the shared database so every parent sees the same
roster.

Cost: nothing. Supabase's free tier is far beyond a football team's needs.

**Roughly 15 minutes, once.** You'll need the [Supabase CLI](https://supabase.com/docs/guides/cli)
for step 4 (`npm install -g supabase`, or `scoop install supabase` on Windows).

---

## 1. Create the project

Sign up at [supabase.com](https://supabase.com), create a project, pick a region
near you, and save the database password somewhere. Note the **project ref** —
the random-looking string in your project URL.

## 2. Create the tables

Project → **SQL Editor** → paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.

That creates the tables and — importantly — turns row level security on with no
policies. The practical effect is that the database is unreachable from a
browser. Only the edge function, which holds the service key, can touch it.

## 3. Create your team and its two codes

Pick two codes. The **team code** goes to every parent and gives read-only
access. The **editor code** goes to you and anyone helping, and also allows
importing. Make them different from each other, and don't reuse a password you
use anywhere else.

Locally, in the repo:

```sh
node scripts/make-team-sql.mjs "Central High Bulldogs" 2026 <team-code> <editor-code>
```

That prints an `insert` statement with both codes hashed (PBKDF2-SHA256). Paste
it into the SQL Editor and run it. The plaintext codes are never stored — if you
forget one you'll set a new one, not recover it.

## 4. Deploy the API

```sh
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# A long random string used to sign sign-in tokens. Keep it private.
supabase secrets set SESSION_SECRET="$(openssl rand -base64 48)"
supabase secrets set ALLOWED_ORIGIN="https://roster.scottforge.ai"

supabase functions deploy api --no-verify-jwt
```

`--no-verify-jwt` is deliberate: the function does its own auth against the team
code, so it must be reachable without a Supabase JWT.

On Windows PowerShell, generate the secret with:

```powershell
supabase secrets set SESSION_SECRET="$([Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 })))"
```

## 5. Point the app at it

Local development — create `.env.local`:

```
VITE_API_URL=https://YOUR-PROJECT-REF.supabase.co/functions/v1/api
```

Deployed builds — GitHub → repo **Settings → Secrets and variables → Actions →
Variables → New repository variable**, named `VITE_API_URL`, same value. The
deploy workflow reads it. It's a public endpoint rather than a secret; the team
code is what guards the data.

Then `npm run dev` (or push to `main`) and the app should ask for a team code.

---

## Living with it

- **Sharing a code**: anyone with the team code can read the roster. Hand it out
  the way you'd hand out a team group-chat invite, and no more widely.
- **Rotating a code**: Settings → Access codes, as an editor. Everyone using the
  old one has to re-enter the new one.
- **Removing one person** isn't possible with shared codes — that's the
  trade-off you accepted versus per-parent email invites. Changing the code
  removes everyone until they get the new one.
- **Offline**: each phone keeps a copy of the last roster it downloaded, so
  lookups work with no signal. Changes made by an editor reach a parent's phone
  the next time it has a connection.

## What's stored

Player name, jersey number, position, height, weight and grade year — the same
things on the sheet handed round at a game. These are minors, and the data is
now on a server rather than one phone, so keep the codes tight and don't publish
them anywhere public.

Nothing about the parents is stored: no accounts, no emails, no analytics. The
only record of who signed in is a rate-limiting table keyed by a hash of the IP
address, swept continuously.
