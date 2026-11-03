-- Camp + Trail Dispatches.
--   * Trail Dispatches: organizer announcements ("Message from Camp") on the home page and in Camp.
--   * Expedition runs: results of the camp minigame (hunt / wildlife spotting). They stock the crew's
--     camp pantry and photo board. They NEVER add trail miles: only real activities move hikers.
-- Run once in the Supabase SQL editor AFTER 20261101000000_at_fitness_schema.sql (idempotent: safe to re-run).
--
-- Security model
--   * Only organizers may write dispatches. Organizers are listed in at_organizers, which the app can
--     never write to: add a row from the Supabase dashboard (SQL editor or Table Editor).
--   * Every signed-in hiker can read published dispatches with no challenge (challenge_id is null).
--     Dispatches tied to a challenge are readable only by that challenge's members.
--   * Scheduled dispatches (published_at in the future) are hidden from everyone except organizers.
--   * The body is stored as plain text using a small Markdown subset. The app renders it with DOM
--     text nodes (never as HTML), so stored content cannot inject markup or scripts.

-- 1. Organizers --------------------------------------------------------------------------------------

create table if not exists public.at_organizers (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text check (note is null or char_length(note) <= 80),
  created_at timestamptz not null default now()
);

alter table public.at_organizers enable row level security;
revoke all on public.at_organizers from anon, authenticated;

-- SECURITY DEFINER so policies and the app can ask "am I an organizer?" without reading the table.
create or replace function public.at_is_organizer()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.at_organizers o where o.user_id = (select auth.uid()))
$$;

-- 2. Dispatches --------------------------------------------------------------------------------------

create table if not exists public.at_dispatches (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid references public.at_challenges (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  body         text not null check (char_length(btrim(body)) between 1 and 5000),
  author_name  text not null default 'Camp' check (char_length(btrim(author_name)) between 1 and 40),
  pinned       boolean not null default false,
  published_at timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists at_dispatches_feed_idx on public.at_dispatches (pinned desc, published_at desc);
create index if not exists at_dispatches_challenge_idx on public.at_dispatches (challenge_id);

create or replace function public.at_dispatches_prepare()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title);
  new.body := btrim(new.body);
  new.author_name := btrim(new.author_name);
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists at_dispatches_prepare on public.at_dispatches;
create trigger at_dispatches_prepare before insert or update on public.at_dispatches
  for each row execute function public.at_dispatches_prepare();

alter table public.at_dispatches enable row level security;

drop policy if exists "at_dispatches read" on public.at_dispatches;
create policy "at_dispatches read" on public.at_dispatches
  for select to authenticated using (
    (select public.at_is_organizer())
    or (
      published_at <= now()
      and (
        challenge_id is null
        or exists (select 1 from public.at_challenge_members m
                   where m.challenge_id = at_dispatches.challenge_id and m.user_id = (select auth.uid()))
      )
    )
  );

drop policy if exists "at_dispatches organizer insert" on public.at_dispatches;
create policy "at_dispatches organizer insert" on public.at_dispatches
  for insert to authenticated with check ((select public.at_is_organizer()));

drop policy if exists "at_dispatches organizer update" on public.at_dispatches;
create policy "at_dispatches organizer update" on public.at_dispatches
  for update to authenticated using ((select public.at_is_organizer())) with check ((select public.at_is_organizer()));

drop policy if exists "at_dispatches organizer delete" on public.at_dispatches;
create policy "at_dispatches organizer delete" on public.at_dispatches
  for delete to authenticated using ((select public.at_is_organizer()));

-- 3. Expedition runs (camp minigame) ----------------------------------------------------------------

create table if not exists public.at_expedition_runs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  theme     text not null check (theme ~ '^[a-z][a-z0-9-]{1,30}$'),
  score     integer not null check (score between 0 and 400),
  hits      integer not null default 0 check (hits between 0 and 100),
  shots     integer not null default 0 check (shots between 0 and 100 and hits <= shots),
  played_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists at_expedition_runs_user_idx on public.at_expedition_runs (user_id, played_on);

-- Owner is always the caller; a friendly daily cap keeps the minigame a treat, not a grind.
create or replace function public.at_expedition_runs_prepare()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := (select auth.uid());
  if new.user_id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  new.played_on := current_date;
  new.created_at := now();
  if (select count(*) from public.at_expedition_runs r where r.user_id = new.user_id and r.played_on = current_date) >= 10 then
    raise exception 'That is plenty of expeditions for today. Camp will be here tomorrow!' using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists at_expedition_runs_prepare on public.at_expedition_runs;
create trigger at_expedition_runs_prepare before insert on public.at_expedition_runs
  for each row execute function public.at_expedition_runs_prepare();

alter table public.at_expedition_runs enable row level security;

drop policy if exists "at_expedition_runs select own" on public.at_expedition_runs;
create policy "at_expedition_runs select own" on public.at_expedition_runs
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "at_expedition_runs insert own" on public.at_expedition_runs;
create policy "at_expedition_runs insert own" on public.at_expedition_runs
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Camp totals: the caller's own totals, plus crew totals (members' runs since the challenge started)
-- when a challenge is given. Aggregates only; individual runs stay private.
create or replace function public.at_camp_supplies(p_challenge uuid default null)
returns table (theme text, my_score bigint, my_runs bigint, crew_score bigint, crew_runs bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_start date;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_challenge is not null then
    if not exists (select 1 from public.at_challenge_members m where m.challenge_id = p_challenge and m.user_id = auth.uid()) then
      raise exception 'Not a member of this challenge' using errcode = '42501';
    end if;
    select c.start_date into v_start from public.at_challenges c where c.id = p_challenge;
  end if;
  return query
    with runs as (
      select r.theme, r.score, r.user_id = auth.uid() as mine,
             (p_challenge is not null and r.played_on >= v_start
              and r.user_id in (select m.user_id from public.at_challenge_members m where m.challenge_id = p_challenge)) as crew
        from public.at_expedition_runs r
       where r.user_id = auth.uid()
          or (p_challenge is not null and r.played_on >= v_start
              and r.user_id in (select m.user_id from public.at_challenge_members m where m.challenge_id = p_challenge))
    )
    select runs.theme,
           coalesce(sum(runs.score) filter (where runs.mine), 0)::bigint,
           count(*) filter (where runs.mine),
           coalesce(sum(runs.score) filter (where runs.crew), 0)::bigint,
           count(*) filter (where runs.crew)
      from runs
     group by runs.theme
     order by runs.theme;
end $$;

-- 4. Privileges: deny by default, then grant exactly what the app needs -----------------------------

revoke all on public.at_dispatches from anon, authenticated;
grant select (id, challenge_id, title, body, author_name, pinned, published_at, created_at, updated_at)
  on public.at_dispatches to authenticated;
grant insert (challenge_id, title, body, author_name, pinned, published_at) on public.at_dispatches to authenticated;
grant update (challenge_id, title, body, author_name, pinned, published_at) on public.at_dispatches to authenticated;
grant delete on public.at_dispatches to authenticated;

revoke all on public.at_expedition_runs from anon, authenticated;
grant select (id, theme, score, hits, shots, played_on, created_at) on public.at_expedition_runs to authenticated;
grant insert (theme, score, hits, shots) on public.at_expedition_runs to authenticated;

revoke all on function public.at_is_organizer() from public, anon;
revoke all on function public.at_expedition_runs_prepare() from public, anon, authenticated;
revoke all on function public.at_camp_supplies(uuid) from public, anon;
grant execute on function public.at_camp_supplies(uuid) to authenticated;
revoke all on function public.at_dispatches_prepare() from public, anon, authenticated;
grant execute on function public.at_is_organizer() to authenticated;
