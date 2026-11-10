-- Owner-scoped precise points. This suite runs only in disposable PostgreSQL;
-- GPS and the browser permission prompt are covered by the UI tests separately.
begin;

do $$
begin
  if current_setting('aroma.test_mode', true) is distinct from 'local-fixture' then
    raise exception 'Only local fixtures.';
  end if;
end $$;

create schema aroma_address_location_test;
grant usage on schema aroma_address_location_test to anon, authenticated, aro_api_executor;
create function aroma_address_location_test.ok(p boolean, label text)
returns text language plpgsql set search_path = '' as $$
begin
  if p is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end $$;
create function aroma_address_location_test.error(statement text, state text, label text)
returns text language plpgsql set search_path = '' as $$
declare actual text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual = returned_sqlstate;
  end;
  if actual is distinct from state then
    raise exception 'FAIL: %, expected %, received %', label, state, actual;
  end if;
  return 'PASS: ' || label;
end $$;
grant execute on all functions in schema aroma_address_location_test to anon, authenticated, aro_api_executor;

insert into auth.users(id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'location-owner-a@example.invalid'),
  ('e1000000-0000-4000-8000-000000000002', 'location-owner-b@example.invalid');

select aroma_address_location_test.ok(
  (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'save_address'),
  'Address RPC has one unambiguous signature with optional coordinates'
);
select aroma_address_location_test.ok(
  (select proowner = 'aro_api_executor'::regrole and prosecdef
    from pg_proc where oid = 'api.save_address(text,text,text,text,text,text,text,double precision,double precision)'::regprocedure),
  'Precise address RPC retains its non-bypass owner and definer boundary'
);
select aroma_address_location_test.ok(
  not has_schema_privilege('aro_api_executor', 'api', 'create')
  and not has_function_privilege('anon', 'api.save_address(text,text,text,text,text,text,text,double precision,double precision)', 'execute')
  and not has_function_privilege('service_role', 'api.save_address(text,text,text,text,text,text,text,double precision,double precision)', 'execute'),
  'New address signature leaves no broad executor or service permissions'
);
select aroma_address_location_test.ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'app.addresses'::regclass)
  and not has_table_privilege('authenticated', 'app.addresses', 'select,insert,update,delete')
  and has_column_privilege('aro_api_executor', 'app.addresses', 'latitude', 'update')
  and has_column_privilege('aro_api_executor', 'app.addresses', 'longitude', 'update'),
  'Address location stays behind forced RLS and column-scoped updates'
);

select set_config('request.jwt.claims', '{}', true);
set local role anon;
select aroma_address_location_test.error(
  'select api.get_address()', '42501', 'Anonymous cannot read a precise address'
);
reset role;
set local role authenticated;
select aroma_address_location_test.error(
  'select api.save_address(''Casa'', ''Owner'', ''lima'', ''1501'', ''150115'', ''Calle fixture 123'', '''', -12.08, -77.02)',
  '42501', 'Address save without a verified user claim is rejected'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select aroma_address_location_test.ok(
  api.save_address('Casa', 'Owner A', 'lima', '1501', '150115', 'Calle fixture 123', '') -> 'location' = 'null'::jsonb,
  'Existing seven-argument callers can still save an address without GPS'
);
select aroma_address_location_test.ok(
  api.save_address('Casa', 'Owner A', 'lima', '1501', '150115', 'Calle fixture 123', '', -12.08, -77.02) -> 'location'
    = '{"latitude":-12.08,"longitude":-77.02}'::jsonb,
  'Owner can save and receive its precise point'
);
select aroma_address_location_test.ok(
  api.get_address() -> 'location' = '{"latitude":-12.08,"longitude":-77.02}'::jsonb,
  'Loading the address preserves the saved point'
);
select aroma_address_location_test.error(
  'select api.save_address(''Casa'', ''Owner A'', ''lima'', ''1501'', ''150115'', ''Calle fixture 123'', '''', -12.08, null)',
  '22023', 'A latitude without longitude is rejected'
);
select aroma_address_location_test.error(
  'select api.save_address(''Casa'', ''Owner A'', ''lima'', ''1501'', ''150115'', ''Calle fixture 123'', '''', null, -77.02)',
  '22023', 'A longitude without latitude is rejected'
);
select aroma_address_location_test.error(
  'select api.save_address(''Casa'', ''Owner A'', ''lima'', ''1501'', ''150115'', ''Calle fixture 123'', '''', -90.001, -77.02)',
  '22023', 'Latitude outside its range is rejected'
);
select aroma_address_location_test.error(
  'select api.save_address(''Casa'', ''Owner A'', ''lima'', ''1501'', ''150115'', ''Calle fixture 123'', '''', -12.08, 180.001)',
  '22023', 'Longitude outside its range is rejected'
);
select aroma_address_location_test.error(
  'select api.save_address(''Casa'', ''Owner A'', ''lima'', ''1501'', ''150115'', ''Calle fixture 123'', '''', ''NaN''::double precision, -77.02)',
  '22023', 'NaN cannot become a stored latitude'
);
select aroma_address_location_test.error(
  'select api.save_address(''Casa'', ''Owner A'', ''lima'', ''1501'', ''150115'', ''Calle fixture 123'', '''', -12.08, ''Infinity''::double precision)',
  '22023', 'Positive infinity cannot become a stored longitude'
);
select aroma_address_location_test.error(
  'select api.save_address(''Casa'', ''Owner A'', ''lima'', ''1501'', ''150115'', ''Calle fixture 123'', '''', ''-Infinity''::double precision, -77.02)',
  '22023', 'Negative infinity cannot become a stored latitude'
);
select aroma_address_location_test.ok(
  api.get_address() -> 'location' = '{"latitude":-12.08,"longitude":-77.02}'::jsonb,
  'Invalid updates do not destroy the previously saved point'
);
select aroma_address_location_test.ok(
  api.save_address('Casa', 'Owner A', 'lima', '1501', '150115', 'Calle fixture 123', '', -90, -180) -> 'location'
    = '{"latitude":-90,"longitude":-180}'::jsonb
  and api.save_address('Casa', 'Owner A', 'lima', '1501', '150115', 'Calle fixture 123', '', 90, 180) -> 'location'
    = '{"latitude":90,"longitude":180}'::jsonb
  and api.save_address('Casa', 'Owner A', 'lima', '1501', '150115', 'Calle fixture 123', '', 0, 0) -> 'location'
    = '{"latitude":0,"longitude":0}'::jsonb,
  'Coordinate boundaries and zero values are preserved without truthiness loss'
);
select aroma_address_location_test.ok(
  api.save_address('Casa', 'Owner A', 'lima', '1501', '150115', 'Calle fixture 123', '', null, null) -> 'location' = 'null'::jsonb,
  'Explicit null pair removes the precise point while keeping the address'
);
select api.save_address('Casa', 'Owner A', 'lima', '1501', '150115', 'Calle fixture 123', '', -12.08, -77.02);
reset role;

select aroma_address_location_test.ok(
  (select count(*) = 1 from app.addresses where user_id = 'e1000000-0000-4000-8000-000000000001'),
  'Repeated location updates do not duplicate the owner address'
);
select aroma_address_location_test.error(
  'update app.addresses set longitude = null where user_id = ''e1000000-0000-4000-8000-000000000001''',
  '23514', 'The table constraint independently rejects partial coordinates'
);
select aroma_address_location_test.error(
  'update app.addresses set latitude = ''NaN''::double precision where user_id = ''e1000000-0000-4000-8000-000000000001''',
  '23514', 'The table constraint independently rejects non-finite coordinates'
);

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select aroma_address_location_test.ok(api.get_address() is null, 'Another customer cannot load the first owner precise point');
select api.save_address('Oficina', 'Owner B', 'lima', '1501', '150115', 'Otra calle fixture 456', '', -12.09, -77.03);
reset role;
set local role aro_api_executor;
select aroma_address_location_test.ok(
  (select count(*) = 1 from app.addresses)
  and not exists (select 1 from app.addresses where user_id = 'e1000000-0000-4000-8000-000000000001'),
  'RLS hides another customer coordinates even from the non-bypass executor'
);
update app.addresses set latitude = 0, longitude = 0
  where user_id = 'e1000000-0000-4000-8000-000000000001';
reset role;
select aroma_address_location_test.ok(
  (select latitude = -12.08 and longitude = -77.02 from app.addresses where user_id = 'e1000000-0000-4000-8000-000000000001'),
  'RLS also prevents cross-owner coordinate updates'
);

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select api.remove_address();
select aroma_address_location_test.ok(api.get_address() is null, 'Removing the address removes the owner precise point');
reset role;
select aroma_address_location_test.ok(
  (select latitude = -12.09 and longitude = -77.03 from app.addresses where user_id = 'e1000000-0000-4000-8000-000000000002'),
  'Removing one address preserves the other customer point'
);

rollback;
