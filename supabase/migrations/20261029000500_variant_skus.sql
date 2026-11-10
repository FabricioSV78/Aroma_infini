-- A commercial SKU identifies one presentation. The existing product_code is
-- retained as an independent internal identifier; no existing code is changed.
-- No catalog/media rows are copied, renumbered or backfilled by this migration.
create sequence app.variant_merchant_sku_seq
  as bigint start with 1000 increment by 1 minvalue 1000 no cycle;
comment on sequence app.variant_merchant_sku_seq is
  'Automatic presentation SKUs from 1000; explicit merchant SKUs are retained, collisions skipped and issued sequence values never recycled.';
revoke all on sequence app.variant_merchant_sku_seq from public, anon, authenticated, service_role;
grant usage on sequence app.variant_merchant_sku_seq to aro_catalog_admin_executor;

create function private.catalog_next_variant_sku(p_reserved jsonb)
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare v_candidate text;
begin
  -- The parent helper has already checked admin MFA and acquired the same
  -- transaction lock. Keeping this private helper non-callable from browsers
  -- avoids an API that consumes or predicts the next commercial identifier.
  loop
    v_candidate := pg_catalog.nextval('app.variant_merchant_sku_seq'::regclass)::text;
    if not (p_reserved ? v_candidate)
      and not exists(select 1 from app.product_variants where merchant_sku=v_candidate) then
      return v_candidate;
    end if;
  end loop;
end;
$$;

create function private.catalog_prepare_variant_skus(p_records jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_record jsonb; v_product jsonb; v_detail jsonb; v_variant jsonb;
  v_flat jsonb; v_reserved jsonb; v_result jsonb;
begin
  perform private.require_catalog_admin();
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_records) not between 1 and 1000
    or pg_catalog.pg_column_size(p_records)>8388608 then
    raise exception 'Revisa los productos antes de asignar sus SKU.' using errcode='22023';
  end if;
  -- Every save/import takes this lock before locking product rows. Manual and
  -- automatic identifiers share one namespace; UNIQUE remains the final guard.
  perform pg_catalog.pg_advisory_xact_lock(714482392);
  for v_record in select value from pg_catalog.jsonb_array_elements(p_records) loop
    v_product := v_record->'product';
    v_detail := v_record->'detail';
    if pg_catalog.jsonb_typeof(v_record) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_product) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_detail) is distinct from 'object'
      or pg_catalog.pg_column_size(v_record)>262144
      or pg_catalog.jsonb_typeof(v_product->'variants') is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_product->'variants') not between 1 and 100
      or pg_catalog.jsonb_typeof(v_detail->'gallery') is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_detail->'gallery')>4
      or pg_catalog.jsonb_typeof(v_record->'active') is distinct from 'boolean'
      or pg_catalog.char_length(coalesce(v_product->>'name','')) not between 1 and 200
      or pg_catalog.char_length(coalesce(v_product->>'slug','')) not between 1 and 240
      or pg_catalog.char_length(coalesce(v_detail->>'shortDescription','')) not between 1 and 2000
      or pg_catalog.char_length(coalesce(v_detail->>'description','')) not between 1 and 30000 then
      raise exception 'Revisa los datos y presentaciones de cada producto.' using errcode='22023';
    end if;
    for v_variant in select value from pg_catalog.jsonb_array_elements(v_product->'variants') loop
      if pg_catalog.jsonb_typeof(v_variant) is distinct from 'object'
        or nullif(v_variant->>'id','') is null
        or coalesce(v_variant->>'stock','')!~'^[0-9]+$'
        or coalesce(v_variant->>'priceCents','')!~'^[0-9]+$'
        or (v_variant ? 'sku' and pg_catalog.jsonb_typeof(v_variant->'sku') not in ('string','null'))
        or (nullif(pg_catalog.btrim(v_variant->>'sku'),'') is not null
          and pg_catalog.upper(pg_catalog.btrim(v_variant->>'sku'))!~'^[A-Z0-9][A-Z0-9._-]{0,63}$') then
        raise exception 'Revisa el SKU, precio y stock de cada presentación.' using errcode='22023';
      end if;
    end loop;
  end loop;

  -- The flattened, bounded JSON contains only variant metadata. Resolve old
  -- identifiers before admin_save_product stages/deletes its final variants.
  with source as (
    select r.ordinality as record_index, v.ordinality as variant_index,
      nullif(r.value->'product'->>'id','')::uuid as product_id,
      (v.value->>'id')::uuid as variant_id, v.value as variant
    from pg_catalog.jsonb_array_elements(p_records) with ordinality r(value,ordinality)
    cross join lateral pg_catalog.jsonb_array_elements(r.value->'product'->'variants') with ordinality v(value,ordinality)
  )
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'recordIndex',s.record_index,'variantIndex',s.variant_index,
    'productId',s.product_id,'variantId',s.variant_id,'variant',s.variant,
    'existingOwner',old.product_id,
    'sku',coalesce(nullif(pg_catalog.upper(pg_catalog.btrim(s.variant->>'sku')),''),
      case when old.product_id=s.product_id then old.merchant_sku end))
    order by s.record_index,s.variant_index)
  into v_flat
  from source s left join app.product_variants old on old.id=s.variant_id;

  if exists(select 1 from pg_catalog.jsonb_array_elements(v_flat) f
      where f->>'existingOwner' is not null and f->>'existingOwner' is distinct from f->>'productId')
    or exists(select 1 from pg_catalog.jsonb_array_elements(v_flat) f group by f->>'variantId' having count(*)>1) then
    raise exception 'Las presentaciones contienen identificadores repetidos o de otro producto.' using errcode='22023';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(v_flat) f
      where f->>'sku' is not null group by f->>'sku' having count(*)>1)
    or exists(select 1 from pg_catalog.jsonb_array_elements(v_flat) f
      join app.product_variants current on current.merchant_sku=f->>'sku'
      where current.product_id::text is distinct from f->>'productId') then
    raise exception 'El SKU de presentación ya está registrado. Usa un código único.' using errcode='23505';
  end if;
  select coalesce(pg_catalog.jsonb_object_agg(f->>'sku',true),'{}'::jsonb)
    into v_reserved from pg_catalog.jsonb_array_elements(v_flat) f where f->>'sku' is not null;

  -- Reserve every manual/preserved identifier in the complete import before
  -- allocating blanks, even when a manual 1000 occurs on its final row.
  with resolved as materialized (
    select (f->>'recordIndex')::bigint as record_index,
      (f->>'variantIndex')::bigint as variant_index,
      (f->'variant') || pg_catalog.jsonb_build_object('sku',
        coalesce(f->>'sku',private.catalog_next_variant_sku(v_reserved))) as variant
    from pg_catalog.jsonb_array_elements(v_flat) f
    order by (f->>'recordIndex')::bigint,(f->>'variantIndex')::bigint
  ), variants as (
    select record_index,pg_catalog.jsonb_agg(variant order by variant_index) as value
    from resolved group by record_index
  )
  select pg_catalog.jsonb_agg(r.value || pg_catalog.jsonb_build_object('product',
      r.value->'product' || pg_catalog.jsonb_build_object('variants',v.value)) order by r.ordinality)
    into v_result
    from pg_catalog.jsonb_array_elements(p_records) with ordinality r(value,ordinality)
    join variants v on v.record_index=r.ordinality;
  return v_result;
end;
$$;

revoke all on function private.catalog_next_variant_sku(jsonb), private.catalog_prepare_variant_skus(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.catalog_next_variant_sku(jsonb), private.catalog_prepare_variant_skus(jsonb)
  to aro_catalog_admin_executor;

-- Amend the current reviewed commands, preserving ownership, grants, version
-- checks, authenticated media validation and the existing persistence model.
do $$
declare v_definition text; v_marker text;
begin
  v_definition:=pg_catalog.pg_get_functiondef('api.admin_save_product(jsonb,bigint)'::regprocedure);
  v_marker:=$marker$  v_id := coalesce(nullif(v_product->>'id', '')::uuid, pg_catalog.gen_random_uuid());$marker$;
  if pg_catalog.strpos(v_definition,v_marker)=0 then raise exception 'Unexpected product command definition'; end if;
  v_definition:=pg_catalog.replace(v_definition,v_marker,
    '  perform pg_catalog.pg_advisory_xact_lock(714482392);' || chr(10) || v_marker);
  v_marker:='  -- Resolve references before any mutation.';
  if pg_catalog.strpos(v_definition,v_marker)=0 then raise exception 'Unexpected media validation boundary'; end if;
  v_definition:=pg_catalog.replace(v_definition,v_marker,
    '  p_record := private.catalog_prepare_variant_skus(pg_catalog.jsonb_build_array(p_record))->0;' || chr(10) ||
    '  v_product := p_record->''product'';' || chr(10) || v_marker);
  execute v_definition;

  v_definition:=pg_catalog.pg_get_functiondef('api.admin_import_products(jsonb)'::regprocedure);
  v_marker:='  -- One transaction for the complete reviewed import.';
  if pg_catalog.strpos(v_definition,v_marker)=0 then raise exception 'Unexpected product import definition'; end if;
  execute pg_catalog.replace(v_definition,v_marker,
    '  p_records := private.catalog_prepare_variant_skus(p_records);' || chr(10) || v_marker);
end $$;
