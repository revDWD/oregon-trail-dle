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

select t.ok((select display_name from public.at_profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'Alice', 'sign-up trigger creates a profile');
select t.ok((select display_name from public.at_profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002') = 'Bob b', 'display names are sanitised by the trigger');
select t.ok((select display_name from public.at_profiles where id = 'cccccccc-0000-4000-8000-000000000003') = 'Hiker', 'default name does not come from the email address');

-- Static privilege checks -----------------------------------------------------------------------
select t.ok(not exists (
  select 1 from information_schema.role_table_grants
   where grantee in ('anon', 'public') and table_schema = 'public' and table_name like 'at\_%'), 'anon/public hold no table privileges');
select t.ok(not has_column_privilege('authenticated', 'public.at_challenges', 'invite_code', 'select'), 'invite_code is not selectable');
select t.ok(not has_column_privilege('authenticated', 'public.at_activities', 'credited_miles', 'insert'), 'credited_miles is not insertable');
select t.ok(not has_column_privilege('authenticated', 'public.at_activities', 'user_id', 'insert'), 'user_id is not insertable');
select t.ok(not has_column_privilege('authenticated', 'public.at_activities', 'user_id', 'update'), 'user_id is not updatable');
select t.ok(not has_table_privilege('authenticated', 'public.at_challenge_members', 'insert'), 'members cannot be inserted directly');
select t.ok(not has_table_privilege('authenticated', 'public.at_conversion_rules', 'insert'), 'rules are read-only for clients');
select t.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'at\_%' and c.relkind = 'r' and not c.relrowsecurity), 'RLS is enabled on every at_ table');
select t.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'at\_%' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')), 'every SECURITY DEFINER function pins search_path');
select t.ok(not has_function_privilege('anon', 'public.at_leaderboard(uuid, date)', 'execute') and not has_function_privilege('anon', 'public.at_my_summary(date)', 'execute'), 'anon cannot execute the leaderboard');

-- Anonymous visitors ------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', false) \gset
set role anon;
select t.fails('select * from public.at_activities', '42501', 'anon cannot read activities');
select t.fails('select * from public.at_profiles', '42501', 'anon cannot read profiles');
select t.fails('select * from public.at_challenges', '42501', 'anon cannot read challenges');
select t.fails($$insert into public.at_activities (activity_date, activity_type, actual_miles) values (current_date, 'walking', 1)$$, '42501', 'anon cannot insert');
select t.fails($$select public.at_leaderboard('aaaaaaaa-0000-4000-8000-000000000001')$$, '42501', 'anon cannot call the leaderboard');
select t.fails($$select public.at_create_challenge('x')$$, '42501', 'anon cannot create challenges');
select t.fails($$select * from public.at_my_summary()$$, '42501', 'anon cannot read summaries');
reset role;

-- A valid token whose user id is missing behaves like signed-out for RPCs ------------------------------
set role authenticated;
select t.fails($$select public.at_create_challenge('x')$$, '28000', 'RPCs require auth.uid()');
select t.fails($$select * from public.at_leaderboard('aaaaaaaa-0000-4000-8000-000000000001')$$, '28000', 'leaderboard requires auth.uid()');
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
select t.fails($$update public.at_profiles set display_name = '<script>' where id = auth.uid()$$, '23514', 'display names reject markup');
update public.at_profiles set weekly_goal_miles = 25 where id = auth.uid();

-- Alice creates a challenge (started 3 days ago, so the 10-day-old hike is outside the window)
select (public.at_create_challenge('Fellowship of the Trail', 'nobo', current_date - 3)) ->> 'invite_code' as code \gset
select t.ok(length(:'code') = 12, 'invite code issued to the owner');
select (public.at_create_challenge('Second', 'sobo')) ->> 'id' as second_id \gset
select t.ok(public.at_get_invite_code(:'second_id') is not null, 'owner can read the invite code');
select id as chal from public.at_challenges where name = 'Fellowship of the Trail' \gset
select t.fails($$select invite_code from public.at_challenges$$, '42501', 'invite_code column is not readable');
select t.fails($$insert into public.at_challenges (name, invite_code) values ('Direct', 'ABC')$$, '42501', 'no direct challenge inserts');
select t.fails($$insert into public.at_challenge_members (challenge_id, user_id, role) values (gen_random_uuid(), auth.uid(), 'owner')$$, '42501', 'no direct membership inserts');
select t.fails($$select public.at_create_challenge('<b>')$$, '22023', 'challenge names reject markup');
select t.fails($$select public.at_create_challenge('ok', 'east')$$, '22023', 'direction validated');
select t.fails($$select public.at_leave_challenge('$$ || :'chal' || $$')$$, '42501', 'owner cannot leave');
reset role;

-- Bob: outsider, then member -----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-4000-8000-000000000002', false) \gset
set role authenticated;

select t.ok(t.count('select 1 from public.at_activities') = 0, 'bob cannot read the activities of others');
select t.ok(t.count($$select 1 from public.at_profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$) = 0, 'bob cannot read the profile or goal of others');
select t.ok(t.rows($$update public.at_activities set notes = 'hacked' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$) = 0, 'bob cannot edit the activities of others');
select t.ok(t.rows($$delete from public.at_activities where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$) = 0, 'bob cannot delete the activities of others');
select t.ok(t.rows($$update public.at_profiles set display_name = 'Pwned' where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$) = 0, 'bob cannot edit the profile of others');
select t.fails($$insert into public.at_profiles (id, display_name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Dup')$$, '42501', 'bob cannot create a profile for another id');
select t.ok(t.count('select 1 from public.at_conversion_rules') = 5, 'rules are readable');
select t.ok(t.count('select 1 from public.at_challenges') = 0, 'non-members cannot see challenges');
select t.ok(t.rows($$delete from public.at_challenges$$) = 0, 'non-members cannot delete challenges');
select t.fails($$select * from public.at_leaderboard('$$ || :'chal' || $$')$$, '42501', 'non-members cannot read the leaderboard');
select t.fails($$select * from public.at_challenge_summary('$$ || :'chal' || $$')$$, '42501', 'non-members cannot read the summary');
select t.fails($$select public.at_get_invite_code('$$ || :'chal' || $$')$$, '42501', 'non-owners cannot read the invite code');
select t.fails($$select public.at_join_challenge('NOTACODE0000')$$, 'P0002', 'unknown invite codes are rejected');
select t.fails($$select public.at_join_challenge(null)$$, 'P0002', 'null invite code rejected');

-- Lower-case and dashes are tolerated when joining
select public.at_join_challenge(lower(substr(:'code', 1, 4) || '-' || substr(:'code', 5, 4) || '-' || substr(:'code', 9))) as joined \gset
select t.ok(:'joined' = :'chal', 'bob joins with a formatted code');
select t.ok(t.count('select 1 from public.at_challenges') = 1, 'members can see the challenge');
select t.ok(t.count('select 1 from public.at_challenge_members') = 1, 'members only see their own membership row');
select t.fails($$select public.at_get_invite_code('$$ || :'chal' || $$')$$, '42501', 'members still cannot read the invite code');
select t.ok(t.rows($$delete from public.at_challenges$$) = 0, 'members cannot delete the challenge');
select t.fails($$update public.at_challenge_members set role = 'owner'$$, '42501', 'members cannot promote themselves');

insert into public.at_activities (activity_date, activity_type, actual_miles, notes) values (current_date, 'running', 2, 'bob run');
insert into public.at_activities (activity_date, activity_type, actual_miles, notes) values (current_date - 2, 'other', 4, 'bob yoga walk');

-- Leaderboard: aggregates only, window respected, ordering stable
select t.ok(t.count($$select 1 from public.at_leaderboard('$$ || :'chal' || $$')$$) = 2, 'leaderboard lists both members');
select t.ok((select total_credited_miles from public.at_leaderboard(:'chal') where display_name = 'Alice') = 8, 'alice total = 3 + 5 (old hike excluded by challenge window)');
select t.ok((select total_credited_miles from public.at_leaderboard(:'chal') where display_name = 'Bob b') = 4, 'bob total = 2 + 2');
select t.ok((select activity_count from public.at_leaderboard(:'chal') where display_name = 'Alice') = 2, 'activity counts');
select t.ok((select display_name from public.at_leaderboard(:'chal') limit 1) = 'Alice', 'ordered by miles desc');
select t.ok((select week_credited_miles from public.at_leaderboard(:'chal') where display_name = 'Alice') <= 8, 'weekly miles never exceed totals');
select t.ok(not exists (select 1 from public.at_leaderboard(:'chal') l where to_jsonb(l) ?| array['notes', 'activity_type', 'weekly_goal_miles', 'actual_miles', 'email']), 'leaderboard exposes no private fields');
select t.ok((select total_credited_miles from public.at_challenge_summary(:'chal')) = 12, 'group total = 12');
select t.ok((select member_count from public.at_challenge_summary(:'chal')) = 2, 'group member count');
select t.ok(t.count('select 1 from public.at_activities') = 2, 'bob still sees only his own activities');
select t.ok((select total_credited_miles from public.at_my_summary()) = 4, 'bob summary excludes other users');

-- Bob leaves: access ends, activities remain his
select public.at_leave_challenge(:'chal');
select t.fails($$select * from public.at_leaderboard('$$ || :'chal' || $$')$$, '42501', 'after leaving, no leaderboard access');
select t.ok(t.count('select 1 from public.at_activities') = 2, 'leaving does not delete activities');
select t.ok(t.rows($$delete from public.at_activities where notes = 'bob run'$$) = 1, 'bob can delete his own activity');
reset role;

-- Carol (no activities, never a member) -------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'cccccccc-0000-4000-8000-000000000003', false) \gset
set role authenticated;
select t.fails($$select * from public.at_leaderboard('$$ || :'chal' || $$')$$, '42501', 'outsiders cannot read the leaderboard');
select public.at_ensure_profile();
select t.ok(t.count('select 1 from public.at_activities') = 0, 'carol sees nothing');
reset role;

-- Owner deleting a challenge removes memberships but not activities --------------------------------------------
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-4000-8000-000000000001', false) \gset
set role authenticated;
select t.ok(t.rows($$delete from public.at_challenges where id = '$$ || :'chal' || $$'$$) = 1, 'owner can delete the challenge');
select t.ok(t.count('select 1 from public.at_activities') = 3, 'activities survive challenge deletion');
reset role;

\o
\echo RLS TESTS PASSED
