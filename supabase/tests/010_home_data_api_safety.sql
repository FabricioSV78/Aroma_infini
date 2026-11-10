-- Structural compatibility preflight for hosted PostgREST safeupdate. This
-- local PostgreSQL does not load the managed safeupdate extension: the real
-- HTTP save is exercised separately against the development Data API.
begin;
do $$
declare v_definition text;
begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner.';
  end if;
  v_definition:=pg_get_functiondef('api.admin_save_home(jsonb,jsonb,bigint,bigint,boolean,uuid)'::regprocedure);
  if v_definition !~* 'delete[[:space:]]+from[[:space:]]+app[.]home_media[[:space:]]+where[[:space:]]+singleton[[:space:]]*;'
    or v_definition ~* 'delete[[:space:]]+from[[:space:]]+app[.]home_media[[:space:]]*;' then
    raise exception 'Home replacement needs an explicit singleton predicate for hosted Data API safeupdate.';
  end if;
end;
$$;
select 'PASS: Home media replacement is scoped for the managed Data API safeupdate boundary';
rollback;
