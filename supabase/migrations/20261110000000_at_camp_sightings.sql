-- Camp photos count: a wildlife photo taken in the 3D camp is a full discovery.
--
-- Until now only photo outings (at_expedition_runs) wrote wildlife observations. This adds one narrow,
-- server-checked door for the camp camera:
--   * at_wildlife_observations.source says where an observation came from: 'outing' (every existing
--     row), 'camp', or 'trail' (reserved for the Wildlife Trail).
--   * at_camp_sighting(hiker, species) records one camp sighting. It accepts only the common and
--     uncommon camp visitors (rare species stay a photo-outing find), at most one sighting per hiker,
--     species and day, at most 5 camp sightings per hiker per day and 40 per device per day. It adds no
--     miles and no points. It returns 'new' (a first discovery), 'added', 'seen' (already today) or
--     'limit'.
--   * at_field_guide() also returns camp_sightings, so the guide can say "Spotted in: Camp".
--
-- The species list must match CAMP_SIGHTING_SPECIES in assets/js/at/engine/camp-life.js (test-enforced).
-- Idempotent: safe to run twice. Written without dollar quoting so it pastes cleanly.

-- 1. Where an observation came from -------------------------------------------------------------------
alter table public.at_wildlife_observations add column if not exists source text not null default 'outing';
alter table public.at_wildlife_observations drop constraint if exists at_wildlife_observations_source_check;
alter table public.at_wildlife_observations add constraint at_wildlife_observations_source_check
  check (source in ('outing', 'camp', 'trail'));
create unique index if not exists at_wildlife_observations_camp_daily
  on public.at_wildlife_observations (hiker_id, species, observed_on) where source = 'camp';
create index if not exists at_wildlife_observations_camp_device_idx
  on public.at_wildlife_observations (user_id, observed_on) where source = 'camp';

-- 2. Record one camp sighting ---------------------------------------------------------------------------
create or replace function public.at_camp_sighting(p_hiker uuid, p_species text)
returns text language plpgsql security definer set search_path = '' as '
declare
  v_expedition uuid;
  v_first boolean;
begin
  if auth.uid() is null then raise exception ''Not authenticated'' using errcode = ''28000''; end if;
  if not public.at_is_expedition_member() then raise exception ''Not signed in'' using errcode = ''42501''; end if;
  if p_hiker is null or not exists (select 1 from public.at_hikers h where h.id = p_hiker and h.active) then
    raise exception ''Choose a hiker on the roster'' using errcode = ''23503'';
  end if;
  if p_species is null or p_species not in (''gray-squirrel'', ''chipmunk'', ''cottontail'', ''chickadee'',
                                           ''blue-jay'', ''turkey'', ''fox'', ''deer'') then
    raise exception ''That species is not a camp sighting'' using errcode = ''23514'';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(''at_wildlife:'' || p_hiker::text, 0));
  if exists (select 1 from public.at_wildlife_observations o
              where o.hiker_id = p_hiker and o.species = p_species
                and o.source = ''camp'' and o.observed_on = current_date) then
    return ''seen'';
  end if;
  if (select count(*) from public.at_wildlife_observations o
       where o.hiker_id = p_hiker and o.source = ''camp'' and o.observed_on = current_date) >= 5
     or (select count(*) from public.at_wildlife_observations o
          where o.user_id = auth.uid() and o.source = ''camp'' and o.observed_on = current_date) >= 40 then
    return ''limit'';
  end if;
  select e.id into v_expedition from public.at_expeditions e where e.ended_on is null;
  if v_expedition is null then
    insert into public.at_expeditions (name) values (''Expedition'') returning id into v_expedition;
  end if;
  v_first := not exists (select 1 from public.at_wildlife_observations o
                          where o.hiker_id = p_hiker and o.species = p_species and o.is_first);
  insert into public.at_wildlife_observations (user_id, hiker_id, expedition_id, species, photos, is_first, source)
  values (auth.uid(), p_hiker, v_expedition, p_species, 1, v_first, ''camp'');
  return case when v_first then ''new'' else ''added'' end;
end';

-- 3. The shared field guide also says how many sightings were at camp -------------------------------------
drop function if exists public.at_field_guide();
create function public.at_field_guide()
returns table (hiker_id uuid, species text, habitat text, first_seen date, sightings bigint,
               photos bigint, last_seen date, this_expedition boolean, camp_sightings bigint)
language plpgsql stable security definer set search_path = '' as '
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception ''Not authenticated'' using errcode = ''28000''; end if;
  if not public.at_is_expedition_member() then raise exception ''Not signed in'' using errcode = ''42501''; end if;
  return query
    select o.hiker_id, o.species, coalesce(o.habitat, ''''), min(o.observed_on), count(*)::bigint,
           sum(o.photos)::bigint, max(o.observed_on), (e.ended_on is null),
           (count(*) filter (where o.source = ''camp''))::bigint
      from public.at_wildlife_observations o
      join public.at_expeditions e on e.id = o.expedition_id
     group by o.hiker_id, o.species, coalesce(o.habitat, ''''), (e.ended_on is null)
     order by min(o.observed_on), o.species
     limit 20000;
end';

-- 4. Privileges -------------------------------------------------------------------------------------------
revoke all on function public.at_camp_sighting(uuid, text) from public, anon;
grant execute on function public.at_camp_sighting(uuid, text) to authenticated;
revoke all on function public.at_field_guide() from public, anon;
grant execute on function public.at_field_guide() to authenticated;
