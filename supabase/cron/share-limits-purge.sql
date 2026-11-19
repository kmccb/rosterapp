-- Clears expired share codes and old publishing counts every night. Applied by
-- hand, once, in the dashboard SQL editor, after migration 0011. Not a numbered
-- migration, so 0011 cannot fail on a database where pg_cron is off.
--
-- pg_cron is already enabled: sync-sources runs on it (see sync-sources.sql).
-- 08:17 UTC is the small hours in Ohio, well away from anyone publishing.

select cron.schedule(
  'share-limits-purge',
  '17 8 * * *',
  $$ select public.share_limits_purge(); $$
);

-- To stop it:   select cron.unschedule('share-limits-purge');
-- To see runs:  select * from cron.job_run_details order by start_time desc limit 20;
