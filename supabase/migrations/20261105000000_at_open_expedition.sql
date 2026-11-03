-- Open participation: no invite codes, no joining. Pick a name, log miles, everything updates.
-- Any signed-in device may log for an active hiker and read the roster's aggregates. Devices still
-- own (and alone can edit/delete) the rows they logged. Safe to run more than once.

create or replace function public.at_is_expedition_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
$$;

drop function if exists public.at_join_expedition(text);
drop function if exists public.at_expedition_invite_code();
drop table if exists public.at_expedition_members;
drop table if exists public.at_expedition_settings;
