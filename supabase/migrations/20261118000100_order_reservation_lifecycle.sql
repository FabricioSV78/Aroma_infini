-- Complete the existing fifteen-minute availability hold lifecycle. Never
-- backfill historical orders, approve a payment or change physical inventory.
set lock_timeout = '3s';
set statement_timeout = '30s';

alter table app.orders drop constraint orders_status_check;
alter table app.orders add constraint orders_status_check
  check (status in ('received','preparing','shipped','delivered','cancelled','expired'));
alter table app.orders add constraint orders_terminal_simulation_check
  check (status not in ('cancelled','expired') or (simulation and payment_status = 'pending'));

alter table app.order_status_history alter column actor_id drop not null;
alter table app.order_status_history drop constraint order_status_history_source_check;
alter table app.order_status_history add constraint order_status_history_source_check
  check (source in ('individual','bulk','system'));
alter table app.order_status_history add constraint order_status_history_actor_check
  check ((source = 'system' and actor_id is null and actor_name = 'Sistema'
          and to_status = 'expired' and from_status in ('received','preparing'))
    or (source in ('individual','bulk') and actor_id is not null));

grant create on schema private, api to aro_commerce_executor;

-- Both commands and scheduled expiry lock the order BEFORE its reservation
-- rows. The trigger shares that lock order and closes each hold at most once.
create function private.guard_order_reservation_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = old.status then return new; end if;
  if old.status in ('cancelled','expired') then
    raise exception 'Un pedido cancelado o vencido no se puede reabrir.' using errcode = '22023';
  end if;
  if new.status in ('cancelled','expired') then
    if not old.simulation or old.payment_status <> 'pending'
      or old.status not in ('received','preparing') then
      raise exception 'Solo se pueden cancelar o vencer pedidos pendientes que todavía no se enviaron.' using errcode = '22023';
    end if;
    perform 1 from private.order_stock_reservations r where r.order_id = old.id
      order by r.variant_id for update;
    if new.status = 'expired' and (
      exists(select 1 from private.order_stock_reservations r
        where r.order_id = old.id and r.state = 'active' and r.expires_at > clock_timestamp())
      or not exists(select 1 from private.order_stock_reservations r
        where r.order_id = old.id and r.state = 'expired')
    ) then
      raise exception 'El pedido no tiene una reserva vencida.' using errcode = '22023';
    end if;
    if new.status = 'cancelled' then
      update private.order_stock_reservations set state = 'released', closed_at = clock_timestamp()
        where order_id = old.id and state = 'active';
    end if;
  elsif new.status in ('preparing','shipped') and exists(
    select 1 from private.order_stock_reservations r where r.order_id = old.id
  ) and not exists(
    select 1 from private.order_stock_reservations r where r.order_id = old.id
      and r.state = 'active' and r.expires_at > clock_timestamp()
  ) then
    raise exception 'La reserva de stock venció. No se puede continuar preparando este pedido.' using errcode = '22023';
  end if;
  return new;
end $$;
alter function private.guard_order_reservation_lifecycle() owner to aro_commerce_executor;
revoke all on function private.guard_order_reservation_lifecycle() from public, anon, authenticated, service_role;
create trigger order_reservation_lifecycle_guard before update of status on app.orders
  for each row execute function private.guard_order_reservation_lifecycle();

-- Only newly due ACTIVE holds are reconciled. Previously expired reservations
-- and legacy orders without holds remain untouched by this migration and cron.
create function private.expire_order_stock_reservations(p_order_id uuid, p_expired_at timestamptz default clock_timestamp()) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare o app.orders%rowtype; v_count integer; v_now timestamptz := p_expired_at;
begin
  if v_now is null then raise exception 'Invalid expiry boundary' using errcode = '22023'; end if;
  select * into o from app.orders where id = p_order_id for update;
  if not found then return 0; end if;
  perform 1 from private.order_stock_reservations r where r.order_id = o.id
    order by r.variant_id for update;
  update private.order_stock_reservations set state = 'expired', closed_at = v_now
    where order_id = o.id and state = 'active' and expires_at <= v_now;
  get diagnostics v_count = row_count;
  if v_count > 0 and o.simulation and o.payment_status = 'pending'
    and o.status in ('received','preparing') and not exists(
      select 1 from private.order_stock_reservations r where r.order_id = o.id
        and r.state = 'active' and r.expires_at > v_now
    ) then
    update app.orders set status = 'expired', version = version + 1, updated_at = v_now where id = o.id;
    insert into app.order_status_history(order_id,from_status,to_status,changed_at,actor_id,actor_name,operation_id,source)
      values(o.id,o.status,'expired',v_now,null,'Sistema',gen_random_uuid(),'system');
  end if;
  return v_count;
end $$;
alter function private.expire_order_stock_reservations(uuid,timestamptz) owner to aro_commerce_executor;
revoke all on function private.expire_order_stock_reservations(uuid,timestamptz) from public, anon, authenticated, service_role;

create or replace function api.expire_stock_reservations(p_limit integer default 100)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare o record; v_count integer := 0; v_due integer; v_now timestamptz := clock_timestamp();
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid reservation cleanup bound' using errcode = '22023';
  end if;
  for o in select orders.id from app.orders orders where exists(
      select 1 from private.order_stock_reservations r where r.order_id = orders.id
        and r.state = 'active' and r.expires_at <= v_now
    ) order by orders.reference limit p_limit for update of orders skip locked loop
    select count(*)::integer into v_due from private.order_stock_reservations r
      where r.order_id = o.id and r.state = 'active' and r.expires_at <= v_now;
    -- Never split an order's holds or exceed the existing Worker batch contract.
    if v_due > 0 and v_due <= p_limit - v_count then
      v_count := v_count + private.expire_order_stock_reservations(o.id,v_now);
    end if;
    exit when v_count >= p_limit;
  end loop;
  return v_count;
end $$;
alter function api.expire_stock_reservations(integer) owner to aro_commerce_executor;
revoke all on function api.expire_stock_reservations(integer) from public, anon, authenticated, service_role;
grant execute on function api.expire_stock_reservations(integer) to service_role;

-- Patch the installed functions rather than restoring historical definitions:
-- retain the verified request identity, MFA gate, permissions and RPC envelope.
do $migration$
declare v_definition text; v_marker text; v_replacement text;
begin
  v_definition := pg_get_functiondef('private.order_history_document(uuid[])'::regprocedure);
  v_marker := '''verified'',true';
  if strpos(v_definition,v_marker) = 0 then raise exception 'Unexpected order history actor boundary'; end if;
  execute replace(v_definition,v_marker,'''verified'',h.source <> ''system''');

  v_definition := pg_get_functiondef('api.admin_set_order_statuses(jsonb,text,uuid,boolean,text)'::regprocedure);
  if strpos(v_definition,'private.request_user_id()') = 0
    or strpos(v_definition,'perform private.require_catalog_admin();') = 0 then
    raise exception 'Unexpected verified administrative identity boundary';
  end if;
  v_marker := 'not p_status=any(v_states)';
  if strpos(v_definition,v_marker) = 0 then raise exception 'Unexpected order command status boundary'; end if;
  v_definition := replace(v_definition,v_marker,'not p_status=any(v_states || array[''cancelled''])');
  v_marker := '      if o.version<>v_expected then';
  v_replacement := $replacement$      -- Reconcile expiry before checking the optimistic version. The canonical
      -- response contains the terminal order and system history on a conflict.
      perform private.expire_order_stock_reservations(o.id);
      select * into o from app.orders where id=o.id;
      if o.version<>v_expected then$replacement$;
  if strpos(v_definition,v_marker) = 0 then raise exception 'Unexpected order version boundary'; end if;
  v_definition := replace(v_definition,v_marker,v_replacement);
  v_marker := '      if abs(array_position(v_states,o.status)-array_position(v_states,p_status))<>1 then';
  v_replacement := $replacement$      if o.status in('cancelled','expired') then
        v_errors:=v_errors||jsonb_build_array(jsonb_build_object('reference',v_reference,'message','Un pedido cancelado o vencido no se puede reabrir.'));continue;end if;
      if p_status='cancelled' and (not o.simulation or o.payment_status<>'pending' or o.status not in('received','preparing')) then
        v_errors:=v_errors||jsonb_build_array(jsonb_build_object('reference',v_reference,'message','Solo se pueden cancelar pedidos pendientes que todavía no se enviaron.'));continue;end if;
      if p_status<>'cancelled' and abs(array_position(v_states,o.status)-array_position(v_states,p_status))<>1 then$replacement$;
  if strpos(v_definition,v_marker) = 0 then raise exception 'Unexpected order transition boundary'; end if;
  execute replace(v_definition,v_marker,v_replacement);

  v_definition := pg_get_functiondef('api.admin_order_list(jsonb,integer,integer,text)'::regprocedure);
  v_marker := '''all'',''atencion'',''received'',''preparing'',''shipped'',''delivered''';
  if strpos(v_definition,v_marker) = 0 then raise exception 'Unexpected order list validation boundary'; end if;
  execute replace(v_definition,v_marker,v_marker || ',''cancelled'',''expired''');

  v_definition := pg_get_functiondef('api.admin_save_order_delivery(text,bigint,jsonb,text,jsonb)'::regprocedure);
  v_marker := 'o.status in(''shipped'',''delivered'')';
  if strpos(v_definition,v_marker) = 0 then raise exception 'Unexpected delivery edit status boundary'; end if;
  execute replace(v_definition,v_marker,'o.status in(''shipped'',''delivered'',''cancelled'',''expired'')');
end;
$migration$;

revoke create on schema private, api from aro_commerce_executor;
comment on function private.expire_order_stock_reservations(uuid,timestamptz) is
  'Order-first locked, idempotent expiry of new active holds; no physical stock writes, payment approval or historical backfill.';
reset lock_timeout;
reset statement_timeout;
