-- A crest for the paid page.
--
-- Same shape as 0003, which taught the share system to carry a badge: the
-- logo rides in a jsonb column as a data URI, capped hard enough to stop a
-- phone camera original and generous enough for a detailed crest. Only
-- school_roster_upsert's signature actually changes (8 params to 9);
-- school_roster_fetch is dropped and recreated anyway to swap its body
-- (it gains the theme key), since its signature is untouched. Postgres
-- won't alter a signature in place, and a defaulted parameter would leave
-- the old overload behind to be picked at random.

begin;

alter table public.school_roster
  add column if not exists theme jsonb;

comment on column public.school_roster.theme is
  'The school''s look beyond its two colors: {"logo": <data URI>}. Null when none was uploaded.';

-- The badge is a re-encoded 720px JPEG, normally 40-90 kB before base64.
create or replace function public.school_roster_check_theme(p_theme jsonb)
returns void
language plpgsql
as $$
begin
  if p_theme is null then return; end if;
  if jsonb_typeof(p_theme) <> 'object' then
    raise exception 'theme must be a JSON object' using errcode = '22023';
  end if;
  if pg_column_size(p_theme) > 500000 then
    raise exception 'that logo is too large to store' using errcode = '22023';
  end if;
end;
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
           'season',  r.season,
           'players', r.players,
           'colors',  r.colors,
           'theme',   r.theme
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

drop function if exists public.school_roster_upsert(text, text, integer, jsonb, jsonb, boolean, date, text);
drop function if exists public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, boolean, date, text);

-- p_theme follows p_players' contract: null keeps what is stored, an empty
-- object clears it, an object with a logo sets it. A renewal must not have
-- to re-upload a crest it does not hold.
create function public.school_roster_upsert(
  p_slug text, p_sport text, p_season integer,
  p_players jsonb, p_colors jsonb, p_theme jsonb,
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

  update public.school_roster set
    players      = coalesce(p_players, players),
    colors       = p_colors,
    theme        = case
                     when p_theme is null then theme
                     when p_theme = '{}'::jsonb then null
                     else p_theme
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
    (school_slug, sport, season, players, colors, theme, published, paid_through, note)
  values
    (p_slug, p_sport, p_season, coalesce(p_players, '[]'::jsonb), p_colors,
     case when p_theme = '{}'::jsonb then null else p_theme end,
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
-- re-listed here, as every migration since 0001 has done.
grant execute on function public.roster_fetch(text) to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text) to anon, authenticated;
grant execute on function public.school_roster_fetch(text, text) to anon, authenticated;
grant execute on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, jsonb, boolean, date, text) to authenticated;
grant execute on function public.school_roster_delete(text, text, integer) to authenticated;
grant execute on function public.school_roster_list() to authenticated;

commit;

-- PostgREST caches the function catalog; without this a dropped/recreated
-- signature (school_roster_upsert above) can 404 until the API restarts on
-- its own. Harmless if the listener isn't there.
notify pgrst, 'reload schema';
