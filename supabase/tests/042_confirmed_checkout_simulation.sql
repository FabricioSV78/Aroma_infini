-- Isolated transaction only. This fixture never contacts a hosted gateway or charges a payment.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner';
  end if;
end $$;

create schema aroma_confirmed_test;
create function aroma_confirmed_test.ok(value boolean,label text) returns text language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
  return 'PASS: '||label;
end $$;
create function aroma_confirmed_test.error(statement text,expected text,label text) returns text language plpgsql as $$
declare actual text;
begin
  begin execute statement; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
  if actual is distinct from expected then raise exception 'FAIL: %, expected %, got %',label,expected,actual; end if;
  return 'PASS: '||label;
end $$;
grant usage on schema aroma_confirmed_test to anon,authenticated,service_role;
grant execute on all functions in schema aroma_confirmed_test to anon,authenticated,service_role;

insert into auth.users(id,email,raw_user_meta_data) values
 ('e0421000-0000-4000-8000-000000000001','confirmed-order-fixture@example.invalid','{}');
insert into private.admin_memberships(user_id,active) values('e0421000-0000-4000-8000-000000000001',true);
insert into app.brands(id,name,slug) values('e0422000-0000-4000-8000-000000000001','Confirmed SQL fixture','confirmed-sql-fixture');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
 values('e0425000-0000-4000-8000-000000000001','r2',
 'public/dynamic/e0425000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/800.webp',
 'image/webp',800,1000,'ready',now(),'e0425000-0000-4000-8000-000000000002','product-gallery',2000,repeat('a',64));
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
 select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id='e0425000-0000-4000-8000-000000000001';
insert into app.products(id,name,slug,brand_id,short_description,description,active,gender) values
 ('e0423000-0000-4000-8000-000000000001','Confirmed SQL fixture','confirmed-sql-fixture',
 'e0422000-0000-4000-8000-000000000001','SQL fixture only','SQL fixture only',true,'unisex');
insert into app.product_variants(id,product_id,ml,price_cents,stock,active,merchant_sku) values
 ('e0424000-0000-4000-8000-000000000001','e0423000-0000-4000-8000-000000000001',50,12000,3,true,'SQL-CONFIRMED-A'),
 ('e0424000-0000-4000-8000-000000000002','e0423000-0000-4000-8000-000000000001',100,18000,1,true,'SQL-CONFIRMED-B');
insert into app.product_images(product_id,position,media_id)
 values('e0423000-0000-4000-8000-000000000001',0,'e0425000-0000-4000-8000-000000000001');
insert into app.shipping_settings(singleton,free_threshold_cents,province_shipping_enabled,national_courier_fee_cents,national_estimate)
 values(true,33000,false,2500,'SQL fixture');
insert into app.shipping_zones(id,name,department,province,district,courier_fee_cents,motorizado_fee_cents,estimate,active)
 values('confirmed-sql-fixture','SQL fixture','lima','1501',null,1000,1500,'SQL fixture',true);
create table aroma_confirmed_test.saved(key text primary key,value jsonb);
grant select,insert,update on aroma_confirmed_test.saved to authenticated,service_role;
create function aroma_confirmed_test.body(variant uuid,quantity integer) returns jsonb language sql as $$
  select jsonb_build_object(
    'lines',jsonb_build_array(jsonb_build_object('variantId',variant,'quantity',quantity)),
    'contact',jsonb_build_object('firstName','SQL fixture','lastName','Only','email','confirmed@example.invalid','phone','912345678'),
    'address',jsonb_build_object('department','lima','province','1501','district','150131','street','SQL fixture street 123','reference',''),
    'alternateRecipient',null,'deliveryMethod','courier','promotionCode',null,
    'expectedQuoteHash',api.checkout_quote(jsonb_build_array(jsonb_build_object('variantId',variant,'quantity',quantity)),
      'lima','1501','150131','courier')->>'quoteHash');
$$;
create function aroma_confirmed_test.transition(order_key text,target text,version bigint,operation uuid,confirmed boolean default false)
returns jsonb language sql as $$
  select api.admin_set_order_statuses(jsonb_build_array(jsonb_build_object(
    'reference',(select value->'order'->>'reference' from aroma_confirmed_test.saved where key=order_key),'expectedVersion',version)),
    target,operation,confirmed,'individual');
$$;
grant execute on function aroma_confirmed_test.body(uuid,integer),aroma_confirmed_test.transition(text,text,bigint,uuid,boolean)
  to authenticated,service_role;
set constraints all immediate; set constraints all deferred;

select aroma_confirmed_test.ok(has_function_privilege('service_role','api.create_confirmed_simulated_order(uuid,text,jsonb,uuid)','execute')
  and not has_function_privilege('anon','api.create_confirmed_simulated_order(uuid,text,jsonb,uuid)','execute')
  and not has_function_privilege('authenticated','api.create_confirmed_simulated_order(uuid,text,jsonb,uuid)','execute'),
  'Only the server can create confirmed test orders; browser JWTs cannot select this policy');
select aroma_confirmed_test.ok(not has_table_privilege('authenticated','private.order_stock_reservations','select,insert,update,delete')
  and not has_table_privilege('service_role','private.order_stock_reservations','insert,update,delete'),
  'Reservation accounting remains private and cannot be rewritten through browser or raw service DML');
set local role anon;
select aroma_confirmed_test.error('select api.create_confirmed_simulated_order(null,null,null,null)','42501',
  'Anonymous callers cannot invoke confirmed checkout directly');
reset role;
select set_config('request.jwt.claims','{"sub":"e0421000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_confirmed_test.error('select api.create_confirmed_simulated_order(null,null,null,null)','42501',
  'Even an authenticated administrator cannot bypass the Worker checkout boundary');
reset role;

insert into aroma_confirmed_test.saved values('body-main',aroma_confirmed_test.body('e0424000-0000-4000-8000-000000000001',2));
set local role service_role;
insert into aroma_confirmed_test.saved values('main',api.create_confirmed_simulated_order(
 'e0427000-0000-4000-8000-000000000001',repeat('A',43),(select value from aroma_confirmed_test.saved where key='body-main'),null));
select aroma_confirmed_test.ok(api.create_confirmed_simulated_order(
 'e0427000-0000-4000-8000-000000000001',repeat('A',43),(select value from aroma_confirmed_test.saved where key='body-main'),null)
 =(select value from aroma_confirmed_test.saved where key='main'),
 'An exact retry returns the same canonical confirmed order');
select aroma_confirmed_test.error('select api.create_confirmed_simulated_order(''e0427000-0000-4000-8000-000000000001'',repeat(''B'',43),
 (select value from aroma_confirmed_test.saved where key=''body-main''),null)','42501',
 'A different tracking credential cannot reuse another confirmed operation');
select aroma_confirmed_test.error('select api.create_confirmed_simulated_order(''e0427000-0000-4000-8000-000000000001'',repeat(''A'',43),
 (select value||''{"deliveryMethod":"motorizado"}''::jsonb from aroma_confirmed_test.saved where key=''body-main''),null)','PT409',
 'An operation retry cannot replace checkout content');
select aroma_confirmed_test.error('select api.create_confirmed_simulated_order(''e0427000-0000-4000-8000-000000000002'',repeat(''B'',43),
 (select value from aroma_confirmed_test.saved where key=''body-main''),null)','22023',
 'Another checkout cannot consume units already committed by the first order');
-- Check the caller boundary before returning to postgres: no deferred catalog
-- work may require browser/service privileges at the eventual COMMIT.
set constraints all immediate; set constraints all deferred;
reset role;
select aroma_confirmed_test.ok((select count(*)=1 and bool_and(simulation and simulation_confirmed_at is not null
  and payment_status='pending' and payment_verified_at is null and version=1) from app.orders),
  'Test confirmation is a distinct server timestamp and never an approved or verified payment');
select aroma_confirmed_test.ok((select stock=1 and price_cents=12000 from app.product_variants where id='e0424000-0000-4000-8000-000000000001')
  and private.reservable_stock('e0424000-0000-4000-8000-000000000001')=1,
  'Two units are physically consumed exactly once, without double-counting a reservation or changing price');
select aroma_confirmed_test.ok((select count(*)=1 and bool_and(quantity=2 and state='consumed' and closed_at is not null)
  from private.order_stock_reservations),'A confirmed order keeps one terminal consumed inventory record');
select aroma_confirmed_test.ok((select subtotal_cents=24000 and total_cents=25000 and discount_cents=0 from app.orders),
  'Confirmation preserves the authoritative quoted totals and shipping');

-- Move only this isolated fixture beyond the pending-payment deadline. No wall-clock wait.
update private.order_stock_reservations r set created_at=t.at-interval '16 minutes',expires_at=t.at-interval '1 minute'
  from (select clock_timestamp() at) t where r.state='consumed';
set local role service_role;
select aroma_confirmed_test.ok(api.expire_stock_reservations(100)=0,
  'Scheduled expiry ignores confirmed consumption after the fifteen-minute payment window');
reset role;
select set_config('request.jwt.claims','{"sub":"e0421000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_confirmed_test.error('select aroma_confirmed_test.transition(''main'',''preparing'',1,''e0428000-0000-4000-8000-000000000001'')',
  '42501','Confirmed simulations retain the administrative MFA requirement');
reset role;
select set_config('request.jwt.claims','{"sub":"e0421000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_confirmed_test.saved values('main-prepare',aroma_confirmed_test.transition('main','preparing',1,'e0428000-0000-4000-8000-000000000002'));
select aroma_confirmed_test.ok((select jsonb_array_length(value->'updated')=1 from aroma_confirmed_test.saved where key='main-prepare'),
  'A confirmed test order can enter preparation after the old reservation deadline');
select aroma_confirmed_test.ok(jsonb_array_length(aroma_confirmed_test.transition('main','shipped',1,'e0428000-0000-4000-8000-000000000003',true)->'errors')=1,
  'Optimistic versions still reject a stale administrative write');
insert into aroma_confirmed_test.saved values('main-ship',aroma_confirmed_test.transition('main','shipped',2,'e0428000-0000-4000-8000-000000000004',true));
select aroma_confirmed_test.ok((select jsonb_array_length(value->'updated')=1 from aroma_confirmed_test.saved where key='main-ship'),
  'Confirmed stock can be shipped after fifteen minutes without a payment integration');
select aroma_confirmed_test.ok(jsonb_array_length(aroma_confirmed_test.transition('main','delivered',3,'e0428000-0000-4000-8000-000000000005')->'errors')=1,
  'Delivery is never inferred without explicit administrator confirmation');
insert into aroma_confirmed_test.saved values('main-deliver',aroma_confirmed_test.transition('main','delivered',3,'e0428000-0000-4000-8000-000000000006',true));
select aroma_confirmed_test.ok((select jsonb_array_length(value->'updated')=1 from aroma_confirmed_test.saved where key='main-deliver'),
  'The complete received-preparing-shipped-delivered flow has no fulfilment deadline');
reset role;
select aroma_confirmed_test.ok((select status='delivered' and version=4 and payment_status='pending' and payment_verified_at is null
  from app.orders where operation_id='e0427000-0000-4000-8000-000000000001')
  and (select stock=1 from app.product_variants where id='e0424000-0000-4000-8000-000000000001'),
  'Fulfilment does not decrement inventory again or fabricate a payment');
select aroma_confirmed_test.ok((select count(*)=3 from app.order_status_history where order_id=
  (select id from app.orders where operation_id='e0427000-0000-4000-8000-000000000001')),
  'Only successful fulfilment transitions append history');

insert into aroma_confirmed_test.saved values('body-cancel',aroma_confirmed_test.body('e0424000-0000-4000-8000-000000000002',1));
set local role service_role;
insert into aroma_confirmed_test.saved values('cancel',api.create_confirmed_simulated_order(
 'e0427000-0000-4000-8000-000000000003',repeat('C',43),(select value from aroma_confirmed_test.saved where key='body-cancel'),null));
select aroma_confirmed_test.error('select api.create_confirmed_simulated_order(''e0427000-0000-4000-8000-000000000004'',repeat(''D'',43),
 (select value from aroma_confirmed_test.saved where key=''body-cancel''),null)','22023',
 'Exactly one checkout can acquire the final physical unit');
reset role;
select aroma_confirmed_test.ok((select stock=0 from app.product_variants where id='e0424000-0000-4000-8000-000000000002'),
  'Confirming the final unit leaves zero physical inventory, never negative inventory');
set local role authenticated;
select aroma_confirmed_test.ok(jsonb_array_length(aroma_confirmed_test.transition('cancel','preparing',1,'e0428000-0000-4000-8000-000000000007')->'updated')=1,
  'The final-unit order can be prepared before cancellation');
reset role;
update app.products set active=false where id='e0423000-0000-4000-8000-000000000001';
set local role authenticated;
insert into aroma_confirmed_test.saved values('cancelled',aroma_confirmed_test.transition('cancel','cancelled',2,'e0428000-0000-4000-8000-000000000008'));
select aroma_confirmed_test.ok(aroma_confirmed_test.transition('cancel','cancelled',2,'e0428000-0000-4000-8000-000000000008')=
  (select value from aroma_confirmed_test.saved where key='cancelled'),'A retried cancellation returns its canonical result');
select aroma_confirmed_test.ok(jsonb_array_length(aroma_confirmed_test.transition('cancel','cancelled',3,'e0428000-0000-4000-8000-000000000009')->'skipped')=1,
  'A second cancellation operation is a no-op');
reset role;
select aroma_confirmed_test.ok((select stock=1 from app.product_variants where id='e0424000-0000-4000-8000-000000000002')
  and (select state='released' and closed_at is not null from private.order_stock_reservations where variant_id='e0424000-0000-4000-8000-000000000002'),
  'Cancellation returns consumed physical inventory exactly once and closes its audit record');
select aroma_confirmed_test.ok((select not active from app.products where id='e0423000-0000-4000-8000-000000000001'),
  'Restocking never reactivates a product the administrator manually disabled');
set local role service_role;
select aroma_confirmed_test.ok(api.create_confirmed_simulated_order('e0427000-0000-4000-8000-000000000003',repeat('C',43),
 (select value from aroma_confirmed_test.saved where key='body-cancel'),null)->'order'->>'status'='cancelled',
 'Retrying checkout after cancellation cannot consume stock again');
reset role;

-- The original pending-payment policy stays available and continues to expire.
update app.products set active=true where id='e0423000-0000-4000-8000-000000000001';
insert into aroma_confirmed_test.saved values('body-pending',aroma_confirmed_test.body('e0424000-0000-4000-8000-000000000001',1));
set local role service_role;
insert into aroma_confirmed_test.saved values('pending',api.create_simulated_order(
 'e0427000-0000-4000-8000-000000000005',repeat('E',43),(select value from aroma_confirmed_test.saved where key='body-pending'),null));
reset role;
select aroma_confirmed_test.ok((select simulation_confirmed_at is null from app.orders where operation_id='e0427000-0000-4000-8000-000000000005')
  and (select state='active' and expires_at-created_at=interval '15 minutes' from private.order_stock_reservations where order_id=
    (select id from app.orders where operation_id='e0427000-0000-4000-8000-000000000005')),
  'A pending-payment checkout still has a distinct fifteen-minute active hold');
select aroma_confirmed_test.ok((select stock=1 from app.product_variants where id='e0424000-0000-4000-8000-000000000001')
  and private.reservable_stock('e0424000-0000-4000-8000-000000000001')=0,
  'Pending payment holds availability without consuming physical stock');
update private.order_stock_reservations r set created_at=t.at-interval '16 minutes',expires_at=t.at-interval '1 minute'
  from (select clock_timestamp() at) t where r.state='active';
set local role service_role;
select aroma_confirmed_test.ok(api.expire_stock_reservations(100)=1 and api.expire_stock_reservations(100)=0,
  'The payment deadline expires only the pending hold, once');
select aroma_confirmed_test.error('select api.create_confirmed_simulated_order(''e0427000-0000-4000-8000-000000000005'',repeat(''E'',43),
 (select value from aroma_confirmed_test.saved where key=''body-pending''),null)','22023',
 'A legacy expired pending operation cannot be silently converted into confirmed consumption');
reset role;
select aroma_confirmed_test.ok((select status='expired' and simulation_confirmed_at is null from app.orders
  where operation_id='e0427000-0000-4000-8000-000000000005')
  and (select stock=1 from app.product_variants where id='e0424000-0000-4000-8000-000000000001'),
  'Expiry returns pending availability without reviving old orders or increasing physical stock');

-- Reproduce the historical mismatch: an expired hold with an old preparing label.
set local role service_role;
insert into aroma_confirmed_test.saved values('legacy',api.create_simulated_order(
 'e0427000-0000-4000-8000-000000000006',repeat('F',43),(select value from aroma_confirmed_test.saved where key='body-pending'),null));
reset role;
set local role authenticated;
select aroma_confirmed_test.ok(jsonb_array_length(aroma_confirmed_test.transition('legacy','preparing',1,'e0428000-0000-4000-8000-000000000010')->'updated')=1,
  'A still-live legacy pending order retains its existing preparation behavior');
reset role;
update private.order_stock_reservations r set created_at=t.at-interval '16 minutes',expires_at=t.at-interval '1 minute',state='expired',closed_at=t.at
  from (select clock_timestamp() at) t where r.state='active';
set local role authenticated;
insert into aroma_confirmed_test.saved values('legacy-error',aroma_confirmed_test.transition('legacy','shipped',2,'e0428000-0000-4000-8000-000000000011',true));
select aroma_confirmed_test.ok((select jsonb_array_length(value->'errors')=1
  and lower(value->'errors'->0->>'message') ~ 'reserva.*venc' from aroma_confirmed_test.saved where key='legacy-error'),
  'Historical expired reservations explain their actual cause instead of a generic validation error');
reset role;
set constraints all immediate;
select aroma_confirmed_test.ok((select bool_and(stock>=0) from app.product_variants)
  and (select bool_and(simulation and payment_status='pending' and payment_verified_at is null) from app.orders),
  'All scenarios preserve nonnegative inventory and never approve or verify real payment');
rollback;
