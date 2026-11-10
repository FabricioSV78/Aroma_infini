-- Public bestseller ordering comes from verified commercial units, never from
-- simulated checkout, cart activity, order count, price or browser metadata.
-- Existing simulation/payment constraints are deliberately NOT relaxed here.
create index orders_verified_sales_idx on app.orders(id)
  where not simulation and payment_status='approved' and payment_verified_at is not null;

create function private.catalog_sales_units()
returns table(product_id uuid,units bigint)
language sql stable security definer set search_path='' as $$
  select i.product_id,pg_catalog.sum(i.quantity)::bigint
  from app.orders o join app.order_items i on i.order_id=o.id
  where not o.simulation and o.payment_status='approved'
    and o.payment_verified_at is not null and i.product_id is not null
  group by i.product_id;
$$;
grant create on schema private to aro_commerce_executor;
alter function private.catalog_sales_units() owner to aro_commerce_executor;
revoke create on schema private from aro_commerce_executor;
revoke all on function private.catalog_sales_units() from public,anon,authenticated,service_role;
grant execute on function private.catalog_sales_units() to aro_api_executor;

-- Legacy public pages use the same deterministic ordering as the storefront.
-- Only the requested published DTOs are built; sales are aggregated once.
create or replace function api.catalog_products(p_limit integer default 24,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100
    or p_offset is null or p_offset<0 or p_offset>100000 then
    raise exception 'La página solicitada no es válida.' using errcode='22023';
  end if;
  with sales as materialized(select * from private.catalog_sales_units()),
  selected as materialized (
    select p.id,p.display_rank,coalesce(s.units,0) as units
    from app.products p left join sales s on s.product_id=p.id
    order by units desc,p.display_rank,p.id limit p_limit offset p_offset
  )
  select pg_catalog.jsonb_build_object(
    'items',coalesce((select pg_catalog.jsonb_agg(private.catalog_product_document(p.id)
      order by p.units desc,p.display_rank,p.id) from selected p),'[]'::jsonb),
    'total',(select pg_catalog.count(*) from app.products)) into v_result;
  return v_result;
end;
$$;

-- Preserve the reviewed filtering, price and page validation implementation.
-- The count query stays independent of sales; only bestseller ordering uses it.
do $$
declare v_body text;v_marker text;
begin
  select prosrc into strict v_body from pg_catalog.pg_proc
    where oid='api.catalog_browse(jsonb,integer)'::regprocedure;
  v_marker:='  with available as materialized (';
  if pg_catalog.strpos(v_body,v_marker)=0
    or pg_catalog.strpos(v_body,'    select m.id,m.display_rank,m.minimum_price from matched m')=0
    or pg_catalog.strpos(v_body,'order by case when v_order=''mas-vendidos'' then m.display_rank end,')=0
    or pg_catalog.strpos(v_body,'order by case when v_order=''mas-vendidos'' then s.display_rank end,')=0 then
    raise exception 'Unexpected reviewed catalog browse; abort sales migration';
  end if;
  v_body:=pg_catalog.replace(v_body,v_marker,
    '  with sales as materialized (select * from private.catalog_sales_units() where v_order=''mas-vendidos''),'||chr(10)||
    '  available as materialized (');
  v_body:=pg_catalog.replace(v_body,
    '    select m.id,m.display_rank,m.minimum_price from matched m',
    '    select m.id,m.display_rank,m.minimum_price,coalesce(sales.units,0) as units from matched m left join sales on sales.product_id=m.id');
  v_body:=pg_catalog.replace(v_body,
    'order by case when v_order=''mas-vendidos'' then m.display_rank end,',
    'order by case when v_order=''mas-vendidos'' then coalesce(sales.units,0) end desc,'||chr(10)||
    '      case when v_order=''mas-vendidos'' then m.display_rank end,');
  v_body:=pg_catalog.replace(v_body,
    'order by case when v_order=''mas-vendidos'' then s.display_rank end,',
    'order by case when v_order=''mas-vendidos'' then s.units end desc,'||chr(10)||
    '        case when v_order=''mas-vendidos'' then s.display_rank end,');
  execute pg_catalog.format(
    'create or replace function api.catalog_browse(p_query jsonb default ''{}''::jsonb,p_page_size integer default 12) returns jsonb language plpgsql stable security definer set search_path='''' as %L',v_body);

  select prosrc into strict v_body from pg_catalog.pg_proc where oid='api.catalog_home_context()'::regprocedure;
  v_marker:='''items'',api.catalog_products(4,0)->''items'',';
  if pg_catalog.strpos(v_body,v_marker)=0 then
    raise exception 'Unexpected reviewed Home projection; abort sales migration';
  end if;
  v_body:=pg_catalog.replace(v_body,v_marker,$replacement$
    'items',(with sales as materialized(select * from private.catalog_sales_units()),
      selected as materialized (
        select p.id,p.display_rank,coalesce(s.units,0) as units
        from app.products p left join sales s on s.product_id=p.id
        where p.product_type='perfume'
        order by units desc,p.display_rank,p.id limit 4
      ) select coalesce(jsonb_agg(private.catalog_product_document(p.id)
          order by p.units desc,p.display_rank,p.id),'[]'::jsonb) from selected p),
  $replacement$);
  execute pg_catalog.format(
    'create or replace function api.catalog_home_context() returns jsonb language plpgsql stable security definer set search_path='''' as %L',v_body);
end $$;

comment on function private.catalog_sales_units() is
  'Private all-time units grouped across presentations of verified approved non-simulated orders. No identities, payment details or counts are returned by public catalog DTOs. Current payment simulation gates remain closed.';
notify pgrst,'reload schema';
