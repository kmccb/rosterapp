-- Runs the sync-sources Edge Function every fifteen minutes. Applied by hand,
-- once, in the dashboard SQL editor — after the function is deployed and its
-- CRON_SECRET is set. Not a numbered migration: it names this project's URL
-- and a secret, and the repo is public.
--
-- Before running: Database → Extensions → enable pg_cron and pg_net.
-- Replace the two values in angle brackets. The secret must equal the
-- function's CRON_SECRET (supabase secrets set CRON_SECRET=...).

select vault.create_secret('<the same value as CRON_SECRET>', 'sync_sources_cron_secret');

select cron.schedule(
  'sync-sources',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/sync-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_sources_cron_secret')
    ),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- To stop it:   select cron.unschedule('sync-sources');
-- To see runs:  select * from cron.job_run_details order by start_time desc limit 20;
