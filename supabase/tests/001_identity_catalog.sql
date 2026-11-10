-- Real PostgreSQL authorization tests, using the standalone Auth fixture only.
-- No GoTrue/email/JWT-signature/MFA-service assertion is made by this harness.
-- All test records and helper functions are rolled back. Sequence increments
-- are PostgreSQL nontransactional; run only in the disposable local database.
begin;

do $$
begin
  if current_setting('aroma.test_mode', true) is distinct from 'local-fixture' then
    raise exception 'Run this suite only through the isolated local test runner.';
  end if;
end
$$;

create schema aroma_test_support;
grant usage on schema aroma_test_support to anon, authenticated, aro_api_executor;

create function aroma_test_support.ok(p_condition boolean, p_label text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_condition is distinct from true then
    raise exception 'FAIL: %', p_label;
  end if;
  return 'PASS: ' || p_label;
end
$$;

create function aroma_test_support.expect_error(
  p_statement text, p_expected_state text, p_label text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caught_state text;
begin
  begin
    execute p_statement;
  exception when others then
    get stacked diagnostics caught_state = returned_sqlstate;
  end;
  if caught_state is distinct from p_expected_state then
    raise exception 'FAIL: %, expected SQLSTATE %, received %',
      p_label, p_expected_state, coalesce(caught_state, 'successful statement');
  end if;
  return 'PASS: ' || p_label;
end
$$;

grant execute on all functions in schema aroma_test_support
  to anon, authenticated, aro_api_executor;

-- Reproduce hosted Supabase: custom roles cannot use the managed auth schema.
-- Own-schema request-claim helpers must keep every owner/MFA check working.
revoke usage on schema auth from aro_api_executor, aro_profile_bootstrap;
select aroma_test_support.ok(
  not has_schema_privilege('aro_api_executor', 'auth', 'usage'),
  'Identity executor needs no access to the managed Auth schema'
);

-- Fixed UUIDs are fixtures in this transaction, never application identities.
insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-4000-8000-000000000001', 'sql-owner-a@example.invalid',
   '{"firstName":"Owner A","lastName":"Fixture","phone":"987654321","role":"admin","isAdmin":true}'),
  ('10000000-0000-4000-8000-000000000002', 'sql-owner-b@example.invalid',
   '{"firstName":42,"lastName":["invalid"],"phone":"invalid","role":"admin"}'),
  ('10000000-0000-4000-8000-000000000003', 'sql-admin@example.invalid',
   '{"firstName":"SQL Admin","lastName":"Fixture","phone":"912345678"}');

select aroma_test_support.ok(
  (select count(*) = 3 from app.profiles
   where user_id in ('10000000-0000-4000-8000-000000000001',
                     '10000000-0000-4000-8000-000000000002',
                     '10000000-0000-4000-8000-000000000003')),
  'Auth trigger creates only the three fixture profiles'
);
select aroma_test_support.ok(
  (select first_name = '' and last_name = '' and phone = ''
   from app.profiles where user_id = '10000000-0000-4000-8000-000000000002'),
  'Malformed optional metadata does not block account creation or invent data'
);
select aroma_test_support.ok(
  not exists (select 1 from private.admin_memberships
              where user_id in ('10000000-0000-4000-8000-000000000001',
                                '10000000-0000-4000-8000-000000000002')),
  'Editable registration metadata cannot grant admin membership'
);
insert into private.admin_memberships (user_id, active)
values ('10000000-0000-4000-8000-000000000003', true);

select aroma_test_support.ok(
  (select count(*) = 2 from pg_roles
    where rolname in ('aro_api_executor', 'aro_profile_bootstrap')
      and not (rolsuper or rolinherit or rolcreaterole or rolcreatedb
               or rolcanlogin or rolreplication or rolbypassrls)),
  'Definer roles cannot log in, create roles or bypass RLS'
);
select aroma_test_support.ok(
  not pg_has_role('anon', 'aro_api_executor', 'MEMBER') and
  not pg_has_role('authenticated', 'aro_api_executor', 'MEMBER') and
  not pg_has_role('anon', 'aro_profile_bootstrap', 'MEMBER') and
  not pg_has_role('authenticated', 'aro_profile_bootstrap', 'MEMBER'),
  'Browser roles cannot inherit either privileged executor'
);
select aroma_test_support.ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_roles r on r.oid = c.relowner
    where n.nspname in ('app', 'private') and c.relkind = 'r'
      and r.rolname in ('aro_api_executor', 'aro_profile_bootstrap')
  ),
  'Security definer roles are not owners of operational tables'
);
select aroma_test_support.ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app', 'private') and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  'Every application base table has RLS enabled'
);

-- Anonymous role: identity is absent; both GRANT and schema boundaries matter.
select set_config('request.jwt.claims', '{}', true);
set local role anon;
select aroma_test_support.expect_error(
  'select api.get_profile()', '42501', 'Anonymous cannot read a profile RPC'
);
select aroma_test_support.expect_error(
  'select * from app.profiles', '42501', 'Anonymous cannot read profile tables'
);
select aroma_test_support.expect_error(
  'select * from private.admin_memberships', '42501',
  'Anonymous cannot enumerate administrator memberships'
);
select aroma_test_support.expect_error(
  'select nextval(''app.product_code_seq'')', '42501',
  'Anonymous cannot issue product codes'
);
reset role;

set local role authenticated;
select aroma_test_support.expect_error(
  'select api.current_actor()', '42501',
  'An authenticated SQL role without a user claim has no identity'
);
select aroma_test_support.expect_error(
  'select api.get_profile()', '42501',
  'An authenticated SQL role without a user claim cannot read a profile'
);
reset role;

-- Owner A cannot become admin through metadata, AAL claims or direct SQL.
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","user_metadata":{"role":"admin"}}', true);
set local role authenticated;
select aroma_test_support.ok(
  api.current_actor() ->> 'role' = 'customer',
  'A customer with admin metadata and AAL2 still has customer access'
);
select aroma_test_support.ok(
  api.get_profile() ->> 'user_id' = '10000000-0000-4000-8000-000000000001'
  and api.get_profile() ->> 'first_name' = 'Owner A',
  'Profile RPC resolves the verified claimant only'
);
select aroma_test_support.expect_error(
  'select * from app.profiles', '42501',
  'Authenticated browser cannot bypass RPCs to read all profiles'
);
select aroma_test_support.expect_error(
  'update app.profiles set first_name = ''intrusion''', '42501',
  'Authenticated browser has no direct profile UPDATE privilege'
);
select aroma_test_support.expect_error(
  'insert into private.admin_memberships(user_id) values (''10000000-0000-4000-8000-000000000001'')',
  '42501', 'A customer cannot insert an administrator membership'
);
select aroma_test_support.expect_error(
  'select private.bootstrap_profile()', '42501',
  'A browser cannot invoke the Auth bootstrap helper'
);
-- SET ROLE checks session_user's privileges. The local connection started as
-- postgres, so change the session identity for this one escalation attempt;
-- merely changing current_role would accidentally retain a superuser's right.
reset role;
set session authorization authenticated;
select aroma_test_support.expect_error(
  'set role aro_api_executor', '42501',
  'A browser cannot SET ROLE to the RPC executor'
);
reset session authorization;
set local role authenticated;
select aroma_test_support.expect_error(
  'select api.update_profile('''', ''Fixture'', ''987654321'')', '22023',
  'Profile RPC rejects an empty required name'
);
select aroma_test_support.ok(
  api.update_profile(' Updated Owner A ', ' Fixture ', '987654321') ->> 'first_name'
    = 'Updated Owner A',
  'Profile write is trimmed and committed to the current owner'
);
select aroma_test_support.ok(
  api.get_address() is null, 'Address starts empty without a fixture fallback'
);
select aroma_test_support.ok(
  api.save_address('Casa', 'Owner A', 'lima', '1501', '150122',
                   'Calle SQL de prueba 123', 'Solo fixture') ->> 'user_id'
    = '10000000-0000-4000-8000-000000000001',
  'Address owner comes from the current identity, not a request argument'
);
select aroma_test_support.expect_error(
  'select api.save_address(''Casa'', ''Owner A'', ''lima'', ''1501'', ''070101'', ''Calle de prueba 123'', '''')',
  '22023', 'Address RPC rejects a district outside the specified province'
);
reset role;

-- Exercise actual RLS with the non-owner/non-bypass execution role.
set local role aro_api_executor;
select aroma_test_support.ok(
  (select count(*) = 1 from app.profiles),
  'RLS restricts executor profile SELECT to the current owner'
);
select aroma_test_support.ok(
  not exists (select 1 from app.profiles
               where user_id = '10000000-0000-4000-8000-000000000002'),
  'Owner A cannot select owner B even through the RLS executor'
);
select aroma_test_support.expect_error(
  'insert into app.profiles(user_id, first_name, last_name, phone) values (''10000000-0000-4000-8000-000000000002'', ''Cross owner'', ''Fixture'', ''987654321'')',
  '42501', 'RLS WITH CHECK rejects another owner on profile INSERT'
);
select aroma_test_support.expect_error(
  'insert into app.addresses(user_id, label, recipient, department, province, district, street, reference) values (''10000000-0000-4000-8000-000000000002'', ''Casa'', ''Owner B'', ''lima'', ''1501'', ''150122'', ''Calle SQL 123'', '''')',
  '42501', 'RLS WITH CHECK rejects another owner on address INSERT'
);
select aroma_test_support.expect_error(
  'update app.addresses set user_id = ''10000000-0000-4000-8000-000000000002''',
  '42501', 'Executor has no privilege to reassign address ownership'
);
update app.profiles set first_name = 'Cross-owner write attempt'
where user_id = '10000000-0000-4000-8000-000000000002';
reset role;
select aroma_test_support.ok(
  (select first_name = '' from app.profiles
    where user_id = '10000000-0000-4000-8000-000000000002'),
  'RLS filters another owner out of profile UPDATE as well as SELECT'
);

-- Switching identity never exposes or changes the previous owner's data.
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select aroma_test_support.ok(
  api.get_profile() ->> 'first_name' = '' and
  api.get_profile() ->> 'user_id' = '10000000-0000-4000-8000-000000000002',
  'Owner B sees its own incomplete profile, never owner A data'
);
select aroma_test_support.ok(
  api.get_address() is null, 'Owner B cannot read owner A address'
);
select api.remove_address();
reset role;
select aroma_test_support.ok(
  (select count(*) = 1 from app.addresses
   where user_id = '10000000-0000-4000-8000-000000000001'),
  'Removing owner B address cannot delete owner A address'
);

-- Membership and assurance must both be current, not inferred from a login UI.
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select aroma_test_support.ok(
  api.current_actor() ->> 'role' = 'admin' and
  (api.current_actor() ->> 'requires_mfa')::boolean,
  'Admin AAL1 is identified but must complete MFA'
);
reset role;
set local role aro_api_executor;
select aroma_test_support.ok(
  not private.is_admin(), 'Admin authorization helper rejects AAL1'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select aroma_test_support.ok(
  api.current_actor() ->> 'role' = 'admin' and
  not (api.current_actor() ->> 'requires_mfa')::boolean,
  'Active admin AAL2 satisfies the current assurance requirement'
);
reset role;
set local role aro_api_executor;
select aroma_test_support.ok(
  private.is_admin(), 'Authorization helper admits active admin AAL2'
);
reset role;
update private.admin_memberships set active = false
  where user_id = '10000000-0000-4000-8000-000000000003';
set local role authenticated;
select aroma_test_support.ok(
  api.current_actor() ->> 'role' = 'customer',
  'Revoking membership takes effect without issuing a new JWT'
);
reset role;
set local role aro_api_executor;
select aroma_test_support.ok(
  not private.is_admin(), 'Revoked admin AAL2 cannot retain authorization'
);
reset role;
update private.admin_memberships set active = true
  where user_id = '10000000-0000-4000-8000-000000000003';

-- Catalog fixtures are local transaction data, not merchant seeds or uploads.
-- Products start as drafts so the complete graph can be validated together.
insert into app.brands (id, name, slug, active) values
  ('20000000-0000-4000-8000-000000000001', 'SQL Fixture Visible', 'sql-fixture-visible', true),
  ('20000000-0000-4000-8000-000000000002', 'SQL Fixture Inactive', 'sql-fixture-inactive', false);
insert into app.media_assets
  (id, object_key, width, height, status, verified_at) values
  ('30000000-0000-4000-8000-000000000001', '/images/sql-fixture-gallery.webp', 1000, 1250, 'ready', now()),
  ('30000000-0000-4000-8000-000000000002', '/images/sql-fixture-olfactory.webp', 1000, 1000, 'ready', now()),
  ('30000000-0000-4000-8000-000000000003', '/images/sql-fixture-pending.webp', 1000, 1250, 'pending', null);
insert into app.products
  (id, slug, name, brand_id, product_type, gender, short_description,
   description, olfactory_media_id, display_rank) values
  ('40000000-0000-4000-8000-000000000001', 'sql-visible-perfume', 'SQL visible perfume',
   '20000000-0000-4000-8000-000000000001', 'perfume', 'unisex',
   'SQL fixture only', 'SQL fixture description only',
   '30000000-0000-4000-8000-000000000002', 1),
  ('40000000-0000-4000-8000-000000000002', 'sql-draft-perfume', 'SQL draft perfume',
   '20000000-0000-4000-8000-000000000001', 'perfume', 'unisex',
   'SQL fixture only', 'SQL fixture description only', null, 2),
  ('40000000-0000-4000-8000-000000000003', 'sql-pending-photo', 'SQL pending photo',
   '20000000-0000-4000-8000-000000000001', 'perfume', 'unisex',
   'SQL fixture only', 'SQL fixture description only', null, 3),
  ('40000000-0000-4000-8000-000000000004', 'sql-sold-out', 'SQL sold out',
   '20000000-0000-4000-8000-000000000001', 'perfume', 'unisex',
   'SQL fixture only', 'SQL fixture description only', null, 4),
  ('40000000-0000-4000-8000-000000000005', 'sql-inactive-brand', 'SQL inactive brand',
   '20000000-0000-4000-8000-000000000002', 'perfume', 'unisex',
   'SQL fixture only', 'SQL fixture description only', null, 5),
  ('40000000-0000-4000-8000-000000000006', 'sql-hidden-complement', 'SQL hidden complement',
   null, 'complemento', null, 'SQL fixture only', 'SQL fixture description only', null, 6);
insert into app.product_variants
  (id, product_id, merchant_sku, ml, label, price_cents, stock) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'SQL-VISIBLE-50', 50, null, 10000, 3),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'SQL-DRAFT-50', 50, null, 10000, 3),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'SQL-PENDING-50', 50, null, 10000, 3),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', 'SQL-OUT-50', 50, null, 10000, 0),
  ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 'SQL-INACTIVE-50', 50, null, 10000, 3),
  ('50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000006', 'SQL-COMPLEMENT', null, 'Travel spray', 2000, 3),
  ('50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001', 'SQL-VISIBLE-100', 100, null, 20000, 0);
insert into app.product_images (product_id, position, media_id)
select id, 0, case when slug = 'sql-pending-photo'
  then '30000000-0000-4000-8000-000000000003'::uuid
  else '30000000-0000-4000-8000-000000000001'::uuid end
from app.products where id in
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000004',
   '40000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000006');
insert into app.product_olfactory_families (product_id, family_code, position) values
  ('40000000-0000-4000-8000-000000000001', 'amaderado', 0),
  ('40000000-0000-4000-8000-000000000001', 'citrico', 1);
insert into app.product_notes (product_id, phase, position, label) values
  ('40000000-0000-4000-8000-000000000001', 'top', 0, 'SQL note fixture');
update app.products set active = true where id in
  ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006');

-- Flush the full graph now; future negative statements must fail immediately.
set constraints all immediate;

select aroma_test_support.ok(
  (select count(distinct product_code) = 6 and bool_and(product_code between 10000 and 99999)
   from app.products),
  'Product codes are unique five-digit integers, separate from merchant SKUs'
);
select aroma_test_support.expect_error(
  'insert into app.brands(name,slug) values (''  SQL FIXTURE VISIBLE  '', ''sql-duplicate-brand'')',
  '23505', 'Normalized brand names reject case and whitespace duplicates'
);
select aroma_test_support.expect_error(
  'insert into app.media_assets(object_key,width,height) values (''data:image/webp;base64,UklGRg=='',100,100)',
  '23514', 'Database media references cannot contain image bytes or data URIs'
);
select aroma_test_support.expect_error(
  'insert into app.media_assets(object_key,width,height,status) values (''/images/sql-unverified.webp'',100,100,''ready'')',
  '23514', 'A ready media reference requires explicit verification'
);
select aroma_test_support.expect_error(
  'update app.product_variants set stock = -1 where id = ''50000000-0000-4000-8000-000000000001''',
  '23514', 'Negative inventory is rejected by PostgreSQL'
);
select aroma_test_support.expect_error(
  'update app.product_variants set price_cents = 0 where id = ''50000000-0000-4000-8000-000000000001''',
  '23514', 'An active published presentation cannot be changed to a zero price'
);
select aroma_test_support.expect_error(
  'update app.products set active = true where id = ''40000000-0000-4000-8000-000000000003''',
  '23514', 'A pending main photograph cannot be published'
);
update app.products set active = true
where id = '40000000-0000-4000-8000-000000000004';
select aroma_test_support.ok(
  (select not active from app.products
    where id = '40000000-0000-4000-8000-000000000004'),
  'The final availability check prevents publishing a sold-out product'
);
select aroma_test_support.expect_error(
  'update app.products set active = true where id = ''40000000-0000-4000-8000-000000000005''',
  '23514', 'A perfume with an inactive brand cannot be published'
);
select aroma_test_support.expect_error(
  'insert into app.product_images(product_id,position,media_id) values (''40000000-0000-4000-8000-000000000001'',4,''30000000-0000-4000-8000-000000000003'')',
  '23514', 'Commercial gallery cannot exceed four ordered positions'
);
select aroma_test_support.expect_error(
  'insert into app.product_olfactory_families(product_id,family_code,position) values (''40000000-0000-4000-8000-000000000006'',''floral'',0)',
  '23514', 'A complement cannot receive an olfactory classification'
);
select aroma_test_support.expect_error(
  'insert into app.product_offers(product_id,enabled,discount_type,value) values (''40000000-0000-4000-8000-000000000001'',true,''percent'',100)',
  '23514', 'A product offer cannot grant an invalid 100 percent reduction'
);
select aroma_test_support.expect_error(
  'insert into app.product_offers(product_id,enabled,discount_type,value) values (''40000000-0000-4000-8000-000000000001'',true,''fixed'',10000)',
  '23514', 'A fixed offer cannot leave any active variant at zero'
);
insert into app.product_offers(product_id,enabled,discount_type,value)
values ('40000000-0000-4000-8000-000000000001', true, 'percent', 10);

select set_config('request.jwt.claims', '{}', true);
set local role anon;
select aroma_test_support.ok(
  (api.catalog_products() ->> 'total')::integer = 1 and
  jsonb_array_length(api.catalog_products() -> 'items') = 1,
  'Anonymous catalog contains only the one published available perfume'
);
select aroma_test_support.ok(
  api.catalog_product('sql-draft-perfume') is null and
  api.catalog_product('sql-pending-photo') is null and
  api.catalog_product('sql-sold-out') is null and
  api.catalog_product('sql-inactive-brand') is null and
  api.catalog_product('sql-hidden-complement') is null,
  'Draft, pending-media, unavailable and disabled-feature products stay private'
);
select aroma_test_support.ok(
  api.catalog_product('sql-visible-perfume') #>> '{product,variants,0,priceCents}' = '10000' and
  api.catalog_product('sql-visible-perfume') #>> '{product,variants,0,finalPriceCents}' = '9000',
  'Public DTO contains the real original and centrally calculated final price'
);
select aroma_test_support.ok(
  api.catalog_product('sql-visible-perfume') #> '{product,olfactoryFamilies}' = '["amaderado","citrico"]'::jsonb,
  'Multiple existing olfactory families retain their selected order'
);
select aroma_test_support.ok(
  jsonb_array_length(api.catalog_product('sql-visible-perfume') #> '{detail,gallery}') = 1 and
  api.catalog_product('sql-visible-perfume') #>> '{detail,olfactoryImage}' = '/images/sql-fixture-olfactory.webp',
  'Olfactory photograph remains independent from the commercial gallery'
);
select aroma_test_support.ok(
  jsonb_array_length(api.catalog_brands()) = 1,
  'Inactive brands do not appear in the public brand list'
);
select aroma_test_support.expect_error(
  'select api.catalog_products(101,0)', '22023',
  'Public catalog requests cannot exceed their bounded page size'
);
select aroma_test_support.expect_error(
  'select * from app.products', '42501',
  'Anonymous has no direct catalog table SELECT privilege'
);
select aroma_test_support.expect_error(
  'update app.product_variants set stock = 999', '42501',
  'Anonymous cannot alter stock using direct SQL'
);
reset role;

-- The publication predicate still applies when the JWT has a protected admin
-- identity: this is a public endpoint, not a hidden administrative download.
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select aroma_test_support.ok(
  (api.catalog_products() ->> 'total')::integer = 1,
  'Public catalog RPC does not expose draft products even to an admin JWT'
);
select aroma_test_support.expect_error(
  'update app.product_variants set price_cents = 1', '42501',
  'Admin browser has no direct price UPDATE grant'
);
select aroma_test_support.expect_error(
  'select nextval(''app.product_code_seq'')', '42501',
  'Admin browser cannot consume the internal product-code sequence'
);
reset role;

-- Feature changes are privileged SQL fixtures, not an application API.
update app.store_settings set complements_enabled = true where singleton;
select set_config('request.jwt.claims', '{}', true);
set local role anon;
select aroma_test_support.ok(
  (api.catalog_products() ->> 'total')::integer = 2 and
  api.catalog_product('sql-hidden-complement') is not null,
  'Complements become public only when the explicit feature flag is enabled'
);
reset role;

update app.product_offers set ends_at = now() - interval '1 second'
where product_id = '40000000-0000-4000-8000-000000000001';
set local role anon;
select aroma_test_support.ok(
  api.catalog_product('sql-visible-perfume') #>> '{product,variants,0,finalPriceCents}' = '10000' and
  api.catalog_product('sql-visible-perfume') #> '{product,discount}' = 'null'::jsonb,
  'Expired offers return the actual regular price without a false discount'
);
reset role;

-- Replacing a presentation is one complete product transaction, not two
-- independent stock events. Intermediate zero stock must not deactivate it.
set constraints all deferred;
delete from app.product_variants
where id = '50000000-0000-4000-8000-000000000001';
select aroma_test_support.ok(
  (select active from app.products
    where id = '40000000-0000-4000-8000-000000000001'),
  'An intermediate variant deletion waits for final transaction availability'
);
insert into app.product_variants
  (id, product_id, merchant_sku, ml, price_cents, stock) values
  ('50000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000001',
   'SQL-REPLACEMENT-50', 50, 10000, 3);
set constraints all immediate;
select aroma_test_support.ok(
  (select active from app.products
    where id = '40000000-0000-4000-8000-000000000001'),
  'A stocked replacement presentation preserves the publication state'
);

update app.product_variants set stock = 0
where product_id = '40000000-0000-4000-8000-000000000001';
set constraints all immediate;
select aroma_test_support.ok(
  (select not active from app.products where id = '40000000-0000-4000-8000-000000000001'),
  'Exhausting active variants deactivates the product in the same transaction'
);
set local role anon;
select aroma_test_support.ok(
  api.catalog_product('sql-visible-perfume') is null,
  'Sold-out products disappear from the public DTO'
);
reset role;
update app.product_variants set stock = 3
where id = '50000000-0000-4000-8000-000000000008';
select aroma_test_support.ok(
  (select not active from app.products where id = '40000000-0000-4000-8000-000000000001'),
  'Restocking does not silently republish a deactivated product'
);

rollback;
