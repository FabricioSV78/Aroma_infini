-- Hosted Supabase does not grant custom NOLOGIN executors USAGE on its managed
-- auth schema. Follow the identity boundary installed in 20261028000000:
-- PostgREST verifies JWTs; our private helper reads those verified request claims.
-- No browser privileges, Auth-schema inheritance or RLS bypass are introduced.
grant execute on function private.request_user_id() to aro_commerce_executor;

do $migration$
declare v_definition text;v_signature text;v_marker text;
begin
  foreach v_signature in array array[
    'api.order_tracking(text,text)',
    'api.customer_orders()',
    'api.admin_set_order_statuses(jsonb,text,uuid,boolean,text)',
    'api.admin_save_order_delivery(text,bigint,jsonb,text,jsonb)'
  ] loop
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    if strpos(v_definition,'auth.uid()')=0 then
      raise exception 'Unexpected commerce request identity boundary: %',v_signature;
    end if;
    execute replace(v_definition,'auth.uid()','private.request_user_id()');
  end loop;

  -- The Worker has already verified a supplied account through Supabase Auth.
  -- The orders.user_id FK atomically rejects an identity removed meanwhile.
  -- Avoid an unnecessary custom-executor read of the managed Auth schema.
  v_definition:=pg_get_functiondef('api.create_simulated_order(uuid,text,jsonb,uuid)'::regprocedure);
  v_marker:='  if p_user_id is not null and not exists(select 1 from auth.users where id=p_user_id) then raise exception ''La cuenta ya no está disponible.'' using errcode=''42501'';end if;';
  if strpos(v_definition,v_marker)=0 then
    raise exception 'Unexpected commerce account-existence boundary';
  end if;
  execute replace(v_definition,v_marker,'  -- Verified Worker identity; the orders.user_id foreign key validates existence.');
end;
$migration$;
