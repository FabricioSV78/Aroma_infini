-- Bounded public browse: filter/count lightweight candidates first and build
-- detailed product DTOs only for the requested page. The existing executor
-- remains subject to published-product RLS; no table grants change here.
create function api.catalog_browse(p_query jsonb default '{}'::jsonb, p_page_size integer default 12)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
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
  with available as materialized (
    select p.id,p.display_rank,p.product_type,p.gender,b.slug as brand_slug,
      p.name,coalesce(b.name,'') as brand_name,prices.minimum_price,prices.price_match
    from app.products p left join app.brands b on b.id=p.brand_id
    left join app.product_offers o on o.product_id=p.id
    cross join lateral (
      select min(quoted.final_price) as minimum_price,
        bool_or((v_min is null or quoted.final_price>=v_min) and (v_max is null or quoted.final_price<=v_max)) as price_match
      from app.product_variants v
      cross join lateral (select private.catalog_price_cents(v.price_cents,o.enabled,o.discount_type,o.value,o.starts_at,o.ends_at,now()) as final_price) quoted
      where v.product_id=p.id and v.active and v.stock>0
    ) prices
  ), matched as materialized (
    select a.* from available a
    where (cardinality(v_types)=0 or a.product_type=any(v_types))
      and (cardinality(v_brands)=0 or a.brand_slug=any(v_brands))
      and (cardinality(v_genders)=0 or (a.product_type='perfume' and a.gender=any(v_genders)))
      and (cardinality(v_families)=0 or (a.product_type='perfume' and exists(
        select 1 from app.product_olfactory_families f where f.product_id=a.id and f.family_code=any(v_families))))
      and (v_min is null and v_max is null or a.price_match)
      and (v_search='' or strpos(private.catalog_name_key(a.name||' '||a.brand_name),v_search)>0)
  ), counts as (
    select count(*) as total,greatest(1,ceil(count(*)::numeric/p_page_size))::integer as pages from matched
  ), selected as materialized (
    select m.id,m.display_rank,m.minimum_price from matched m
    order by case when v_order='mas-vendidos' then m.display_rank end,
      case when v_order='precio-asc' then m.minimum_price end asc,
      case when v_order='precio-desc' then m.minimum_price end desc,m.id
    limit p_page_size offset (least(v_page,(select pages from counts))-1)*p_page_size
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(private.catalog_product_document(s.id)
      order by case when v_order='mas-vendidos' then s.display_rank end,
        case when v_order='precio-asc' then s.minimum_price end asc,
        case when v_order='precio-desc' then s.minimum_price end desc,s.id) from selected s),'[]'::jsonb),
    'total',c.total,'availableTotal',(select count(*) from available),
    'page',least(v_page,c.pages),'pages',c.pages,'brands',api.catalog_brands(),
    'features',settings.features,'featuredBrandId',settings.featured_brand_id,
    'olfactoryFamilies',api.catalog_olfactory_families(),
    'familyCodes',coalesce((select jsonb_agg(code order by code) from (
      select distinct f.family_code as code from app.product_olfactory_families f join available a on a.id=f.product_id
    ) public_families),'[]'::jsonb)
  ) into v_result from counts c cross join lateral (
    select s.complements_enabled, jsonb_build_object('complementsEnabled',s.complements_enabled) as features,
      (select b.id from app.brands b where b.id=s.featured_brand_id and b.active) as featured_brand_id
    from app.store_settings s where s.singleton
  ) settings;
  return v_result;
end;
$$;
grant create on schema api to aro_api_executor;
alter function api.catalog_browse(jsonb,integer) owner to aro_api_executor;
revoke create on schema api from aro_api_executor;
revoke all on function api.catalog_browse(jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function api.catalog_browse(jsonb,integer) to anon,authenticated;
comment on function api.catalog_browse(jsonb,integer) is
  'Published catalog browse, 1..12 detailed DTOs, OR within each selected filter and AND across groups; final available-variant prices and deterministic page ordering. Subject to executor RLS.';

-- Targeted hydration for favourites, cart variants and explicitly related
-- products. Empty input must mean no products, never the entire catalogue.
create function api.catalog_products_by_ids(
  p_product_ids uuid[] default '{}'::uuid[],p_variant_ids uuid[] default '{}'::uuid[]
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_product_ids is null or p_variant_ids is null
    or cardinality(p_product_ids)+cardinality(p_variant_ids)>100
    or coalesce(array_ndims(p_product_ids),1)>1 or coalesce(array_ndims(p_variant_ids),1)>1
    or array_position(p_product_ids,null) is not null or array_position(p_variant_ids,null) is not null then
    raise exception 'Selecciona hasta 100 productos o presentaciones válidos.' using errcode='22023';
  end if;
  with selected as materialized (
    select p.id,p.display_rank from app.products p
    where p.id=any(p_product_ids) or exists(
      select 1 from app.product_variants v where v.product_id=p.id and v.id=any(p_variant_ids)
    )
    order by p.display_rank,p.id limit 100
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(private.catalog_product_document(s.id)
    order by s.display_rank,s.id),'[]'::jsonb),'total',count(*)) into v_result from selected s;
  return v_result;
end $$;
grant create on schema api to aro_api_executor;
alter function api.catalog_products_by_ids(uuid[],uuid[]) owner to aro_api_executor;
revoke create on schema api from aro_api_executor;
revoke all on function api.catalog_products_by_ids(uuid[],uuid[]) from public,anon,authenticated,service_role;
grant execute on function api.catalog_products_by_ids(uuid[],uuid[]) to anon,authenticated;
comment on function api.catalog_products_by_ids(uuid[],uuid[]) is
  'Read only requested published products/variant owners, at most 100 inputs and DTOs; RLS hides inactive, exhausted or disabled-feature products. No auth, contacts or internal records.';

-- Detail plus exact existing recommendation rules in one bounded public read.
-- Explicit published selections win without automatic filling. Otherwise rank
-- same-type candidates by shared families, brand, then public display order.
create function api.catalog_product_context(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  with source as materialized (
    select p.id,p.product_type,p.brand_id from app.products p
    where p.slug=p_slug and char_length(p_slug)<=512 and p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ), manual as materialized (
    select target.id,r.position::bigint as position
    from source s join app.product_recommendations r on r.product_id=s.id
    join app.products target on target.id=r.recommended_product_id and target.id<>s.id
    order by r.position,target.id limit 4
  ), automatic as materialized (
    select target.id,row_number() over(order by
      (select count(*) from app.product_olfactory_families a
        join app.product_olfactory_families b on b.family_code=a.family_code
        where a.product_id=s.id and b.product_id=target.id) desc,
      (s.brand_id is not null and s.brand_id=target.brand_id) desc,target.display_rank,target.id) as position
    from source s join app.products target on target.id<>s.id and target.product_type=s.product_type
    where not exists(select 1 from manual)
  ), selected as (
    select * from manual union all select * from automatic where position<=4
  )
  select api.catalog_settings()||jsonb_build_object('brands',api.catalog_brands(),
    'record',(select private.catalog_product_document(s.id) from source s),
    'recommendations',coalesce((select jsonb_agg(private.catalog_product_document(r.id) order by r.position,r.id)
      from selected r),'[]'::jsonb));
$$;
grant create on schema api to aro_api_executor;
alter function api.catalog_product_context(text) owner to aro_api_executor;
revoke create on schema api from aro_api_executor;
revoke all on function api.catalog_product_context(text) from public,anon,authenticated,service_role;
grant execute on function api.catalog_product_context(text) to anon,authenticated;
comment on function api.catalog_product_context(text) is
  'Published product detail plus at most four full recommendation DTOs using established explicit/fallback ranking. Missing/private slug returns null record and no recommendations.';
