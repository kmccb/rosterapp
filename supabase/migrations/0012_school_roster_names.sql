-- Holding a paid school's slug and sport names to the shapes the app writes.
--
-- Both columns are typed by hand nowhere: the panel takes the slug from the
-- directory and the sport from its own picker. But they are free text in the
-- table, and both end up in addresses (`?school=`, the stats and app files the
-- build writes per slug) and in the keys a phone keeps its copy under. A stray
-- capital, a trailing space or a slash would make a row the fan page can never
-- ask for, or a file name nobody meant. So the database now refuses them too.
--
-- The slug is the directory's: lowercase letters, digits and hyphens, which is
-- every one of the 716 schools in public/oh/index.json (Springfield among
-- them) and the demo's, which lives in demo.json instead.
-- The length cap is generous (the longest today is 48).
--
-- The sport is checked for shape, not against a list. The panel offers
-- SPORT_CHOICES (src/oh/manage/schools.ts): plain sports, two of them two words
-- ("cross country"), and for a teamed sport the gender and level in front
-- ("boys basketball", "girls jv basketball"), each part a lowercase word with
-- one space between. A list here would mean a migration every time a sport or a
-- teamed sport is added to the app; the shape is what actually keeps a bad name
-- out, and it lets a bare "basketball" (a school that never said which team) and
-- a hand-typed "boys varsity basketball" stand, as sportTeam() reads both.
--
-- The checks are constraints, so nothing can get round them, with a trigger in
-- front that refuses first in a sentence the panel can show. A rename that the
-- trigger missed would still meet the constraint, just in Postgres's own words.
--
-- In its own file rather than 0011 so that a database holding an old row these
-- rules refuse cannot also hold back the share-code limits: if such a row
-- exists this file stops, names it, and changes nothing, and 0011 is unaffected.
--
-- Additive, no function a caller can reach is created or replaced, so like 0010
-- and 0011 it skips the schema-wide revoke and re-grant and can be applied with
-- or without 0009-0011. Safe to apply twice: each constraint is dropped by name
-- and added again, and the trigger is replaced.

begin;

-- Stop, saying which rows, before any constraint is tried. Postgres would
-- refuse the constraint anyway, but only by its name.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s / %s', school_slug, sport), ', ' order by school_slug, sport)
    into v_bad
  from public.school_roster
  where not (school_slug ~ '^[a-z0-9-]+$' and char_length(school_slug) <= 80)
     or not (sport ~ '^[a-z]+( [a-z]+)*$' and char_length(sport) <= 40);
  if v_bad is not null then
    raise exception 'these paid-school rows need their slug or sport renamed before 0012 can apply: %', v_bad
      using errcode = '23514';
  end if;
end;
$$;

alter table public.school_roster drop constraint if exists school_roster_slug_shape;
alter table public.school_roster
  add constraint school_roster_slug_shape
  check (school_slug ~ '^[a-z0-9-]+$' and char_length(school_slug) <= 80);

alter table public.school_roster drop constraint if exists school_roster_sport_shape;
alter table public.school_roster
  add constraint school_roster_sport_shape
  check (sport ~ '^[a-z]+( [a-z]+)*$' and char_length(sport) <= 40);

-- The same two rules, said to the seller. Fires on every insert and on any
-- update that touches either column, before the constraints are checked.
create or replace function public.school_roster_names_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (new.school_slug ~ '^[a-z0-9-]+$' and char_length(new.school_slug) <= 80) then
    raise exception 'a school''s slug may hold only lowercase letters, digits and hyphens, and % is not one', quote_literal(new.school_slug)
      using errcode = '23514';
  end if;
  if not (new.sport ~ '^[a-z]+( [a-z]+)*$' and char_length(new.sport) <= 40) then
    raise exception 'a sport is lowercase words with one space between, like "girls jv basketball", and % is not one', quote_literal(new.sport)
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists school_roster_names_check on public.school_roster;
create trigger school_roster_names_check
  before insert or update of school_slug, sport on public.school_roster
  for each row execute function public.school_roster_names_check();

-- Not a door: only the trigger calls it.
revoke execute on function public.school_roster_names_check() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
