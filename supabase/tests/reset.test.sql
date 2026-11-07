-- Expedition reset test. Runs after rls.test.sql, so the database holds activities, wildlife
-- outings, dispatches and organizers from several devices. Applies supabase/expedition-reset.sql
-- and checks that the expedition starts again at mile 0, everything can be earned again, and every
-- hiker's wildlife collection carries on into the new expedition.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

select (select count(*) from public.at_activities) as acts_before,
       (select count(*) from public.at_expedition_runs) as runs_before,
       (select count(*) from public.at_wildlife_observations) as obs_before,
       (select id from public.at_expeditions where ended_on is null) as expedition_before,
       (select count(*) from public.at_dispatches) as dispatches_before,
       (select count(*) from public.at_organizers) as organizers_before,
       (select count(*) from public.at_hikers) as hikers_before,
       (select count(*) from public.at_conversion_rules) as rules_before \gset
select t.ok(:acts_before > 0 and :runs_before > 0 and :obs_before > 0, 'there is progress to reset');

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
-- The wildlife collection carries on; the expedition (and its journal) starts over ---------------------
select t.ok((select count(*) from public.at_wildlife_observations) = :obs_before, 'every wildlife observation is kept');
select t.ok((select count(*) from public.at_wildlife_observations where run_id is not null) = 0, 'observations no longer point at deleted outings');
select t.ok((select ended_on from public.at_expeditions where id = :'expedition_before') = current_date, 'the old expedition is closed');
select t.ok((select count(*) from public.at_expeditions where ended_on is null and id <> :'expedition_before') = 1, 'a new expedition is open');
-- Backed up ------------------------------------------------------------------------------------------
select t.ok(exists (select 1 from pg_tables where schemaname = 'archive' and tablename like 'at\_activities\_%'), 'activities backed up');
select (select tablename from pg_tables where schemaname = 'archive' and tablename like 'at\_activities\_%') as acts_copy,
       (select tablename from pg_tables where schemaname = 'archive' and tablename like 'at\_expedition\_runs\_%') as runs_copy \gset
select t.ok((select count(*) from archive.:"acts_copy") = :acts_before, 'every activity is in the backup');
select t.ok((select count(*) from archive.:"runs_copy") = :runs_before, 'every outing is in the backup');
select (select tablename from pg_tables where schemaname = 'archive' and tablename like 'at\_wildlife\_observations\_%') as obs_copy \gset
select t.ok((select count(*) from archive.:"obs_copy") = :obs_before, 'every observation is in the backup');
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
select t.ok((select count(*) from public.at_field_guide()) > 0, 'the field guide keeps every hiker''s collection');
select t.ok((select count(*) from public.at_field_guide() where this_expedition) = 0, 'but nothing is from the new expedition yet');
select t.ok((select count(*) from public.at_dispatches) >= 1, 'dispatches still readable');

-- Everything can be earned again (Bob hit the daily outing cap before the reset)
insert into public.at_activities (activity_date, activity_type, actual_miles, hiker_id) values (current_date, 'walking', 2.5, :'david');
select t.ok((select total_credited_miles from public.at_expedition_hikers() where name = 'David') = 2.5, 'logging credits miles again');
select t.ok((select count(*) from public.at_expedition_marks('{1,2}', '{1}')) = 3, 'group marks and personal badges are reached again');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots, hiker_id, species, habitat) values ('wildlife', 30, 2, 2, '$$ || :'david' || $$', '{black-bear,deer}', 'blue-ridge')$$) = 1, 'wildlife outings record again');
select t.ok((select count(*) from public.at_field_guide() where this_expedition) = 2, 'species are spotted again in the new expedition');
select t.ok((select count(*) from public.at_field_guide() where hiker_id = :'david' and species = 'black-bear') = 2, 'next to the earlier expedition''s find');
select t.ok((select first_spotted_on from public.at_expedition_hikers() where name = 'David') = current_date, 'first sighting dates start over');
reset role;
select t.ok((select count(*) from public.at_wildlife_observations where hiker_id = :'david' and species = 'black-bear' and is_first) = 1, 'a species found before the reset is not a new discovery');
select t.ok((select is_first from public.at_wildlife_observations where hiker_id = :'david' and species = 'deer'), 'a species new to the hiker is');

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
update public.at_wildlife_observations set expedition_id = (select id from public.at_expeditions where ended_on is not null order by created_at desc limit 1) where expedition_id = (select id from public.at_expeditions where ended_on is null);
delete from public.at_expeditions where ended_on is null;
update public.at_expeditions set ended_on = null where id = (select id from public.at_expeditions order by created_at desc limit 1);
select t.ok((select id from public.at_expeditions where ended_on is null) = :'expedition_before', 'undo re-opens the previous expedition');
select t.ok((select count(*) from public.at_wildlife_observations where expedition_id = :'expedition_before') = :obs_before + 2, 'undo keeps photos taken since the reset');
select t.ok((select count(*) from public.at_wildlife_observations) = :obs_before + 2, 'undo records no wildlife twice');
select t.ok((select count(*) from public.at_activities a join archive.:"acts_copy" b using (id)
              where a.credited_miles = b.credited_miles and a.activity_date = b.activity_date and a.user_id = b.user_id) = :acts_before, 'undo restores every activity as it was');
select t.ok((select sum(credited_miles) from public.at_activities) = :miles_backup + :miles_now, 'undo restores the miles');
select t.ok((select count(*) from public.at_expedition_runs a join archive.:"runs_copy" b using (id) where a.played_on = b.played_on) = :runs_before, 'undo keeps outing dates');
select t.ok((select count(*) from pg_trigger where tgrelid in ('public.at_activities'::regclass, 'public.at_expedition_runs'::regclass)
              and not tgisinternal and tgenabled = 'D') = 0, 'logging triggers are back on');
rollback;

\o
\echo RESET TESTS PASSED
