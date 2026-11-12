-- A rich 100-product page invoked the complete SQL document helper 100 times.
-- Each invocation starts its own RLS InitPlans, including live trusted-device
-- verification. Build the same canonical documents in one page-bounded query
-- so those existing policies can share their statement-local InitPlans.
-- Keep the original single-product helper for write responses and public DTOs.
do $migration$
declare
  document_source text;
  page_definition text;
  previous_products text := 'coalesce((select pg_catalog.jsonb_agg(private.admin_product_document(page.id) order by page.created_at, page.id)
      from (select id, created_at from app.products order by created_at, id limit p_limit offset p_offset) page), ''[]''::jsonb)';
  document_start text := '  select pg_catalog.jsonb_build_object(';
  document_from text := E'\n  from app.products p';
  document_filter text := 'where p.id = p_product_id;';
begin
  -- Fail closed if an earlier migration changed the reviewed source contract.
  select prosrc into strict document_source from pg_catalog.pg_proc
    where oid='private.admin_product_document(uuid)'::regprocedure
      and not prosecdef and provolatile='s' and proconfig=array['search_path=""'];
  page_definition:=pg_catalog.pg_get_functiondef('api.admin_catalog_page(integer,integer)'::regprocedure);
  if pg_catalog.strpos(document_source,document_start)=0
    or pg_catalog.strpos(document_source,document_from)=0
    or pg_catalog.strpos(document_source,document_filter)=0
    or pg_catalog.strpos(page_definition,previous_products)=0
    or pg_catalog.strpos(page_definition,'perform private.require_catalog_admin();')=0 then
    raise exception 'Unexpected reviewed administrative catalog projection';
  end if;

  -- Reuse the already-migrated expression, including verified media sources,
  -- rendition manifests and every variant, rather than maintaining a second
  -- independently copied product DTO. This SQL still executes as the existing
  -- restricted catalog executor under every original table RLS policy. Test 028
  -- compares this page to the single-product helper so future DTO migrations
  -- must preserve their parity as well.
  document_source:=pg_catalog.replace(document_source,document_start,
    '  select p.id, p.created_at, pg_catalog.jsonb_build_object(');
  document_source:=pg_catalog.replace(document_source,document_from,
    ' as document'||document_from);
  document_source:=pg_catalog.replace(document_source,document_filter,
    'where p.id in (select id from selected)');
  execute pg_catalog.replace(page_definition,previous_products,
    '(with selected as materialized ('||
    'select id from app.products order by created_at, id limit p_limit offset p_offset), '||
    'documents as materialized ('||document_source||') '||
    'select coalesce(pg_catalog.jsonb_agg(document order by created_at, id), ''[]''::jsonb) from documents)');
end;
$migration$;
