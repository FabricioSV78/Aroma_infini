-- Hosted API correction: deterministic entity-version conflicts must not use
-- SQLSTATE 40001. PostgREST 14 treats that code as transient and retries the
-- transaction indefinitely, so an optimistic-version conflict can time out.
-- PT409 deliberately returns HTTP 409 without a transient-transaction retry.
-- Source: https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
-- CREATE OR REPLACE preserves the reviewed signatures, ownership and ACLs.
-- No tables, grants, business data or authorization requirements change.

create or replace function api.admin_save_product(p_record jsonb, p_expected_version bigint default null)
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
      raise exception 'El producto cambió en otra sesión. Actualiza la página antes de guardar.' using errcode = 'PT409';
    end if;
  elsif p_expected_version is not null then
    raise exception 'El producto ya no está disponible. Actualiza la página.' using errcode = 'PT409';
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

create or replace function api.admin_delete_product(p_id uuid, p_expected_version bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  select version into v_version from app.products where id = p_id for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'El producto cambió en otra sesión. Actualiza la página.' using errcode = 'PT409';
  end if;
  if exists(select 1 from app.product_recommendations where recommended_product_id = p_id and product_id <> p_id) then
    raise exception 'El producto está vinculado a otras recomendaciones. Retira esas referencias antes de eliminarlo.' using errcode = '23503';
  end if;
  delete from app.products where id = p_id;
  perform private.catalog_flush_constraints();
end;
$$;

create or replace function api.admin_set_stock(p_variant_id uuid, p_stock integer, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_product_id uuid; v_version bigint;
begin
  perform private.require_catalog_admin();
  if p_stock is null or p_stock < 0 then raise exception 'El stock no puede ser negativo.' using errcode = '22023'; end if;
  select product_id into v_product_id from app.product_variants where id = p_variant_id;
  select version into v_version from app.products where id = v_product_id for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'El producto cambió en otra sesión. Actualiza la página.' using errcode = 'PT409';
  end if;
  update app.product_variants set stock = p_stock, version = version + 1 where id = p_variant_id and product_id = v_product_id;
  update app.products set version = version + 1 where id = v_product_id;
  perform private.catalog_validate_product(v_product_id);
  perform private.catalog_flush_constraints();
  return pg_catalog.jsonb_build_object('record', private.admin_product_document(v_product_id),
    'version', (select version from app.products where id = v_product_id));
end;
$$;

create or replace function api.admin_save_offer(p_product_id uuid, p_offer jsonb, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  select version into v_version from app.products where id = p_product_id for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'El producto cambió en otra sesión. Actualiza la página.' using errcode = 'PT409';
  end if;
  perform private.catalog_write_offer(p_product_id, p_offer);
  update app.products set version = version + 1 where id = p_product_id;
  perform private.catalog_validate_product(p_product_id);
  perform private.catalog_flush_constraints();
  return pg_catalog.jsonb_build_object('record', private.admin_product_document(p_product_id),
    'version', (select version from app.products where id = p_product_id));
end;
$$;

create or replace function api.admin_save_brand(p_brand jsonb, p_expected_version bigint default null)
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
    if p_expected_version is not null then raise exception 'La marca ya no está disponible.' using errcode = 'PT409'; end if;
    insert into app.brands(id, name, slug, active) values(v_id, v_name, p_brand->>'slug', (p_brand->>'active')::boolean);
  else
    if p_expected_version is null or v_version <> p_expected_version then
      raise exception 'La marca cambió en otra sesión. Actualiza la página.' using errcode = 'PT409';
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

create or replace function api.admin_delete_brand(p_id uuid, p_expected_version bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  perform pg_catalog.pg_advisory_xact_lock(714482391);
  select version into v_version from app.brands where id = p_id for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'La marca cambió en otra sesión. Actualiza la página.' using errcode = 'PT409';
  end if;
  if exists(select 1 from app.products where brand_id = p_id)
    or exists(select 1 from app.store_settings where featured_brand_id = p_id) then
    raise exception 'La marca tiene productos o está seleccionada en el Home. Retira sus asociaciones antes de eliminarla.' using errcode = '23503';
  end if;
  delete from app.brands where id = p_id;
end;
$$;

create or replace function api.admin_save_features(p_complements_enabled boolean, p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  if p_complements_enabled is null then raise exception 'Indica si Complementos debe mostrarse.' using errcode = '22023'; end if;
  select version into v_version from app.store_settings where singleton for update;
  if v_version is null or p_expected_version is null or v_version <> p_expected_version then
    raise exception 'La configuración cambió en otra sesión. Actualiza la página.' using errcode = 'PT409';
  end if;
  update app.store_settings set complements_enabled = p_complements_enabled, version = version + 1 where singleton;
  return (select pg_catalog.jsonb_build_object('features', pg_catalog.jsonb_build_object('complementsEnabled', complements_enabled), 'version', version)
    from app.store_settings where singleton);
end;
$$;

create or replace function api.admin_save_catalog_settings(
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
    raise exception 'La configuración cambió en otra sesión. Actualiza la página.' using errcode = 'PT409';
  end if;
  update app.store_settings set complements_enabled = p_complements_enabled,
    featured_brand_id = p_featured_brand_id, version = version + 1 where singleton;
  return (select pg_catalog.jsonb_build_object(
    'features', pg_catalog.jsonb_build_object('complementsEnabled', complements_enabled),
    'featuredBrandId', featured_brand_id, 'version', version
  ) from app.store_settings where singleton);
end;
$$;
