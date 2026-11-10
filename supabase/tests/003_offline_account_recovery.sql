-- Disposable local PostgreSQL only. No hosted Auth mutation or saved code.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use the isolated SQL test runner only.';
  end if;
end $$;
create schema recovery_test;
create function recovery_test.ok(condition boolean,label text)
returns text language plpgsql security invoker set search_path='' as $$
begin if condition is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
grant usage on schema recovery_test to service_role;
grant execute on function recovery_test.ok(boolean,text) to service_role;

select recovery_test.ok(
  not has_function_privilege('anon','api.claim_account_recovery(text,text,uuid)','execute')
  and not has_function_privilege('authenticated','api.claim_account_recovery(text,text,uuid)','execute')
  and not has_function_privilege('authenticated','api.save_account_recovery_code(uuid,text,uuid)','execute')
  and has_function_privilege('service_role','api.claim_account_recovery(text,text,uuid)','execute'),
  'Only the server can claim or issue offline recovery codes'
);
select recovery_test.ok(
  not has_table_privilege('anon','private.account_recovery_codes','select,insert,update,delete')
  and not has_table_privilege('authenticated','private.account_recovery_codes','select,insert,update,delete')
  and not has_table_privilege('service_role','private.account_recovery_codes','select,insert,update,delete'),
  'No API role has direct access to code hashes'
);
select recovery_test.ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='private.account_recovery_codes'::regclass)
  and (select relrowsecurity and relforcerowsecurity from pg_class where oid='private.account_recovery_limits'::regclass),
  'Both private recovery tables force RLS'
);
insert into auth.users(id,email,raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','saved-code-a@example.invalid','{"firstName":"Recovery A","lastName":"Fixture","phone":"912345678"}'),
 ('30000000-0000-4000-8000-000000000002','saved-code-b@example.invalid','{"firstName":"Recovery B","lastName":"Fixture","phone":"923456789"}'),
 ('30000000-0000-4000-8000-000000000003','saved-code-admin@example.invalid','{"firstName":"Recovery admin","lastName":"Fixture","phone":"934567890"}');
insert into private.admin_memberships(user_id,active) values('30000000-0000-4000-8000-000000000003',true);
set local role service_role;
select recovery_test.ok(
  (api.account_recovery_status('30000000-0000-4000-8000-000000000001')->>'hasCode')::boolean=false,
  'An existing customer without a code reports no usable code'
);
select recovery_test.ok(
  api.account_recovery_status('30000000-0000-4000-8000-000000000003') is null
  and api.save_account_recovery_code('30000000-0000-4000-8000-000000000003',repeat('a',64),null) is null,
  'Administrative accounts cannot issue offline customer recovery codes'
);
select recovery_test.ok(
  api.save_account_recovery_code('30000000-0000-4000-8000-000000000001',repeat('b',64),null)->>'createdAt' is not null,
  'A server can save a code hash for the verified customer'
);
select recovery_test.ok(
  (api.account_recovery_status('30000000-0000-4000-8000-000000000001')->>'hasCode')::boolean
  and (api.account_recovery_status('30000000-0000-4000-8000-000000000002')->>'hasCode')::boolean=false,
  'Recovery-code status remains isolated by UUID'
);
select recovery_test.ok(
  api.claim_account_recovery('missing@example.invalid',repeat('b',64),'40000000-0000-4000-8000-000000000001') is null
  and api.claim_account_recovery('saved-code-a@example.invalid',repeat('c',64),'40000000-0000-4000-8000-000000000001') is null,
  'Unknown email and wrong code return the same null result'
);
select recovery_test.ok(
  api.claim_account_recovery('SAVED-CODE-A@example.invalid',repeat('b',64),'40000000-0000-4000-8000-000000000001')->>'userId'='30000000-0000-4000-8000-000000000001',
  'A valid code claims only its current canonical email owner'
);
select recovery_test.ok(
  api.claim_account_recovery('saved-code-a@example.invalid',repeat('b',64),'40000000-0000-4000-8000-000000000002') is null
  and not (api.account_recovery_status('30000000-0000-4000-8000-000000000001')->>'hasCode')::boolean,
  'A claimed code is single-use and cannot be consumed a second time'
);
select recovery_test.ok(
  not api.release_account_recovery_claim('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002')
  and api.save_account_recovery_code('30000000-0000-4000-8000-000000000001',repeat('d',64),'40000000-0000-4000-8000-000000000002') is null,
  'A different claim nonce cannot restore or replace a consumed code'
);
select recovery_test.ok(
  api.release_account_recovery_claim('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001'),
  'A definitive provider rejection can restore only its matching claim'
);
with claimed as materialized (select api.claim_account_recovery('saved-code-a@example.invalid',repeat('b',64),'40000000-0000-4000-8000-000000000003') result)
select recovery_test.ok(
  (select case when result is not null then api.save_account_recovery_code('30000000-0000-4000-8000-000000000001',repeat('e',64),'40000000-0000-4000-8000-000000000003') is not null else false end from claimed),
  'A successful recovery rotates the hash using its matching consumed claim'
);
select recovery_test.ok(
  api.claim_account_recovery('saved-code-a@example.invalid',repeat('b',64),'40000000-0000-4000-8000-000000000004') is null
  and api.claim_account_recovery('saved-code-a@example.invalid',repeat('e',64),'40000000-0000-4000-8000-000000000004') is not null,
  'The old code stays invalid after rotation while the replacement works'
);
with limits as materialized(select api.account_recovery_limit(repeat('f',64)) result from generate_series(1,5))
select recovery_test.ok((select count(*) from limits where(result->>'allowed')::boolean)=5,'Five attempts are accepted per bucket');
select recovery_test.ok(not(api.account_recovery_limit(repeat('f',64))->>'allowed')::boolean,'The sixth attempt is denied');
select recovery_test.ok((api.account_recovery_limit(repeat('a',64))->>'allowed')::boolean,'Different buckets have independent attempt limits');
reset role;
select recovery_test.ok((select count(*) from private.account_recovery_limits)<=3,'Limiter keeps only a global bucket and admitted hashed buckets');
update private.account_recovery_limits set window_started_at=clock_timestamp()-interval '16 minutes';
set local role service_role;
select recovery_test.ok((api.account_recovery_limit(repeat('f',64))->>'allowed')::boolean,'The attempt window resets after fifteen minutes');
reset role;
update private.account_recovery_limits set attempt_count=200 where bucket_hash=repeat('0',64);
set local role service_role;
select recovery_test.ok(not(api.account_recovery_limit(repeat('1',64))->>'allowed')::boolean,'A bounded global cap prevents allocating unlimited anonymous buckets');
reset role;
select recovery_test.ok(not exists(select 1 from private.account_recovery_limits where bucket_hash=repeat('1',64)),'Global admission failure cannot allocate another rate-limit row');
delete from auth.users where id='30000000-0000-4000-8000-000000000001';
select recovery_test.ok(not exists(select 1 from private.account_recovery_codes where user_id='30000000-0000-4000-8000-000000000001'),'Account removal cascades the private recovery-code hash');
rollback;
