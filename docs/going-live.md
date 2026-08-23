# Going live: verifying the paid tier after 0004

This is the check to run once, after `0004_school_roster.sql` is applied to
a real database and before the first school is sold. It is not a substitute
for the test suite — it is the part the test suite cannot see: the actual
migration applied to the actual database, the actual auth allowlist, the
actual deployed bundle.

Work through it in order. Every item should come back true before the first
invoice goes out.

1. **Apply 0004 twice.** The second apply must succeed unchanged — that is
   what all the `do $$ ... exception when duplicate_object` guards and the
   `create table if not exists` clauses are for. If the second apply errors,
   something in the migration is not actually idempotent yet.

2. **Run the roster-shape check.** `node scripts/verify-school-roster.mjs`
   should report 6 ok.

3. **Smoke the share codes.** Create, fetch, update, and delete a share
   code. This exercises the four `roster_*` re-grants that 0004's
   schema-wide `revoke execute` makes necessary — a re-grant missed here
   breaks the free tier, not the paid one, which is why it is easy to miss.

4. **Make the seller's account by hand.** Create the admin auth user, then a
   `school_account` row for it with `is_admin = true`. There is no signup
   flow that does this — `create_user: false` on the magic-link request sees
   to that.

5. **Add the redirect URL to the auth allowlist.** The literal URL
   `https://roster.scottforge.ai/oh/?manage`, plus the localhost variant for
   local testing. Query strings don't reliably match wildcard redirect
   rules, so the full URL has to be listed, not a pattern.

6. **Sign in end to end.** Request the link, click it, land back on
   `?manage` signed in. Confirm the address bar carries no `access_token` —
   Manage.tsx strips it with `history.replaceState` the moment it reads the
   hash, and this is the one place to see that actually happen.

7. **Unpublished row → anon fetch returns null.** A row that exists but
   isn't published must be invisible on the public fetch path.

8. **Published → returns the roster.** The same row, published, returns the
   roster on the public fetch path.

9. **Paid-through yesterday → null again.** A phone that had the roster
   cached goes dark on its next reload too — the cache-eviction half of
   `loadSchoolRoster`, not just the server side.

10. **A future-season row with a past paid-through does not outrank the
    live row.** Season order alone must not let an expired, higher-numbered
    season shadow the one that's actually live.

11. **A second, non-admin account gets nothing.** `school_roster_list`
    returns `[]`, and an upsert or delete errors. Delete that test account
    when done — it should never linger next to the real seller account.

12. **The renewal contract holds.** Save with an empty paste on a published
    row of N players — the row should still have N players afterward. If it
    errors "players must be a JSON array" instead, PostgREST sent a JSON
    `null` rather than a SQL `NULL`, and `school_roster_check_players` needs
    `jsonb_typeof(p_players) = 'null'` folded into its null check alongside
    the existing `p_players is null` branch.

13. **Publishing zero players is refused, both ways.** A brand-new row with
    no roster pasted, and an existing row whose roster paste was cleared —
    neither may publish.

14. **The fan page looks like the fan page.** Keypad, Team tab, the school's
    two colors, and no trace of the seller's panel anywhere on it.

15. **Airplane mode still shows the cached roster.** Turn off the signal
    after a roster has loaded once; reload; the roster the phone already
    has should still render.

16. **Switching schools evicts the old cache.** Following a different
    school clears `oh.roster.<old-slug>` — it should not survive the
    switch.

17. **The deploy changes nothing it shouldn't.** Poland, YSU, and Victory
    Christian come out of the build byte-identical, and `/oh/?privacy`
    still resolves.

## v2: the crest and the tabs

This section applies `0005_school_theme.sql` to a database that already has
0004 applied, and verifies the paid tier now carries logos and full theming.
The 0004 sweep above was never run end-to-end before the first school went
live — those 17 items must complete before 0005 ships to production.

### Do these first

Work through all 17 items in the 0004 section above before starting 0005. Then:

**Unpublish and delete the Strasburg-Franklin test roster.** It carries two
invented players and has been live on the public roster page. It exists only
to prove the panel works — remove it before the v2 schema change ships.

### The deployment sequence

These steps must happen in order. Going out of sequence breaks the old panel's
writes until the new bundle is live.

1. **Merge and push to main.** All v2 code is production-ready; 0005 is
   idempotent and guarded.

2. **Wait for the deploy to go green.** The new bundle is now live but the
   database still holds the old schema. The panel and the fan page both keep
   working. Users may not see full theming or logos yet — they come when the
   schema does.

3. **Apply `0005_school_theme.sql` in the Supabase SQL editor.** The upsert
   function signature gains a `p_theme` parameter. If you apply this before
   the new bundle is live, the old panel's saves fail with PGRST202 until the
   new code ships — PostgREST cannot route the old 8-param call to the new
   9-param function. The public fan page is unaffected throughout.

4. **Apply 0005 a second time — it must succeed unchanged.** This proves
   idempotency. The file carries both the old and new `drop function` lines
   for `school_roster_upsert`, so a re-run cleanly drops both signatures
   before recreate, and both overloads of `school_roster_list` remain present.
   If it errors, something in the migration is not actually idempotent.

5. **If the panel then reports "Could not find the function", reload the
   schema cache.** In Supabase, go to Settings → API → Reload Schema. The
   migration ends with `notify pgrst, 'reload schema';`, which usually handles
   this automatically — but if PostgREST is not listening, a manual reload
   ensures it sees the new 9-param upsert signature. The fan page needs no
   action.

### v2 verification

Once 0005 is applied and the schema reload is done:

1. **Run the roster-shape check.** `node scripts/verify-school-roster.mjs`
   should report 6 ok. It now probes the 9-param upsert with `p_theme: null`,
   exercising the real signature.

2. **The renewal contract extended.** Save a published row with an empty theme
   paste (omit the theme field entirely, or send `null`). If the row already
   has a stored logo, it must survive — the panel's "save without re-uploading"
   workflow depends on this. Confirm the logo is still there in the list.

3. **Clearing the logo works.** Send `{"theme": {}}` on the same row. The logo
   should disappear from the list after the save.

4. **Fetch returns theme only when live.** Publish a row with a logo and paid
   through tomorrow. Call `school_roster_fetch` with that slug and sport — it
   should return the theme. Unpublish the same row and call again — it should
   return null (anon sees nothing). Set paid-through to yesterday and call
   again — null. Fetch is strict: the roster appears to anon only when all
   three gates close (published, paid, future-dated).

5. **Upload a real crest and eyeball the fan page.** In the panel, pick a
   published, paid row with players. Upload an image as the logo (the panel
   resizes it to 720px JPEG). Reload the fan page for that school. Confirm:
   the crest sits behind the scrim at the top; the full page uses the school's
   two colors (background, chrome, surfaces, accent); the three tabs (Lookup,
   Team, Schedule) render at the top; fixture dates stack as `MON / 01` with
   no overlap at 375px phone width.

6. **The guard line stays green.** Build the app one more time. The Poland
   guard in the build log shows the guard row unchanged — Poland's output is
   byte-identical before and after the theming logic added to the oh bundle.
