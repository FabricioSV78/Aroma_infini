-- TEST HARNESS ONLY. Not a Supabase migration or an application dependency.
-- The local runner must opt in explicitly before applying this to an empty,
-- disposable PostgreSQL database. Supabase itself already supplies these
-- objects; this fixture must never be used against an existing auth schema.
begin;

do $$
begin
  if current_setting('aroma.test_mode', true) is distinct from 'local-fixture' then
    raise exception 'Standalone Auth fixture requires the isolated local runner.';
  end if;
  if to_regnamespace('auth') is not null then
    raise exception 'Refusing to replace an existing auth schema.';
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema auth;
revoke all on schema auth from public;

-- Only fields consumed by the foundation migrations. This does not implement
-- GoTrue, sessions, password hashing, JWT signature verification or email/MFA.
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
revoke all on auth.users from public, anon, authenticated, service_role;

create function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create function auth.jwt()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

revoke all on function auth.uid(), auth.jwt() from public;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

commit;
