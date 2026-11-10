-- Disposable SQL-only fixtures. No hosted Auth users, push endpoints or sales.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Only isolated SQL fixtures';end if;end $$;
create schema aroma_push_test;
grant usage on schema aroma_push_test to anon,authenticated,service_role;
create function aroma_push_test.ok(p boolean,label text) returns text language plpgsql set search_path='' as $$
begin if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_push_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,actual;end if;return 'PASS: '||label;end $$;
create function aroma_push_test.subscription(p_suffix text) returns jsonb language sql immutable set search_path='' as $$
select jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/fixture-'||p_suffix,
  'keys',jsonb_build_object('p256dh','B'||repeat('A',86),'auth',repeat('A',22))) $$;
create function aroma_push_test.order_fixture(p_id uuid,p_simulation boolean default true,p_payment text default 'pending',p_verified boolean default false)
returns uuid language plpgsql set search_path='' as $$
begin
  insert into app.orders(id,reference,operation_id,tracking_hash,request_hash,mode,simulation,payment_status,payment_verified_at,
    first_name,last_name,email,phone,delivery_method,subtotal_cents,product_discount_cents,discount_cents,shipping_cents,total_cents,
    shipping_estimate,department,province,district,street)
    values(p_id,'AI-PUSH-'||replace(p_id::text,'-',''),p_id,repeat('a',64),repeat('b',64),'guest',p_simulation,p_payment,
      case when p_verified then now() end,'SQL','Fixture','fixture@example.invalid','999999999','courier',10000,0,0,0,10000,
      'Fixture estimate','lima','1501','150131','SQL fixture only');
  return p_id;
end $$;
grant execute on function aroma_push_test.ok(boolean,text),aroma_push_test.error(text,text,text),aroma_push_test.subscription(text) to anon,authenticated,service_role;
-- Fixture order helper intentionally has no browser/service permission.
revoke all on function aroma_push_test.order_fixture(uuid,boolean,text,boolean) from public;
create table aroma_push_test.saved(key text primary key,value jsonb);
grant select,insert,update on aroma_push_test.saved to anon,authenticated,service_role;

insert into auth.users(id,email) values
 ('e8000000-0000-4000-8000-000000000001','push-admin-a@example.invalid'),
 ('e8000000-0000-4000-8000-000000000002','push-admin-b@example.invalid'),
 ('e8000000-0000-4000-8000-000000000003','push-customer@example.invalid');
insert into private.admin_memberships(user_id,active) values
 ('e8000000-0000-4000-8000-000000000001',true),('e8000000-0000-4000-8000-000000000002',true);
select aroma_push_test.ok((select not(rolcanlogin or rolsuper or rolbypassrls or rolinherit) from pg_roles where rolname='aro_admin_push_executor'),
 'Push executor has no login, RLS bypass, inheritance or superuser');
select aroma_push_test.ok(not has_schema_privilege('aro_admin_push_executor','auth','USAGE'),'Hosted executor does not need managed Auth schema access');
select aroma_push_test.ok(not has_table_privilege('authenticated','private.admin_push_subscriptions','select,insert,update,delete')
 and not has_table_privilege('service_role','app.admin_notifications','select,insert,update,delete')
 and not has_table_privilege('anon','private.admin_push_deliveries','select'),'No browser or service direct table privileges');
select aroma_push_test.ok(not has_function_privilege('authenticated','api.claim_admin_push(text,integer,uuid)','execute')
 and has_function_privilege('service_role','api.claim_admin_push(text,integer,uuid)','execute')
 and not has_function_privilege('service_role','api.admin_push_subscribe(text,uuid,text,jsonb)','execute'),
 'Dispatcher privileges cannot register arbitrary users or expose push material to browser callers');
select aroma_push_test.ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in(
 'private.admin_push_subscriptions'::regclass,'app.admin_notifications'::regclass,'private.admin_notification_reads'::regclass,'private.admin_push_deliveries'::regclass)),
 'All four private notification tables enforce RLS');

select set_config('request.jwt.claims','{}',true);
set local role anon;
select aroma_push_test.error('select api.admin_notifications()','42501','Anonymous notification center is forbidden');
reset role;
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
set local role authenticated;
select aroma_push_test.error('select api.admin_push_device(''staging'',''e8100000-0000-4000-8000-000000000001'')','42501','Customer cannot subscribe to admin pushes');
select aroma_push_test.error('select api.admin_read_notifications(null,true)','42501','Customer cannot change admin read state');
reset role;
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_push_test.error('select api.admin_notifications()','42501','Admin center requires MFA AAL2');
select aroma_push_test.error('select api.admin_push_subscribe(''staging'',''e8100000-0000-4000-8000-000000000001'',''Phone'',aroma_push_test.subscription(''a1''))','42501','Subscription registration requires MFA');
reset role;
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_push_test.ok(api.admin_notifications()='{"items":[],"unreadCount":0}'::jsonb,'Center begins with factual zero rather than mock counts');
select aroma_push_test.error('select api.admin_push_device(''unknown'',''e8100000-0000-4000-8000-000000000001'')','22023','Unknown environments are rejected');
select aroma_push_test.error('select api.admin_push_subscribe(''staging'',''e8100000-0000-4000-8000-000000000001'',''Phone'',jsonb_set(aroma_push_test.subscription(''bad''),''{endpoint}'',''"http://127.0.0.1/private"''))','22023','Insecure endpoint cannot be registered');
select aroma_push_test.error('select api.admin_push_subscribe(''staging'',''e8100000-0000-4000-8000-000000000001'',''Phone'',jsonb_set(aroma_push_test.subscription(''bad''),''{keys,auth}'',''"short"''))','22023','Malformed encryption keys cannot be registered');
select aroma_push_test.error('select api.admin_push_subscribe(''staging'',''e8100000-0000-4000-8000-000000000001'',''Phone'',aroma_push_test.subscription(''bad'')||''{"user_id":"e8000000-0000-4000-8000-000000000002"}'')','22023','Caller cannot supply another owner in subscription data');
select api.admin_push_subscribe('staging','e8100000-0000-4000-8000-000000000001','Android fixture',aroma_push_test.subscription('a1'));
select api.admin_push_subscribe('staging','e8100000-0000-4000-8000-000000000001','Android fixture',aroma_push_test.subscription('a1'));
select api.admin_push_subscribe('staging','e8100000-0000-4000-8000-000000000002','Laptop fixture',aroma_push_test.subscription('a2'));
select api.admin_push_subscribe('production','e8100000-0000-4000-8000-000000000003','Production fixture',aroma_push_test.subscription('a3'));
select aroma_push_test.ok(api.admin_push_device('staging','e8100000-0000-4000-8000-000000000001')->'device'->>'enabled'='true','Registered device status is canonical');
insert into aroma_push_test.saved values('test',api.admin_push_test('staging','e8100000-0000-4000-8000-000000000001'));
select aroma_push_test.error('select api.admin_push_test(''staging'',''e8100000-0000-4000-8000-000000000001'')','PT429','Repeated test clicks are rate limited');
select aroma_push_test.ok(api.admin_notifications()->>'unreadCount'='0','Explicit test pushes never appear as commercial events');
reset role;
select aroma_push_test.ok((select count(*)=3 from private.admin_push_subscriptions),'Idempotent subscribe does not duplicate a device');
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
set local role authenticated;
select aroma_push_test.ok(api.admin_push_device('staging','e8100000-0000-4000-8000-000000000001')->'device'='null'::jsonb,'Other admin cannot discover a device by UUID');
select aroma_push_test.error('select api.admin_push_subscribe(''staging'',''e8100000-0000-4000-8000-000000000004'',''Other account'',aroma_push_test.subscription(''a1''))','PT409','Existing endpoint ownership cannot be stolen');
select api.admin_push_unsubscribe('staging','e8100000-0000-4000-8000-000000000001');
select api.admin_push_subscribe('staging','e8100000-0000-4000-8000-000000000004','iPhone fixture',aroma_push_test.subscription('b1'));
reset role;
select aroma_push_test.ok((select count(*)=4 and bool_and(enabled) from private.admin_push_subscriptions),'One admin cannot disable another admin device');

set local role service_role;
insert into aroma_push_test.saved values('testClaim',api.claim_admin_push('staging',10,(select (value->>'deliveryId')::uuid from aroma_push_test.saved where key='test')));
select aroma_push_test.ok((select jsonb_array_length(value->'deliveries')=1 and value->'deliveries'->0->>'kind'='test' and value->'deliveries'->0->'orderReference'='null'::jsonb
 from aroma_push_test.saved where key='testClaim'),'Targeted test claim contains only its stored device and an explicit test kind');
select aroma_push_test.ok(api.claim_admin_push('staging',10)->'deliveries'='[]'::jsonb,'Active lease prevents a second dispatcher claiming the same delivery');
select aroma_push_test.ok(api.check_admin_push_delivery((select (value->'deliveries'->0->>'deliveryId')::uuid from aroma_push_test.saved where key='testClaim'),
 (select (value->'deliveries'->0->>'leaseId')::uuid from aroma_push_test.saved where key='testClaim'))->>'allowed'='true','Just-before-send check verifies active role and current device');
select aroma_push_test.ok(api.finish_admin_push((select (value->'deliveries'->0->>'deliveryId')::uuid from aroma_push_test.saved where key='testClaim'),gen_random_uuid(),'accepted',201,null)->>'updated'='false','Wrong lease cannot acknowledge a delivery');
select api.finish_admin_push((select (value->'deliveries'->0->>'deliveryId')::uuid from aroma_push_test.saved where key='testClaim'),
 (select (value->'deliveries'->0->>'leaseId')::uuid from aroma_push_test.saved where key='testClaim'),'retry',503,'provider_temporary');
select aroma_push_test.ok(api.claim_admin_push('staging',10)->'deliveries'='[]'::jsonb,'Transient provider failure observes bounded retry delay');
reset role;
update private.admin_push_deliveries set next_attempt_at=now()-interval '1 second' where kind='test';
set local role service_role;
insert into aroma_push_test.saved values('testRetry',api.claim_admin_push('staging',10));
select api.finish_admin_push((select (value->'deliveries'->0->>'deliveryId')::uuid from aroma_push_test.saved where key='testRetry'),
 (select (value->'deliveries'->0->>'leaseId')::uuid from aroma_push_test.saved where key='testRetry'),'accepted',201,null);
select aroma_push_test.ok(api.finish_admin_push((select (value->'deliveries'->0->>'deliveryId')::uuid from aroma_push_test.saved where key='testRetry'),
 (select (value->'deliveries'->0->>'leaseId')::uuid from aroma_push_test.saved where key='testRetry'),'accepted',201,null)->>'updated'='false','Lost-response acknowledgement is idempotent');
reset role;
select aroma_push_test.ok((select attempts=2 and status='accepted' and accepted_at is not null from private.admin_push_deliveries where kind='test'),
 'Provider acceptance is tracked separately from a user reading or a device displaying the notification');

select aroma_push_test.order_fixture('e8200000-0000-4000-8000-000000000001');
update app.orders set status='preparing',version=version+1 where id='e8200000-0000-4000-8000-000000000001';
select aroma_push_test.ok((select count(*)=0 from app.admin_notifications),'Simulated checkout and preparation never generate sale events');
select aroma_push_test.error('update app.orders set payment_verified_at=now() where id=''e8200000-0000-4000-8000-000000000001''','23514','A simulated pending order cannot acquire the verified-payment marker');
select aroma_push_test.error('update app.orders set simulation=false,payment_status=''approved'',payment_verified_at=now() where id=''e8200000-0000-4000-8000-000000000001''','23514','Existing commerce constraints remain closed to real approved payments');

-- TEST-ONLY future provider boundary. These transactional changes are rolled back
-- and never enable commercial checkout, change a migration, or call a provider.
alter table app.orders drop constraint orders_simulation_check;
alter table app.orders drop constraint orders_payment_status_check;
select aroma_push_test.order_fixture('e8200000-0000-4000-8000-000000000002',false,'approved',false);
select aroma_push_test.ok((select count(*)=0 from app.admin_notifications),'Approved-looking data without server verification does not enqueue');
update app.orders set payment_verified_at=now() where id='e8200000-0000-4000-8000-000000000002';
update app.orders set payment_verified_at=payment_verified_at where id='e8200000-0000-4000-8000-000000000002';
select aroma_push_test.ok((select count(*)=1 from app.admin_notifications),'Verified real order enqueues exactly one idempotent event');
select aroma_push_test.ok(not exists(select 1 from app.admin_notifications n join app.orders o on o.id=n.order_id where o.simulation),
 'No simulated order leaks into the shared center');
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_push_test.saved values('centerA',api.admin_notifications());
select aroma_push_test.ok((select value->>'unreadCount'='1' and value->'items'->0->>'kind'='new_order'
 and value->'items'->0->>'orderReference'='AI-PUSH-e8200000000040008000000000000002'
 and not (value->'items'->0 ?| array['email','phone','street','first_name','total_cents']) from aroma_push_test.saved where key='centerA'),
 'Center provides an authenticated reference without customer PII');
select api.admin_read_notifications(array[(select (value->'items'->0->>'id')::uuid from aroma_push_test.saved where key='centerA')]);
select aroma_push_test.ok(api.admin_notifications()->>'unreadCount'='0','Administrator can mark own event read');
select aroma_push_test.ok(api.admin_read_notifications(null,true)->>'updated'='0','Mark-all-read retry is idempotent');
reset role;
select set_config('request.jwt.claims','{"sub":"e8000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
set local role authenticated;
select aroma_push_test.ok(api.admin_notifications()->>'unreadCount'='1','Another administrator retains independent unread state');
reset role;
set local role service_role;
insert into aroma_push_test.saved values('ordersClaim',api.claim_admin_push('staging',10));
select aroma_push_test.ok((select jsonb_array_length(value->'deliveries')=3 from aroma_push_test.saved where key='ordersClaim'),
 'One verified order fans out once to two devices of one admin and one device of another');
select aroma_push_test.ok(api.claim_admin_push('staging',10)->'deliveries'='[]'::jsonb,'Duplicate outbox expansion does not create duplicate device sends');
insert into aroma_push_test.saved values('productionClaim',api.claim_admin_push('production',10));
select aroma_push_test.ok((select jsonb_array_length(value->'deliveries')=1 from aroma_push_test.saved where key='productionClaim'),
 'Dispatcher leases only the configured environment');
reset role;
select aroma_push_test.ok((select count(*)=4 from private.admin_push_deliveries where kind='new_order'),'One delivery exists per event and eligible device');

-- Role loss cancels pending/in-flight work; reactivation does not opt in again.
update private.admin_memberships set active=false where user_id='e8000000-0000-4000-8000-000000000002';
select aroma_push_test.ok(not exists(select 1 from private.admin_push_subscriptions where user_id='e8000000-0000-4000-8000-000000000002' and enabled),
 'Losing the admin role immediately disables all devices');
set local role service_role;
select aroma_push_test.ok(api.check_admin_push_delivery((select (x->>'deliveryId')::uuid from aroma_push_test.saved s cross join jsonb_array_elements(s.value->'deliveries') x
 where s.key='ordersClaim' and x->>'endpoint' like '%fixture-b1'),
 (select (x->>'leaseId')::uuid from aroma_push_test.saved s cross join jsonb_array_elements(s.value->'deliveries') x
 where s.key='ordersClaim' and x->>'endpoint' like '%fixture-b1'))->>'allowed'='false','Lost role invalidates an already leased send');
reset role;
set local role authenticated;
select aroma_push_test.error('select api.admin_notifications()','42501','Revoked administrator cannot open the notification target center');
reset role;
update private.admin_memberships set active=true where user_id='e8000000-0000-4000-8000-000000000002';
select aroma_push_test.ok(not exists(select 1 from private.admin_push_subscriptions where user_id='e8000000-0000-4000-8000-000000000002' and enabled),
 'Role restoration requires fresh voluntary device opt-in');

-- Provider expiry disables only its subscription and prevents subsequent sends.
set local role service_role;
select api.finish_admin_push((select (x->>'deliveryId')::uuid from aroma_push_test.saved s cross join jsonb_array_elements(s.value->'deliveries') x where s.key='ordersClaim' and x->>'endpoint' like '%fixture-a1'),
 (select (x->>'leaseId')::uuid from aroma_push_test.saved s cross join jsonb_array_elements(s.value->'deliveries') x where s.key='ordersClaim' and x->>'endpoint' like '%fixture-a1'),'expired',410,'endpoint_expired');
reset role;
select aroma_push_test.ok((select not enabled from private.admin_push_subscriptions where endpoint like '%fixture-a1')
 and (select enabled from private.admin_push_subscriptions where endpoint like '%fixture-a2'),'Expired endpoint does not disable another device');
-- Lease crash recovery gets a fresh token; stale worker cannot acknowledge it.
update private.admin_push_deliveries d set lease_until=now()-interval '1 second' from private.admin_push_subscriptions s where s.id=d.subscription_id and s.endpoint like '%fixture-a2' and d.status='sending';
set local role service_role;
insert into aroma_push_test.saved values('leaseRetry',api.claim_admin_push('staging',10));
select aroma_push_test.ok((select jsonb_array_length(value->'deliveries')=1 from aroma_push_test.saved where key='leaseRetry'),'Expired worker lease is recoverable');
select aroma_push_test.ok(api.finish_admin_push((select (x->>'deliveryId')::uuid from aroma_push_test.saved s cross join jsonb_array_elements(s.value->'deliveries') x where s.key='ordersClaim' and x->>'endpoint' like '%fixture-a2'),
 (select (x->>'leaseId')::uuid from aroma_push_test.saved s cross join jsonb_array_elements(s.value->'deliveries') x where s.key='ordersClaim' and x->>'endpoint' like '%fixture-a2'),'accepted',201,null)->>'updated'='false','Stale worker cannot overwrite a newer retry');
reset role;
-- Exhaustion cleanup also covers crashes on the final allowed attempt.
update private.admin_push_deliveries set attempts=5,lease_until=now()-interval '1 second' where id=(select (value->'deliveries'->0->>'deliveryId')::uuid from aroma_push_test.saved where key='leaseRetry');
set local role service_role;
select aroma_push_test.ok(api.claim_admin_push('staging',10)->'deliveries'='[]'::jsonb,'Retry budget is finite even after a final-attempt crash');
reset role;
select aroma_push_test.ok((select status='failed' and attempts=5 from private.admin_push_deliveries where id=(select (value->'deliveries'->0->>'deliveryId')::uuid from aroma_push_test.saved where key='leaseRetry')),
 'Exhausted delivery remains recorded for diagnosis without blocking its order');
select aroma_push_test.ok((select count(*)=2 from app.orders),'Push failure never deletes or rolls back a valid stored order');

rollback;
