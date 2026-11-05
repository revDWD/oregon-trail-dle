-- Expedition reset: start a brand-new expedition at mile 0. Run in the Supabase SQL editor.
-- NOT a migration: it deletes progress, so it only runs when someone deliberately pastes it.
--
-- Keeps : the hiker roster (at_hikers), conversion rules, organizers, Trail Dispatches, auth users.
--         Trail, landmark, species and badge definitions live in the app code and are never touched.
-- Clears: every logged activity (at_activities) and every Wildlife Spotting outing (at_expedition_runs).
--         Miles, trail position, landmarks passed, the trail register, badges (mileage, wildlife and
--         species), the field guide, the Expedition Journal, History and Camp stats are all computed
--         from those two tables, so they all return to zero with them.
--
-- A timestamped copy of both tables goes into the private `archive` schema first (not reachable
-- through the Data API). The final select shows the copies' names.
--
-- To undo, restore the copies exactly as they were (the logging triggers are paused for the copy,
-- otherwise they would refuse old dates and re-date the outings):
--   begin;
--   alter table public.at_activities disable trigger user;
--   alter table public.at_expedition_runs disable trigger user;
--   insert into public.at_activities select * from archive.at_activities_YYYYMMDD_HHMMSS;
--   insert into public.at_expedition_runs select * from archive.at_expedition_runs_YYYYMMDD_HHMMSS;
--   alter table public.at_activities enable trigger user;
--   alter table public.at_expedition_runs enable trigger user;
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
         where schemaname = 'archive' and tablename ~ '^at_(activities|expedition_runs)_[0-9]{8}_[0-9]{6}') as backups;
