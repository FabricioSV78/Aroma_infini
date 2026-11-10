-- Disposable local PostgreSQL only. No hosted users or email delivery.
begin;

do $$
begin
  if current_setting('aroma.test_mode', true) is distinct from 'local-fixture' then
    raise exception 'Run through the isolated local SQL test runner only.';
  end if;
end
$$;

create schema aroma_email_test;
grant usage on schema aroma_email_test to service_role;
create function aroma_email_test.ok(condition boolean, label text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if condition is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end
$$;
grant execute on function aroma_email_test.ok(boolean, text) to service_role;

select aroma_email_test.ok(
  not has_function_privilege('anon', 'api.consume_email_change_attempt(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'api.consume_email_change_attempt(uuid)', 'execute')
  and has_function_privilege('service_role', 'api.consume_email_change_attempt(uuid)', 'execute'),
  'Only the server role can consume email-change attempts'
);
select aroma_email_test.ok(
  not has_table_privilege('anon', 'private.auth_email_change_attempts', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'private.auth_email_change_attempts', 'select,insert,update,delete')
  and not has_table_privilege('service_role', 'private.auth_email_change_attempts', 'select,insert,update,delete'),
  'No API caller has direct access to private email-change attempt rows'
);
select aroma_email_test.ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'private.auth_email_change_attempts'::regclass),
  'Email-change attempt table enforces RLS even for its table owner'
);
select aroma_email_test.ok(
  not has_schema_privilege('aro_api_executor', 'api', 'create'),
  'Email-change function ownership grants do not leave CREATE on the API schema'
);
select aroma_email_test.ok(
  not has_function_privilege('service_role', 'api.current_actor()', 'execute')
  and not has_function_privilege('service_role', 'api.update_profile(text,text,text)', 'execute'),
  'Server limiter grant does not widen access to existing owner-scoped RPCs'
);

insert into auth.users(id, email, raw_user_meta_data) values
  ('20000000-0000-4000-8000-000000000001', 'email-rate-a@example.invalid', '{"firstName":"Rate A","lastName":"Fixture","phone":"912345678"}'),
  ('20000000-0000-4000-8000-000000000002', 'email-rate-b@example.invalid', '{"firstName":"Rate B","lastName":"Fixture","phone":"923456789"}');

set local role service_role;
with attempts as materialized (
  select api.consume_email_change_attempt('20000000-0000-4000-8000-000000000001'::uuid) as result
  from generate_series(1, 5)
)
select aroma_email_test.ok(
  (select count(*) from attempts where (result->>'allowed')::boolean) = 5,
  'Five email-change attempts are accepted within a fresh window'
);
with blocked as materialized (
  select api.consume_email_change_attempt('20000000-0000-4000-8000-000000000001'::uuid) as result
)
select aroma_email_test.ok(
  (select not (result->>'allowed')::boolean and (result->>'retry_after_seconds')::integer between 1 and 900 from blocked),
  'The sixth email-change attempt is blocked with a bounded retry time'
);
select aroma_email_test.ok(
  (api.consume_email_change_attempt('20000000-0000-4000-8000-000000000002'::uuid)->>'allowed')::boolean,
  'Email-change attempt limits are independent for each account'
);
reset role;

update private.auth_email_change_attempts
  set window_started_at = clock_timestamp() - interval '16 minutes'
  where user_id = '20000000-0000-4000-8000-000000000001'::uuid;
set local role service_role;
select aroma_email_test.ok(
  (api.consume_email_change_attempt('20000000-0000-4000-8000-000000000001'::uuid)->>'allowed')::boolean,
  'A new email-change window accepts another attempt after expiry'
);
reset role;
select aroma_email_test.ok(
  (select attempt_count = 1 from private.auth_email_change_attempts where user_id = '20000000-0000-4000-8000-000000000001'::uuid),
  'An expired email-change window resets its attempt count atomically'
);
select aroma_email_test.ok(
  (select email = 'email-rate-a@example.invalid' from auth.users where id = '20000000-0000-4000-8000-000000000001'::uuid),
  'The rate-limiter RPC never changes Auth identity or email'
);
delete from auth.users where id = '20000000-0000-4000-8000-000000000001'::uuid;
select aroma_email_test.ok(
  not exists(select 1 from private.auth_email_change_attempts where user_id = '20000000-0000-4000-8000-000000000001'::uuid),
  'Temporary account removal cascades its attempt counter'
);
rollback;
