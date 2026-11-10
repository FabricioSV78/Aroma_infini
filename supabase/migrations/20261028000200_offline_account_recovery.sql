-- Saved recovery codes: server-only, hashed, atomic single-use consumption.
-- No SMTP, email token, phone check, public Auth lookup or arbitrary user API.
begin;

create table private.account_recovery_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  consumed_at timestamptz,
  claim_id uuid,
  constraint recovery_claim_consistent check ((consumed_at is null) = (claim_id is null))
);
create table private.account_recovery_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count between 1 and 200)
);
alter table private.account_recovery_codes enable row level security;
alter table private.account_recovery_codes force row level security;
alter table private.account_recovery_limits enable row level security;
alter table private.account_recovery_limits force row level security;
revoke all on private.account_recovery_codes, private.account_recovery_limits
  from public, anon, authenticated, service_role, aro_api_executor;

-- These narrow functions remain owned by postgres: the hosted Auth schema
-- cannot grant custom roles USAGE. No Auth table privilege is widened.
create function api.account_recovery_limit(p_bucket_hash text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare
  request_time timestamptz := pg_catalog.clock_timestamp();
  started_at timestamptz;
  global_bucket constant text := pg_catalog.repeat('0',64);
begin
  if p_bucket_hash is null or p_bucket_hash !~ '^[0-9a-f]{64}$' or p_bucket_hash = global_bucket then
    raise exception using errcode='22023', message='Invalid recovery attempt bucket.';
  end if;
  -- A fixed global bucket bounds anonymous writes and serializes admission.
  -- At most 200 distinct attempts can allocate rows per fifteen-minute window.
  perform pg_catalog.pg_advisory_xact_lock(728941512039::bigint);
  delete from private.account_recovery_limits
    where window_started_at < request_time - interval '1 hour';
  insert into private.account_recovery_limits as attempts values(global_bucket,request_time,1)
  on conflict(bucket_hash) do update set
    window_started_at=case when attempts.window_started_at <= request_time-interval '15 minutes' then request_time else attempts.window_started_at end,
    attempt_count=case when attempts.window_started_at <= request_time-interval '15 minutes' then 1 else attempts.attempt_count+1 end
  where attempts.window_started_at <= request_time-interval '15 minutes' or attempts.attempt_count < 200
  returning window_started_at into started_at;
  if not found then
    select window_started_at into started_at from private.account_recovery_limits where bucket_hash=global_bucket;
    return pg_catalog.jsonb_build_object('allowed',false,'retry_after_seconds',greatest(1,ceil(extract(epoch from(started_at+interval '15 minutes'-request_time))))::integer);
  end if;
  insert into private.account_recovery_limits as attempts values(p_bucket_hash,request_time,1)
  on conflict(bucket_hash) do update set
    window_started_at=case when attempts.window_started_at <= request_time-interval '15 minutes' then request_time else attempts.window_started_at end,
    attempt_count=case when attempts.window_started_at <= request_time-interval '15 minutes' then 1 else attempts.attempt_count+1 end
  where attempts.window_started_at <= request_time-interval '15 minutes' or attempts.attempt_count < 5
  returning window_started_at into started_at;
  if found then return pg_catalog.jsonb_build_object('allowed',true,'retry_after_seconds',0); end if;
  select window_started_at into started_at from private.account_recovery_limits where bucket_hash=p_bucket_hash;
  return pg_catalog.jsonb_build_object('allowed',false,'retry_after_seconds',greatest(1,ceil(extract(epoch from(started_at+interval '15 minutes'-request_time))))::integer);
end;
$function$;

create function api.account_recovery_status(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'hasCode', exists(select 1 from private.account_recovery_codes c where c.user_id=p_user_id and c.consumed_at is null),
    'createdAt',(select c.created_at from private.account_recovery_codes c where c.user_id=p_user_id and c.consumed_at is null)
  ) where exists(select 1 from auth.users u where u.id=p_user_id)
    and not exists(select 1 from private.admin_memberships m where m.user_id=p_user_id and m.active);
$function$;

create function api.save_account_recovery_code(p_user_id uuid,p_code_hash text,p_claim_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare saved_at timestamptz;
begin
  if p_user_id is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='Invalid recovery code data.';
  end if;
  if exists(select 1 from private.admin_memberships m where m.user_id=p_user_id and m.active) then return null; end if;
  if p_claim_id is not null then
    update private.account_recovery_codes set code_hash=p_code_hash,created_at=pg_catalog.clock_timestamp(),consumed_at=null,claim_id=null
      where user_id=p_user_id and claim_id=p_claim_id and consumed_at is not null returning created_at into saved_at;
  else
    insert into private.account_recovery_codes as codes(user_id,code_hash) values(p_user_id,p_code_hash)
    on conflict(user_id) do update set code_hash=excluded.code_hash,created_at=pg_catalog.clock_timestamp(),consumed_at=null,claim_id=null
      where codes.claim_id is null or codes.consumed_at < pg_catalog.clock_timestamp()-interval '5 minutes'
    returning created_at into saved_at;
  end if;
  if saved_at is null then return null; end if;
  return pg_catalog.jsonb_build_object('createdAt',saved_at);
end;
$function$;

create function api.claim_account_recovery(p_email text,p_code_hash text,p_claim_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $function$
declare target uuid;
begin
  if p_email is null or length(p_email)>254 or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' or p_claim_id is null then return null; end if;
  update private.account_recovery_codes c set consumed_at=pg_catalog.clock_timestamp(),claim_id=p_claim_id
    where c.code_hash=p_code_hash and c.consumed_at is null
    and exists(select 1 from auth.users u where u.id=c.user_id
      and pg_catalog.lower(u.email)=pg_catalog.lower(pg_catalog.btrim(p_email))
      and coalesce(pg_catalog.to_jsonb(u)->>'deleted_at','')='' and not coalesce((pg_catalog.to_jsonb(u)->>'is_anonymous')::boolean,false)
      and not exists(select 1 from private.admin_memberships m where m.user_id=u.id and m.active))
    returning c.user_id into target;
  if target is null then return null; end if;
  return pg_catalog.jsonb_build_object('userId',target);
end;
$function$;

create function api.release_account_recovery_claim(p_user_id uuid,p_claim_id uuid)
returns boolean language plpgsql volatile security definer set search_path = ''
as $function$
begin
  -- Only a pre-PUT failure or definite provider rejection may restore a claim.
  -- Timeouts/unknown results after issuing PUT never make the code reusable.
  update private.account_recovery_codes set consumed_at=null,claim_id=null
    where user_id=p_user_id and claim_id=p_claim_id and consumed_at is not null;
  return found;
end;
$function$;

revoke all on function api.account_recovery_limit(text),api.account_recovery_status(uuid),
  api.save_account_recovery_code(uuid,text,uuid),api.claim_account_recovery(text,text,uuid),
  api.release_account_recovery_claim(uuid,uuid) from public,anon,authenticated,aro_api_executor;
grant usage on schema api to service_role;
grant execute on function api.account_recovery_limit(text),api.account_recovery_status(uuid),
  api.save_account_recovery_code(uuid,text,uuid),api.claim_account_recovery(text,text,uuid),
  api.release_account_recovery_claim(uuid,uuid) to service_role;
comment on table private.account_recovery_codes is 'Only SHA256 hashes of 256-bit saved recovery codes. Never plaintext codes.';
comment on table private.account_recovery_limits is 'Bounded HMAC-keyed recovery attempts; no raw email or IP address.';
commit;
