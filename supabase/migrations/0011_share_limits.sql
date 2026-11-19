-- Keeping one script from spending every coach's share codes.
--
-- roster_create has to be callable with the public key, because a coach has no
-- account. Its only limit was the global fuse of 200 a day, which protects the
-- database and does nothing for the coaches: one loop could burn the day's 200
-- before breakfast and nobody else could publish until midnight. So each caller
-- now gets a small allowance of their own, spent before the shared one, and a
-- caller who has run out is refused without touching the fuse.
--
-- What is kept about a caller is a hash and a count for one day. The address is
-- never stored. It is hashed with a random salt that lives in this database and
-- with the day, so the same phone can't be followed from one day to the next in
-- the table, and the nightly purge throws the rows away. A full database dump
-- includes the salt, and the IPv4 space is small enough to walk, so against
-- someone holding that dump the hash only protects the addresses of days already
-- purged. That is why the rows are not kept.
--
-- How far the address can be trusted. Supabase sits behind Cloudflare, which
-- writes cf-connecting-ip itself, so that header is read first. x-forwarded-for
-- is only the fallback, and its first entry is whatever the client chose to send:
-- where the fallback is in use, a caller can dodge this limit by inventing
-- addresses. The first entry is used anyway because the last one can be a proxy
-- that every caller shares, which would hold all of Ohio to one allowance. Failing
-- that way round leaves a determined caller facing the global fuse, which is
-- exactly where everyone stood before this file. Nor does this stop someone with
-- many real addresses, and people behind one address (a school's wifi, a carrier's
-- shared gateway) share one allowance. Re-publishing an existing code goes through
-- roster_update and costs nothing, so that is ten new codes a day, not ten saves.
--
-- A request with no usable address is not an error. It is held to the global fuse
-- alone, as every request was until now.
--
-- The size caps in 0001-0003 are deliberately left alone. The app's 720px JPEG of
-- a real crest costs about 55 kB of the theme's 500, but the worst picture it can
-- be handed measured about 377 kB on one encoder and phones encode differently, so
-- a tighter ceiling could refuse an honest publish to save very little.
--
-- Only additions, plus roster_create and roster_delete replaced in place with the
-- same parameters, which keeps their grants. Like 0010 this does NOT revoke and re-grant
-- the schema's functions wholesale, because 0009 and 0010 may or may not be applied
-- when this is. Applying it twice must succeed, and must not reset anyone's count.

begin;

-- ---------------------------------------------------------------- tables

create table if not exists public.share_caller_quota (
  day         date    not null,
  caller_hash text    not null,
  n           integer not null default 0,
  primary key (day, caller_hash)
);

alter table public.share_caller_quota enable row level security;
revoke all on table public.share_caller_quota from anon, authenticated;

comment on table public.share_caller_quota is
  'New share codes per caller per day. The caller is a salted hash, never an address. Written only by roster_create, emptied by share_limits_purge.';

-- One row, made once. Regenerating it on a re-apply would hand every caller a
-- fresh allowance halfway through the day.
create table if not exists public.share_limit_salt (
  only_row boolean primary key default true check (only_row),
  salt     text    not null default gen_random_uuid()::text || gen_random_uuid()::text
);

alter table public.share_limit_salt enable row level security;
revoke all on table public.share_limit_salt from anon, authenticated;

comment on table public.share_limit_salt is
  'The random salt behind share_caller_quota.caller_hash. Read only by share_caller_hash.';

insert into public.share_limit_salt (only_row) values (true)
on conflict (only_row) do nothing;

-- ---------------------------------------------------------------- the caller

-- One header value into one canonical address, or null for anything that isn't
-- plainly an address. The shape is checked before the cast because inet accepts
-- more than an address: a network mask would let one caller mint many spellings.
--
-- An IPv6 caller is counted by /64, since one household is handed 2^64 addresses
-- and could otherwise take a new one for every request. An IPv4 address written
-- in its IPv6 form has to be unwrapped first, or every such caller would land in
-- the same /64.
create or replace function public.share_caller_address(p_raw text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_raw  text := btrim(coalesce(p_raw, ''));
  v_addr inet;
begin
  if v_raw = '' or length(v_raw) > 64 then
    return null;
  end if;

  if v_raw !~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'
     and not (v_raw ~ ':' and v_raw ~ '^[0-9A-Fa-f:.]+$') then
    return null;
  end if;

  v_addr := v_raw::inet;

  if family(v_addr) = 6 and v_addr << '::ffff:0:0/96'::inet then
    v_addr := regexp_replace(host(v_addr), '^::ffff:', '', 'i')::inet;
  end if;

  if family(v_addr) = 6 then
    return host(network(set_masklen(v_addr, 64)));
  end if;

  return host(v_addr);
exception
  when others then
    return null;
end;
$$;

-- Today's hash for whoever is calling, or null when the request doesn't say who
-- that is. Outside a PostgREST request the setting is absent or empty, and nothing
-- about these headers is ever allowed to stop a coach publishing.
create or replace function public.share_caller_hash()
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_headers jsonb;
  v_addr    text;
  v_salt    text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception
    when others then
      return null;
  end;

  if v_headers is null or jsonb_typeof(v_headers) <> 'object' then
    return null;
  end if;

  v_addr := coalesce(
    public.share_caller_address(v_headers ->> 'cf-connecting-ip'),
    public.share_caller_address(split_part(v_headers ->> 'x-forwarded-for', ',', 1))
  );

  if v_addr is null then
    return null;
  end if;

  select s.salt into v_salt from public.share_limit_salt s;

  if v_salt is null then
    return null;
  end if;

  return encode(
    sha256(convert_to(v_salt || '|' || current_date::text || '|' || v_addr, 'UTF8')),
    'hex'
  );
end;
$$;

-- ---------------------------------------------------------------- write

-- As 0003 left it, with the caller's allowance spent ahead of the global fuse.
--
-- The allowance is one statement so that simultaneous calls can't all read nine
-- and all proceed: the conflict takes the row's lock, and the WHERE is judged
-- against the row as it stands once the lock is held. At the limit it updates
-- nothing and returns no row. The errcode is the fuse's own, and the app shows
-- the message to the coach as written.
create or replace function public.roster_create(
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
  v_code   text;
  v_token  text;
  v_count  integer;
  v_caller text;
begin
  perform public.roster_check_players(p_players);
  perform public.roster_check_stats(p_stats);
  perform public.roster_check_theme(p_theme);

  v_caller := public.share_caller_hash();

  if v_caller is not null then
    insert into public.share_caller_quota as q (day, caller_hash, n)
    values (current_date, v_caller, 1)
    on conflict (day, caller_hash) do update set n = q.n + 1
      where q.n < 10;

    if not found then
      raise exception 'too many new rosters from this connection today, try again tomorrow'
        using errcode = '53400';
    end if;
  end if;

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

-- The purge removes codes a phone may still hold the key to, and the app only offers
-- Publish again once Stop sharing has succeeded. So a code that no longer exists has
-- to count as stopped, or that coach could never share again. A wrong key on a code
-- that does exist is still refused.
create or replace function public.roster_delete(p_code text, p_edit_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := public.roster_normalize_code(p_code);
begin
  delete from public.shared_roster r
   where r.code = v_code
     and r.edit_token_hash = public.roster_hash(p_edit_token);

  if not found and exists (select 1 from public.shared_roster r where r.code = v_code) then
    raise exception 'that code and key do not match a shared roster'
      using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- purge

-- Run nightly by supabase/cron/share-limits-purge.sql. An expired roster already
-- reads as missing to parents, so they see no change. Its publisher could have
-- revived it by uploading, and after the purge has to stop sharing and publish a
-- new code instead; every upload resets the 400 days, so only a code left untouched
-- that long is affected.
-- The counters keep yesterday as well as today so a job running under another
-- time zone can never empty a day still being counted.
create or replace function public.share_limits_purge()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rosters integer;
  v_quota   integer;
  v_callers integer;
begin
  delete from public.shared_roster r where r.expires_at <= now();
  get diagnostics v_rosters = row_count;

  delete from public.publish_quota q where q.day < current_date - 1;
  get diagnostics v_quota = row_count;

  delete from public.share_caller_quota c where c.day < current_date - 1;
  get diagnostics v_callers = row_count;

  return jsonb_build_object('rosters', v_rosters, 'quota', v_quota, 'callers', v_callers);
end;
$$;

-- ----------------------------------------------------------------- grants

-- None of these three is a door. roster_create reaches the two helpers as its
-- owner, and the purge runs as the cron job's owner.
revoke execute on function public.share_caller_address(text) from public, anon, authenticated;
revoke execute on function public.share_caller_hash() from public, anon, authenticated;
revoke execute on function public.share_limits_purge() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
