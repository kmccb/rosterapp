-- The school stops being a list of sports and becomes an identity.
--
-- Two things happen here. The hub's one public door, school_roster_sports,
-- grows from a bare array of sport names into the school itself — which
-- sports are live, and the colors and crest to paint the whole page in,
-- including the hub, which until now sat in the default navy no matter what
-- the school had uploaded. And a league column arrives: the conference the
-- school told us it plays in, which is the one fact a conference table
-- cannot be computed without. Everything else the table needs — who played
-- whom and who won — is already in the committed directory data.
--
-- Nothing here widens what an unpaid or expired school gives away: every
-- new value comes out of the same published-and-paid gate the fetch has
-- always stood behind.

begin;

alter table public.school_roster
  add column if not exists league jsonb;

comment on column public.school_roster.league is
  'The conference the school told us it plays in: {"name": "Inter-Valley", "members": [<school slug>, …]}. Null when they have not told us — no source scrapes conference membership.';

-- A conference is a dozen schools; 40 slugs and 20 kB stop a paste of the
-- wrong thing without ever bothering a real one. The '{}' case returns
-- early because that is the upsert's clear sentinel — it is checked before
-- the case that turns it into a null column, so refusing it for having no
-- name would leave the seller no way to take a league back off a school.
create or replace function public.school_roster_check_league(p_league jsonb)
returns void
language plpgsql
as $$
declare
  v_member jsonb;
begin
  if p_league is null or p_league = '{}'::jsonb then return; end if;
  if jsonb_typeof(p_league) <> 'object' then
    raise exception 'league must be a JSON object' using errcode = '22023';
  end if;
  -- coalesce, not a bare comparison: jsonb_typeof of an absent key is SQL
  -- NULL, NULL <> 'string' is NULL, and plpgsql treats a NULL condition as
  -- false — so without this a league with no name at all would sail past
  -- the very check written to stop it.
  if coalesce(jsonb_typeof(p_league->'name'), 'missing') <> 'string' then
    raise exception 'a league needs a name' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_league->'members'), 'missing') <> 'array' then
    raise exception 'a league needs a members array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_league->'members') > 40 then
    raise exception 'that is more schools than a conference has' using errcode = '22023';
  end if;
  if pg_column_size(p_league) > 20000 then
    raise exception 'that league is too large to store' using errcode = '22023';
  end if;
  for v_member in select jsonb_array_elements(p_league->'members') loop
    if jsonb_typeof(v_member) <> 'string' or btrim(v_member #>> '{}') = '' then
      raise exception 'each league member must be a school slug' using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- --------------------------------------------------------------- identity

drop function if exists public.school_roster_sports(text);

-- What the whole school page asks first: who is this school?
--
-- The answer is the sports it has live plus the look to draw them in. The
-- look used to arrive with the roster, which meant the hub — the screen in
-- front of every multi-sport school — had no roster and therefore no colors
-- and no crest. Asking here means the school is themed before a sport is
-- even chosen.
--
-- colors and theme are each answered by the best row that actually carries
-- one, rather than by a single winning row: the seller uploads a crest once,
-- on whichever sport they happened to be activating, and a school that put
-- its crest on volleyball must not lose it because football sorted first.
-- Football wins the tie because it is the row that exists for every school
-- and the one whose colors were set first. Both subqueries read `live`, so
-- neither can return anything from a row that failed the published-and-paid
-- gate; an expired school still looks exactly like a school that never paid.
create function public.school_roster_sports(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with live as (
    select r.sport, r.colors, r.theme, r.updated_at
    from public.school_roster r
    where r.school_slug = p_slug
      and r.published
      and r.paid_through >= (now() at time zone 'America/New_York')::date
  )
  select jsonb_build_object(
           'sports', (select coalesce(jsonb_agg(distinct sport), '[]'::jsonb) from live),
           'colors', (select colors from live
                      where colors is not null
                      order by (sport = 'football') desc, updated_at desc
                      limit 1),
           'theme',  (select theme from live
                      where theme is not null
                      order by (sport = 'football') desc, updated_at desc
                      limit 1)
         );
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
           'schedule', r.schedule,
           'league',   r.league
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

drop function if exists public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, boolean, date, text);
drop function if exists public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, date, text);

-- p_league follows p_theme's contract rather than p_schedule's, because a
-- league is an object: null keeps what is stored, an empty object clears it,
-- an object with a name and members sets it. A renewal must not lose the
-- conference it isn't carrying.
create function public.school_roster_upsert(
  p_slug text, p_sport text, p_season integer,
  p_players jsonb, p_colors jsonb, p_theme jsonb, p_schedule jsonb, p_league jsonb,
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
  perform public.school_roster_check_league(p_league);

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
    league       = case
                     when p_league is null then league
                     when p_league = '{}'::jsonb then null
                     else p_league
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
    (school_slug, sport, season, players, colors, theme, schedule, league, published, paid_through, note)
  values
    (p_slug, p_sport, p_season, coalesce(p_players, '[]'::jsonb), p_colors,
     case when p_theme = '{}'::jsonb then null else p_theme end,
     case when p_schedule = '[]'::jsonb then null else p_schedule end,
     case when p_league = '{}'::jsonb then null else p_league end,
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
           'has_league',   league is not null,
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
-- re-listed here, as every migration since 0001 has done. Still four
-- roster_* and five school_*; only upsert's signature moved, to eleven
-- parameters.
grant execute on function public.roster_fetch(text) to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text) to anon, authenticated;
grant execute on function public.school_roster_fetch(text, text) to anon, authenticated;
grant execute on function public.school_roster_sports(text) to anon, authenticated;
grant execute on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, date, text) to authenticated;
grant execute on function public.school_roster_delete(text, text, integer) to authenticated;
grant execute on function public.school_roster_list() to authenticated;

commit;

-- PostgREST caches the function catalog; without this a dropped/recreated
-- signature (school_roster_upsert above) can 404 until the API restarts on
-- its own. Harmless if the listener isn't there.
notify pgrst, 'reload schema';
