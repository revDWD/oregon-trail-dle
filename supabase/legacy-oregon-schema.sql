-- Oregon Trail DLE: community progress schema. Run once in the Supabase SQL editor (safe to re-run).

-- 1. Tables ---------------------------------------------------------------------------------

-- Single-row running total (id is pinned to 1). Maintained atomically with each log insert.
create table if not exists public.community_progress (
  id                   smallint primary key default 1 check (id = 1),
  total_miles          numeric(12, 2) not null default 0 check (total_miles >= 0),
  total_contributions  bigint         not null default 0 check (total_contributions >= 0),
  created_at           timestamptz    not null default now(),
  updated_at           timestamptz    not null default now()
);
insert into public.community_progress (id) values (1) on conflict (id) do nothing;

-- Append-only audit log: one row per contribution.
create table if not exists public.mileage_log (
  id             bigint generated always as identity primary key,
  miles_added    numeric(7, 2) not null check (miles_added >= 0.1 and miles_added <= 1000),
  "timestamp"    timestamptz   not null default now(),
  source         text          not null check (char_length(source) between 1 and 64),
  submission_id  uuid          not null unique  -- idempotency key: blocks duplicate submissions
);
create index if not exists mileage_log_source_time_idx on public.mileage_log (source, "timestamp" desc);
create index if not exists mileage_log_time_idx on public.mileage_log ("timestamp" desc);

-- 2. Row level security: the public (anon) key may only READ; all writes go through the RPC ---

alter table public.community_progress enable row level security;
alter table public.mileage_log        enable row level security;

drop policy if exists "public read community_progress" on public.community_progress;
create policy "public read community_progress" on public.community_progress
  for select to anon, authenticated using (true);

drop policy if exists "public read mileage_log" on public.mileage_log;
create policy "public read mileage_log" on public.mileage_log
  for select to anon, authenticated using (true);

-- No insert/update/delete policies exist, so direct writes are rejected. Also revoke the grants.
revoke all on public.community_progress from anon, authenticated;
revoke all on public.mileage_log        from anon, authenticated;
grant select on public.community_progress to anon, authenticated;
-- Column-level grant keeps the per-device `source` label private.
grant select (id, miles_added, "timestamp") on public.mileage_log to anon, authenticated;

-- 3. The only write path --------------------------------------------------------------------

create or replace function public.add_community_miles(p_miles numeric, p_source text, p_submission_id uuid)
returns public.community_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.community_progress;
  miles  numeric(7, 2);
begin
  if p_miles is null or p_miles < 0.1 or p_miles > 1000 then
    raise exception 'Miles must be between 0.1 and 1000' using errcode = '22023';
  end if;
  miles := round(p_miles, 2);
  if p_source is null or char_length(p_source) not between 1 and 64 or p_submission_id is null then
    raise exception 'Invalid submission' using errcode = '22023';
  end if;

  -- Serialize writers on the single total row; this also makes the rate checks race-free.
  perform 1 from public.community_progress where id = 1 for update;

  -- Duplicate (retry / double click): report current totals without counting it again.
  if exists (select 1 from public.mileage_log where submission_id = p_submission_id) then
    select * into result from public.community_progress where id = 1;
    return result;
  end if;

  -- Basic abuse limits: per device, and community-wide.
  if (select count(*) from public.mileage_log
        where source = p_source and "timestamp" > now() - interval '1 minute') >= 10 then
    raise exception 'Too many submissions from this device; wait a minute' using errcode = 'P0001';
  end if;
  if (select count(*) from public.mileage_log where "timestamp" > now() - interval '1 minute') >= 120 then
    raise exception 'The trail is busy; try again shortly' using errcode = 'P0001';
  end if;

  insert into public.mileage_log (miles_added, source, submission_id) values (miles, p_source, p_submission_id);

  update public.community_progress
     set total_miles = total_miles + miles,
         total_contributions = total_contributions + 1,
         updated_at = now()
   where id = 1
   returning * into result;

  return result;
end;
$$;

revoke all on function public.add_community_miles(numeric, text, uuid) from public;
grant execute on function public.add_community_miles(numeric, text, uuid) to anon, authenticated;

-- 4. Realtime: broadcast changes of the total row to subscribed browsers ---------------------

do $$
begin
  alter publication supabase_realtime add table public.community_progress;
exception when duplicate_object then null;
end $$;

-- 5. Reconciliation (run manually if you ever doubt the total; the log is the audit trail) ---
-- update public.community_progress set
--   total_miles = (select coalesce(sum(miles_added), 0) from public.mileage_log),
--   total_contributions = (select count(*) from public.mileage_log),
--   updated_at = now() where id = 1;

-- 6. Phase 3: contributor names and community food ---------------------------------------------
-- Idempotent additions on top of the original schema. Names are public by design (sanitized and
-- capped at 24 chars); `source` (the anonymous device id) is still never readable by anon.
-- Food from hunts is a contribution row with miles_added = 0 and kind = 'hunt'.

alter table public.community_progress add column if not exists total_food numeric not null default 0;
alter table public.mileage_log add column if not exists contributor_name text not null default 'Traveler';
alter table public.mileage_log add column if not exists food_added numeric not null default 0;
alter table public.mileage_log add column if not exists kind text not null default 'miles';
alter table public.mileage_log drop constraint if exists mileage_log_miles_added_check;
alter table public.mileage_log drop constraint if exists mileage_log_miles_range;
alter table public.mileage_log add constraint mileage_log_miles_range check (miles_added >= 0 and miles_added <= 1000);
alter table public.mileage_log drop constraint if exists mileage_log_food_check;
alter table public.mileage_log add constraint mileage_log_food_check check (food_added >= 0 and food_added <= 500);
alter table public.mileage_log drop constraint if exists mileage_log_name_check;
alter table public.mileage_log add constraint mileage_log_name_check check (char_length(contributor_name) between 1 and 24);

grant select (contributor_name, food_added, kind) on public.mileage_log to anon, authenticated;

create or replace function public.add_community_contribution(
  p_name text, p_miles numeric, p_food numeric, p_source text, p_submission_id uuid
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(btrim(regexp_replace(coalesce(p_name,''), '[^A-Za-z0-9 ''.\-]', '', 'g')), 24);
  v_miles numeric := coalesce(p_miles,0);
  v_food numeric := coalesce(p_food,0);
  v_existing public.mileage_log%rowtype;
  v_total public.community_progress%rowtype;
begin
  if v_name = '' then v_name := 'Traveler'; end if;
  if v_miles < 0 or v_miles > 1000 or v_food < 0 or v_food > 500 or (v_miles = 0 and v_food = 0)
     or (v_miles > 0 and v_miles < 0.1) then
    raise exception 'Invalid contribution';
  end if;
  if p_submission_id is null then raise exception 'Missing submission id'; end if;
  select * into v_existing from public.mileage_log where submission_id = p_submission_id;
  if found then
    select * into v_total from public.community_progress where id = 1;
    return json_build_object('total_miles', v_total.total_miles, 'total_food', v_total.total_food,
      'total_contributions', v_total.total_contributions, 'duplicate', true);
  end if;
  if (select count(*) from public.mileage_log where source = left(coalesce(p_source,'web'),64)
        and "timestamp" > now() - interval '1 minute') >= 10 then
    raise exception 'Too many contributions from this device. Try again soon.';
  end if;
  if (select count(*) from public.mileage_log where "timestamp" > now() - interval '1 minute') >= 120 then
    raise exception 'The trail is busy. Try again soon.';
  end if;
  select * into v_total from public.community_progress where id = 1 for update;
  insert into public.mileage_log (miles_added, source, submission_id, contributor_name, food_added, kind)
    values (v_miles, left(coalesce(p_source,'web'),64), p_submission_id, v_name, v_food,
            case when v_food > 0 and v_miles = 0 then 'hunt' else 'miles' end);
  update public.community_progress
    set total_miles = total_miles + v_miles, total_food = total_food + v_food,
        total_contributions = total_contributions + 1, updated_at = now()
    where id = 1 returning * into v_total;
  return json_build_object('total_miles', v_total.total_miles, 'total_food', v_total.total_food,
    'total_contributions', v_total.total_contributions, 'duplicate', false);
end $$;

revoke all on function public.add_community_contribution(text, numeric, numeric, text, uuid) from public;
grant execute on function public.add_community_contribution(text, numeric, numeric, text, uuid) to anon, authenticated;
