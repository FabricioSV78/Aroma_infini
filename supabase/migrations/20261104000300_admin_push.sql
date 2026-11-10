-- Administrative Web Push outbox. No provider calls, simulated sales, browser
-- enqueue command, or change to the current pending-payment commerce boundary.
create role aro_admin_push_executor nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
grant aro_admin_push_executor to postgres;
grant usage on schema app,api,private to aro_admin_push_executor;
grant execute on function private.require_catalog_admin(),private.is_admin(),private.request_user_id(),private.commerce_hash(text),private.home_object(jsonb,text[],text[]) to aro_admin_push_executor;

-- This marker is deliberately unreachable through all current order commands.
-- A future verified payment-provider migration must explicitly lift the two
-- existing simulation/pending CHECKs before any commercial event can exist.
alter table app.orders add column payment_verified_at timestamptz;
alter table app.orders add constraint order_payment_verification_boundary
  check(payment_verified_at is null or (not simulation and payment_status='approved'));

create table private.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  environment text not null check(environment in('development','staging','production')),
  device_label text not null check(char_length(device_label) between 1 and 80),
  endpoint text not null check(char_length(endpoint) between 12 and 2048),
  endpoint_hash text not null check(endpoint_hash ~ '^[a-f0-9]{64}$'),
  p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}$'),
  enabled boolean not null default true,
  version bigint not null default 1 check(version>0),
  enabled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  last_test_at timestamptz,last_error_code text,
  unique(environment,endpoint_hash),unique(environment,user_id,device_id)
);
create index admin_push_subscriptions_owner on private.admin_push_subscriptions(user_id,environment) where enabled;

create table app.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind='new_order'),
  order_id uuid not null references app.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  fanned_out boolean not null default false,
  unique(order_id,kind)
);
create index admin_notifications_recent on app.admin_notifications(created_at desc,id);
create index admin_notifications_outbox on app.admin_notifications(created_at,id) where not fanned_out;

create table private.admin_notification_reads (
  notification_id uuid not null references app.admin_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),primary key(notification_id,user_id)
);
create index admin_notification_reads_owner on private.admin_notification_reads(user_id,notification_id);

create table private.admin_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references app.admin_notifications(id) on delete cascade,
  subscription_id uuid not null references private.admin_push_subscriptions(id) on delete cascade,
  kind text not null check(kind in('new_order','test')),
  status text not null default 'pending' check(status in('pending','sending','accepted','expired','failed','revoked')),
  attempts smallint not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null default(now()+interval '24 hours'),
  lease_id uuid,lease_until timestamptz,lease_subscription_version bigint,
  last_http_status integer check(last_http_status between 100 and 599),
  last_error_code text check(last_error_code ~ '^[a-z0-9_-]{1,80}$'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(notification_id,subscription_id),
  check((kind='test' and notification_id is null) or (kind='new_order' and notification_id is not null)),
  check((status='sending')=(lease_id is not null and lease_until is not null))
);
create index admin_push_deliveries_due on private.admin_push_deliveries(next_attempt_at,id) where status in('pending','sending');

do $$ declare t regclass;begin
  foreach t in array array['private.admin_push_subscriptions'::regclass,'app.admin_notifications'::regclass,
    'private.admin_notification_reads'::regclass,'private.admin_push_deliveries'::regclass] loop
    execute format('alter table %s enable row level security',t);
    execute format('alter table %s force row level security',t);
    execute format('revoke all on %s from public,anon,authenticated,service_role',t);
    execute format('grant select,insert,update,delete on %s to aro_admin_push_executor',t);
    execute format('create policy push_executor_access on %s to aro_admin_push_executor using(true) with check(true)',t);
  end loop;
end $$;
grant select(id,reference,simulation,payment_status,payment_verified_at) on app.orders to aro_admin_push_executor;
create policy push_orders_read on app.orders for select to aro_admin_push_executor using(true);
grant select(user_id,active) on private.admin_memberships to aro_admin_push_executor;
create policy push_memberships_read on private.admin_memberships for select to aro_admin_push_executor using(true);

create function private.push_validate_environment(p_environment text) returns void language plpgsql immutable set search_path='' as $$
begin
  if p_environment is null or p_environment not in('development','staging','production') then
    raise exception 'El entorno de notificaciones no es válido.' using errcode='22023';
  end if;
end $$;

create function api.admin_push_device(p_environment text,p_device_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin();perform private.push_validate_environment(p_environment);
  if p_device_id is null then raise exception 'El dispositivo no es válido.' using errcode='22023';end if;
  return jsonb_build_object('device',(select jsonb_build_object('enabled',s.enabled,'label',s.device_label)
    from private.admin_push_subscriptions s where s.user_id=private.request_user_id() and s.environment=p_environment and s.device_id=p_device_id));
end $$;

create function api.admin_push_subscribe(p_environment text,p_device_id uuid,p_device_label text,p_subscription jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.request_user_id();v_endpoint text;v_hash text;v_label text;existing private.admin_push_subscriptions%rowtype;
begin
  perform private.require_catalog_admin();perform private.push_validate_environment(p_environment);
  perform private.home_object(p_subscription,array['endpoint','keys'],array['endpoint','keys']);
  perform private.home_object(p_subscription->'keys',array['p256dh','auth'],array['p256dh','auth']);
  v_endpoint:=p_subscription->>'endpoint';v_label:=btrim(p_device_label);
  if p_device_id is null or v_label is null or char_length(v_label) not between 1 and 80 or v_label~'[[:cntrl:]]'
    or jsonb_typeof(p_subscription->'endpoint') is distinct from 'string' or char_length(v_endpoint)>2048
    or v_endpoint!~'^https://[A-Za-z0-9][A-Za-z0-9.-]*(:443)?/[^[:space:]]+$' or v_endpoint~'[[:cntrl:]]'
    or jsonb_typeof(p_subscription->'keys'->'p256dh') is distinct from 'string' or (p_subscription->'keys'->>'p256dh')!~'^[A-Za-z0-9_-]{87}$'
    or jsonb_typeof(p_subscription->'keys'->'auth') is distinct from 'string' or (p_subscription->'keys'->>'auth')!~'^[A-Za-z0-9_-]{22}$' then
    raise exception 'Revisa los datos de este dispositivo.' using errcode='22023';
  end if;
  v_hash:=private.commerce_hash(v_endpoint);
  perform pg_advisory_xact_lock(hashtextextended('push-device:'||p_environment||':'||actor::text,0));
  perform pg_advisory_xact_lock(hashtextextended('push-endpoint:'||p_environment||':'||v_hash,0));
  select * into existing from private.admin_push_subscriptions where environment=p_environment and endpoint_hash=v_hash for update;
  if found and (existing.user_id<>actor or existing.device_id<>p_device_id) then
    raise exception 'Este navegador está vinculado a otra cuenta o instalación. Retira el permiso del navegador y vuelve a activarlo para crear una suscripción nueva.' using errcode='PT409';
  end if;
  if not exists(select 1 from private.admin_push_subscriptions where user_id=actor and environment=p_environment and device_id=p_device_id and enabled)
    and (select count(*) from private.admin_push_subscriptions where user_id=actor and environment=p_environment and enabled)>=20 then
    raise exception 'Has alcanzado el máximo de dispositivos activos.' using errcode='22023';
  end if;
  insert into private.admin_push_subscriptions(user_id,device_id,environment,device_label,endpoint,endpoint_hash,p256dh,auth)
    values(actor,p_device_id,p_environment,v_label,v_endpoint,v_hash,p_subscription->'keys'->>'p256dh',p_subscription->'keys'->>'auth')
    on conflict(environment,user_id,device_id) do update set device_label=excluded.device_label,endpoint=excluded.endpoint,
      endpoint_hash=excluded.endpoint_hash,p256dh=excluded.p256dh,auth=excluded.auth,enabled=true,last_error_code=null,
      enabled_at=case when not private.admin_push_subscriptions.enabled or private.admin_push_subscriptions.endpoint_hash<>excluded.endpoint_hash
        or private.admin_push_subscriptions.p256dh<>excluded.p256dh then now() else private.admin_push_subscriptions.enabled_at end,
      version=private.admin_push_subscriptions.version+1,updated_at=now();
  return jsonb_build_object('device',jsonb_build_object('enabled',true,'label',v_label));
end $$;

create function api.admin_push_unsubscribe(p_environment text,p_device_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare sid uuid;
begin
  perform private.require_catalog_admin();perform private.push_validate_environment(p_environment);
  if p_device_id is null then raise exception 'El dispositivo no es válido.' using errcode='22023';end if;
  update private.admin_push_subscriptions set enabled=false,version=version+1,updated_at=now()
    where user_id=private.request_user_id() and environment=p_environment and device_id=p_device_id returning id into sid;
  update private.admin_push_deliveries set status='revoked',lease_id=null,lease_until=null,updated_at=now()
    where subscription_id=sid and status in('pending','sending');
  return api.admin_push_device(p_environment,p_device_id);
end $$;

create function api.admin_push_test(p_environment text,p_device_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s private.admin_push_subscriptions%rowtype;delivery uuid;
begin
  perform private.require_catalog_admin();perform private.push_validate_environment(p_environment);
  perform pg_advisory_xact_lock(hashtextextended('push-test:'||private.request_user_id()::text,0));
  select * into s from private.admin_push_subscriptions where user_id=private.request_user_id() and environment=p_environment and device_id=p_device_id for update;
  if not found or not s.enabled then raise exception 'Activa primero las notificaciones de este dispositivo.' using errcode='22023';end if;
  if s.last_test_at>now()-interval '1 minute' then raise exception 'Espera un minuto antes de enviar otra prueba.' using errcode='PT429';end if;
  if (select count(*) from private.admin_push_subscriptions where user_id=private.request_user_id() and last_test_at>now()-interval '1 minute')>=5 then
    raise exception 'Espera un minuto antes de probar más dispositivos.' using errcode='PT429';
  end if;
  update private.admin_push_subscriptions set last_test_at=now(),updated_at=now() where id=s.id;
  insert into private.admin_push_deliveries(subscription_id,kind,expires_at) values(s.id,'test',now()+interval '10 minutes') returning id into delivery;
  return jsonb_build_object('queued',true,'deliveryId',delivery);
end $$;

create function api.admin_notifications(p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.request_user_id();
begin
  perform private.require_catalog_admin();
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'El límite de avisos no es válido.' using errcode='22023';end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'orderReference',o.reference,
    'createdAt',to_char(n.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'read',r.notification_id is not null) order by n.created_at desc,n.id)
    from (select * from app.admin_notifications order by created_at desc,id limit p_limit) n join app.orders o on o.id=n.order_id
      left join private.admin_notification_reads r on r.notification_id=n.id and r.user_id=actor),'[]'::jsonb),
    'unreadCount',(select count(*) from app.admin_notifications n where not exists(select 1 from private.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor)));
end $$;

create function api.admin_read_notifications(p_ids uuid[] default null,p_all boolean default false) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.request_user_id();changed integer;
begin
  perform private.require_catalog_admin();
  if p_all is null or (p_all and p_ids is not null) or (not p_all and (p_ids is null or cardinality(p_ids) not between 1 and 100)) then
    raise exception 'Selecciona los avisos que deseas marcar como leídos.' using errcode='22023';
  end if;
  insert into private.admin_notification_reads(notification_id,user_id)
    select id,actor from app.admin_notifications where p_all or id=any(p_ids) on conflict do nothing;
  get diagnostics changed=row_count;
  return jsonb_build_object('updated',changed,'unreadCount',(select count(*) from app.admin_notifications n
    where not exists(select 1 from private.admin_notification_reads r where r.notification_id=n.id and r.user_id=actor)));
end $$;

create function private.enqueue_admin_order_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not new.simulation and new.payment_status='approved' and new.payment_verified_at is not null then
    insert into app.admin_notifications(kind,order_id) values('new_order',new.id) on conflict(order_id,kind) do nothing;
  end if;
  return new;
end $$;
create trigger admin_order_notification after insert or update of simulation,payment_status,payment_verified_at on app.orders
  for each row execute function private.enqueue_admin_order_notification();

create function private.revoke_admin_push_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' or not new.active then
    update private.admin_push_subscriptions set enabled=false,version=version+1,last_error_code='role_revoked',updated_at=now() where user_id=old.user_id and enabled;
    update private.admin_push_deliveries d set status='revoked',lease_id=null,lease_until=null,last_error_code='role_revoked',updated_at=now()
      from private.admin_push_subscriptions s where d.subscription_id=s.id and s.user_id=old.user_id and d.status in('pending','sending');
  end if;
  return null;
end $$;
create trigger revoke_admin_push_membership after update of active or delete on private.admin_memberships
  for each row execute function private.revoke_admin_push_membership();

create function api.claim_admin_push(p_environment text,p_limit integer default 20,p_delivery_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare event record;delivery record;claimed jsonb:='[]'::jsonb;lease uuid;
begin
  perform private.push_validate_environment(p_environment);
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'El tamaño del lote no es válido.' using errcode='22023';end if;
  if p_delivery_id is null then
    -- Fan-out happens outside the order transaction, once across all namespaces.
    -- Devices activated after an event do not receive historical push notices.
    for event in select id,created_at from app.admin_notifications where not fanned_out order by created_at,id limit 100 for update skip locked loop
      if event.created_at>now()-interval '24 hours' then
        insert into private.admin_push_deliveries(notification_id,subscription_id,kind,expires_at)
          select event.id,s.id,'new_order',event.created_at+interval '24 hours' from private.admin_push_subscriptions s
            join private.admin_memberships m on m.user_id=s.user_id and m.active
          where s.enabled and s.enabled_at<=event.created_at on conflict(notification_id,subscription_id) do nothing;
      end if;
      update app.admin_notifications set fanned_out=true where id=event.id;
    end loop;
  end if;
  update private.admin_push_deliveries d set status=case when d.expires_at<=now() then 'expired' when d.attempts>=5 then 'failed' else 'revoked' end,
    lease_id=null,lease_until=null,updated_at=now()
    from private.admin_push_subscriptions s where d.subscription_id=s.id and s.environment=p_environment and d.status in('pending','sending')
      and (p_delivery_id is null or d.id=p_delivery_id)
      and ((d.status='pending' or d.lease_until<=now()) and (d.expires_at<=now() or d.attempts>=5 or not s.enabled
        or not exists(select 1 from private.admin_memberships m where m.user_id=s.user_id and m.active)));
  for delivery in select d.id,d.notification_id,d.kind,s.endpoint,s.p256dh,s.auth,s.version as subscription_version,o.reference
    from private.admin_push_deliveries d join private.admin_push_subscriptions s on s.id=d.subscription_id
      join private.admin_memberships m on m.user_id=s.user_id and m.active
      left join app.admin_notifications n on n.id=d.notification_id left join app.orders o on o.id=n.order_id
    where s.environment=p_environment and s.enabled and d.attempts<5 and d.expires_at>now() and d.next_attempt_at<=now()
      and (d.status='pending' or (d.status='sending' and d.lease_until<=now())) and (p_delivery_id is null or d.id=p_delivery_id)
    order by d.next_attempt_at,d.id limit p_limit for update of d skip locked loop
    lease:=gen_random_uuid();
    update private.admin_push_deliveries set status='sending',attempts=attempts+1,lease_id=lease,lease_until=now()+interval '2 minutes',
      lease_subscription_version=delivery.subscription_version,updated_at=now() where id=delivery.id;
    claimed:=claimed||jsonb_build_array(jsonb_build_object('deliveryId',delivery.id,'leaseId',lease,'eventId',coalesce(delivery.notification_id,delivery.id),
      'kind',delivery.kind,'orderReference',delivery.reference,'endpoint',delivery.endpoint,'p256dh',delivery.p256dh,'auth',delivery.auth));
  end loop;
  return jsonb_build_object('deliveries',claimed);
end $$;

create function api.check_admin_push_delivery(p_delivery_id uuid,p_lease_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  return jsonb_build_object('allowed',exists(select 1 from private.admin_push_deliveries d
    join private.admin_push_subscriptions s on s.id=d.subscription_id join private.admin_memberships m on m.user_id=s.user_id and m.active
    where d.id=p_delivery_id and d.lease_id=p_lease_id and d.status='sending' and d.lease_until>now() and d.expires_at>now()
      and s.enabled and s.version=d.lease_subscription_version));
end $$;

create function api.finish_admin_push(p_delivery_id uuid,p_lease_id uuid,p_result text,p_http_status integer default null,p_error_code text default null,p_retry_after integer default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare d private.admin_push_deliveries%rowtype;v_error text;sid uuid;
begin
  if p_result is null or p_result not in('accepted','retry','expired','failed') or (p_http_status is not null and p_http_status not between 100 and 599)
    or (p_error_code is not null and p_error_code!~'^[a-z0-9_-]{1,80}$') or (p_retry_after is not null and p_retry_after not between 0 and 3600)
    then raise exception 'El resultado de envío no es válido.' using errcode='22023';end if;
  -- Match unsubscribe/revocation's subscription -> delivery lock order. This
  -- avoids a 410 acknowledgement deadlocking a concurrent device opt-out.
  select subscription_id into sid from private.admin_push_deliveries where id=p_delivery_id;
  perform 1 from private.admin_push_subscriptions where id=sid for update;
  select * into d from private.admin_push_deliveries where id=p_delivery_id and lease_id=p_lease_id and status='sending' and lease_until>now() for update;
  if not found then return jsonb_build_object('updated',false);end if;
  v_error:=p_error_code;
  update private.admin_push_deliveries set status=case when p_result='retry' and d.attempts<5 and d.expires_at>now() then 'pending'
      when p_result='retry' then 'failed' else p_result end,
    lease_id=null,lease_until=null,last_http_status=p_http_status,last_error_code=v_error,
    next_attempt_at=now()+make_interval(secs=>greatest(coalesce(p_retry_after,0),least(3600,60*power(2,d.attempts-1)::integer))),
    accepted_at=case when p_result='accepted' then now() else null end,updated_at=now() where id=d.id;
  if p_result='expired' or p_http_status in(404,410) then
    update private.admin_push_subscriptions set enabled=false,version=version+1,last_error_code=coalesce(v_error,'endpoint_expired'),updated_at=now() where id=d.subscription_id;
    update private.admin_push_deliveries set status='revoked',lease_id=null,lease_until=null,last_error_code='endpoint_expired',updated_at=now()
      where subscription_id=d.subscription_id and status in('pending','sending');
  end if;
  return jsonb_build_object('updated',true);
end $$;

-- All access crosses checked commands. The dispatcher gets only lease/ack RPCs;
-- it cannot enumerate arbitrary users, create commercial events or edit orders.
grant create on schema api,private to aro_admin_push_executor;
do $$ declare r record;begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname in('push_validate_environment','enqueue_admin_order_notification','revoke_admin_push_membership'))
      or (n.nspname='api' and p.proname in('admin_push_device','admin_push_subscribe','admin_push_unsubscribe','admin_push_test','admin_notifications',
        'admin_read_notifications','claim_admin_push','check_admin_push_delivery','finish_admin_push')) loop
    execute format('alter function %s owner to aro_admin_push_executor',r.signature);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
  end loop;
end $$;
revoke create on schema api,private from aro_admin_push_executor;
grant execute on function api.admin_push_device(text,uuid),api.admin_push_subscribe(text,uuid,text,jsonb),api.admin_push_unsubscribe(text,uuid),
  api.admin_push_test(text,uuid),api.admin_notifications(integer),api.admin_read_notifications(uuid[],boolean) to authenticated;
grant execute on function api.claim_admin_push(text,integer,uuid),api.check_admin_push_delivery(uuid,uuid),api.finish_admin_push(uuid,uuid,text,integer,text,integer) to service_role;

comment on table app.admin_notifications is 'Trusted commercial-order outbox and shared admin center. Simulations and test pushes never become sales notices.';
comment on table private.admin_push_subscriptions is 'Private device opt-ins, Web Push encryption material and namespaces; never Supabase session tokens.';
comment on table private.admin_push_deliveries is 'Bounded lease-based at-least-once attempts. Accepted means provider receipt, never device display or user read.';
