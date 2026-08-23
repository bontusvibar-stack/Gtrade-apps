-- ============================================================================
-- Multi-Device Synced Account — full database setup
-- Run this ENTIRE file once in the Supabase SQL Editor, top to bottom.
-- (It's schema + username-mapping trigger + RLS policies, concatenated in
-- the order they must run in.)
-- ============================================================================

-- Extensions we rely on
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per user, holds the human-facing username.
-- id is the SAME id as auth.users.id (1:1), so RLS can key off auth.uid().
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_data: generic per-user data store. "data_type" lets one table hold
-- multiple kinds of app data (journal entries, settings, etc.) without a
-- migration every time you add a new kind of data.
-- ---------------------------------------------------------------------------
create table if not exists public.user_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  data_type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_data_user_id_idx on public.user_data (user_id);
create index if not exists user_data_user_id_type_idx on public.user_data (user_id, data_type);

-- ---------------------------------------------------------------------------
-- device_sessions: one row per device/browser a user has signed in from.
-- device_id is a random id generated client-side and persisted in
-- localStorage, so the same browser reuses the same row across visits.
-- ---------------------------------------------------------------------------
create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  device_name text,
  browser text,
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoke_requested boolean not null default false,
  unique (user_id, device_id)
);

create index if not exists device_sessions_user_id_idx on public.device_sessions (user_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh automatically.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.user_data;
create trigger set_updated_at
  before update on public.user_data
  for each row execute function public.set_updated_at();
-- Supabase Auth is email/password based. We never show the person an email
-- field for password signup — the frontend derives a deterministic,
-- non-deliverable "shadow email" from their username (see
-- src/lib/supabase.js -> usernameToEmail), and this trigger copies the real
-- username into public.profiles the moment a new auth.users row is created.
--
-- Two signup paths land here with different metadata shapes:
--   1. Password signup (supabase.auth.signUp): raw_user_meta_data.username
--      is set explicitly by the person on the Register page. We enforce
--      strict uniqueness — profiles.username is UNIQUE, so a duplicate
--      makes THIS INSERT fail, and since the trigger runs inside the same
--      transaction as the auth.users insert, Postgres rolls the whole
--      signUp() back and the client gets a clear "already taken" error.
--   2. Google OAuth signup (supabase.auth.signInWithOAuth): there is no
--      username field for the person to fill in, so one is generated from
--      their email's local part, with a numeric suffix appended only if
--      needed to stay unique. They can change it later from Settings.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provided_username text := new.raw_user_meta_data ->> 'username';
  base_username text;
  candidate text;
  suffix int := 0;
begin
  if provided_username is not null then
    insert into public.profiles (id, username) values (new.id, provided_username);
    return new;
  end if;

  base_username := regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g');
  if base_username is null or length(base_username) < 3 then
    base_username := 'user';
  end if;

  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
alter table public.profiles enable row level security;
alter table public.user_data enable row level security;
alter table public.device_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete policy for profiles: rows are created only by the
-- handle_new_user() trigger (security definer) and deleted automatically
-- via "on delete cascade" from auth.users.

-- ---------------------------------------------------------------------------
-- user_data
-- ---------------------------------------------------------------------------
drop policy if exists "user_data_select_own" on public.user_data;
create policy "user_data_select_own"
  on public.user_data for select
  using (auth.uid() = user_id);

drop policy if exists "user_data_insert_own" on public.user_data;
create policy "user_data_insert_own"
  on public.user_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_data_update_own" on public.user_data;
create policy "user_data_update_own"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_data_delete_own" on public.user_data;
create policy "user_data_delete_own"
  on public.user_data for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- device_sessions
-- ---------------------------------------------------------------------------
drop policy if exists "device_sessions_select_own" on public.device_sessions;
create policy "device_sessions_select_own"
  on public.device_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "device_sessions_insert_own" on public.device_sessions;
create policy "device_sessions_insert_own"
  on public.device_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "device_sessions_update_own" on public.device_sessions;
create policy "device_sessions_update_own"
  on public.device_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "device_sessions_delete_own" on public.device_sessions;
create policy "device_sessions_delete_own"
  on public.device_sessions for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime: let Supabase Realtime broadcast row-level changes for these
-- tables. RLS above still applies to who can actually receive them.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.user_data;
alter publication supabase_realtime add table public.device_sessions;
