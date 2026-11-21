-- All sequence manipulation in this file is confined to the disposable runner.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Only the isolated SQL runner may exercise sequence boundaries';
  end if;
end $$;
create schema aroma_order_reference_test;
grant usage on schema aroma_order_reference_test to anon;
create function aroma_order_reference_test.ok(p boolean,label text) returns text
language plpgsql set search_path='' as $$
begin if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;

select aroma_order_reference_test.ok(
  not has_sequence_privilege('anon','private.order_reference_seq','USAGE,UPDATE,SELECT')
  and not has_sequence_privilege('authenticated','private.order_reference_seq','USAGE,UPDATE,SELECT')
  and not has_sequence_privilege('service_role','private.order_reference_seq','USAGE,UPDATE,SELECT')
  and not has_function_privilege('anon','private.next_order_reference()','execute')
  and not has_function_privilege('authenticated','private.next_order_reference()','execute')
  and not has_function_privilege('service_role','private.next_order_reference()','execute'),
  'Only the trusted checkout executor can allocate order codes');
select aroma_order_reference_test.ok(
  exists(select 1 from pg_constraint where conrelid='app.orders'::regclass
    and contype='u' and pg_get_constraintdef(oid)='UNIQUE (reference)'),
  'The original unique order-reference constraint remains in force');
select aroma_order_reference_test.ok(
  strpos(pg_get_functiondef('api.create_simulated_order(uuid,text,jsonb,uuid)'::regprocedure),'private.next_order_reference()') >
  strpos(pg_get_functiondef('api.create_simulated_order(uuid,text,jsonb,uuid)'::regprocedure),'if found then'),
  'Reference allocation remains after idempotent replay checks');

-- Insert an already-issued short reference and an older hexadecimal reference.
-- Neither can be renumbered or taken over by the new allocator.
insert into app.orders(id,reference,operation_id,tracking_hash,request_hash,mode,simulation,payment_status,
  first_name,last_name,email,phone,delivery_method,subtotal_cents,product_discount_cents,discount_cents,shipping_cents,total_cents,
  shipping_estimate,department,province,district,street)
select x.id,x.ref,x.id,private.commerce_hash(repeat('R',64)),repeat('b',64),'guest',true,'pending',
  'SQL','Reference fixture','reference@example.invalid','999999999','courier',10000,0,0,0,10000,
  'SQL fixture','lima','1501','150131','SQL fixture'
from(values('ed800000-0000-4000-8000-000000000001'::uuid,'AI-999999'),
  ('ed800000-0000-4000-8000-000000000002'::uuid,'AI-0123456789ABCDEF')) x(id,ref);
select setval('private.order_reference_seq',999998,true);
select aroma_order_reference_test.ok(private.next_order_reference()='AI-1000000',
  'Occupied legacy code is skipped and seven digits are never truncated');
select aroma_order_reference_test.ok(private.next_order_reference()='AI-1000001',
  'Subsequent allocation remains unique beyond six digits');
select aroma_order_reference_test.ok((select reference='AI-999999' from app.orders where id='ed800000-0000-4000-8000-000000000001')
  and (select reference='AI-0123456789ABCDEF' from app.orders where id='ed800000-0000-4000-8000-000000000002'),
  'Legacy UUIDs and short or hexadecimal references remain unchanged');

set local role anon;
select aroma_order_reference_test.ok(api.order_tracking('AI-999999') is null
  and api.order_tracking('AI-0123456789ABCDEF') is null,
  'Neither a short code nor a legacy reference alone authorizes tracking');
select aroma_order_reference_test.ok(api.order_tracking('AI-999999',repeat('R',64))->>'reference'='AI-999999'
  and api.order_tracking('AI-0123456789ABCDEF',repeat('R',64))->>'reference'='AI-0123456789ABCDEF',
  'The independent private token authorizes both short and historical references');
reset role;
select aroma_order_reference_test.ok(api.order_tracking('AI-999999',repeat('x',64)) is null,
  'An incorrect private token cannot authorize a short-code order');
rollback;
