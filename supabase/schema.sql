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
