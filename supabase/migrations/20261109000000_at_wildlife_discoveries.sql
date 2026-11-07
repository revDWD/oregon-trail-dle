-- Wildlife discoveries: a permanent, per-hiker wildlife collection (Wildlife Spotting persistence sprint).
--
-- Why: the live project never received 20261106000000_at_field_guide.sql, so outings were saved with
-- score/hits/shots only and every photographed species was lost. This file supersedes it for the live
-- project (paste this one; it adds everything 20261106 would have) and adds durable discovery records.
--
--   * at_expedition_runs gains species, habitat and photos (photos per species, aligned with species).
--   * at_expeditions: one row per expedition. Exactly one is open; the reset script closes it and opens
--     the next, so the Expedition Journal starts over while every hiker's collection carries on.
--   * at_wildlife_observations: one row per hiker, species and outing (when, where, how many photos,
--     which expedition, and whether it was that hiker's first ever photo of the species). Written only
--     by a trigger on at_expedition_runs, so the daily outing cap and every check still apply. Not
--     readable or writable by the API roles. Unlike runs, observations survive an expedition reset and
--     the deletion of the anonymous device that took them (run_id and user_id become null).
--   * A unique index allows only one first discovery per hiker and species; the trigger takes a
--     per-hiker lock so two devices saving at once cannot both claim it.
--   * at_wildlife_discoveries (view, owner-only): one row per hiker and species, for the SQL editor and
--     future statistics pages. Counts are computed from observations, never stored, so they cannot drift.
--   * at_field_guide() now reads observations and also returns photos, last_seen and this_expedition.
--
-- Additive and idempotent: safe to run more than once, before or after 20261106. Existing outings that
-- recorded species are copied into observations once. Outings saved without species (the live data so
-- far) cannot be recovered: the species were never sent to the database.
--
-- Written without dollar quoting ($$) on purpose: the owner copies SQL from chat, and chat renders
-- $$...$$ as maths. Function bodies are plain strings, so single quotes inside them are doubled.

-- 1. Species, habitat and photos on each outing --------------------------------------------------------
alter table public.at_expedition_runs add column if not exists species text[] not null default '{}';
alter table public.at_expedition_runs add column if not exists habitat text;
alter table public.at_expedition_runs add column if not exists photos smallint[] not null default '{}';

alter table public.at_expedition_runs drop constraint if exists at_expedition_runs_species_check;
alter table public.at_expedition_runs add constraint at_expedition_runs_species_check check (
  cardinality(species) <= 40
  and cardinality(species) <= hits
  and array_position(species, null) is null
  and array_to_string(species, ',') ~ '^([a-z][a-z0-9-]{1,30}(,[a-z][a-z0-9-]{1,30})*)?$'
);

alter table public.at_expedition_runs drop constraint if exists at_expedition_runs_habitat_check;
alter table public.at_expedition_runs add constraint at_expedition_runs_habitat_check check (
  habitat is null or habitat ~ '^[a-z][a-z0-9-]{1,30}$'
);

-- Outings saved by 20261106 have species but no photo counts: one photo each.
update public.at_expedition_runs set photos = array_fill(1::smallint, array[cardinality(species)])
 where cardinality(photos) <> cardinality(species);

alter table public.at_expedition_runs drop constraint if exists at_expedition_runs_photos_check;
alter table public.at_expedition_runs add constraint at_expedition_runs_photos_check check (
  cardinality(photos) = cardinality(species)
  and array_position(photos, null) is null
  and 1 <= all (photos) and 100 >= all (photos)
);

-- Each species counts once per outing; its photos add up. Photos default to 1 per species (older
-- clients send none), and an outing cannot have more photos than frames that hit.
create or replace function public.at_expedition_runs_species()
returns trigger language plpgsql set search_path = '' as '
declare
  v_species text[];
  v_photos smallint[];
begin
  select coalesce(array_agg(x.sp order by x.sp), ''{}''), coalesce(array_agg(x.n order by x.sp), ''{}'')
    into v_species, v_photos
    from (select u.sp, sum(coalesce(u.n, 1))::smallint as n
            from unnest(new.species, new.photos) as u(sp, n)
           where u.sp is not null
           group by u.sp) x;
  new.species := v_species;
  new.photos := v_photos;
  if (select coalesce(sum(p), 0) from unnest(new.photos) as p) > new.hits then
    raise exception ''More photos than frames'' using errcode = ''23514'';
  end if;
  return new;
end';

drop trigger if exists at_expedition_runs_species on public.at_expedition_runs;
create trigger at_expedition_runs_species before insert on public.at_expedition_runs
  for each row execute function public.at_expedition_runs_species();

grant insert (species, habitat, photos) on public.at_expedition_runs to authenticated;
grant select (species, habitat, photos) on public.at_expedition_runs to authenticated;

-- 2. Expeditions -----------------------------------------------------------------------------------------
create table if not exists public.at_expeditions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  started_on date not null default current_date,
  ended_on   date,
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);
create unique index if not exists at_expeditions_one_open on public.at_expeditions ((true)) where ended_on is null;
alter table public.at_expeditions enable row level security;

insert into public.at_expeditions (name, started_on)
select 'Expedition 1', coalesce((select min(r.played_on) from public.at_expedition_runs r), current_date)
 where not exists (select 1 from public.at_expeditions e where e.ended_on is null);

-- 3. Observations: the permanent record ------------------------------------------------------------------
create table if not exists public.at_wildlife_observations (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references public.at_expedition_runs (id) on delete set null,
  user_id       uuid references auth.users (id) on delete set null,
  hiker_id      uuid not null references public.at_hikers (id) on delete restrict,
  expedition_id uuid not null references public.at_expeditions (id) on delete restrict,
  species       text not null check (species ~ '^[a-z][a-z0-9-]{1,30}$'),
  habitat       text check (habitat is null or habitat ~ '^[a-z][a-z0-9-]{1,30}$'),
  photos        smallint not null default 1 check (photos between 1 and 100),
  observed_at   timestamptz not null default now(),
  observed_on   date not null default current_date,
  is_first      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (run_id, species)
);
create unique index if not exists at_wildlife_observations_first on public.at_wildlife_observations (hiker_id, species) where is_first;
create index if not exists at_wildlife_observations_hiker_idx on public.at_wildlife_observations (hiker_id, observed_at);
create index if not exists at_wildlife_observations_expedition_idx on public.at_wildlife_observations (expedition_id);
alter table public.at_wildlife_observations enable row level security;

-- Every outing with a hiker and species becomes observations, in the same transaction as the outing.
create or replace function public.at_expedition_runs_observe()
returns trigger language plpgsql security definer set search_path = '' as '
declare
  v_expedition uuid;
begin
  if new.theme <> ''wildlife'' or new.hiker_id is null or cardinality(new.species) = 0 then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(''at_wildlife:'' || new.hiker_id::text, 0));
  select e.id into v_expedition from public.at_expeditions e where e.ended_on is null;
  if v_expedition is null then
    insert into public.at_expeditions (name) values (''Expedition'') returning id into v_expedition;
  end if;
  insert into public.at_wildlife_observations
         (run_id, user_id, hiker_id, expedition_id, species, habitat, photos, observed_at, observed_on, is_first)
  select new.id, new.user_id, new.hiker_id, v_expedition, u.sp, new.habitat, coalesce(u.n, 1), new.created_at, new.played_on,
         not exists (select 1 from public.at_wildlife_observations o
                      where o.hiker_id = new.hiker_id and o.species = u.sp and o.is_first)
    from unnest(new.species, new.photos) as u(sp, n)
   where u.sp is not null
  on conflict do nothing;
  return null;
end';

drop trigger if exists at_expedition_runs_observe on public.at_expedition_runs;
create trigger at_expedition_runs_observe after insert on public.at_expedition_runs
  for each row execute function public.at_expedition_runs_observe();

-- Copy outings saved before this migration (only those that recorded species), then mark firsts.
insert into public.at_wildlife_observations
       (run_id, user_id, hiker_id, expedition_id, species, habitat, photos, observed_at, observed_on)
select r.id, r.user_id, r.hiker_id, (select e.id from public.at_expeditions e where e.ended_on is null),
       u.sp, r.habitat, coalesce(u.n, 1), r.created_at, r.played_on
  from public.at_expedition_runs r
 cross join lateral unnest(r.species, r.photos) as u(sp, n)
 where r.theme = 'wildlife' and r.hiker_id is not null and u.sp is not null
on conflict do nothing;

update public.at_wildlife_observations o set is_first = true
 where o.id in (select distinct on (f.hiker_id, f.species) f.id from public.at_wildlife_observations f
                 order by f.hiker_id, f.species, f.observed_at, f.created_at, f.id)
   and not exists (select 1 from public.at_wildlife_observations f
                    where f.hiker_id = o.hiker_id and f.species = o.species and f.is_first);

-- 4. One row per hiker and species (owner-only; for the SQL editor and future statistics) ------------------
create or replace view public.at_wildlife_discoveries with (security_invoker = true) as
select o.hiker_id,
       o.species,
       min(o.observed_at)  as first_discovered_at,
       min(o.observed_on)  as first_discovered_on,
       sum(o.photos)::bigint as times_photographed,
       count(*)::bigint    as outings,
       max(o.observed_at)  as last_photographed_at
  from public.at_wildlife_observations o
 group by o.hiker_id, o.species;

-- 5. The shared field guide: aggregates only, no device or user ids ---------------------------------------
drop function if exists public.at_field_guide();
create function public.at_field_guide()
returns table (hiker_id uuid, species text, habitat text, first_seen date, sightings bigint,
               photos bigint, last_seen date, this_expedition boolean)
language plpgsql stable security definer set search_path = '' as '
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception ''Not authenticated'' using errcode = ''28000''; end if;
  if not public.at_is_expedition_member() then raise exception ''Not signed in'' using errcode = ''42501''; end if;
  return query
    select o.hiker_id, o.species, coalesce(o.habitat, ''''), min(o.observed_on), count(*)::bigint,
           sum(o.photos)::bigint, max(o.observed_on), (e.ended_on is null)
      from public.at_wildlife_observations o
      join public.at_expeditions e on e.id = o.expedition_id
     group by o.hiker_id, o.species, coalesce(o.habitat, ''''), (e.ended_on is null)
     order by min(o.observed_on), o.species
     limit 20000;
end';

-- 6. Privileges: the API roles reach observations only through at_field_guide() ------------------------------
revoke all on public.at_expeditions from public, anon, authenticated;
revoke all on public.at_wildlife_observations from public, anon, authenticated;
revoke all on public.at_wildlife_discoveries from public, anon, authenticated;
revoke all on function public.at_expedition_runs_species() from public, anon, authenticated;
revoke all on function public.at_expedition_runs_observe() from public, anon, authenticated;
revoke all on function public.at_field_guide() from public, anon;
grant execute on function public.at_field_guide() to authenticated;
