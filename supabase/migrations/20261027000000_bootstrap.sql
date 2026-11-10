-- Aroma Infini: foundation for a NEW, reviewed application schema.
-- Never apply to an existing project before reviewing audit/preflight.sql.
-- No DROP, role elevation, PUBLIC-schema defaults or demo business data.

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Run this reviewed migration as the project database owner.';
  end if;
  if to_regclass('auth.users') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('auth.jwt()') is null then
    raise exception 'Supabase Auth primitives must already exist.';
  end if;
  if exists (
    select 1 from pg_namespace where nspname in ('app', 'api', 'private')
  ) or exists (
    select 1 from pg_roles where rolname in ('aro_api_executor', 'aro_profile_bootstrap')
  ) then
    raise exception 'Application schemas or roles already exist. Inspect and baseline before applying; nothing will be replaced.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'Expected Supabase Data API roles are missing.';
  end if;
end;
$$;

create role aro_api_executor nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;
create role aro_profile_bootstrap nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;

-- Only the migration operator may transfer ownership to these NOLOGIN roles.
-- Neither authenticator nor end-user roles receive membership.
grant aro_api_executor, aro_profile_bootstrap to postgres;

create schema app authorization postgres;
create schema api authorization postgres;
create schema private authorization postgres;

revoke all on schema app, api, private from public, anon, authenticated;
grant usage on schema api to anon, authenticated;
grant usage on schema app, api, private to aro_api_executor, aro_profile_bootstrap;
grant usage on schema auth to aro_api_executor, aro_profile_bootstrap;
grant execute on function auth.uid(), auth.jwt() to aro_api_executor, aro_profile_bootstrap;

-- Defaults are changed only for our NEW schemas and their known creators.
-- Existing public/auth/extension objects and defaults are untouched.
alter default privileges for role postgres in schema app, api, private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema app, api, private
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema app, api, private
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role aro_api_executor in schema app, api, private
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role aro_profile_bootstrap in schema app, api, private
  revoke execute on functions from public, anon, authenticated;

create function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

comment on schema app is 'Aroma Infini application tables. Not exposed to the Data API.';
comment on schema private is 'Aroma Infini protected membership and internal helpers. Never exposed.';
comment on schema api is 'Explicitly granted application RPCs; expose this schema only after security review.';
