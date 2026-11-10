-- Local, rollback-only account-favorites contracts; no hosted accounts/catalog.
begin;
do $$ begin if current_setting('aroma.test_mode', true) is distinct from 'local-fixture' then
  raise exception 'Use only the isolated SQL runner.'; end if; end $$;
create schema aroma_favorites_test;
grant usage on schema aroma_favorites_test to anon, authenticated, service_role;
create function aroma_favorites_test.ok(p_value boolean, p_label text)
returns text language plpgsql as $$ begin
  if p_value is distinct from true then raise exception 'FAIL: %', p_label; end if;
  return 'PASS: ' || p_label; end $$;
create function aroma_favorites_test.error(p_sql text, p_state text, p_label text)
returns text language plpgsql as $$ declare v_state text; begin
  begin execute p_sql; exception when others then get stacked diagnostics v_state = returned_sqlstate; end;
  if v_state is distinct from p_state then
    raise exception 'FAIL: %, expected %, got %', p_label, p_state, coalesce(v_state, 'success'); end if;
  return 'PASS: ' || p_label; end $$;
create function aroma_favorites_test.product(p_index integer)
returns uuid language sql immutable as $$ select md5('account-favorite-product-' || p_index)::uuid $$;
grant execute on all functions in schema aroma_favorites_test to anon, authenticated, service_role;

insert into auth.users(id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'favorite-a@example.invalid'),
  ('b1000000-0000-4000-8000-000000000002', 'favorite-b@example.invalid'),
  ('b1000000-0000-4000-8000-000000000003', 'favorite-cap@example.invalid');
insert into app.brands(id, name, slug, active) values
  ('b2000000-0000-4000-8000-000000000001', 'Favorite SQL active', 'favorite-sql-active', true),
  ('b2000000-0000-4000-8000-000000000002', 'Favorite SQL inactive', 'favorite-sql-inactive', false);
insert into app.media_assets(id, storage_kind, object_key, mime_type, width, height,
  status, verified_at, operation_id, purpose, byte_size, sha256)
values ('b5000000-0000-4000-8000-000000000001', 'r2',
  'public/dynamic/b5000000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/800.webp',
  'image/webp', 800, 1000, 'ready', now(), 'b5000000-0000-4000-8000-000000000002',
  'product-gallery', 2000, repeat('a', 64));
insert into app.media_renditions(asset_id, width, height, mime_type, byte_size, sha256, object_key)
  select id, width, height, mime_type, byte_size, sha256, object_key
  from app.media_assets where id = 'b5000000-0000-4000-8000-000000000001';
insert into app.products(id, name, slug, brand_id, short_description, description, active, gender, product_type)
  select aroma_favorites_test.product(n), 'Favorite SQL product ' || n, 'favorite-sql-product-' || n,
    case when n = 5 then 'b2000000-0000-4000-8000-000000000002'::uuid
      else 'b2000000-0000-4000-8000-000000000001'::uuid end,
    'Isolated fixture', 'Isolated fixture', n not in (3, 5, 7),
    case when n = 6 then null else 'unisex' end,
    case when n = 6 then 'complemento' else 'perfume' end
  from generate_series(1, 509) n;
insert into app.product_variants(id, product_id, ml, label, price_cents, stock, active, merchant_sku)
  select md5('account-favorite-variant-' || n)::uuid, aroma_favorites_test.product(n),
    case when n = 6 then null else 50 end, case when n = 6 then 'Travel fixture' else null end,
    12000, case when n = 4 then 0 else 5 end, true, 'FAV-SQL-' || n
  from generate_series(1, 509) n;
insert into app.product_images(product_id, position, media_id)
  select aroma_favorites_test.product(n), 0, 'b5000000-0000-4000-8000-000000000001'
  from generate_series(1, 509) n where n <> 7;
set constraints all immediate; set constraints all deferred;

select aroma_favorites_test.ok((select not (rolcanlogin or rolinherit or rolbypassrls or rolsuper)
  from pg_roles where rolname = 'aro_favorites_executor'), 'Favorites executor has no login, inheritance or RLS bypass');
select aroma_favorites_test.ok(not has_schema_privilege('aro_favorites_executor', 'auth', 'USAGE'),
  'Favorites identity works without managed Auth-schema USAGE');
select aroma_favorites_test.ok(not has_schema_privilege('aro_api_executor', 'private', 'CREATE')
  and not has_schema_privilege('aro_favorites_executor', 'private', 'CREATE')
  and not has_schema_privilege('aro_favorites_executor', 'api', 'CREATE'),
  'Temporary schema CREATE grants are revoked after hosted-safe function ownership transfers');
select aroma_favorites_test.ok(not has_table_privilege('authenticated', 'app.favorite_lists', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'app.customer_favorites', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'app.customer_favorites', 'select,insert,update,delete')
  and not has_table_privilege('service_role', 'app.customer_favorites', 'select,insert,update,delete'),
  'Browser roles and service_role receive no direct favorites CRUD');
select aroma_favorites_test.ok(not has_function_privilege('authenticated', 'private.favorite_product_is_published(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.bump_favorite_list_version()', 'execute'),
  'Internal publication and version helpers cannot be invoked by the browser');
select aroma_favorites_test.ok((select count(*) = 2 and bool_and(prosecdef and proconfig @> array['search_path=""'])
  from pg_proc where oid in ('api.customer_favorites()'::regprocedure, 'api.set_customer_favorite(uuid,boolean,bigint)'::regprocedure)),
  'Both customer RPCs use fixed empty search_path and SECURITY DEFINER');

set local role anon;
select aroma_favorites_test.error('select api.customer_favorites()', '42501', 'Anonymous cannot read account favorites');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(1),true,0)', '42501', 'Anonymous cannot mutate account favorites');
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select aroma_favorites_test.error('select api.customer_favorites()', '42501', 'Missing verified owner claim cannot read favorites');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(1),true,0)', '42501', 'Missing owner claim cannot mutate favorites');
reset role;

select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","aal":"aal1"}', true);
set local role authenticated;
select aroma_favorites_test.ok(api.customer_favorites() = '{"productIds":[],"version":0}', 'New customer starts with an empty canonical version-zero list');
select aroma_favorites_test.error('select * from app.customer_favorites', '42501', 'Authenticated customer cannot select the base favorites table');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(1), true, 0)
  = jsonb_build_object('productIds', jsonb_build_array(aroma_favorites_test.product(1)), 'version', 1),
  'Adding a real published product returns its canonical identity and version');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(1), true, 0)->>'version' = '1',
  'Lost-response desired-state retry does not duplicate a favorite or increment its version');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(2),true,0)', 'PT409',
  'Stale version cannot add a different product');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(1),false,0)', 'PT409',
  'Stale version cannot remove an existing favorite');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(509), false, 0)->>'version' = '1',
  'Removing an absent product is idempotent even with an older version');
select aroma_favorites_test.ok(jsonb_array_length(api.customer_favorites()->'productIds') = 1,
  'Failed stale writes preserve the existing membership');
select aroma_favorites_test.error('select api.set_customer_favorite(null,true,1)', '22023', 'Null product identity is rejected');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(2),null,1)', '22023', 'Null desired state is rejected');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(2),true,null)', '22023', 'Missing expected version is rejected');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(3),true,1)', '22023', 'Inactive products cannot be newly added');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(4),true,1)', '22023', 'Sold-out products cannot be newly added');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(5),true,1)', '22023', 'Products belonging to inactive brands cannot be newly added');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(6),true,1)', '22023', 'Complementos cannot be added while hidden by catalog configuration');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(7),true,1)', '22023', 'Products without a verified main photograph cannot be newly added');
select aroma_favorites_test.error('select api.set_customer_favorite(''b3000000-0000-4000-8000-000000000099'',true,1)', '22023', 'Unknown product identities cannot be added');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(2), true, 1)->>'version' = '2',
  'A subsequent valid add advances the same owner version');
reset role;

select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000002","aal":"aal1"}', true);
set local role authenticated;
select aroma_favorites_test.ok(api.customer_favorites() = '{"productIds":[],"version":0}', 'Customer B cannot see customer A favorites or version');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(1), true, 0)->>'version' = '1',
  'Customer B can independently save the same product');
reset role;
update app.products set active = false where id = aroma_favorites_test.product(1);
update app.product_variants set stock = 0 where product_id = aroma_favorites_test.product(2);
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","aal":"aal1"}', true);
set local role authenticated;
select aroma_favorites_test.ok(jsonb_array_length(api.customer_favorites()->'productIds') = 2,
  'Previously saved hidden and sold-out product identities remain available to remove');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(1), true, 0)->>'version' = '2',
  'Desired-state retry of an already saved hidden product is harmless');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(1), false, 2)->>'version' = '3',
  'A hidden product can still be removed');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(1),true,3)', '22023',
  'Removing a hidden favorite does not permit adding it again');
reset role;
delete from app.products where id = aroma_favorites_test.product(2);
set local role authenticated;
select aroma_favorites_test.ok(api.customer_favorites() = '{"productIds":[],"version":4}',
  'Product deletion cascades membership and advances the original customer version');
reset role;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000002","aal":"aal1"}', true);
set local role authenticated;
select aroma_favorites_test.ok(api.customer_favorites()->>'version' = '1'
  and jsonb_array_length(api.customer_favorites()->'productIds') = 1,
  'Other customer mutations and product removal do not alter customer B list');
reset role;
update app.store_settings set complements_enabled = true where singleton;
set local role authenticated;
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(6), true, 1)->>'version' = '2',
  'Complementos uses the existing publication flag when enabled');
reset role;

-- Seed exactly 500 valid favorites as the isolated database owner to exercise
-- the admission boundary without making 500 repetitive RPC assertions.
insert into app.favorite_lists(user_id) values ('b1000000-0000-4000-8000-000000000003');
insert into app.customer_favorites(user_id, product_id)
  select 'b1000000-0000-4000-8000-000000000003', aroma_favorites_test.product(n)
  from generate_series(8, 507) n;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000003","aal":"aal1"}', true);
set local role authenticated;
select aroma_favorites_test.ok(jsonb_array_length(api.customer_favorites()->'productIds') = 500
  and api.customer_favorites()->>'version' = '500', 'Canonical account list supports the full 500-item limit');
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(508),true,500)', '54000',
  'A 501st favorite is rejected without removing existing products');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(8), true, 0)->>'version' = '500',
  'A desired-state retry is still idempotent at the size limit');
select aroma_favorites_test.ok(api.set_customer_favorite(aroma_favorites_test.product(8), false, 500)->>'version' = '501'
  and api.set_customer_favorite(aroma_favorites_test.product(508), true, 501)->>'version' = '502',
  'Removing one favorite frees capacity for another product');
reset role;
delete from auth.users where id = 'b1000000-0000-4000-8000-000000000003';
select aroma_favorites_test.ok(not exists (select 1 from app.favorite_lists where user_id = 'b1000000-0000-4000-8000-000000000003')
  and not exists (select 1 from app.customer_favorites where user_id = 'b1000000-0000-4000-8000-000000000003'),
  'Deleting Auth identity removes its list and favorites without orphaned private data');
set local role authenticated;
select aroma_favorites_test.error('select api.set_customer_favorite(aroma_favorites_test.product(509),true,0)', '42501',
  'A stale identity deleted from Auth cannot create a new favorites list');
reset role;
select aroma_favorites_test.ok((select count(*) = 2 from app.customer_favorites
  where user_id = 'b1000000-0000-4000-8000-000000000002'), 'Auth deletion leaves the other customer favorites unchanged');
rollback;
