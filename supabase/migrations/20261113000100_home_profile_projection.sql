-- Compact only redundant public profile rows. Preserve their first and last
-- occurrences so brand ordering and last-label-wins finder options stay exact.
-- No change to RLS, ACL, stock, prices, ranking, table data or the 10000 cap.
set local lock_timeout='3s';
set local statement_timeout='30s';
do $preflight$
begin
  if not exists(select 1 from pg_catalog.pg_proc
    where oid='api.catalog_home_context()'::regprocedure
      and proowner='aro_api_executor'::regrole and prosecdef and provolatile='s'
      and proconfig=array['search_path=""']) then
    raise exception 'Unexpected public Home security contract';
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
  ), profiles as materialized (
    select row_number() over(order by p.display_rank,p.id) as ordinal,
      jsonb_build_object(
        'brandId',coalesce(p.brand_id::text,''),'family',p.aromatic_profile,
        'olfactoryFamilies',coalesce(f.codes,'[]'::jsonb),'occasion',p.occasion,
        'intensity',case p.intensity_level when 1 then 'Suave' when 2 then 'Moderada' when 3 then 'Intensa' else null end,
        'finderAvailable',p.product_type='perfume' and p.brand_id is not null
          and coalesce(b.active,false) and ready.product_id is not null
      ) as profile
    from published p left join app.brands b on b.id=p.brand_id
      left join families f on f.product_id=p.id
      left join finder_ready ready on ready.product_id=p.id
    where (select total from counted)<=10000
  ), profile_bounds as (
    select min(ordinal) as first_ordinal,max(ordinal) as last_ordinal
    from profiles group by profile
  ), kept_ordinals as (
    select first_ordinal as ordinal from profile_bounds
    union select last_ordinal from profile_bounds
  )
  select c.total,case when c.total>10000 then null else
    api.catalog_settings()||jsonb_build_object(
      'brands',api.catalog_brands(),
      'finderAvailableCount',(select count(*) from profiles where (profile->>'finderAvailable')::boolean),
      'items',coalesce((select jsonb_agg(private.catalog_product_document(p.id)
        order by p.units desc,p.display_rank,p.id) from selected p),'[]'::jsonb),
      'profiles',coalesce((select jsonb_agg(p.profile order by p.ordinal)
        from profiles p join kept_ordinals k on k.ordinal=p.ordinal),'[]'::jsonb)
    ) end into public_count,result from counted c;
  if public_count>10000 then
    raise exception 'El catálogo supera el límite de lectura.' using errcode='22023';
  end if;
  return result;
end;
$$;
