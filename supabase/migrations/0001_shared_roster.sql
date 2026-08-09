-- Sharing a roster by code.
--
-- The threat model here is not "a competitor reads our depth chart", it's that
-- a roster is a list of minors with their heights, weights and year in school,
-- and the anon key that reaches this database ships inside a public JavaScript
-- bundle. Anyone can read that key out of the page source, so the key itself
-- can't be the thing keeping rosters apart.
--
-- So the table is never exposed through the Data API at all. RLS is on with no
-- policies, every grant is revoked, and the only way in is the security-definer
-- functions below. Those take a code and hand back at most one roster. There is
-- deliberately no function that lists, counts, or searches, which means holding
-- the anon key gets you nothing without also knowing a code.

create table if not exists public.shared_roster (
  code             text primary key,
  team_name        text not null default '',
  season           text not null default '',
  players          jsonb not null default '[]'::jsonb,
  -- The hash, not the token. A dump of this table must not hand out the
  -- ability to overwrite anyone's roster.
  edit_token_hash  text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '400 days'
);

comment on table public.shared_roster is
  'Published rosters, readable only by code through roster_fetch(). Not exposed to the Data API.';

alter table public.shared_roster enable row level security;
-- No policies on purpose: RLS with zero policies denies everything, so even if
-- a grant is restored by accident the table stays shut.

revoke all on table public.shared_roster from anon, authenticated;

-- A crude global fuse. The create function is callable by anyone holding the
-- public key, so without this one script could fill the free tier overnight.
-- It is a blunt instrument — it stops a flood, not a determined person.
create table if not exists public.publish_quota (
  day    date primary key,
  n      integer not null default 0
);

alter table public.publish_quota enable row level security;
revoke all on table public.publish_quota from anon, authenticated;

-- ---------------------------------------------------------------- codes

-- Crockford-style base32: no I, L, O or U, so a code read down a phone at a
-- noisy field doesn't turn into a different code. 32 symbols means a byte can
-- be folded with % 32 without skewing the distribution.
create or replace function public.roster_token(n integer)
returns text
language sql
volatile
as $$
  select string_agg(
           substr(
             '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
             1 + (get_byte(uuid_send(gen_random_uuid()), 0) % 32),
             1
           ),
           '' order by i
         )
  from generate_series(1, n) as i;
$$;

-- Codes arrive typed by hand: lowercase, spaces, and the dash we print for
-- legibility all have to survive the round trip.
create or replace function public.roster_normalize_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

create or replace function public.roster_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------- guards

create or replace function public.roster_check_players(p_players jsonb)
returns void
language plpgsql
as $$
begin
  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'players must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_players) > 300 then
    raise exception 'a roster is capped at 300 players' using errcode = '22023';
  end if;

  if pg_column_size(p_players) > 200000 then
    raise exception 'that roster is too large to share' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------- read

-- Returns at most one row, and only ever the row whose code was supplied.
-- Expired rosters read as missing rather than erroring: to the parent typing
-- the code, "no longer shared" and "never existed" are the same answer.
create or replace function public.roster_fetch(p_code text)
returns table (
  team_name  text,
  season     text,
  players    jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select r.team_name, r.season, r.players, r.updated_at
  from public.shared_roster r
  where r.code = public.roster_normalize_code(p_code)
    and r.expires_at > now();
$$;

-- ---------------------------------------------------------------- write

create or replace function public.roster_create(
  p_team_name text,
  p_season    text,
  p_players   jsonb
)
returns table (code text, edit_token text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code   text;
  v_token  text;
  v_today  date := current_date;
  v_count  integer;
begin
  perform public.roster_check_players(p_players);

  insert into public.publish_quota (day, n)
  values (v_today, 1)
  on conflict (day) do update set n = public.publish_quota.n + 1
  returning n into v_count;

  if v_count > 200 then
    raise exception 'too many rosters published today, try again tomorrow'
      using errcode = '53400';
  end if;

  -- 8 symbols is about 1.1e12 codes. Retry on the vanishingly unlikely clash
  -- rather than trusting the first draw.
  --
  -- `s.code` has to stay qualified: this function's RETURNS TABLE declares an
  -- output parameter also called `code`, and an unqualified reference is
  -- ambiguous between the two at runtime.
  for i in 1..8 loop
    v_code := public.roster_token(8);
    exit when not exists (select 1 from public.shared_roster s where s.code = v_code);
    v_code := null;
  end loop;

  if v_code is null then
    raise exception 'could not allocate a code' using errcode = '53400';
  end if;

  v_token := public.roster_token(26);

  insert into public.shared_roster (code, team_name, season, players, edit_token_hash)
  values (
    v_code,
    left(coalesce(p_team_name, ''), 120),
    left(coalesce(p_season, ''), 40),
    p_players,
    public.roster_hash(v_token)
  );

  return query select v_code, v_token;
end;
$$;

create or replace function public.roster_update(
  p_code       text,
  p_edit_token text,
  p_team_name  text,
  p_season     text,
  p_players    jsonb
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

  return query
  update public.shared_roster r
     set team_name  = left(coalesce(p_team_name, ''), 120),
         season     = left(coalesce(p_season, ''), 40),
         players    = p_players,
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

create or replace function public.roster_delete(p_code text, p_edit_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.shared_roster r
   where r.code = public.roster_normalize_code(p_code)
     and r.edit_token_hash = public.roster_hash(p_edit_token);

  if not found then
    raise exception 'that code and key do not match a shared roster'
      using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- grants

-- Default Postgres hands EXECUTE on new functions to PUBLIC, which would put
-- the helpers within reach of the anon key too. Shut it all and reopen only
-- the four the app actually calls.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.roster_fetch(text)                         to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb)           to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text)                  to anon, authenticated;
