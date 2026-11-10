-- Supabase's Data API may load safeupdate for browser-role requests. A
-- singleton replacement must still carry an explicit WHERE predicate; the
-- operator/standalone SQL connection does not reproduce that extension.
-- Preserve the function's owner, grants, signature and optimistic locks.
do $migration$
declare v_definition text;v_marker text:='  delete from app.home_media;';
begin
  v_definition:=pg_get_functiondef('api.admin_save_home(jsonb,jsonb,bigint,bigint,boolean,uuid)'::regprocedure);
  if strpos(v_definition,v_marker)=0 then
    raise exception 'Unexpected Home media replacement boundary';
  end if;
  execute replace(v_definition,v_marker,'  delete from app.home_media where singleton;');
end;
$migration$;
