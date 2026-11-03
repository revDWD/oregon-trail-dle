-- Phase 8: the expedition roster (official hikers) and per-hiker progress.
--
-- Model:
--   * at_hikers is the official roster (David, Kevin, ...). Add a hiker later with one line:
--       insert into public.at_hikers (name, sort_order) values ('Sarah', 3);
--     Retire one (their miles stay) with: update public.at_hikers set active = false where name = 'Sarah';
--   * Activities and Wildlife Spotting runs carry an optional hiker_id. The app always asks for a hiker;
--     older rows without one stay private to the device that logged them until it assigns a hiker.
--   * Open participation (20261105): any signed-in device may log miles or photos for an active hiker
--     and read the roster's aggregates. There is no invite code or join step. Devices still own (and
--     alone can edit) the rows they logged: the existing "own rows only" RLS policies are unchanged.
--   * Everything other devices see comes from SECURITY DEFINER functions that return aggregates only.
--
-- Safe to run more than once.

-- 1. Tables ------------------------------------------------------------------------------------------

create table if not exists public.at_hikers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 40 and name !~ '[<>&"[:cntrl:]]'),
  sort_order  integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.at_hikers (name, sort_order) values ('David', 1), ('Kevin', 2) on conflict (name) do nothing;

-- Hikers with history cannot be deleted (retire them with active = false instead).
alter table public.at_activities add column if not exists hiker_id uuid references public.at_hikers (id) on delete restrict;
alter table public.at_expedition_runs add column if not exists hiker_id uuid references public.at_hikers (id) on delete restrict;
create index if not exists at_activities_hiker_idx on public.at_activities (hiker_id, created_at) where hiker_id is not null;
create index if not exists at_expedition_runs_hiker_idx on public.at_expedition_runs (hiker_id) where hiker_id is not null;

alter table public.at_hikers enable row level security;

-- 2. Participation ------------------------------------------------------------------------------------
-- Every signed-in device (including anonymous sessions) takes part; there is nothing to join.

create or replace function public.at_is_expedition_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
$$;

-- 3. Attaching rows to a hiker -------------------------------------------------------------------------
-- Fires only when a hiker is being set or changed. Requires a signed-in device and an active hiker.
-- auth.uid() is null only for trusted server-side sessions (SQL editor / service role); the API roles
-- always carry a user id, and anon has no insert privileges at all.

create or replace function public.at_check_hiker()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.hiker_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.hiker_id is not distinct from old.hiker_id then return new; end if;
  if (select auth.uid()) is null then return new; end if;
  if not public.at_is_expedition_member() then
    raise exception 'Sign in before logging for a hiker' using errcode = '42501';
  end if;
  if not exists (select 1 from public.at_hikers h where h.id = new.hiker_id and h.active) then
    raise exception 'That hiker is not on the expedition roster' using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists at_activities_hiker on public.at_activities;
create trigger at_activities_hiker before insert or update of hiker_id on public.at_activities
  for each row execute function public.at_check_hiker();

drop trigger if exists at_expedition_runs_hiker on public.at_expedition_runs;
create trigger at_expedition_runs_hiker before insert on public.at_expedition_runs
  for each row execute function public.at_check_hiker();

-- 4. Aggregates (any signed-in device) -------------------------------------------------------------------------

-- One row per hiker on the roster (plus retired hikers who have history). No notes, types or row ids.
create or replace function public.at_expedition_hikers(p_week_start date default null)
returns table (
  hiker_id uuid, name text, sort_order integer, active boolean,
  total_credited_miles numeric, week_credited_miles numeric, activity_count bigint,
  first_activity_date date, last_activity_date date, active_dates date[],
  wildlife_runs bigint, wildlife_score bigint, first_spotted_on date
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_week date := coalesce(p_week_start, date_trunc('week', current_date)::date);
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not public.at_is_expedition_member() then raise exception 'Not signed in' using errcode = '42501'; end if;
  return query
    with acts as (
      select a.hiker_id,
             sum(a.credited_miles) as total,
             sum(a.credited_miles) filter (where a.activity_date >= v_week) as week,
             count(*) as n,
             min(a.activity_date) as first_date,
             max(a.activity_date) as last_date,
             array_agg(distinct a.activity_date order by a.activity_date) as dates
        from public.at_activities a
       where a.hiker_id is not null
       group by a.hiker_id
    ), runs as (
      select r.hiker_id, count(*) as n, sum(r.score) as score, min(r.played_on) filter (where r.hits > 0) as first_spot
        from public.at_expedition_runs r
       where r.hiker_id is not null
       group by r.hiker_id
    )
    select h.id, h.name, h.sort_order, h.active,
           coalesce(acts.total, 0)::numeric, coalesce(acts.week, 0)::numeric, coalesce(acts.n, 0)::bigint,
           acts.first_date, acts.last_date, coalesce(acts.dates, '{}'::date[]),
           coalesce(runs.n, 0)::bigint, coalesce(runs.score, 0)::bigint, runs.first_spot
      from public.at_hikers h
      left join acts on acts.hiker_id = h.id
      left join runs on runs.hiker_id = h.id
     where h.active or acts.n > 0 or runs.n > 0
     order by h.sort_order, h.name;
end $$;

-- When each mileage mark was reached, in the order activities were logged:
--   kind 'group'    : the expedition's combined miles crossed p_group[i]; hiker_id carried it across.
--   kind 'personal' : hiker_id's own miles crossed p_personal[i].
-- reached_on is the activity date of the crossing entry. Marks come from the trail data in the app.
create or replace function public.at_expedition_marks(p_group numeric[], p_personal numeric[])
returns table (kind text, mark numeric, hiker_id uuid, reached_on date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not public.at_is_expedition_member() then raise exception 'Not signed in' using errcode = '42501'; end if;
  if coalesce(cardinality(p_group), 0) > 100 or coalesce(cardinality(p_personal), 0) > 100 then
    raise exception 'Too many marks' using errcode = '54000';
  end if;
  return query
    with acts as (
      select a.hiker_id, a.activity_date,
             sum(a.credited_miles) over (order by a.created_at, a.id) as group_total,
             sum(a.credited_miles) over (partition by a.hiker_id order by a.created_at, a.id) as hiker_total
        from public.at_activities a
       where a.hiker_id is not null
    )
    select 'group'::text, g.m, x.hiker_id, x.activity_date
      from (select distinct m from unnest(coalesce(p_group, '{}'::numeric[])) m where m > 0) g
      cross join lateral (select acts.hiker_id, acts.activity_date from acts where acts.group_total >= g.m
                          order by acts.group_total limit 1) x
    union all
    select 'personal'::text, p.m, y.hiker_id, y.reached
      from (select distinct m from unnest(coalesce(p_personal, '{}'::numeric[])) m where m > 0) p
      cross join lateral (
        select first_cross.hiker_id, first_cross.activity_date as reached
          from (select distinct on (acts.hiker_id) acts.hiker_id, acts.activity_date
                  from acts where acts.hiker_total >= p.m
                 order by acts.hiker_id, acts.hiker_total) first_cross
      ) y;
end $$;

-- 5. Privileges: deny by default, then grant exactly what the app needs ------------------------------

revoke all on public.at_hikers from anon, authenticated;
grant insert (hiker_id) on public.at_activities to authenticated;
grant update (hiker_id) on public.at_activities to authenticated;
grant insert (hiker_id) on public.at_expedition_runs to authenticated;
grant select (hiker_id) on public.at_activities to authenticated;
grant select (hiker_id) on public.at_expedition_runs to authenticated;

revoke all on function public.at_is_expedition_member() from public, anon;
revoke all on function public.at_check_hiker() from public, anon, authenticated;
revoke all on function public.at_expedition_hikers(date) from public, anon;
revoke all on function public.at_expedition_marks(numeric[], numeric[]) from public, anon;
grant execute on function public.at_is_expedition_member() to authenticated;
grant execute on function public.at_expedition_hikers(date) to authenticated;
grant execute on function public.at_expedition_marks(numeric[], numeric[]) to authenticated;
