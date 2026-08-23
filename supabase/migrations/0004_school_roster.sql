-- The paid tier, operated by hand.
--
-- Same posture as shared_roster and for the same reason: the anon key ships
-- in a public bundle, so the key can never be the thing keeping rosters
-- apart. Tables are never exposed to the Data API — RLS on with no policies,
-- grants revoked, and the only doors are the definer functions below.
--
-- What is different from the share-code system is who may write. There, the
-- right to edit is a bearer token; here it is an account with is_admin set,
-- because v1 is concierge: the seller is the only writer. The schema still
-- carries sport and season in the key so that coach self-serve (phase 2) and
-- the all-sports package (phase 3) are new rows, not new schemas.

create table if not exists public.school_account (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.school_account is
  'Who may operate the paid tier. v1: one row, the seller, inserted by hand.';

alter table public.school_account enable row level security;
revoke all on table public.school_account from anon, authenticated;

create table if not exists public.school_roster (
  school_slug   text not null,
  sport         text not null default 'football',
  season        integer not null,
  players       jsonb not null default '[]'::jsonb,
  -- { "ground": "#04043a", "accent": "#4fbaf7" } or null for the default look.
  colors        jsonb,
  published     boolean not null default false,
  -- The whole notion of payment and of currency. The page goes dark on its
  -- own the day after this; there is no other clock to keep right.
  paid_through  date not null,
  -- "check #1042, booster treasurer J. Smith". Never shown publicly.
  note          text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (school_slug, sport, season)
);

comment on table public.school_roster is
  'Paid rosters, readable only through school_roster_fetch(). Not exposed to the Data API.';

alter table public.school_roster enable row level security;
revoke all on table public.school_roster from anon, authenticated;

-- ---------------------------------------------------------------- helpers

-- True only for a signed-in caller whose account row says so. Every write
-- function opens with this; there is deliberately no other authority.
create or replace function public.school_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.school_account
    where id = auth.uid() and is_admin
  );
$$;

-- ------------------------------------------------------------------ fetch

-- The public door. Newest season for the school and sport, and only when it
-- is published and paid for. Both conditions live here, not in the client.
-- There is no function that lists, counts or searches across schools — the
-- same deliberate omission the share-code system makes.
create or replace function public.school_roster_fetch(p_slug text, p_sport text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'season',  r.season,
           'players', r.players,
           'colors',  r.colors
         )
  from public.school_roster r
  where r.school_slug = p_slug
    and r.sport = p_sport
    and r.published
    and r.paid_through >= current_date
  order by r.season desc
  limit 1;
$$;

-- ------------------------------------------------------------------ admin

-- p_players null means "keep what is there" — the common edit is a renewal
-- (a new date, a new note) and making it resend a roster it does not hold
-- would turn every renewal into a data-loss hazard. Written as an explicit
-- update-then-insert rather than ON CONFLICT, because the conflict form's
-- excluded row would already have had the null coalesced away.
create or replace function public.school_roster_upsert(
  p_slug text, p_sport text, p_season integer,
  p_players jsonb, p_colors jsonb,
  p_published boolean, p_paid_through date, p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.school_admin() then
    raise exception 'not allowed';
  end if;

  update public.school_roster set
    players      = coalesce(p_players, players),
    colors       = p_colors,
    published    = p_published,
    paid_through = p_paid_through,
    note         = p_note,
    updated_at   = now()
  where school_slug = p_slug and sport = p_sport and season = p_season;

  if not found then
    insert into public.school_roster
      (school_slug, sport, season, players, colors, published, paid_through, note)
    values
      (p_slug, p_sport, p_season, coalesce(p_players, '[]'::jsonb), p_colors,
       p_published, p_paid_through, p_note);
  end if;
end;
$$;

-- A delete is a delete. Nothing about a minor lingers behind a flag.
create or replace function public.school_roster_delete(
  p_slug text, p_sport text, p_season integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.school_admin() then
    raise exception 'not allowed';
  end if;
  delete from public.school_roster
  where school_slug = p_slug and sport = p_sport and season = p_season;
end;
$$;

-- The panel's list. Cross-school on purpose — and admin-gated on purpose,
-- which is the asymmetry the whole design rests on: the public door serves
-- one school at a time, the seller sees the book.
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

-- Dropping and recreating loses the grants, and new functions come with EXECUTE
-- for PUBLIC by default. Shut everything and reopen only the functions the app
-- calls — which, because the revoke is schema-wide, means re-asserting the
-- share-code doors from 0001-0003 here too, not just the new ones.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.roster_fetch(text)                                       to anon, authenticated;
grant execute on function public.roster_create(text, text, jsonb, jsonb, jsonb)           to anon, authenticated;
grant execute on function public.roster_update(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.roster_delete(text, text)                                to anon, authenticated;

grant execute on function public.school_roster_fetch(text, text) to anon, authenticated;
grant execute on function public.school_roster_upsert(text, text, integer, jsonb, jsonb, boolean, date, text) to authenticated;
grant execute on function public.school_roster_delete(text, text, integer) to authenticated;
grant execute on function public.school_roster_list() to authenticated;
