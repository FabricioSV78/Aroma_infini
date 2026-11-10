-- Keep a complete reviewed import atomic. Preparing every SKU once and flushing
-- deferred constraints once avoids repeating batch work for each product.
-- Browser roles cannot call the prepared writer or bypass its MFA boundary.
do $$
declare v_body text; v_sku text; v_flush text;
begin
  select prosrc into strict v_body from pg_catalog.pg_proc
    where oid='api.admin_save_product(jsonb,bigint)'::regprocedure;
  v_sku:='  p_record := private.catalog_prepare_variant_skus(pg_catalog.jsonb_build_array(p_record))->0;';
  v_flush:='  perform private.catalog_flush_constraints();';
  if pg_catalog.strpos(v_body,v_sku)=0 or pg_catalog.strpos(v_body,v_flush)=0
    or pg_catalog.strpos(v_body,'perform private.require_catalog_admin();')=0
    or pg_catalog.strpos(v_body,'perform private.catalog_validate_family_selection')=0 then
    raise exception 'Unexpected reviewed product writer; abort import migration';
  end if;
  v_body:=pg_catalog.replace(v_body,v_sku,
    '  if not p_import_prepared then'||chr(10)||v_sku||chr(10)||'  end if;');
  v_body:=pg_catalog.replace(v_body,v_flush,
    '  if not p_import_prepared then'||chr(10)||v_flush||chr(10)||'  end if;');
  execute pg_catalog.format(
    'create function private.catalog_save_product_prepared(p_record jsonb,p_expected_version bigint,p_import_prepared boolean) returns jsonb language plpgsql volatile security invoker set search_path='''' as %L',
    v_body);
end $$;

revoke all on function private.catalog_save_product_prepared(jsonb,bigint,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.catalog_save_product_prepared(jsonb,bigint,boolean)
  to aro_catalog_admin_executor;

create or replace function api.admin_save_product(p_record jsonb,p_expected_version bigint default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  return private.catalog_save_product_prepared(p_record,p_expected_version,false);
end;
$$;

create or replace function api.admin_import_products(p_records jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_record jsonb; v_saved jsonb; v_ids uuid[]:='{}'::uuid[];
begin
  perform private.require_catalog_admin();
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_records) not between 1 and 1000
    or pg_catalog.pg_column_size(p_records)>8388608 then
    raise exception 'Importa entre 1 y 1000 productos por operación.' using errcode='22023';
  end if;
  -- This helper verifies the complete set, reserves manual/automatic SKUs, and
  -- acquires the same taxonomy-before-SKU transaction locks as individual saves.
  p_records:=private.catalog_prepare_variant_skus(p_records);
  for v_record in select value from pg_catalog.jsonb_array_elements(p_records) loop
    v_saved:=private.catalog_save_product_prepared(v_record,null,true);
    v_ids:=pg_catalog.array_append(v_ids,(v_saved->'record'->'product'->>'id')::uuid);
  end loop;
  -- Every existing deferred validator still runs before returning success.
  -- One invalid final record rolls back the entire import, including its offers.
  perform private.catalog_flush_constraints();
  return pg_catalog.jsonb_build_object(
    'products',(select pg_catalog.jsonb_agg(private.admin_product_document(item.id) order by item.position)
      from pg_catalog.unnest(v_ids) with ordinality item(id,position)),
    'productVersions',(select pg_catalog.jsonb_object_agg(p.id::text,p.version)
      from app.products p where p.id=any(v_ids)));
end;
$$;

-- CREATE OR REPLACE preserves the existing public command owners and grants.
-- No table permissions, RLS policy, version check or media verifier is removed.
comment on function private.catalog_save_product_prepared(jsonb,bigint,boolean) is
  'Internal catalog writer: prepared imports are reachable only by the existing MFA-protected executor; direct saves keep per-command SKU preparation and constraint flush.';
