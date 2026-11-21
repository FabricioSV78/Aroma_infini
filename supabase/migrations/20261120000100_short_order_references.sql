-- Only the visible identifier of NEW orders changes. UUIDs, historical
-- references, ownership, tracking capabilities and checkout rules stay intact.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

grant create on schema private to aro_commerce_executor;
create sequence private.order_reference_seq as bigint minvalue 1 start with 1
  increment by 1 no cycle cache 1;
alter sequence private.order_reference_seq owner to aro_commerce_executor;
revoke all on sequence private.order_reference_seq from public, anon, authenticated, service_role;

create function private.next_order_reference() returns text
language plpgsql volatile security invoker set search_path = '' as $$
declare v_number text; v_reference text;
begin
  loop
    -- nextval is atomic across sessions. Values are never recycled on rollback.
    v_number := pg_catalog.nextval('private.order_reference_seq'::regclass)::text;
    v_reference := 'AI-' || pg_catalog.lpad(v_number, greatest(6, pg_catalog.length(v_number)), '0');
    -- Preserve any legacy reference already occupying the same namespace.
    -- The existing UNIQUE(reference) constraint remains the final safeguard.
    if not exists(select 1 from app.orders where reference = v_reference) then
      return v_reference;
    end if;
  end loop;
end $$;
alter function private.next_order_reference() owner to aro_commerce_executor;
revoke all on function private.next_order_reference() from public, anon, authenticated, service_role;
revoke create on schema private from aro_commerce_executor;

do $migration$
declare
  v_definition text;
  v_marker text := $old$v_reference:='AI-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));$old$;
  v_replacement text := 'v_reference:=private.next_order_reference();';
begin
  v_definition := pg_catalog.pg_get_functiondef('api.create_simulated_order(uuid,text,jsonb,uuid)'::regprocedure);
  if (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_marker, '')))
      / pg_catalog.length(v_marker) <> 1 then
    raise exception 'Unexpected checkout order-reference boundary';
  end if;
  -- Allocation stays AFTER operation-id replay checks, quote validation and
  -- existing locks. A retry returns the same UUID AND reference as before.
  execute pg_catalog.replace(v_definition, v_marker, v_replacement);
end;
$migration$;

comment on sequence private.order_reference_seq is
  'Private non-cycling public order-number allocator. Minimum six digits, grows without truncation. Gaps are allowed; never an authorization secret.';
comment on function private.next_order_reference() is
  'Invoked only inside trusted checkout. Skips occupied historical codes and preserves the existing orders.reference unique index.';
