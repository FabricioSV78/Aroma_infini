-- SQL-only, rolled-back fixture. No hosted checkout, customer or payment.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
  raise exception 'Use only the isolated SQL runner'; end if; end $$;
create schema aroma_lifecycle_test;
create function aroma_lifecycle_test.ok(p_value boolean,p_label text) returns text language plpgsql as $$
begin if p_value is distinct from true then raise exception 'FAIL: %',p_label; end if; return 'PASS: '||p_label; end $$;
create function aroma_lifecycle_test.error(p_sql text,p_code text,p_label text) returns text language plpgsql as $$
declare v_code text;
begin begin execute p_sql; exception when others then get stacked diagnostics v_code=returned_sqlstate; end;
  if v_code is distinct from p_code then raise exception 'FAIL: %, expected %, got %',p_label,p_code,v_code; end if;
  return 'PASS: '||p_label;
end $$;
grant usage on schema aroma_lifecycle_test to anon,authenticated,service_role;
grant execute on all functions in schema aroma_lifecycle_test to anon,authenticated,service_role;
insert into auth.users(id,email,raw_user_meta_data) values
 ('bc100000-0000-4000-8000-000000000001','lifecycle-fixture@example.invalid','{}');
insert into private.admin_memberships(user_id,active) values ('bc100000-0000-4000-8000-000000000001',true);
insert into app.brands(id,name,slug) values('bc200000-0000-4000-8000-000000000001','Reservation fixture','lifecycle-fixture');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
 values('bc500000-0000-4000-8000-000000000001','r2','public/dynamic/bc500000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/800.webp',
 'image/webp',800,1000,'ready',now(),'bc500000-0000-4000-8000-000000000002','product-gallery',2000,repeat('a',64));
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
 select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id='bc500000-0000-4000-8000-000000000001';
insert into app.products(id,name,slug,brand_id,short_description,description,active,gender) values
 ('bc300000-0000-4000-8000-000000000001','Reservation fixture','lifecycle-fixture','bc200000-0000-4000-8000-000000000001','SQL only','SQL only',true,'unisex');
insert into app.product_variants(id,product_id,ml,price_cents,stock,active,merchant_sku) values
 ('bc400000-0000-4000-8000-000000000001','bc300000-0000-4000-8000-000000000001',50,12000,1,true,'SQL-RESERVE-1');
insert into app.product_images(product_id,position,media_id) values('bc300000-0000-4000-8000-000000000001',0,'bc500000-0000-4000-8000-000000000001');
insert into app.shipping_settings(singleton,free_threshold_cents,province_shipping_enabled,national_courier_fee_cents,national_estimate)
 values(true,33000,false,2500,'SQL fixture');
insert into app.shipping_zones(id,name,department,province,district,courier_fee_cents,motorizado_fee_cents,estimate,active)
 values('lifecycle-fixture','SQL fixture','lima','1501',null,1000,1500,'SQL fixture',true);
create table aroma_lifecycle_test.saved(key text primary key,value jsonb);
grant select,insert on aroma_lifecycle_test.saved to service_role;
insert into aroma_lifecycle_test.saved values('body',jsonb_build_object(
 'lines','[{"variantId":"bc400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
 'contact',jsonb_build_object('firstName','SQL fixture','lastName','Only','email','reservation@example.invalid','phone','912345678'),
 'address',jsonb_build_object('department','lima','province','1501','district','150131','street','SQL fixture street 123','reference',''),
 'alternateRecipient',null,'deliveryMethod','courier','promotionCode',null,
 'expectedQuoteHash',api.checkout_quote('[{"variantId":"bc400000-0000-4000-8000-000000000001","quantity":1}]','lima','1501','150131','courier')->>'quoteHash'));
set constraints all immediate; set constraints all deferred;
select aroma_lifecycle_test.ok(not has_table_privilege('authenticated','private.order_stock_reservations','select,insert,update,delete')
 and not has_table_privilege('service_role','private.order_stock_reservations','insert,update,delete'),'Reservations have no raw browser or service DML grants');
select aroma_lifecycle_test.ok(not has_function_privilege('anon','private.reservable_stock(uuid)','execute')
 and not has_function_privilege('authenticated','api.expire_stock_reservations(integer)','execute'),'Only projections can expose availability; expiry is server-only');
grant select,insert,update on aroma_lifecycle_test.saved to authenticated;
set local role service_role;
insert into aroma_lifecycle_test.saved values('order',api.create_simulated_order('bc700000-0000-4000-8000-000000000001',repeat('R',43),
 (select value from aroma_lifecycle_test.saved where key='body'),null));
reset role;
insert into aroma_lifecycle_test.saved values('hold-before',(select to_jsonb(r) from private.order_stock_reservations r));
select set_config('request.jwt.claims','{"sub":"bc100000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_lifecycle_test.error('select api.admin_set_order_statuses(jsonb_build_array(jsonb_build_object(''reference'',(select value->''order''->>''reference'' from aroma_lifecycle_test.saved where key=''order''),''expectedVersion'',1)),''cancelled'',''bc800000-0000-4000-8000-000000000001'',false,''individual'')',
 '42501','Cancellation retains the administrative MFA requirement');
reset role;
select set_config('request.jwt.claims','{"sub":"bc100000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_lifecycle_test.saved values('prepare',api.admin_set_order_statuses(
 jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_lifecycle_test.saved where key='order'),'expectedVersion',1)),
 'preparing','bc800000-0000-4000-8000-000000000002',false,'individual'));
select aroma_lifecycle_test.ok((select jsonb_array_length(value->'updated')=1 and value->'orders'->0->>'status'='preparing' from aroma_lifecycle_test.saved where key='prepare'),
 'A live simulated hold can enter preparation without manufacturing a payment');
insert into aroma_lifecycle_test.saved values('cancel',api.admin_set_order_statuses(
 jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_lifecycle_test.saved where key='order'),'expectedVersion',2)),
 'cancelled','bc800000-0000-4000-8000-000000000003',false,'individual'));
select aroma_lifecycle_test.ok((select jsonb_array_length(value->'updated')=1 and value->'orders'->0->>'status'='cancelled' from aroma_lifecycle_test.saved where key='cancel'),
 'Cancellation is an explicit audited terminal state');
select aroma_lifecycle_test.ok(api.admin_set_order_statuses(
 jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_lifecycle_test.saved where key='order'),'expectedVersion',2)),
 'cancelled','bc800000-0000-4000-8000-000000000003',false,'individual')=(select value from aroma_lifecycle_test.saved where key='cancel'),
 'Replaying a cancelled command returns the original committed result');
select aroma_lifecycle_test.ok(jsonb_array_length(api.admin_set_order_statuses(
 jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_lifecycle_test.saved where key='order'),'expectedVersion',3)),
 'cancelled','bc800000-0000-4000-8000-000000000004',false,'individual')->'skipped')=1,
 'A repeated cancellation with another operation is a no-op');
select aroma_lifecycle_test.ok(jsonb_array_length(api.admin_set_order_statuses(
 jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_lifecycle_test.saved where key='order'),'expectedVersion',3)),
 'preparing','bc800000-0000-4000-8000-000000000005',false,'individual')->'errors')=1,
 'Cancelled orders cannot be reopened');
select aroma_lifecycle_test.ok((api.admin_order_list('{"status":"cancelled"}')->>'total')::integer=1,
 'Remote pagination can find cancelled orders');
reset role;
select aroma_lifecycle_test.ok(private.reservable_stock('bc400000-0000-4000-8000-000000000001')=1
 and (select stock=1 from app.product_variants where id='bc400000-0000-4000-8000-000000000001')
 and (select state='released' and closed_at is not null from private.order_stock_reservations),
 'Cancellation releases availability once without incrementing physical inventory');
select aroma_lifecycle_test.ok((select count(*)=2 and count(*) filter(where to_status='cancelled')=1 from app.order_status_history),
 'Replayed and repeated cancellations never duplicate history');

-- An operation retry after cancellation never acquires a replacement hold.
set local role service_role;
select aroma_lifecycle_test.ok(api.create_simulated_order('bc700000-0000-4000-8000-000000000001',repeat('R',43),
 (select value from aroma_lifecycle_test.saved where key='body'),null)->'order'->>'status'='cancelled',
 'Checkout replay returns the cancelled canonical order instead of reserving again');
insert into aroma_lifecycle_test.saved values('second',api.create_simulated_order('bc700000-0000-4000-8000-000000000002',repeat('S',43),
 (select value from aroma_lifecycle_test.saved where key='body'),null));
reset role;
select aroma_lifecycle_test.ok((select count(*)=2 and count(*) filter(where state='active')=1 from private.order_stock_reservations),
 'A released unit can be reserved by another customer exactly once');
update private.order_stock_reservations r set created_at=t.at-interval '16 minutes',expires_at=t.at-interval '1 minute'
 from (select clock_timestamp() at) t where r.state='active';
set local role service_role;
select aroma_lifecycle_test.ok(api.expire_stock_reservations(1)=1 and api.expire_stock_reservations(1)=0,
 'Scheduled expiry is bounded and idempotent');
reset role;
select aroma_lifecycle_test.ok((select status='expired' and version=2 and payment_status='pending' and payment_verified_at is null
 from app.orders where operation_id='bc700000-0000-4000-8000-000000000002'),
 'A due unpaid reservation closes its order without inventing a payment');
select aroma_lifecycle_test.ok((select count(*)=1 and bool_and(actor_id is null and actor_name='Sistema' and source='system' and to_status='expired')
 from app.order_status_history where order_id=(select id from app.orders where operation_id='bc700000-0000-4000-8000-000000000002')),
 'Expiry has one truthful system audit entry without impersonating an administrator');
select aroma_lifecycle_test.ok(private.reservable_stock('bc400000-0000-4000-8000-000000000001')=1
 and (select stock=1 from app.product_variants where id='bc400000-0000-4000-8000-000000000001'),
 'Expiry restores availability exactly once without a physical stock increment');
set local role authenticated;
select aroma_lifecycle_test.ok((api.admin_order_list('{"status":"expired"}')->>'total')::integer=1,
 'Remote pagination can find expired orders');
select aroma_lifecycle_test.ok((api.admin_order_list(jsonb_build_object('references',jsonb_build_array(
 (select value->'order'->>'reference' from aroma_lifecycle_test.saved where key='second'))),1,20,'details')->'orderHistory'->0->'operator')=
 '{"id":null,"name":"Sistema","verified":false}'::jsonb,'Public history projection distinguishes automatic expiry from verified administrators');
select aroma_lifecycle_test.ok(jsonb_array_length(api.admin_set_order_statuses(
 jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_lifecycle_test.saved where key='second'),'expectedVersion',2)),
 'preparing','bc800000-0000-4000-8000-000000000006',false,'individual')->'errors')=1,
 'An expired order cannot resume preparation');
select aroma_lifecycle_test.error('select api.admin_set_order_statuses(''[]'',''expired'',''bc800000-0000-4000-8000-000000000007'',false,''individual'')',
 '22023','Administrators cannot manufacture an automatic expiry command');
reset role;

-- Legacy and already-dispatched records are never reclassified by migration.
insert into app.orders select (jsonb_populate_record(null::app.orders,to_jsonb(o)||jsonb_build_object(
 'id','bc900000-0000-4000-8000-000000000001','operation_id','bc900000-0000-4000-8000-000000000002',
 'reference','AI-SIM-BC900000000040008000000000000001','status','preparing','version',1))).*
 from app.orders o where operation_id='bc700000-0000-4000-8000-000000000001';
set local role service_role;
select aroma_lifecycle_test.ok(api.expire_stock_reservations(100)=0,'Legacy orders without holds are not backfilled or expired');
reset role;
select aroma_lifecycle_test.ok((select status='preparing' and version=1 from app.orders where id='bc900000-0000-4000-8000-000000000001'),
 'Legacy order status is preserved');
select aroma_lifecycle_test.error('update app.orders set status=''received'' where operation_id=''bc700000-0000-4000-8000-000000000002''',
 '22023','Backend invariants prevent reopening expired orders even through another writer');
select aroma_lifecycle_test.ok(not has_function_privilege('authenticated','private.expire_order_stock_reservations(uuid,timestamptz)','execute')
 and not has_function_privilege('service_role','private.expire_order_stock_reservations(uuid,timestamptz)','execute'),
 'Only the bounded server expiry RPC can invoke the private lifecycle helper');
select aroma_lifecycle_test.ok((select bool_and(stock=1) from app.product_variants)
 and (select bool_and(payment_status='pending') from app.orders),'All lifecycle paths preserve physical stock and pending payments');
rollback;
