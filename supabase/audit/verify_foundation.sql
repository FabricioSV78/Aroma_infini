-- Read-only verification of the current application boundary. No test users or products.
-- Keep this a single result: the CLI query API returns the last SQL result.
with executors as (
  select oid,rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit,rolreplication
  from pg_roles where rolname='aro_profile_bootstrap' or rolname ~ '^aro_[a-z_]+_executor$'
), public_rpcs(signature) as (
  values ('catalog_products(integer, integer)'),('catalog_product(text)'),('catalog_brands()'),('catalog_settings()'),
    ('catalog_olfactory_families()'),('catalog_browse(jsonb, integer)'),('catalog_products_by_ids(uuid[], uuid[])'),
    ('catalog_product_context(text)'),('catalog_home_context()'),('catalog_brand_previews()'),
    ('media_public_asset(uuid)'),('home_document()'),('site_media_document()'),('public_media_aliases()'),('commerce_settings()'),
    ('checkout_quote(jsonb, text, text, text, text, text)'),('order_tracking(text, text)'),
    ('product_reviews(uuid, integer, integer, text)'),('site_settings()')
)
select jsonb_build_object(
  'checks', jsonb_build_object(
    'all_application_tables_have_rls', not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity
    ),
    'browser_has_no_internal_schema_access', not exists (
      select 1 from pg_namespace n cross join (values ('anon'), ('authenticated')) r(name)
      where n.nspname in ('app', 'private') and has_schema_privilege(r.name, n.oid, 'usage')
    ),
    'browser_has_no_raw_table_privileges', not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) r(name)
      where n.nspname in ('app', 'private') and c.relkind in ('r', 'p')
      and has_table_privilege(r.name, c.oid, 'select,insert,update,delete,truncate,references,trigger')
    ),
    'only_explicit_public_rpcs_are_anonymous', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('app', 'api', 'private') and has_function_privilege('anon', p.oid, 'execute')
      and not (n.nspname = 'api' and (p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')') in (select signature from public_rpcs))
    ),
    'required_public_rpcs_are_available', not exists (
      select 1 from public_rpcs r where not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='api' and p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')'=r.signature
          and has_function_privilege('anon',p.oid,'execute')
      )
    ),
    'definers_have_fixed_empty_search_path', not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('app', 'api', 'private') and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)
    ),
    'executor_roles_are_restricted', not exists (
      select 1 from executors
      where rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolinherit or rolreplication
    ),
    'browser_cannot_inherit_executors', not exists (
      select 1 from (values ('anon'), ('authenticated'), ('authenticator')) r(name)
      cross join executors e
      where pg_has_role(r.name, e.oid, 'member')
    ),
    'definers_do_not_own_application_tables', not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'private') and c.relkind in ('r', 'p')
      and c.relowner in (select oid from executors)
    ),
    'auth_profile_trigger_is_present', exists (
      select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'aro_user_profile_created' and not tgisinternal and tgenabled = 'O'
    ),
    -- Catalog/commerce tables deliberately retain postgres ownership with no
    -- executor ownership. Check FORCE where the migrations require it, while
    -- the separate RLS and ownership checks cover every application table.
    'sensitive_tables_force_rls', not exists (
      select 1 from pg_class c where c.oid in (
        'app.profiles'::regclass,'app.addresses'::regclass,'private.admin_memberships'::regclass,
        'private.auth_email_change_attempts'::regclass,'private.media_upload_limits'::regclass,
        'private.account_recovery_codes'::regclass,'private.account_recovery_limits'::regclass,
        'app.product_reviews'::regclass,'app.site_settings'::regclass,'app.complaints'::regclass,
        'private.complaint_history'::regclass,'private.complaint_limits'::regclass,
        'private.admin_push_subscriptions'::regclass,'app.admin_notifications'::regclass,
        'private.admin_notification_reads'::regclass,'private.admin_push_deliveries'::regclass
      ) and not c.relforcerowsecurity
    )
  ),
  'migrations', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'row_counts', jsonb_build_object(
    'products', (select count(*) from app.products),
    'brands', (select count(*) from app.brands),
    'profiles', (select count(*) from app.profiles),
    'addresses', (select count(*) from app.addresses),
    'admin_memberships', (select count(*) from private.admin_memberships)
  )
) as verification;
