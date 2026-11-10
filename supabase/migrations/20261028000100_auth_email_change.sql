-- The Edge Function verifies identity/password before its Auth admin mutation.
-- This RPC supplies a shared atomic attempt limit, never an email-change API.
begin;

create table private.auth_email_change_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  attempt_count smallint not null check (attempt_count between 1 and 5)
);

alter table private.auth_email_change_attempts enable row level security;
alter table private.auth_email_change_attempts force row level security;
revoke all on table private.auth_email_change_attempts from public, anon, authenticated, service_role;
grant select, insert, update on table private.auth_email_change_attempts to aro_api_executor;

create policy auth_email_change_rate_executor
  on private.auth_email_change_attempts
  for all to aro_api_executor using (true) with check (true);

create function api.consume_email_change_attempt(p_user_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $function$
declare
  request_time timestamptz := pg_catalog.clock_timestamp();
  started_at timestamptz;
  next_attempt smallint;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'A user identifier is required.';
  end if;

  insert into private.auth_email_change_attempts as attempts
    (user_id, window_started_at, attempt_count)
  values (p_user_id, request_time, 1)
  on conflict (user_id) do update set
    window_started_at = case
      when attempts.window_started_at <= request_time - interval '15 minutes' then request_time
      else attempts.window_started_at end,
    attempt_count = case
      when attempts.window_started_at <= request_time - interval '15 minutes' then 1
      else attempts.attempt_count + 1 end
  where attempts.window_started_at <= request_time - interval '15 minutes'
    or attempts.attempt_count < 5
  returning window_started_at, attempt_count into started_at, next_attempt;

  if found then
    return pg_catalog.jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  select window_started_at into started_at
    from private.auth_email_change_attempts where user_id = p_user_id;
  return pg_catalog.jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', greatest(1, ceil(extract(epoch from (started_at + interval '15 minutes' - request_time))))::integer
  );
end;
$function$;

-- Required by ALTER OWNER; the executor cannot create further API functions.
grant create on schema api to aro_api_executor;
alter function api.consume_email_change_attempt(uuid) owner to aro_api_executor;
revoke create on schema api from aro_api_executor;
revoke all on function api.consume_email_change_attempt(uuid) from public, anon, authenticated;
-- Schema visibility grants no access to the existing owner-scoped RPCs: their
-- explicit service_role EXECUTE revocations remain unchanged.
grant usage on schema api to service_role;
grant execute on function api.consume_email_change_attempt(uuid) to service_role;

comment on function api.consume_email_change_attempt(uuid) is
  'Server-only: atomically consumes up to five email-change attempts per user in fifteen minutes. No Auth mutation.';

commit;
