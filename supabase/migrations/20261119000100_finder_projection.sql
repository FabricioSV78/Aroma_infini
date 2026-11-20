-- A fresh, single-snapshot projection for the existing browser-side matcher.
-- Keep canonical prices, offers, active variants and public RLS; omit only
-- detail fields and secondary media that the matcher/results never consume.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $preflight$
begin
  if not exists(select 1 from pg_catalog.pg_proc
    where oid='api.catalog_products(integer,integer)'::regprocedure
      and proowner='aro_api_executor'::regrole and prosecdef and provolatile='s'
      and proconfig=array['search_path=""']) then
    raise exception 'Unexpected public catalog security contract';
  end if;
end;
$preflight$;

create function api.catalog_finder_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare public_count bigint; result jsonb;
begin
  with published as materialized (
    select p.id,p.product_code,p.slug,p.name,p.brand_id,p.product_type,
      p.aromatic_profile,p.intensity_level,p.occasion,p.display_rank
    from app.products p limit 10001
  ), counted as (
    select pg_catalog.count(*) total from published
  ), eligible as materialized (
    select p.* from published p join app.brands b on b.id=p.brand_id and b.active
    where p.product_type='perfume' and (select total from counted)<=10000
      and exists(select 1 from app.product_variants v where v.product_id=p.id
        and v.active and v.stock>0 and v.price_cents>0 and v.ml>0)
  ), families as (
    select f.product_id,pg_catalog.jsonb_agg(f.family_code order by f.position) codes
    from app.product_olfactory_families f join eligible p on p.id=f.product_id
    group by f.product_id
  ), variants as (
    select v.product_id,pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',v.id,'sku',v.merchant_sku,'ml',v.ml,'label',v.label,
      'priceCents',v.price_cents,'stock',v.stock,'active',v.active,
      'finalPriceCents',private.catalog_price_cents(v.price_cents,o.enabled,
        o.discount_type,o.value,o.starts_at,o.ends_at,pg_catalog.now())
    ) order by v.price_cents,v.id) items
    from app.product_variants v join eligible p on p.id=v.product_id
      left join app.product_offers o on o.product_id=p.id
    where v.active group by v.product_id
  ), covers as materialized (
    select p.id product_id,m.id media_id,m.storage_kind,m.object_key
    from eligible p join app.product_images i on i.product_id=p.id and i.position=0
      join app.media_assets m on m.id=i.media_id and m.status='ready'
  ), documents as (
    select p.id,p.display_rank,pg_catalog.jsonb_build_object(
      'product',pg_catalog.jsonb_build_object(
        'id',p.id,'sku',p.product_code::text,'slug',p.slug,'name',p.name,
        'brandId',p.brand_id::text,'productType',p.product_type,
        'image',private.media_source(c.storage_kind,c.object_key),
        'family',p.aromatic_profile,'olfactoryFamilies',coalesce(f.codes,'[]'::jsonb),
        'variants',v.items,
        'discount',case when o.enabled and (o.starts_at is null or pg_catalog.now()>=o.starts_at)
          and (o.ends_at is null or pg_catalog.now()<o.ends_at)
          then pg_catalog.jsonb_build_object('active',true,'type',o.discount_type,'value',o.value,
            'startsAt',coalesce(pg_catalog.to_char(o.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),''),
            'endsAt',coalesce(pg_catalog.to_char(o.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),''))
          else null end
      ),
      'detail',pg_catalog.jsonb_build_object('occasion',p.occasion,'intensityLevel',p.intensity_level,
        'intensity',case p.intensity_level when 1 then 'Suave' when 2 then 'Moderada' when 3 then 'Intensa' else null end)
    ) value from eligible p join variants v on v.product_id=p.id
      join covers c on c.product_id=p.id left join families f on f.product_id=p.id
      left join app.product_offers o on o.product_id=p.id
  )
  select c.total,case when c.total>10000 then null else pg_catalog.jsonb_build_object(
    'brands',api.catalog_brands(),'olfactoryFamilies',api.catalog_olfactory_families(),
    'items',coalesce((select pg_catalog.jsonb_agg(d.value order by d.display_rank,d.id) from documents d),'[]'::jsonb),
    'mediaAssets',coalesce((select pg_catalog.jsonb_agg(private.media_document(m.id) order by m.id)
      from app.media_assets m where m.storage_kind='r2' and m.status='ready'
        and m.id in(select media_id from covers)),'[]'::jsonb),
    'total',(select pg_catalog.count(*) from eligible)
  ) end into public_count,result from counted c;
  if public_count>10000 then
    raise exception 'El catálogo supera el límite de lectura.' using errcode='22023';
  end if;
  return result;
end;
$$;

grant create on schema api to aro_api_executor;
alter function api.catalog_finder_context() owner to aro_api_executor;
revoke create on schema api from aro_api_executor;
revoke all on function api.catalog_finder_context() from public,anon,authenticated,service_role;
grant execute on function api.catalog_finder_context() to anon,authenticated;
comment on function api.catalog_finder_context() is
  'Fresh public finder inputs from one SQL snapshot, canonical variants/prices and cover manifests only. Ranking remains in the shared browser matcher.';
