-- Disposable SQL-only fixtures. No real purchases, payment settlement or users.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Only the isolated local SQL runner may load bestseller fixtures';
  end if;
end $$;
create schema aroma_sales_test;
grant usage on schema aroma_sales_test to anon,authenticated,service_role,aro_api_executor;
create function aroma_sales_test.ok(value boolean,label text)
returns text language plpgsql security invoker set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_sales_test.error(statement text,state text,label text)
returns text language plpgsql security invoker set search_path='' as $$
declare actual text;
begin
  begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
  if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;
  return 'PASS: '||label;
end $$;
create function aroma_sales_test.pid(i integer) returns uuid
language sql immutable security invoker set search_path='' as $$
  select ('b1220000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function aroma_sales_test.oid(i integer) returns uuid
language sql immutable security invoker set search_path='' as $$
  select ('e1220000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
create function aroma_sales_test.ids(value jsonb) returns text[]
language sql immutable security invoker set search_path='' as $$
  select coalesce(array_agg(item->'product'->>'id' order by position),'{}'::text[])
    from jsonb_array_elements(value->'items') with ordinality entries(item,position);
$$;
create function aroma_sales_test.order_fixture(i integer,simulated boolean,payment text,verified boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid:=aroma_sales_test.oid(i);
begin
  insert into app.orders(id,reference,operation_id,tracking_hash,request_hash,mode,simulation,payment_status,payment_verified_at,
    first_name,last_name,email,phone,delivery_method,subtotal_cents,product_discount_cents,discount_cents,shipping_cents,total_cents,
    shipping_estimate,department,province,district,street)
  values(result,'QA-SALES-'||i,result,repeat('a',64),repeat('b',64),'guest',simulated,payment,
    case when verified then now() end,'Private person','Never publish','qa-aroma-private-sales@example.invalid','900000000',
    'courier',10000,0,0,0,10000,'SQL fixture only','lima','1501','150131','Private delivery address');
  return result;
end $$;
create function aroma_sales_test.line_fixture(order_number integer,product_number integer,qty integer,size integer default 50)
returns void language plpgsql security invoker set search_path='' as $$
declare v app.product_variants%rowtype;p app.products%rowtype;v_position integer;v_total bigint;
begin
  select * into strict p from app.products where id=aroma_sales_test.pid(product_number);
  select * into strict v from app.product_variants where product_id=p.id and
    (ml=size or (p.product_type='complemento' and ml is null));
  select count(*) into v_position from app.order_items where order_id=aroma_sales_test.oid(order_number);
  insert into app.order_items(order_id,position,product_id,variant_id,product_code,product_slug,image_source,
    product_name,brand_name,ml,variant_label,quantity,unit_price_cents,original_unit_price_cents)
  values(aroma_sales_test.oid(order_number),v_position,p.id,v.id,p.product_code::text,p.slug,'/images/qa-sales.webp',
    p.name,'QA sales fixture',v.ml,v.label,qty,v.price_cents,v.price_cents);
  select sum(quantity*unit_price_cents) into v_total from app.order_items where order_id=aroma_sales_test.oid(order_number);
  update app.orders set subtotal_cents=v_total,total_cents=v_total where id=aroma_sales_test.oid(order_number);
end $$;
grant execute on function aroma_sales_test.ok(boolean,text),aroma_sales_test.error(text,text,text),
  aroma_sales_test.pid(integer),aroma_sales_test.oid(integer),aroma_sales_test.ids(jsonb)
  to anon,authenticated,service_role,aro_api_executor;
revoke all on function aroma_sales_test.order_fixture(integer,boolean,text,boolean),
  aroma_sales_test.line_fixture(integer,integer,integer,integer) from public,anon,authenticated,service_role;

insert into app.brands(id,name,slug,active) values
 ('a1220000-0000-4000-8000-000000000001','QA sales visible','qa-sales-visible',true),
 ('a1220000-0000-4000-8000-000000000002','QA sales hidden','qa-sales-hidden',false);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
values('d1220000-0000-4000-8000-000000000001','local','/images/qa-sales.webp','image/webp',800,1000,'ready',now());
insert into app.products(id,name,slug,brand_id,gender,aromatic_profile,short_description,description,active,display_rank)
select aroma_sales_test.pid(i),'QA-AROMA sales perfume '||i,'qa-aroma-sales-'||i,
 case when i=9 then 'a1220000-0000-4000-8000-000000000002'::uuid else 'a1220000-0000-4000-8000-000000000001'::uuid end,
 'unisex','QA profile','SQL fixture','Temporary ranking fixture',i not in(7,9),i from generate_series(1,9) i;
insert into app.products(id,name,slug,product_type,short_description,description,active,display_rank)
values(aroma_sales_test.pid(10),'QA-AROMA sales complement','qa-aroma-sales-complement','complemento','SQL fixture','SQL fixture',true,0);
insert into app.product_variants(id,product_id,ml,label,price_cents,stock,merchant_sku)
select ('c1220000-0000-4000-8000-'||lpad((i*2+size_position)::text,12,'0'))::uuid,
 aroma_sales_test.pid(i),case when i=10 then null when size_position=0 then 50 else 100 end,
 case when i=10 then 'Unit' end,
 case when i=10 then 500 when i=3 then 900000 else 10000+i*1000+size_position*500 end,
 case when i=8 then 0 else 20 end,'QA-SALES-'||i||'-'||size_position
from generate_series(1,10) i cross join generate_series(0,1) size_position where i<>10 or size_position=0;
insert into app.product_images(product_id,position,media_id)
select id,0,'d1220000-0000-4000-8000-000000000001' from app.products;
update app.store_settings set complements_enabled=true;
set constraints all immediate;
set constraints all deferred;

select aroma_sales_test.ok((select prosecdef and provolatile='s'
    and proowner='aro_commerce_executor'::regrole and proconfig=array['search_path=""']
    from pg_proc where oid='private.catalog_sales_units()'::regprocedure),
  'Sales aggregate retains the restricted stable commerce executor boundary');
select aroma_sales_test.ok(not has_function_privilege('anon','private.catalog_sales_units()','execute')
  and not has_function_privilege('authenticated','private.catalog_sales_units()','execute')
  and not has_function_privilege('service_role','private.catalog_sales_units()','execute')
  and has_function_privilege('aro_api_executor','private.catalog_sales_units()','execute'),
  'Only the internal catalog executor can invoke the private sales aggregate');
select aroma_sales_test.ok(not has_table_privilege('anon','app.orders','select')
  and not has_table_privilege('authenticated','app.order_items','select')
  and not has_table_privilege('aro_api_executor','app.orders','select')
  and not has_table_privilege('aro_api_executor','app.order_items','select'),
  'Public ranking does not grant order or customer-table access');
set local role anon;
select aroma_sales_test.error('select * from private.catalog_sales_units()','42501','Anonymous cannot call private sales aggregates');
select aroma_sales_test.ok(aroma_sales_test.ids(api.catalog_home_context())=array[
  aroma_sales_test.pid(1)::text,aroma_sales_test.pid(2)::text,aroma_sales_test.pid(3)::text,aroma_sales_test.pid(4)::text],
  'Before any sale Home displays four available perfumes in the existing fallback order');
select aroma_sales_test.ok(api.catalog_products(1,0)->'items'->0->'product'->>'productType'='complemento'
  and jsonb_array_length(api.catalog_home_context()->'items')=4,
  'Home filters perfumes before limiting cards even when the first fallback catalog item is an accessory');
reset role;
set local role authenticated;
select aroma_sales_test.error('select * from private.catalog_sales_units()','42501','Authenticated customers cannot call private sales aggregates');
reset role;
set local role service_role;
select aroma_sales_test.error('select * from private.catalog_sales_units()','42501','Server service role cannot invoke the catalog-only sales helper');
reset role;

-- First prove that the deployed commerce boundary was not opened by ranking.
select aroma_sales_test.order_fixture(1,true,'pending',false);
select aroma_sales_test.line_fixture(1,1,999);
update app.orders set status='delivered' where id=aroma_sales_test.oid(1);
select aroma_sales_test.error('update app.orders set simulation=false,payment_status=''approved'',payment_verified_at=now() where id=aroma_sales_test.oid(1)',
  '23514','Ranking migration preserves the current simulation/pending-only payment constraints');
set local role anon;
select aroma_sales_test.ok(api.catalog_home_context()->'items'->0->'product'->>'id'=aroma_sales_test.pid(1)::text,
  'A delivered pending-payment simulation cannot displace the initial fallback selection');
reset role;

-- As in the push fixture, emulate the FUTURE provider migration only inside
-- this disposable transaction. ROLLBACK restores these original CHECKs.
alter table app.orders drop constraint orders_simulation_check;
alter table app.orders drop constraint orders_payment_status_check;
select aroma_sales_test.order_fixture(2,false,'approved',true);
select aroma_sales_test.line_fixture(2,5,2,50);
select aroma_sales_test.line_fixture(2,5,5,100);
set local role anon;
select aroma_sales_test.ok(aroma_sales_test.ids(api.catalog_home_context())=array[
  aroma_sales_test.pid(5)::text,aroma_sales_test.pid(1)::text,aroma_sales_test.pid(2)::text,aroma_sales_test.pid(3)::text],
  'One perfume with confirmed sales comes first and unsold fallback perfumes fill the remaining cards');
reset role;
set local role aro_api_executor;
select aroma_sales_test.ok((select units=7 from private.catalog_sales_units() where product_id=aroma_sales_test.pid(5)),
  'Quantities across 50 ml and 100 ml presentations aggregate to their perfume');
reset role;
select aroma_sales_test.order_fixture(3,false,'approved',true);
select aroma_sales_test.line_fixture(3,4,4);
select aroma_sales_test.order_fixture(4,false,'approved',true);
select aroma_sales_test.line_fixture(4,6,2);
select aroma_sales_test.order_fixture(5,false,'approved',true);
select aroma_sales_test.line_fixture(5,6,1);
select aroma_sales_test.order_fixture(6,false,'approved',true);
select aroma_sales_test.line_fixture(6,3,1);
select aroma_sales_test.order_fixture(7,false,'approved',true);
select aroma_sales_test.line_fixture(7,10,20);
select aroma_sales_test.order_fixture(8,false,'approved',true);
select aroma_sales_test.line_fixture(8,7,900);
select aroma_sales_test.order_fixture(9,false,'approved',true);
select aroma_sales_test.line_fixture(9,8,800);
select aroma_sales_test.order_fixture(10,false,'approved',true);
select aroma_sales_test.line_fixture(10,9,700);
-- Higher quantities in states which are not confirmed commercial payments.
select aroma_sales_test.order_fixture(11,false,'approved',false);
select aroma_sales_test.line_fixture(11,1,999);
select aroma_sales_test.order_fixture(12,false,'pending',false);
select aroma_sales_test.line_fixture(12,1,999);
select aroma_sales_test.order_fixture(13,false,'rejected',false);
select aroma_sales_test.line_fixture(13,1,999);
select aroma_sales_test.order_fixture(14,false,'refunded',false);
select aroma_sales_test.line_fixture(14,1,999);
select aroma_sales_test.order_fixture(15,true,'approved',false);
select aroma_sales_test.line_fixture(15,1,999);
select aroma_sales_test.error('update app.orders set payment_verified_at=now() where id=aroma_sales_test.oid(15)',
  '23514','A simulated order cannot carry a verified-payment timestamp');
set local role aro_api_executor;
select aroma_sales_test.ok(not exists(select 1 from private.catalog_sales_units() where product_id=aroma_sales_test.pid(1)),
  'Pending, rejected, refunded, unverified and simulated orders contribute no sold units');
reset role;
set local role anon;
select aroma_sales_test.ok(aroma_sales_test.ids(api.catalog_home_context())=array[
  aroma_sales_test.pid(5)::text,aroma_sales_test.pid(4)::text,aroma_sales_test.pid(6)::text,aroma_sales_test.pid(3)::text],
  'Home ranks available perfumes by sold units rather than revenue, number of orders or manual display rank');
select aroma_sales_test.ok(aroma_sales_test.ids(api.catalog_home_context())=
  aroma_sales_test.ids(api.catalog_browse('{"productTypes":["perfume"],"order":"mas-vendidos"}',4)),
  'Home and the perfume catalog use exactly the same bestseller ordering');
select aroma_sales_test.ok(api.catalog_products(1,0)->'items'->0->'product'->>'id'=aroma_sales_test.pid(10)::text
  and api.catalog_browse()->'items'->0->'product'->>'id'=aroma_sales_test.pid(10)::text,
  'The general catalog still includes an enabled bestselling accessory while Home remains perfume-only');
select aroma_sales_test.ok(aroma_sales_test.ids(api.catalog_browse('{"productTypes":["perfume"],"order":"mas-vendidos","page":1}',2))=
    array[aroma_sales_test.pid(5)::text,aroma_sales_test.pid(4)::text]
  and aroma_sales_test.ids(api.catalog_browse('{"productTypes":["perfume"],"order":"mas-vendidos","page":2}',2))=
    array[aroma_sales_test.pid(6)::text,aroma_sales_test.pid(3)::text],
  'Bestseller pagination remains deterministic across pages with no duplicated perfumes');
select aroma_sales_test.ok(api.catalog_browse('{"productTypes":["perfume"],"order":"precio-asc"}')->'items'->0->'product'->>'id'=aroma_sales_test.pid(1)::text
  and api.catalog_browse('{"productTypes":["perfume"],"order":"precio-desc"}')->'items'->0->'product'->>'id'=aroma_sales_test.pid(3)::text,
  'Explicit ascending and descending price orders ignore the bestseller score');
select aroma_sales_test.ok(api.catalog_home_context()::text not like '%qa-aroma-private-sales@example.invalid%'
  and api.catalog_home_context()::text not like '%Private person%'
  and api.catalog_home_context()::text not like '%tracking_hash%'
  and api.catalog_home_context()::text not like '%payment_verified_at%',
  'Public Home DTOs disclose no order identities, customer information or payment fields');
reset role;

-- Aggregate reads reflect corrections without duplicated event counters.
update app.order_items set quantity=7 where order_id=aroma_sales_test.oid(3);
set local role anon;
select aroma_sales_test.ok(api.catalog_home_context()->'items'->0->'product'->>'id'=aroma_sales_test.pid(4)::text,
  'Equal sales fall back to the existing display order');
reset role;
update app.products set display_rank=4 where id=aroma_sales_test.pid(5);
set local role anon;
select aroma_sales_test.ok(api.catalog_home_context()->'items'->0->'product'->>'id'=aroma_sales_test.pid(4)::text,
  'Equal sales and equal display rank have a stable UUID tie-breaker');
reset role;
update app.orders set payment_status='refunded',payment_verified_at=null where id=aroma_sales_test.oid(2);
set local role aro_api_executor;
select aroma_sales_test.ok(not exists(select 1 from private.catalog_sales_units() where product_id=aroma_sales_test.pid(5)),
  'A refunded payment immediately stops contributing units to the sales aggregate');
reset role;
set local role anon;
select aroma_sales_test.ok(aroma_sales_test.ids(api.catalog_home_context())=array[
  aroma_sales_test.pid(4)::text,aroma_sales_test.pid(6)::text,aroma_sales_test.pid(3)::text,aroma_sales_test.pid(1)::text],
  'After a refund the next sold perfume and the unsold fallback fill the ranking');
reset role;
update app.orders set payment_status='approved',payment_verified_at=now() where id=aroma_sales_test.oid(2);
update app.orders set payment_status='approved',payment_verified_at=now() where id=aroma_sales_test.oid(2);
set local role aro_api_executor;
select aroma_sales_test.ok((select units=7 from private.catalog_sales_units() where product_id=aroma_sales_test.pid(5)),
  'Repeated provider-state updates cannot double-count the same order lines');
reset role;
delete from app.orders where id=aroma_sales_test.oid(2);
set local role aro_api_executor;
select aroma_sales_test.ok(not exists(select 1 from private.catalog_sales_units() where product_id=aroma_sales_test.pid(5)),
  'Removing an isolated historical order leaves no stale accumulated sales');
reset role;
update app.product_variants set stock=0 where product_id=aroma_sales_test.pid(4);
set constraints all immediate;
set constraints all deferred;
set local role anon;
select aroma_sales_test.ok(not (aroma_sales_test.pid(4)::text=any(aroma_sales_test.ids(api.catalog_home_context()))),
  'An exhausted bestseller disappears under the existing product-publication rules');
reset role;
update app.product_variants set stock=20 where product_id=aroma_sales_test.pid(4);
set constraints all immediate;
set constraints all deferred;
set local role anon;
select aroma_sales_test.ok(not (aroma_sales_test.pid(4)::text=any(aroma_sales_test.ids(api.catalog_home_context()))),
  'Restocking does not silently republish an automatically disabled bestseller');
reset role;
update app.products set active=true where id=aroma_sales_test.pid(4);
set constraints all immediate;
set local role authenticated;
select aroma_sales_test.ok(api.catalog_home_context()->'items'->0->'product'->>'id'=aroma_sales_test.pid(4)::text,
  'Explicit publication restores the bestselling perfume for signed-in public readers too');
reset role;
-- Native statement-local execution counters: explicit price sorting must not
-- pay for the private sales aggregate; bestseller browsing calls it just once.
-- No authorization or public-data cache is introduced by this measurement.
set local track_functions='all';
create temporary table qa_sales_function_counts(initial_calls bigint,price_calls bigint,bestseller_calls bigint);
insert into qa_sales_function_counts(initial_calls)
select coalesce(sum(calls),0) from pg_stat_xact_user_functions
  where funcid='private.catalog_sales_units()'::regprocedure;
do $$ begin
  perform api.catalog_browse('{"order":"precio-asc"}',4);
  perform api.catalog_browse('{"order":"precio-desc"}',4);
end $$;
update qa_sales_function_counts set price_calls=(
  select coalesce(sum(calls),0) from pg_stat_xact_user_functions
    where funcid='private.catalog_sales_units()'::regprocedure)-initial_calls;
select aroma_sales_test.ok(price_calls=0,
  'Both explicit price orders execute zero private sales aggregations') from qa_sales_function_counts;
do $$ begin perform api.catalog_browse('{"order":"mas-vendidos"}',4);end $$;
update qa_sales_function_counts set bestseller_calls=(
  select coalesce(sum(calls),0) from pg_stat_xact_user_functions
    where funcid='private.catalog_sales_units()'::regprocedure)-initial_calls-price_calls;
select aroma_sales_test.ok(bestseller_calls=1,
  'Bestseller browse executes its sales aggregate once rather than once per candidate or card') from qa_sales_function_counts;
rollback;
