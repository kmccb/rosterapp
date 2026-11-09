-- How many people opened a paying school's page, a day at a time.
--
-- The seller's question is the AD's question: is anybody using this? Cloudflare's
-- beacon can't answer it per school — every school is the same /oh/ page with a
-- ?school= on the end, and the query string is not what it reports — so the page
-- tells the database instead, through one door that takes a slug and a yes/no and
-- returns nothing.
--
-- What is kept is two numbers per school per day (Eastern) and nothing else: no
-- address, no device, no time of day, no sport. `opens` is every load of the page;
-- `visitors` is the loads that were a phone's first of that day for that school,
-- which the phone itself decides with a date it keeps in its own storage and never
-- sends. A week's visitors is therefore "phone-days", not distinct people: the same
-- parent on Friday and Saturday is two. The panel says so.
--
-- Only a school that is published and paid today is counted. The door is anon —
-- it has to be, every fan is anon — so anyone holding the bundle's key can call
-- it; the gate keeps the table to the handful of real schools rather than to
-- whatever slug a stranger invents. Inflating a real school's number is possible
-- and worth nothing to anyone.
--
-- Only additions. Unlike every migration before it, this one does NOT revoke and
-- re-grant the schema's functions wholesale: 0009 may or may not be applied when
-- this is, and re-granting 0009's functions on a database without them would fail
-- the whole file. So it revokes and grants its own two functions by exact
-- signature, and touches no other grant. Applying it twice must succeed.

begin;

create table if not exists public.school_visit (
  school_slug text    not null,
  day         date    not null,
  opens       integer not null default 0,
  visitors    integer not null default 0,
  primary key (school_slug, day)
);

alter table public.school_visit enable row level security;
revoke all on table public.school_visit from anon, authenticated;

comment on table public.school_visit is
  'Page opens per paying school per Eastern day. Two counts, no identifiers. Written only by school_visit_count, read only by school_visits.';

drop function if exists public.school_visit_count(text, boolean);
drop function if exists public.school_visits(text, integer);

-- The fan page's one write. Silent when the school isn't live: a reader
-- has nothing to do about it and the page must not show an error for it.
create function public.school_visit_count(p_slug text, p_first_today boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := (now() at time zone 'America/New_York')::date;
begin
  if p_slug is null or length(p_slug) > 120 then
    return;
  end if;
  if not exists (
    select 1 from public.school_roster r
    where r.school_slug = p_slug
      and r.published
      and r.paid_through >= v_day
  ) then
    return;
  end if;

  insert into public.school_visit as v (school_slug, day, opens, visitors)
  values (p_slug, v_day, 1, case when coalesce(p_first_today, false) then 1 else 0 end)
  on conflict (school_slug, day) do update set
    opens    = v.opens + 1,
    visitors = v.visitors + case when coalesce(p_first_today, false) then 1 else 0 end;
end;
$$;

-- The panel's read: one school's days, newest first, the last p_days of them
-- (1 to 400; anything else is 30). Days nobody opened the page are absent, not
-- zero — the panel fills the gaps.
create function public.school_visits(p_slug text, p_days integer)
returns setof jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('day', v.day, 'opens', v.opens, 'visitors', v.visitors)
  from public.school_visit v
  where public.school_admin()
    and v.school_slug = p_slug
    and v.day > (now() at time zone 'America/New_York')::date
                - (case when p_days between 1 and 400 then p_days else 30 end)
  order by v.day desc;
$$;

-- ----------------------------------------------------------------- grants

revoke execute on function public.school_visit_count(text, boolean) from public, anon, authenticated;
revoke execute on function public.school_visits(text, integer) from public, anon, authenticated;

grant execute on function public.school_visit_count(text, boolean) to anon, authenticated;
grant execute on function public.school_visits(text, integer) to authenticated;

commit;

notify pgrst, 'reload schema';
