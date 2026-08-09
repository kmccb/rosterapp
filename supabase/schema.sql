-- Roster Lookup — shared team database.
--
-- Security posture: row level security is ON for every table and there are NO
-- policies, which means the anon and authenticated roles can read nothing and
-- write nothing. All access goes through the edge function, which uses the
-- service role key and enforces the team code and role itself. The browser
-- never talks to these tables directly, so nothing here is reachable with a
-- leaked publishable key alone.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- teams

create table if not exists teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  season       text not null default '',
  -- PBKDF2-SHA256 of the two access codes. Salt and iteration count are stored
  -- alongside; see supabase/functions/api/index.ts.
  view_code    jsonb not null,
  edit_code    jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- --------------------------------------------------------------- players

create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams (id) on delete cascade,
  -- Text, not int: preserves "07", and two players can share a number when one
  -- plays offense and the other defense.
  number      text not null default '',
  first_name  text not null default '',
  last_name   text not null default '',
  position    text not null default '',
  -- 'O' | 'D' | 'ST' | '' — blank for two-way players, which is most of them.
  side        text not null default '',
  height_in   int,
  weight_lb   int,
  grade       text,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now()
);

create index if not exists players_team_idx on players (team_id, sort_order);

-- ----------------------------------------------------------------- games

create table if not exists games (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams (id) on delete cascade,
  label       text not null default '',
  played_on   date,
  created_at  timestamptz not null default now()
);

create index if not exists games_team_idx on games (team_id, played_on);

-- ------------------------------------------------------------ stat_lines

-- One row per player per category per game. A null game_id means the line came
-- from a season-totals import rather than a single box score.
create table if not exists stat_lines (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams (id) on delete cascade,
  game_id     uuid references games (id) on delete cascade,
  player_id   uuid not null references players (id) on delete cascade,
  category    text not null,
  -- Canonical short codes: {"car": 84, "yds": 512, "td": 6}
  values      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint stat_lines_category_ck check (
    category in ('passing','rushing','receiving','defense','kicking','punting','returns')
  )
);

create unique index if not exists stat_lines_unique_idx
  on stat_lines (player_id, category, coalesce(game_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists stat_lines_team_idx on stat_lines (team_id);

-- --------------------------------------------------------- auth_attempts

-- Backs the rate limiter on the code endpoint. Rows older than the window are
-- swept on each call, so this stays small.
create table if not exists auth_attempts (
  id          bigserial primary key,
  client_key  text not null,
  attempted_at timestamptz not null default now(),
  ok          boolean not null default false
);

create index if not exists auth_attempts_idx on auth_attempts (client_key, attempted_at);

-- --------------------------------------------------------------- lockdown

alter table teams         enable row level security;
alter table players       enable row level security;
alter table games         enable row level security;
alter table stat_lines    enable row level security;
alter table auth_attempts enable row level security;

-- Deliberately no policies. Deny-by-default for anon and authenticated; the
-- service role bypasses RLS and is only ever used inside the edge function.

revoke all on teams, players, games, stat_lines, auth_attempts from anon, authenticated;
