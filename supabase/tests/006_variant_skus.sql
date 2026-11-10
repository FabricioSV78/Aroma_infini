-- Local isolated fixtures only. Never run this sequence reset against hosted data.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Only the isolated local SQL runner may load SKU fixtures.';
  end if;
end $$;
alter sequence app.variant_merchant_sku_seq restart with 1000;
create schema aroma_sku_test;
grant usage on schema aroma_sku_test to anon,authenticated,aro_catalog_admin_executor;
create function aroma_sku_test.ok(p_value boolean,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %',p_label; end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_sku_test.error(p_sql text,p_state text,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
declare v_state text;
begin
  begin execute p_sql;exception when others then get stacked diagnostics v_state=returned_sqlstate;end;
  if v_state is distinct from p_state then raise exception 'FAIL: %, expected %, got %',p_label,p_state,coalesce(v_state,'success');end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_sku_test.record(p_id uuid,p_sku text default null,p_complement boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('product',jsonb_build_object(
    'id',p_id,'name','Temporary SKU fixture','slug','sku-fixture-'||p_id::text,'sku','88888',
    'brandId','62000000-0000-4000-8000-000000000001','productType',case when p_complement then 'complemento' else 'perfume' end,
    'family','','olfactoryFamilies','[]'::jsonb,'image','','discount',null,
    'variants',jsonb_build_array(jsonb_build_object('id',p_id,'sku',p_sku,'ml',case when p_complement then null else 100 end,
      'label',case when p_complement then 'Unidad' else null end,'priceCents',12000,'stock',3,'active',true))),
    'detail',jsonb_build_object('shortDescription','Temporary SQL fixture','description','Temporary SQL fixture without photographs.',
      'olfactoryImage',null,'intensityLevel',null,'occasion','','season','','gallery','[]'::jsonb,
      'notes',jsonb_build_object('top','[]'::jsonb,'heart','[]'::jsonb,'base','[]'::jsonb),'recommendationIds','[]'::jsonb),
    'active',false,'gender',case when p_complement then null else 'unisex' end,'popularity',0,'newest',0,'lowStockThreshold',2);
$$;
grant execute on all functions in schema aroma_sku_test to anon,authenticated,aro_catalog_admin_executor;
insert into auth.users(id,email,raw_user_meta_data) values
 ('61000000-0000-4000-8000-000000000001','sku-admin@example.invalid','{}'),
 ('61000000-0000-4000-8000-000000000002','sku-customer@example.invalid','{"role":"admin"}');
insert into private.admin_memberships(user_id,active) values('61000000-0000-4000-8000-000000000001',true);
insert into app.brands(id,name,slug) values('62000000-0000-4000-8000-000000000001','SKU SQL fixture','sku-sql-fixture');
select aroma_sku_test.ok(not has_sequence_privilege('authenticated','app.variant_merchant_sku_seq','usage')
  and not has_sequence_privilege('anon','app.variant_merchant_sku_seq','usage'),'Browser roles cannot consume presentation SKU sequence');
select aroma_sku_test.ok(not has_function_privilege('authenticated','private.catalog_prepare_variant_skus(jsonb)','execute')
  and not has_function_privilege('anon','private.catalog_next_variant_sku(jsonb)','execute'),'Private SKU helpers are not exposed to browsers');
set local role anon;
select aroma_sku_test.error('select api.admin_save_product(aroma_sku_test.record(''63000000-0000-4000-8000-000000000001''))','42501','Anonymous cannot allocate presentation SKUs');
reset role;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
set local role authenticated;
select aroma_sku_test.error('select api.admin_import_products(jsonb_build_array(aroma_sku_test.record(''63000000-0000-4000-8000-000000000001'')))','42501','Customer cannot allocate batch SKUs');
reset role;
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_sku_test.error('select api.admin_save_product(aroma_sku_test.record(''63000000-0000-4000-8000-000000000001''))','42501','Administrative SKU writes still require MFA');
reset role;
select aroma_sku_test.ok((select not is_called from app.variant_merchant_sku_seq),'Denied requests do not allocate a number');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_sku_test.ok(api.admin_save_product(aroma_sku_test.record('63000000-0000-4000-8000-000000000009'))->'record'->'product'->'variants'->0->>'sku'='1000','The first blank presentation starts automatically at 1000');
select api.admin_delete_product('63000000-0000-4000-8000-000000000009',1);
reset role;
alter sequence app.variant_merchant_sku_seq restart with 1000;
set local role authenticated;
select aroma_sku_test.ok(api.admin_save_product(aroma_sku_test.record('63000000-0000-4000-8000-000000000001','  1000  '))->'record'->'product'->'variants'->0->>'sku'='1000','The manual 1000 is preserved on the 100 ml presentation');
select aroma_sku_test.ok(api.admin_save_product(aroma_sku_test.record('63000000-0000-4000-8000-000000000002'))->'record'->'product'->'variants'->0->>'sku'='1001','A blank presentation skips the registered manual 1000');
select aroma_sku_test.ok(api.admin_save_product(aroma_sku_test.record('63000000-0000-4000-8000-000000000003','  brand-100.ml  '))->'record'->'product'->'variants'->0->>'sku'='BRAND-100.ML','Alphanumeric manual codes keep their supported spelling after normalization');
select aroma_sku_test.ok(api.admin_save_product(aroma_sku_test.record('63000000-0000-4000-8000-000000000001',''),1)->'record'->'product'->'variants'->0->>'sku'='1000','Saving an empty SKU field preserves the existing variant identifier');
select aroma_sku_test.ok(api.admin_save_product((aroma_sku_test.record('63000000-0000-4000-8000-000000000001') #- '{product,variants,0,sku}'),2)->'record'->'product'->'variants'->0->>'sku'='1000','Saving photos or a partial editor payload without SKU does not renumber a variant');
select aroma_sku_test.ok(api.admin_set_stock('63000000-0000-4000-8000-000000000002',8,1)->'record'->'product'->'variants'->0->>'sku'='1001','Inventory changes preserve the commercial SKU');
select aroma_sku_test.error('select api.admin_save_product(aroma_sku_test.record(''63000000-0000-4000-8000-000000000004'',''1000''))','23505','A duplicate manual SKU is rejected without overwriting its owner');
select aroma_sku_test.error('select api.admin_save_product(aroma_sku_test.record(''63000000-0000-4000-8000-000000000004'',''bad code''))','22023','An invalid manual SKU is rejected before allocation');
select aroma_sku_test.error('select api.admin_save_product(aroma_sku_test.record(''63000000-0000-4000-8000-000000000001''),1)','PT409','SKU generation does not bypass product version conflicts');
reset role;
select aroma_sku_test.ok((select merchant_sku='1000' from app.product_variants where id='63000000-0000-4000-8000-000000000001'),'Rejected writes preserve the user supplied SKU');
select aroma_sku_test.ok((select product_code>=10000 and product_code<>1000 from app.products where id='63000000-0000-4000-8000-000000000001'),'The independent internal product code remains unchanged');
set local role authenticated;
select api.admin_delete_product('63000000-0000-4000-8000-000000000001',3);
select api.admin_delete_product('63000000-0000-4000-8000-000000000002',2);
reset role;
-- Isolate a batch that contains a blank before its explicit manual 1000.
alter sequence app.variant_merchant_sku_seq restart with 1000;
set local role authenticated;
select aroma_sku_test.ok(api.admin_import_products(jsonb_build_array(
  aroma_sku_test.record('63000000-0000-4000-8000-000000000004'),
  aroma_sku_test.record('63000000-0000-4000-8000-000000000005','1000')))->'products'->0->'product'->'variants'->0->>'sku'='1001','Import reserves late manual codes before allocating an earlier blank');
reset role;
select aroma_sku_test.ok((select merchant_sku='1000' from app.product_variants where id='63000000-0000-4000-8000-000000000005'),'The later manual import row retains 1000');
set local role authenticated;
select aroma_sku_test.error('select api.admin_import_products(jsonb_build_array(aroma_sku_test.record(''63000000-0000-4000-8000-000000000006'',''SAME''),aroma_sku_test.record(''63000000-0000-4000-8000-000000000007'',''same'')))','23505','Duplicate manual codes in an import reject the complete operation');
reset role;
select aroma_sku_test.ok(not exists(select 1 from app.products where id in('63000000-0000-4000-8000-000000000006','63000000-0000-4000-8000-000000000007')),'Rejected import leaves no partial products');
set local role authenticated;
select aroma_sku_test.ok(api.admin_save_product(aroma_sku_test.record('63000000-0000-4000-8000-000000000006',null,true))->'record'->'product'->'variants'->0->>'sku'='1002','A complement receives a SKU for its own presentation without perfume fields');
select aroma_sku_test.ok(api.admin_save_product(jsonb_set(
  aroma_sku_test.record('63000000-0000-4000-8000-000000000007'),'{product,variants}',
  '[{"id":"63000000-0000-4000-8000-000000000007","ml":50,"priceCents":12000,"stock":2,"active":true},
    {"id":"63000000-0000-4000-8000-000000000008","ml":100,"sku":"PAIR-100","priceCents":18000,"stock":3,"active":true}]'::jsonb))->'record'->'product'->'variants'->0->>'sku'='1003','Two presentations on one perfume receive separate commercial identifiers');
reset role;
select aroma_sku_test.ok((select merchant_sku='PAIR-100' and ml=100 from app.product_variants where id='63000000-0000-4000-8000-000000000008'),'The 100 ml presentation retains its manual SKU independently of the 50 ml automatic SKU');
select aroma_sku_test.ok((select count(*)=count(distinct merchant_sku) and bool_and(merchant_sku is not null)
  from app.product_variants),'Every saved presentation has one unique commercial SKU');
set constraints all immediate;
rollback;
