-- Isolated, rolled-back operational notifications. No real provider or sales.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
  raise exception 'Use only the isolated SQL runner';end if;end $$;
create schema aroma_staging_push_test;
create function aroma_staging_push_test.ok(p boolean,label text) returns text language plpgsql set search_path='' as $$
begin if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_staging_push_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,actual;end if;return 'PASS: '||label;end $$;
create function aroma_staging_push_test.order_fixture(p_id uuid) returns uuid language plpgsql set search_path='' as $$
begin
  insert into app.orders(id,reference,operation_id,tracking_hash,request_hash,mode,simulation,payment_status,
    first_name,last_name,email,phone,delivery_method,subtotal_cents,product_discount_cents,discount_cents,shipping_cents,total_cents,
    shipping_estimate,department,province,district,street)
  values(p_id,'AI-OP-'||replace(p_id::text,'-',''),p_id,repeat('a',64),repeat('b',64),'guest',true,'pending',
    'SQL','Fixture','push@example.invalid','999999999','courier',10000,0,0,0,10000,'SQL only','lima','1501','150131','SQL only');
  return p_id;
end $$;
revoke all on function aroma_staging_push_test.order_fixture(uuid) from public;
grant usage on schema aroma_staging_push_test to anon,authenticated,service_role;
grant execute on function aroma_staging_push_test.ok(boolean,text),aroma_staging_push_test.error(text,text,text) to anon,authenticated,service_role;
create table aroma_staging_push_test.saved(key text primary key,value jsonb);
grant select,insert on aroma_staging_push_test.saved to authenticated,service_role;

select aroma_staging_push_test.ok((select not staging_simulated_order_notifications from private.admin_push_policy where singleton),
  'Staging order alerts are disabled by default after migration');
select aroma_staging_push_test.ok(not has_table_privilege('authenticated','private.admin_push_policy','select,insert,update,delete')
  and not has_table_privilege('service_role','private.admin_push_policy','insert,update,delete')
  and not has_function_privilege('authenticated','api.claim_admin_order_push(text,uuid,integer)','execute')
  and not has_function_privilege('service_role','private.claim_admin_push_work(text,integer,uuid,uuid)','execute'),
  'No browser or dispatcher can change the policy or bypass the public scoped claim');
select aroma_staging_push_test.order_fixture('ed700000-0000-4000-8000-000000000001');
select aroma_staging_push_test.ok((select count(*)=0 from app.admin_notifications),
  'Existing disabled behavior never backfills a simulated sale event');

insert into auth.users(id,email) values
 ('ed710000-0000-4000-8000-000000000001','push-staging-a@example.invalid'),
 ('ed710000-0000-4000-8000-000000000002','push-staging-b@example.invalid');
insert into private.admin_memberships(user_id,active) values
 ('ed710000-0000-4000-8000-000000000001',true),('ed710000-0000-4000-8000-000000000002',true);
insert into private.admin_push_subscriptions(user_id,device_id,environment,device_label,endpoint,endpoint_hash,p256dh,auth)
 select 'ed710000-0000-4000-8000-000000000001',x.id,x.env,'SQL fixture','https://fcm.googleapis.com/fcm/send/'||x.id,
 private.commerce_hash('https://fcm.googleapis.com/fcm/send/'||x.id),'B'||repeat('A',86),repeat('A',22)
 from (values('ed720000-0000-4000-8000-000000000001'::uuid,'staging'),
 ('ed720000-0000-4000-8000-000000000002'::uuid,'staging'),
 ('ed720000-0000-4000-8000-000000000003'::uuid,'production')) x(id,env);
insert into private.admin_push_subscriptions(user_id,device_id,environment,device_label,endpoint,endpoint_hash,p256dh,auth)
 values('ed710000-0000-4000-8000-000000000002','ed720000-0000-4000-8000-000000000004','staging','SQL fixture',
 'https://fcm.googleapis.com/fcm/send/second-admin',private.commerce_hash('https://fcm.googleapis.com/fcm/send/second-admin'),
 'B'||repeat('A',86),repeat('A',22));

-- Operator opt-in affects only new INSERTs; ordinary state changes are not new orders.
update private.admin_push_policy set staging_simulated_order_notifications=true where singleton;
update app.orders set status='preparing',version=version+1 where id='ed700000-0000-4000-8000-000000000001';
select aroma_staging_push_test.ok((select count(*)=0 from app.admin_notifications),
 'Enabling the policy or editing an old order never creates historical pushes');
select aroma_staging_push_test.order_fixture('ed700000-0000-4000-8000-000000000002');
select aroma_staging_push_test.ok((select count(*)=1 and bool_and(kind='simulated_order' and delivery_environment='staging') from app.admin_notifications)
 and (select simulation and payment_status='pending' and payment_verified_at is null from app.orders where id='ed700000-0000-4000-8000-000000000002'),
 'New order and explicit staging event commit together without approving payment');
select aroma_staging_push_test.error('update app.admin_notifications set delivery_environment=null where order_id=''ed700000-0000-4000-8000-000000000002''',
 '23514','A staging event cannot lose its environment through SQL NULL check semantics');
update app.orders set status='preparing',version=version+1 where id='ed700000-0000-4000-8000-000000000002';
select aroma_staging_push_test.ok((select count(*)=1 from app.admin_notifications),
 'Preparation and repeated updates do not duplicate the new-order event');

do $$ begin
  begin
    perform aroma_staging_push_test.order_fixture('ed700000-0000-4000-8000-000000000003');
    raise exception 'Controlled transaction failure' using errcode='P9001';
  exception when sqlstate 'P9001' then null;end;
end $$;
select aroma_staging_push_test.ok(not exists(select 1 from app.orders where id='ed700000-0000-4000-8000-000000000003')
 and not exists(select 1 from app.admin_notifications where order_id='ed700000-0000-4000-8000-000000000003'),
 'Failure after INSERT rolls back both order and event, leaving no phantom alert');

set local role service_role;
select aroma_staging_push_test.error('select api.claim_admin_order_push(''production'',''ed700000-0000-4000-8000-000000000002'',10)',
 '22023','Directed staging claims reject production');
select aroma_staging_push_test.ok(api.claim_admin_push('production',10)->'deliveries'='[]'::jsonb,
 'Production dispatcher cannot expand or claim a staging simulation');
reset role;
select aroma_staging_push_test.ok(not exists(select 1 from private.admin_push_deliveries),
 'A staging event cannot enqueue delivery to production namespace');
select aroma_staging_push_test.order_fixture('ed700000-0000-4000-8000-000000000004');
set local role service_role;
insert into aroma_staging_push_test.saved values('target',api.claim_admin_order_push('staging','ed700000-0000-4000-8000-000000000002',10));
select aroma_staging_push_test.ok((select jsonb_array_length(value->'deliveries')=3
 and not exists(select 1 from jsonb_array_elements(value->'deliveries') d where d->>'kind'<>'simulated_order'
 or d->>'orderReference'<>'AI-OP-ed700000000040008000000000000002') from aroma_staging_push_test.saved where key='target'),
 'One new order targets two devices of one admin and one device of another');
select aroma_staging_push_test.ok(api.claim_admin_order_push('staging','ed700000-0000-4000-8000-000000000002',10)->'deliveries'='[]'::jsonb,
 'Idempotent dispatch cannot lease the same in-flight delivery twice');
reset role;
select aroma_staging_push_test.ok((select count(*)=3 and bool_and(s.environment='staging') from private.admin_push_deliveries d
 join private.admin_push_subscriptions s on s.id=d.subscription_id)
 and (select not fanned_out from app.admin_notifications where order_id='ed700000-0000-4000-8000-000000000004'),
 'Directed dispatch leaves unrelated orders alone and never crosses namespaces');

select set_config('request.jwt.claims','{"sub":"ed710000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_staging_push_test.ok((api.admin_notifications()->'items'->0->>'kind')='simulated_order'
 and api.admin_notifications()->>'unreadCount'='2',
 'Admin inbox identifies test orders explicitly rather than claiming a paid sale');
select aroma_staging_push_test.error('select api.claim_admin_order_push(''staging'',''ed700000-0000-4000-8000-000000000002'',10)',
 '42501','An authenticated browser cannot dispatch arbitrary order events');
reset role;
update private.admin_push_policy set staging_simulated_order_notifications=false where singleton;
select aroma_staging_push_test.order_fixture('ed700000-0000-4000-8000-000000000005');
select aroma_staging_push_test.ok(not exists(select 1 from app.admin_notifications where order_id='ed700000-0000-4000-8000-000000000005'),
 'Operator can stop new staging alerts without changing orders or commercial notifications');
rollback;
