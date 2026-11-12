-- Measured statement-local public query work. Same DTOs, validation, ranking,
-- discounts, stock and publication RLS; no index, policy or privilege changes.
-- Materialize the shared published set once, quote only filtered candidates
-- when price is needed, and build detail DTOs only for selected rows.
set local lock_timeout='3s';
set local statement_timeout='30s';
do $preflight$
begin
  if (select count(*) from pg_catalog.pg_proc where oid in(
    'api.catalog_home_context()'::regprocedure,'api.catalog_browse(jsonb,integer)'::regprocedure,
    'api.catalog_product_context(text)'::regprocedure,'api.catalog_products_by_ids(uuid[],uuid[])'::regprocedure,
    'api.catalog_products(integer,integer)'::regprocedure) and proowner='aro_api_executor'::regrole
    and prosecdef and provolatile='s' and proconfig=array['search_path=""'])<>5 then
    raise exception 'Unexpected public catalog query security contract';
  end if;
end;
$preflight$;

create or replace function api.catalog_home_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare public_count bigint;result jsonb;
begin
  with published as materialized (
    select p.id,p.brand_id,p.product_type,p.display_rank,p.aromatic_profile,p.occasion,p.intensity_level
    from app.products p limit 10001
  ), counted as materialized (
    select count(*) as total from published
  ), sales as materialized (
    select * from private.catalog_sales_units() where (select total from counted)<=10000
  ), selected as materialized (
    select p.id,p.display_rank,coalesce(s.units,0) as units from published p
    left join sales s on s.product_id=p.id
    where p.product_type='perfume' and (select total from counted)<=10000
    order by units desc,p.display_rank,p.id limit 4
  ), families as (
    select f.product_id,jsonb_agg(f.family_code order by f.position) as codes
    from app.product_olfactory_families f join published p on p.id=f.product_id
    where (select total from counted)<=10000 group by f.product_id
  ), finder_ready as (
    select distinct v.product_id from app.product_variants v join published p on p.id=v.product_id
    where (select total from counted)<=10000 and p.product_type='perfume'
      and v.active and v.stock>0 and v.price_cents>0 and v.ml>0
  )
  select c.total,case when c.total>10000 then null else
    api.catalog_settings()||jsonb_build_object(
      'brands',api.catalog_brands(),
      'items',coalesce((select jsonb_agg(private.catalog_product_document(p.id)
        order by p.units desc,p.display_rank,p.id) from selected p),'[]'::jsonb),
      'profiles',coalesce((select jsonb_agg(jsonb_build_object(
        'brandId',coalesce(p.brand_id::text,''),'family',p.aromatic_profile,
        'olfactoryFamilies',coalesce(f.codes,'[]'::jsonb),'occasion',p.occasion,
        'intensity',case p.intensity_level when 1 then 'Suave' when 2 then 'Moderada' when 3 then 'Intensa' else null end,
        'finderAvailable',p.product_type='perfume' and p.brand_id is not null
          and coalesce(b.active,false) and ready.product_id is not null
      ) order by p.display_rank,p.id) from published p
        left join app.brands b on b.id=p.brand_id
        left join families f on f.product_id=p.id
        left join finder_ready ready on ready.product_id=p.id),'[]'::jsonb)
    ) end into public_count,result from counted c;
  if public_count>10000 then
    raise exception 'El catálogo supera el límite de lectura.' using errcode='22023';
  end if;
  return result;
end;
$$;

create or replace function api.catalog_browse(p_query jsonb default '{}'::jsonb,p_page_size integer default 12) returns jsonb language plpgsql stable security definer set search_path='' as $browse$
declare
  v_types text[] := '{}'; v_brands text[] := '{}'; v_genders text[] := '{}'; v_families text[] := '{}';
  v_min bigint; v_max bigint; v_swap bigint; v_page integer := 1; v_order text := 'mas-vendidos';
  v_search text := ''; v_field text; v_limit integer; v_result jsonb;
begin
  if p_query is null or jsonb_typeof(p_query) is distinct from 'object'
    or octet_length(p_query::text)>32768 or p_page_size is null or p_page_size not between 1 and 12
    or exists(select 1 from jsonb_object_keys(p_query) k where k not in
      ('productTypes','brands','genders','families','min','max','order','page','search')) then
    raise exception 'Los filtros solicitados no son válidos.' using errcode='22023';
  end if;
  foreach v_field in array array['productTypes','brands','genders','families'] loop
    v_limit := case v_field when 'productTypes' then 2 when 'genders' then 3 when 'families' then 500 else 1000 end;
    if p_query ? v_field then
      if jsonb_typeof(p_query->v_field) is distinct from 'array' then
        raise exception 'Selecciona filtros válidos.' using errcode='22023';
      end if;
      if jsonb_array_length(p_query->v_field)>v_limit or exists(
        select 1 from jsonb_array_elements(p_query->v_field) x
        where jsonb_typeof(x) is distinct from 'string' or char_length(x#>>'{}') not between 1 and 512
      ) then raise exception 'Selecciona filtros válidos.' using errcode='22023';end if;
    end if;
  end loop;
  select coalesce(array_agg(distinct value),'{}') into v_types from jsonb_array_elements_text(coalesce(p_query->'productTypes','[]'));
  select coalesce(array_agg(distinct value),'{}') into v_brands from jsonb_array_elements_text(coalesce(p_query->'brands','[]'));
  select coalesce(array_agg(distinct value),'{}') into v_genders from jsonb_array_elements_text(coalesce(p_query->'genders','[]'));
  select coalesce(array_agg(distinct value),'{}') into v_families from jsonb_array_elements_text(coalesce(p_query->'families','[]'));
  -- URL parsers previously discarded unknown brand/family filters. Resolve
  -- those vocabularies here without requiring a metadata request first.
  select coalesce(array_agg(b.slug),'{}') into v_brands from app.brands b where b.active and b.slug=any(v_brands);
  select coalesce(array_agg(f.code),'{}') into v_families from app.olfactory_families f where f.code=any(v_families);
  if exists(select 1 from unnest(v_types) x where x not in ('perfume','complemento'))
    or exists(select 1 from unnest(v_genders) x where x not in ('hombre','mujer','unisex')) then
    raise exception 'Selecciona filtros válidos.' using errcode='22023';
  end if;
  foreach v_field in array array['min','max'] loop
    if p_query ? v_field then
      if jsonb_typeof(p_query->v_field) is distinct from 'string' or
        (p_query->>v_field<>'' and (p_query->>v_field !~ '^\d{1,7}(\.\d{1,2})?$')) then
        raise exception 'Escribe precios válidos en soles.' using errcode='22023';
      end if;
      if p_query->>v_field<>'' then
        if (p_query->>v_field)::numeric>1000000 then
          raise exception 'Escribe precios válidos en soles.' using errcode='22023';end if;
        if v_field='min' then v_min:=round((p_query->>v_field)::numeric*100)::bigint;
        else v_max:=round((p_query->>v_field)::numeric*100)::bigint;end if;
      end if;
    end if;
  end loop;
  if v_min>v_max then v_swap:=v_min;v_min:=v_max;v_max:=v_swap;end if;
  if p_query ? 'page' then
    if jsonb_typeof(p_query->'page') is distinct from 'number' or p_query->>'page' !~ '^\d{1,6}$'
      or (p_query->>'page')::integer not between 1 and 100000 then
      raise exception 'La página solicitada no es válida.' using errcode='22023';end if;
    v_page:=(p_query->>'page')::integer;
  end if;
  if p_query ? 'order' then
    if jsonb_typeof(p_query->'order') is distinct from 'string'
      or p_query->>'order' not in ('mas-vendidos','precio-asc','precio-desc') then
      raise exception 'Selecciona un orden válido.' using errcode='22023';end if;
    v_order:=p_query->>'order';
  end if;
  if p_query ? 'search' then
    if jsonb_typeof(p_query->'search') is distinct from 'string' or char_length(p_query->>'search')>100 then
      raise exception 'La búsqueda debe tener hasta 100 caracteres.' using errcode='22023';end if;
    v_search:=private.catalog_name_key(btrim(p_query->>'search'));
  end if;
  -- As on the current storefront, accessory-only selections ignore perfume
  -- gender/family controls; mixed selections retain those perfume constraints.
  if v_types=array['complemento']::text[] then v_genders:='{}';v_families:='{}';end if;
  -- Disabled complements cannot become visible through a crafted filter.
  -- RLS enforces that coverage independently from these UI semantics.
  with published as materialized (
    select p.id,p.display_rank,p.product_type,p.gender,p.brand_id,p.name
    from app.products p
  ), candidates as materialized (
    select p.id,p.display_rank
    from published p left join app.brands b on b.id=p.brand_id
    where (cardinality(v_types)=0 or p.product_type=any(v_types))
      and (cardinality(v_brands)=0 or b.slug=any(v_brands))
      and (cardinality(v_genders)=0 or (p.product_type='perfume' and p.gender=any(v_genders)))
      and (cardinality(v_families)=0 or (p.product_type='perfume' and exists(
        select 1 from app.product_olfactory_families f where f.product_id=p.id and f.family_code=any(v_families))))
      and (v_search='' or strpos(private.catalog_name_key(p.name||' '||coalesce(b.name,'')),v_search)>0)
  ), quoted as materialized (
    select v.product_id,private.catalog_price_cents(v.price_cents,o.enabled,o.discount_type,o.value,o.starts_at,o.ends_at,now()) as final_price
    from candidates c join app.product_variants v on v.product_id=c.id
    left join app.product_offers o on o.product_id=c.id
    where (v_order<>'mas-vendidos' or v_min is not null or v_max is not null)
      and v.active and v.stock>0
  ), prices as (
    select q.product_id,min(q.final_price) as minimum_price,
      bool_or((v_min is null or q.final_price>=v_min) and (v_max is null or q.final_price<=v_max)) as price_match
    from quoted q group by q.product_id
  ), matched as materialized (
    select c.id,c.display_rank,prices.minimum_price from candidates c
    left join prices on prices.product_id=c.id
    where (v_min is null and v_max is null or prices.price_match)
  ), counts as (
    select count(*) as total,greatest(1,ceil(count(*)::numeric/p_page_size))::integer as pages from matched
  ), sales as materialized (
    select * from private.catalog_sales_units() where v_order='mas-vendidos'
  ), selected as materialized (
    select m.id,m.display_rank,m.minimum_price,coalesce(sales.units,0) as units
    from matched m left join sales on sales.product_id=m.id
    order by case when v_order='mas-vendidos' then coalesce(sales.units,0) end desc,
      case when v_order='mas-vendidos' then m.display_rank end,
      case when v_order='precio-asc' then m.minimum_price end asc,
      case when v_order='precio-desc' then m.minimum_price end desc,m.id
    limit p_page_size offset (least(v_page,(select pages from counts))-1)*p_page_size
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(private.catalog_product_document(s.id)
      order by case when v_order='mas-vendidos' then s.units end desc,
        case when v_order='mas-vendidos' then s.display_rank end,
        case when v_order='precio-asc' then s.minimum_price end asc,
        case when v_order='precio-desc' then s.minimum_price end desc,s.id) from selected s),'[]'::jsonb),
    'total',c.total,'availableTotal',(select count(*) from published),
    'page',least(v_page,c.pages),'pages',c.pages,'brands',api.catalog_brands(),
    'features',settings.features,'featuredBrandId',settings.featured_brand_id,
    'olfactoryFamilies',api.catalog_olfactory_families(),
    'homeAnnouncement',(select content->'announcement' from app.home_document where singleton),
    'homeVersion',coalesce((select version from app.home_document where singleton),0),'shipping',private.shipping_document(false),'shippingVersion',coalesce((select version from app.shipping_settings where singleton),0),
    'familyCodes',coalesce((select jsonb_agg(code order by code) from (
      select distinct f.family_code as code from app.product_olfactory_families f join published a on a.id=f.product_id
    ) public_families),'[]'::jsonb)
  ) into v_result from counts c cross join lateral (
    select s.complements_enabled, jsonb_build_object('complementsEnabled',s.complements_enabled) as features,
      (select b.id from app.brands b where b.id=s.featured_brand_id and b.active) as featured_brand_id
    from app.store_settings s where s.singleton
  ) settings;
  return v_result;
end;
$browse$;
create or replace function api.catalog_product_context(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  with source as materialized (
    select p.id,p.product_type,p.brand_id from app.products p
    where p.slug=p_slug and char_length(p_slug)<=512 and p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ), manual as materialized (
    select target.id,r.position::bigint as position from source s
    join app.product_recommendations r on r.product_id=s.id
    join app.products target on target.id=r.recommended_product_id and target.id<>s.id
    order by r.position,target.id limit 4
  ), candidates as materialized (
    select target.id,target.brand_id,target.display_rank
    from source s join app.products target on target.id<>s.id and target.product_type=s.product_type
    where not exists(select 1 from manual)
  ), shared_families as (
    select b.product_id,count(*) as shared from source s
    join app.product_olfactory_families a on a.product_id=s.id
    join app.product_olfactory_families b on b.family_code=a.family_code
    join candidates c on c.id=b.product_id group by b.product_id
  ), automatic as materialized (
    select c.id,row_number() over(order by coalesce(f.shared,0) desc,
      (s.brand_id is not null and s.brand_id=c.brand_id) desc,c.display_rank,c.id) as position
    from source s cross join candidates c left join shared_families f on f.product_id=c.id
    order by coalesce(f.shared,0) desc,(s.brand_id is not null and s.brand_id=c.brand_id) desc,c.display_rank,c.id
    limit 4
  ), selected as (
    select * from manual union all select * from automatic
  )
  select api.catalog_settings()||jsonb_build_object('brands',api.catalog_brands(),
    'record',(select private.catalog_product_document(s.id) from source s),
    'recommendations',coalesce((select jsonb_agg(private.catalog_product_document(r.id) order by r.position,r.id)
      from selected r),'[]'::jsonb));
$$;

create or replace function api.catalog_products_by_ids(p_product_ids uuid[] default '{}'::uuid[],p_variant_ids uuid[] default '{}'::uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $ids$
declare v_result jsonb;
begin
  if p_product_ids is null or p_variant_ids is null
    or cardinality(p_product_ids)+cardinality(p_variant_ids)>100
    or coalesce(array_ndims(p_product_ids),1)>1 or coalesce(array_ndims(p_variant_ids),1)>1
    or array_position(p_product_ids,null) is not null or array_position(p_variant_ids,null) is not null then
    raise exception 'Selecciona hasta 100 productos o presentaciones válidos.' using errcode='22023';
  end if;
  with requested as materialized (
    select unnest(p_product_ids) as id
    union select v.product_id from app.product_variants v where v.id=any(p_variant_ids)
  ), selected as materialized (
    select p.id,p.display_rank from requested r join app.products p on p.id=r.id
    order by p.display_rank,p.id limit 100
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(private.catalog_product_document(s.id)
    order by s.display_rank,s.id),'[]'::jsonb),'total',count(*)) into v_result from selected s;
  return v_result;
end $ids$;
create or replace function api.catalog_products(p_limit integer default 24,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $pages$
declare v_result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100
    or p_offset is null or p_offset<0 or p_offset>100000 then
    raise exception 'La página solicitada no es válida.' using errcode='22023';
  end if;
  with published as materialized(select p.id,p.display_rank from app.products p),
  sales as materialized(select * from private.catalog_sales_units()),
  selected as materialized (
    select p.id,p.display_rank,coalesce(s.units,0) as units
    from published p left join sales s on s.product_id=p.id
    order by units desc,p.display_rank,p.id limit p_limit offset p_offset
  )
  select pg_catalog.jsonb_build_object(
    'items',coalesce((select pg_catalog.jsonb_agg(private.catalog_product_document(p.id)
      order by p.units desc,p.display_rank,p.id) from selected p),'[]'::jsonb),
    'total',(select pg_catalog.count(*) from published)) into v_result;
  return v_result;
end;
$pages$;
