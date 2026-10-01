-- Sources that keep themselves current.
--
-- A roster can now come from a Google Sheet the coach already keeps, and a
-- non-football schedule from the calendar the school already publishes. The
-- links live here, behind the seller's login — the repo is public and some
-- calendar links carry a personal token. A job run every fifteen minutes
-- (supabase/functions/sync-sources) reads them, checks what it fetched, and
-- writes only what passes. The fan page reads exactly what it read before:
-- school_roster_fetch builds its answer key by key and none of these columns
-- is one of them.
--
-- Only additions. school_roster_upsert keeps its eleven parameters, so unlike
-- 0007 there is no window in which the panel's saves are broken.

begin;

alter table public.school_roster
  add column if not exists roster_source_url text,
  add column if not exists schedule_source_url text,
  add column if not exists schedule_source_filter text,
  add column if not exists sync_state jsonb not null default '{}'::jsonb;

comment on column public.school_roster.roster_source_url is
  'A Google Sheet published to the web as CSV. While set, the sync job owns players.';
comment on column public.school_roster.schedule_source_url is
  'An iCal link. While set, the sync job owns schedule. Never set for football, whose schedule is the directory''s.';
comment on column public.school_roster.schedule_source_filter is
  'Text an event must contain to count, for calendars that carry every sport (Eventlink).';
comment on column public.school_roster.sync_state is
  '{"roster": SideState, "schedule": SideState} — last success, current problem, whether the seller has been emailed.';

-- The panel's way of asking "am I the seller?" with a session the sync
-- function was handed. school_roster_list answers an empty set to anybody
-- else, which a caller can't tell from "no rows yet"; this answers false.
create or replace function public.school_admin_check()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.school_admin();
$$;

-- Links are set and cleared here, never through upsert, so a renewal can't
-- drop them by not carrying them. Changing or clearing a link forgets that
-- side's sync history — a new link's problems are its own.
create or replace function public.school_roster_set_sources(
  p_slug text, p_sport text, p_season integer,
  p_roster_url text, p_schedule_url text, p_schedule_filter text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filter text := nullif(btrim(coalesce(p_schedule_filter, '')), '');
begin
  if not public.school_admin() then
    raise exception 'this account is not the seller''s and may not touch the paid tier'
      using errcode = '42501';
  end if;
  if p_roster_url is not null and p_roster_url !~ '^https://docs\.google\.com/spreadsheets/' then
    raise exception 'a roster link must be a Google Sheet published to the web' using errcode = '22023';
  end if;
  if p_schedule_url is not null and p_schedule_url !~ '^https://' then
    raise exception 'a calendar link must start with https://' using errcode = '22023';
  end if;
  if p_schedule_url is not null and p_sport = 'football' then
    raise exception 'football''s schedule comes from the directory and takes no calendar link'
      using errcode = '22023';
  end if;
  if length(coalesce(p_roster_url, '')) > 2000 or length(coalesce(p_schedule_url, '')) > 2000
     or length(coalesce(v_filter, '')) > 200 then
    raise exception 'that link is too long to be a real one' using errcode = '22023';
  end if;

  update public.school_roster set
    sync_state = (sync_state
      - (case when roster_source_url is distinct from p_roster_url then 'roster' else '' end))
      - (case when schedule_source_url is distinct from p_schedule_url
                or schedule_source_filter is distinct from v_filter then 'schedule' else '' end),
    roster_source_url      = p_roster_url,
    schedule_source_url    = p_schedule_url,
    schedule_source_filter = case when p_schedule_url is null then null else v_filter end
  where school_slug = p_slug and sport = p_sport and season = p_season;

  if not found then
    raise exception 'there is no activation for that school, sport and season' using errcode = 'P0002';
  end if;
end;
$$;

-- Everything the job needs to decide whether anything changed: the links,
-- the history, and what fans see now.
create or replace function public.school_roster_sync_targets()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'slug',                   school_slug,
           'sport',                  sport,
           'season',                 season,
           'roster_source_url',      roster_source_url,
           'schedule_source_url',    schedule_source_url,
           'schedule_source_filter', schedule_source_filter,
           'sync_state',             sync_state,
           'players',                players,
           'schedule',               schedule
         )
  from public.school_roster
  where roster_source_url is not null or schedule_source_url is not null
  order by school_slug, sport, season desc;
$$;

-- The job's only write. It can touch players, schedule and sync_state and
-- nothing else — colors, crest, published, paid-through and league are the
-- seller's. Each half only lands while its link is still set, so a sync that
-- was already running when the seller pressed Unlink can't write over the
-- roster they just took back.
create or replace function public.school_roster_sync_apply(
  p_slug text, p_sport text, p_season integer,
  p_players jsonb, p_schedule jsonb, p_sync_state jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_players is not null then
    perform public.school_roster_check_players(p_players);
    if jsonb_array_length(p_players) = 0 then
      raise exception 'a synced roster cannot be empty' using errcode = '22023';
    end if;
  end if;
  perform public.school_roster_check_schedule(p_schedule);
  if p_sync_state is null or jsonb_typeof(p_sync_state) <> 'object' then
    raise exception 'sync state must be a JSON object' using errcode = '22023';
  end if;

  update public.school_roster set
    players    = case when roster_source_url is not null then coalesce(p_players, players) else players end,
    schedule   = case when schedule_source_url is not null then coalesce(p_schedule, schedule) else schedule end,
    sync_state = p_sync_state,
    updated_at = case
                   when (p_players is not null and roster_source_url is not null)
                     or (p_schedule is not null and schedule_source_url is not null)
                   then now() else updated_at
                 end
  where school_slug = p_slug and sport = p_sport and season = p_season;
end;
$$;

-- --------------------------------------------------------------------- list

create or replace function public.school_roster_list()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'school_slug',            school_slug,
           'sport',                  sport,
           'season',                 season,
           'player_count',           jsonb_array_length(players),
           'colors',                 colors,
           'has_logo',               coalesce(theme ? 'logo', false),
           'has_schedule',           schedule is not null,
           'has_league',             league is not null,
           'published',              published,
           'paid_through',           paid_through,
           'note',                   note,
           'updated_at',             updated_at,
           'roster_source_url',      roster_source_url,
           'schedule_source_url',    schedule_source_url,
           'schedule_source_filter', schedule_source_filter,
           'sync_state',             sync_state
         )
  from public.school_roster
  where public.school_admin()
  order by school_slug, sport, season desc;
$$;

-- ----------------------------------------------------------------- grants

revoke execute on all functions in schema public from public, anon, authenticated;

-- Everything live gets its grant back, as every migration since 0001 has
-- done: four roster_* and five school_* as in 0007, plus the seller's two
-- new doors. The job's two functions go to service_role alone — no browser
-- ever holds that key.
grant execute on function public.roster_fetch(text) to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text) to anon, authenticated;
grant execute on function public.school_roster_fetch(text, text) to anon, authenticated;
grant execute on function public.school_roster_sports(text) to anon, authenticated;
grant execute on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, date, text) to authenticated;
grant execute on function public.school_roster_delete(text, text, integer) to authenticated;
grant execute on function public.school_roster_list() to authenticated;
grant execute on function public.school_admin_check() to authenticated;
grant execute on function public.school_roster_set_sources(text, text, integer, text, text, text) to authenticated;
grant execute on function public.school_roster_sync_targets() to service_role;
grant execute on function public.school_roster_sync_apply(text, text, integer, jsonb, jsonb, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';
