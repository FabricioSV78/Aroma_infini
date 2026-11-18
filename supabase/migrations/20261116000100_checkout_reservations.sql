-- A pending checkout holds availability for fifteen minutes without claiming a
-- payment or deducting physical inventory. Historical pending orders are not
-- backfilled: only newly committed checkouts acquire a reservation.
create table private.order_stock_reservations (
  order_id uuid not null references app.orders(id) on delete cascade,
  variant_id uuid not null references app.product_variants(id)
    deferrable initially deferred,
  quantity integer not null check (quantity between 1 and 999),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  state text not null default 'active' check (state in ('active','expired','released')),
  closed_at timestamptz,
  primary key (order_id, variant_id),
  check (expires_at = created_at + interval '15 minutes'),
  check ((state = 'active') = (closed_at is null))
);
alter table private.order_stock_reservations enable row level security;
alter table private.order_stock_reservations force row level security;
revoke all on private.order_stock_reservations from public, anon, authenticated, service_role;
grant select, insert, update on private.order_stock_reservations to aro_commerce_executor;
create policy reservation_executor on private.order_stock_reservations
  to aro_commerce_executor using (true) with check (true);
-- Both indexes serve bounded operations: one variant lookup on quote/catalog;
-- the expiry worker scans only open, due reservations (not order history).
create index order_stock_reservations_available_idx
  on private.order_stock_reservations(variant_id, expires_at) include(quantity)
  where state = 'active';
create index order_stock_reservations_expiry_idx
  on private.order_stock_reservations(expires_at, order_id, variant_id)
  where state = 'active';

grant create on schema api, private to aro_commerce_executor;
create function private.reservable_stock(p_variant_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(0, v.stock - coalesce((
    select sum(r.quantity)::integer from private.order_stock_reservations r
    where r.variant_id = v.id and r.state = 'active'
      and r.expires_at > statement_timestamp()
  ), 0)) from app.product_variants v where v.id = p_variant_id;
$$;
alter function private.reservable_stock(uuid) owner to aro_commerce_executor;
revoke all on function private.reservable_stock(uuid) from public, anon, authenticated, service_role;
grant execute on function private.reservable_stock(uuid) to aro_api_executor, aro_catalog_admin_executor;

-- Administrative saves replace variant rows inside one transaction. A deferred
-- invariant permits that existing operation but rejects removing a held variant
-- or lowering physical stock below still-live holds. No counters can drift.
create function private.check_reserved_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_stock integer; v_held bigint;
begin
  if tg_table_name = 'product_variants' then v_id := new.id;
  else v_id := new.variant_id; end if;
  select stock into v_stock from app.product_variants where id = v_id;
  select coalesce(sum(quantity), 0) into v_held
    from private.order_stock_reservations
    where variant_id = v_id and state = 'active' and expires_at > clock_timestamp();
  if v_held > coalesce(v_stock, 0) then
    raise exception 'Hay unidades reservadas en un checkout pendiente. Espera su vencimiento antes de reducir el stock.' using errcode = 'PT409';
  end if;
  return null;
end $$;
alter function private.check_reserved_inventory() owner to aro_commerce_executor;
revoke all on function private.check_reserved_inventory() from public, anon, authenticated, service_role;
create constraint trigger reserved_inventory_variant_guard
  after insert or update on app.product_variants deferrable initially deferred
  for each row execute function private.check_reserved_inventory();
create constraint trigger reserved_inventory_hold_guard
  after insert or update on private.order_stock_reservations deferrable initially deferred
  for each row execute function private.check_reserved_inventory();

create function api.expire_stock_reservations(p_limit integer default 100)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid reservation cleanup bound' using errcode = '22023';
  end if;
  with due as materialized (
    select r.order_id, r.variant_id from private.order_stock_reservations r
    where r.state = 'active' and r.expires_at <= clock_timestamp()
    order by r.expires_at, r.order_id, r.variant_id
    limit p_limit for update skip locked
  ), expired as (
    update private.order_stock_reservations r set state = 'expired', closed_at = clock_timestamp()
    from due where r.order_id = due.order_id and r.variant_id = due.variant_id
      and r.state = 'active' and r.expires_at <= clock_timestamp()
    returning 1
  ) select count(*)::integer into v_count from expired;
  return v_count;
end $$;
alter function api.expire_stock_reservations(integer) owner to aro_commerce_executor;
revoke all on function api.expire_stock_reservations(integer) from public, anon, authenticated, service_role;
grant execute on function api.expire_stock_reservations(integer) to service_role;

-- Modify the current, already-hardened RPC rather than restoring a historical
-- definition: retain verified identity, operation hashes and sorted media locks.
do $migration$
declare v_definition text; v_marker text; v_replacement text; v_signature text;
begin
  v_definition := pg_get_functiondef('api.create_simulated_order(uuid,text,jsonb,uuid)'::regprocedure);
  v_marker := 'perform 1 from app.product_variants where id=v_lock.id for share;';
  if strpos(v_definition, v_marker) = 0 then raise exception 'Unexpected checkout variant lock boundary'; end if;
  v_definition := replace(v_definition, v_marker,
    'perform 1 from app.product_variants where id=v_lock.id for update;');
  v_definition := replace(v_definition,
    '-- Read locks coordinate with price/stock edits. This simulation does not' || chr(10) || '  -- reserve or decrement a single unit and never creates coupon redemptions.',
    '-- Sorted locks serialize stock reservations with competing checkouts and administrative edits.');
  v_marker := '  return jsonb_build_object(''order'',private.order_document(v_order));';
  v_replacement := $replacement$  -- All variants remain locked until this reservation and the order commit.
  insert into private.order_stock_reservations(order_id,variant_id,quantity,created_at,expires_at)
    select v_order,i.variant_id,i.quantity,clock_timestamp_at,clock_timestamp_at + interval '15 minutes'
    from app.order_items i cross join lateral (select clock_timestamp() clock_timestamp_at) t
    where i.order_id=v_order;
  return jsonb_build_object('order',private.order_document(v_order));$replacement$;
  if strpos(v_definition, v_marker) = 0 then raise exception 'Unexpected checkout reservation boundary'; end if;
  execute replace(v_definition, v_marker, v_replacement);

  v_definition := pg_get_functiondef('api.checkout_quote(jsonb,text,text,text,text,text)'::regprocedure);
  v_marker := 'v.stock<v_quantity';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected checkout availability boundary'; end if;
  execute replace(v_definition,v_marker,'private.reservable_stock(v.id)<v_quantity');

  -- Public availability consistently excludes live holds. Physical stock and
  -- administrative visibility are unchanged; expiry immediately restores the
  -- public read even if the scheduled status sweep has not run yet.
  foreach v_signature in array array[
    'private.catalog_product_is_published(app.products)',
    'api.catalog_browse(jsonb,integer)',
    'api.catalog_home_context()'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if strpos(v_definition, 'v.stock > 0') + strpos(v_definition, 'v.stock>0') = 0 then
      raise exception 'Unexpected public availability boundary: %',v_signature;
    end if;
    v_definition := replace(replace(v_definition,'v.stock > 0','private.reservable_stock(v.id) > 0'),
      'v.stock>0','private.reservable_stock(v.id)>0');
    execute v_definition;
  end loop;
  v_definition := pg_get_functiondef('private.catalog_product_document(uuid)'::regprocedure);
  v_marker := '''stock'', v.stock';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected public variant projection'; end if;
  execute replace(v_definition,v_marker,'''stock'', private.reservable_stock(v.id)');
end;
$migration$;

revoke create on schema api, private from aro_commerce_executor;

comment on table private.order_stock_reservations is
  'Fifteen-minute availability holds; no payment approval, physical stock decrement or historical order backfill. Expiry is enforced on every read independently of cron.';
