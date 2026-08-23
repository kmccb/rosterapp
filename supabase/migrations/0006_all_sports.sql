-- The all-sports hub: which sports a school has live, and a schedule for
-- the sports the directory cannot feed.
--
-- school_roster was keyed by school + sport + season from the start; this
-- migration is the day that key becomes a product. One new public door
-- (school_roster_sports — what the hub draws) and one new column
-- (schedule — pasted rows, because no scrapeable source exists for
-- volleyball or basketball the way joeeitel feeds football).

begin;

alter table public.school_roster
  add column if not exists schedule jsonb;

comment on column public.school_roster.schedule is
  'Concierge-pasted fixtures for sports the directory cannot feed: [{"date","opponent","home",...}]. Null for football, whose schedule the directory already has.';

-- A season is ~30 games; 100 rows and 100 kB stop a paste of the wrong
-- thing without ever bothering a real schedule.
create or replace function public.school_roster_check_schedule(p_schedule jsonb)
returns void
language plpgsql
as $$
declare
  v_row jsonb;
begin
  if p_schedule is null then return; end if;
  if jsonb_typeof(p_schedule) <> 'array' then
    raise exception 'schedule must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_schedule) > 100 then
    raise exception 'that schedule has too many rows to be a season' using errcode = '22023';
  end if;
  if pg_column_size(p_schedule) > 100000 then
    raise exception 'that schedule is too large to store' using errcode = '22023';
  end if;
  for v_row in select jsonb_array_elements(p_schedule) loop
    if jsonb_typeof(v_row) <> 'object'
       or coalesce(jsonb_typeof(v_row->'date'), 'missing') <> 'string'
       or coalesce(jsonb_typeof(v_row->'opponent'), 'missing') <> 'string' then
      raise exception 'each schedule row needs at least a date and an opponent' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------------ sports

-- The hub's one question: which sports does this school have live? Same
-- gate as fetch — published and paid, on the Eastern clock — and the answer
-- carries sport names only, so an expired school looks exactly like a
-- school that never paid.
create or replace function public.school_roster_sports(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(distinct r.sport), '[]'::jsonb)
  from public.school_roster r
  where r.school_slug = p_slug
    and r.published
    and r.paid_through >= (now() at time zone 'America/New_York')::date;
$$;

-- ------------------------------------------------------------------ fetch

drop function if exists public.school_roster_fetch(text, text);

create function public.school_roster_fetch(p_slug text, p_sport text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'season',   r.season,
           'players',  r.players,
           'colors',   r.colors,
           'theme',    r.theme,
           'schedule', r.schedule
         )
  from public.school_roster r
  where r.school_slug = p_slug
    and r.sport = p_sport
    and r.published
    and r.paid_through >= (now() at time zone 'America/New_York')::date
  order by r.season desc
  limit 1;
$$;

-- ------------------------------------------------------------------ upsert

drop function if exists public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, boolean, date, text);
drop function if exists public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, boolean, date, text);

-- p_schedule follows p_theme's contract: null keeps what is stored, an
-- empty array clears it, an array sets it. A renewal must not lose the
-- schedule it isn't carrying.
create function public.school_roster_upsert(
  p_slug text, p_sport text, p_season integer,
  p_players jsonb, p_colors jsonb, p_theme jsonb, p_schedule jsonb,
  p_published boolean, p_paid_through date, p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_final_players jsonb;
begin
  if not public.school_admin() then
    raise exception 'this account is not the seller''s and may not touch the paid tier'
      using errcode = '42501';
  end if;

  perform public.school_roster_check_players(p_players);
  perform public.school_roster_check_theme(p_theme);
  perform public.school_roster_check_schedule(p_schedule);

  update public.school_roster set
    players      = coalesce(p_players, players),
    colors       = p_colors,
    theme        = case
                     when p_theme is null then theme
                     when p_theme = '{}'::jsonb then null
                     else p_theme
                   end,
    schedule     = case
                     when p_schedule is null then schedule
                     when p_schedule = '[]'::jsonb then null
                     else p_schedule
                   end,
    published    = p_published,
    paid_through = p_paid_through,
    note         = p_note,
    updated_at   = now()
  where school_slug = p_slug and sport = p_sport and season = p_season
  returning players into v_final_players;

  if found then
    if p_published and jsonb_array_length(v_final_players) = 0 then
      raise exception 'a roster cannot be published with nobody on it' using errcode = '22023';
    end if;
    return;
  end if;

  if p_published and (p_players is null or jsonb_array_length(p_players) = 0) then
    raise exception 'a roster cannot be published with nobody on it' using errcode = '22023';
  end if;

  insert into public.school_roster
    (school_slug, sport, season, players, colors, theme, schedule, published, paid_through, note)
  values
    (p_slug, p_sport, p_season, coalesce(p_players, '[]'::jsonb), p_colors,
     case when p_theme = '{}'::jsonb then null else p_theme end,
     case when p_schedule = '[]'::jsonb then null else p_schedule end,
     p_published, p_paid_through, p_note);
end;
$$;

-- -------------------------------------------------------------------- list

create or replace function public.school_roster_list()
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'school_slug',  school_slug,
           'sport',        sport,
           'season',       season,
           'player_count', jsonb_array_length(players),
           'colors',       colors,
           'has_logo',     coalesce(theme ? 'logo', false),
           'has_schedule', schedule is not null,
           'published',    published,
           'paid_through', paid_through,
           'note',         note,
           'updated_at',   updated_at
         )
  from public.school_roster
  where public.school_admin()
  order by school_slug, sport, season desc;
$$;

-- ----------------------------------------------------------------- grants

revoke execute on all functions in schema public from public, anon, authenticated;

-- Everything live gets its grant back — the schema-wide revoke above strips
-- the share-code doors and the school doors alike, so the whole set is
-- re-listed here, as every migration since 0001 has done. Five school_*
-- grants now: sports joins fetch on the anon side.
grant execute on function public.roster_fetch(text) to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text) to anon, authenticated;
grant execute on function public.school_roster_fetch(text, text) to anon, authenticated;
grant execute on function public.school_roster_sports(text) to anon, authenticated;
grant execute on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, boolean, date, text) to authenticated;
grant execute on function public.school_roster_delete(text, text, integer) to authenticated;
grant execute on function public.school_roster_list() to authenticated;

commit;

-- PostgREST caches the function catalog; without this a dropped/recreated
-- signature (school_roster_upsert above) can 404 until the API restarts on
-- its own. Harmless if the listener isn't there.
notify pgrst, 'reload schema';
