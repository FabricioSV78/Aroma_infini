-- Operational notifications for newly committed staging simulations. This does
-- not approve payments, count test orders as sales, or notify production devices.
-- The private switch is OFF by default in every database and has no browser RPC.
create table private.admin_push_policy (
  singleton boolean primary key default true check(singleton),
  staging_simulated_order_notifications boolean not null default false
);
insert into private.admin_push_policy(singleton) values(true);
alter table private.admin_push_policy enable row level security;
alter table private.admin_push_policy force row level security;
revoke all on private.admin_push_policy from public,anon,authenticated,service_role;
grant select on private.admin_push_policy to aro_admin_push_executor;
create policy push_policy_read on private.admin_push_policy for select to aro_admin_push_executor using(true);

alter table app.admin_notifications drop constraint admin_notifications_kind_check;
alter table app.admin_notifications add constraint admin_notifications_kind_check check(kind in('new_order','simulated_order'));
alter table app.admin_notifications add column delivery_environment text;
alter table app.admin_notifications add constraint admin_notifications_delivery_environment_check check(
  (kind='new_order' and delivery_environment is null)
  or (kind='simulated_order' and delivery_environment is not distinct from 'staging'));
alter table private.admin_push_deliveries drop constraint admin_push_deliveries_kind_check;
alter table private.admin_push_deliveries add constraint admin_push_deliveries_kind_check check(kind in('new_order','simulated_order','test'));
do $$ declare constraint_name text; begin
  for constraint_name in select c.conname from pg_catalog.pg_constraint c
    where c.conrelid='private.admin_push_deliveries'::regclass and c.contype='c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%notification_id IS NULL%'
  loop execute pg_catalog.format('alter table private.admin_push_deliveries drop constraint %I',constraint_name); end loop;
end $$;
alter table private.admin_push_deliveries add constraint admin_push_deliveries_event_check check(
  (kind='test' and notification_id is null)
  or (kind in('new_order','simulated_order') and notification_id is not null));

create or replace function private.enqueue_admin_order_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Preserve the verified-payment boundary of commercial sale notifications.
  if not new.simulation and new.payment_status='approved' and new.payment_verified_at is not null then
    insert into app.admin_notifications(kind,order_id) values('new_order',new.id)
      on conflict(order_id,kind) do nothing;
  elsif tg_op='INSERT' and new.simulation and new.payment_status='pending' and new.payment_verified_at is null
    and exists(select 1 from private.admin_push_policy where singleton and staging_simulated_order_notifications) then
    insert into app.admin_notifications(kind,order_id,delivery_environment) values('simulated_order',new.id,'staging')
      on conflict(order_id,kind) do nothing;
  end if;
  return new;
end $$;

-- One shared claim implementation retains existing leases and bounded retries.
-- The optional order target is an internal post-commit dispatch, never a browser
-- enqueue operation. Each event expands only to its permitted namespace.
grant create on schema api,private to aro_admin_push_executor;
create function private.claim_admin_push_work(p_environment text,p_limit integer,p_delivery_id uuid,p_order_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare event record;delivery record;claimed jsonb:='[]'::jsonb;lease uuid;
begin
  perform private.push_validate_environment(p_environment);
  if p_limit is null or p_limit not between 1 and 50 or (p_delivery_id is not null and p_order_id is not null) then
    raise exception 'El tamaño del lote no es válido.' using errcode='22023';end if;
  if p_delivery_id is null then
    for event in select id,created_at,kind,delivery_environment from app.admin_notifications
      where not fanned_out and (delivery_environment is null or delivery_environment=p_environment)
        and (p_order_id is null or order_id=p_order_id)
      order by created_at,id limit 100 for update skip locked loop
      if event.created_at>now()-interval '24 hours' then
        insert into private.admin_push_deliveries(notification_id,subscription_id,kind,expires_at)
          select event.id,s.id,event.kind,event.created_at+interval '24 hours' from private.admin_push_subscriptions s
            join private.admin_memberships m on m.user_id=s.user_id and m.active
          where s.enabled and s.enabled_at<=event.created_at
            and (event.delivery_environment is null or s.environment=event.delivery_environment)
          on conflict(notification_id,subscription_id) do nothing;
      end if;
      update app.admin_notifications set fanned_out=true where id=event.id;
    end loop;
  end if;
  update private.admin_push_deliveries d set status=case when d.expires_at<=now() then 'expired'
      when d.attempts>=5 then 'failed' else 'revoked' end,lease_id=null,lease_until=null,updated_at=now()
    from private.admin_push_subscriptions s where d.subscription_id=s.id and s.environment=p_environment and d.status in('pending','sending')
      and (p_delivery_id is null or d.id=p_delivery_id)
      and (p_order_id is null or exists(select 1 from app.admin_notifications n where n.id=d.notification_id and n.order_id=p_order_id))
      and ((d.status='pending' or d.lease_until<=now()) and (d.expires_at<=now() or d.attempts>=5 or not s.enabled
        or not exists(select 1 from private.admin_memberships m where m.user_id=s.user_id and m.active)));
  for delivery in select d.id,d.notification_id,d.kind,s.endpoint,s.p256dh,s.auth,s.version as subscription_version,o.reference
    from private.admin_push_deliveries d join private.admin_push_subscriptions s on s.id=d.subscription_id
      join private.admin_memberships m on m.user_id=s.user_id and m.active
      left join app.admin_notifications n on n.id=d.notification_id left join app.orders o on o.id=n.order_id
    where s.environment=p_environment and s.enabled and d.attempts<5 and d.expires_at>now() and d.next_attempt_at<=now()
      and (n.delivery_environment is null or n.delivery_environment=p_environment)
      and (d.status='pending' or (d.status='sending' and d.lease_until<=now()))
      and (p_delivery_id is null or d.id=p_delivery_id) and (p_order_id is null or n.order_id=p_order_id)
    order by d.next_attempt_at,d.id limit p_limit for update of d skip locked loop
    lease:=gen_random_uuid();
    update private.admin_push_deliveries set status='sending',attempts=attempts+1,lease_id=lease,lease_until=now()+interval '2 minutes',
      lease_subscription_version=delivery.subscription_version,updated_at=now() where id=delivery.id;
    claimed:=claimed||jsonb_build_array(jsonb_build_object('deliveryId',delivery.id,'leaseId',lease,'eventId',coalesce(delivery.notification_id,delivery.id),
      'kind',delivery.kind,'orderReference',delivery.reference,'endpoint',delivery.endpoint,'p256dh',delivery.p256dh,'auth',delivery.auth));
  end loop;
  return jsonb_build_object('deliveries',claimed);
end $$;
create or replace function api.claim_admin_push(p_environment text,p_limit integer default 20,p_delivery_id uuid default null)
returns jsonb language sql volatile security definer set search_path='' as $$
  select private.claim_admin_push_work(p_environment,p_limit,p_delivery_id,null)
$$;
create function api.claim_admin_order_push(p_environment text,p_order_id uuid,p_limit integer default 20)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if p_environment is distinct from 'staging' or p_order_id is null then
    raise exception 'El despacho dirigido solo está disponible en staging.' using errcode='22023';end if;
  return private.claim_admin_push_work(p_environment,p_limit,null,p_order_id);
end $$;
alter function private.claim_admin_push_work(text,integer,uuid,uuid) owner to aro_admin_push_executor;
alter function api.claim_admin_order_push(text,uuid,integer) owner to aro_admin_push_executor;
revoke create on schema api,private from aro_admin_push_executor;
revoke all on function private.claim_admin_push_work(text,integer,uuid,uuid),api.claim_admin_order_push(text,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function api.claim_admin_order_push(text,uuid,integer) to service_role;

comment on table app.admin_notifications is 'Unique operational order events; simulated_order is explicitly staging-only and is never a verified sale.';
comment on table private.admin_push_policy is 'Operator-only staging simulation opt-in, default off. No browser or service DML privileges and no historical event backfill.';
