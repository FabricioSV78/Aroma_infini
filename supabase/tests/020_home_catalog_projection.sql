-- Disposable local fixtures only; never use against an existing environment.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Only local fixtures';end if;
end $$;
create schema aroma_home_catalog_test;
grant usage on schema aroma_home_catalog_test to anon,authenticated;
create function aroma_home_catalog_test.ok(value boolean,label text)
returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_home_catalog_test.snapshot()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb:='[]';page jsonb;offset_value integer:=0;
begin
  loop
    page:=api.catalog_products(100,offset_value);result:=result||(page->'items');
    offset_value:=offset_value+100;
    exit when offset_value>=(page->>'total')::integer;
  end loop;
  return result;
end $$;
create function aroma_home_catalog_test.expected_profiles(items jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'brandId',r.value->'product'->'brandId','family',r.value->'product'->'family',
    'olfactoryFamilies',r.value->'product'->'olfactoryFamilies',
    'occasion',r.value->'detail'->'occasion','intensity',r.value->'detail'->'intensity',
    'finderAvailable',r.value->'product'->>'productType'='perfume'
      and r.value->'product'->>'brandId'<>''
      and exists(select 1 from jsonb_array_elements(api.catalog_brands()) b
        where b->>'id'=r.value->'product'->>'brandId')
      and exists(select 1 from jsonb_array_elements(r.value->'product'->'variants') v
        where (v->>'active')::boolean and (v->>'stock')::integer>0
          and (v->>'priceCents')::bigint>0 and (v->>'ml')::integer>0)
  ) order by r.ordinality),'[]'::jsonb)
  from jsonb_array_elements(items) with ordinality r(value,ordinality);
$$;
create function aroma_home_catalog_test.benchmark()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare full_value jsonb;home_value jsonb;previews_value jsonb;started timestamptz;
  before_ms numeric[]:='{}';after_ms numeric[]:='{}';round_value integer;
begin
  for round_value in 1..3 loop
    started:=clock_timestamp();full_value:=aroma_home_catalog_test.snapshot();
    before_ms:=array_append(before_ms,round((extract(epoch from clock_timestamp()-started)*1000)::numeric,3));
    started:=clock_timestamp();home_value:=api.catalog_home_context();
    after_ms:=array_append(after_ms,round((extract(epoch from clock_timestamp()-started)*1000)::numeric,3));
  end loop;
  previews_value:=api.catalog_brand_previews();
  perform aroma_home_catalog_test.ok(home_value->'profiles'=aroma_home_catalog_test.expected_profiles(full_value),
    'Minimal profiles equal ordered full DTO profiles');
  return jsonb_build_object('publishedProducts',jsonb_array_length(full_value),
    'beforeFullSnapshot',jsonb_build_object('dtoCount',jsonb_array_length(full_value),
      'decodedBytes',octet_length(full_value::text),'sqlMs',to_jsonb(before_ms),
      'catalogRpcCalls',ceil(jsonb_array_length(full_value)::numeric/100)+2),
    'afterHomeCatalog',jsonb_build_object('dtoCount',jsonb_array_length(home_value->'items'),
      'decodedBytes',octet_length(home_value::text),'sqlMs',to_jsonb(after_ms),'catalogRpcCalls',1),
    'afterBrandPreviews',jsonb_build_object('decodedBytes',octet_length(previews_value::text),'catalogRpcCalls',1),
    'scope','Disposable local PostgreSQL; no network/compression/browser. Home document and targeted Hero DTOs are separate in both comparisons. Before bytes exclude page envelopes and settings/brands.');
end $$;
grant execute on all functions in schema aroma_home_catalog_test to anon,authenticated;

insert into app.brands(id,name,slug) values
 ('f1000000-0000-4000-8000-000000000001','Home Fixture','home-fixture'),
 ('f1000000-0000-4000-8000-000000000002','Empty Home Fixture','empty-home-fixture');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
values('f2000000-0000-4000-8000-000000000001','r2',
  'public/dynamic/f2000000-0000-4000-8000-000000000001/'||repeat('a',64)||'/800.webp',
  'image/webp',800,1000,'ready',now(),'f2100000-0000-4000-8000-000000000001','product-gallery',2000,repeat('a',64));
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets
where id='f2000000-0000-4000-8000-000000000001';
insert into app.products(id,name,slug,brand_id,gender,aromatic_profile,short_description,description,intensity_level,occasion,active,display_rank)
select ('f3000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'Home Fixture '||i,'home-fixture-'||i,'f1000000-0000-4000-8000-000000000001','unisex',
  case i%3 when 0 then 'Floral · fresco' when 1 then 'Por definir' else 'Cítrico · Floral' end,
  'Local home fixture',repeat('Local description only. ',20),(1+i%3)::smallint,
  case i%3 when 0 then 'dIARIO' when 1 then 'Diario; Noche' else 'dIARIO' end,true,i/2
from generate_series(1,1000) i;
insert into app.product_variants(product_id,ml,price_cents,stock,active)
select id,50,12000,5,true from app.products;
insert into app.product_images(product_id,position,media_id)
select id,0,'f2000000-0000-4000-8000-000000000001' from app.products;
insert into app.product_olfactory_families(product_id,family_code,position)
select id,case display_rank%2 when 0 then 'floral' else 'citrico' end,0 from app.products;
insert into app.products(id,name,slug,product_type,short_description,description,active)
values('f3000000-0000-4000-8000-000000002001','Fixture complement','home-fixture-complement',
  'complemento','Local fixture','Local fixture',true);
insert into app.product_variants(product_id,label,price_cents,stock)
values('f3000000-0000-4000-8000-000000002001','Unit',1000,3);
insert into app.product_images(product_id,position,media_id)
values('f3000000-0000-4000-8000-000000002001',0,'f2000000-0000-4000-8000-000000000001');
set constraints all immediate;
analyze app.products;analyze app.product_variants;analyze app.product_images;analyze app.product_olfactory_families;

select aroma_home_catalog_test.ok((select count(*)=2 from pg_proc where oid in
  ('api.catalog_home_context()'::regprocedure,'api.catalog_brand_previews()'::regprocedure)
  and proowner='aro_api_executor'::regrole and prosecdef and provolatile='s'
  and proconfig=array['search_path=""']),'Home projections preserve the stable non-bypass executor boundary');
select aroma_home_catalog_test.ok(not has_table_privilege('anon','app.products','select')
  and not has_function_privilege('anon','private.catalog_product_document(uuid)','execute'),
  'New projections do not grant anonymous table or private helper access');
set local role anon;
select aroma_home_catalog_test.ok(api.catalog_home_context()->'items'=api.catalog_products(4,0)->'items',
  'Home bestseller DTOs retain prices, variants, responsive manifests and tie ordering exactly');
select aroma_home_catalog_test.ok(api.catalog_home_context()->'profiles'=
  aroma_home_catalog_test.expected_profiles(aroma_home_catalog_test.snapshot()),
  'Home profile values and order equal the complete public snapshot');
select aroma_home_catalog_test.ok(jsonb_array_length(api.catalog_home_context()->'items')=4
  and jsonb_array_length(api.catalog_home_context()->'profiles')=1000,
  'Home retains all vocabulary profiles with only four complete DTOs');
select aroma_home_catalog_test.ok(api.catalog_brand_previews()->'brands'->0->>'previewImage' is null
  and api.catalog_brand_previews()->'brands'->1->>'previewImage'=api.catalog_products(1,0)->'items'->0->'product'->>'image'
  and jsonb_array_length(api.catalog_brand_previews()->'mediaAssets')=1,
  'Brand previews keep empty active brands, first published cover and only its responsive manifest');
select 'PASS: LOCAL_HOME_CATALOG_BENCHMARK '||aroma_home_catalog_test.benchmark()::text;
reset role;

update app.products set active=false where slug='home-fixture-1';
update app.product_variants set stock=0 where product_id='f3000000-0000-4000-8000-000000000002';
set constraints all immediate;
set local role anon;
select aroma_home_catalog_test.ok(jsonb_array_length(api.catalog_home_context()->'profiles')=998
  and api.catalog_home_context()->'items'->0->'product'->>'slug'='home-fixture-3'
  and api.catalog_home_context()->'profiles'=aroma_home_catalog_test.expected_profiles(aroma_home_catalog_test.snapshot()),
  'Unpublished and exhausted products leave both vocabulary and bestsellers');
select aroma_home_catalog_test.ok(api.catalog_products_by_ids(array[
  'f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002',
  'f3000000-0000-4000-8000-000000000003']::uuid[])->'items'=jsonb_build_array(api.catalog_home_context()->'items'->0),
  'Existing targeted Hero hydration retains only the public selected DTO');
reset role;
set constraints all deferred;
update app.products set active=false;
update app.brands set active=false where id='f1000000-0000-4000-8000-000000000001';
set constraints all immediate;
set local role authenticated;
select aroma_home_catalog_test.ok(api.catalog_home_context()->'items'='[]'::jsonb
  and api.catalog_home_context()->'profiles'='[]'::jsonb
  and jsonb_array_length(api.catalog_brand_previews()->'brands')=1
  and api.catalog_brand_previews()->'mediaAssets'='[]'::jsonb,
  'Signed-in public projections hide inactive brands and their unpublished images');
reset role;
-- Availability of a non-volumetric complement must never create finder choices.
set constraints all deferred;
update app.products set active=true where slug='home-fixture-complement';
update app.store_settings set complements_enabled=true;
set constraints all immediate;
set local role anon;
select aroma_home_catalog_test.ok(jsonb_array_length(api.catalog_home_context()->'profiles')=1
  and api.catalog_home_context()->'profiles'->0->>'finderAvailable'='false'
  and api.catalog_home_context()->'items'='[]'::jsonb
  and api.catalog_products(1,0)->'items'->0->'product'->>'productType'='complemento',
  'Enabled complements retain vocabulary data without entering perfume bestsellers or finder options');
reset role;
rollback;
