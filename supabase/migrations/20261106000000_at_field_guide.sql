-- Wildlife field guide (Wildlife Spotting sprint).
--
--   * Each Wildlife Spotting run now remembers WHICH species were photographed and in WHICH habitat
--     (two new columns on at_expedition_runs). Older runs simply have none.
--   * at_field_guide() returns aggregates only: for each hiker, species and habitat, the first date it
--     was photographed and how many outings included it. Individual runs stay private (RLS unchanged).
--
-- Additive and idempotent: safe to run more than once. Until it is applied the app keeps working;
-- the field guide just shows this session's discoveries.

alter table public.at_expedition_runs add column if not exists species text[] not null default '{}';
alter table public.at_expedition_runs add column if not exists habitat text;

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

-- Each species counts once per outing.
create or replace function public.at_expedition_runs_species()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.species := coalesce((select array_agg(distinct s order by s) from unnest(new.species) as s), '{}');
  return new;
end $$;

drop trigger if exists at_expedition_runs_species on public.at_expedition_runs;
create trigger at_expedition_runs_species before insert on public.at_expedition_runs
  for each row execute function public.at_expedition_runs_species();

grant insert (species, habitat) on public.at_expedition_runs to authenticated;
grant select (species, habitat) on public.at_expedition_runs to authenticated;

-- The shared field guide: aggregates only, no device or user ids.
create or replace function public.at_field_guide()
returns table (hiker_id uuid, species text, habitat text, first_seen date, sightings bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not public.at_is_expedition_member() then raise exception 'Not signed in' using errcode = '42501'; end if;
  return query
    select r.hiker_id, s.sp, coalesce(r.habitat, ''), min(r.played_on), count(*)::bigint
      from public.at_expedition_runs r
      cross join lateral unnest(r.species) as s(sp)
     where r.theme = 'wildlife'
     group by r.hiker_id, s.sp, coalesce(r.habitat, '')
     order by min(r.played_on), s.sp
     limit 5000;
end $$;

revoke all on function public.at_expedition_runs_species() from public, anon, authenticated;
revoke all on function public.at_field_guide() from public, anon;
grant execute on function public.at_field_guide() to authenticated;
