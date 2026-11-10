-- Hosted Supabase does not allow postgres to grant custom roles USAGE on
-- the managed auth schema. Read only the verified request claims in our own
-- private helpers; no broad authenticated-role inheritance or bypass is added.
-- The Data API verifies JWT signatures before setting these request settings.
-- https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema
-- Existing rows, function signatures and table grants remain unchanged.

create function private.request_user_id()
returns uuid language sql stable security invoker set search_path = ''
as $claims$
  select coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$claims$;

create function private.request_assurance()
returns text language sql stable security invoker set search_path = ''
as $claims$
  select nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal';
$claims$;

revoke all on function private.request_user_id(), private.request_assurance()
  from public, anon, authenticated, service_role;
grant execute on function private.request_user_id(), private.request_assurance()
  to aro_api_executor;

alter policy profiles_executor_read on app.profiles
  using (user_id = (select private.request_user_id()));
alter policy profiles_executor_insert on app.profiles
  with check (user_id = (select private.request_user_id()));
alter policy profiles_executor_update on app.profiles
  using (user_id = (select private.request_user_id()))
  with check (user_id = (select private.request_user_id()));
alter policy addresses_executor_read on app.addresses
  using (user_id = (select private.request_user_id()));
alter policy addresses_executor_insert on app.addresses
  with check (user_id = (select private.request_user_id()));
alter policy addresses_executor_update on app.addresses
  using (user_id = (select private.request_user_id()))
  with check (user_id = (select private.request_user_id()));
alter policy addresses_executor_delete on app.addresses
  using (user_id = (select private.request_user_id()));
alter policy admin_membership_executor_read_self on private.admin_memberships
  using (user_id = (select private.request_user_id()));

create or replace function private.current_user_membership()
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select private.request_user_id() is not null and exists (
    select 1 from private.admin_memberships m
    where m.user_id = private.request_user_id() and m.active
  );
$function$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $function$
  select private.request_user_id() is not null
     and coalesce(private.request_assurance(), '') = 'aal2'
     and private.current_user_membership();
$function$;

create or replace function api.current_actor()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  actor uuid := private.request_user_id();
  member boolean;
  assurance text := private.request_assurance();
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

create or replace function api.get_profile()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  actor uuid := private.request_user_id();
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

create or replace function api.update_profile(p_first_name text, p_last_name text, p_phone text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $function$
declare
  actor uuid := private.request_user_id();
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

create or replace function api.get_address()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  actor uuid := private.request_user_id();
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

create or replace function api.save_address(
  p_label text, p_recipient text, p_department text,
  p_province text, p_district text, p_street text,
  p_reference text default ''
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $function$
declare
  actor uuid := private.request_user_id();
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

create or replace function api.remove_address()
returns void
language plpgsql volatile security definer
set search_path = ''
as $function$
declare
  actor uuid := private.request_user_id();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  delete from app.addresses where user_id = actor;
end;
$function$;

-- CREATE OR REPLACE preserves owners and ACLs; explicitly retain the reviewed
-- browser surface and keep private claim helpers inaccessible to clients.
revoke all on function private.current_user_membership(), private.is_admin()
  from public, anon, authenticated, service_role;
revoke all on function api.current_actor(), api.get_profile(),
  api.update_profile(text, text, text), api.get_address(),
  api.save_address(text, text, text, text, text, text, text), api.remove_address()
  from public, anon, authenticated, service_role;
grant execute on function api.current_actor(), api.get_profile(),
  api.update_profile(text, text, text), api.get_address(),
  api.save_address(text, text, text, text, text, text, text), api.remove_address()
  to authenticated;
