-- Native disposable PostgreSQL only. No fixture or helper survives this file.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner.';
  end if;
end $$;
-- Function timing is enabled only inside this disposable fixture transaction.
set local track_functions='all';
create schema aroma_atomic_import_test;
grant usage on schema aroma_atomic_import_test to anon,authenticated,aro_catalog_admin_executor;
create function aroma_atomic_import_test.ok(p_value boolean,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %',p_label; end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_atomic_import_test.error(p_sql text,p_state text,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
declare v_state text;
begin
  begin execute p_sql;
  exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
  if v_state is distinct from p_state then
    raise exception 'FAIL: %, expected %, got %',p_label,p_state,coalesce(v_state,'success');
  end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_atomic_import_test.record(p_index integer)
returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object(
  'product',jsonb_build_object(
    'id',('a1210000-0000-4000-8000-'||lpad(p_index::text,12,'0'))::uuid,
    'name','QA-AROMA atomic SQL '||p_index,'slug','qa-aroma-atomic-sql-'||p_index,
    'brandId','a1210000-0000-4000-8000-999999999999',
    'productType','perfume','family','','olfactoryFamilies','[]'::jsonb,
    'image','','discount',null,
    'variants',jsonb_build_array(
      jsonb_build_object('id',('b1210000-0000-4000-8000-'||lpad(p_index::text,12,'0'))::uuid,
        'sku','QA-ATOMIC-'||p_index,'ml',50,'priceCents',10090,'stock',p_index%7,'active',true),
      jsonb_build_object('id',('c1210000-0000-4000-8000-'||lpad(p_index::text,12,'0'))::uuid,
        'sku',null,'ml',100,'priceCents',15050,'stock',p_index%5,'active',true))),
  'detail',jsonb_build_object(
    'shortDescription','Temporary atomic SQL fixture.',
    'description','Disposable SQL fixture, never a hosted commercial product.',
    'olfactoryImage',null,'intensityLevel',null,'occasion','','season','',
    'gallery','[]'::jsonb,'recommendationIds','[]'::jsonb,
    'notes',jsonb_build_object('top','[]'::jsonb,'heart','[]'::jsonb,'base','[]'::jsonb)),
  'active',false,'gender','unisex','popularity',0,'newest',0,'lowStockThreshold',2);
$$;
create function aroma_atomic_import_test.profile_record(p_index integer)
returns jsonb language sql security invoker set search_path='' as $$
select jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
  aroma_atomic_import_test.record(p_index),'{product,family}','"Amaderado"'::jsonb),
  '{product,olfactoryFamilies}','["amaderado"]'::jsonb),
  '{product,variants,1,sku}',to_jsonb('QA-ATOMIC-100-'||p_index)),
  '{detail,notes}','{"top":["Bergamota"],"heart":["Cedro"],"base":["Vetiver"]}'::jsonb),
  '{detail,intensityLevel}','2'::jsonb),
  '{detail,occasion}','"Diario"'::jsonb);
$$;
grant execute on all functions in schema aroma_atomic_import_test to anon,authenticated,aro_catalog_admin_executor;
create table aroma_atomic_import_test.results(label text primary key,payload jsonb,elapsed_ms numeric);
grant select,insert on aroma_atomic_import_test.results to authenticated;
insert into auth.users(id,email,raw_user_meta_data) values
  ('a1210000-0000-4000-8000-999999999991','qa-aroma-atomic-admin@example.invalid','{}'),
  ('a1210000-0000-4000-8000-999999999992','qa-aroma-atomic-customer@example.invalid','{"role":"admin"}');
insert into private.admin_memberships(user_id,active)
  values('a1210000-0000-4000-8000-999999999991',true);
insert into app.brands(id,name,slug)
  values('a1210000-0000-4000-8000-999999999999','QA-AROMA atomic SQL brand','qa-aroma-atomic-sql-brand');

select aroma_atomic_import_test.ok(
  not has_function_privilege('anon','private.catalog_save_product_prepared(jsonb,bigint,boolean)','execute')
  and not has_function_privilege('authenticated','private.catalog_save_product_prepared(jsonb,bigint,boolean)','execute')
  and not has_function_privilege('service_role','private.catalog_save_product_prepared(jsonb,bigint,boolean)','execute'),
  'Prepared import writer is inaccessible to anonymous, browser and service roles');
select aroma_atomic_import_test.ok(
  has_function_privilege('aro_catalog_admin_executor','private.catalog_save_product_prepared(jsonb,bigint,boolean)','execute')
  and (select not prosecdef from pg_proc where oid='private.catalog_save_product_prepared(jsonb,bigint,boolean)'::regprocedure),
  'Prepared writer is an invoker helper reachable only by the reviewed catalog executor');
set local role anon;
select aroma_atomic_import_test.error(
  'select api.admin_import_products(jsonb_build_array(aroma_atomic_import_test.record(1)))','42501',
  'Anonymous cannot invoke optimized imports');
reset role;
select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-999999999992","aal":"aal2"}',true);
set local role authenticated;
select aroma_atomic_import_test.error(
  'select api.admin_import_products(jsonb_build_array(aroma_atomic_import_test.record(1)))','42501',
  'Forged customer metadata cannot invoke optimized imports');
reset role;
select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-999999999991","aal":"aal1"}',true);
set local role authenticated;
select aroma_atomic_import_test.error(
  'select api.admin_import_products(jsonb_build_array(aroma_atomic_import_test.record(1)))','42501',
  'Optimized imports still require an active administrator with MFA');
reset role;
select set_config('request.jwt.claims','{"sub":"a1210000-0000-4000-8000-999999999991","aal":"aal2"}',true);
set local role authenticated;
do $$ declare v_started timestamptz:=clock_timestamp(); v_result jsonb;
begin
  select api.admin_import_products(jsonb_agg(aroma_atomic_import_test.record(i) order by i))
    into v_result from generate_series(1,500) i;
  insert into aroma_atomic_import_test.results values('valid-500',v_result,
    extract(epoch from clock_timestamp()-v_started)*1000);
end $$;
select aroma_atomic_import_test.ok(
  (select jsonb_array_length(payload->'products')=500
    and (select count(*) from jsonb_each(payload->'productVersions'))=500
    from aroma_atomic_import_test.results where label='valid-500'),
  'One atomic command returns 500 canonical products and 500 versions');
select aroma_atomic_import_test.ok(
  (select payload->'products'->0->'product'->>'slug'='qa-aroma-atomic-sql-1'
    and payload->'products'->499->'product'->>'slug'='qa-aroma-atomic-sql-500'
    and not exists(select 1 from jsonb_each(payload->'productVersions') v where v.value<>'1'::jsonb)
    from aroma_atomic_import_test.results where label='valid-500'),
  'Canonical import response preserves reviewed ordering and creation versions');
reset role;
select aroma_atomic_import_test.ok(
  (select count(*)=500 and bool_and(not active) from app.products
    where brand_id='a1210000-0000-4000-8000-999999999999'),
  'All 500 imported products remain unpublished drafts without photographs');
select aroma_atomic_import_test.ok(
  (select count(*)=1000 and count(distinct merchant_sku)=1000 and bool_and(merchant_sku is not null)
    from app.product_variants where product_id in
      (select id from app.products where brand_id='a1210000-0000-4000-8000-999999999999')),
  'The 500-product import persists 1000 distinct presentation SKUs');
select aroma_atomic_import_test.ok(
  (select count(*)=500 and bool_and(v.merchant_sku='QA-ATOMIC-'||i
      and v.price_cents=10090 and v.stock=i%7)
    from generate_series(1,500) i join app.product_variants v
      on v.id=('b1210000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid),
  'Every manual 50 ml SKU, exact-cent price and stock is preserved');
select aroma_atomic_import_test.ok(
  (select count(*)=500 and bool_and(v.merchant_sku~'^[0-9]+$'
      and v.merchant_sku::bigint>=1000 and v.price_cents=15050 and v.stock=i%5)
    from generate_series(1,500) i join app.product_variants v
      on v.id=('c1210000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid),
  'Every blank 100 ml SKU is allocated independently with exact price and stock');
set local role authenticated;
-- SKU preparation accepts this complete payload. Only the final writer sees
-- the invalid final notes structure, after the preceding 499 writes ran.
select aroma_atomic_import_test.error(
  $sql$select api.admin_import_products(jsonb_agg(case when i=1000 then
      jsonb_set(aroma_atomic_import_test.record(i),'{detail,notes,top}','"invalid final notes"'::jsonb)
      else aroma_atomic_import_test.record(i) end order by i)) from generate_series(501,1000) i$sql$,
  '22023','An invalid last record rejects the entire second 500-product import');
reset role;
select aroma_atomic_import_test.ok(
  not exists(select 1 from app.products where id between
    'a1210000-0000-4000-8000-000000000501' and 'a1210000-0000-4000-8000-000000001000')
  and not exists(select 1 from app.product_variants where merchant_sku in
    (select 'QA-ATOMIC-'||i from generate_series(501,1000) i)),
  'No product or presentation from the rejected final-row import survives');
set local role authenticated;
select aroma_atomic_import_test.error(
  'select api.admin_import_products(jsonb_build_array(aroma_atomic_import_test.record(1)))','PT409',
  'Repeating an already committed import cannot overwrite or duplicate products');
select aroma_atomic_import_test.ok(
  api.admin_save_product(aroma_atomic_import_test.record(1),1)->>'version'='2',
  'Individual product editing still passes through the normal validated writer');
reset role;
select aroma_atomic_import_test.ok(
  (select count(*)=500 and min(version)=1 and max(version)=2 from app.products
    where brand_id='a1210000-0000-4000-8000-999999999999'),
  'Rejected retries and the one valid individual edit leave the original 500 rows intact');
select aroma_atomic_import_test.ok(
  (select elapsed_ms>0 from aroma_atomic_import_test.results where label='valid-500'),
  'Native 500-product command duration measured: '||
    (select round(elapsed_ms)::text from aroma_atomic_import_test.results where label='valid-500')||' ms');
-- Profile the actual hosted payload shape as a separate measured command:
-- two explicit SKUs, one existing family, and one note in each of three phases.
insert into aroma_atomic_import_test.results(label,payload)
  select 'profile-before',coalesce(jsonb_agg(jsonb_build_object('id',funcid,'calls',calls,
    'total_ms',total_time,'self_ms',self_time)),'[]'::jsonb)
  from pg_stat_xact_user_functions where schemaname in('api','private','auth');
set local role authenticated;
do $$ declare v_started timestamptz:=clock_timestamp(); v_result jsonb;
begin
  select api.admin_import_products(jsonb_agg(aroma_atomic_import_test.profile_record(i) order by i))
    into v_result from generate_series(1001,1500) i;
  insert into aroma_atomic_import_test.results values('profile-500',v_result,
    extract(epoch from clock_timestamp()-v_started)*1000);
end $$;
reset role;
select aroma_atomic_import_test.ok(
  (select jsonb_array_length(payload->'products')=500
    and not exists(select 1 from jsonb_array_elements(payload->'products') r
      where r->'product'->'olfactoryFamilies'<>'["amaderado"]'::jsonb
        or jsonb_array_length(r->'detail'->'notes'->'top')<>1
        or jsonb_array_length(r->'detail'->'notes'->'heart')<>1
        or jsonb_array_length(r->'detail'->'notes'->'base')<>1)
    from aroma_atomic_import_test.results where label='profile-500'),
  'The hosted-shape 500-product payload retains its family and three note phases');
with previous as (
  select * from jsonb_to_recordset((select payload from aroma_atomic_import_test.results where label='profile-before'))
    as p(id oid,calls bigint,total_ms double precision,self_ms double precision)
), measured as (
  select current.schemaname||'.'||current.funcname as name,
    current.calls-coalesce(previous.calls,0) as calls,
    round((current.total_time-coalesce(previous.total_ms,0))::numeric,3) as total_ms,
    round((current.self_time-coalesce(previous.self_ms,0))::numeric,3) as self_ms
  from pg_stat_xact_user_functions current left join previous on previous.id=current.funcid
  where current.schemaname in('api','private','auth') and current.calls>coalesce(previous.calls,0)
), top_functions as (
  select * from measured order by self_ms desc,name limit 20
)
select aroma_atomic_import_test.ok(true,'LOCAL_ATOMIC_IMPORT_PROFILE '||jsonb_build_object(
  'scope','Disposable local PostgreSQL; native execution only, not hosted latency.',
  'products',500,'variants',1000,'familyPerProduct',1,'notesPerProduct',3,
  'elapsedMs',(select round(elapsed_ms,3) from aroma_atomic_import_test.results where label='profile-500'),
  'topFunctions',(select jsonb_agg(to_jsonb(t) order by t.self_ms desc,t.name) from top_functions t))::text);
set constraints all immediate;
rollback;
