-- Section-scoped catalog metadata, selectors and import validation. No new
-- tables, indexes, caches, RLS policies or commercial writes are introduced.
set local lock_timeout = '3s';
set local statement_timeout = '30s';
grant create on schema api to aro_catalog_admin_executor;
grant execute on function private.catalog_product_is_published(app.products) to aro_catalog_admin_executor;

create function api.admin_catalog_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin();
  return pg_catalog.jsonb_build_object(
    'brands',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',id,'name',name,'slug',slug,'active',active) order by name_key,id) from app.brands),'[]'::jsonb),
    'brandVersions',coalesce((select pg_catalog.jsonb_object_agg(id::text,version) from app.brands),'{}'::jsonb),
    'olfactoryFamilies',api.admin_olfactory_families(),
    'features',(select pg_catalog.jsonb_build_object('complementsEnabled',complements_enabled) from app.store_settings where singleton),
    'settingsVersion',(select version from app.store_settings where singleton),
    'featuredBrandId',(select featured_brand_id from app.store_settings where singleton));
end;
$$;

create function api.admin_catalog_choices(p_query jsonb default '{}'::jsonb,
  p_page integer default 1,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_search text:=private.admin_search_key(p_query->>'search');
  v_exclude uuid:=nullif(p_query->>'excludeId','')::uuid;v_selected uuid[];
  v_without_offer boolean:=coalesce((p_query->>'withoutOffer')::boolean,false);
  v_active boolean:=coalesce((p_query->>'activeOnly')::boolean,false);
begin
  perform private.require_catalog_admin();
  if p_query is null or pg_catalog.jsonb_typeof(p_query)<>'object' or pg_catalog.pg_column_size(p_query)>8192
    or exists(select 1 from pg_catalog.jsonb_object_keys(p_query) k where k not in('search','excludeId','includeIds','withoutOffer','activeOnly'))
    or pg_catalog.char_length(v_search)>200 or p_page is null or p_page<1 or p_limit is null or p_limit not between 1 and 100
    or (p_query?'includeIds' and (pg_catalog.jsonb_typeof(p_query->'includeIds')<>'array' or pg_catalog.jsonb_array_length(p_query->'includeIds')>100)) then
    raise exception 'La selección o la página no es válida.' using errcode='22023';
  end if;
  select coalesce(pg_catalog.array_agg(value::uuid),'{}'::uuid[]) into v_selected
    from pg_catalog.jsonb_array_elements_text(coalesce(p_query->'includeIds','[]'::jsonb));
  return (
    with base as materialized(
      select p.id,p.name,p.slug,p.brand_id,b.name brand_name,p.active,p.product_type,p.version,
        exists(select 1 from app.product_offers o where o.product_id=p.id) has_discount
      from app.products p left join app.brands b on b.id=p.brand_id
      where p.id is distinct from v_exclude
    ), matched as materialized(
      select * from base where (not v_active or active) and (not v_without_offer or not has_discount)
        and (v_search='' or pg_catalog.strpos(private.admin_search_key(coalesce(brand_name,'')||' '||name),v_search)>0
          or exists(select 1 from app.product_variants v where v.product_id=base.id
            and pg_catalog.strpos(private.admin_search_key(v.merchant_sku),v_search)>0))
    ), total as(select pg_catalog.count(*) n from matched), selected as materialized(
      select * from matched order by (coalesce(brand_name,'')||' '||name) collate "es-x-icu",id
      limit p_limit offset (least(p_page::bigint,greatest(1,((select n from total)+p_limit-1)/p_limit))-1)*p_limit
    ), encoded as(
      select id,pg_catalog.jsonb_build_object('id',id,'name',name,'slug',slug,'brandId',coalesce(brand_id::text,''),
        'brandName',coalesce(brand_name,''),'active',active,'productType',product_type,'hasDiscount',has_discount,'version',version) value,
        (coalesce(brand_name,'')||' '||name) sort_key from base
      where id in(select id from selected) or id=any(v_selected)
    ), final as(
      select e.*,pg_catalog.jsonb_build_object('published',private.catalog_product_is_published(p),
        'sku',(select merchant_sku from app.product_variants v where v.product_id=e.id
          order by v.ml nulls last,v.label,v.id limit 1)) extra
      from encoded e join app.products p on p.id=e.id
    ) select pg_catalog.jsonb_build_object('total',(select n from total),
      'items',coalesce((select pg_catalog.jsonb_agg(value||extra order by sort_key collate "es-x-icu",id) from final where id in(select id from selected)),'[]'::jsonb),
      'selected',coalesce((select pg_catalog.jsonb_agg(value||extra order by pg_catalog.array_position(v_selected,id)) from final where id=any(v_selected)),'[]'::jsonb))
  );
end;
$$;

create function api.admin_products_by_ids(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin();
  if p_ids is null or pg_catalog.cardinality(p_ids)>100 or pg_catalog.array_position(p_ids,null) is not null then
    raise exception 'Selecciona hasta cien productos por consulta.' using errcode='22023';
  end if;
  return pg_catalog.jsonb_build_object('products',private.admin_product_documents(p_ids),
    'productVersions',coalesce((select pg_catalog.jsonb_object_agg(id::text,version) from app.products where id=any(p_ids)),'{}'::jsonb));
end;
$$;

create function api.admin_offer_list(p_page integer default 1,p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_ids uuid[];v_total bigint;v_revision text;
begin
  perform private.require_catalog_admin();
  if p_page is null or p_page<1 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'La página de ofertas no es válida.' using errcode='22023';
  end if;
  select pg_catalog.count(*),pg_catalog.md5(coalesce(pg_catalog.string_agg(
    p.id::text||':'||p.version::text||':'||coalesce(b.version,0)::text||':'||o.version::text,
    ',' order by p.id),'')) into v_total,v_revision
    from app.products p join app.product_offers o on o.product_id=p.id left join app.brands b on b.id=p.brand_id;
  select coalesce(pg_catalog.array_agg(id order by sort_key collate "es-x-icu",id),'{}'::uuid[]) into v_ids
    from (select p.id,(coalesce(b.name,'')||' '||p.name) sort_key from app.products p
      join app.product_offers o on o.product_id=p.id left join app.brands b on b.id=p.brand_id
      order by (coalesce(b.name,'')||' '||p.name) collate "es-x-icu",p.id limit p_limit
      offset (least(p_page::bigint,greatest(1,(v_total+p_limit-1)/p_limit))-1)*p_limit) selected;
  return pg_catalog.jsonb_build_object('total',v_total,'revision',v_revision,
    'availableCount',(select pg_catalog.count(*) from app.products p where not exists(select 1 from app.product_offers o where o.product_id=p.id)),
    'products',private.admin_product_documents(v_ids),
    'productVersions',coalesce((select pg_catalog.jsonb_object_agg(id::text,version) from app.products where id=any(v_ids)),'{}'::jsonb),
    'brands',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'name',name,'slug',slug,'active',active) order by name_key,id)
      from app.brands b where b.id in(select brand_id from app.products where id=any(v_ids))),'[]'::jsonb),
    'brandVersions',coalesce((select pg_catalog.jsonb_object_agg(id::text,version) from app.brands b
      where b.id in(select brand_id from app.products where id=any(v_ids))),'{}'::jsonb));
end;
$$;

create function api.admin_import_conflicts(p_rows jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin();
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows)<>'array' or pg_catalog.jsonb_array_length(p_rows)>1000
    or pg_catalog.pg_column_size(p_rows)>524288 then
    raise exception 'Revisa hasta mil filas por archivo.' using errcode='22023';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(p_rows) e where
    pg_catalog.jsonb_typeof(e)<>'object'
    or coalesce(e->>'row','')!~'^[0-9]{1,4}$'
    or (e->>'row')::integer not between 2 and 1001
    or pg_catalog.jsonb_typeof(e->'slug') is distinct from 'string' or pg_catalog.char_length(e->>'slug')>240
    or pg_catalog.jsonb_typeof(e->'name') is distinct from 'string' or pg_catalog.char_length(e->>'name')>140
    or pg_catalog.jsonb_typeof(e->'brandId') is distinct from 'string'
    or (coalesce(e->>'brandId','')<>'' and (e->>'brandId')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    or pg_catalog.jsonb_typeof(e->'sku') is distinct from 'string' or pg_catalog.char_length(e->>'sku')>64) then
    raise exception 'Las identidades del archivo no son válidas.' using errcode='22023';
  end if;
  return (
    with rows as materialized(select (value->>'row')::integer line,
      private.admin_search_key(value->>'slug') slug,private.admin_search_key(value->>'name') name_key,
      nullif(value->>'brandId','')::uuid brand_id,pg_catalog.upper(pg_catalog.btrim(value->>'sku')) sku
      from pg_catalog.jsonb_array_elements(p_rows)),
    names as materialized(select distinct p.brand_id,private.admin_search_key(p.name) name_key
      from app.products p where p.brand_id in(select brand_id from rows)
        or (p.brand_id is null and exists(select 1 from rows where brand_id is null))),
    matches as(select r.line,pg_catalog.array_remove(array[
      case when s.id is not null then 'slug' end,
      case when n.name_key is not null then 'name' end,
      case when v.id is not null then 'sku' end],null) reasons
      from rows r left join app.products s on s.slug=r.slug and r.slug<>''
      left join app.product_variants v on v.merchant_sku=r.sku and r.sku<>''
      left join names n on n.brand_id is not distinct from r.brand_id and n.name_key=r.name_key and r.name_key<>'')
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('row',line,'reasons',reasons) order by line),'[]'::jsonb)
      from matches where pg_catalog.cardinality(reasons)>0
  );
end;
$$;

alter function api.admin_catalog_context() owner to aro_catalog_admin_executor;
alter function api.admin_catalog_choices(jsonb,integer,integer) owner to aro_catalog_admin_executor;
alter function api.admin_products_by_ids(uuid[]) owner to aro_catalog_admin_executor;
alter function api.admin_offer_list(integer,integer) owner to aro_catalog_admin_executor;
alter function api.admin_import_conflicts(jsonb) owner to aro_catalog_admin_executor;
revoke all on function api.admin_catalog_context(),api.admin_catalog_choices(jsonb,integer,integer),
  api.admin_products_by_ids(uuid[]),api.admin_offer_list(integer,integer),api.admin_import_conflicts(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function api.admin_catalog_context(),api.admin_catalog_choices(jsonb,integer,integer),
  api.admin_products_by_ids(uuid[]),api.admin_offer_list(integer,integer),api.admin_import_conflicts(jsonb) to authenticated;
revoke create on schema api from aro_catalog_admin_executor;
