-- Appalachian Trail Fitness Tracker: schema, security and server-side aggregation.
-- Run once in the Supabase SQL editor (idempotent: safe to re-run).
--
-- All objects are prefixed `at_` because this Supabase project also hosts the legacy Oregon Trail
-- tables (community_progress, mileage_log), which this migration never touches.
--
-- Security model
--   * Every table has Row Level Security enabled. `anon` has no access to anything.
--   * Activities are readable/writable only by their owner. Other players never read activity rows;
--     the leaderboard is a SECURITY DEFINER function that returns aggregates only.
--   * Clients cannot set user_id, conversion_factor or credited_miles: column grants exclude them and
--     a trigger recomputes them from at_conversion_rules.
--   * Challenge membership changes go through functions; invite codes are never selectable.

-- 1. Profiles ---------------------------------------------------------------------------------

create table if not exists public.at_profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text not null default 'Hiker'
                     check (char_length(display_name) between 1 and 24 and display_name !~ '[<>&"[:cntrl:]]'),
  weekly_goal_miles  numeric(6, 2) check (weekly_goal_miles is null or weekly_goal_miles between 1 and 200),
  created_at         timestamptz not null default now()
);

alter table public.at_profiles enable row level security;

drop policy if exists "at_profiles select own" on public.at_profiles;
create policy "at_profiles select own" on public.at_profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "at_profiles insert own" on public.at_profiles;
create policy "at_profiles insert own" on public.at_profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "at_profiles update own" on public.at_profiles;
create policy "at_profiles update own" on public.at_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Creates the profile when someone signs up (works even when email confirmation delays the session).
-- The default display name is deliberately NOT derived from the email address (it would leak it).
create or replace function public.at_handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  v_name := left(btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '[<>&"[:cntrl:]]', '', 'g')), 24);
  if v_name = '' then v_name := 'Hiker'; end if;
  insert into public.at_profiles (id, display_name) values (new.id, v_name) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists at_on_auth_user_created on auth.users;
create trigger at_on_auth_user_created after insert on auth.users
  for each row execute function public.at_handle_new_user();

-- For users who existed before this migration ran.
create or replace function public.at_ensure_profile()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  insert into public.at_profiles (id) values (auth.uid()) on conflict (id) do nothing;
end $$;

-- 2. Conversion rules (read-only for clients) ----------------------------------------------------

create table if not exists public.at_conversion_rules (
  activity_type     text not null check (activity_type in ('walking', 'hiking', 'running', 'cycling', 'other')),
  factor            numeric(5, 3) not null check (factor > 0 and factor <= 1),
  max_actual_miles  numeric(7, 2) not null check (max_actual_miles >= 0.1),
  effective_from    date not null default date '2000-01-01',
  primary key (activity_type, effective_from)
);

alter table public.at_conversion_rules enable row level security;

drop policy if exists "at_conversion_rules read" on public.at_conversion_rules;
create policy "at_conversion_rules read" on public.at_conversion_rules
  for select to authenticated using (true);

-- Must match DEFAULT_RULES in assets/js/at/engine/activities.js (a test compares them).
insert into public.at_conversion_rules (activity_type, factor, max_actual_miles) values
  ('walking', 1.000, 100), ('hiking', 1.000, 60), ('running', 1.000, 50), ('cycling', 0.250, 150), ('other', 0.500, 100)
on conflict (activity_type, effective_from) do nothing;

-- To change a rule for the future without rewriting history, INSERT a new row with a later
-- effective_from instead of updating an existing one.

-- 3. Activities --------------------------------------------------------------------------------

create table if not exists public.at_activities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id         uuid,
  activity_date     date not null,
  activity_type     text not null check (activity_type in ('walking', 'hiking', 'running', 'cycling', 'other')),
  actual_miles      numeric(7, 2) not null check (actual_miles >= 0.1),
  duration_minutes  integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  conversion_factor numeric(5, 3) not null,
  credited_miles    numeric(8, 2) not null check (credited_miles >= 0),
  notes             text not null default '' check (char_length(notes) <= 240),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists at_activities_user_date_idx on public.at_activities (user_id, activity_date desc);
create index if not exists at_activities_date_idx on public.at_activities (activity_date);

create or replace function public.at_activities_prepare()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_rule public.at_conversion_rules%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Activities cannot change owner' using errcode = '42501';
    end if;
    new.id := old.id;
    new.client_id := old.client_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();

  if tg_op = 'INSERT'
     or new.activity_type is distinct from old.activity_type
     or new.activity_date is distinct from old.activity_date
     or new.actual_miles is distinct from old.actual_miles then
    -- Date window only applies to new rows or a changed date, so old rows stay editable.
    -- One day of slack either side absorbs time-zone differences with the UTC database clock.
    if tg_op = 'INSERT' or new.activity_date is distinct from old.activity_date then
      if new.activity_date > current_date + 1 then
        raise exception 'Activities cannot be dated in the future' using errcode = '22008';
      end if;
      if new.activity_date < current_date - 61 then
        raise exception 'Activities can be added up to 60 days back' using errcode = '22008';
      end if;
    end if;
    select * into v_rule from public.at_conversion_rules r
      where r.activity_type = new.activity_type and r.effective_from <= new.activity_date
      order by r.effective_from desc limit 1;
    if not found then
      raise exception 'No conversion rule for this activity' using errcode = '22023';
    end if;
    if new.actual_miles > v_rule.max_actual_miles then
      raise exception 'Please log no more than % miles for one % session', v_rule.max_actual_miles, new.activity_type
        using errcode = '22003';
    end if;
    new.conversion_factor := v_rule.factor;
    new.credited_miles := round(new.actual_miles * v_rule.factor, 2);
  else
    -- Notes/duration edits (or no-op updates) keep the originally stored conversion: history is stable.
    new.conversion_factor := old.conversion_factor;
    new.credited_miles := old.credited_miles;
  end if;
  return new;
end $$;

drop trigger if exists at_activities_prepare on public.at_activities;
create trigger at_activities_prepare before insert or update on public.at_activities
  for each row execute function public.at_activities_prepare();

alter table public.at_activities enable row level security;

drop policy if exists "at_activities select own" on public.at_activities;
create policy "at_activities select own" on public.at_activities
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "at_activities insert own" on public.at_activities;
create policy "at_activities insert own" on public.at_activities
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "at_activities update own" on public.at_activities;
create policy "at_activities update own" on public.at_activities
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "at_activities delete own" on public.at_activities;
create policy "at_activities delete own" on public.at_activities
  for delete to authenticated using (user_id = (select auth.uid()));

-- 4. Challenges and membership --------------------------------------------------------------------

create table if not exists public.at_challenges (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 60 and name !~ '[<>&"[:cntrl:]]'),
  trail_id     text not null default 'appalachian-trail' check (trail_id in ('appalachian-trail')),
  direction    text not null default 'nobo' check (direction in ('nobo', 'sobo')),
  start_date   date not null default current_date,
  end_date     date,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invite_code  text not null unique,
  created_at   timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.at_challenge_members (
  challenge_id  uuid not null references public.at_challenges (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists at_challenge_members_user_idx on public.at_challenge_members (user_id);

alter table public.at_challenges enable row level security;
alter table public.at_challenge_members enable row level security;

-- Members see only their own membership rows; the full roster comes from at_leaderboard().
drop policy if exists "at_members select own" on public.at_challenge_members;
create policy "at_members select own" on public.at_challenge_members
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "at_challenges select member" on public.at_challenges;
create policy "at_challenges select member" on public.at_challenges
  for select to authenticated using (
    exists (select 1 from public.at_challenge_members m where m.challenge_id = id and m.user_id = (select auth.uid()))
  );

drop policy if exists "at_challenges delete owner" on public.at_challenges;
create policy "at_challenges delete owner" on public.at_challenges
  for delete to authenticated using (owner_id = (select auth.uid()));

-- 5. Privileges: deny by default, then grant exactly what the app needs -----------------------------
-- (Supabase default privileges would otherwise grant ALL on new tables to anon/authenticated.)

revoke all on public.at_profiles, public.at_conversion_rules, public.at_activities,
              public.at_challenges, public.at_challenge_members from public, anon, authenticated;

grant select (id, display_name, weekly_goal_miles, created_at) on public.at_profiles to authenticated;
grant insert (id, display_name) on public.at_profiles to authenticated;
grant update (display_name, weekly_goal_miles) on public.at_profiles to authenticated;

grant select on public.at_conversion_rules to authenticated;

grant select on public.at_activities to authenticated;
grant insert (client_id, activity_date, activity_type, actual_miles, duration_minutes, notes) on public.at_activities to authenticated;
grant update (activity_date, activity_type, actual_miles, duration_minutes, notes) on public.at_activities to authenticated;
grant delete on public.at_activities to authenticated;

-- invite_code is intentionally not granted; the owner reads it through at_get_invite_code().
grant select (id, name, trail_id, direction, start_date, end_date, owner_id, created_at) on public.at_challenges to authenticated;
grant delete on public.at_challenges to authenticated;
grant select on public.at_challenge_members to authenticated;

-- 6. Functions ---------------------------------------------------------------------------------------

create or replace function public.at_create_challenge(
  p_name text, p_direction text default 'nobo', p_start_date date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_challenge public.at_challenges%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if char_length(v_name) not between 1 and 60 or v_name ~ '[<>&"[:cntrl:]]' then
    raise exception 'Challenge names must be 1-60 characters' using errcode = '22023';
  end if;
  if p_direction not in ('nobo', 'sobo') then raise exception 'Invalid direction' using errcode = '22023'; end if;
  if (select count(*) from public.at_challenges where owner_id = v_uid) >= 10 then
    raise exception 'You can own at most 10 challenges' using errcode = '54000';
  end if;

  insert into public.at_challenges (name, direction, start_date, owner_id, invite_code)
  values (v_name, p_direction, coalesce(p_start_date, current_date), v_uid,
          upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
  returning * into v_challenge;

  insert into public.at_challenge_members (challenge_id, user_id, role) values (v_challenge.id, v_uid, 'owner');

  return jsonb_build_object('id', v_challenge.id, 'name', v_challenge.name, 'direction', v_challenge.direction,
                            'start_date', v_challenge.start_date, 'invite_code', v_challenge.invite_code);
end $$;

create or replace function public.at_join_challenge(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select id into v_id from public.at_challenges where invite_code = v_code;
  if v_id is null then raise exception 'That invite code was not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.at_challenge_members where challenge_id = v_id and user_id = v_uid)
     and (select count(*) from public.at_challenge_members where challenge_id = v_id) >= 50 then
    raise exception 'This challenge is full' using errcode = '54000';
  end if;
  insert into public.at_challenge_members (challenge_id, user_id) values (v_id, v_uid) on conflict do nothing;
  return v_id;
end $$;

create or replace function public.at_leave_challenge(p_challenge uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.at_challenges where id = p_challenge and owner_id = v_uid) then
    raise exception 'The owner cannot leave; delete the challenge instead' using errcode = '42501';
  end if;
  delete from public.at_challenge_members where challenge_id = p_challenge and user_id = v_uid;
end $$;

create or replace function public.at_get_invite_code(p_challenge uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select invite_code into v_code from public.at_challenges where id = p_challenge and owner_id = auth.uid();
  if v_code is null then raise exception 'Only the owner can see the invite code' using errcode = '42501'; end if;
  return v_code;
end $$;

-- Aggregates only: no activity rows, notes, types or goals leave the database. Counts activities dated
-- within the challenge window. "This week" is Monday-based on the database (UTC) date.
create or replace function public.at_leaderboard(p_challenge uuid)
returns table (
  user_id uuid, display_name text, role text,
  total_credited_miles numeric, week_credited_miles numeric, activity_count bigint, last_activity_date date
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_start date;
  v_end date;
  v_week date := date_trunc('week', current_date)::date;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.at_challenge_members m where m.challenge_id = p_challenge and m.user_id = auth.uid()) then
    raise exception 'Not a member of this challenge' using errcode = '42501';
  end if;
  select c.start_date, c.end_date into v_start, v_end from public.at_challenges c where c.id = p_challenge;

  return query
    select m.user_id,
           p.display_name,
           m.role,
           coalesce(sum(a.credited_miles), 0)::numeric,
           coalesce(sum(a.credited_miles) filter (where a.activity_date >= v_week), 0)::numeric,
           count(a.id),
           max(a.activity_date)
      from public.at_challenge_members m
      join public.at_profiles p on p.id = m.user_id
      left join public.at_activities a
             on a.user_id = m.user_id
            and a.activity_date >= v_start
            and (v_end is null or a.activity_date <= v_end)
     where m.challenge_id = p_challenge
     group by m.user_id, p.display_name, m.role
     order by 4 desc, p.display_name, m.user_id;
end $$;

create or replace function public.at_challenge_summary(p_challenge uuid)
returns table (member_count bigint, total_credited_miles numeric, activity_count bigint) language plpgsql stable
security definer set search_path = '' as $$
declare
  v_start date;
  v_end date;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.at_challenge_members m where m.challenge_id = p_challenge and m.user_id = auth.uid()) then
    raise exception 'Not a member of this challenge' using errcode = '42501';
  end if;
  select c.start_date, c.end_date into v_start, v_end from public.at_challenges c where c.id = p_challenge;
  return query
    select (select count(*) from public.at_challenge_members m where m.challenge_id = p_challenge),
           coalesce(sum(a.credited_miles), 0)::numeric,
           count(a.id)
      from public.at_challenge_members m
      join public.at_activities a on a.user_id = m.user_id
       and a.activity_date >= v_start and (v_end is null or a.activity_date <= v_end)
     where m.challenge_id = p_challenge;
end $$;

-- Functions are executable by signed-in users only (never anon / public).
revoke all on function public.at_handle_new_user() from public, anon, authenticated;
revoke all on function public.at_activities_prepare() from public, anon, authenticated;
revoke all on function public.at_ensure_profile() from public, anon;
revoke all on function public.at_create_challenge(text, text, date) from public, anon;
revoke all on function public.at_join_challenge(text) from public, anon;
revoke all on function public.at_leave_challenge(uuid) from public, anon;
revoke all on function public.at_get_invite_code(uuid) from public, anon;
revoke all on function public.at_leaderboard(uuid) from public, anon;
revoke all on function public.at_challenge_summary(uuid) from public, anon;
grant execute on function public.at_ensure_profile() to authenticated;
grant execute on function public.at_create_challenge(text, text, date) to authenticated;
grant execute on function public.at_join_challenge(text) to authenticated;
grant execute on function public.at_leave_challenge(uuid) to authenticated;
grant execute on function public.at_get_invite_code(uuid) to authenticated;
grant execute on function public.at_leaderboard(uuid) to authenticated;
grant execute on function public.at_challenge_summary(uuid) to authenticated;
