begin;
do $$begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Isolated runner required';end if;end$$;
create schema aroma_customer_identity_test;
create function aroma_customer_identity_test.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function aroma_customer_identity_test.error(statement text,code text,label text) returns text language plpgsql as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
 if actual is distinct from code then raise exception 'FAIL: %, expected %, got %',label,code,actual;end if;return 'PASS: '||label;end$$;
grant usage on schema aroma_customer_identity_test to anon,authenticated;
grant execute on all functions in schema aroma_customer_identity_test to anon,authenticated;
insert into auth.users(id,email,raw_user_meta_data) values
 ('e0390000-0000-4000-8000-000000000001','administrator@example.invalid','{}'),
 ('e0390000-0000-4000-8000-000000000002','customer-a@example.invalid','{"firstName":"Ana","lastName":"Cliente","phone":"999999999","role":"admin"}'),
 ('e0390000-0000-4000-8000-000000000003','customer-b@example.invalid','{"firstName":"Beatriz","lastName":"Cliente","phone":"988888888"}');
insert into private.admin_memberships(user_id,active) values('e0390000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{}',true);
set local role anon;
select aroma_customer_identity_test.error('select api.get_profile()','42501','Anonymous visitors cannot read account data');
reset role;
select set_config('request.jwt.claims','{"sub":"e0390000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_customer_identity_test.ok(api.current_actor()->>'role'='admin','Administrator identity remains admin before MFA');
select aroma_customer_identity_test.error('select api.get_profile()','42501','AAL1 administrator cannot become a customer');
select aroma_customer_identity_test.error('select api.customer_orders()','42501','Administrative bearer cannot read the customer order interface');
select aroma_customer_identity_test.error('select api.customer_favorites()','42501','Administrative bearer cannot use customer favorites');
select aroma_customer_identity_test.error('select api.get_address()','42501','Administrative bearer cannot use customer addresses');
select aroma_customer_identity_test.error('select api.customer_product_review(null)','42501','Administrative bearer cannot use a customer review identity');
reset role;
select set_config('request.jwt.claims','{"sub":"e0390000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_customer_identity_test.error('select api.get_profile()','42501','MFA does not opt an administrator into the customer audience');
select aroma_customer_identity_test.ok(api.admin_catalog_context() is not null,'Administrative permissions and MFA still work');
reset role;
select set_config('request.jwt.claims','{"sub":"e0390000-0000-4000-8000-000000000002","aal":"aal1"}',true);
set local role authenticated;
select aroma_customer_identity_test.ok(api.current_actor()->>'role'='customer','Editable metadata cannot grant admin identity');
select aroma_customer_identity_test.ok(api.get_profile()->>'user_id'='e0390000-0000-4000-8000-000000000002'
 and api.get_profile()->>'first_name'='Ana','Customer sees only their canonical profile');
select aroma_customer_identity_test.ok(api.get_address() is null and api.customer_orders()='[]'::jsonb
 and api.customer_favorites()->'productIds'='[]'::jsonb,'A new authenticated customer can have genuinely empty collections');
select aroma_customer_identity_test.error('select api.admin_catalog_context()','42501','Customer cannot use administrative RPCs');
reset role;
delete from app.profiles where user_id='e0390000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims','{"sub":"e0390000-0000-4000-8000-000000000003","aal":"aal1"}',true);
set local role authenticated;
select aroma_customer_identity_test.ok(api.get_profile() is null and api.customer_orders()='[]'::jsonb,'Missing profile remains distinct from missing authentication');
select aroma_customer_identity_test.ok(api.update_profile('Beatriz','Cliente','988888888')->>'user_id'='e0390000-0000-4000-8000-000000000003','Missing customer profile can be completed safely');
select aroma_customer_identity_test.ok(api.get_profile()->>'first_name'='Beatriz','Second customer never sees the first customer profile');
reset role;
insert into private.admin_memberships(user_id,active) values('e0390000-0000-4000-8000-000000000003',true);
set local role authenticated;
select aroma_customer_identity_test.error('select api.get_profile()','42501','Changing protected membership immediately invalidates customer access');
reset role;
select aroma_customer_identity_test.ok(not has_function_privilege('authenticated','private.require_customer_identity()','execute')
 and not has_table_privilege('authenticated','app.profiles','select,insert,update,delete')
 and not has_table_privilege('authenticated','private.admin_memberships','select,insert,update,delete'),'No browser raw table access or membership manipulation is added');
rollback;
