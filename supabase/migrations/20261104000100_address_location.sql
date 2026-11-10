-- Precise address points remain private to their owner. They supplement the
-- written delivery address; coverage and prices still use the existing ubigeo.
alter table app.addresses
  add column latitude double precision,
  add column longitude double precision,
  add constraint addresses_location_valid check (
    (latitude is null and longitude is null)
    or (
      latitude is not null and longitude is not null
      and latitude between -90 and 90
      and longitude between -180 and 180
    )
  );

grant update (latitude, longitude) on app.addresses to aro_api_executor;

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
      'location', case when a.latitude is null then null else
        pg_catalog.jsonb_build_object(
          'latitude', a.latitude, 'longitude', a.longitude
        ) end,
      'created_at', a.created_at, 'updated_at', a.updated_at
    ) from app.addresses a where a.user_id = actor
  );
end;
$function$;

-- Do not leave an overload with the old seven-argument signature: PostgREST
-- would not be able to resolve existing requests against two defaulted forms.
-- The optional arguments below keep existing six/seven-field calls valid.
drop function api.save_address(text, text, text, text, text, text, text);

create function api.save_address(
  p_label text, p_recipient text, p_department text,
  p_province text, p_district text, p_street text,
  p_reference text default '',
  p_latitude double precision default null,
  p_longitude double precision default null
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
  -- PostgreSQL orders NaN above finite numbers, so the range checks reject
  -- NaN and infinities as well as ordinary out-of-range values.
  if (p_latitude is null) <> (p_longitude is null)
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Invalid address location.';
  end if;
  insert into app.addresses (
    user_id, label, recipient, department, province, district, street, reference,
    latitude, longitude
  ) values (
    actor, label_value, recipient_value, department_value, province_value,
    district_value, street_value, reference_value, p_latitude, p_longitude
  ) on conflict (user_id) do update
    set label = excluded.label, recipient = excluded.recipient,
        department = excluded.department, province = excluded.province,
        district = excluded.district, street = excluded.street,
        reference = excluded.reference, latitude = excluded.latitude,
        longitude = excluded.longitude, updated_at = pg_catalog.now();
  return api.get_address();
end;
$function$;

grant create on schema api to aro_api_executor;
alter function api.save_address(text, text, text, text, text, text, text, double precision, double precision)
  owner to aro_api_executor;
revoke create on schema api from aro_api_executor;

revoke all on function api.get_address(),
  api.save_address(text, text, text, text, text, text, text, double precision, double precision)
  from public, anon, authenticated, service_role;
grant execute on function api.get_address(),
  api.save_address(text, text, text, text, text, text, text, double precision, double precision)
  to authenticated;

notify pgrst, 'reload schema';
