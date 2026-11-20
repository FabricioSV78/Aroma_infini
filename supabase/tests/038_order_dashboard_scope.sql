begin;
do $$begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
  raise exception 'Use only the isolated SQL runner';end if;end$$;
create schema aroma_dashboard_scope_test;
create function aroma_dashboard_scope_test.ok(value boolean,label text) returns text language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function aroma_dashboard_scope_test.error(statement text,expected text,label text) returns text language plpgsql as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from expected then raise exception 'FAIL: %, expected %, got %',label,expected,actual;end if;return 'PASS: '||label;end$$;
grant usage on schema aroma_dashboard_scope_test to anon,authenticated;
grant execute on all functions in schema aroma_dashboard_scope_test to anon,authenticated;
insert into auth.users(id,email) values('e0380000-0000-4000-8000-000000000001','dashboard-scope@example.invalid');
insert into private.admin_memberships(user_id,active) values('e0380000-0000-4000-8000-000000000001',true);
insert into app.orders(id,reference,operation_id,tracking_hash,request_hash,mode,first_name,last_name,email,phone,delivery_method,
  subtotal_cents,product_discount_cents,discount_cents,shipping_cents,total_cents,shipping_estimate,department,province,district,street,status,placed_at)
select ('e0380000-0000-4000-8000-'||lpad((i+10)::text,12,'0'))::uuid,'AI-DASHBOARD-'||i,
  ('e0380000-0000-4000-8000-'||lpad((i+20)::text,12,'0'))::uuid,repeat('a',64),repeat('b',64),'guest',
  'Scope','Fixture','dashboard@example.invalid','999999999','courier',12000,0,0,1000,13000,'Fixture','lima','1501','150131','Fixture street 123',
  (array['received','preparing','shipped','delivered','cancelled','expired'])[i],
  case when i=1 then '2026-11-17 04:59:59+00'::timestamptz else '2026-11-18 05:00:00+00'::timestamptz end
from generate_series(1,6)i;
set constraints all immediate;set constraints all deferred;
select set_config('request.jwt.claims','{}',true);
set local role anon;
select aroma_dashboard_scope_test.error('select api.admin_order_list(''{"includeSimulation":true}'',1,4,''dashboard'')','42501','Simulated dashboard scope never bypasses admin access');
reset role;
select set_config('request.jwt.claims','{"sub":"e0380000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_dashboard_scope_test.error('select api.admin_order_list(''{"includeSimulation":true}'',1,4,''dashboard'')','42501','Operational dashboard still requires MFA');
reset role;
select set_config('request.jwt.claims','{"sub":"e0380000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_dashboard_scope_test.ok(api.admin_order_list('{}',1,4,'dashboard')->>'total'='0'
  and api.admin_order_list('{}',1,4,'dashboard')->'counts'->>'preparing'='0','Default dashboard excludes simulations without manufacturing sales');
select aroma_dashboard_scope_test.ok(api.admin_order_list('{"includeSimulation":true}',1,4,'dashboard')->>'total'='6'
  and jsonb_array_length(api.admin_order_list('{"includeSimulation":true}',1,4,'dashboard')->'orders')=4,
  'Staging operational scope has correct total and remains remotely paginated');
select aroma_dashboard_scope_test.ok(api.admin_order_list('{"includeSimulation":true}',1,4,'dashboard')->'counts'=
  '{"received":1,"preparing":1,"shipped":1,"delivered":1}'::jsonb
  and api.admin_order_list('{"includeSimulation":true}',1,4,'dashboard')->>'toPrepare'='2',
  'Four operational counters and toPrepare include tests without counting terminal orders');
select aroma_dashboard_scope_test.ok(api.admin_order_list('{"includeSimulation":true,"from":"2026-11-18","until":"2026-11-18"}',1,4,'dashboard')->>'total'='5'
  and api.admin_order_list('{"includeSimulation":true,"from":"2026-11-18","until":"2026-11-18"}',1,4,'dashboard')->'counts'->>'received'='0',
  'Lima dates scope rows and counts consistently');
select aroma_dashboard_scope_test.ok(api.admin_order_list('{"includeSimulation":true,"status":"preparing"}',1,4,'dashboard')->>'total'='1'
  and api.admin_order_list('{"includeSimulation":true,"status":"preparing"}',1,4,'dashboard')->'counts'=
  '{"received":0,"preparing":1,"shipped":0,"delivered":0}'::jsonb,
  'Status scope uses the same candidate set for counts and rows');
select aroma_dashboard_scope_test.ok(api.admin_order_list('{"search":"AI-DASHBOARD-2"}')->'counts'->>'preparing'='1'
  and api.admin_order_list('{"search":"AI-DASHBOARD-2"}')->'counts'->>'shipped'='0',
  'Order list search no longer returns unrelated global counters');
select aroma_dashboard_scope_test.error('select api.admin_order_list(''{"includeSimulation":"true"}'',1,4,''dashboard'')','22023','Scope requires a boolean, never a truthy string');
select aroma_dashboard_scope_test.error('select api.admin_order_list(''{"includeSimulation":true}'')','22023','Dashboard-only flag cannot silently change other list modes');
reset role;
select aroma_dashboard_scope_test.ok((select bool_and(payment_status='pending' and payment_verified_at is null) from app.orders),
  'Dashboard reads never approve payment');
reset role;
rollback;
