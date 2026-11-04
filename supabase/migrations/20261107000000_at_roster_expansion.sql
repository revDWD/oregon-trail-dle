-- The full expedition roster: eleven hikers, listed in this order everywhere a hiker is chosen.
-- Existing hikers (David, Kevin) keep their id and history; only their sort order changes.
-- Safe to run more than once. To add someone later:
--   insert into public.at_hikers (name, sort_order) values ('Name', 12);

insert into public.at_hikers (name, sort_order) values
  ('Alden', 1), ('Amanda', 2), ('Andrew', 3), ('David', 4), ('Elizabeth', 5), ('Kayla', 6),
  ('Kevin', 7), ('Kelsey', 8), ('Matthew', 9), ('Shuva', 10), ('Will', 11)
on conflict (name) do update set sort_order = excluded.sort_order, active = true;
