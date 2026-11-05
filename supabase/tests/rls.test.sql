-- Row Level Security and privilege tests. Run by supabase/tests/run-rls-tests.sh against a throwaway
-- Postgres cluster after supabase-shim.sql and the migration. Any failed assertion aborts the run.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema t;
grant usage on schema t to anon, authenticated;

create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'ASSERT FAILED: %', p_msg; end if;
end $$;

-- Expect p_sql to fail with one of the comma-separated SQLSTATEs.
create function t.fails(p_sql text, p_states text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any (string_to_array(p_states, ',')) then return; end if;
    raise exception 'ASSERT FAILED: % (expected %, got % %)', p_msg, p_states, sqlstate, sqlerrm;
  end;
  raise exception 'ASSERT FAILED: % (statement succeeded)', p_msg;
end $$;

create function t.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

create function t.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return n;
end $$;

grant execute on all functions in schema t to anon, authenticated;

-- Fixtures (as the table owner) -----------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'alice@example.test', '{"display_name": "Alice"}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bob@example.test', '{"display_name": "Bob <b>"}'),
  ('cccccccc-0000-4000-8000-000000000003', 'carol@example.test', '{}');
-- Anonymous sign-ins (the app has no login screen) create auth users with no email or metadata.
insert into auth.users (id, email) values ('dddddddd-0000-4000-8000-000000000004', null);

-- Schema cleanup (20261108000000_at_cleanup.sql) -------------------------------------------------
select t.ok(to_regclass('public.at_profiles') is null and to_regclass('public.at_challenges') is null
        and to_regclass('public.at_challenge_members') is null, 'profile and challenge tables are gone');
select t.ok(not exists (select 1 from pg_trigger where tgname = 'at_on_auth_user_created'), 'sign-ins no longer write a profile row');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('at_create_challenge', 'at_join_challenge', 'at_leave_challenge',
     'at_get_invite_code', 'at_leaderboard', 'at_challenge_summary', 'at_camp_supplies', 'at_ensure_profile',
     'at_handle_new_user', 'add_community_miles', 'add_community_contribution')), 'dead and legacy functions are gone');
select t.ok(not exists (select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'at_dispatches' and column_name = 'challenge_id'), 'dispatches have no crew column');
select t.ok(to_regclass('public.community_progress') is null and to_regclass('public.mileage_log') is null, 'legacy tables left public');
select t.ok(to_regclass('archive.community_progress') is not null and to_regclass('archive.mileage_log') is not null, 'legacy data is archived, not lost');
select t.ok((select count(*) from archive.community_progress) = 1, 'archived rows survive');
select t.ok(not exists (select 1 from pg_publication_tables where schemaname = 'archive'), 'archived tables no longer broadcast over Realtime');
select t.ok(not has_schema_privilege('anon', 'archive', 'usage') and not has_schema_privilege('authenticated', 'archive', 'usage'), 'the archive is private');
select t.ok(not exists (select 1 from information_schema.role_table_grants
   where table_schema = 'archive' and grantee in ('anon', 'authenticated', 'PUBLIC')), 'no API role holds archive table grants');
select t.ok(not exists (select 1 from pg_tables where schemaname = 'public' and tablename not like 'at\_%'), 'every public table belongs to the AT app');

-- Static privilege checks -----------------------------------------------------------------------
select t.ok(not exists (
  select 1 from information_schema.role_table_grants
   where grantee in ('anon', 'public') and table_schema = 'public' and table_name like 'at\_%'), 'anon/public hold no table privileges');
select t.ok(not has_column_privilege('authenticated', 'public.at_activities', 'credited_miles', 'insert'), 'credited_miles is not insertable');
select t.ok(not has_column_privilege('authenticated', 'public.at_activities', 'user_id', 'insert'), 'user_id is not insertable');
select t.ok(not has_column_privilege('authenticated', 'public.at_activities', 'user_id', 'update'), 'user_id is not updatable');
select t.ok(not has_table_privilege('authenticated', 'public.at_conversion_rules', 'insert'), 'rules are read-only for clients');
select t.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'at\_%' and c.relkind = 'r' and not c.relrowsecurity), 'RLS is enabled on every at_ table');
select t.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'at\_%' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')), 'every SECURITY DEFINER function pins search_path');
select t.ok(not has_function_privilege('anon', 'public.at_my_summary(date)', 'execute'), 'anon cannot execute summaries');

-- Anonymous visitors ------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', false) \gset
set role anon;
select t.fails('select * from public.at_activities', '42501', 'anon cannot read activities');
select t.fails('select * from archive.mileage_log', '42501', 'anon cannot read the archive');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles) values (current_date, 'walking', 1)$$, '42501', 'anon cannot insert');
select t.fails($$select * from public.at_my_summary()$$, '42501', 'anon cannot read summaries');
reset role;

-- A valid token whose user id is missing behaves like signed-out for RPCs ------------------------------
set role authenticated;
select t.fails($$select * from public.at_expedition_hikers()$$, '28000', 'RPCs require auth.uid()');
select t.fails('select * from archive.community_progress', '42501', 'signed-in devices cannot read the archive either');
select t.ok(t.count('select 1 from public.at_activities') = 0, 'no uid means no rows');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles) values (current_date, 'walking', 1)$$, '23502,42501', 'cannot insert without an owner');
reset role;

-- Alice logs activity ------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false) \gset
set role authenticated;

insert into public.at_activities (activity_date, activity_type, actual_miles, duration_minutes, notes)
  values (current_date, 'walking', 3, 50, 'alice walk');
insert into public.at_activities (activity_date, activity_type, actual_miles, notes)
  values (current_date, 'cycling', 20, 'alice ride');
insert into public.at_activities (activity_date, activity_type, actual_miles, notes)
  values (current_date - 10, 'hiking', 4, 'alice old hike');

select t.ok((select user_id from public.at_activities where notes = 'alice walk') = auth.uid(), 'user_id defaults to the caller');
select t.ok((select credited_miles from public.at_activities where notes = 'alice walk') = 3, 'walking credits 1:1');
select t.ok((select conversion_factor from public.at_activities where notes = 'alice ride') = 0.25, 'cycling factor stored');
select t.ok((select credited_miles from public.at_activities where notes = 'alice ride') = 5, 'cycling credited miles computed by the server');
select t.ok((select actual_miles from public.at_activities where notes = 'alice ride') = 20, 'actual distance is preserved');

select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles, credited_miles) values (current_date, 'walking', 1, 999)$$, '42501', 'cannot forge credited_miles');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles, conversion_factor) values (current_date, 'walking', 1, 1)$$, '42501', 'cannot forge conversion_factor');
select t.fails($$insert into public.at_activities (user_id, activity_date, activity_type, actual_miles) values ('bbbbbbbb-0000-4000-8000-000000000002', current_date, 'walking', 1)$$, '42501', 'cannot create activities for another user');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles) values (current_date, 'running', 51)$$, '22003', 'per-activity cap');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles) values (current_date + 5, 'walking', 1)$$, '22008', 'future date');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles) values (current_date - 100, 'walking', 1)$$, '22008', 'too old');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles) values (current_date, 'walking', 0.05)$$, '23514', 'minimum distance');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles) values (current_date, 'swimming', 1)$$, '22023,23514', 'unknown type');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles, notes) values (current_date, 'walking', 1, repeat('x', 241))$$, '23514', 'notes length');

insert into public.at_activities (client_id, activity_date, activity_type, actual_miles)
  values ('dddddddd-0000-4000-8000-000000000001', current_date, 'walking', 1);
select t.fails($$insert into public.at_activities (client_id, activity_date, activity_type, actual_miles) values ('dddddddd-0000-4000-8000-000000000001', current_date, 'walking', 1)$$, '23505', 'client_id is idempotent per user');
select t.ok(t.rows($$delete from public.at_activities where client_id = 'dddddddd-0000-4000-8000-000000000001'$$) = 1, 'owner can delete own activity');

-- Editing: notes keep the stored conversion, distance recomputes, ownership is immutable
update public.at_activities set notes = 'alice ride (windy)' where notes = 'alice ride';
select t.ok((select credited_miles from public.at_activities where notes = 'alice ride (windy)') = 5, 'notes edit keeps credited miles');
update public.at_activities set actual_miles = 24 where notes = 'alice ride (windy)';
select t.ok((select credited_miles from public.at_activities where notes = 'alice ride (windy)') = 6, 'distance edit recomputes credited miles');
update public.at_activities set actual_miles = 20, notes = 'alice ride' where notes = 'alice ride (windy)';
select t.fails($$update public.at_activities set credited_miles = 500 where notes = 'alice ride'$$, '42501', 'cannot edit credited_miles');
select t.fails($$update public.at_activities set user_id = 'bbbbbbbb-0000-4000-8000-000000000002' where notes = 'alice ride'$$, '42501', 'cannot hand an activity to another user');
select t.fails($$update public.at_activities set actual_miles = 500 where notes = 'alice ride'$$, '22003', 'caps apply to edits');

-- Rule versioning: a new rule must not rewrite history
reset role;
insert into public.at_conversion_rules (activity_type, factor, max_actual_miles, effective_from)
  values ('cycling', 0.5, 150, current_date - 1);
set role authenticated;
update public.at_activities set notes = 'alice ride edited' where notes = 'alice ride';
select t.ok((select credited_miles from public.at_activities where notes = 'alice ride edited') = 5, 'old activities keep their stored factor after a rule change');
insert into public.at_activities (activity_date, activity_type, actual_miles, notes) values (current_date, 'cycling', 20, 'alice new ride');
select t.ok((select credited_miles from public.at_activities where notes = 'alice new ride') = 10, 'new activities use the new rule');
select t.ok(t.rows($$delete from public.at_activities where notes = 'alice new ride'$$) = 1, 'cleanup');
reset role;
delete from public.at_conversion_rules where effective_from = current_date - 1;
set role authenticated;

select t.ok(t.count('select 1 from public.at_activities') = 3, 'alice sees her own three activities');
select t.ok((select total_credited_miles from public.at_my_summary()) = 12, 'summary totals own credited miles (3 + 5 + 4)');
select t.ok((select activity_count from public.at_my_summary()) = 3, 'summary counts own activities');
select t.ok(cardinality((select active_dates from public.at_my_summary())) = 2, 'summary lists distinct recent active dates');
select t.ok((select week_credited_miles from public.at_my_summary(current_date - 30)) = 12, 'week start is caller supplied');
reset role;

-- Bob: another device ------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false) \gset
set role authenticated;

select t.ok(t.count('select 1 from public.at_activities') = 0, 'bob cannot read the activities of others');
select t.ok(t.rows($$update public.at_activities set notes = 'hacked' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$) = 0, 'bob cannot edit the activities of others');
select t.ok(t.rows($$delete from public.at_activities where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$) = 0, 'bob cannot delete the activities of others');
select t.ok(t.count('select 1 from public.at_conversion_rules') = 5, 'rules are readable');

insert into public.at_activities (activity_date, activity_type, actual_miles, notes) values (current_date, 'running', 2, 'bob run');
insert into public.at_activities (activity_date, activity_type, actual_miles, notes) values (current_date - 2, 'other', 4, 'bob yoga walk');
select t.ok(t.count('select 1 from public.at_activities') = 2, 'bob still sees only his own activities');
select t.ok((select total_credited_miles from public.at_my_summary()) = 4, 'bob summary excludes other users (2 + 2)');
select t.ok(t.rows($$delete from public.at_activities where notes = 'bob run'$$) = 1, 'bob can delete his own activity');
reset role;

-- Carol (no activities yet) -----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false) \gset
set role authenticated;
select t.ok(t.count('select 1 from public.at_activities') = 0, 'carol sees nothing');
reset role;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false) \gset
set role authenticated;
select t.ok(t.count('select 1 from public.at_activities') = 3, 'alice''s activities are untouched by other devices');
reset role;


-- Camp + Trail Dispatches (20261103000000_at_camp_dispatches.sql) ----------------------------------------------
select t.ok(not exists (
  select 1 from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'at_organizers' and grantee in ('anon', 'authenticated')
), 'nobody can read or write the organizer list through the API');
select t.ok(not exists (
  select 1 from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('at_dispatches', 'at_expedition_runs') and grantee = 'anon'
), 'anon has no access to dispatches or expedition runs');
select t.ok(not exists (
  select 1 from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'at_dispatches' and grantee = 'authenticated'
     and column_name = 'created_by' and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
), 'the author user id of a dispatch is never exposed or client-settable');
select t.ok(not has_function_privilege('anon', 'public.at_is_organizer()', 'execute'), 'anon cannot call at_is_organizer');

-- Alice is the organizer (added from the dashboard, i.e. as the table owner).
insert into public.at_organizers (user_id, note) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Kevin');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false) \gset
set role authenticated;
select t.ok(public.at_is_organizer(), 'alice is an organizer');
select t.fails($$insert into public.at_organizers (user_id) values ('bbbbbbbb-0000-4000-8000-000000000002')$$, '42501', 'even organizers cannot add organizers from the app');
select t.ok(t.rows($$insert into public.at_dispatches (title, body, author_name, pinned) values ('Welcome, hikers!', 'First **dispatch**.', 'Kevin', true)$$) = 1, 'organizer can post a dispatch');
select t.fails($$insert into public.at_dispatches (title, body, challenge_id) values ('Crew only', 'Secret plans', gen_random_uuid())$$, '42703', 'there are no crew-only dispatches any more');
select t.ok(t.rows($$insert into public.at_dispatches (title, body, published_at) values ('Tomorrow', 'Scheduled', now() + interval '1 day')$$) = 1, 'organizer can schedule a dispatch');
select t.ok(t.count('select 1 from public.at_dispatches') = 2, 'organizer sees scheduled dispatches too');
select t.fails($$select created_by from public.at_dispatches$$, '42501', 'created_by is not readable by API roles');
reset role;
select t.ok((select created_by from public.at_dispatches where title = 'Welcome, hikers!') = 'aaaaaaaa-0000-4000-8000-000000000001', 'created_by is forced to the poster');

-- Bob: ordinary hiker
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false) \gset
set role authenticated;
select t.ok(not public.at_is_organizer(), 'bob is not an organizer');
select t.ok(t.count('select 1 from public.at_dispatches') = 1, 'hikers see only published dispatches');
select t.fails($$insert into public.at_dispatches (title, body) values ('Hacked', 'nope')$$, '42501', 'hikers cannot post dispatches');
select t.ok(t.rows($$update public.at_dispatches set title = 'Hacked'$$) = 0, 'hikers cannot edit dispatches');
select t.ok(t.rows($$delete from public.at_dispatches$$) = 0, 'hikers cannot delete dispatches');
select t.fails($$update public.at_dispatches set created_by = null$$, '42501', 'created_by is not updatable');
reset role;
select t.ok((select count(*) from public.at_dispatches where title = 'Hacked') = 0, 'no dispatch was modified');

-- Expedition runs: private rows, no trail miles
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false) \gset
set role authenticated;
select (select total_credited_miles from public.at_my_summary()) as bob_miles_before \gset
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 120, 3, 6)$$) = 1, 'bob records a hunt');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('wildlife', 40, 4, 5)$$) = 1, 'bob records a wildlife walk');
select t.ok((select total_credited_miles from public.at_my_summary()) = :'bob_miles_before', 'expeditions never add trail miles');
select t.fails($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 5000, 1, 1)$$, '23514', 'scores are capped');
select t.fails($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 10, 5, 1)$$, '23514', 'hits cannot exceed shots');
select t.fails($$insert into public.at_expedition_runs (user_id, theme, score) values ('aaaaaaaa-0000-4000-8000-000000000001', 'hunt', 10)$$, '42501', 'user_id cannot be set by the client');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$) = 1, 'run 3');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$) = 1, 'run 4');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$) = 1, 'run 5');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$) = 1, 'run 6');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$) = 1, 'run 7');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$) = 1, 'run 8');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$) = 1, 'run 9');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$) = 1, 'run 10');
select t.fails($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 1, 1, 1)$$, '54000', 'daily expedition cap');
select t.fails($$update public.at_expedition_runs set score = 400$$, '42501', 'runs cannot be edited');
reset role;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false) \gset
set role authenticated;
select t.ok(t.count('select 1 from public.at_expedition_runs') = 0, 'other hikers runs are private');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots) values ('hunt', 30, 1, 2)$$) = 1, 'alice records a hunt');
select t.ok(t.rows($$update public.at_dispatches set pinned = false where title = 'Welcome, hikers!'$$) = 1, 'organizer can edit');
select t.ok(t.rows($$delete from public.at_dispatches where title = 'Tomorrow'$$) = 1, 'organizer can delete');
reset role;

-- Expedition roster (20261104000000_at_hikers.sql) ------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
select t.ok(not exists (
  select 1 from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'at_hikers' and grantee in ('anon', 'authenticated')
), 'the roster is not readable or writable through the API');
select t.ok(to_regclass('public.at_expedition_settings') is null and to_regclass('public.at_expedition_members') is null, 'no invite code or membership tables');
select t.ok(to_regprocedure('public.at_join_expedition(text)') is null and to_regprocedure('public.at_expedition_invite_code()') is null, 'no join or invite functions');
select t.ok(not has_function_privilege('anon', 'public.at_expedition_hikers(date)', 'execute'), 'anon cannot read hiker totals');
select t.ok(not has_function_privilege('anon', 'public.at_expedition_marks(numeric[], numeric[])', 'execute'), 'anon cannot read marks');
select t.ok(not has_function_privilege('authenticated', 'public.at_check_hiker()', 'execute'), 'the trigger function is not callable');
select t.ok((select string_agg(name, ',' order by sort_order) from public.at_hikers) = 'Alden,Amanda,Andrew,David,Elizabeth,Kayla,Kevin,Kelsey,Matthew,Shuva,Will', 'the full roster is seeded, in order');
select id as david from public.at_hikers where name = 'David' \gset
select id as kevin from public.at_hikers where name = 'Kevin' \gset
insert into public.at_hikers (name, sort_order, active) values ('Retired', 9, false);
select id as retired from public.at_hikers where name = 'Retired' \gset

-- Carol: a brand-new device. No joining: she can log for a hiker straight away.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false) \gset
set role authenticated;
select t.ok(public.at_is_expedition_member(), 'every signed-in device takes part');
select t.fails('select * from public.at_hikers', '42501', 'roster table is not directly readable');
select t.ok(t.count('select 1 from public.at_expedition_hikers()') = 11, 'a new device reads the roster totals (all eleven hikers)');
insert into public.at_activities (activity_date, activity_type, actual_miles, notes, hiker_id) values (current_date, 'walking', 5, 'carol for david', :'david');
insert into public.at_activities (activity_date, activity_type, actual_miles, notes, hiker_id) values (current_date - 1, 'hiking', 3, 'carol for kevin', :'kevin');
insert into public.at_activities (activity_date, activity_type, actual_miles, notes) values (current_date, 'walking', 50, 'carol no hiker');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles, hiker_id) values (current_date, 'walking', 1, '$$ || :'retired' || $$')$$, '23503', 'retired hikers cannot get new miles');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles, hiker_id) values (current_date, 'walking', 1, gen_random_uuid())$$, '23503', 'unknown hikers are rejected');
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots, hiker_id) values ('wildlife', 24, 2, 3, '$$ || :'david' || $$')$$) = 1, 'members pin photos for a hiker');
reset role;

-- Bob logs for Kevin; he cannot touch Carol's rows
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false) \gset
set role authenticated;
insert into public.at_activities (activity_date, activity_type, actual_miles, notes, hiker_id) values (current_date, 'running', 10, 'bob for kevin', :'kevin');
select t.ok(t.rows($$update public.at_activities set hiker_id = '$$ || :'kevin' || $$' where notes = 'carol for david'$$) = 0, 'cannot reassign another device''s activity');
select t.ok(t.rows($$update public.at_activities set actual_miles = 40 where notes = 'carol for david'$$) = 0, 'cannot edit another device''s activity');
select t.ok(t.rows($$delete from public.at_activities where notes = 'carol for david'$$) = 0, 'cannot delete another device''s activity');
select t.ok(t.count('select 1 from public.at_activities where hiker_id is not null') = 1, 'devices still only see their own activity rows');

select t.ok((select total_credited_miles from public.at_expedition_hikers() where name = 'David') = 5, 'david total from carol''s device');
select t.ok((select total_credited_miles from public.at_expedition_hikers() where name = 'Kevin') = 13, 'kevin total from two devices');
select t.ok((select activity_count from public.at_expedition_hikers() where name = 'Kevin') = 2, 'kevin activity count');
select t.ok((select wildlife_score from public.at_expedition_hikers() where name = 'David') = 24, 'david photo points');
select t.ok((select first_spotted_on from public.at_expedition_hikers() where name = 'David') = current_date, 'first wildlife discovery date');
select t.ok((select sum(total_credited_miles) from public.at_expedition_hikers()) = 18, 'activities without a hiker never count for the expedition');
select t.ok(not exists (select 1 from public.at_expedition_hikers() where name = 'Retired'), 'retired hikers with no history are hidden');
select t.ok(not exists (select 1 from public.at_expedition_hikers() h where to_jsonb(h) ?| array['user_id', 'notes', 'activity_type']), 'hiker totals are aggregates only');
select t.ok((select hiker_id from public.at_expedition_marks('{4,6,100}', '{}') where mark = 4) = :'david', 'david''s miles carried the expedition past 4');
select t.ok((select hiker_id from public.at_expedition_marks('{4,6,100}', '{}') where mark = 6) = :'kevin', 'kevin''s miles carried it past 6');
select t.ok(not exists (select 1 from public.at_expedition_marks('{4,6,100}', '{}') where mark = 100), 'unreached marks are not returned');
select t.ok((select count(*) from public.at_expedition_marks('{}', '{5,10}') where kind = 'personal') = 3, 'personal marks: david 5, kevin 5 and 10');
select t.fails($$select * from public.at_expedition_marks(array_fill(1::numeric, array[101]), '{}')$$, '54000', 'mark lists are capped');
reset role;

-- Signed-out requests get nothing; an admin (SQL editor) can assign a hiker to old rows
set role anon;
select t.fails('select * from public.at_expedition_hikers()', '42501', 'signed-out requests cannot read totals');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles, hiker_id) values (current_date, 'walking', 1, '$$ || :'david' || $$')$$, '42501', 'signed-out requests cannot log miles');
reset role;
select set_config('request.jwt.claim.sub', '', false) \gset
update public.at_activities set hiker_id = :'david' where notes = 'carol no hiker';
select t.ok((select hiker_id from public.at_activities where notes = 'carol no hiker') = :'david', 'admins can back-fill a hiker on old rows');

-- A device can choose the hiker for its own activity from long ago (the History "Edit" flow)
insert into public.at_activities (user_id, activity_date, activity_type, actual_miles, notes) values ('cccccccc-0000-4000-8000-000000000003', current_date, 'walking', 2, 'carol long ago');
set session_replication_role = replica; -- test setup only: age the row past the 60-day logging window
update public.at_activities set activity_date = current_date - 120 where notes = 'carol long ago';
set session_replication_role = origin;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false) \gset
set role authenticated;
select t.ok(t.rows($$update public.at_activities set hiker_id = '$$ || :'kevin' || $$', notes = 'carol long ago' where notes = 'carol long ago'$$) = 1, 'a device can assign a hiker to its own old activity');
select t.ok((select credited_miles from public.at_activities where notes = 'carol long ago') = 2, 'assigning a hiker keeps the stored credit');
select t.fails($$update public.at_activities set activity_date = current_date - 119 where notes = 'carol long ago'$$, '22008', 'moving it to another old date is still refused');
reset role;

-- Wildlife field guide ----------------------------------------------------------------------------
select t.ok(not has_function_privilege('anon', 'public.at_field_guide()', 'execute'), 'anon cannot read the field guide');
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false) \gset
set role authenticated;
select t.ok(t.rows($$insert into public.at_expedition_runs (theme, score, hits, shots, hiker_id, species, habitat) values ('wildlife', 60, 3, 4, '$$ || :'kevin' || $$', '{deer,turkey,deer}', 'blue-ridge')$$) = 1, 'runs record species and habitat');
select t.ok((select species from public.at_expedition_runs where habitat = 'blue-ridge') = '{deer,turkey}'::text[], 'species count once per outing');
select t.fails($$insert into public.at_expedition_runs (theme, score, hits, shots, species) values ('wildlife', 5, 1, 1, '{"Bad Id"}')$$, '23514', 'species ids are validated');
select t.fails($$insert into public.at_expedition_runs (theme, score, hits, shots, species) values ('wildlife', 5, 1, 1, '{deer,fox}')$$, '23514', 'no more species than photos');
select t.fails($$insert into public.at_expedition_runs (theme, score, hits, shots, species, habitat) values ('wildlife', 5, 1, 1, '{deer}', 'Robert''); drop')$$, '23514', 'habitats are validated');
select t.ok((select sightings from public.at_field_guide() where species = 'deer' and hiker_id = :'kevin') = 1, 'the field guide aggregates sightings per hiker');
select t.ok((select first_seen from public.at_field_guide() where species = 'turkey') = current_date, 'first sighting date');
reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false) \gset
set role authenticated;
select t.ok(t.count('select 1 from public.at_field_guide()') = 2, 'another device sees the shared field guide');
select t.ok(t.count($$select 1 from public.at_expedition_runs where habitat = 'blue-ridge'$$) = 0, 'but not the runs themselves');
reset role;

\o
\echo RLS TESTS PASSED
