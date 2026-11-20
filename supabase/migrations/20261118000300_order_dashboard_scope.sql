-- Operational dashboard scope is explicit. Production callers retain the
-- commercial default; staging can include unpaid simulations without ever
-- manufacturing an approved payment or changing revenue/customer aggregates.
create or replace function api.admin_order_list(
  p_query jsonb default '{}'::jsonb, p_page integer default 1,
  p_limit integer default 20, p_mode text default 'list'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_ids uuid[]; v_total bigint; v_customer jsonb;
  v_references jsonb:=p_query->'references'; v_from date; v_until date;
  v_include_simulation boolean:=false; v_counts jsonb; v_to_prepare bigint;
begin
  perform private.require_catalog_admin();
  if p_query is null or pg_catalog.jsonb_typeof(p_query)<>'object'
    or pg_catalog.pg_column_size(p_query)>1048576
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_query) k
      where k not in('search','status','customer','from','until','references','includeSimulation'))
    or pg_catalog.char_length(coalesce(p_query->>'search',''))>200
    or pg_catalog.char_length(coalesce(p_query->>'customer',''))>64
    or coalesce(p_query->>'status','all') not in('all','atencion','received','preparing','shipped','delivered','cancelled','expired')
    or p_page is null or p_page<1 or p_limit is null or p_limit not between 1 and 100
    or p_mode is null or p_mode not in('list','selection','details','dashboard') then
    raise exception 'La página o los filtros no son válidos.' using errcode='22023';
  end if;
  if p_query?'includeSimulation' then
    if p_mode<>'dashboard' or pg_catalog.jsonb_typeof(p_query->'includeSimulation') is distinct from 'boolean' then
      raise exception 'El alcance del resumen no es válido.' using errcode='22023';
    end if;
    v_include_simulation:=(p_query->>'includeSimulation')::boolean;
  end if;
  if v_references is not null and pg_catalog.jsonb_typeof(v_references)<>'array' then
    raise exception 'La selección no es válida.' using errcode='22023';
  end if;
  if v_references is not null and (
    pg_catalog.jsonb_array_length(v_references)>10000
    or exists(select 1 from pg_catalog.jsonb_array_elements(v_references) x
      where pg_catalog.jsonb_typeof(x)<>'string' or pg_catalog.char_length(x#>>'{}')>64)
  ) then raise exception 'La selección no es válida.' using errcode='22023';end if;
  v_from:=nullif(p_query->>'from','')::date;
  v_until:=nullif(p_query->>'until','')::date;
  if v_from>v_until then
    raise exception 'La fecha inicial debe ser anterior o igual a la fecha final.' using errcode='22023';
  end if;

  -- One aggregate over the SAME filtered scope as the selected records. This
  -- fixes global counters ignoring dates, search, customer and status filters.
  select pg_catalog.count(*), pg_catalog.count(*) filter(
    where o.status in('received','preparing')
      and (o.payment_status='approved' or (v_include_simulation and o.simulation))
  ), pg_catalog.jsonb_build_object(
    'received',pg_catalog.count(*) filter(where o.status='received'),
    'preparing',pg_catalog.count(*) filter(where o.status='preparing'),
    'shipped',pg_catalog.count(*) filter(where o.status='shipped'),
    'delivered',pg_catalog.count(*) filter(where o.status='delivered')
  ) into v_total,v_to_prepare,v_counts
  from private.admin_order_candidates(p_query) o
  where p_mode<>'dashboard' or not o.simulation or v_include_simulation;

  if p_mode='selection' then
    if v_total>10000 then
      raise exception 'Afina los filtros para seleccionar hasta diez mil pedidos.' using errcode='22023';
    end if;
    return pg_catalog.jsonb_build_object('total',v_total,'selection',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reference',o.reference,'status',o.status,'version',o.version,
        'paymentStatus',o.payment_status,'simulation',o.simulation,
        'customerId',coalesce(o.user_id::text,'guest-'||o.id::text),
        'customerName',o.first_name||' '||o.last_name,'customerEmail',o.email,'contactPhone',o.phone,
        'address',pg_catalog.jsonb_build_object('department',o.department,'province',o.province,'district',o.district,'street',o.street)
      ) order by o.placed_at desc,o.reference)
      from private.admin_order_candidates(p_query) o
    ),'[]'::jsonb));
  end if;
  if p_mode='details' and (v_references is null or pg_catalog.jsonb_array_length(v_references)>100) then
    raise exception 'Solicita hasta cien pedidos explícitos por lectura.' using errcode='22023';
  end if;
  select coalesce(pg_catalog.array_agg(id order by placed_at desc,reference),'{}'::uuid[]) into v_ids from(
    select id,placed_at,reference from private.admin_order_candidates(p_query)
    where p_mode<>'dashboard' or not simulation or v_include_simulation
    order by placed_at desc,reference limit p_limit
    offset case when p_mode='details' then 0 else
      (least(p_page::bigint,greatest(1,(v_total+p_limit-1)/p_limit))-1)*p_limit end
  ) page;
  if coalesce(p_query->>'customer','')<>'' then
    select pg_catalog.jsonb_build_object(
      'id',coalesce(o.user_id::text,'guest-'||o.id::text),
      'name',o.first_name||' '||o.last_name,'email',o.email,'phone',o.phone
    ) into v_customer from app.orders o
    where coalesce(o.user_id::text,'guest-'||o.id::text)=p_query->>'customer'
    order by placed_at desc,reference limit 1;
  end if;
  return pg_catalog.jsonb_build_object(
    'total',v_total,'orders',coalesce((select pg_catalog.jsonb_agg(private.order_document(o.id)
      order by o.placed_at desc,o.reference) from app.orders o where o.id=any(v_ids)),'[]'::jsonb),
    'orderHistory',case when p_mode='details' then private.order_history_document(v_ids) else '[]'::jsonb end,
    'customer',v_customer,'toPrepare',v_to_prepare,'counts',v_counts
  );
end;
$$;
alter function api.admin_order_list(jsonb,integer,integer,text) owner to aro_commerce_executor;
revoke all on function api.admin_order_list(jsonb,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function api.admin_order_list(jsonb,integer,integer,text) to authenticated;
