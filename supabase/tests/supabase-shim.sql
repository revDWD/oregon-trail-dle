-- Minimal emulation of the parts of Supabase the migration depends on.
-- ONLY for local/CI tests (never run this against a real Supabase project).

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Same contract as Supabase: reads the sub claim that PostgREST sets from the verified JWT.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase grants everything on new public objects to the API roles by default; the migration must
-- revoke what it does not want, so reproduce that default to prove it does.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
