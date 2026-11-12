-- Reviewed version-38 reference functions are frozen below for regression.
-- All rows, reference RPCs and helper grants exist only in the local SQL test.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner.';
  end if;
end $$;
create schema aroma_query_reference;
grant usage,create on schema aroma_query_reference to aro_api_executor;
grant usage on schema aroma_query_reference to anon,authenticated;
create function aroma_query_reference.catalog_home_context() returns jsonb language plpgsql stable security definer set search_path='' as $reference$
begin
  -- Match the existing snapshot limit; never silently omit finder options.
  if (select count(*) from app.products)>10000 then
    raise exception 'El catálogo supera el límite de lectura.' using errcode='22023';
  end if;
  return api.catalog_settings() || jsonb_build_object(
    'brands',api.catalog_brands(),
    
    'items',(with sales as materialized(select * from private.catalog_sales_units()),
      selected as materialized (
        select p.id,p.display_rank,coalesce(s.units,0) as units
        from app.products p left join sales s on s.product_id=p.id
        where p.product_type='perfume'
        order by units desc,p.display_rank,p.id limit 4
      ) select coalesce(jsonb_agg(private.catalog_product_document(p.id)
          order by p.units desc,p.display_rank,p.id),'[]'::jsonb) from selected p),
  
    'profiles',coalesce((select jsonb_agg(jsonb_build_object(
      'brandId',coalesce(p.brand_id::text,''),'family',p.aromatic_profile,
      'olfactoryFamilies',coalesce((select jsonb_agg(f.family_code order by f.position)
        from app.product_olfactory_families f where f.product_id=p.id),'[]'::jsonb),
      'occasion',p.occasion,
      'intensity',case p.intensity_level when 1 then 'Suave' when 2 then 'Moderada' when 3 then 'Intensa' else null end,
      -- Identical to getFinderOptions' availableRecords predicate after the
      -- published DTO has retained active variants. Budget/discount sorting
      -- does not affect whether an unbudgeted finder option is available.
      'finderAvailable',p.product_type='perfume' and p.brand_id is not null
        and exists(select 1 from app.brands b where b.id=p.brand_id and b.active)
        and exists(select 1 from app.product_variants v where v.product_id=p.id
          and v.active and v.stock>0 and v.price_cents>0 and v.ml>0)
    ) order by p.display_rank,p.id) from app.products p),'[]'::jsonb)
  );
end $reference$;
alter function aroma_query_reference.catalog_home_context() owner to aro_api_executor;
revoke all on function aroma_query_reference.catalog_home_context() from public,anon,authenticated,service_role;
grant execute on function aroma_query_reference.catalog_home_context() to anon,authenticated;
create function aroma_query_reference.catalog_browse(p_query jsonb default '{}'::jsonb,p_page_size integer default 12) returns jsonb language plpgsql stable security definer set search_path='' as $reference$
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
  with sales as materialized (select * from private.catalog_sales_units() where v_order='mas-vendidos'),
  available as materialized (
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
    select m.id,m.display_rank,m.minimum_price,coalesce(sales.units,0) as units from matched m left join sales on sales.product_id=m.id
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
    'total',c.total,'availableTotal',(select count(*) from available),
    'page',least(v_page,c.pages),'pages',c.pages,'brands',api.catalog_brands(),
    'features',settings.features,'featuredBrandId',settings.featured_brand_id,
    'olfactoryFamilies',api.catalog_olfactory_families(),
    'homeAnnouncement',(select content->'announcement' from app.home_document where singleton),
    'homeVersion',coalesce((select version from app.home_document where singleton),0),'shipping',private.shipping_document(false),'shippingVersion',coalesce((select version from app.shipping_settings where singleton),0),
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
$reference$;
alter function aroma_query_reference.catalog_browse(jsonb,integer) owner to aro_api_executor;
revoke all on function aroma_query_reference.catalog_browse(jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function aroma_query_reference.catalog_browse(jsonb,integer) to anon,authenticated;
create function aroma_query_reference.catalog_product_context(p_slug text) returns jsonb language sql stable security definer set search_path='' as $reference$
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
$reference$;
alter function aroma_query_reference.catalog_product_context(text) owner to aro_api_executor;
revoke all on function aroma_query_reference.catalog_product_context(text) from public,anon,authenticated,service_role;
grant execute on function aroma_query_reference.catalog_product_context(text) to anon,authenticated;
create function aroma_query_reference.catalog_products_by_ids(p_product_ids uuid[] default '{}'::uuid[],p_variant_ids uuid[] default '{}'::uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $reference$
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
end $reference$;
alter function aroma_query_reference.catalog_products_by_ids(uuid[],uuid[]) owner to aro_api_executor;
revoke all on function aroma_query_reference.catalog_products_by_ids(uuid[],uuid[]) from public,anon,authenticated,service_role;
grant execute on function aroma_query_reference.catalog_products_by_ids(uuid[],uuid[]) to anon,authenticated;
create function aroma_query_reference.catalog_products(p_limit integer default 24,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $reference$
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
$reference$;
alter function aroma_query_reference.catalog_products(integer,integer) owner to aro_api_executor;
revoke all on function aroma_query_reference.catalog_products(integer,integer) from public,anon,authenticated,service_role;
grant execute on function aroma_query_reference.catalog_products(integer,integer) to anon,authenticated;

revoke create on schema aroma_query_reference from aro_api_executor;

create function aroma_query_reference.ok(value boolean,label text) returns text
language plpgsql security invoker set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_query_reference.equal(old_sql text,new_sql text,label text) returns text
language plpgsql security invoker set search_path='' as $$
declare old_value jsonb;new_value jsonb;
begin
  execute old_sql into old_value;execute new_sql into new_value;
  return aroma_query_reference.ok(old_value is not distinct from new_value,label);
end $$;
create function aroma_query_reference.same_error(old_sql text,new_sql text,expected text,label text) returns text
language plpgsql security invoker set search_path='' as $$
declare old_state text;new_state text;old_message text;new_message text;
begin
  begin execute old_sql;exception when others then get stacked diagnostics old_state=returned_sqlstate,old_message=message_text;end;
  begin execute new_sql;exception when others then get stacked diagnostics new_state=returned_sqlstate,new_message=message_text;end;
  return aroma_query_reference.ok(old_state=expected and new_state=expected and old_message=new_message,label);
end $$;
create function aroma_query_reference.id(kind integer,n integer) returns uuid
language sql immutable security invoker set search_path='' as $$
  select ('e030000'||kind::text||'-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function aroma_query_reference.compare_matrix(label text) returns text
language plpgsql security invoker set search_path='' as $$
declare query jsonb;ordering text;source_slug text;cases integer:=0;products uuid[];variants uuid[];
begin
  foreach ordering in array array['mas-vendidos','precio-asc','precio-desc'] loop
    for query in select jsonb_build_object('order',ordering)||q from jsonb_array_elements('[
      {},{"page":2},{"page":100000},{"min":"100","max":"220"},{"min":"220","max":"100"},
      {"min":"100.25","max":"100.25"},{"min":"900000"},
      {"brands":["query-one"]},{"brands":["query-two","query-one"]},{"brands":["unknown-brand"]},
      {"genders":["hombre","unisex"]},{"families":["floral","citrico"]},
      {"families":["unknown-family"]},{"families":["floral"],"brands":["query-two"],"genders":["mujer"]},
      {"search":"CITRICO"},{"search":"100%"},{"search":"_"},{"search":"no such perfume"},
      {"productTypes":["complemento"],"families":["floral"],"genders":["hombre"]},
      {"productTypes":["perfume","complemento"],"families":["citrico"]},
      {"productTypes":["perfume"],"search":"QUERY"},{"brands":["query-one"],"min":"90","max":"200","families":["floral"]}
    ]'::jsonb) q loop
      perform aroma_query_reference.equal(format('select aroma_query_reference.catalog_browse(%L::jsonb,12)',query::text),
        format('select api.catalog_browse(%L::jsonb,12)',query::text),label||' browse '||query::text);
      cases:=cases+1;
    end loop;
  end loop;
  perform aroma_query_reference.equal('select aroma_query_reference.catalog_home_context()','select api.catalog_home_context()',label||' complete Home and profile order');
  foreach source_slug in array array['query-1','query-3','query-4','query-6','query-11','query-70','query-82','missing-product','bad/slug'] loop
    perform aroma_query_reference.equal(format('select aroma_query_reference.catalog_product_context(%L)',source_slug),
      format('select api.catalog_product_context(%L)',source_slug),label||' detail '||source_slug);
  end loop;
  perform aroma_query_reference.equal('select aroma_query_reference.catalog_product_context(null)','select api.catalog_product_context(null)',label||' missing null slug');
  products:=array[aroma_query_reference.id(3,1),aroma_query_reference.id(3,11),aroma_query_reference.id(3,70),aroma_query_reference.id(3,80),aroma_query_reference.id(3,999)];
  variants:=array[aroma_query_reference.id(4,2),aroma_query_reference.id(4,3),aroma_query_reference.id(4,999)];
  perform aroma_query_reference.equal(format('select aroma_query_reference.catalog_products_by_ids(%L::uuid[],%L::uuid[])',products,variants),
    format('select api.catalog_products_by_ids(%L::uuid[],%L::uuid[])',products,variants),label||' mixed product/variant IDs, inactive IDs and duplicates');
  perform aroma_query_reference.equal('select aroma_query_reference.catalog_products_by_ids()','select api.catalog_products_by_ids()',label||' empty requested IDs stay empty');
  perform aroma_query_reference.equal('select aroma_query_reference.catalog_products(12,0)','select api.catalog_products(12,0)',label||' snapshot first page');
  perform aroma_query_reference.equal('select aroma_query_reference.catalog_products(12,60)','select api.catalog_products(12,60)',label||' snapshot last page');
  perform aroma_query_reference.equal('select aroma_query_reference.catalog_products(12,100000)','select api.catalog_products(12,100000)',label||' snapshot beyond last page');
  return 'PASS: '||label||' JSON equivalence ('||cases||' filter/order combinations, Home, detail, IDs and pages)';
end $$;
revoke all on all functions in schema aroma_query_reference from public,service_role;
grant execute on all functions in schema aroma_query_reference to anon,authenticated;

insert into app.brands(id,name,slug,active) values
 (aroma_query_reference.id(1,1),'Query One','query-one',true),
 (aroma_query_reference.id(1,2),'Query Two','query-two',true),
 (aroma_query_reference.id(1,3),'Query Hidden','query-hidden',false);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at) values
 (aroma_query_reference.id(2,1),'local','/images/query-fixture.webp','image/webp',800,1000,'ready',now()),
 (aroma_query_reference.id(2,2),'local','/images/query-disabled.webp','image/webp',800,1000,'disabled',now());
insert into app.products(id,name,slug,brand_id,product_type,gender,aromatic_profile,short_description,description,active,display_rank,intensity_level,occasion)
select aroma_query_reference.id(3,i),case i when 1 then 'Cítrico 100%_Query' else 'Query Perfume '||i end,'query-'||i,
  case when i=72 then aroma_query_reference.id(1,3) else aroma_query_reference.id(1,1+i%2) end,
  'perfume',(array['hombre','mujer','unisex'])[1+i%3],'Floral · Cítrico','Query fixture','Local fixture only',i<70,i%9,
  1+i%3,case when i%2=0 then 'Diario' else 'Noche' end from generate_series(1,72)i;
insert into app.product_variants(id,product_id,merchant_sku,ml,price_cents,stock,active)
select aroma_query_reference.id(4,i*2+j),aroma_query_reference.id(3,i),'QUERY-'||i||'-'||j,
  case j when 0 then 50 else 100 end,10000+i*37+j*7000,
  case when i=71 then 0 when i%7=0 and j=0 then 0 when i%7<>0 and j=1 then 0 else 5 end,
  not(i%10=0 and j=1) from generate_series(1,72)i cross join generate_series(0,1)j;
insert into app.product_images(product_id,position,media_id)
  select aroma_query_reference.id(3,i),0,aroma_query_reference.id(2,case i when 70 then 2 else 1 end) from generate_series(1,72)i;
insert into app.product_olfactory_families(product_id,family_code,position)
  select aroma_query_reference.id(3,i),case when i%2=0 then 'floral' else 'citrico' end,0 from generate_series(1,72)i;
insert into app.product_olfactory_families(product_id,family_code,position)
  select aroma_query_reference.id(3,i),'amaderado',1 from generate_series(1,72)i where i%3=0;
insert into app.product_offers(product_id,enabled,discount_type,value,starts_at,ends_at)
select aroma_query_reference.id(3,i),i%5<>0,case when i%2=0 then 'percent' else 'fixed' end,
  case when i%2=0 then 15 else 1000 end,
  case when i%8=0 then now()+interval '1 day' else now()-interval '2 days' end,
  case when i%8=0 then now()+interval '2 days' when i%8=4 then now()-interval '1 day' else null end
  from generate_series(1,72)i where i%4<>3;
insert into app.product_recommendations(product_id,position,recommended_product_id) values
 (aroma_query_reference.id(3,3),0,aroma_query_reference.id(3,7)),
 (aroma_query_reference.id(3,3),1,aroma_query_reference.id(3,8)),
 (aroma_query_reference.id(3,4),0,aroma_query_reference.id(3,70)),
 (aroma_query_reference.id(3,6),0,aroma_query_reference.id(3,7));
insert into app.products(id,name,slug,brand_id,product_type,short_description,description,active,display_rank)
  select aroma_query_reference.id(3,i),'Query accessory '||i,'query-'||i,case when i=82 then null else aroma_query_reference.id(1,1) end,'complemento','Fixture','Local fixture',true,0 from generate_series(80,82)i;
insert into app.product_variants(id,product_id,merchant_sku,label,price_cents,stock)
  select aroma_query_reference.id(4,i*2),aroma_query_reference.id(3,i),'QUERY-'||i,'Unidad',1500,3 from generate_series(80,82)i;
insert into app.product_images(product_id,position,media_id)
  select aroma_query_reference.id(3,i),0,aroma_query_reference.id(2,1) from generate_series(80,82)i;
set constraints all immediate;

set local role anon;
select aroma_query_reference.compare_matrix('Anonymous, complements disabled');
select aroma_query_reference.same_error('select aroma_query_reference.catalog_browse(null)','select api.catalog_browse(null)','22023','Null browse query validation unchanged');
select aroma_query_reference.same_error('select aroma_query_reference.catalog_browse(''{"page":0}'')','select api.catalog_browse(''{"page":0}'')','22023','Page bounds validation unchanged');
select aroma_query_reference.same_error('select aroma_query_reference.catalog_browse(''{"min":"-1"}'')','select api.catalog_browse(''{"min":"-1"}'')','22023','Price validation unchanged');
select aroma_query_reference.same_error('select aroma_query_reference.catalog_browse(''{"genders":["bad"]}'')','select api.catalog_browse(''{"genders":["bad"]}'')','22023','Gender validation unchanged');
select aroma_query_reference.same_error('select aroma_query_reference.catalog_products(101,0)','select api.catalog_products(101,0)','22023','Snapshot size cap unchanged');
select aroma_query_reference.same_error('select aroma_query_reference.catalog_products_by_ids(null)','select api.catalog_products_by_ids(null)','22023','Requested ID validation unchanged');
reset role;
update app.store_settings set complements_enabled=true;
set local role anon;
select aroma_query_reference.compare_matrix('Anonymous, complements enabled');
reset role;
insert into auth.users(id,email) values(aroma_query_reference.id(5,1),'query-customer@example.invalid'),(aroma_query_reference.id(5,2),'query-admin@example.invalid');
insert into private.admin_memberships(user_id) values(aroma_query_reference.id(5,2));
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_query_reference.id(5,1),'aal','aal1')::text,true);
set local role authenticated;
select aroma_query_reference.compare_matrix('Authenticated customer');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_query_reference.id(5,2),'aal','aal2')::text,true);
set local role authenticated;
select aroma_query_reference.compare_matrix('Admin identity still sees only published products through public RPCs');
reset role;
select aroma_query_reference.ok((select count(*)=5 from pg_proc where oid in(
  'api.catalog_home_context()'::regprocedure,'api.catalog_browse(jsonb,integer)'::regprocedure,
  'api.catalog_product_context(text)'::regprocedure,'api.catalog_products_by_ids(uuid[],uuid[])'::regprocedure,
  'api.catalog_products(integer,integer)'::regprocedure) and proowner='aro_api_executor'::regrole and prosecdef
  and provolatile='s' and proconfig=array['search_path=""']), 'Public rewrite preserves owners, STABLE, SECURITY DEFINER and fixed search path');
select aroma_query_reference.ok(not has_function_privilege('anon','private.catalog_product_is_published(app.products)','execute')
  and not has_table_privilege('anon','app.products','select') and not has_table_privilege('authenticated','app.products','select'),
  'Query rewrite exposes no private helpers or raw product tables');

-- Verify the actual numeric Home guard, using only this local transaction.
set constraints all deferred;
insert into app.products(id,name,slug,brand_id,gender,short_description,description,active)
  select aroma_query_reference.id(6,i),'Guard Fixture '||i,'query-guard-'||i,aroma_query_reference.id(1,1),'unisex','Fixture','Local guard fixture',true from generate_series(1,10001)i;
insert into app.product_variants(product_id,ml,price_cents,stock)
  select aroma_query_reference.id(6,i),50,12000,5 from generate_series(1,10001)i;
insert into app.product_images(product_id,position,media_id)
  select aroma_query_reference.id(6,i),0,aroma_query_reference.id(2,1) from generate_series(1,10001)i;
set constraints all immediate;
set local role anon;
select aroma_query_reference.same_error('select aroma_query_reference.catalog_home_context()','select api.catalog_home_context()',
  '22023','Home rejects more than 10000 public products with its original error');
reset role;
rollback;
