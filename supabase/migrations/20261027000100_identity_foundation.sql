-- Identity foundation. Requires 20261027000000 bootstrap and Supabase Auth.
-- This migration does not create users, grant administrator membership, or
-- expose app/private tables to PostgREST. Apply only after the remote preflight.
-- Official references: Supabase managing-user-data, row-level-security,
-- database/functions and auth/auth-mfa guides (reviewed 2026-10-27).

-- Fail before mutation when the names belong to another installation. Never
-- replace an unknown function or silently take over an existing table.
do $preflight$
begin
  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'app')
     or not exists (select 1 from pg_catalog.pg_namespace where nspname = 'api')
     or not exists (select 1 from pg_catalog.pg_namespace where nspname = 'private') then
    raise exception 'Identity foundation requires the reviewed bootstrap schemas.';
  end if;
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regprocedure('auth.uid()') is null
     or pg_catalog.to_regprocedure('auth.jwt()') is null then
    raise exception 'Identity foundation requires Supabase Auth.';
  end if;
  if (select count(*) from pg_catalog.pg_roles
      where rolname in ('aro_api_executor', 'aro_profile_bootstrap')
        and not (rolsuper or rolinherit or rolcreaterole or rolcreatedb
                 or rolcanlogin or rolreplication or rolbypassrls)) <> 2 then
    raise exception 'Identity executor roles are missing or have unsafe attributes.';
  end if;
  if pg_catalog.pg_has_role('anon', 'aro_api_executor', 'MEMBER')
     or pg_catalog.pg_has_role('authenticated', 'aro_api_executor', 'MEMBER')
     or pg_catalog.pg_has_role('anon', 'aro_profile_bootstrap', 'MEMBER')
     or pg_catalog.pg_has_role('authenticated', 'aro_profile_bootstrap', 'MEMBER') then
    raise exception 'Browser roles must not be members of identity executor roles.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where (n.nspname = 'app' and c.relname in ('profiles', 'addresses'))
       or (n.nspname = 'private' and c.relname = 'admin_memberships')
  ) or exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'api' and p.proname in
      ('current_actor', 'get_profile', 'update_profile', 'get_address',
       'save_address', 'remove_address'))
       or (n.nspname = 'private' and p.proname in
      ('current_user_membership', 'is_admin', 'bootstrap_profile'))
  ) or exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'auth.users'::pg_catalog.regclass
      and t.tgname = 'aro_user_profile_created'
  ) then
    raise exception 'Identity object collision: inspect existing objects before migration.';
  end if;
end;
$preflight$;

create table app.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_first_name_valid check (
    pg_catalog.char_length(first_name) <= 80 and first_name !~ '[[:cntrl:]]'
  ),
  constraint profiles_last_name_valid check (
    pg_catalog.char_length(last_name) <= 80 and last_name !~ '[[:cntrl:]]'
  ),
  -- Empty values allow an Auth account created without profile metadata to
  -- complete its profile later. Auth registration itself is not made brittle.
  constraint profiles_phone_valid check (
    phone = '' or phone ~ '^\+?[0-9 ]{7,20}$'
  )
);

create table app.addresses (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  label text not null,
  recipient text not null,
  department text not null,
  province text not null,
  district text not null,
  street text not null,
  reference text not null default '',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint addresses_label_valid check (
    pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 80
    and label !~ '[[:cntrl:]]'
  ),
  constraint addresses_recipient_valid check (
    pg_catalog.char_length(pg_catalog.btrim(recipient)) between 1 and 160
    and recipient !~ '[[:cntrl:]]'
  ),
  constraint addresses_department_valid check (
    department ~ '^[a-z][a-z0-9-]{1,63}$'
  ),
  constraint addresses_ubigeo_valid check (
    province ~ '^[0-9]{4}$' and district ~ '^[0-9]{6}$'
    and pg_catalog.left(district, 4) = province
  ),
  constraint addresses_street_valid check (
    pg_catalog.char_length(pg_catalog.btrim(street)) between 1 and 500
    and street !~ '[[:cntrl:]]'
  ),
  constraint addresses_reference_valid check (
    pg_catalog.char_length(reference) <= 500 and reference !~ '[[:cntrl:]]'
  )
);

-- Memberships are granted only by an operator with privileged SQL access.
-- Profile metadata, email address and public Auth registration cannot add one.
create table private.admin_memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active boolean not null default true,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default pg_catalog.now()
);

alter table app.profiles enable row level security;
alter table app.profiles force row level security;
alter table app.addresses enable row level security;
alter table app.addresses force row level security;
alter table private.admin_memberships enable row level security;
alter table private.admin_memberships force row level security;

revoke all on app.profiles, app.addresses, private.admin_memberships
  from public, anon, authenticated, service_role;
grant select on app.profiles to aro_api_executor;
grant insert (user_id, first_name, last_name, phone) on app.profiles to aro_api_executor;
grant update (first_name, last_name, phone, updated_at) on app.profiles to aro_api_executor;
grant insert (user_id, first_name, last_name, phone) on app.profiles to aro_profile_bootstrap;
grant select, insert, delete on app.addresses to aro_api_executor;
grant update (label, recipient, department, province, district, street, reference, updated_at)
  on app.addresses to aro_api_executor;
grant select (user_id, active) on private.admin_memberships to aro_api_executor;

create policy profiles_executor_read on app.profiles
  for select to aro_api_executor
  using (user_id = (select auth.uid()));
create policy profiles_executor_insert on app.profiles
  for insert to aro_api_executor
  with check (user_id = (select auth.uid()));
create policy profiles_executor_update on app.profiles
  for update to aro_api_executor
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- This role is NOLOGIN, is not granted to browser roles and owns only the
-- hard-wired Auth insert trigger. It cannot grant membership or read profiles.
create policy profiles_auth_bootstrap_insert on app.profiles
  for insert to aro_profile_bootstrap with check (true);

create policy addresses_executor_read on app.addresses
  for select to aro_api_executor
  using (user_id = (select auth.uid()));
create policy addresses_executor_insert on app.addresses
  for insert to aro_api_executor
  with check (user_id = (select auth.uid()));
create policy addresses_executor_update on app.addresses
  for update to aro_api_executor
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy addresses_executor_delete on app.addresses
  for delete to aro_api_executor
  using (user_id = (select auth.uid()));

create policy admin_membership_executor_read_self on private.admin_memberships
  for select to aro_api_executor
  using (user_id = (select auth.uid()));

create function private.current_user_membership()
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from private.admin_memberships m
    where m.user_id = auth.uid() and m.active
  );
$function$;

create function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select auth.uid() is not null
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and private.current_user_membership();
$function$;

create function api.current_actor()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  member boolean;
  assurance text := auth.jwt() ->> 'aal';
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  member := private.current_user_membership();
  return pg_catalog.jsonb_build_object(
    'user_id', actor,
    'role', case when member then 'admin' else 'customer' end,
    'aal', case when assurance in ('aal1', 'aal2') then assurance else null end,
    'requires_mfa', member and not private.is_admin()
  );
end;
$function$;

create function api.get_profile()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  return (
    select pg_catalog.jsonb_build_object(
      'user_id', p.user_id, 'first_name', p.first_name,
      'last_name', p.last_name, 'phone', p.phone,
      'created_at', p.created_at, 'updated_at', p.updated_at
    ) from app.profiles p where p.user_id = actor
  );
end;
$function$;

create function api.update_profile(p_first_name text, p_last_name text, p_phone text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  first_name_value text := pg_catalog.btrim(p_first_name);
  last_name_value text := pg_catalog.btrim(p_last_name);
  phone_value text := pg_catalog.btrim(p_phone);
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if first_name_value is null or last_name_value is null or phone_value is null
     or pg_catalog.char_length(first_name_value) not between 1 and 80
     or pg_catalog.char_length(last_name_value) not between 1 and 80
     or first_name_value ~ '[[:cntrl:]]' or last_name_value ~ '[[:cntrl:]]'
     or phone_value !~ '^\+?[0-9 ]{7,20}$' then
    raise exception using errcode = '22023', message = 'Invalid profile fields.';
  end if;
  -- Supports an existing Auth user without a profile, without trusting a user ID
  -- or an email address supplied by the browser. Email changes belong to Auth.
  insert into app.profiles (user_id, first_name, last_name, phone)
    values (actor, first_name_value, last_name_value, phone_value)
  on conflict (user_id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        phone = excluded.phone,
        updated_at = pg_catalog.now();
  return api.get_profile();
end;
$function$;

create function api.get_address()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  return (
    select pg_catalog.jsonb_build_object(
      'id', a.id, 'user_id', a.user_id, 'label', a.label,
      'recipient', a.recipient, 'department', a.department,
      'province', a.province, 'district', a.district,
      'street', a.street, 'reference', a.reference,
      'created_at', a.created_at, 'updated_at', a.updated_at
    ) from app.addresses a where a.user_id = actor
  );
end;
$function$;

create function api.save_address(
  p_label text, p_recipient text, p_department text,
  p_province text, p_district text, p_street text,
  p_reference text default ''
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  label_value text := pg_catalog.btrim(p_label);
  recipient_value text := pg_catalog.btrim(p_recipient);
  department_value text := pg_catalog.btrim(p_department);
  province_value text := pg_catalog.btrim(p_province);
  district_value text := pg_catalog.btrim(p_district);
  street_value text := pg_catalog.btrim(p_street);
  reference_value text := pg_catalog.btrim(coalesce(p_reference, ''));
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if label_value is null or recipient_value is null or department_value is null
     or province_value is null or district_value is null or street_value is null
     or pg_catalog.char_length(label_value) not between 1 and 80
     or pg_catalog.char_length(recipient_value) not between 1 and 160
     or pg_catalog.char_length(street_value) not between 1 and 500
     or pg_catalog.char_length(reference_value) > 500
     or label_value ~ '[[:cntrl:]]' or recipient_value ~ '[[:cntrl:]]'
     or street_value ~ '[[:cntrl:]]' or reference_value ~ '[[:cntrl:]]'
     or department_value !~ '^[a-z][a-z0-9-]{1,63}$'
     or province_value !~ '^[0-9]{4}$' or district_value !~ '^[0-9]{6}$'
     or pg_catalog.left(district_value, 4) <> province_value then
    raise exception using errcode = '22023', message = 'Invalid address fields.';
  end if;
  -- Ubigeo shape/hierarchy is checked here. Checkout must independently check
  -- the configured destination coverage and current shipping quote in SQL.
  insert into app.addresses (
    user_id, label, recipient, department, province, district, street, reference
  ) values (
    actor, label_value, recipient_value, department_value, province_value,
    district_value, street_value, reference_value
  ) on conflict (user_id) do update
    set label = excluded.label, recipient = excluded.recipient,
        department = excluded.department, province = excluded.province,
        district = excluded.district, street = excluded.street,
        reference = excluded.reference, updated_at = pg_catalog.now();
  return api.get_address();
end;
$function$;

create function api.remove_address()
returns void
language plpgsql volatile security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  delete from app.addresses where user_id = actor;
end;
$function$;

create function private.bootstrap_profile()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
declare
  first_name_value text := '';
  last_name_value text := '';
  phone_value text := '';
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' or tg_op <> 'INSERT' then
    raise exception using errcode = '42501', message = 'Invalid profile trigger context.';
  end if;
  if pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'firstName') = 'string' then
    first_name_value := pg_catalog.btrim(new.raw_user_meta_data ->> 'firstName');
  end if;
  if pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'lastName') = 'string' then
    last_name_value := pg_catalog.btrim(new.raw_user_meta_data ->> 'lastName');
  end if;
  if pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'phone') = 'string' then
    phone_value := pg_catalog.btrim(new.raw_user_meta_data ->> 'phone');
  end if;
  if pg_catalog.char_length(first_name_value) > 80 or first_name_value ~ '[[:cntrl:]]' then
    first_name_value := '';
  end if;
  if pg_catalog.char_length(last_name_value) > 80 or last_name_value ~ '[[:cntrl:]]' then
    last_name_value := '';
  end if;
  if phone_value !~ '^\+?[0-9 ]{7,20}$' then
    phone_value := '';
  end if;
  -- No exception blanket: genuine database errors remain visible to operators.
  -- Invalid optional metadata is reduced to an incomplete, correctable profile.
  -- Metadata role/admin flags and email are deliberately never read or copied.
  insert into app.profiles (user_id, first_name, last_name, phone)
    values (new.id, first_name_value, last_name_value, phone_value);
  return new;
end;
$function$;

-- Transfer functions, not tables, to roles that cannot log in or bypass RLS.
-- CREATE is needed for ALTER OWNER, and is withdrawn immediately afterward.
grant create on schema api, private to aro_api_executor;
grant create on schema private to aro_profile_bootstrap;
alter function private.current_user_membership() owner to aro_api_executor;
alter function private.is_admin() owner to aro_api_executor;
alter function api.current_actor() owner to aro_api_executor;
alter function api.get_profile() owner to aro_api_executor;
alter function api.update_profile(text, text, text) owner to aro_api_executor;
alter function api.get_address() owner to aro_api_executor;
alter function api.save_address(text, text, text, text, text, text, text) owner to aro_api_executor;
alter function api.remove_address() owner to aro_api_executor;
alter function private.bootstrap_profile() owner to aro_profile_bootstrap;
revoke create on schema api, private from aro_api_executor;
revoke create on schema private from aro_profile_bootstrap;

revoke all on function private.current_user_membership(), private.is_admin(),
  private.bootstrap_profile() from public, anon, authenticated, service_role;
revoke all on function api.current_actor(), api.get_profile(),
  api.update_profile(text, text, text), api.get_address(),
  api.save_address(text, text, text, text, text, text, text), api.remove_address()
  from public, anon, authenticated, service_role;

grant execute on function api.current_actor(), api.get_profile(),
  api.update_profile(text, text, text), api.get_address(),
  api.save_address(text, text, text, text, text, text, text), api.remove_address()
  to authenticated;

create trigger aro_user_profile_created
  after insert on auth.users
  for each row execute function private.bootstrap_profile();

comment on table private.admin_memberships is
  'Protected membership only; operator-controlled bootstrap by verified Auth UUID, never public metadata.';
comment on function private.is_admin() is
  'Current actor must have active protected membership and a verified aal2 JWT; no actor parameter.';
