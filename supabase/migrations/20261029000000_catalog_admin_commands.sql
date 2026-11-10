-- Catalog commands only. No browser snapshot, demo records, media bytes,
-- shipping tariffs, orders or Home content are copied into the database.
-- A separate restricted executor prevents an administrative read policy from
-- widening the published DTO functions owned by aro_api_executor.
create role aro_catalog_admin_executor nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;
grant aro_catalog_admin_executor to postgres;
grant usage on schema app, api, private to aro_catalog_admin_executor;
grant execute on function private.is_admin(), private.catalog_name_key(text),
  private.catalog_validate_product(uuid) to aro_catalog_admin_executor;
grant select on table app.brands, app.media_assets, app.products,
  app.product_variants, app.olfactory_families, app.product_olfactory_families,
  app.product_notes, app.product_images, app.product_recommendations,
  app.product_offers, app.store_settings to aro_catalog_admin_executor;
grant insert, update, delete on table app.brands, app.products,
  app.product_variants, app.product_olfactory_families, app.product_notes,
  app.product_images, app.product_recommendations, app.product_offers
  to aro_catalog_admin_executor;
grant update on table app.store_settings to aro_catalog_admin_executor;
grant usage on sequence app.product_code_seq to aro_catalog_admin_executor;

create policy catalog_admin_brands on app.brands to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_products on app.products to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_variants on app.product_variants to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_product_families on app.product_olfactory_families to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_notes on app.product_notes to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_images on app.product_images to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_recommendations on app.product_recommendations to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_offers on app.product_offers to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_settings on app.store_settings to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy catalog_admin_media_read on app.media_assets for select to aro_catalog_admin_executor
  using ((select private.is_admin()));
create policy catalog_admin_family_read on app.olfactory_families for select to aro_catalog_admin_executor
  using ((select private.is_admin()));

create function private.require_catalog_admin()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Necesitas una sesión administrativa con verificación en dos pasos.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_catalog_admin() from public, anon, authenticated, service_role;
grant execute on function private.require_catalog_admin() to aro_catalog_admin_executor;

-- Deferred constraint triggers otherwise execute at the outer transaction's
-- COMMIT after SECURITY DEFINER has restored the caller's unprivileged role.
-- Flush only these catalog constraints while still inside the restricted
-- command executor, then restore the transaction's deferred composition mode.
-- Never grant table/schema access to a browser role to solve this boundary.
create function private.catalog_flush_constraints()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  set constraints app.catalog_products_valid, app.catalog_variants_valid,
    app.catalog_images_valid, app.catalog_families_valid, app.catalog_notes_valid,
    app.catalog_offers_valid, app.catalog_brands_valid, app.catalog_media_valid immediate;
  set constraints app.catalog_products_valid, app.catalog_variants_valid,
    app.catalog_images_valid, app.catalog_families_valid, app.catalog_notes_valid,
    app.catalog_offers_valid, app.catalog_brands_valid, app.catalog_media_valid deferred;
end;
$$;
revoke all on function private.catalog_flush_constraints() from public, anon, authenticated, service_role;
grant execute on function private.catalog_flush_constraints() to aro_catalog_admin_executor;

create function private.admin_product_document(p_product_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'product', pg_catalog.jsonb_build_object(
      'id', p.id, 'sku', p.product_code::text, 'slug', p.slug, 'name', p.name,
      'brandId', coalesce(p.brand_id::text, ''), 'productType', p.product_type,
      'image', coalesce(main_image.object_key, ''), 'family', p.aromatic_profile,
      'olfactoryFamilies', coalesce((select pg_catalog.jsonb_agg(f.family_code order by f.position)
        from app.product_olfactory_families f where f.product_id = p.id), '[]'::jsonb),
      'variants', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', v.id, 'sku', v.merchant_sku, 'ml', v.ml, 'label', v.label,
        'priceCents', v.price_cents, 'stock', v.stock, 'active', v.active
      ) order by v.created_at, v.id) from app.product_variants v where v.product_id = p.id), '[]'::jsonb),
      'discount', case when o.product_id is not null then pg_catalog.jsonb_build_object(
        'active', o.enabled, 'type', o.discount_type, 'value', o.value,
        'startsAt', coalesce(pg_catalog.to_char(o.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''),
        'endsAt', coalesce(pg_catalog.to_char(o.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '')
      ) else null end
    ),
    'detail', pg_catalog.jsonb_build_object(
      'shortDescription', p.short_description, 'description', p.description,
      'olfactoryImage', olfactory.object_key,
      'notes', pg_catalog.jsonb_build_object(
        'top', coalesce((select pg_catalog.jsonb_agg(n.label order by n.position) from app.product_notes n where n.product_id = p.id and n.phase = 'top'), '[]'::jsonb),
        'heart', coalesce((select pg_catalog.jsonb_agg(n.label order by n.position) from app.product_notes n where n.product_id = p.id and n.phase = 'heart'), '[]'::jsonb),
        'base', coalesce((select pg_catalog.jsonb_agg(n.label order by n.position) from app.product_notes n where n.product_id = p.id and n.phase = 'base'), '[]'::jsonb)
      ),
      'intensityLevel', p.intensity_level,
      'intensity', case p.intensity_level when 1 then 'Suave' when 2 then 'Moderada' when 3 then 'Intensa' else null end,
      'occasion', p.occasion, 'season', p.season,
      'gallery', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'image', m.object_key, 'alt', p.name || coalesce(' · ' || b.name, '') || ' · Vista ' || (i.position + 1)::text,
        'framing', i.framing
      ) order by i.position) from app.product_images i join app.media_assets m on m.id = i.media_id
        where i.product_id = p.id), '[]'::jsonb),
      'recommendationIds', coalesce((select pg_catalog.jsonb_agg(r.recommended_product_id order by r.position)
        from app.product_recommendations r where r.product_id = p.id), '[]'::jsonb)
    ),
    'active', p.active, 'gender', p.gender, 'popularity', p.display_rank,
    'newest', p.newest_rank, 'lowStockThreshold', p.low_stock_threshold
  )
  from app.products p left join app.brands b on b.id = p.brand_id
  left join app.product_images cover on cover.product_id = p.id and cover.position = 0
  left join app.media_assets main_image on main_image.id = cover.media_id
  left join app.media_assets olfactory on olfactory.id = p.olfactory_media_id
  left join app.product_offers o on o.product_id = p.id
  where p.id = p_product_id;
$$;
revoke all on function private.admin_product_document(uuid) from public, anon, authenticated, service_role;
grant execute on function private.admin_product_document(uuid) to aro_catalog_admin_executor;

create function private.catalog_ready_image(p_reference text)
returns uuid language plpgsql stable security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if p_reference is null or p_reference = '' then return null; end if;
  if pg_catalog.char_length(p_reference) > 512 or p_reference ~ '^(data:|blob:)' then
    raise exception 'Las imágenes deben estar almacenadas y verificadas. La subida permanente se habilitará con R2.' using errcode = '22023';
  end if;
  select id into v_id from app.media_assets
    where object_key = p_reference and status = 'ready' and mime_type like 'image/%'
    order by storage_kind, id limit 1;
  if v_id is null then
    raise exception 'La imagen todavía no tiene una referencia de almacenamiento verificada.' using errcode = '22023';
  end if;
  return v_id;
end;
$$;
revoke all on function private.catalog_ready_image(text) from public, anon, authenticated, service_role;
grant execute on function private.catalog_ready_image(text) to aro_catalog_admin_executor;

create function private.catalog_write_offer(p_product_id uuid, p_offer jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_offer is null or p_offer = 'null'::jsonb then
    delete from app.product_offers where product_id = p_product_id;
    return;
  end if;
  if pg_catalog.jsonb_typeof(p_offer) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_offer->'active') is distinct from 'boolean'
    or coalesce(p_offer->>'type', '') not in ('percent', 'fixed')
    or coalesce(p_offer->>'value', '') !~ '^[0-9]+$' then
    raise exception 'Revisa el tipo y el valor de la oferta.' using errcode = '22023';
  end if;
  insert into app.product_offers(product_id, enabled, discount_type, value, starts_at, ends_at)
    values(p_product_id, (p_offer->>'active')::boolean, p_offer->>'type',
      (p_offer->>'value')::bigint, nullif(p_offer->>'startsAt', '')::timestamptz,
      nullif(p_offer->>'endsAt', '')::timestamptz)
  on conflict(product_id) do update set enabled = excluded.enabled,
    discount_type = excluded.discount_type, value = excluded.value,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    version = app.product_offers.version + 1;
end;
$$;
revoke all on function private.catalog_write_offer(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function private.catalog_write_offer(uuid, jsonb) to aro_catalog_admin_executor;

create function api.admin_catalog_page(p_limit integer default 100, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_catalog_admin();
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then
    raise exception 'La página solicitada no es válida.' using errcode = '22023';
  end if;
  return pg_catalog.jsonb_build_object(
    'products', coalesce((select pg_catalog.jsonb_agg(private.admin_product_document(page.id) order by page.created_at, page.id)
      from (select id, created_at from app.products order by created_at, id limit p_limit offset p_offset) page), '[]'::jsonb),
    'brands', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', id, 'name', name, 'slug', slug, 'active', active) order by name_key, id) from app.brands), '[]'::jsonb),
    'features', (select pg_catalog.jsonb_build_object('complementsEnabled', complements_enabled) from app.store_settings where singleton),
    'productVersions', coalesce((select pg_catalog.jsonb_object_agg(page.id::text, page.version) from
      (select id, version from app.products order by created_at, id limit p_limit offset p_offset) page), '{}'::jsonb),
    'brandVersions', coalesce((select pg_catalog.jsonb_object_agg(id::text, version) from app.brands), '{}'::jsonb),
    'settingsVersion', (select version from app.store_settings where singleton),
    'featuredBrandId', (select featured_brand_id from app.store_settings where singleton),
    'total', (select pg_catalog.count(*) from app.products)
  );
end;
$$;

create function api.admin_save_product(p_record jsonb, p_expected_version bigint default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_product jsonb := p_record->'product';
  v_detail jsonb := p_record->'detail';
  v_id uuid;
  v_existing app.products%rowtype;
  v_variant jsonb;
  v_item jsonb;
  v_variant_id uuid;
  v_variant_ids uuid[] := '{}'::uuid[];
  v_phase text;
  v_position integer;
  v_reference uuid;
begin
  perform private.require_catalog_admin();
  if pg_catalog.jsonb_typeof(p_record) is distinct from 'object' or pg_catalog.jsonb_typeof(v_product) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_detail) is distinct from 'object' or pg_catalog.pg_column_size(p_record) > 262144
    or pg_catalog.jsonb_typeof(v_product->'variants') is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_product->'variants') not between 1 and 100
    or pg_catalog.jsonb_typeof(v_detail->'gallery') is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_detail->'gallery') > 4
    or pg_catalog.jsonb_typeof(p_record->'active') is distinct from 'boolean'
    or pg_catalog.char_length(coalesce(v_product->>'name', '')) not between 1 and 200
    or pg_catalog.char_length(coalesce(v_product->>'slug', '')) not between 1 and 240
    or pg_catalog.char_length(coalesce(v_detail->>'shortDescription', '')) not between 1 and 2000
    or pg_catalog.char_length(coalesce(v_detail->>'description', '')) not between 1 and 30000 then
    raise exception 'Revisa los datos, las presentaciones y las imágenes del producto.' using errcode = '22023';
  end if;
  v_id := coalesce(nullif(v_product->>'id', '')::uuid, pg_catalog.gen_random_uuid());
  select * into v_existing from app.products where id = v_id for update;
  if found then
    if p_expected_version is null or p_expected_version <> v_existing.version then
      raise exception 'El producto cambió en otra sesión. Actualiza la página antes de guardar.' using errcode = '40001';
    end if;
  elsif p_expected_version is not null then
    raise exception 'El producto ya no está disponible. Actualiza la página.' using errcode = '40001';
  end if;
  -- Resolve references before any mutation. The browser cannot register media
  -- as verified or place data URIs in SQL through a product command.
  v_reference := private.catalog_ready_image(v_detail->>'olfactoryImage');
  if v_existing.id is null then
    insert into app.products(id, slug, name, brand_id, product_type, gender,
      aromatic_profile, short_description, description, intensity_level,
      occasion, season, olfactory_media_id, active, display_rank, newest_rank, low_stock_threshold)
    values(v_id, v_product->>'slug', pg_catalog.btrim(v_product->>'name'), nullif(v_product->>'brandId', '')::uuid,
      coalesce(v_product->>'productType', 'perfume'), p_record->>'gender',
      coalesce(v_product->>'family', ''), v_detail->>'shortDescription', v_detail->>'description',
      (v_detail->>'intensityLevel')::smallint, coalesce(v_detail->>'occasion', ''), coalesce(v_detail->>'season', ''),
      v_reference, (p_record->>'active')::boolean, coalesce((p_record->>'popularity')::integer, 0),
      coalesce((p_record->>'newest')::integer, 0), coalesce((p_record->>'lowStockThreshold')::integer, 2));
  else
    update app.products set slug = v_product->>'slug', name = pg_catalog.btrim(v_product->>'name'),
      brand_id = nullif(v_product->>'brandId', '')::uuid, product_type = coalesce(v_product->>'productType', 'perfume'),
      gender = p_record->>'gender', aromatic_profile = coalesce(v_product->>'family', ''),
      short_description = v_detail->>'shortDescription', description = v_detail->>'description',
      intensity_level = (v_detail->>'intensityLevel')::smallint, occasion = coalesce(v_detail->>'occasion', ''),
      season = coalesce(v_detail->>'season', ''), olfactory_media_id = v_reference,
      active = (p_record->>'active')::boolean, display_rank = coalesce((p_record->>'popularity')::integer, 0),
      newest_rank = coalesce((p_record->>'newest')::integer, 0),
      low_stock_threshold = coalesce((p_record->>'lowStockThreshold')::integer, 2), version = version + 1
      where id = v_id;
  end if;
  -- Stage the final variant set, preserving UUIDs belonging to this product.
  -- Removing first permits swapping presentation labels without an intermediate
  -- UNIQUE failure, and the transaction's deferred validator checks the final set.
  for v_variant in select value from pg_catalog.jsonb_array_elements(v_product->'variants') loop
    v_variant_id := nullif(v_variant->>'id', '')::uuid;
    if v_variant_id is null or v_variant_id = any(v_variant_ids)
      or exists(select 1 from app.product_variants where id = v_variant_id and product_id <> v_id) then
      raise exception 'Las presentaciones contienen identificadores repetidos o de otro producto.' using errcode = '22023';
    end if;
    v_variant_ids := pg_catalog.array_append(v_variant_ids, v_variant_id);
  end loop;
  delete from app.product_variants where product_id = v_id;
  for v_variant in select value from pg_catalog.jsonb_array_elements(v_product->'variants') loop
    if pg_catalog.jsonb_typeof(v_variant) is distinct from 'object'
      or coalesce(v_variant->>'stock', '') !~ '^[0-9]+$'
      or coalesce(v_variant->>'priceCents', '') !~ '^[0-9]+$' then
      raise exception 'Revisa el precio y el stock de cada presentación.' using errcode = '22023';
    end if;
    insert into app.product_variants(id, product_id, merchant_sku, ml, label, price_cents, stock, active)
    values((v_variant->>'id')::uuid, v_id, nullif(pg_catalog.upper(pg_catalog.btrim(v_variant->>'sku')), ''),
      (v_variant->>'ml')::integer, nullif(pg_catalog.btrim(v_variant->>'label'), ''),
      (v_variant->>'priceCents')::bigint, (v_variant->>'stock')::integer,
      coalesce((v_variant->>'active')::boolean, true));
  end loop;
  delete from app.product_images where product_id = v_id;
  v_position := 0;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_detail->'gallery') loop
    v_reference := private.catalog_ready_image(v_item->>'image');
    if v_reference is null then raise exception 'Selecciona una referencia de imagen válida.' using errcode = '22023'; end if;
    insert into app.product_images(product_id, position, media_id, framing)
      values(v_id, v_position, v_reference, coalesce(v_item->>'framing', 'full'));
    v_position := v_position + 1;
  end loop;
  if coalesce(v_product->>'image', '') <> coalesce(v_detail->'gallery'->0->>'image', '') then
    raise exception 'La fotografía principal debe ser la primera de la galería.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_product->'olfactoryFamilies') is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_product->'olfactoryFamilies') > 8 then
    raise exception 'Selecciona familias olfativas válidas.' using errcode = '22023';
  end if;
  delete from app.product_olfactory_families where product_id = v_id;
  v_position := 0;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_product->'olfactoryFamilies') loop
    insert into app.product_olfactory_families(product_id, family_code, position)
      values(v_id, v_item #>> '{}', v_position);
    v_position := v_position + 1;
  end loop;
  delete from app.product_notes where product_id = v_id;
  foreach v_phase in array array['top', 'heart', 'base'] loop
    if pg_catalog.jsonb_typeof(v_detail->'notes'->v_phase) is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_detail->'notes'->v_phase) > 30 then
      raise exception 'Revisa las notas de salida, corazón y fondo.' using errcode = '22023';
    end if;
    v_position := 0;
    for v_item in select value from pg_catalog.jsonb_array_elements(v_detail->'notes'->v_phase) loop
      if pg_catalog.jsonb_typeof(v_item) is distinct from 'string' or pg_catalog.char_length(v_item #>> '{}') > 160 then
        raise exception 'Cada nota debe ser un texto de hasta 160 caracteres.' using errcode = '22023';
      end if;
      insert into app.product_notes(product_id, phase, position, label) values(v_id, v_phase, v_position, v_item #>> '{}');
      v_position := v_position + 1;
    end loop;
  end loop;
  if pg_catalog.jsonb_typeof(v_detail->'recommendationIds') is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_detail->'recommendationIds') > 4 then
    raise exception 'Selecciona hasta cuatro recomendaciones.' using errcode = '22023';
  end if;
  delete from app.product_recommendations where product_id = v_id;
  v_position := 0;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_detail->'recommendationIds') loop
    insert into app.product_recommendations(product_id, recommended_product_id, position)
      values(v_id, (v_item #>> '{}')::uuid, v_position);
    v_position := v_position + 1;
  end loop;
  perform private.catalog_write_offer(v_id, v_product->'discount');
  -- Execute now as well as at COMMIT: a success DTO must reflect automatic
  -- stock deactivation, and invalid data must never produce a success response.
  perform private.catalog_validate_product(v_id);
  perform private.catalog_flush_constraints();
  return pg_catalog.jsonb_build_object('record', private.admin_product_document(v_id),
    'version', (select version from app.products where id = v_id));
end;
$$;

create function api.admin_delete_product(p_id uuid, p_expected_version bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  select version into v_version from app.products where id = p_id for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'El producto cambió en otra sesión. Actualiza la página.' using errcode = '40001';
  end if;
  if exists(select 1 from app.product_recommendations where recommended_product_id = p_id and product_id <> p_id) then
    raise exception 'El producto está vinculado a otras recomendaciones. Retira esas referencias antes de eliminarlo.' using errcode = '23503';
  end if;
  delete from app.products where id = p_id;
  perform private.catalog_flush_constraints();
end;
$$;

create function api.admin_import_products(p_records jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_record jsonb; v_saved jsonb; v_products jsonb := '[]'::jsonb; v_versions jsonb := '{}'::jsonb;
begin
  perform private.require_catalog_admin();
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_records) not between 1 and 1000
    or pg_catalog.pg_column_size(p_records) > 8388608 then
    raise exception 'Importa entre 1 y 1000 productos por operación.' using errcode = '22023';
  end if;
  -- One transaction for the complete reviewed import. UUIDs supplied once by
  -- the caller make retry conflicts explicit rather than creating duplicates.
  for v_record in select value from pg_catalog.jsonb_array_elements(p_records) loop
    v_saved := api.admin_save_product(v_record, null);
    v_products := v_products || pg_catalog.jsonb_build_array(v_saved->'record');
    v_versions := v_versions || pg_catalog.jsonb_build_object(v_saved->'record'->'product'->>'id', v_saved->'version');
  end loop;
  return pg_catalog.jsonb_build_object('products', v_products, 'productVersions', v_versions);
end;
$$;

create function api.admin_set_stock(p_variant_id uuid, p_stock integer, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_product_id uuid; v_version bigint;
begin
  perform private.require_catalog_admin();
  if p_stock is null or p_stock < 0 then raise exception 'El stock no puede ser negativo.' using errcode = '22023'; end if;
  select product_id into v_product_id from app.product_variants where id = p_variant_id;
  select version into v_version from app.products where id = v_product_id for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'El producto cambió en otra sesión. Actualiza la página.' using errcode = '40001';
  end if;
  update app.product_variants set stock = p_stock, version = version + 1 where id = p_variant_id and product_id = v_product_id;
  update app.products set version = version + 1 where id = v_product_id;
  perform private.catalog_validate_product(v_product_id);
  perform private.catalog_flush_constraints();
  return pg_catalog.jsonb_build_object('record', private.admin_product_document(v_product_id),
    'version', (select version from app.products where id = v_product_id));
end;
$$;

create function api.admin_save_offer(p_product_id uuid, p_offer jsonb, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  select version into v_version from app.products where id = p_product_id for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'El producto cambió en otra sesión. Actualiza la página.' using errcode = '40001';
  end if;
  perform private.catalog_write_offer(p_product_id, p_offer);
  update app.products set version = version + 1 where id = p_product_id;
  perform private.catalog_validate_product(p_product_id);
  perform private.catalog_flush_constraints();
  return pg_catalog.jsonb_build_object('record', private.admin_product_document(p_product_id),
    'version', (select version from app.products where id = p_product_id));
end;
$$;

create function api.admin_save_brand(p_brand jsonb, p_expected_version bigint default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_version bigint; v_name text;
begin
  perform private.require_catalog_admin();
  if pg_catalog.jsonb_typeof(p_brand) is distinct from 'object' or pg_catalog.jsonb_typeof(p_brand->'active') is distinct from 'boolean' then
    raise exception 'Revisa el nombre y la URL de la marca.' using errcode = '22023';
  end if;
  v_id := coalesce(nullif(p_brand->>'id', '')::uuid, pg_catalog.gen_random_uuid());
  v_name := pg_catalog.btrim(pg_catalog.regexp_replace(normalize(p_brand->>'name', NFKC), '[[:space:]]+', ' ', 'g'));
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 160 or v_name ~ '[[:cntrl:]]'
    or pg_catalog.char_length(coalesce(p_brand->>'slug', '')) not between 1 and 240 then
    raise exception 'Usa un nombre válido de hasta 160 caracteres y una URL válida.' using errcode = '22023';
  end if;
  -- One bounded registration lock covers both individual and pasted operations;
  -- unique constraints remain the final authority under concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(714482391);
  select version into v_version from app.brands where id = v_id for update;
  if v_version is null then
    if p_expected_version is not null then raise exception 'La marca ya no está disponible.' using errcode = '40001'; end if;
    insert into app.brands(id, name, slug, active) values(v_id, v_name, p_brand->>'slug', (p_brand->>'active')::boolean);
  else
    if p_expected_version is null or v_version <> p_expected_version then
      raise exception 'La marca cambió en otra sesión. Actualiza la página.' using errcode = '40001';
    end if;
    if not (p_brand->>'active')::boolean and exists(select 1 from app.products where brand_id = v_id and active) then
      raise exception 'Desactiva primero los productos visibles de esta marca.' using errcode = '22023';
    end if;
    update app.brands set name = v_name, slug = p_brand->>'slug', active = (p_brand->>'active')::boolean,
      version = version + 1 where id = v_id;
  end if;
  perform private.catalog_flush_constraints();
  return (select pg_catalog.jsonb_build_object('record', pg_catalog.jsonb_build_object(
    'id', id, 'name', name, 'slug', slug, 'active', active), 'version', version) from app.brands where id = v_id);
end;
$$;

create function api.admin_register_brands(p_names jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_item jsonb; v_name text; v_slug text; v_base text; v_key text; v_id uuid;
  v_line integer := 0; v_suffix integer; v_created jsonb := '[]'::jsonb;
  v_existing jsonb := '[]'::jsonb; v_errors jsonb := '[]'::jsonb; v_versions jsonb := '{}'::jsonb;
begin
  perform private.require_catalog_admin();
  if pg_catalog.jsonb_typeof(p_names) is distinct from 'array' or pg_catalog.jsonb_array_length(p_names) not between 1 and 1000
    or pg_catalog.pg_column_size(p_names) > 262144 then
    raise exception 'Introduce entre 1 y 1000 nombres de marcas.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(714482391);
  for v_item in select value from pg_catalog.jsonb_array_elements(p_names) loop
    v_line := v_line + 1;
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'string' then
      v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('line', v_line, 'message', 'Introduce un nombre de marca válido.'));
      continue;
    end if;
    v_name := pg_catalog.btrim(pg_catalog.regexp_replace(normalize(v_item #>> '{}', NFKC), '[[:space:]]+', ' ', 'g'));
    v_key := private.catalog_name_key(v_name);
    v_base := pg_catalog.btrim(pg_catalog.regexp_replace(v_key, '[^a-z0-9]+', '-', 'g'), '-');
    if pg_catalog.char_length(v_name) not between 1 and 160 or v_name ~ '[[:cntrl:]]' or v_base = '' then
      v_errors := v_errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('line', v_line, 'message', 'Usa un nombre válido de hasta 160 caracteres.'));
      continue;
    end if;
    if exists(select 1 from app.brands where name_key = v_key) then
      v_existing := v_existing || pg_catalog.jsonb_build_array(v_name);
      continue;
    end if;
    v_slug := v_base; v_suffix := 2;
    while exists(select 1 from app.brands where slug = v_slug) loop
      v_slug := v_base || '-' || v_suffix::text; v_suffix := v_suffix + 1;
    end loop;
    v_id := pg_catalog.gen_random_uuid();
    insert into app.brands(id, name, slug) values(v_id, v_name, v_slug);
    v_created := v_created || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', v_id, 'name', v_name, 'slug', v_slug, 'active', true));
    v_versions := v_versions || pg_catalog.jsonb_build_object(v_id::text, 1);
  end loop;
  return pg_catalog.jsonb_build_object('created', v_created, 'existing', v_existing, 'errors', v_errors, 'versions', v_versions);
end;
$$;

create function api.admin_delete_brand(p_id uuid, p_expected_version bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  perform pg_catalog.pg_advisory_xact_lock(714482391);
  select version into v_version from app.brands where id = p_id for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'La marca cambió en otra sesión. Actualiza la página.' using errcode = '40001';
  end if;
  if exists(select 1 from app.products where brand_id = p_id)
    or exists(select 1 from app.store_settings where featured_brand_id = p_id) then
    raise exception 'La marca tiene productos o está seleccionada en el Home. Retira sus asociaciones antes de eliminarla.' using errcode = '23503';
  end if;
  delete from app.brands where id = p_id;
end;
$$;

create function api.admin_save_features(p_complements_enabled boolean, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  if p_complements_enabled is null then raise exception 'Indica si Complementos debe mostrarse.' using errcode = '22023'; end if;
  select version into v_version from app.store_settings where singleton for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'La configuración cambió en otra sesión. Actualiza la página.' using errcode = '40001';
  end if;
  update app.store_settings set complements_enabled = p_complements_enabled, version = version + 1 where singleton;
  return (select pg_catalog.jsonb_build_object('features', pg_catalog.jsonb_build_object('complementsEnabled', complements_enabled), 'version', version)
    from app.store_settings where singleton);
end;
$$;

create function api.admin_save_catalog_settings(
  p_complements_enabled boolean, p_featured_brand_id uuid default null, p_expected_version bigint default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  if p_complements_enabled is null then
    raise exception 'Indica si Complementos debe mostrarse.' using errcode = '22023';
  end if;
  -- Share the brand mutation lock: activation changes/deletion cannot race the
  -- selection of the featured shortcut. There is no write to Home content.
  perform pg_catalog.pg_advisory_xact_lock(714482391);
  if p_featured_brand_id is not null and not exists(select 1 from app.brands where id = p_featured_brand_id and active) then
    raise exception 'Selecciona una marca activa para destacarla.' using errcode = '22023';
  end if;
  select version into v_version from app.store_settings where singleton for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'La configuración cambió en otra sesión. Actualiza la página.' using errcode = '40001';
  end if;
  update app.store_settings set complements_enabled = p_complements_enabled,
    featured_brand_id = p_featured_brand_id, version = version + 1 where singleton;
  return (select pg_catalog.jsonb_build_object(
    'features', pg_catalog.jsonb_build_object('complementsEnabled', complements_enabled),
    'featuredBrandId', featured_brand_id, 'version', version
  ) from app.store_settings where singleton);
end;
$$;

create function api.catalog_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('features', pg_catalog.jsonb_build_object('complementsEnabled', s.complements_enabled),
    'featuredBrandId', (select b.id from app.brands b where b.id = s.featured_brand_id and b.active))
  from app.store_settings s where s.singleton;
$$;

-- Make the public projection's publication condition explicit as well as RLS.
-- Recommendation UUIDs must not reveal draft/disabled targets either.
create function private.catalog_public_document(p_product_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_set(private.catalog_product_document(p.id), '{detail,recommendationIds}',
    coalesce((select pg_catalog.jsonb_agg(r.recommended_product_id order by r.position)
      from app.product_recommendations r join app.products target on target.id = r.recommended_product_id
      where r.product_id = p.id and private.catalog_product_is_published(target)), '[]'::jsonb))
  from app.products p where p.id = p_product_id and private.catalog_product_is_published(p);
$$;
revoke all on function private.catalog_public_document(uuid) from public, anon, authenticated, service_role;
grant execute on function private.catalog_public_document(uuid) to aro_api_executor;

create or replace function api.catalog_products(p_limit integer default 24, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then
    raise exception 'La página solicitada no es válida.' using errcode = '22023';
  end if;
  return pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(private.catalog_public_document(page.id) order by page.display_rank, page.id)
      from (select p.id, p.display_rank from app.products p where private.catalog_product_is_published(p)
        order by p.display_rank, p.id limit p_limit offset p_offset) page), '[]'::jsonb),
    'total', (select pg_catalog.count(*) from app.products p where private.catalog_product_is_published(p))
  );
end;
$$;

create or replace function api.catalog_product(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_slug is null or pg_catalog.char_length(p_slug) > 512 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return null; end if;
  return (select private.catalog_public_document(p.id) from app.products p
    where p.slug = p_slug and private.catalog_product_is_published(p));
end;
$$;

-- Explicit transfer, revoke PUBLIC's implicit function execute, then grant
-- only the browser operation surface. Private helpers remain non-callable.
grant create on schema api to aro_catalog_admin_executor, aro_api_executor;
alter function api.admin_catalog_page(integer, integer) owner to aro_catalog_admin_executor;
alter function api.admin_save_product(jsonb, bigint) owner to aro_catalog_admin_executor;
alter function api.admin_delete_product(uuid, bigint) owner to aro_catalog_admin_executor;
alter function api.admin_import_products(jsonb) owner to aro_catalog_admin_executor;
alter function api.admin_set_stock(uuid, integer, bigint) owner to aro_catalog_admin_executor;
alter function api.admin_save_offer(uuid, jsonb, bigint) owner to aro_catalog_admin_executor;
alter function api.admin_save_brand(jsonb, bigint) owner to aro_catalog_admin_executor;
alter function api.admin_register_brands(jsonb) owner to aro_catalog_admin_executor;
alter function api.admin_delete_brand(uuid, bigint) owner to aro_catalog_admin_executor;
alter function api.admin_save_features(boolean, bigint) owner to aro_catalog_admin_executor;
alter function api.admin_save_catalog_settings(boolean, uuid, bigint) owner to aro_catalog_admin_executor;
alter function api.catalog_settings() owner to aro_api_executor;
revoke create on schema api from aro_catalog_admin_executor, aro_api_executor;
revoke all on function api.admin_catalog_page(integer, integer), api.admin_save_product(jsonb, bigint),
  api.admin_delete_product(uuid, bigint), api.admin_set_stock(uuid, integer, bigint),
  api.admin_save_offer(uuid, jsonb, bigint), api.admin_save_brand(jsonb, bigint),
  api.admin_register_brands(jsonb), api.admin_delete_brand(uuid, bigint),
  api.admin_save_features(boolean, bigint), api.admin_save_catalog_settings(boolean, uuid, bigint),
  api.admin_import_products(jsonb), api.catalog_settings() from public, anon, authenticated, service_role;
revoke all on function api.catalog_products(integer, integer), api.catalog_product(text) from public, anon, authenticated, service_role;
grant execute on function api.admin_catalog_page(integer, integer), api.admin_save_product(jsonb, bigint),
  api.admin_delete_product(uuid, bigint), api.admin_set_stock(uuid, integer, bigint),
  api.admin_save_offer(uuid, jsonb, bigint), api.admin_save_brand(jsonb, bigint),
  api.admin_register_brands(jsonb), api.admin_delete_brand(uuid, bigint),
  api.admin_save_features(boolean, bigint), api.admin_save_catalog_settings(boolean, uuid, bigint),
  api.admin_import_products(jsonb) to authenticated;
grant execute on function api.catalog_settings() to anon, authenticated;
grant execute on function api.catalog_products(integer, integer), api.catalog_product(text) to anon, authenticated;

comment on role aro_catalog_admin_executor is 'Restricted catalog commands; separate from the published read executor. Every operation requires current admin membership and AAL2.';
