-- Disposable local fixtures. This file never targets the hosted catalog.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner.';end if;
end $$;
create schema aroma_browse_test;
grant usage on schema aroma_browse_test to anon,authenticated,aro_api_executor;
create function aroma_browse_test.ok(p_value boolean,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %',p_label;end if;
  return 'PASS: '||p_label;
end $$;
-- Inspect the actual candidate lookup with the same non-bypass role as the
-- public RPC, without adding an index or exposing any hosted tables.
create function aroma_browse_test.explain_candidates()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_plan jsonb;
begin
  if current_user <> 'aro_api_executor' then raise exception 'Use the public executor role';end if;
  execute $plan$
    explain (analyze,buffers,format json)
    select p.id from app.products p
    where p.active
      and p.brand_id='81000000-0000-4000-8000-000000000001'
      and exists(select 1 from app.product_variants v where v.product_id=p.id and v.active and v.stock>0)
      and exists(select 1 from app.product_olfactory_families f where f.product_id=p.id and f.family_code='floral')
    order by p.display_rank,p.id limit 12
  $plan$ into v_plan;
  return v_plan;
end $$;
grant execute on function aroma_browse_test.explain_candidates() to aro_api_executor;
create function aroma_browse_test.error(p_sql text,p_state text,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
declare v_state text;
begin
  begin execute p_sql;exception when others then get stacked diagnostics v_state=returned_sqlstate;end;
  if v_state is distinct from p_state then raise exception 'FAIL: %, expected %, got %',p_label,p_state,coalesce(v_state,'success');end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_browse_test.benchmark()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_before jsonb;v_after jsonb;v_page jsonb;v_started timestamptz;v_count integer;
  v_offset integer;v_before_ms numeric[]:='{}';v_after_ms numeric[]:='{}';v_round integer;
begin
  for v_round in 1..3 loop
    v_started:=clock_timestamp();v_offset:=0;v_before:='[]';
    loop
      v_page:=api.catalog_products(100,v_offset);
      v_before:=v_before||(v_page->'items');v_offset:=v_offset+100;
      exit when v_offset>=(v_page->>'total')::integer;
    end loop;
    v_before_ms:=array_append(v_before_ms,round((extract(epoch from clock_timestamp()-v_started)*1000)::numeric,3));
    v_started:=clock_timestamp();v_after:=api.catalog_browse();
    v_after_ms:=array_append(v_after_ms,round((extract(epoch from clock_timestamp()-v_started)*1000)::numeric,3));
  end loop;
  v_count:=jsonb_array_length(v_before);
  return jsonb_build_object('publishedProducts',v_count,'samples',3,
    'beforeFullSnapshot',jsonb_build_object('dtoCount',v_count,'decodedBytes',octet_length(v_before::text),'sqlMs',to_jsonb(v_before_ms),'catalogRpcCalls',ceil(v_count::numeric/100)),
    'afterBrowse',jsonb_build_object('dtoCount',jsonb_array_length(v_after->'items'),'decodedBytes',octet_length(v_after::text),'sqlMs',to_jsonb(v_after_ms),'catalogRpcCalls',1),
    'scope','PostgreSQL local fixture; no network, compression, browser or real customers. Before bytes exclude page envelopes and separate brands/settings, so savings are conservative.');
end $$;
grant execute on all functions in schema aroma_browse_test to anon,authenticated;
insert into app.brands(id,name,slug) values
 ('81000000-0000-4000-8000-000000000001','Browse Fixture','browse-fixture'),
 ('81000000-0000-4000-8000-000000000002','Other Fixture','other-fixture');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
values('82000000-0000-4000-8000-000000000001','local','/images/browse-fixture.webp','image/webp',800,1000,'ready',now());
create function aroma_browse_test.seed(p_from integer,p_to integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into app.products(id,name,slug,brand_id,product_type,gender,aromatic_profile,short_description,description,active,display_rank)
  select ('83000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
    case i when 1 then 'Cítrico de prueba' when 2 then '100% Fixture' else 'Perfume Fixture '||i end,
    'browse-fixture-'||i,'81000000-0000-4000-8000-000000000001','perfume',
    case when i%3=0 then 'hombre' when i%3=1 then 'mujer' else 'unisex' end,
    'Descripción olfativa confirmada','Descripción breve de prueba local.',
    repeat('Descripción completa de la fragancia usada únicamente en la prueba de rendimiento local. ',5),true,i
  from generate_series(p_from,p_to) i;
  insert into app.product_variants(id,product_id,ml,price_cents,stock,active)
  select ('84000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
    ('83000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,50,10000+i*100,5,true
  from generate_series(p_from,p_to) i;
  insert into app.product_variants(id,product_id,ml,price_cents,stock,active)
  select ('85000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
    ('83000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,100,50000+i*100,0,true
  from generate_series(p_from,p_to) i;
  insert into app.product_images(product_id,position,media_id)
  select ('83000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,0,'82000000-0000-4000-8000-000000000001'
  from generate_series(p_from,p_to) i;
  insert into app.product_olfactory_families(product_id,family_code,position)
  select ('83000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
    case when i%2=0 then 'floral' else 'citrico' end,0 from generate_series(p_from,p_to) i;
  insert into app.product_notes(product_id,phase,position,label)
  select ('83000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,phase,0,'Nota de prueba'
  from generate_series(p_from,p_to) i cross join unnest(array['top','heart','base']) phase;
end $$;
select aroma_browse_test.seed(1,100);
insert into app.product_offers(product_id,enabled,discount_type,value)
values('83000000-0000-4000-8000-000000000001',true,'percent',10),
 ('83000000-0000-4000-8000-000000000002',true,'fixed',1000);
set constraints all immediate;
select aroma_browse_test.ok((select proowner='aro_api_executor'::regrole and prosecdef from pg_proc where oid='api.catalog_browse(jsonb,integer)'::regprocedure), 'Browse uses the non-bypass published-catalog executor');
set local role anon;
select aroma_browse_test.ok((api.catalog_browse()->>'total')::integer=100 and jsonb_array_length(api.catalog_browse()->'items')=12,'Browse returns twelve DTOs and accurate public count');
select aroma_browse_test.ok(jsonb_array_length(api.catalog_browse('{}',4)->'items')=4,'Home can request four bestsellers without full snapshot DTOs');
select aroma_browse_test.ok(api.catalog_browse('{"page":100000}')->>'page'='9' and jsonb_array_length(api.catalog_browse('{"page":100000}')->'items')=4,'Last page clamps deterministically');
select aroma_browse_test.ok(api.catalog_browse('{"families":["floral","citrico"]}')->>'total'='100' and api.catalog_browse('{"families":["floral"],"genders":["hombre"]}')->>'total'='16','Families use OR while independent filter groups use AND');
select aroma_browse_test.ok(api.catalog_browse('{"brands":["browse-fixture"],"search":"CITRICO"}')->>'total'='1','Accent and case insensitive search combines with brand slug');
select aroma_browse_test.ok(api.catalog_browse('{"search":"%"}')->>'total'='1','Search percent is literal rather than a wildcard');
select aroma_browse_test.ok(api.catalog_browse('{"search":"_"}')->>'total'='0','Search underscore is literal rather than a wildcard');
select aroma_browse_test.ok(api.catalog_browse('{"brands":["unknown-brand"],"families":["unknown-family"]}')->>'total'='100','Unknown URL brand and family options are discarded consistently with storefront parsing');
select aroma_browse_test.ok(api.catalog_browse('{"min":"90","max":"92"}')->>'total'='2','Percent and fixed offers filter by final cents');
select aroma_browse_test.ok(api.catalog_browse('{"min":"92","max":"90"}')->>'total'='2','Reversed price boundaries preserve frontend semantics');
select aroma_browse_test.ok(api.catalog_browse('{"min":"501"}')->>'total'='0','Unavailable cheap or expensive presentations do not affect price filtering');
select aroma_browse_test.ok(api.catalog_browse('{"order":"precio-asc"}')->'items'->0->'product'->>'slug'='browse-fixture-1' and api.catalog_browse('{"order":"precio-desc"}')->'items'->0->'product'->>'slug'='browse-fixture-100','Price sorting uses available final presentation prices');
select aroma_browse_test.ok(api.catalog_browse('{"families":["gourmand"]}')->>'total'='0' and api.catalog_browse('{"families":["gourmand"]}')->>'pages'='1' and api.catalog_browse('{"families":["gourmand"]}')->>'availableTotal'='100','Empty selection returns one empty page and preserves available count');
select aroma_browse_test.ok(api.catalog_browse()->'familyCodes'='["citrico","floral"]'::jsonb and not exists(select 1 from jsonb_array_elements(api.catalog_browse()->'olfactoryFamilies') f where f ? 'version' or f ? 'productCount'),'Public family metadata has no administrative version or usage count');
select aroma_browse_test.error('select api.catalog_browse(''[]'')','22023','Reject non-object query');
select aroma_browse_test.error('select api.catalog_browse(''{"families":null}'')','22023','Reject invalid filter types');
select aroma_browse_test.error('select api.catalog_browse(''{"page":0}'')','22023','Reject invalid pages');
select aroma_browse_test.error('select api.catalog_browse(''{"min":"1e9"}'')','22023','Reject unsupported price syntax');
select aroma_browse_test.error('select api.catalog_browse(''{}'',100)','22023','Reject unbounded page sizes');
select aroma_browse_test.error('select api.catalog_browse(''{"order":"newest"}'')','22023','Reject unsupported order');
select 'PASS: LOCAL_BROWSE_BENCHMARK '||aroma_browse_test.benchmark()::text;
reset role;
set constraints all deferred;
select aroma_browse_test.seed(101,1000);
set constraints all immediate;
analyze app.products;analyze app.product_variants;analyze app.product_images;analyze app.product_olfactory_families;
set local role anon;
select aroma_browse_test.ok(api.catalog_browse()->>'total'='1000' and api.catalog_browse()->>'pages'='84','Thousand-product catalog retains twelve-item pages');
select 'PASS: LOCAL_BROWSE_BENCHMARK '||aroma_browse_test.benchmark()::text;
reset role;
set local role aro_api_executor;
select 'PASS: LOCAL_BROWSE_EXPLAIN '||aroma_browse_test.explain_candidates()::text;
reset role;
-- Draft/inactive brands, exhausted products and closed complements stay hidden
-- through the exact same RLS boundary used by the existing detail RPC.
update app.products set active=false where slug='browse-fixture-1000';
update app.product_variants set stock=0 where product_id='83000000-0000-4000-8000-000000000999';
set constraints all immediate;
set local role anon;
select aroma_browse_test.ok(api.catalog_browse()->>'total'='998' and api.catalog_browse('{"search":"Fixture 1000"}')->>'total'='0','Draft and exhausted products cannot enter browse counts or DTOs');
select aroma_browse_test.ok(api.catalog_browse('{"productTypes":["complemento"]}')->>'total'='0','Disabled complement feature cannot be bypassed with query params');
select aroma_browse_test.ok(api.catalog_products_by_ids()->>'total'='0','Empty targeted IDs do not load the catalog');
select aroma_browse_test.ok(api.catalog_products_by_ids(array['83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001']::uuid[],array['84000000-0000-4000-8000-000000000002']::uuid[])->>'total'='2','Targeted products and variant owners are combined without duplicate DTOs');
select aroma_browse_test.ok(api.catalog_products_by_ids(array['83000000-0000-4000-8000-000000000999','83000000-0000-4000-8000-000000001000']::uuid[])->>'total'='0','Targeted hydration cannot bypass publication or stock RLS');
select aroma_browse_test.ok(api.catalog_products_by_ids('{}'::uuid[],array['84000000-0000-4000-8000-000000000001']::uuid[])->'items'->0->'product'->>'slug'='browse-fixture-1','Cart variant hydration returns its current published product and prices');
select aroma_browse_test.error('select api.catalog_products_by_ids(array_fill(''83000000-0000-4000-8000-000000000001''::uuid,array[101]))','22023','Targeted hydration bounds input before querying');
select aroma_browse_test.error('select api.catalog_products_by_ids(array[null]::uuid[])','22023','Targeted hydration rejects null identifiers');
select aroma_browse_test.ok(api.catalog_product_context('browse-fixture-1')->'record'->'product'->>'slug'='browse-fixture-1' and jsonb_array_length(api.catalog_product_context('browse-fixture-1')->'recommendations')=4 and api.catalog_product_context('browse-fixture-1')->'recommendations'->0->'product'->>'slug'='browse-fixture-3','Detail context uses exact family overlap and existing public order for automatic recommendations');
select aroma_browse_test.ok(api.catalog_product_context('browse-fixture-999')->'record'='null'::jsonb and api.catalog_product_context('unknown-slug')->'recommendations'='[]'::jsonb,'Missing and private product details return no recommendations');
reset role;
insert into app.product_recommendations(product_id,recommended_product_id,position)
values('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002',0),
 ('83000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000999',1);
set constraints all immediate;
set local role anon;
select aroma_browse_test.ok(jsonb_array_length(api.catalog_product_context('browse-fixture-1')->'recommendations')=1 and api.catalog_product_context('browse-fixture-1')->'recommendations'->0->'product'->>'slug'='browse-fixture-2','Explicit published recommendations retain manual order without filling missing private entries');
reset role;
rollback;
