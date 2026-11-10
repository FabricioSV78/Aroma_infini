-- Select the at-most-five attached image IDs before reading their manifests.
-- The former OR/EXISTS predicate scanned every ready R2 asset for each DTO.
-- Keep both document contracts, executor RLS, owner, ACL and security mode.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_previous text := '(ma.id=p.olfactory_media_id or exists(select 1 from app.product_images pi where pi.product_id=p.id and pi.media_id=ma.id))';
  v_selected text := 'ma.id in (select pi.media_id from app.product_images pi where pi.product_id=p.id union select p.olfactory_media_id)';
begin
  foreach v_signature in array array[
    'private.catalog_product_document(uuid)',
    'private.admin_product_document(uuid)'
  ] loop
    v_definition := pg_catalog.pg_get_functiondef(v_signature::regprocedure);
    if pg_catalog.strpos(v_definition, v_previous) = 0 then
      raise exception 'Unexpected product media lookup definition: %', v_signature;
    end if;
    execute pg_catalog.replace(v_definition, v_previous, v_selected);
  end loop;
end;
$migration$;

-- Admin pages use this global order. Existing owner/status-prefixed indexes
-- cannot serve it; the measured 10k fixture otherwise scans and sorts all rows.
create index orders_placed_idx on app.orders(placed_at desc, id);
