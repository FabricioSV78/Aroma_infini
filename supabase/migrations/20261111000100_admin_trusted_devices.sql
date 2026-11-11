-- Remembered administrative browsers are application authorization, never AAL2.
-- All public commands require a verified user JWT. Only the same-origin Worker
-- handles the raw, random cookie; neither tokens nor hashes are returned here.
-- Auth reads use narrow postgres-owned definers, matching account recovery:
-- hosted Supabase cannot grant our custom roles access to its managed schema.

create table private.admin_trusted_devices (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  label text not null check(char_length(label) between 1 and 80 and label !~ '[[:cntrl:]]'),
  factor_id uuid not null,
  credential_hash text not null check(credential_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  check(expires_at > created_at and expires_at <= created_at + interval '5184000 seconds'),
  check(created_by = user_id)
);
create index admin_trusted_devices_owner on private.admin_trusted_devices(user_id,created_at desc);
create table private.admin_trusted_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references private.admin_trusted_devices(id) on delete cascade,
  authorized_by_resume boolean not null default false,
  verified_claims_hash text not null check(verified_claims_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  expires_at timestamptz not null
);
create index admin_trusted_sessions_device on private.admin_trusted_sessions(device_id);
create table private.admin_trusted_device_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check(action in('register','resume')),
  window_started_at timestamptz not null,
  attempt_count integer not null check(attempt_count between 1 and 60),
  primary key(user_id,action)
);
alter table private.admin_trusted_devices enable row level security;
alter table private.admin_trusted_devices force row level security;
alter table private.admin_trusted_sessions enable row level security;
alter table private.admin_trusted_sessions force row level security;
alter table private.admin_trusted_device_limits enable row level security;
alter table private.admin_trusted_device_limits force row level security;
revoke all on private.admin_trusted_devices,private.admin_trusted_sessions,private.admin_trusted_device_limits
  from public,anon,authenticated,service_role,aro_api_executor;

create function private.admin_device_session()
returns table(user_id uuid,session_id uuid,assurance text,factor_id uuid,credential_hash text,verified_claims_hash text,password_verified boolean,totp_recent boolean)
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb;session_claim text;actor uuid:=private.request_user_id();methods jsonb;
begin
  claims:=coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
  session_claim:=claims->>'session_id';
  if actor is null or session_claim is null or session_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return;end if;
  methods:=case when pg_catalog.jsonb_typeof(claims->'amr')='array' then claims->'amr' else '[]'::jsonb end;
  return query select u.id,s.id,claims->>'aal',s.factor_id,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(u.encrypted_password,'UTF8')),'hex'),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(claims::text,'UTF8')),'hex'),
    exists(select 1 from pg_catalog.jsonb_array_elements(methods) m where m->>'method'='password'),
    exists(select 1 from pg_catalog.jsonb_array_elements(methods) m where m->>'method'='totp'
      and case when m->>'timestamp' ~ '^[0-9]{1,12}$' then (m->>'timestamp')::bigint
        between extract(epoch from pg_catalog.statement_timestamp())-300 and extract(epoch from pg_catalog.statement_timestamp())+30 else false end)
  from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id=session_claim::uuid and s.user_id=actor and (s.not_after is null or s.not_after>pg_catalog.statement_timestamp())
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=pg_catalog.statement_timestamp())
    and coalesce(u.encrypted_password,'')<>''
    and exists(select 1 from private.admin_memberships membership where membership.user_id=u.id and membership.active);
end $$;

create function private.admin_device_rate(p_user_id uuid,p_action text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare moment timestamptz:=pg_catalog.clock_timestamp();window_size interval;maximum integer;admitted boolean;
begin
  if p_action='register' then window_size:=interval '1 hour';maximum:=12;
  elsif p_action='resume' then window_size:=interval '15 minutes';maximum:=60;
  else return false;end if;
  insert into private.admin_trusted_device_limits as limits values(p_user_id,p_action,moment,1)
  on conflict(user_id,action) do update set
    window_started_at=case when limits.window_started_at<=moment-window_size then moment else limits.window_started_at end,
    attempt_count=case when limits.window_started_at<=moment-window_size then 1 else limits.attempt_count+1 end
    where limits.window_started_at<=moment-window_size or limits.attempt_count<maximum
  returning true into admitted;
  return coalesce(admitted,false);
end $$;

create function private.admin_device_trusted_until()
returns timestamptz language sql stable security definer set search_path='' as $$
  select least(grant_row.expires_at,device.expires_at)
  from private.admin_device_session() actor
  join private.admin_trusted_sessions grant_row on grant_row.session_id=actor.session_id and grant_row.user_id=actor.user_id
  join private.admin_trusted_devices device on device.id=grant_row.device_id and device.user_id=actor.user_id
  join auth.mfa_factors factor on factor.id=device.factor_id and factor.user_id=actor.user_id
  where actor.password_verified and grant_row.authorized_by_resume
    and grant_row.verified_claims_hash=actor.verified_claims_hash and device.revoked_at is null
    and device.expires_at>pg_catalog.statement_timestamp() and grant_row.expires_at>pg_catalog.statement_timestamp()
    and device.credential_hash=actor.credential_hash and factor.factor_type::text='totp' and factor.status::text='verified';
$$;

create function api.admin_device_register(p_token_hash text,p_label text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor record;moment timestamptz:=pg_catalog.clock_timestamp();device_id uuid;device_expiry timestamptz;
begin
  select * into actor from private.admin_device_session();
  if not found or actor.assurance is distinct from 'aal2' or not actor.password_verified or not actor.totp_recent
    or not exists(select 1 from auth.sessions s where s.id=actor.session_id and s.aal::text='aal2')
    or not exists(select 1 from auth.mfa_factors f where f.id=actor.factor_id and f.user_id=actor.user_id and f.factor_type::text='totp' and f.status::text='verified') then
    raise exception 'Completa una verificación reciente con tu autenticador.' using errcode='42501';end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_label is null
    or char_length(btrim(p_label)) not between 1 and 80 or p_label ~ '[[:cntrl:]]' then
    raise exception 'El dispositivo no es válido.' using errcode='22023';end if;
  -- Serialize a user's registration/cap/revocation operations, never all users.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor.user_id::text,729113));
  if not private.admin_device_rate(actor.user_id,'register') then raise exception 'Espera antes de recordar otro dispositivo.' using errcode='PT429';end if;
  if (select count(*) from private.admin_trusted_devices d where d.user_id=actor.user_id and d.revoked_at is null and d.expires_at>moment)>=50 then
    raise exception 'Revoca un dispositivo antes de añadir otro.' using errcode='22023';end if;
  device_expiry:=moment+interval '5184000 seconds';
  insert into private.admin_trusted_devices(user_id,token_hash,label,factor_id,credential_hash,created_at,created_by,expires_at,last_used_at)
    values(actor.user_id,p_token_hash,btrim(p_label),actor.factor_id,actor.credential_hash,moment,actor.user_id,device_expiry,moment) returning id into device_id;
  -- This row marks the current browser only. It cannot authorize a pre-MFA
  -- AAL1 JWT sharing the issuing session_id: cookie proof is still required.
  insert into private.admin_trusted_sessions(session_id,user_id,device_id,authorized_by_resume,verified_claims_hash,created_at,expires_at)
    values(actor.session_id,actor.user_id,device_id,false,actor.verified_claims_hash,moment,device_expiry)
    on conflict(session_id) do update set device_id=excluded.device_id,authorized_by_resume=false,
      verified_claims_hash=excluded.verified_claims_hash,created_at=excluded.created_at,expires_at=excluded.expires_at
      where private.admin_trusted_sessions.user_id=excluded.user_id;
  return pg_catalog.jsonb_build_object('id',device_id,'expires_at',device_expiry);
end $$;

create function api.admin_device_resume(p_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor record;device private.admin_trusted_devices%rowtype;moment timestamptz:=pg_catalog.clock_timestamp();
  denied constant jsonb:='{"trusted":false,"expires_at":null}'::jsonb;
begin
  select * into actor from private.admin_device_session();
  if not found then return denied;end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor.user_id::text,729113));
  if not private.admin_device_rate(actor.user_id,'resume') then return denied;end if;
  if not actor.password_verified or p_token is null or p_token !~ '^[0-9a-f]{64}$' then return denied;end if;
  select * into device from private.admin_trusted_devices d where d.user_id=actor.user_id
    and d.token_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex')
    and d.revoked_at is null and d.expires_at>moment and d.credential_hash=actor.credential_hash
    and exists(select 1 from auth.mfa_factors f where f.id=d.factor_id and f.user_id=actor.user_id and f.factor_type::text='totp' and f.status::text='verified') for update;
  if not found then return denied;end if;
  -- Bind authorization to exactly these verified claims, as well as the live
  -- Auth session. A different or refreshed JWT must prove the cookie again.
  insert into private.admin_trusted_sessions(session_id,user_id,device_id,authorized_by_resume,verified_claims_hash,created_at,expires_at)
    values(actor.session_id,actor.user_id,device.id,true,actor.verified_claims_hash,moment,device.expires_at)
    on conflict(session_id) do update set device_id=excluded.device_id,authorized_by_resume=true,
      verified_claims_hash=excluded.verified_claims_hash,created_at=excluded.created_at,expires_at=excluded.expires_at
      where private.admin_trusted_sessions.user_id=excluded.user_id;
  update private.admin_trusted_devices set last_used_at=moment where id=device.id;
  return pg_catalog.jsonb_build_object('trusted',true,'expires_at',device.expires_at);
end $$;

create function api.admin_device_list()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.request_user_id();current_session uuid;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  select session_id into current_session from private.admin_device_session();
  return pg_catalog.jsonb_build_object('items',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',d.id,'label',d.label,'created_at',d.created_at,'expires_at',d.expires_at,'last_used_at',d.last_used_at,
    'current',exists(select 1 from private.admin_trusted_sessions g where g.session_id=current_session and g.device_id=d.id and g.user_id=actor)) order by d.created_at desc)
    from private.admin_trusted_devices d where d.user_id=actor and d.revoked_at is null and d.expires_at>pg_catalog.statement_timestamp()),'[]'::jsonb));
end $$;

create function api.admin_device_revoke(p_device_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.request_user_id();changed boolean;is_current boolean;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,729113));
  select exists(select 1 from private.admin_trusted_sessions g join private.admin_device_session() session_actor
    on session_actor.session_id=g.session_id and session_actor.user_id=g.user_id
    where g.device_id=p_device_id and g.user_id=actor) into is_current;
  update private.admin_trusted_devices set revoked_at=pg_catalog.clock_timestamp(),revoked_by=actor,revoke_reason='owner'
    where id=p_device_id and user_id=actor and revoked_at is null returning true into changed;
  delete from private.admin_trusted_sessions where device_id=p_device_id and user_id=actor;
  return pg_catalog.jsonb_build_object('revoked',coalesce(changed,false),'current',is_current);
end $$;

-- Lifecycle revocation is monotonic: restoring a password/factor/membership
-- later never brings an old cookie back. Routine challenge timestamps do not
-- count as factor changes. These fast local writes make no network requests.
create function private.revoke_admin_device_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;reason text;
begin
  if tg_table_schema='auth' and tg_table_name='users' then
    if old.encrypted_password is not distinct from new.encrypted_password and old.email is not distinct from new.email
      and old.deleted_at is not distinct from new.deleted_at and old.banned_until is not distinct from new.banned_until then return null;end if;
    target:=old.id;reason:='credentials_changed';
  elsif tg_table_schema='auth' and tg_table_name='mfa_factors' then
    if tg_op='UPDATE' and old.user_id is not distinct from new.user_id and old.status is not distinct from new.status
      and old.factor_type is not distinct from new.factor_type and old.secret is not distinct from new.secret then return null;end if;
    target:=case when tg_op='INSERT' then new.user_id else old.user_id end;reason:='factor_changed';
  else
    if tg_op='UPDATE' and old.active is not distinct from new.active and old.granted_at is not distinct from new.granted_at
      and old.granted_by is not distinct from new.granted_by then return null;end if;
    target:=old.user_id;reason:='membership_changed';
  end if;
  update private.admin_trusted_devices set revoked_at=pg_catalog.clock_timestamp(),revoke_reason=reason
    where user_id=target and revoked_at is null;
  delete from private.admin_trusted_sessions where user_id=target;
  if tg_table_name='mfa_factors' and tg_op='UPDATE' then
    if old.user_id is distinct from new.user_id then
      update private.admin_trusted_devices set revoked_at=pg_catalog.clock_timestamp(),revoke_reason=reason where user_id=new.user_id and revoked_at is null;
      delete from private.admin_trusted_sessions where user_id=new.user_id;
    end if;
  end if;
  return null;
end $$;
create trigger admin_device_user_security after update of encrypted_password,email,deleted_at,banned_until on auth.users
  for each row execute function private.revoke_admin_device_lifecycle();
create trigger admin_device_factor_security after insert or update or delete on auth.mfa_factors
  for each row execute function private.revoke_admin_device_lifecycle();
create trigger admin_device_membership_security after update or delete on private.admin_memberships
  for each row execute function private.revoke_admin_device_lifecycle();

create or replace function private.is_admin()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.request_user_id();
begin
  if actor is null then return false;end if;
  if not exists(select 1 from private.admin_memberships m where m.user_id=actor and m.active) then return false;end if;
  return coalesce(private.request_assurance(),'')='aal2' or private.admin_device_trusted_until() is not null;
end $$;

create or replace function api.current_actor()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.request_user_id();member boolean;assurance text:=private.request_assurance();trusted_until timestamptz;
begin
  if actor is null then raise exception 'Authentication required.' using errcode='42501';end if;
  member:=private.current_user_membership();
  if member then trusted_until:=private.admin_device_trusted_until();end if;
  return pg_catalog.jsonb_build_object('user_id',actor,'role',case when member then 'admin' else 'customer' end,
    'aal',case when assurance in('aal1','aal2') then assurance else null end,
    'requires_mfa',member and not private.is_admin(),'trusted_device',trusted_until is not null,'trusted_until',trusted_until);
end $$;

revoke all on function private.admin_device_session(),private.admin_device_rate(uuid,text),private.admin_device_trusted_until(),
  private.revoke_admin_device_lifecycle(),api.admin_device_register(text,text),api.admin_device_resume(text),api.admin_device_list(),api.admin_device_revoke(uuid)
  from public,anon,authenticated,service_role,aro_api_executor;
grant execute on function private.admin_device_trusted_until() to aro_api_executor;
grant execute on function api.admin_device_register(text,text),api.admin_device_resume(text),api.admin_device_list(),api.admin_device_revoke(uuid) to authenticated;
comment on table private.admin_trusted_devices is 'SHA256 of 256-bit HttpOnly cookie tokens only; fixed 60-day authorization, never credentials or fabricated Auth AAL.';
comment on table private.admin_trusted_sessions is 'Cookie-proven authorization bound to an existing Supabase Auth session and canonical verified JWT claims; registration linkage alone never authorizes AAL1.';
comment on function private.is_admin() is 'Active protected membership plus real AAL2 or current server-verified device grant; actual JWT assurance is never changed.';
