-- Expedition reset test. Runs after rls.test.sql, so the database holds activities, wildlife
-- outings, dispatches and organizers from several devices. Applies supabase/expedition-reset.sql
-- and checks that the expedition starts again at mile 0 and everything can be earned again.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

select (select count(*) from public.at_activities) as acts_before,
       (select count(*) from public.at_expedition_runs) as runs_before,
       (select count(*) from public.at_dispatches) as dispatches_before,
       (select count(*) from public.at_organizers) as organizers_before,
       (select count(*) from public.at_hikers) as hikers_before,
       (select count(*) from public.at_conversion_rules) as rules_before \gset
select t.ok(:acts_before > 0 and :runs_before > 0, 'there is progress to reset');

\ir expedition-reset.sql
\o /dev/null

-- Reset ----------------------------------------------------------------------------------------------
select t.ok((select count(*) from public.at_activities) = 0, 'no activities');
select t.ok((select count(*) from public.at_expedition_runs) = 0, 'no wildlife outings');
-- Kept -----------------------------------------------------------------------------------------------
select t.ok((select count(*) from public.at_hikers) = :hikers_before, 'roster kept');
select t.ok((select count(*) from public.at_conversion_rules) = :rules_before, 'conversion rules kept');
select t.ok((select count(*) from public.at_dispatches) = :dispatches_before, 'dispatches kept');
select t.ok((select count(*) from public.at_organizers) = :organizers_before, 'organizers kept');
-- Backed up ------------------------------------------------------------------------------------------
select t.ok(exists (select 1 from pg_tables where schemaname = 'archive' and tablename like 'at\_activities\_%'), 'activities backed up');
select (select tablename from pg_tables where schemaname = 'archive' and tablename like 'at\_activities\_%') as acts_copy,
       (select tablename from pg_tables where schemaname = 'archive' and tablename like 'at\_expedition\_runs\_%') as runs_copy \gset
select t.ok((select count(*) from archive.:"acts_copy") = :acts_before, 'every activity is in the backup');
select t.ok((select count(*) from archive.:"runs_copy") = :runs_before, 'every outing is in the backup');
select t.ok(not has_schema_privilege('authenticated', 'archive', 'usage'), 'backups are private');

-- Post-reset validation as a signed-in device ----------------------------------------------------------
select id as david from public.at_hikers where name = 'David' \gset
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false) \gset
set role authenticated;
select t.ok((select count(*) from public.at_expedition_hikers()) = 11, 'all eleven active hikers are listed');
select t.ok((select sum(total_credited_miles) from public.at_expedition_hikers()) = 0, 'everyone is at mile 0');
select t.ok((select sum(wildlife_score) + sum(wildlife_runs) + sum(activity_count) from public.at_expedition_hikers()) = 0, 'no stats');
select t.ok((select count(*) from public.at_expedition_hikers() where first_spotted_on is not null or last_activity_date is not null) = 0, 'no dates');
select t.ok((select count(*) from public.at_expedition_marks('{1,2}', '{1,2}')) = 0, 'no landmarks or mileage badges reached');
select t.ok((select count(*) from public.at_field_guide()) = 0, 'empty field guide');
select t.ok((select count(*) from public.at_dispatches) >= 1, 'dispatches still readable');

-- Everything can be earned again (Bob hit the daily outing cap before the reset)
insert into public.at_activities (activity_date, activity_type, actual_miles, hiker_id) values (current_date, 'walking', 2.5, :'david');
select t.ok((select total_credited_miles from public.at_expedition_hikers() where name = 'David') = 2.5, 'logging credits miles again');
select t.ok((select count(*) from public.at_expedition_marks('{1,2}', '{1}')) = 3, 'group marks and personal badges are reached again');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots, hiker_id, species, habitat) values ('wildlife', 30, 2, 2, '$$ || :'david' || $$', '{black-bear,monarch}', 'blue-ridge')$$) = 1, 'wildlife outings record again');
select t.ok((select count(*) from public.at_field_guide()) = 2, 'species are discovered again');
select t.ok((select first_spotted_on from public.at_expedition_hikers() where name = 'David') = current_date, 'first sighting dates start over');
reset role;

-- The documented undo restores every backed-up row unchanged (old dates, outing dates, credited miles)
select coalesce(sum(credited_miles), 0) as miles_backup from archive.:"acts_copy" \gset
select coalesce(sum(credited_miles), 0) as miles_now from public.at_activities \gset
begin;
alter table public.at_activities disable trigger user;
alter table public.at_expedition_runs disable trigger user;
insert into public.at_activities select * from archive.:"acts_copy";
insert into public.at_expedition_runs select * from archive.:"runs_copy";
alter table public.at_activities enable trigger user;
alter table public.at_expedition_runs enable trigger user;
select t.ok((select count(*) from public.at_activities a join archive.:"acts_copy" b using (id)
              where a.credited_miles = b.credited_miles and a.activity_date = b.activity_date and a.user_id = b.user_id) = :acts_before, 'undo restores every activity as it was');
select t.ok((select sum(credited_miles) from public.at_activities) = :miles_backup + :miles_now, 'undo restores the miles');
select t.ok((select count(*) from public.at_expedition_runs a join archive.:"runs_copy" b using (id) where a.played_on = b.played_on) = :runs_before, 'undo keeps outing dates');
select t.ok((select count(*) from pg_trigger where tgrelid in ('public.at_activities'::regclass, 'public.at_expedition_runs'::regclass)
              and not tgisinternal and tgenabled = 'D') = 0, 'logging triggers are back on');
rollback;

\o
\echo RESET TESTS PASSED
