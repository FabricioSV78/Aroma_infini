-- Account identity is derived from signed claims and protected membership,
-- never editable user metadata or the presence/absence of an MFA upgrade.
grant create on schema private to aro_api_executor;
create function private.require_customer_identity() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.request_user_id();
begin
  if actor is null or private.current_user_membership() then
    raise exception 'Inicia sesión con tu cuenta de cliente.' using errcode='42501';
  end if;
  return actor;
end $$;
alter function private.require_customer_identity() owner to aro_api_executor;
revoke all on function private.require_customer_identity() from public,anon,authenticated,service_role;
grant execute on function private.require_customer_identity() to aro_api_executor,aro_commerce_executor,aro_favorites_executor,aro_reviews_executor;
revoke create on schema private from aro_api_executor;

-- Retain every installed query, projection, validation and owner constraint.
-- Fail the migration if a reviewed signature no longer has its identity gate.
do $migration$
declare signature text; definition text;
begin
  foreach signature in array array[
    'api.get_profile()', 'api.update_profile(text,text,text)',
    'api.get_address()', 'api.save_address(text,text,text,text,text,text,text,double precision,double precision)',
    'api.remove_address()', 'api.customer_orders()',
    'api.customer_favorites()', 'api.set_customer_favorite(uuid,boolean,bigint)',
    'api.customer_product_review(uuid)', 'api.submit_product_review(uuid,integer,text,text,integer)'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if strpos(definition,'private.request_user_id()')=0 then
      raise exception 'Unreviewed customer identity gate: %',signature;
    end if;
    execute replace(definition,'private.request_user_id()','private.require_customer_identity()');
  end loop;
end;
$migration$;

-- These policies are only for the owner-scoped account executor. Administrative
-- aggregate reads use their own existing, MFA-protected executor policies.
alter policy profiles_executor_read on app.profiles
  using(user_id=(select private.require_customer_identity()));
alter policy profiles_executor_insert on app.profiles
  with check(user_id=(select private.require_customer_identity()));
alter policy profiles_executor_update on app.profiles
  using(user_id=(select private.require_customer_identity()))
  with check(user_id=(select private.require_customer_identity()));
alter policy addresses_executor_read on app.addresses
  using(user_id=(select private.require_customer_identity()));
alter policy addresses_executor_insert on app.addresses
  with check(user_id=(select private.require_customer_identity()));
alter policy addresses_executor_update on app.addresses
  using(user_id=(select private.require_customer_identity()))
  with check(user_id=(select private.require_customer_identity()));
alter policy addresses_executor_delete on app.addresses
  using(user_id=(select private.require_customer_identity()));

comment on function private.require_customer_identity() is
  'Exclusive customer account boundary. Active administrators stay administrators at AAL1 and AAL2; use a separate customer identity for purchases.';
