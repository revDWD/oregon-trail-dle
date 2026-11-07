-- Expedition reset: start a brand-new expedition at mile 0. Run in the Supabase SQL editor.
-- NOT a migration: it deletes progress, so it only runs when someone deliberately pastes it.
--
-- Keeps : the hiker roster (at_hikers), conversion rules, organizers, Trail Dispatches, auth users,
--         and every hiker's wildlife collection (at_wildlife_observations: species badges, the field
--         guide, photo counts and discovery dates carry on into the next expedition).
--         Trail, landmark, species and badge definitions live in the app code and are never touched.
-- Clears: every logged activity (at_activities) and every Wildlife Spotting outing (at_expedition_runs).
--         Miles, trail position, landmarks passed, the trail register, mileage and milestone badges,
--         the photo board, the Expedition Journal, History and Camp stats are all computed from those
--         two tables (and the current expedition), so they all return to zero with them.
-- Starts: a new row in at_expeditions. The old one is closed, so its wildlife finds stay in each
--         hiker's collection but no longer appear in the new expedition's journal.
--
-- A timestamped copy of the activities, outings and wildlife observations goes into the private
-- `archive` schema first (not reachable through the Data API). The final select shows the copies' names.
--
-- To undo, restore the copies exactly as they were (the logging triggers are paused for the copy,
-- otherwise they would refuse old dates, re-date the outings and record their wildlife twice), then
-- re-open the previous expedition (any photos taken since the reset move back into it):
--   begin;
--   alter table public.at_activities disable trigger user;
--   alter table public.at_expedition_runs disable trigger user;
--   insert into public.at_activities select * from archive.at_activities_YYYYMMDD_HHMMSS;
--   insert into public.at_expedition_runs select * from archive.at_expedition_runs_YYYYMMDD_HHMMSS;
--   alter table public.at_activities enable trigger user;
--   alter table public.at_expedition_runs enable trigger user;
--   update public.at_wildlife_observations set expedition_id = (select id from public.at_expeditions where ended_on is not null order by created_at desc limit 1) where expedition_id = (select id from public.at_expeditions where ended_on is null);
--   delete from public.at_expeditions where ended_on is null;
--   update public.at_expeditions set ended_on = null where id = (select id from public.at_expeditions order by created_at desc limit 1);
--   commit;
-- To delete the copies for good:   drop schema archive cascade;
-- No dollar quoting ($$) on purpose: chat renders it as maths when the owner copies this SQL.

begin;

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

do '
declare
  v_stamp text := to_char(clock_timestamp() at time zone ''utc'', ''YYYYMMDD"_"HH24MISS'');
begin
  execute format(''create table archive.%I as table public.at_activities'', ''at_activities_'' || v_stamp);
  execute format(''create table archive.%I as table public.at_expedition_runs'', ''at_expedition_runs_'' || v_stamp);
  if to_regclass(''public.at_wildlife_observations'') is not null then
    execute format(''create table archive.%I as table public.at_wildlife_observations'', ''at_wildlife_observations_'' || v_stamp);
  end if;
  if to_regclass(''public.at_expeditions'') is not null then
    update public.at_expeditions set ended_on = greatest(current_date, started_on) where ended_on is null;
    insert into public.at_expeditions (name) select ''Expedition '' || (count(*) + 1) from public.at_expeditions;
  end if;
end';

delete from public.at_activities;
delete from public.at_expedition_runs;

-- Optional: also clear the Trail Dispatches feed (announcements, not progress). Uncomment to use.
-- delete from public.at_dispatches;

commit;

-- Check: expect 0, 0, the full roster and the backup names.
select (select count(*) from public.at_activities) as activities,
       (select count(*) from public.at_expedition_runs) as wildlife_outings,
       (select string_agg(name, ', ' order by sort_order) from public.at_hikers where active) as hikers,
       (select string_agg(tablename, ', ' order by tablename) from pg_tables
         where schemaname = 'archive' and tablename ~ '^at_(activities|expedition_runs|wildlife_observations)_[0-9]{8}_[0-9]{6}') as backups;
