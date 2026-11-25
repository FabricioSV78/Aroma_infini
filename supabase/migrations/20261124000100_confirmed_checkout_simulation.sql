-- A staging checkout can complete a simulated purchase without manufacturing a
-- real payment. The pending-only RPC and its fifteen-minute holds stay intact.
-- No historical order is confirmed, reopened or charged by this migration.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table app.orders add column simulation_confirmed_at timestamptz;
alter table app.orders add constraint orders_simulated_confirmation_check check (
  simulation_confirmed_at is null
  or (simulation and payment_status = 'pending' and payment_verified_at is null)
);
alter table private.order_stock_reservations drop constraint order_stock_reservations_state_check;
alter table private.order_stock_reservations add constraint order_stock_reservations_state_check
  check (state in ('active','expired','released','consumed'));

-- Restrict the new physical-inventory write to the existing NOLOGIN definer.
-- Browser roles retain no raw DML, and existing RLS remains enabled and forced.
grant update(stock) on app.product_variants to aro_commerce_executor;
-- Updating a variant also recomputes its existing generated presentation key.
-- This immutable text normalizer grants no table access or authorization.
grant execute on function private.catalog_name_key(text) to aro_commerce_executor;
grant create on schema private, api to aro_commerce_executor;

-- Deferred catalog triggers must finish before the definer returns to the
-- unprivileged caller. This narrow owner helper can only validate queued
-- catalog invariants for a confirmed simulated order; it accepts no SQL/data.
create function private.flush_simulated_inventory_constraints(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from app.orders where id=p_order_id and simulation
    and simulation_confirmed_at is not null and payment_status='pending' and payment_verified_at is null) then
    raise exception 'El pedido no tiene una confirmación de prueba.' using errcode='22023';
  end if;
  set constraints app.catalog_products_valid,app.catalog_variants_valid immediate;
  set constraints app.catalog_products_valid,app.catalog_variants_valid deferred;
end $$;
alter function private.flush_simulated_inventory_constraints(uuid) owner to postgres;
revoke all on function private.flush_simulated_inventory_constraints(uuid) from public,anon,authenticated,service_role;
grant execute on function private.flush_simulated_inventory_constraints(uuid) to aro_commerce_executor;

create function private.confirm_simulated_order(p_order_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare o app.orders%rowtype; moment timestamptz;
begin
  select * into o from app.orders where id=p_order_id for update;
  if not found or not o.simulation or o.payment_status<>'pending' or o.payment_verified_at is not null then
    raise exception 'El pedido no corresponde a una compra de prueba.' using errcode='22023';
  end if;
  if o.simulation_confirmed_at is not null then return; end if;
  if o.status<>'received' then
    raise exception 'El pedido anterior no tiene una confirmación de prueba. Crea un pedido nuevo.' using errcode='22023';
  end if;
  -- The creating RPC already holds these locks in this order. Preserve the
  -- same order for a future internal caller: order, products, variants, holds.
  perform p.id from app.products p where p.id in (
    select i.product_id from app.order_items i where i.order_id=o.id
  ) order by p.id for update;
  perform v.id from app.product_variants v where v.id in (
    select i.variant_id from app.order_items i where i.order_id=o.id
  ) order by v.id for update;
  perform r.variant_id from private.order_stock_reservations r where r.order_id=o.id
    order by r.variant_id for update;
  moment:=clock_timestamp();
  if not exists(select 1 from private.order_stock_reservations where order_id=o.id)
    or exists(select 1 from private.order_stock_reservations where order_id=o.id
      and (state<>'active' or expires_at<=moment))
    or exists (
      select 1 from (
        select i.variant_id,sum(i.quantity)::bigint as quantity from app.order_items i
          where i.order_id=o.id group by i.variant_id
      ) items full join (
        select r.variant_id,r.quantity from private.order_stock_reservations r where r.order_id=o.id
      ) held on held.variant_id=items.variant_id
      where items.variant_id is null or held.variant_id is null or items.quantity<>held.quantity
    ) or exists (
      select 1 from private.order_stock_reservations r left join app.product_variants v on v.id=r.variant_id
      where r.order_id=o.id and (v.id is null or v.stock<r.quantity)
    ) then
    raise exception 'La reserva de stock venció o no está completa. Crea un pedido nuevo de prueba.' using errcode='22023';
  end if;
  -- Close the temporary hold before decrementing physical stock, so both
  -- immediate and deferred inventory invariants see no double subtraction.
  update private.order_stock_reservations set state='consumed',closed_at=moment where order_id=o.id;
  update app.product_variants v set stock=v.stock-r.quantity,version=v.version+1
    from private.order_stock_reservations r where r.order_id=o.id and r.variant_id=v.id;
  update app.products p set version=p.version+1 where p.id in (
    select i.product_id from app.order_items i where i.order_id=o.id
  );
  -- This timestamp records the simulation, never a verified provider payment.
  -- It is written before the first response, preserving initial order version.
  update app.orders set simulation_confirmed_at=moment where id=o.id;
  perform private.flush_simulated_inventory_constraints(o.id);
end $$;
alter function private.confirm_simulated_order(uuid) owner to aro_commerce_executor;
revoke all on function private.confirm_simulated_order(uuid) from public,anon,authenticated,service_role;

-- Clone the already-hardened checkout, preserving quote validation, ownership,
-- request hashes, operation replay, media retention and public order codes.
do $migration$
declare definition text; marker text; replacement text;
begin
  definition:=pg_catalog.pg_get_functiondef('api.create_simulated_order(uuid,text,jsonb,uuid)'::regprocedure);
  marker:='api.create_simulated_order(';
  if strpos(definition,marker)=0 or strpos(definition,'private.next_order_reference()')=0
    or strpos(definition,'v_existing.user_id is distinct from p_user_id')=0
    or strpos(definition,'v_existing.tracking_hash<>v_tracking_hash')=0 then
    raise exception 'Unexpected verified checkout definition';
  end if;
  definition:=replace(definition,marker,'api.create_confirmed_simulated_order(');
  marker:='perform 1 from app.products where id=v_lock.id for share;';
  if strpos(definition,marker)=0
    or strpos(definition,'perform 1 from app.product_variants where id=v_lock.id for update;')=0 then
    raise exception 'Unexpected deterministic checkout lock boundary';
  end if;
  definition:=replace(definition,marker,'perform 1 from app.products where id=v_lock.id for update;');
  marker:='    return jsonb_build_object(''order'',private.order_document(v_existing.id));';
  replacement:=$replacement$    if v_existing.simulation_confirmed_at is null then
      raise exception 'El pedido anterior no tiene una confirmación de prueba. Crea un pedido nuevo.' using errcode='22023';
    end if;
    return jsonb_build_object('order',private.order_document(v_existing.id));$replacement$;
  if strpos(definition,marker)=0 then raise exception 'Unexpected checkout replay boundary'; end if;
  definition:=replace(definition,marker,replacement);
  marker:='  return jsonb_build_object(''order'',private.order_document(v_order));';
  if strpos(definition,marker)=0 or strpos(definition,'insert into private.order_stock_reservations')=0 then
    raise exception 'Unexpected checkout reservation boundary';
  end if;
  definition:=replace(definition,marker,'  perform private.confirm_simulated_order(v_order);'||chr(10)||marker);
  execute definition;
end;
$migration$;
alter function api.create_confirmed_simulated_order(uuid,text,jsonb,uuid) owner to aro_commerce_executor;
revoke all on function api.create_confirmed_simulated_order(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function api.create_confirmed_simulated_order(uuid,text,jsonb,uuid) to service_role;

create or replace function private.guard_order_reservation_lifecycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare restored_products uuid[];
begin
  if new.status=old.status then return new; end if;
  if old.status in ('cancelled','expired') then
    raise exception 'Un pedido cancelado o vencido no se puede reabrir.' using errcode='22023';
  end if;
  if new.status in ('cancelled','expired') then
    if not old.simulation or old.payment_status<>'pending' or old.status not in ('received','preparing') then
      raise exception 'Solo se pueden cancelar o vencer pedidos pendientes que todavía no se enviaron.' using errcode='22023';
    end if;
    if new.status='expired' and old.simulation_confirmed_at is not null then
      raise exception 'Una compra de prueba confirmada no vence por el plazo de pago.' using errcode='22023';
    end if;
    -- Match checkout's deterministic product/variant lock order before holds.
    perform p.id from app.products p where p.id in (
      select v.product_id from app.product_variants v join private.order_stock_reservations r on r.variant_id=v.id
      where r.order_id=old.id and r.state='consumed'
    ) order by p.id for update;
    perform v.id from app.product_variants v where v.id in (
      select r.variant_id from private.order_stock_reservations r where r.order_id=old.id and r.state='consumed'
    ) order by v.id for update;
    perform r.variant_id from private.order_stock_reservations r where r.order_id=old.id
      order by r.variant_id for update;
    if new.status='expired' and (
      exists(select 1 from private.order_stock_reservations r where r.order_id=old.id and r.state='active' and r.expires_at>clock_timestamp())
      or not exists(select 1 from private.order_stock_reservations r where r.order_id=old.id and r.state='expired')
    ) then
      raise exception 'El pedido no tiene una reserva vencida.' using errcode='22023';
    end if;
    if new.status='cancelled' then
      select array_agg(distinct v.product_id) into restored_products from app.product_variants v
        join private.order_stock_reservations r on r.variant_id=v.id where r.order_id=old.id and r.state='consumed';
      with restored as (
        update private.order_stock_reservations set state='released',closed_at=clock_timestamp()
          where order_id=old.id and state='consumed' returning variant_id,quantity
      ) update app.product_variants v set stock=v.stock+r.quantity,version=v.version+1
        from restored r where r.variant_id=v.id;
      update app.products set version=version+1 where id=any(coalesce(restored_products,'{}'::uuid[]));
      if coalesce(array_length(restored_products,1),0)>0 then
        perform private.flush_simulated_inventory_constraints(old.id);
      end if;
      -- Never enable a product disabled manually or after its last unit sold.
      update private.order_stock_reservations set state='released',closed_at=clock_timestamp()
        where order_id=old.id and state='active';
    end if;
  elsif new.status in ('preparing','shipped') and exists(
    select 1 from private.order_stock_reservations r where r.order_id=old.id
  ) and not (
    (old.simulation_confirmed_at is not null and not exists(
      select 1 from private.order_stock_reservations r where r.order_id=old.id and r.state<>'consumed'
    )) or (old.simulation_confirmed_at is null and exists(
      select 1 from private.order_stock_reservations r where r.order_id=old.id and r.state='active' and r.expires_at>clock_timestamp()
    ))
  ) then
    raise exception 'La reserva de stock venció. Este pedido pendiente no puede enviarse; crea un pedido nuevo de prueba.' using errcode='22023';
  end if;
  return new;
end $$;

-- Preserve safe, actionable expiry messages instead of replacing them with
-- generic validation. Other SQL exception details remain private.
do $migration$
declare definition text; marker text; replacement text;
begin
  definition:=pg_get_functiondef('api.admin_set_order_statuses(jsonb,text,uuid,boolean,text)'::regprocedure);
  marker:='  for v_change in select value from jsonb_array_elements(p_changes) order by value->>''reference'' loop';
  replacement:=$replacement$  -- A batch restores several products. Lock the whole batch in one global
  -- order instead of retaining per-order product locks in reference order.
  if p_status='cancelled' then
    perform o2.reference from app.orders o2 where o2.reference in(
      select x->>'reference' from jsonb_array_elements(p_changes) x
    ) order by o2.reference for update;
    perform p.id from app.products p where p.id in(
      select v.product_id from app.product_variants v join private.order_stock_reservations r on r.variant_id=v.id
        join app.orders o2 on o2.id=r.order_id where r.state='consumed' and o2.reference in(
          select x->>'reference' from jsonb_array_elements(p_changes) x
        )
    ) order by p.id for update;
    perform v.id from app.product_variants v where v.id in(
      select r.variant_id from private.order_stock_reservations r join app.orders o2 on o2.id=r.order_id
        where r.state='consumed' and o2.reference in(select x->>'reference' from jsonb_array_elements(p_changes) x)
    ) order by v.id for update;
  end if;
  for v_change in select value from jsonb_array_elements(p_changes) order by value->>'reference' loop$replacement$;
  if strpos(definition,marker)=0 then raise exception 'Unexpected batch inventory lock boundary'; end if;
  definition:=replace(definition,marker,replacement);
  marker:='''message'',''Revisa los datos del pedido seleccionado.''';
  replacement:=$replacement$'message',case when sqlerrm='La reserva de stock venció. Este pedido pendiente no puede enviarse; crea un pedido nuevo de prueba.'
    then 'La reserva de stock venció. Este pedido pendiente no puede enviarse; crea un pedido nuevo de prueba.'
    else 'Revisa los datos del pedido seleccionado.' end$replacement$;
  if strpos(definition,marker)=0 then raise exception 'Unexpected order validation envelope'; end if;
  definition:=replace(definition,marker,replacement);
  marker:='''message'',''El pedido cambió en otra sesión. Actualiza la lista.''';
  replacement:=$replacement$'message',case when o.status='expired' then 'La reserva de stock venció. Crea un pedido nuevo de prueba.'
    else 'El pedido cambió en otra sesión. Actualiza la lista.' end$replacement$;
  if strpos(definition,marker)=0 then raise exception 'Unexpected order version envelope'; end if;
  execute replace(definition,marker,replacement);
end;
$migration$;

revoke create on schema private,api from aro_commerce_executor;
comment on column app.orders.simulation_confirmed_at is
  'Staging-only simulated purchase commitment. Never a provider payment confirmation; no historical backfill.';
comment on function api.create_confirmed_simulated_order(uuid,text,jsonb,uuid) is
  'Worker-only atomic confirmed simulation: canonical quote, one-time physical inventory consumption, no charge or verified payment. Pending checkout remains a separate fifteen-minute flow.';
