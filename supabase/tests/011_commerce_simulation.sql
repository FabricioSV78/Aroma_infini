-- Disposable commerce contracts. No hosted users, tariffs or order records.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Use only isolated SQL runner.';end if;end $$;
create schema aroma_commerce_test;
-- Reproduce hosted Supabase's managed schema boundary rather than relying on
-- the permissive local fixture's initial custom-role Auth grant.
revoke usage on schema auth from aro_commerce_executor;
grant usage on schema aroma_commerce_test to anon,authenticated,service_role;
create table aroma_commerce_test.saved(key text primary key,value jsonb);
grant select,insert,update on aroma_commerce_test.saved to anon,authenticated,service_role;
create function aroma_commerce_test.ok(p_value boolean,p_label text) returns text language plpgsql as $$
begin if p_value is distinct from true then raise exception 'FAIL: %',p_label;end if;return 'PASS: '||p_label;end $$;
create function aroma_commerce_test.error(p_sql text,p_state text,p_label text) returns text language plpgsql as $$
declare v_state text;begin begin execute p_sql;exception when others then get stacked diagnostics v_state=returned_sqlstate;end;
if v_state is distinct from p_state then raise exception 'FAIL: %, expected %, got %',p_label,p_state,coalesce(v_state,'success');end if;return 'PASS: '||p_label;end $$;
create function aroma_commerce_test.shipping(p_provinces boolean default false) returns jsonb language sql as $$
select jsonb_build_object('freeThresholdCents',30000,'provinceShippingEnabled',p_provinces,'nationalCourierFeeCents',2500,'nationalEstimate','SQL fixture province time',
 'zones',jsonb_build_array(
 jsonb_build_object('id','fixture-lima','name','SQL Lima','department','lima','province','1501','district',null,'courierFeeCents',1000,'motorizadoFeeCents',1500,'estimate','SQL Lima time','active',true),
 jsonb_build_object('id','fixture-callao','name','SQL Callao','department','callao','province','0701','district',null,'courierFeeCents',1200,'motorizadoFeeCents',1700,'estimate','SQL Callao time','active',true),
 jsonb_build_object('id','fixture-district','name','SQL San Isidro','department','lima','province','1501','district','150131','courierFeeCents',500,'motorizadoFeeCents',1000,'estimate','SQL district time','active',true),
 jsonb_build_object('id','fixture-province','name','SQL Arequipa','department','arequipa','province','0401','district',null,'courierFeeCents',3000,'motorizadoFeeCents',null,'estimate','SQL province time','active',true)));
$$;
create function aroma_commerce_test.coupon(p_value numeric default 10,p_type text default 'percent') returns jsonb language sql as $$
select jsonb_build_object('id','a6000000-0000-4000-8000-000000000001','code','sql-test','active',true,'type',p_type,'value',p_value,
 'minimumCents',0,'startsAt','','endsAt','','usageLimit',10);
$$;
create function aroma_commerce_test.cart(p_quantity integer default 1) returns jsonb language sql as $$
select jsonb_build_array(jsonb_build_object('variantId','a4000000-0000-4000-8000-000000000001','quantity',p_quantity));
$$;
create function aroma_commerce_test.checkout(p_code text default null,p_quantity integer default 1) returns jsonb language sql as $$
select jsonb_build_object('lines',aroma_commerce_test.cart(p_quantity),'contact',jsonb_build_object('firstName','SQL fixture','lastName','Customer','email','commerce@example.invalid','phone','912345678'),
 'address',jsonb_build_object('department','lima','province','1501','district','150131','street','SQL fixture street 123','reference',''),
 'alternateRecipient',null,'deliveryMethod','courier','promotionCode',p_code,
 'expectedQuoteHash',api.checkout_quote(aroma_commerce_test.cart(p_quantity),'lima','1501','150131','courier',p_code)->>'quoteHash');
$$;
grant execute on all functions in schema aroma_commerce_test to anon,authenticated,service_role;
insert into auth.users(id,email,raw_user_meta_data) values
 ('a1000000-0000-4000-8000-000000000001','commerce-admin@example.invalid','{}'),
 ('a1000000-0000-4000-8000-000000000002','commerce-customer@example.invalid','{}'),
 ('a1000000-0000-4000-8000-000000000003','commerce-other@example.invalid','{}');
insert into private.admin_memberships(user_id,active) values('a1000000-0000-4000-8000-000000000001',true);
insert into app.brands(id,name,slug) values('a2000000-0000-4000-8000-000000000001','Commerce SQL fixture','commerce-sql-fixture');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
 values('a5000000-0000-4000-8000-000000000001','r2','public/dynamic/a5000000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/800.webp',
 'image/webp',800,1000,'ready',now(),'a5000000-0000-4000-8000-000000000002','product-gallery',2000,repeat('a',64));
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
 select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id='a5000000-0000-4000-8000-000000000001';
insert into app.products(id,name,slug,brand_id,short_description,description,active,gender) values
 ('a3000000-0000-4000-8000-000000000001','SQL commerce perfume','sql-commerce-perfume','a2000000-0000-4000-8000-000000000001','SQL fixture','SQL fixture',true,'unisex');
insert into app.product_variants(id,product_id,ml,price_cents,stock,active,merchant_sku) values
 ('a4000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',50,12000,8,true,'SQL-COM-1'),
 ('a4000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000001',100,22000,9,true,'SQL-COM-2');
insert into app.product_images(product_id,position,media_id) values('a3000000-0000-4000-8000-000000000001',0,'a5000000-0000-4000-8000-000000000001');
set constraints all immediate;set constraints all deferred;
select aroma_commerce_test.ok((select count(*)=1891 from app.commerce_locations),'Commerce uses the exact existing 1891-district location reference');
select aroma_commerce_test.ok(not has_schema_privilege('aro_commerce_executor','auth','USAGE'),
 'Commerce identity tests run without managed Auth-schema USAGE, matching hosted Supabase');
select aroma_commerce_test.ok(not has_table_privilege('authenticated','app.orders','select,insert,update,delete') and not has_table_privilege('anon','app.shipping_settings','select'), 'Browser roles have no direct commerce table access');
select aroma_commerce_test.ok(not has_function_privilege('anon','api.create_simulated_order(uuid,text,jsonb,uuid)','execute') and not has_function_privilege('authenticated','api.create_simulated_order(uuid,text,jsonb,uuid)','execute') and has_function_privilege('service_role','api.create_simulated_order(uuid,text,jsonb,uuid)','execute'), 'Only the trusted Worker service can create simulated orders');
select aroma_commerce_test.ok((select not(rolcanlogin or rolinherit or rolbypassrls or rolsuper) from pg_roles where rolname='aro_commerce_executor'),'Commerce executor has no login, inheritance or RLS bypass');
set local role anon;
select aroma_commerce_test.ok(api.commerce_settings()='{"shipping":null,"shippingVersion":0}'::jsonb,'Unconfigured commerce does not import or invent shipping tariffs');
select aroma_commerce_test.ok(api.checkout_quote(aroma_commerce_test.cart(),'lima','1501','150131','courier')->'shipping'->>'kind'='unavailable','Checkout cannot invent a rate before the administrator configures shipping');
select aroma_commerce_test.error('select api.admin_orders()','42501','Anonymous cannot read administrative orders');
select aroma_commerce_test.error('select api.customer_orders()','42501','Anonymous cannot list customer orders');
select aroma_commerce_test.error('select api.admin_commerce_settings()','42501','Anonymous cannot list coupon or private tariff configuration');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
set local role authenticated;
select aroma_commerce_test.error('select api.admin_save_shipping(aroma_commerce_test.shipping(),0)','42501','Customer cannot configure shipping');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_commerce_test.error('select api.admin_save_shipping(aroma_commerce_test.shipping(),0)','42501','Administrative shipping requires AAL2');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_commerce_test.saved values('shipping',api.admin_save_shipping(aroma_commerce_test.shipping(),0));
select aroma_commerce_test.ok((select value->>'version'='1' and jsonb_array_length(value->'shipping'->'zones')=4 and jsonb_array_length(value->'publicShipping'->'zones')=3 from aroma_commerce_test.saved where key='shipping'),'First shipping save returns canonical admin and sanitized public projections');
select aroma_commerce_test.error('select api.admin_save_shipping(aroma_commerce_test.shipping(),0)','PT409','Stale shipping versions do not overwrite configured tariffs');
select aroma_commerce_test.error('select api.admin_save_shipping(jsonb_set(aroma_commerce_test.shipping(),''{zones,0,district}'',''"999999"''),1)','22023','Tariffs cannot use districts absent from the location reference');
select aroma_commerce_test.error('select api.admin_save_shipping(jsonb_set(aroma_commerce_test.shipping(),''{zones,0,courierFeeCents}'',''-1''),1)','22023','Negative delivery tariffs are rejected');
insert into aroma_commerce_test.saved values('coupon',api.admin_save_coupon(aroma_commerce_test.coupon(),0));
select aroma_commerce_test.ok((select value->'coupon'->>'code'='SQL-TEST' and value->'coupon'->>'used'='0' from aroma_commerce_test.saved where key='coupon'),'Coupon codes normalize without accepting browser usage counters');
select aroma_commerce_test.error('select api.admin_save_coupon(aroma_commerce_test.coupon(101),1)','22023','Coupon percentages above 100 are rejected');
select aroma_commerce_test.error('select api.admin_save_coupon(aroma_commerce_test.coupon(),0)','PT409','Stale coupon versions are rejected');
reset role;set local role anon;
insert into aroma_commerce_test.saved values('quote',api.checkout_quote(aroma_commerce_test.cart(),'lima','1501','150131','courier','sql-test'));
select aroma_commerce_test.ok((select value->>'subtotalCents'='12000' and value->>'discountCents'='1200' and value->'shipping'->>'feeCents'='500' and value->>'totalCents'='11300' from aroma_commerce_test.saved where key='quote'),'Server quotes current catalog prices, coupon cents and most-specific district tariff');
select aroma_commerce_test.ok(api.checkout_quote(aroma_commerce_test.cart(),'callao','0701','070101','courier')->'shipping'->>'feeCents'='1200','Callao uses its configured base tariff');
select aroma_commerce_test.ok(api.checkout_quote(aroma_commerce_test.cart(),'arequipa','0401','040101','courier')->'shipping'->>'kind'='unavailable','Prepared provincial rates do not enable provincial coverage');
select aroma_commerce_test.ok(api.checkout_quote(aroma_commerce_test.cart(3),'lima','1501','150131','courier')->'shipping'->>'free'='true','Free shipping threshold uses subtotal before coupon discount');
select aroma_commerce_test.ok(api.checkout_quote(aroma_commerce_test.cart(),'lima','1501','999999','courier')->'shipping'->>'kind'='unavailable','Invented district codes never receive a delivery quote');
select aroma_commerce_test.error('select api.checkout_quote(aroma_commerce_test.cart(999),''lima'',''1501'',''150131'',''courier'')','22023','Quote rejects unavailable stock without consuming it');
select aroma_commerce_test.error('select api.checkout_quote(aroma_commerce_test.cart()||aroma_commerce_test.cart(),''lima'',''1501'',''150131'',''courier'')','22023','Quote rejects duplicate variant lines');
reset role;
insert into aroma_commerce_test.saved values('checkout',aroma_commerce_test.checkout('SQL-TEST'));
set local role service_role;
insert into aroma_commerce_test.saved values('guest',api.create_simulated_order('a7000000-0000-4000-8000-000000000001',repeat('T',43),(select value from aroma_commerce_test.saved where key='checkout'),null));
select aroma_commerce_test.ok((select value->'order'->>'paymentStatus'='pending' and value->'order'->>'simulation'='true' and value->'order'->>'reference'~'^AI-[A-F0-9]{16}$' from aroma_commerce_test.saved where key='guest'),'Server creates a pending-payment simulation with a server-generated reference');
select aroma_commerce_test.ok(api.create_simulated_order('a7000000-0000-4000-8000-000000000001',repeat('T',43),(select value from aroma_commerce_test.saved where key='checkout'),null)=(select value from aroma_commerce_test.saved where key='guest'),'Identical retry returns the same order rather than duplicating it');
select aroma_commerce_test.error('select api.create_simulated_order(''a7000000-0000-4000-8000-000000000001'',repeat(''X'',43),(select value from aroma_commerce_test.saved where key=''checkout''),null)','42501','Another guest capability cannot take over an existing operation');
select aroma_commerce_test.error('select api.create_simulated_order(''a7000000-0000-4000-8000-000000000001'',repeat(''T'',43),jsonb_set((select value from aroma_commerce_test.saved where key=''checkout''),''{contact,firstName}'',''"Different"''),null)','PT409','Changed payload cannot reuse an idempotent checkout operation');
reset role;
select aroma_commerce_test.ok((select stock=8 from app.product_variants where id='a4000000-0000-4000-8000-000000000001') and (select used=0 from app.coupons where id='a6000000-0000-4000-8000-000000000001'),'Simulated checkout neither consumes stock nor redeems coupons');
set local role anon;
select aroma_commerce_test.ok(api.order_tracking((select value->'order'->>'reference' from aroma_commerce_test.saved where key='guest')) is null,'Reference alone cannot reveal even a minimal guest order');
select aroma_commerce_test.ok(api.order_tracking((select value->'order'->>'reference' from aroma_commerce_test.saved where key='guest'),repeat('T',43))->>'status'='received','Guest tracking capability authorizes only minimal tracking');
select aroma_commerce_test.ok(not api.order_tracking((select value->'order'->>'reference' from aroma_commerce_test.saved where key='guest'),repeat('T',43)) ? 'contact','Tracking projection contains no customer or address data');
reset role;
insert into aroma_commerce_test.saved values('ownercheckout',aroma_commerce_test.checkout());
set local role service_role;
insert into aroma_commerce_test.saved values('owned',api.create_simulated_order('a7000000-0000-4000-8000-000000000002',repeat('U',43),(select value from aroma_commerce_test.saved where key='ownercheckout'),'a1000000-0000-4000-8000-000000000002'));
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
set local role authenticated;
select aroma_commerce_test.ok(jsonb_array_length(api.customer_orders())=1 and api.customer_orders()->0->'payment'->>'status'='pending','Authenticated customer reads only own persisted pending simulation');
select aroma_commerce_test.ok(api.order_tracking((select value->'order'->>'reference' from aroma_commerce_test.saved where key='owned'))->>'status'='received','Owner session can track own order without a guest capability');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
set local role authenticated;
select aroma_commerce_test.ok(api.customer_orders()='[]'::jsonb and api.order_tracking((select value->'order'->>'reference' from aroma_commerce_test.saved where key='owned')) is null,'Another account cannot list or track orders by matching references');
reset role;
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_commerce_test.ok(api.admin_orders()->>'total'='2' and jsonb_array_length(api.admin_orders()->'orders')=2,'Administrative list uses persisted orders and excludes local demo records');
insert into aroma_commerce_test.saved values('status',api.admin_set_order_statuses(jsonb_build_array(
 jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_commerce_test.saved where key='guest'),'expectedVersion',1),
 jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_commerce_test.saved where key='owned'),'expectedVersion',99)),
 'preparing','a8000000-0000-4000-8000-000000000001',false,'bulk'));
select aroma_commerce_test.ok((select jsonb_array_length(value->'updated')=1 and jsonb_array_length(value->'errors')=1 from aroma_commerce_test.saved where key='status'),'Bulk status updates report partial version errors without rolling back valid orders');
select aroma_commerce_test.ok((select jsonb_array_length(value->'orders')=2 and jsonb_array_length(value->'orderHistory')=1 from aroma_commerce_test.saved where key='status'),
 'Bulk writes return canonical order rows and audit history in the same transaction');
select aroma_commerce_test.ok(api.admin_orders()->'orderHistory'->0->'operator'->>'verified'='true' and api.admin_orders()->'orderHistory'->0->'operator'->>'id'='a1000000-0000-4000-8000-000000000001','Status history derives verified administrator identity from the session');
select aroma_commerce_test.error('select api.admin_set_order_statuses(jsonb_build_array(jsonb_build_object(''reference'',''AI-NOT-FOUND'',''expectedVersion'',1)),''preparing'',''a8000000-0000-4000-8000-000000000001'',false,''bulk'')','PT409','Status-operation retry cannot change the selected order set');
select aroma_commerce_test.ok(jsonb_array_length(api.admin_set_order_statuses(jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_commerce_test.saved where key='guest'),'expectedVersion',2)),
 'delivered','a8000000-0000-4000-8000-000000000002',true,'individual')->'errors')=1,'Order workflow cannot skip fulfillment steps');
insert into aroma_commerce_test.saved values('shipped',api.admin_set_order_statuses(jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_commerce_test.saved where key='guest'),'expectedVersion',2)),
 'shipped','a8000000-0000-4000-8000-000000000003',false,'individual'));
select aroma_commerce_test.ok(jsonb_array_length(api.admin_set_order_statuses(jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_commerce_test.saved where key='guest'),'expectedVersion',3)),
 'delivered','a8000000-0000-4000-8000-000000000004',false,'individual')->'errors')=1,'Delivered state requires explicit confirmation even for simulations');
insert into aroma_commerce_test.saved values('delivered',api.admin_set_order_statuses(jsonb_build_array(jsonb_build_object('reference',(select value->'order'->>'reference' from aroma_commerce_test.saved where key='guest'),'expectedVersion',3)),
 'delivered','a8000000-0000-4000-8000-000000000005',true,'individual'));
select aroma_commerce_test.ok(jsonb_array_length((select value->'updated' from aroma_commerce_test.saved where key='delivered'))=1,'Confirmed sequential delivery updates fulfillment without approving the payment');
reset role;
select aroma_commerce_test.ok((select bool_and(payment_status='pending') from app.orders),'Fulfillment simulations never manufacture an approved payment');
-- A catalog save stages/reinserts all variants. Historical references must
-- permit unchanged UUIDs while prices and names continue to evolve.
savepoint catalog_after_order;
insert into aroma_commerce_test.saved values('catalogBefore',private.admin_product_document('a3000000-0000-4000-8000-000000000001'));
insert into aroma_commerce_test.saved values('catalogVersion',(select to_jsonb(version) from app.products where id='a3000000-0000-4000-8000-000000000001'));
select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_commerce_test.saved values('catalogEdited',api.admin_save_product(
 jsonb_set(jsonb_set((select value from aroma_commerce_test.saved where key='catalogBefore'),'{product,name}','"Updated catalog name"'),'{product,variants,0,priceCents}','13000'),
 ((select value from aroma_commerce_test.saved where key='catalogVersion')#>>'{}')::bigint));
reset role;
select aroma_commerce_test.ok((select name='Updated catalog name' from app.products where id='a3000000-0000-4000-8000-000000000001')
 and (select bool_and(product_name='SQL commerce perfume' and unit_price_cents=12000) from app.order_items),
 'Editing a purchased product keeps variant UUID links and frozen order names and prices');
rollback to savepoint catalog_after_order;
-- The purchased line keeps its verified image after removal from the gallery.
update app.products set active=false where id='a3000000-0000-4000-8000-000000000001';
delete from app.product_images where product_id='a3000000-0000-4000-8000-000000000001';
select aroma_commerce_test.ok(private.media_has_references('a5000000-0000-4000-8000-000000000001') and (select retire_after is null from app.media_assets where id='a5000000-0000-4000-8000-000000000001'),'Historical order images remain protected after a merchant removes the gallery association');
select aroma_commerce_test.error('delete from app.products where id=''a3000000-0000-4000-8000-000000000001''','23503','Purchased products cannot be hard-deleted through a historical foreign key');
delete from auth.users where id='a1000000-0000-4000-8000-000000000001';
select aroma_commerce_test.ok((select bool_and(actor_id='a1000000-0000-4000-8000-000000000001') from app.order_status_history)
 and private.order_history_document(array(select id from app.orders))->0->'operator'->>'id'='a1000000-0000-4000-8000-000000000001',
 'Removing an administrative Auth account does not erase verified historical attribution');
rollback;
