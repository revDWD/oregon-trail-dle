-- Upgrade test for the live project's path: 20261106000000_at_field_guide.sql was never applied, so
-- outings have no species column. run-rls-tests.sh builds a database with every migration except
-- 20261106 and 20261109; this file seeds live-like outings, applies 20261109 twice and checks that
-- it alone brings the field guide and permanent discoveries.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'WILDLIFE UPGRADE ASSERT FAILED: %', p_msg; end if;
end $$;

-- Live-like data: outings pinned to a hiker, with no species recorded ------------------------------
select pg_temp.ok(not exists (select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'at_expedition_runs' and column_name = 'species'), 'starts like live: no species column');
select pg_temp.ok(to_regprocedure('public.at_field_guide()') is null, 'starts like live: no field guide');
insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-000000000001', null);
select id as david from public.at_hikers where name = 'David' \gset
select id as kevin from public.at_hikers where name = 'Kevin' \gset
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false) \gset
insert into public.at_expedition_runs (theme, score, hits, shots, hiker_id) values ('wildlife', 24, 2, 3, :'david');
insert into public.at_expedition_runs (theme, score, hits, shots, hiker_id) values ('wildlife', 12, 1, 2, :'kevin');

\ir 20261109000000_at_wildlife_discoveries.sql
\ir 20261109000000_at_wildlife_discoveries.sql

select pg_temp.ok((select count(*) from public.at_expedition_runs where species = '{}' and photos = '{}') = 2, 'old outings are kept, with no species');
select pg_temp.ok((select count(*) from public.at_wildlife_observations) = 0, 'nothing is invented for them');
select pg_temp.ok((select count(*) from public.at_expeditions where ended_on is null and started_on = current_date) = 1, 'the current expedition is open');

set role authenticated;
select pg_temp.ok((select count(*) from public.at_field_guide()) = 0, 'the field guide answers');
select pg_temp.ok((select wildlife_runs from public.at_expedition_hikers() where name = 'David') = 1, 'the photo board still counts old outings');
-- An older client (species, no photos) and the new client (species and photos) both record discoveries.
insert into public.at_expedition_runs (theme, score, hits, shots, hiker_id, species, habitat) values ('wildlife', 30, 2, 2, :'david', '{deer,monarch}', 'blue-ridge');
insert into public.at_expedition_runs (theme, score, hits, shots, hiker_id, species, photos, habitat) values ('wildlife', 30, 3, 3, :'kevin', '{deer}', '{3}', 'smokies');
select pg_temp.ok((select count(*) from public.at_field_guide() where hiker_id = :'david') = 2, 'david''s discoveries are saved');
select pg_temp.ok((select photos from public.at_field_guide() where hiker_id = :'kevin' and species = 'deer') = 3, 'kevin''s photo count is saved');
reset role;
select pg_temp.ok((select count(*) from public.at_wildlife_observations where is_first) = 3, 'each is a first discovery for its hiker');

\o
\echo WILDLIFE UPGRADE TESTS PASSED
