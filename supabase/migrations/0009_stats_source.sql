-- Where a school's season stats come from, set in the panel.
--
-- Until now the MaxPreps page a team's stats are read from lived in
-- maxpreps-teams.json, so adding a school meant a commit. The link moves here,
-- beside the sheet and calendar links of 0008, and the scheduled job
-- (scripts/maxpreps.mjs, run by GitHub) asks the database which pages to read.
-- That job holds only the anon key — the same one every browser holds — so the
-- question it asks is answered through a door of its own that gives away three
-- things about a row and only while the row is published and paid: the school,
-- the sport, and the MaxPreps address, which is a public page on a public site.
-- The fan page reads exactly what it read before: school_roster_fetch builds
-- its answer key by key and this column is not one of them.
--
-- Only additions. No existing function changes its parameters or what it
-- returns — school_roster_list still answers setof jsonb and simply carries
-- one more key — so there is no window in which the panel's saves are broken.

begin;

alter table public.school_roster
  add column if not exists stats_source_url text;

-- Dropped and added by name rather than written inline on the column, so a
-- second apply re-states the rule instead of skipping it along with the column.
alter table public.school_roster
  drop constraint if exists school_roster_stats_source_url_check;
alter table public.school_roster
  add constraint school_roster_stats_source_url_check check (
    stats_source_url is null
    or (stats_source_url ~ '^https://www\.maxpreps\.com/\S*$' and length(stats_source_url) <= 2000)
  );

comment on column public.school_roster.stats_source_url is
  'The team''s printable stats page on www.maxpreps.com. While set, published and paid, the scheduled job keeps public/oh/stats/<slug>-<sport>.json current from it.';

-- New in this file, so dropped first: applying it twice must succeed, and a
-- function whose return type was ever edited between applies can't be replaced.
drop function if exists public.school_roster_set_stats_source(text, text, integer, text);
drop function if exists public.school_stats_targets();

-- Set and cleared here, never through upsert, for the reason 0008's links
-- are: a renewal can't drop it by not carrying it. Null or blank clears. The
-- slash after the host is the point of the pattern — without it
-- www.maxpreps.com.somewhere-else.example would pass.
create function public.school_roster_set_stats_source(
  p_slug text, p_sport text, p_season integer, p_url text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not public.school_admin() then
    raise exception 'this account is not the seller''s and may not touch the paid tier'
      using errcode = '42501';
  end if;
  if length(coalesce(v_url, '')) > 2000 then
    raise exception 'that link is too long to be a real one' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~ '^https://www\.maxpreps\.com/\S*$' then
    raise exception 'a stats link must be a page on https://www.maxpreps.com' using errcode = '22023';
  end if;

  update public.school_roster set
    stats_source_url = v_url
  where school_slug = p_slug and sport = p_sport and season = p_season;

  if not found then
    raise exception 'there is no activation for that school, sport and season' using errcode = 'P0002';
  end if;
end;
$$;

-- The scheduled job's question: whose stats pages do I read? It is answered
-- for the row school_roster_fetch would serve — the newest season that is
-- published and paid today, Eastern — and only if that row carries a link, so
-- last season's link can't outlive this season's activation. Three keys and
-- no others: a row's players, colors, note and paid-through stay behind the
-- seller's login.
create function public.school_stats_targets()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'slug',             live.school_slug,
           'sport',            live.sport,
           'stats_source_url', live.stats_source_url
         )
  from (
    select distinct on (r.school_slug, r.sport)
           r.school_slug, r.sport, r.stats_source_url
    from public.school_roster r
    where r.published
      and r.paid_through >= (now() at time zone 'America/New_York')::date
    order by r.school_slug, r.sport, r.season desc
  ) live
  where live.stats_source_url is not null
  order by live.school_slug, live.sport;
$$;

-- --------------------------------------------------------------------- list

-- 0008's body, to the letter, with one more key for the panel to show the
-- link it set. Same name, same parameters, same setof jsonb.
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
           'sync_state',             sync_state,
           'stats_source_url',       stats_source_url
         )
  from public.school_roster
  where public.school_admin()
  order by school_slug, sport, season desc;
$$;

-- ----------------------------------------------------------------- grants

revoke execute on all functions in schema public from public, anon, authenticated;

-- Everything live gets its grant back, as every migration since 0001 has
-- done: the thirteen of 0008 unchanged, plus the seller's new door and the
-- stats job's. school_stats_targets goes to anon because the job that calls
-- it runs on GitHub with the key the site's own bundle ships.
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
grant execute on function public.school_roster_sync_apply(text, text, integer, text, text, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.school_roster_set_stats_source(text, text, integer, text) to authenticated;
grant execute on function public.school_stats_targets() to anon, authenticated;

commit;

notify pgrst, 'reload schema';
