-- Upgrade test for 20261108000000_at_cleanup.sql. run-rls-tests.sh builds a database with every
-- earlier migration, then this file seeds what the live project could hold, applies the cleanup
-- twice and checks that only dead objects went away and nothing worth keeping was lost.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'UPGRADE ASSERT FAILED: %', p_msg; end if;
end $$;

-- Live-like data in the old schema -----------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', null), ('bbbbbbbb-0000-4000-8000-000000000002', null);
select pg_temp.ok((select count(*) from public.at_profiles) = 2, 'old schema: every sign-in wrote a profile row');
insert into public.at_challenges (id, name, owner_id, invite_code)
  values ('99999999-0000-4000-8000-000000000009', 'Old crew', 'aaaaaaaa-0000-4000-8000-000000000001', 'ABCDEFGHJKLM');
insert into public.at_challenge_members (challenge_id, user_id, role)
  values ('99999999-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000001', 'owner');
insert into public.at_dispatches (title, body, pinned) values ('Welcome', 'Public post', true);
insert into public.at_dispatches (title, body, challenge_id) values ('Crew note', 'Crew post', '99999999-0000-4000-8000-000000000009');
select id as david from public.at_hikers where name = 'David' \gset
insert into public.at_activities (user_id, activity_date, activity_type, actual_miles, hiker_id, notes)
  values ('aaaaaaaa-0000-4000-8000-000000000001', current_date, 'walking', 3, :'david', 'kept');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false) \gset
insert into public.at_expedition_runs (user_id, theme, score, hits, shots, hiker_id, species, habitat)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'wildlife', 20, 2, 2, :'david', '{deer,turkey}', 'blue-ridge');
select public.add_community_miles(5, 'device-1', gen_random_uuid());
select pg_temp.ok((select total_miles from public.community_progress) = 5, 'legacy totals exist before cleanup');

-- Apply the cleanup twice ---------------------------------------------------------------------------
\ir 20261108000000_at_cleanup.sql
\ir 20261108000000_at_cleanup.sql

-- Kept ------------------------------------------------------------------------------------------------
select pg_temp.ok((select count(*) from public.at_activities where notes = 'kept') = 1, 'activities untouched');
select pg_temp.ok((select count(*) from public.at_expedition_runs) = 1, 'wildlife outings untouched');
select pg_temp.ok((select count(*) from public.at_hikers) = 11, 'roster untouched');
select pg_temp.ok((select count(*) from public.at_conversion_rules) = 5, 'conversion rules untouched');
select pg_temp.ok((select string_agg(title, ',') from public.at_dispatches) = 'Welcome', 'public dispatches stay');
select pg_temp.ok((select count(*) from auth.users) = 2, 'auth users untouched');
-- Archived, not lost ------------------------------------------------------------------------------------
select pg_temp.ok((select string_agg(title || '/' || body, ',') from archive.at_dispatches_crew_only) = 'Crew note/Crew post', 'crew-only dispatch archived exactly once');
select pg_temp.ok((select total_miles from archive.community_progress) = 5 and (select count(*) from archive.mileage_log) = 1, 'legacy rows archived');
-- Gone ------------------------------------------------------------------------------------------------
select pg_temp.ok(to_regclass('public.at_profiles') is null and to_regclass('public.at_challenges') is null
              and to_regclass('public.at_challenge_members') is null, 'dead tables dropped');
select pg_temp.ok(to_regprocedure('public.add_community_miles(numeric, text, uuid)') is null, 'legacy anon write path closed');
insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003', null);
select pg_temp.ok(to_regclass('public.at_profiles') is null, 'new sign-ins still work with no profile table');

-- The app's live RPCs still answer after the cleanup
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false) \gset
set role authenticated;
select pg_temp.ok((select total_credited_miles from public.at_expedition_hikers() where name = 'David') = 3, 'hiker totals still work');
select pg_temp.ok((select count(*) from public.at_field_guide()) = 2, 'field guide still works');
select pg_temp.ok((select count(*) from public.at_dispatches) = 1, 'dispatches readable without the crew clause');
reset role;

\o
\echo UPGRADE TESTS PASSED
