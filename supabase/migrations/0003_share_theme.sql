-- Carry a team's badge and colours with its roster.
--
-- This is what lets a second school use the same site without a second
-- deployment: the badge and the palette taken from it ride along with the
-- share, so opening their link dresses the app in their colours. Without it
-- every phone would show the team the site was originally built for.
--
-- Same shape as 0002. The two writers gain a parameter and roster_fetch changes
-- its return type, so all three are dropped and recreated — Postgres won't alter
-- a signature in place, and a defaulted parameter would leave the old overload
-- behind to be picked at random.

alter table public.shared_roster
  add column if not exists theme jsonb not null default '{}'::jsonb;

comment on column public.shared_roster.theme is
  'The publishing device''s theme: a badge as a data URI plus the palette derived from it.';

-- The badge is a re-encoded 720px JPEG, normally 40-90 kB before base64. The
-- ceiling is generous enough for a detailed crest and mean enough to stop a
-- phone camera original going up untouched.
create or replace function public.roster_check_theme(p_theme jsonb)
returns void
language plpgsql
as $$
begin
  if p_theme is null then return; end if;

  if jsonb_typeof(p_theme) <> 'object' then
    raise exception 'theme must be a JSON object' using errcode = '22023';
  end if;

  if pg_column_size(p_theme) > 500000 then
    raise exception 'that badge is too large to share' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------- read

drop function if exists public.roster_fetch(text);

create function public.roster_fetch(p_code text)
returns table (
  team_name  text,
  season     text,
  players    jsonb,
  stats      jsonb,
  theme      jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select r.team_name, r.season, r.players, r.stats, r.theme, r.updated_at
  from public.shared_roster r
  where r.code = public.roster_normalize_code(p_code)
    and r.expires_at > now();
$$;

-- ---------------------------------------------------------------- write

drop function if exists public.roster_create(text, text, jsonb, jsonb);

create function public.roster_create(
  p_team_name text,
  p_season    text,
  p_players   jsonb,
  p_stats     jsonb default '{}'::jsonb,
  p_theme     jsonb default '{}'::jsonb
)
returns table (code text, edit_token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code  text;
  v_token text;
  v_count integer;
begin
  perform public.roster_check_players(p_players);
  perform public.roster_check_stats(p_stats);
  perform public.roster_check_theme(p_theme);

  insert into public.publish_quota (day, n)
  values (current_date, 1)
  on conflict (day) do update set n = public.publish_quota.n + 1
  returning n into v_count;

  if v_count > 200 then
    raise exception 'too many rosters published today, try again tomorrow'
      using errcode = '53400';
  end if;

  -- s.code stays qualified: the output parameter is also called `code`.
  for i in 1..8 loop
    v_code := public.roster_token(8);
    exit when not exists (select 1 from public.shared_roster s where s.code = v_code);
    v_code := null;
  end loop;

  if v_code is null then
    raise exception 'could not allocate a code' using errcode = '53400';
  end if;

  v_token := public.roster_token(26);

  insert into public.shared_roster
    (code, team_name, season, players, stats, theme, edit_token_hash)
  values (
    v_code,
    left(coalesce(p_team_name, ''), 120),
    left(coalesce(p_season, ''), 40),
    p_players,
    coalesce(p_stats, '{}'::jsonb),
    coalesce(p_theme, '{}'::jsonb),
    public.roster_hash(v_token)
  );

  return query select v_code, v_token;
end;
$$;

drop function if exists public.roster_update(text, text, text, text, jsonb, jsonb);

create function public.roster_update(
  p_code       text,
  p_edit_token text,
  p_team_name  text,
  p_season     text,
  p_players    jsonb,
  p_stats      jsonb default '{}'::jsonb,
  p_theme      jsonb default '{}'::jsonb
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := public.roster_normalize_code(p_code);
begin
  perform public.roster_check_players(p_players);
  perform public.roster_check_stats(p_stats);
  perform public.roster_check_theme(p_theme);

  return query
  update public.shared_roster r
     set team_name  = left(coalesce(p_team_name, ''), 120),
         season     = left(coalesce(p_season, ''), 40),
         players    = p_players,
         stats      = coalesce(p_stats, '{}'::jsonb),
         theme      = coalesce(p_theme, '{}'::jsonb),
         updated_at = now(),
         expires_at = now() + interval '400 days'
   where r.code = v_code
     and r.edit_token_hash = public.roster_hash(p_edit_token)
  returning r.updated_at;

  if not found then
    raise exception 'that code and key do not match a shared roster'
      using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- grants

-- Dropping and recreating loses the grants, and new functions come with EXECUTE
-- for PUBLIC by default. Shut everything and reopen only the four the app calls.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.roster_fetch(text)                                       to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb, jsonb, jsonb)           to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text)                                to anon, authenticated;
