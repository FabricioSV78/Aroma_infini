-- Single read-only result for CLI/Management API (which returns the last query).
-- No rows of profiles, Auth users, orders, secrets or function bodies are read.
select jsonb_build_object(
  'operator', current_user,
  'postgres_version', current_setting('server_version'),
  'application_schemas', coalesce((
    select jsonb_agg(nspname order by nspname) from pg_namespace
    where nspname in ('app', 'api', 'private')
  ), '[]'::jsonb),
  'application_roles', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', rolname, 'login', rolcanlogin, 'superuser', rolsuper,
      'bypass_rls', rolbypassrls, 'create_role', rolcreaterole
    ) order by rolname) from pg_roles
    where rolname in ('aro_api_executor', 'aro_profile_bootstrap')
  ), '[]'::jsonb),
  'tables', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', c.relname,
      'owner', pg_get_userbyid(c.relowner),
      'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity
    ) order by n.nspname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app', 'api', 'private') and c.relkind in ('r','p')
  ), '[]'::jsonb),
  'api_functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.proname, 'arguments', pg_get_function_identity_arguments(p.oid),
      'definer', p.prosecdef, 'owner', pg_get_userbyid(p.proowner),
      'anonymous_execute', has_function_privilege('anon', p.oid, 'execute'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'execute')
    ) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api'
  ), '[]'::jsonb),
  'postgrest_role_schema_overrides', coalesce((
    select jsonb_agg(setting)
    from pg_roles r cross join lateral unnest(r.rolconfig) as setting
    where r.rolname = 'authenticator' and setting like 'pgrst.db_schemas=%'
  ), '[]'::jsonb),
  'schema_migration_history_exists', to_regclass('supabase_migrations.schema_migrations') is not null
) as inventory;
