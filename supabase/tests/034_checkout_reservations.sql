-- SQL-only, rolled-back fixture. No hosted checkout, customer or payment.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
  raise exception 'Use only the isolated SQL runner'; end if; end $$;
create schema aroma_reservation_test;
create function aroma_reservation_test.ok(p_value boolean,p_label text) returns text language plpgsql as $$
begin if p_value is distinct from true then raise exception 'FAIL: %',p_label; end if; return 'PASS: '||p_label; end $$;
create function aroma_reservation_test.error(p_sql text,p_code text,p_label text) returns text language plpgsql as $$
declare v_code text;
begin begin execute p_sql; exception when others then get stacked diagnostics v_code=returned_sqlstate; end;
  if v_code is distinct from p_code then raise exception 'FAIL: %, expected %, got %',p_label,p_code,v_code; end if;
  return 'PASS: '||p_label;
end $$;
grant usage on schema aroma_reservation_test to anon,authenticated,service_role;
grant execute on all functions in schema aroma_reservation_test to anon,authenticated,service_role;
insert into auth.users(id,email,raw_user_meta_data) values
 ('bb100000-0000-4000-8000-000000000001','reservation-fixture@example.invalid','{}');
insert into private.admin_memberships(user_id,active) values ('bb100000-0000-4000-8000-000000000001',true);
insert into app.brands(id,name,slug) values('bb200000-0000-4000-8000-000000000001','Reservation fixture','reservation-fixture');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
 values('bb500000-0000-4000-8000-000000000001','r2','public/dynamic/bb500000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/800.webp',
 'image/webp',800,1000,'ready',now(),'bb500000-0000-4000-8000-000000000002','product-gallery',2000,repeat('a',64));
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
 select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id='bb500000-0000-4000-8000-000000000001';
insert into app.products(id,name,slug,brand_id,short_description,description,active,gender) values
 ('bb300000-0000-4000-8000-000000000001','Reservation fixture','reservation-fixture','bb200000-0000-4000-8000-000000000001','SQL only','SQL only',true,'unisex');
insert into app.product_variants(id,product_id,ml,price_cents,stock,active,merchant_sku) values
 ('bb400000-0000-4000-8000-000000000001','bb300000-0000-4000-8000-000000000001',50,12000,1,true,'SQL-RESERVE-1');
insert into app.product_images(product_id,position,media_id) values('bb300000-0000-4000-8000-000000000001',0,'bb500000-0000-4000-8000-000000000001');
insert into app.shipping_settings(singleton,free_threshold_cents,province_shipping_enabled,national_courier_fee_cents,national_estimate)
 values(true,33000,false,2500,'SQL fixture');
insert into app.shipping_zones(id,name,department,province,district,courier_fee_cents,motorizado_fee_cents,estimate,active)
 values('reservation-fixture','SQL fixture','lima','1501',null,1000,1500,'SQL fixture',true);
create table aroma_reservation_test.saved(key text primary key,value jsonb);
grant select,insert on aroma_reservation_test.saved to service_role;
insert into aroma_reservation_test.saved values('body',jsonb_build_object(
 'lines','[{"variantId":"bb400000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
 'contact',jsonb_build_object('firstName','SQL fixture','lastName','Only','email','reservation@example.invalid','phone','912345678'),
 'address',jsonb_build_object('department','lima','province','1501','district','150131','street','SQL fixture street 123','reference',''),
 'alternateRecipient',null,'deliveryMethod','courier','promotionCode',null,
 'expectedQuoteHash',api.checkout_quote('[{"variantId":"bb400000-0000-4000-8000-000000000001","quantity":1}]','lima','1501','150131','courier')->>'quoteHash'));
set constraints all immediate; set constraints all deferred;
select aroma_reservation_test.ok(not has_table_privilege('authenticated','private.order_stock_reservations','select,insert,update,delete')
 and not has_table_privilege('service_role','private.order_stock_reservations','insert,update,delete'),'Reservations have no raw browser or service DML grants');
select aroma_reservation_test.ok(not has_function_privilege('anon','private.reservable_stock(uuid)','execute')
 and not has_function_privilege('authenticated','api.expire_stock_reservations(integer)','execute'),'Only projections can expose availability; expiry is server-only');
set local role service_role;
insert into aroma_reservation_test.saved values('order',api.create_simulated_order('bb700000-0000-4000-8000-000000000001',repeat('R',43),
 (select value from aroma_reservation_test.saved where key='body'),null));
select aroma_reservation_test.ok(api.create_simulated_order('bb700000-0000-4000-8000-000000000001',repeat('R',43),
 (select value from aroma_reservation_test.saved where key='body'),null)=(select value from aroma_reservation_test.saved where key='order'),
 'Retries return the same committed order without extending or duplicating a hold');
select aroma_reservation_test.error('select api.create_simulated_order(''bb700000-0000-4000-8000-000000000002'',repeat(''S'',43),(select value from aroma_reservation_test.saved where key=''body''),null)',
 '22023','A competing customer cannot acquire the last held unit');
reset role;
select aroma_reservation_test.ok((select count(*)=1 and bool_and(quantity=1 and state='active' and expires_at-created_at=interval '15 minutes') from private.order_stock_reservations),
 'One successful checkout creates exactly one fifteen-minute hold');
select aroma_reservation_test.ok(private.reservable_stock('bb400000-0000-4000-8000-000000000001')=0
 and (select stock=1 from app.product_variants where id='bb400000-0000-4000-8000-000000000001'),
 'Reservation changes availability, never physical inventory');
select aroma_reservation_test.ok((select payment_status='pending' and payment_verified_at is null from app.orders where operation_id='bb700000-0000-4000-8000-000000000001'),
 'A reservation never manufactures an approved payment');
select aroma_reservation_test.error('do $test$ begin update app.product_variants set stock=0 where id=''bb400000-0000-4000-8000-000000000001''; set constraints all immediate; end $test$',
 'PT409','Administrative stock reductions cannot invalidate live holds');
set constraints all immediate; set constraints all deferred;
set local role anon;
select aroma_reservation_test.ok(jsonb_array_length(api.catalog_browse('{}',12)->'items')=0,'Catalog hides a product whose last unit is held');
reset role;
update private.order_stock_reservations r set created_at=t.at-interval '16 minutes',expires_at=t.at-interval '1 minute'
 from (select clock_timestamp() at) t;
select aroma_reservation_test.ok(private.reservable_stock('bb400000-0000-4000-8000-000000000001')=1,
 'Availability returns at the deadline even before the scheduled cleanup');
set local role anon;
select aroma_reservation_test.ok(jsonb_array_length(api.catalog_browse('{}',12)->'items')=1,'Expired holds restore catalog visibility without toggling merchant visibility');
select aroma_reservation_test.error('select api.expire_stock_reservations(100)','42501','Anonymous callers cannot trigger scheduled maintenance');
reset role;
set local role service_role;
select aroma_reservation_test.error('select api.expire_stock_reservations(101)','22023','Scheduled sweeps enforce a bounded batch');
select aroma_reservation_test.error('select api.expire_stock_reservations(null)','22023','An omitted cleanup bound cannot turn into an unbounded scan');
select aroma_reservation_test.ok(api.expire_stock_reservations(1)=1 and api.expire_stock_reservations(1)=0,
 'The backend expiry operation is bounded and idempotent');
insert into aroma_reservation_test.saved values('second',api.create_simulated_order('bb700000-0000-4000-8000-000000000002',repeat('S',43),
 (select value from aroma_reservation_test.saved where key='body'),null));
reset role;
select aroma_reservation_test.ok((select count(*)=2 and count(*) filter(where state='expired')=1 and count(*) filter(where state='active')=1 from private.order_stock_reservations),
 'An expired unit can be reserved again without erasing the audit history');
select aroma_reservation_test.ok((select bool_and(stock=1) from app.product_variants where id='bb400000-0000-4000-8000-000000000001')
 and (select bool_and(payment_status='pending') from app.orders),'Expiry and a subsequent reservation neither deduct stock nor approve a payment');
rollback;
