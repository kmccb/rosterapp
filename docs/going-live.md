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
