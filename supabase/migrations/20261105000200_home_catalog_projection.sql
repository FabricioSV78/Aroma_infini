-- Home needs the full published vocabulary, but only four complete cards.
-- Keep the existing product publication RLS and DTO builder as the boundary.
-- Deploy this migration before the frontend that calls these two projections.
create function api.catalog_home_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  -- Match the existing snapshot limit; never silently omit finder options.
  if (select count(*) from app.products)>10000 then
    raise exception 'El catálogo supera el límite de lectura.' using errcode='22023';
  end if;
  return api.catalog_settings() || jsonb_build_object(
    'brands',api.catalog_brands(),
    'items',api.catalog_products(4,0)->'items',
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
end $$;

create function api.catalog_brand_previews()
returns jsonb language sql stable security definer set search_path='' as $$
  with previews as materialized (
    select b.id,b.slug,b.name,b.name_key,cover.media_id,cover.object_key,cover.storage_kind
    from app.brands b
    left join lateral (
      select i.media_id,m.object_key,m.storage_kind from app.products p
      join app.product_images i on i.product_id=p.id and i.position=0
      join app.media_assets m on m.id=i.media_id and m.status='ready'
      where p.brand_id=b.id order by p.display_rank,p.id limit 1
    ) cover on true
    where b.active
  )
  select jsonb_build_object(
    'brands',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'slug',p.slug,'name',p.name,
      'previewImage',case when p.media_id is null then null
        else private.media_source(p.storage_kind,p.object_key) end
    ) order by p.name_key,p.id) from previews p),'[]'::jsonb),
    'mediaAssets',coalesce((select jsonb_agg(private.media_document(m.media_id) order by m.media_id)
      from (select distinct p.media_id from previews p
        where p.media_id is not null and p.storage_kind='r2') m),'[]'::jsonb)
  );
$$;

grant create on schema api to aro_api_executor;
alter function api.catalog_home_context() owner to aro_api_executor;
alter function api.catalog_brand_previews() owner to aro_api_executor;
revoke create on schema api from aro_api_executor;
revoke all on function api.catalog_home_context(),api.catalog_brand_previews()
  from public,anon,authenticated,service_role;
grant execute on function api.catalog_home_context(),api.catalog_brand_previews() to anon,authenticated;
comment on function api.catalog_home_context() is
  'Published Home vocabulary in exact display order plus four existing card DTOs. No detail, media or commercial variants for unrendered cards. RLS-bound read only; requires migration-first frontend rollout.';
comment on function api.catalog_brand_previews() is
  'Active brands and their first published cover in the existing catalog display order, including only referenced public responsive manifests. RLS-bound read only.';
notify pgrst, 'reload schema';
