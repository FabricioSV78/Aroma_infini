-- A cart's presentation order is not a safe row-lock order. Two concurrent
-- carts with the same products in reverse order could previously deadlock
-- while preserving their historical image references. Lock the complete cover
-- set by UUID before writing order items; keep all validation, ownership,
-- idempotency, pending-payment simulation and retention semantics unchanged.
do $migration$
declare
  v_definition text;
  v_marker text := $marker$  v_order:=gen_random_uuid();v_reference:=$marker$;
  v_locks text := $locks$  -- Lock all order covers in one deterministic order, independently of cart order.
  -- Products and variants have already been locked above in their own UUID order.
  perform m.id from app.media_assets m
    where m.id in (
      select i.media_id from app.product_images i
      join app.product_variants v on v.product_id=i.product_id
      where i.position=0 and v.id in (
        select (x->>'variantId')::uuid from jsonb_array_elements(p_checkout->'lines') x
      )
    ) and m.status='ready'
    order by m.id for update;
$locks$;
begin
  v_definition := pg_catalog.pg_get_functiondef(
    'api.create_simulated_order(uuid,text,jsonb,uuid)'::regprocedure
  );
  if pg_catalog.strpos(v_definition, v_marker) = 0
    or pg_catalog.strpos(v_definition, 'Lock all order covers in one deterministic order') > 0 then
    raise exception 'Unexpected simulated checkout lock boundary';
  end if;
  execute pg_catalog.replace(v_definition, v_marker, v_locks || v_marker);
end;
$migration$;
