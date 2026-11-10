-- Isolated SQL fixtures only. Every row and helper is rolled back.
begin;
do $$ begin
  if current_setting('aroma.test_mode', true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL test runner.';
  end if;
end $$;
create schema aroma_catalog_test;
grant usage on schema aroma_catalog_test to anon, authenticated, aro_catalog_admin_executor;
create function aroma_catalog_test.ok(p_value boolean, p_label text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %', p_label; end if;
  return 'PASS: ' || p_label;
end $$;
create function aroma_catalog_test.error(p_sql text, p_state text, p_label text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_state text;
begin
  begin execute p_sql;
  exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  if v_state is distinct from p_state then
    raise exception 'FAIL: %, expected %, got %', p_label, p_state, coalesce(v_state, 'success');
  end if;
  return 'PASS: ' || p_label;
end $$;
create function aroma_catalog_test.record(p_id uuid, p_slug text, p_image text default '', p_stock integer default 5)
returns jsonb language sql security invoker set search_path = '' as $$
select pg_catalog.jsonb_build_object(
  'product', pg_catalog.jsonb_build_object(
    'id', p_id, 'name', 'SQL product fixture', 'slug', p_slug, 'sku', '88888',
    'brandId', '42000000-0000-4000-8000-000000000001', 'productType', 'perfume',
    'family', 'Amaderado · fresco', 'olfactoryFamilies', pg_catalog.jsonb_build_array('amaderado', 'fresco'),
    'image', p_image, 'discount', null,
    'variants', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', p_id, 'ml', 50, 'stock', p_stock, 'priceCents', 30000, 'active', true))),
  'detail', pg_catalog.jsonb_build_object('shortDescription', 'Descripción breve de fixture.',
    'description', 'Descripción de prueba SQL que nunca se publica en el entorno alojado.',
    'olfactoryImage', null, 'notes', pg_catalog.jsonb_build_object('top', '[]'::jsonb, 'heart', '[]'::jsonb, 'base', '[]'::jsonb),
    'intensityLevel', 2, 'occasion', 'Diario', 'season', 'Todo el año', 'recommendationIds', '[]'::jsonb,
    'gallery', case when p_image = '' then '[]'::jsonb else pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('image', p_image, 'framing', 'full')) end),
  'active', p_image <> '', 'gender', 'unisex', 'popularity', 1, 'newest', 1, 'lowStockThreshold', 2);
$$;
grant execute on all functions in schema aroma_catalog_test to anon, authenticated, aro_catalog_admin_executor;
insert into auth.users(id, email, raw_user_meta_data) values
  ('41000000-0000-4000-8000-000000000001', 'catalog-admin@example.invalid', '{}'),
  ('41000000-0000-4000-8000-000000000002', 'catalog-customer@example.invalid', '{"role":"admin"}');
insert into private.admin_memberships(user_id, active) values('41000000-0000-4000-8000-000000000001', true);
insert into app.media_assets(id, storage_kind, object_key, mime_type, width, height, status, verified_at)
values('44000000-0000-4000-8000-000000000001', 'local', '/images/sql-catalog-fixture.webp', 'image/webp', 1000, 1000, 'ready', now());

select aroma_catalog_test.ok((select not(rolsuper or rolinherit or rolbypassrls or rolcanlogin or rolcreatedb or rolcreaterole)
  from pg_roles where rolname = 'aro_catalog_admin_executor'), 'Catalog executor has no login or RLS bypass');
select aroma_catalog_test.ok(not pg_has_role('authenticated', 'aro_catalog_admin_executor', 'member')
  and not pg_has_role('anon', 'aro_catalog_admin_executor', 'member'), 'Browser roles cannot become catalog executor');
select aroma_catalog_test.ok(not has_table_privilege('authenticated', 'app.products', 'insert')
  and not has_table_privilege('anon', 'app.products', 'select'), 'Browser still has no direct catalog CRUD');
select aroma_catalog_test.ok(not has_table_privilege('aro_catalog_admin_executor', 'app.media_assets', 'insert')
  and not has_table_privilege('aro_catalog_admin_executor', 'app.media_assets', 'update'), 'Product commands cannot verify or invent media');
select aroma_catalog_test.ok(not has_function_privilege('authenticated', 'private.admin_product_document(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.catalog_write_offer(uuid,jsonb)', 'execute'), 'Private catalog helpers stay non-callable');
set local role anon;
select aroma_catalog_test.error('select api.admin_catalog_page()', '42501', 'Anonymous cannot read administrative catalog');
select aroma_catalog_test.error('select api.admin_register_brands(''["Forbidden"]''::jsonb)', '42501', 'Anonymous cannot register brands');
select aroma_catalog_test.ok(api.catalog_settings()->'features'->>'complementsEnabled' = 'false', 'Public settings expose disabled complements only');
reset role;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000002","aal":"aal2"}', true);
set local role authenticated;
select aroma_catalog_test.error('select api.admin_catalog_page()', '42501', 'Customer metadata does not grant administrative catalog access');
select aroma_catalog_test.error('select api.admin_save_features(true,1)', '42501', 'Customer cannot enable complements');
reset role;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000001","aal":"aal1"}', true);
set local role authenticated;
select aroma_catalog_test.error('select api.admin_register_brands(''["Forbidden"]''::jsonb)', '42501', 'Administrative commands require AAL2');
reset role;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000001","aal":"aal2"}', true);
set local role authenticated;
select aroma_catalog_test.ok(api.admin_save_brand('{"id":"42000000-0000-4000-8000-000000000001","name":"  SQL  Brand ","slug":"sql-brand","active":true}'::jsonb)->'record'->>'name' = 'SQL Brand', 'Save brand normalizes spacing without replacing spelling');
select aroma_catalog_test.ok(api.admin_register_brands('["Dior Fixture", "  DIOR  fixture ", "Déjà Fixture", "Deja Fixture", "A&B Fixture", "A B Fixture", "!!!", 123]'::jsonb)->'created'->4 is null,
  'Batch brands omit duplicate names and invalid entries');
select aroma_catalog_test.ok(pg_catalog.jsonb_array_length(api.admin_catalog_page()->'brands') = 5, 'Batch saves exactly four new valid brands');
select aroma_catalog_test.ok((select count(*) = 1 from pg_catalog.jsonb_array_elements(api.admin_catalog_page()->'brands') b where b->>'slug' = 'a-b-fixture-2'), 'Slug collisions receive unique suffixes');
select aroma_catalog_test.ok(api.admin_register_brands('["Dior Fixture","!!!"]'::jsonb)->'existing'->>0 = 'Dior Fixture', 'Batch reports existing brand instead of overwriting');
select aroma_catalog_test.error('select api.admin_save_brand(''{"id":"42000000-0000-4000-8000-000000000001","name":"Wrong","slug":"wrong","active":true}'', 9)', 'PT409', 'Stale brand version is rejected');
select aroma_catalog_test.error('select api.admin_save_brand(''{"id":"42000000-0000-4000-8000-000000000001","name":"Wrong","slug":"wrong","active":true}'', null)', 'PT409', 'Create retry cannot overwrite an existing brand');
select aroma_catalog_test.ok(api.admin_save_product(aroma_catalog_test.record('43000000-0000-4000-8000-000000000001','sql-catalog-published','/images/sql-catalog-fixture.webp'))->'record'->'product'->>'sku' <> '88888', 'Product SKU comes from server sequence');
select aroma_catalog_test.ok(api.admin_save_product(aroma_catalog_test.record('43000000-0000-4000-8000-000000000002','sql-catalog-draft'))->'record'->>'active' = 'false', 'Image-free draft is saved without inventing photography');
select aroma_catalog_test.ok(pg_catalog.jsonb_array_length(api.admin_catalog_page()->'products') = 2, 'Admin sees published products and image-free drafts');
reset role;
insert into app.product_recommendations(product_id, recommended_product_id, position)
  values('43000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000002',0);
set local role authenticated;
select aroma_catalog_test.ok((api.catalog_products()->>'total')::integer = 1 and api.catalog_product('sql-catalog-draft') is null, 'Public RPCs hide drafts even when called with administrator JWT');
select aroma_catalog_test.ok(pg_catalog.jsonb_array_length(api.catalog_product('sql-catalog-published')->'detail'->'recommendationIds') = 0, 'Public recommendations never reveal draft target UUIDs');
select aroma_catalog_test.ok(pg_catalog.jsonb_array_length(api.catalog_product('sql-catalog-published')->'product'->'olfactoryFamilies') = 2, 'Public DTO preserves multiple real families');
select aroma_catalog_test.error('select api.admin_save_brand(''{"id":"42000000-0000-4000-8000-000000000001","name":"SQL Brand","slug":"sql-brand","active":false}'',1)', '22023', 'Visible products must be deactivated explicitly before their brand');
select aroma_catalog_test.ok(api.admin_save_product(pg_catalog.jsonb_set(aroma_catalog_test.record('43000000-0000-4000-8000-000000000002','sql-catalog-draft'),'{detail,recommendationIds}','["43000000-0000-4000-8000-000000000001"]'),1)->>'version' = '2', 'Recommendations stay editable on private drafts');
select aroma_catalog_test.error('select api.admin_save_product(aroma_catalog_test.record(''43000000-0000-4000-8000-000000000001'',''overwrite''))', 'PT409', 'Retry cannot duplicate or overwrite created product');
select aroma_catalog_test.error('select api.admin_save_product(aroma_catalog_test.record(''43000000-0000-4000-8000-000000000002'',''stale''),99)', 'PT409', 'Stale product version rejected');
select aroma_catalog_test.error('select api.admin_save_product(aroma_catalog_test.record(''43000000-0000-4000-8000-000000000003'',''base64'',''data:image/webp;base64,AAAA''))', '22023', 'Product command rejects base64 image bytes');
select aroma_catalog_test.error('select api.admin_save_product(aroma_catalog_test.record(''43000000-0000-4000-8000-000000000003'',''unverified'',''/images/unverified.webp''))', '22023', 'Unknown media reference cannot be declared ready');
select aroma_catalog_test.error('select api.admin_save_product(jsonb_set(aroma_catalog_test.record(''43000000-0000-4000-8000-000000000002'',''foreign-variant''),''{product,variants,0,id}'',''"43000000-0000-4000-8000-000000000001"''),2)', '22023', 'Foreign variant ownership cannot be reassigned');
select aroma_catalog_test.ok(api.admin_save_offer('43000000-0000-4000-8000-000000000001','{"active":true,"type":"percent","value":10,"startsAt":"","endsAt":""}',1)->>'version' = '2', 'Offer save increments product version');
select aroma_catalog_test.ok(api.catalog_product('sql-catalog-published')->'product'->'variants'->0->>'finalPriceCents' = '27000', 'Public price uses authoritative offer calculation');
select aroma_catalog_test.error('select api.admin_save_offer(''43000000-0000-4000-8000-000000000001'',''{"active":true,"type":"fixed","value":30000}'',2)', '23514', 'Fixed discount cannot eliminate whole variant price');
select aroma_catalog_test.ok(api.admin_save_offer('43000000-0000-4000-8000-000000000001','{"active":true,"type":"percent","value":20,"startsAt":"2020-01-01T00:00:00Z","endsAt":"2020-01-02T00:00:00Z"}',2)->>'version' = '3', 'Expired offer remains administrable');
select aroma_catalog_test.ok(api.catalog_product('sql-catalog-published')->'product'->'discount' = 'null'::jsonb, 'Expired offer does not create public discount');
select aroma_catalog_test.ok(api.admin_set_stock('43000000-0000-4000-8000-000000000001',0,3)->'record'->>'active' = 'false', 'Exhausted product auto-deactivates before response');
select aroma_catalog_test.ok((api.catalog_products()->>'total')::integer = 0, 'Exhausted product disappears from storefront');
select aroma_catalog_test.ok(api.admin_set_stock('43000000-0000-4000-8000-000000000001',7,5)->'record'->>'active' = 'false', 'Restock never republishes implicitly');
select aroma_catalog_test.error('select api.admin_set_stock(''43000000-0000-4000-8000-000000000001'',-1,6)', '22023', 'Negative stock rejected');
select aroma_catalog_test.error('select api.admin_delete_brand(''42000000-0000-4000-8000-000000000001'',1)', '23503', 'Associated brand cannot be deleted');
select aroma_catalog_test.ok(api.admin_save_features(true,1)->'features'->>'complementsEnabled' = 'true', 'Feature toggle is stored remotely');
select aroma_catalog_test.error('select api.admin_save_features(false,1)', 'PT409', 'Settings reject stale version');
select aroma_catalog_test.ok(api.catalog_settings()->'features'->>'complementsEnabled' = 'true', 'Public settings reflect committed feature');
select aroma_catalog_test.ok(api.admin_save_catalog_settings(true,'42000000-0000-4000-8000-000000000001',2)->>'featuredBrandId' = '42000000-0000-4000-8000-000000000001', 'Featured brand is saved with catalog settings version');
select aroma_catalog_test.ok(api.catalog_settings()->>'featuredBrandId' = '42000000-0000-4000-8000-000000000001', 'Public featured shortcut uses confirmed settings');
select aroma_catalog_test.error('select api.admin_save_catalog_settings(false,null,2)', 'PT409', 'Combined catalog settings reject stale version');
select api.admin_save_brand('{"id":"42000000-0000-4000-8000-000000000009","name":"Disabled SQL Fixture","slug":"disabled-sql-fixture","active":false}'::jsonb);
select aroma_catalog_test.error('select api.admin_save_catalog_settings(true,''42000000-0000-4000-8000-000000000009'',3)', '22023', 'Inactive brand cannot be selected as featured');
select aroma_catalog_test.error('select api.admin_import_products(jsonb_build_array(aroma_catalog_test.record(''43000000-0000-4000-8000-000000000004'',''import-one''),aroma_catalog_test.record(''43000000-0000-4000-8000-000000000005'',''import-one'')))', '23505', 'Import rolls back entire operation on duplicate slug');
select aroma_catalog_test.ok((api.admin_catalog_page()->>'total')::integer = 2, 'Rejected import leaves no partially saved products');
select aroma_catalog_test.ok(pg_catalog.jsonb_array_length(api.admin_import_products(jsonb_build_array(aroma_catalog_test.record('43000000-0000-4000-8000-000000000004','import-one'),aroma_catalog_test.record('43000000-0000-4000-8000-000000000005','import-two')))->'products') = 2, 'Valid import saves complete products atomically');
select api.admin_delete_product('43000000-0000-4000-8000-000000000004',1);
select aroma_catalog_test.ok((api.admin_catalog_page()->>'total')::integer = 3, 'Individual delete updates authoritative catalog');
select aroma_catalog_test.error('select api.admin_catalog_page(101,0)', '22023', 'Administrative pages are bounded');
reset role;
update private.admin_memberships set active = false where user_id = '41000000-0000-4000-8000-000000000001';
set local role authenticated;
select aroma_catalog_test.error('select api.admin_catalog_page()', '42501', 'Revoked admin membership immediately denies reads');
select aroma_catalog_test.error('select api.admin_delete_product(''43000000-0000-4000-8000-000000000005'',1)', '42501', 'Revoked admin membership immediately denies writes');
select aroma_catalog_test.error('select api.admin_save_catalog_settings(false,null,3)', '42501', 'Revoked membership cannot edit featured brand settings');
reset role;
-- Force deferred checks while the fixture identities still exist.
set constraints all immediate;
rollback;
