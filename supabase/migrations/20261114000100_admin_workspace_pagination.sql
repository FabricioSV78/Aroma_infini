-- Page-scoped administrative reads. Existing commands, RLS, historical RPCs,
-- payment/stock rules and complete-snapshot consumers remain unchanged.
-- No indexes, tables, persisted caches or new grants to browser table roles.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Hosted postgres is not a superuser. Transferring function ownership requires
-- CREATE for its new NOLOGIN owner. Grant it only within this atomic migration
-- and revoke it below, before any other session can observe that permission.
grant create on schema api to aro_catalog_admin_executor,aro_commerce_executor;

create function private.admin_search_key(p_value text) returns text
language sql immutable security invoker set search_path='' as $$
  select pg_catalog.lower(pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.normalize(coalesce(p_value,''),'NFD'),U&'[\0300-\036f]','','g')));
$$;
revoke all on function private.admin_search_key(text) from public,anon,authenticated,service_role;
grant execute on function private.admin_search_key(text) to aro_catalog_admin_executor,aro_commerce_executor;

-- One inventory aggregation for all counters/candidates, not a full product
-- document/manifest and independent RLS subquery for every candidate product.
create function private.admin_product_candidates()
returns table(id uuid,name text,created_at timestamptz,version bigint,brand_id uuid,
  active boolean,product_type text,low_stock_threshold integer,stock bigint,
  has_alert boolean,sold_out boolean,has_main boolean,search_text text)
language sql stable security invoker set search_path='' as $$
  select p.id,p.name,p.created_at,p.version,p.brand_id,p.active,p.product_type,p.low_stock_threshold,
    coalesce(v.stock,0),coalesce(v.has_alert,false),coalesce(v.sold_out,true),
    coalesce(m.object_key,'')<>'',
    pg_catalog.lower(p.name||' '||p.product_code::text||' '||coalesce(b.name,'')||' '||coalesce(v.skus,''))
  from app.products p left join app.brands b on b.id=p.brand_id
  left join (
    select v.product_id,pg_catalog.sum(v.stock) filter(where v.active) stock,
      pg_catalog.bool_or(v.active and v.stock<=p.low_stock_threshold) has_alert,
      not pg_catalog.bool_or(v.active and v.stock>0) sold_out,
      pg_catalog.string_agg(coalesce(v.merchant_sku,''),' ' order by v.created_at,v.id) skus
    from app.product_variants v join app.products p on p.id=v.product_id group by v.product_id
  ) v on v.product_id=p.id
  left join app.product_images i on i.product_id=p.id and i.position=0
  left join app.media_assets m on m.id=i.media_id;
$$;
revoke all on function private.admin_product_candidates() from public,anon,authenticated,service_role;
grant execute on function private.admin_product_candidates() to aro_catalog_admin_executor;

-- Derive the selected-record projection from the canonical migrated helper.
-- Keep its media, variants, notes and offer expressions in one set query, as
-- in the already-reviewed admin_catalog_page projection (migration 028).
do $migration$
declare v text;
begin
  select prosrc into strict v from pg_catalog.pg_proc
    where oid='private.admin_product_document(uuid)'::regprocedure and not prosecdef;
  if pg_catalog.strpos(v,'  select pg_catalog.jsonb_build_object(')=0
    or pg_catalog.strpos(v,E'\n  from app.products p')=0
    or pg_catalog.strpos(v,'where p.id = p_product_id;')=0 then
    raise exception 'Unreviewed canonical product projection';
  end if;
  v:=pg_catalog.replace(v,'  select pg_catalog.jsonb_build_object(',
    '  select p.id, pg_catalog.jsonb_build_object(');
  v:=pg_catalog.replace(v,E'\n  from app.products p',E' as document\n  from app.products p');
  v:=pg_catalog.replace(v,'where p.id = p_product_id;','where p.id=any(p_ids)');
  execute 'create function private.admin_product_documents(p_ids uuid[]) returns jsonb language sql stable security invoker set search_path=''''
    as $projection$ with documents as ('||v||') select coalesce(pg_catalog.jsonb_agg(document order by pg_catalog.array_position(p_ids,id)),''[]''::jsonb) from documents $projection$';
end;
$migration$;
revoke all on function private.admin_product_documents(uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.admin_product_documents(uuid[]) to aro_catalog_admin_executor;

create function api.admin_product_list(p_query jsonb default '{}'::jsonb,p_page integer default 1,
  p_limit integer default 12,p_mode text default 'list')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_search text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_query->>'search','')));
  v_stock text:=coalesce(p_query->>'stock','all');v_visibility text:=coalesce(p_query->>'visibility','all');
  v_result jsonb;v_id uuid;v_ids uuid[];v_metadata boolean:=p_mode='editor';
begin
  perform private.require_catalog_admin();
  if p_query is null or pg_catalog.jsonb_typeof(p_query)<>'object' or pg_catalog.pg_column_size(p_query)>8192
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_query) k where k not in('search','stock','visibility','id'))
    or pg_catalog.char_length(v_search)>200 or v_stock not in('all','alert','out','healthy')
    or v_visibility not in('all','active','inactive','pending-images')
    or p_mode is null or p_mode not in('list','editor','photo-queue','dashboard')
    or p_page is null or p_page<1 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'La página o los filtros no son válidos.' using errcode='22023';
  end if;
  if p_mode='editor' then
    v_id:=nullif(p_query->>'id','')::uuid;
    select coalesce(pg_catalog.array_agg(id),'{}'::uuid[]) into v_ids from app.products where id=v_id;
    v_result:=pg_catalog.jsonb_build_object('products',private.admin_product_documents(v_ids),
      'productVersions',coalesce((select pg_catalog.jsonb_object_agg(id::text,version) from app.products where id=any(v_ids)),'{}'::jsonb));
  else
    with base as materialized(select * from private.admin_product_candidates()),
    matched as materialized(
      select * from base where (v_search='' or pg_catalog.strpos(search_text,v_search)>0)
      and (v_stock='all' or (v_stock='alert' and has_alert) or (v_stock='out' and sold_out)
        or (v_stock='healthy' and not has_alert and not sold_out))
      and (v_visibility='all' or (v_visibility='active' and active) or (v_visibility='inactive' and not active)
        or (v_visibility='pending-images' and not has_main))
    ), totals as(select pg_catalog.count(*) total from matched),
    selected as materialized(
      select * from matched order by has_alert desc,name collate "es-x-icu",created_at,id limit p_limit
      offset (least(p_page::bigint,greatest(1,((select total from totals)+p_limit-1)/p_limit))-1)*p_limit
    )
    select pg_catalog.jsonb_build_object(
      'total',(select total from totals),
      'summary',pg_catalog.jsonb_build_object('products',(select pg_catalog.count(*) from base),
        'stock',(select coalesce(pg_catalog.sum(stock) filter(where active),0) from base),
        'alerts',(select pg_catalog.count(*) from base where has_alert),
        'soldOut',(select pg_catalog.count(*) from base where sold_out)),
      'dashboard',case when p_mode='dashboard' then pg_catalog.jsonb_build_object(
        'stock',(select coalesce(pg_catalog.sum(b.stock),0) from base b join app.brands br on br.id=b.brand_id where b.active and br.active),
        'alerts',(select pg_catalog.count(*) from app.product_variants v join app.products p on p.id=v.product_id where v.active and v.stock<=p.low_stock_threshold),
        'outAlerts',(select pg_catalog.count(*) from app.product_variants where active and stock=0),
        'items',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('productId',product_id,'productName',product_name,'variantId',variant_id,
          'ml',ml,'variantLabel',label,'stock',stock,'threshold',threshold) order by stock,product_name collate "es-x-icu",coalesce(ml,0),created_at,variant_id)
          from(select v.product_id,p.name product_name,v.id variant_id,v.ml,v.label,v.stock,p.low_stock_threshold threshold,v.created_at
            from app.product_variants v join app.products p on p.id=v.product_id where v.active and v.stock<=p.low_stock_threshold
            order by v.stock,p.name collate "es-x-icu",coalesce(v.ml,0),v.created_at,v.id limit 5) alerts),'[]'::jsonb)) else null end,
      'products',case when p_mode='list' then private.admin_product_documents(
        coalesce((select pg_catalog.array_agg(id order by has_alert desc,name collate "es-x-icu",created_at,id) from selected),'{}'::uuid[])) else '[]'::jsonb end,
      'productVersions',coalesce((select pg_catalog.jsonb_object_agg(id::text,version) from selected),'{}'::jsonb),
      'photoQueue',case when p_mode='photo-queue' then coalesce((select pg_catalog.jsonb_agg(b.id order by b.has_alert desc,b.name collate "es-x-icu",b.created_at,b.id)
        from matched b where not b.has_main or (select pg_catalog.count(*) from app.product_images i join app.media_assets m on m.id=i.media_id
          where i.product_id=b.id and coalesce(m.object_key,'')<>'')<>4
        or (b.product_type='perfume' and not exists(select 1 from app.products p join app.media_assets m on m.id=p.olfactory_media_id
          where p.id=b.id and coalesce(m.object_key,'')<>''))),'[]'::jsonb) else null end
    ) into v_result;
  end if;
  return v_result||pg_catalog.jsonb_build_object(
    'brands',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'active',b.active) order by b.name_key,b.id)
      from app.brands b where v_metadata or b.id in(select (p->'product'->>'brandId')::uuid from pg_catalog.jsonb_array_elements(v_result->'products') p)),'[]'::jsonb),
    'brandVersions',coalesce((select pg_catalog.jsonb_object_agg(b.id::text,b.version) from app.brands b
      where v_metadata or b.id in(select (p->'product'->>'brandId')::uuid from pg_catalog.jsonb_array_elements(v_result->'products') p)),'{}'::jsonb),
    'features',(select pg_catalog.jsonb_build_object('complementsEnabled',complements_enabled) from app.store_settings where singleton),
    'olfactoryFamilies',case when v_metadata then api.admin_olfactory_families() else '[]'::jsonb end,
    'settingsVersion',(select version from app.store_settings where singleton));
end;
$$;
alter function api.admin_product_list(jsonb,integer,integer,text) owner to aro_catalog_admin_executor;
revoke all on function api.admin_product_list(jsonb,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function api.admin_product_list(jsonb,integer,integer,text) to authenticated;

-- Search only order headers. Lines and media documents are built after LIMIT.
create function private.admin_order_candidates(p_query jsonb)
returns setof app.orders language sql stable security invoker set search_path='' as $$
  select o.* from app.orders o left join app.commerce_locations l on l.district=o.district
  where (coalesce(p_query->>'search','')='' or pg_catalog.strpos(private.admin_search_key(
    o.reference||' '||o.first_name||' '||o.last_name||' '||o.email||' '||o.phone||' '||coalesce(l.district_label,o.district)||' '||coalesce(l.province_label,o.province)),private.admin_search_key(p_query->>'search'))>0)
  and (coalesce(p_query->>'status','all')='all' or o.status=p_query->>'status'
    or (p_query->>'status'='atencion' and o.status in('received','preparing')))
  and (coalesce(p_query->>'customer','')='' or coalesce(o.user_id::text,'guest-'||o.id::text)=p_query->>'customer')
  and (coalesce(p_query->>'from','')='' or (o.placed_at at time zone 'America/Lima')::date>=nullif(p_query->>'from','')::date)
  and (coalesce(p_query->>'until','')='' or (o.placed_at at time zone 'America/Lima')::date<=nullif(p_query->>'until','')::date)
  and (not p_query?'references' or o.reference in(select pg_catalog.jsonb_array_elements_text(p_query->'references')));
$$;
revoke all on function private.admin_order_candidates(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.admin_order_candidates(jsonb) to aro_commerce_executor;

create function api.admin_order_list(p_query jsonb default '{}'::jsonb,p_page integer default 1,
  p_limit integer default 20,p_mode text default 'list')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_ids uuid[];v_total bigint;v_customer jsonb;v_references jsonb:=p_query->'references';v_from date;v_until date;
begin
  perform private.require_catalog_admin();
  if p_query is null or pg_catalog.jsonb_typeof(p_query)<>'object' or pg_catalog.pg_column_size(p_query)>1048576
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_query) k where k not in('search','status','customer','from','until','references'))
    or pg_catalog.char_length(coalesce(p_query->>'search',''))>200 or pg_catalog.char_length(coalesce(p_query->>'customer',''))>64
    or coalesce(p_query->>'status','all') not in('all','atencion','received','preparing','shipped','delivered')
    or p_page is null or p_page<1 or p_limit is null or p_limit not between 1 and 100
    or p_mode is null or p_mode not in('list','selection','details','dashboard') then
    raise exception 'La página o los filtros no son válidos.' using errcode='22023';
  end if;
  if v_references is not null and (pg_catalog.jsonb_typeof(v_references)<>'array') then raise exception 'La selección no es válida.' using errcode='22023';end if;
  if v_references is not null and (pg_catalog.jsonb_array_length(v_references)>10000 or exists(select 1 from pg_catalog.jsonb_array_elements(v_references) x where pg_catalog.jsonb_typeof(x)<>'string' or pg_catalog.char_length(x#>>'{}')>64)) then raise exception 'La selección no es válida.' using errcode='22023';end if;
  v_from:=nullif(p_query->>'from','')::date;v_until:=nullif(p_query->>'until','')::date;
  if v_from>v_until then raise exception 'La fecha inicial debe ser anterior o igual a la fecha final.' using errcode='22023';end if;
  select pg_catalog.count(*) into v_total from private.admin_order_candidates(p_query);
  if p_mode='selection' then
    if v_total>10000 then raise exception 'Afina los filtros para seleccionar hasta diez mil pedidos.' using errcode='22023';end if;
    return pg_catalog.jsonb_build_object('total',v_total,'selection',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'reference',o.reference,'status',o.status,'version',o.version,'paymentStatus',o.payment_status,'simulation',o.simulation,
      'customerId',coalesce(o.user_id::text,'guest-'||o.id::text),'customerName',o.first_name||' '||o.last_name,'customerEmail',o.email,'contactPhone',o.phone,
      'address',pg_catalog.jsonb_build_object('department',o.department,'province',o.province,'district',o.district,'street',o.street)) order by o.placed_at desc,o.reference)
      from private.admin_order_candidates(p_query) o),'[]'::jsonb));
  end if;
  if p_mode='details' and (v_references is null or pg_catalog.jsonb_array_length(v_references)>100) then
    raise exception 'Solicita hasta cien pedidos explícitos por lectura.' using errcode='22023';
  end if;
  select coalesce(pg_catalog.array_agg(id order by placed_at desc,reference),'{}'::uuid[]) into v_ids from(
    select id,placed_at,reference from private.admin_order_candidates(p_query) where p_mode<>'dashboard' or not simulation order by placed_at desc,reference limit p_limit
    offset case when p_mode='details' then 0 else (least(p_page::bigint,greatest(1,(v_total+p_limit-1)/p_limit))-1)*p_limit end) page;
  if coalesce(p_query->>'customer','')<>'' then
    select pg_catalog.jsonb_build_object('id',coalesce(o.user_id::text,'guest-'||o.id::text),'name',o.first_name||' '||o.last_name,'email',o.email,'phone',o.phone)
      into v_customer from app.orders o where coalesce(o.user_id::text,'guest-'||o.id::text)=p_query->>'customer' order by placed_at desc,reference limit 1;
  end if;
  return pg_catalog.jsonb_build_object('total',v_total,
    'orders',coalesce((select pg_catalog.jsonb_agg(private.order_document(o.id) order by o.placed_at desc,o.reference) from app.orders o where o.id=any(v_ids)),'[]'::jsonb),
    'orderHistory',case when p_mode='details' then private.order_history_document(v_ids) else '[]'::jsonb end,
    'customer',v_customer,'toPrepare',(select pg_catalog.count(*) from app.orders where not simulation and payment_status='approved' and status in('received','preparing')),
    'counts',pg_catalog.jsonb_build_object(
      'received',(select pg_catalog.count(*) from app.orders where status='received' and (p_mode<>'dashboard' or not simulation)),
      'preparing',(select pg_catalog.count(*) from app.orders where status='preparing' and (p_mode<>'dashboard' or not simulation)),
      'shipped',(select pg_catalog.count(*) from app.orders where status='shipped' and (p_mode<>'dashboard' or not simulation)),
      'delivered',(select pg_catalog.count(*) from app.orders where status='delivered' and (p_mode<>'dashboard' or not simulation))));
end;
$$;
alter function api.admin_order_list(jsonb,integer,integer,text) owner to aro_commerce_executor;
revoke all on function api.admin_order_list(jsonb,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function api.admin_order_list(jsonb,integer,integer,text) to authenticated;

create function api.admin_customer_list(p_search text default '',p_page integer default 1,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.require_catalog_admin();
  if p_search is null or pg_catalog.char_length(p_search)>200 or p_page is null or p_page<1 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'La página o la búsqueda no son válidas.' using errcode='22023';
  end if;
  with orders as materialized(
    select o.*,coalesce(o.user_id::text,'guest-'||o.id::text) customer_id from app.orders o
  ), latest_identity as(select distinct on(customer_id) customer_id,first_name,last_name,email,phone
    from orders order by customer_id,placed_at desc,id),
  commercial as(select customer_id,pg_catalog.count(*) order_count from orders where not simulation group by customer_id),
  latest_delivery as(select distinct on(customer_id) customer_id,province,district from orders where not simulation order by customer_id,placed_at desc,id),
  matched as materialized(select i.customer_id id,i.first_name||' '||i.last_name name,i.email,i.phone,d.province,d.district,c.order_count
    from latest_identity i join commercial c using(customer_id) join latest_delivery d using(customer_id)
    left join app.commerce_locations l on l.district=d.district
    where private.admin_search_key(p_search)='' or pg_catalog.strpos(private.admin_search_key(
      i.first_name||' '||i.last_name||' '||i.email||' '||i.phone||' '||coalesce(l.province_label,d.province)||' '||coalesce(l.district_label,d.district)),private.admin_search_key(p_search))>0),
  totals as(select pg_catalog.count(*) total from matched), selected as(
    select * from matched order by name collate "es-x-icu",id limit p_limit offset
      (least(p_page::bigint,greatest(1,((select total from totals)+p_limit-1)/p_limit))-1)*p_limit)
  select pg_catalog.jsonb_build_object('total',(select total from totals),'customers',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',id,'name',name,'email',email,'phone',phone,'province',province,'district',district,'orderCount',order_count) order by name collate "es-x-icu",id) from selected),'[]'::jsonb)) into v_result;
  return v_result;
end;
$$;
alter function api.admin_customer_list(text,integer,integer) owner to aro_commerce_executor;
revoke all on function api.admin_customer_list(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function api.admin_customer_list(text,integer,integer) to authenticated;

-- Keep the existing, audited commands as the sole writers. A bounded page is
-- returned in the SAME transaction: a later failed HTTP refresh cannot turn a
-- committed mutation into an apparent failure or leave filtered counts stale.
create function api.admin_set_order_statuses_page(p_changes jsonb,p_status text,p_operation_id uuid,
  p_delivery_confirmed boolean default false,p_source text default 'bulk',
  p_query jsonb default '{}',p_page integer default 1,p_limit integer default 20)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_result jsonb;
begin
  v_result:=api.admin_set_order_statuses(p_changes,p_status,p_operation_id,p_delivery_confirmed,p_source);
  return v_result||pg_catalog.jsonb_build_object('page',api.admin_order_list(p_query,p_page,p_limit));
end;
$$;
alter function api.admin_set_order_statuses_page(jsonb,text,uuid,boolean,text,jsonb,integer,integer) owner to aro_commerce_executor;
revoke all on function api.admin_set_order_statuses_page(jsonb,text,uuid,boolean,text,jsonb,integer,integer) from public,anon,authenticated,service_role;
grant execute on function api.admin_set_order_statuses_page(jsonb,text,uuid,boolean,text,jsonb,integer,integer) to authenticated;

create function api.admin_save_product_page(p_record jsonb,p_expected_version bigint default null,
  p_query jsonb default '{}',p_page integer default 1,p_limit integer default 12)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_result jsonb;
begin
  v_result:=api.admin_save_product(p_record,p_expected_version);
  return v_result||pg_catalog.jsonb_build_object('page',api.admin_product_list(p_query,p_page,p_limit));
end;
$$;
alter function api.admin_save_product_page(jsonb,bigint,jsonb,integer,integer) owner to aro_catalog_admin_executor;
revoke all on function api.admin_save_product_page(jsonb,bigint,jsonb,integer,integer) from public,anon,authenticated,service_role;
grant execute on function api.admin_save_product_page(jsonb,bigint,jsonb,integer,integer) to authenticated;

revoke create on schema api from aro_catalog_admin_executor,aro_commerce_executor;
