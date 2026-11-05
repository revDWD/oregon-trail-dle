-- Schema cleanup: removes tables and functions the app no longer uses (audit: docs/review-and-roadmap.md §16).
-- Run once in the Supabase SQL editor AFTER the frontend from the same pull request is live
-- (that frontend never reads or writes at_dispatches.challenge_id). Safe to run more than once.
--
-- Removed (no code path reaches them since the open expedition, 20261105000000):
--   * at_challenges, at_challenge_members and their RPCs (create/join/leave/invite/leaderboard/summary).
--   * at_dispatches.challenge_id ("crew only" dispatches): there are no crews to address any more.
--   * at_profiles, at_ensure_profile and the auth.users trigger that wrote a profile row for every
--     anonymous sign-in (hikers are names on the roster, not device profiles).
--   * at_camp_supplies: the photo board now comes from at_expedition_hikers.wildlife_score.
--   * The Oregon Trail DLE leftovers (community_progress, mileage_log, add_community_*). Their RPCs were
--     callable with the public key; dropping them closes that write path.
--
-- Nothing is lost: legacy tables and any crew-only dispatches move into the private `archive` schema,
-- which the Data API does not expose and anon/authenticated cannot use. When you no longer need them:
--   drop schema archive cascade;

-- 0. A private schema for anything worth keeping -----------------------------------------------------
create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

-- 1. Oregon Trail DLE leftovers: keep the data (archived), drop the public write path ----------------
do $$
declare
  t text;
  f regprocedure;
begin
  foreach t in array array['community_progress', 'mileage_log'] loop
    if to_regclass('public.' || t) is not null then
      if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
      if to_regclass('archive.' || t) is null then
        execute format('alter table public.%I set schema archive', t);
      else
        execute format('drop table public.%I', t);  -- already archived by an earlier run
      end if;
    end if;
    if to_regclass('archive.' || t) is not null then
      execute format('revoke all on archive.%I from public, anon, authenticated', t);
    end if;
  end loop;
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('add_community_miles', 'add_community_contribution') loop
    execute format('drop function %s', f);
  end loop;
end $$;

-- 2. Crew-only dispatches: archive, then drop the column ------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'at_dispatches' and column_name = 'challenge_id') then
    create table if not exists archive.at_dispatches_crew_only as table public.at_dispatches with no data;
    insert into archive.at_dispatches_crew_only select * from public.at_dispatches where challenge_id is not null;
    delete from public.at_dispatches where challenge_id is not null;
  end if;
end $$;

-- Every signed-in device reads published dispatches; organizers also see scheduled ones.
drop policy if exists "at_dispatches read" on public.at_dispatches;
create policy "at_dispatches read" on public.at_dispatches
  for select to authenticated using ((select public.at_is_organizer()) or published_at <= now());

drop index if exists public.at_dispatches_challenge_idx;
alter table public.at_dispatches drop column if exists challenge_id;

-- 3. Challenge, profile and supplies functions -------------------------------------------------------
drop function if exists public.at_create_challenge(text, text, date);
drop function if exists public.at_join_challenge(text);
drop function if exists public.at_leave_challenge(uuid);
drop function if exists public.at_get_invite_code(uuid);
drop function if exists public.at_leaderboard(uuid, date);
drop function if exists public.at_challenge_summary(uuid);
drop function if exists public.at_camp_supplies(uuid);
drop function if exists public.at_ensure_profile();

-- 4. Stop writing a profile row for every anonymous sign-in --------------------------------------------
do $$
begin
  begin
    drop trigger if exists at_on_auth_user_created on auth.users;
  exception when insufficient_privilege then
    -- Not allowed to touch auth.users here: make the trigger a no-op instead, and keep the function.
    raise notice 'Could not drop at_on_auth_user_created; it is now a no-op. Drop it from the dashboard when convenient.';
  end;
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
              where p.proname = 'at_handle_new_user' and p.pronamespace = 'public'::regnamespace) then
    create or replace function public.at_handle_new_user()
    returns trigger language plpgsql security definer set search_path = '' as $f$ begin return new; end $f$;
    revoke all on function public.at_handle_new_user() from public, anon, authenticated;
  else
    drop function if exists public.at_handle_new_user();
  end if;
end $$;

-- 5. Tables -----------------------------------------------------------------------------------------
-- One statement: the challenge policies and foreign keys point at each other.
drop table if exists public.at_challenge_members, public.at_challenges;
drop table if exists public.at_profiles;
