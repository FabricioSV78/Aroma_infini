-- Test-only rows and reference function; always rolled back by this fixture.
begin;
do $$begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner.';
  end if;
end$$;
create schema aroma_finder_test;
grant usage on schema aroma_finder_test to anon,authenticated,aro_api_executor;
create function aroma_finder_test.id(kind integer,n integer) returns uuid language sql immutable set search_path='' as $$
  select ('e040000'||kind::text||'-0000-4000-8000-'||pg_catalog.lpad(n::text,12,'0'))::uuid;
$$;
create function aroma_finder_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
grant execute on all functions in schema aroma_finder_test to anon,authenticated,aro_api_executor;

insert into app.brands(id,name,slug,active) values
 (aroma_finder_test.id(1,1),'Finder Visible','finder-visible',true),
 (aroma_finder_test.id(1,2),'Finder Hidden','finder-hidden',false);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
values
 (aroma_finder_test.id(2,1),'r2','public/dynamic/'||aroma_finder_test.id(2,1)||'/'||repeat('a',64)||'/800.webp','image/webp',800,1000,'ready',now(),aroma_finder_test.id(8,1),'product-gallery',2000,repeat('a',64)),
 (aroma_finder_test.id(2,2),'r2','public/dynamic/'||aroma_finder_test.id(2,2)||'/'||repeat('b',64)||'/800.webp','image/webp',800,1000,'ready',now(),aroma_finder_test.id(8,2),'product-gallery',2000,repeat('b',64));
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id in(aroma_finder_test.id(2,1),aroma_finder_test.id(2,2));
insert into app.products(id,name,slug,brand_id,product_type,gender,aromatic_profile,short_description,description,active,display_rank,intensity_level,occasion)
select aroma_finder_test.id(3,i),'Finder Perfume '||i,'finder-fixture-'||i,
 case when i=19 then aroma_finder_test.id(1,2) else aroma_finder_test.id(1,1) end,
 'perfume','unisex','Floral · cítrico','Fixture','Ignored description',i not in (17,18,19,20),i%4,1+i%3,
 case when i%2=0 then 'Diario / Oficina' else 'Noche · Encuentros' end from generate_series(1,20)i;
insert into app.product_variants(id,product_id,merchant_sku,ml,price_cents,stock,active)
select aroma_finder_test.id(4,i*3+j),aroma_finder_test.id(3,i),'FINDER-'||i||'-'||j,
 case j when 0 then 50 else 100 end,12000+j*8000,
 case when i=17 or (i%4=0 and j=0) then 0 else 5 end,
 not(i%5=0 and j=1) from generate_series(1,20)i cross join generate_series(0,1)j;
insert into app.product_images(product_id,position,media_id)
select aroma_finder_test.id(3,i),j,aroma_finder_test.id(2,j+1) from generate_series(1,20)i cross join generate_series(0,1)j;
insert into app.product_olfactory_families(product_id,family_code,position)
select aroma_finder_test.id(3,i),case when i%2=0 then 'floral' else 'citrico' end,0 from generate_series(1,20)i;
insert into app.product_olfactory_families(product_id,family_code,position)
select aroma_finder_test.id(3,i),'amaderado',1 from generate_series(1,20)i where i%3=0;
insert into app.product_offers(product_id,enabled,discount_type,value,starts_at,ends_at)
select aroma_finder_test.id(3,i),i%5<>0,case when i%2=0 then 'percent' else 'fixed' end,
 case when i%2=0 then 15 else 1000 end,
 case when i%8=0 then now()+interval '1 day' else now()-interval '2 days' end,
 case when i%8=0 then now()+interval '2 days' when i%8=4 then now()-interval '1 day' else null end
from generate_series(1,20)i where i%4<>3;
insert into app.products(id,name,slug,brand_id,product_type,short_description,description,active,display_rank)
values(aroma_finder_test.id(3,21),'Finder accessory','finder-fixture-21',aroma_finder_test.id(1,1),'complemento','Fixture','Fixture',true,0);
insert into app.product_variants(product_id,merchant_sku,label,price_cents,stock)
values(aroma_finder_test.id(3,21),'FINDER-ACCESSORY','Dorado',12000,5);
insert into app.product_images(product_id,position,media_id)
values(aroma_finder_test.id(3,21),0,aroma_finder_test.id(2,1));
set constraints all immediate;

-- Freeze only the projection boundary, using the established canonical full
-- document as the independent reference for products/prices/manifest bytes.
create function aroma_finder_test.reference() returns jsonb language sql stable security definer set search_path='' as $$
  with eligible as materialized (
    select p.id,p.display_rank,private.catalog_product_document(p.id) record
    from app.products p join app.brands b on b.id=p.brand_id and b.active
    where p.product_type='perfume' and exists(select 1 from app.product_variants v
      where v.product_id=p.id and v.active and v.stock>0 and v.price_cents>0 and v.ml>0)
  ), covers as (
    select distinct m.value from eligible p
      cross join lateral jsonb_array_elements(coalesce(p.record->'mediaAssets','[]'::jsonb)) m(value)
    where m.value->>'src'=p.record->'product'->>'image'
  )
  select jsonb_build_object('brands',api.catalog_brands(),'olfactoryFamilies',api.catalog_olfactory_families(),
    'total',(select count(*) from eligible),
    'items',coalesce((select jsonb_agg(jsonb_build_object('product',record->'product',
      'detail',jsonb_build_object('occasion',record->'detail'->'occasion','intensityLevel',record->'detail'->'intensityLevel',
        'intensity',record->'detail'->'intensity')) order by display_rank,id) from eligible),'[]'::jsonb),
    'mediaAssets',coalesce((select jsonb_agg(value order by value->>'id') from covers),'[]'::jsonb));
$$;
grant create on schema aroma_finder_test to aro_api_executor;
alter function aroma_finder_test.reference() owner to aro_api_executor;
revoke create on schema aroma_finder_test from aro_api_executor;
revoke all on function aroma_finder_test.reference() from public,anon,authenticated,service_role;
grant execute on function aroma_finder_test.reference() to anon,authenticated;

set local role anon;
select aroma_finder_test.ok(api.catalog_finder_context()=aroma_finder_test.reference(),'Finder compact DTO exactly matches canonical published product, offer, variant and cover values');
select aroma_finder_test.ok((api.catalog_finder_context()->>'total')::integer=16,'Finder excludes inactive, sold-out and hidden-brand perfumes');
select aroma_finder_test.ok(jsonb_array_length(api.catalog_finder_context()->'mediaAssets')=1,'Finder cover manifests are deduplicated and exclude secondary photographs');
select aroma_finder_test.ok(not exists(select 1 from jsonb_array_elements(api.catalog_finder_context()->'items') x
  where x->'product'->>'productType'<>'perfume' or x->'detail'?'gallery' or x->'detail'?'notes'
    or x->'detail'?'description' or x->'detail'?'recommendationIds'),'Finder never includes accessories or unused product detail data');
reset role;
set local role authenticated;
select aroma_finder_test.ok(api.catalog_finder_context()=aroma_finder_test.reference(),'Authenticated public finder retains identical RLS and DTO results');
reset role;
update app.olfactory_families set active=false where code='floral';
set local role anon;
select aroma_finder_test.ok(api.catalog_finder_context()=aroma_finder_test.reference(),'Inactive family vocabulary and stored assignments remain canonical');
reset role;
-- The real brand command deactivates its products first; the publication
-- constraint deliberately rejects hiding a brand beneath active products.
update app.products set active=false where brand_id=aroma_finder_test.id(1,1);
update app.brands set active=false where id=aroma_finder_test.id(1,1);
set local role anon;
select aroma_finder_test.ok(api.catalog_finder_context()->'items'='[]'::jsonb and api.catalog_finder_context()->'mediaAssets'='[]'::jsonb,
 'Hiding the last eligible brand removes every finder candidate and its manifests');
reset role;
select aroma_finder_test.ok(exists(select 1 from pg_proc where oid='api.catalog_finder_context()'::regprocedure
  and proowner='aro_api_executor'::regrole and prosecdef and provolatile='s' and proconfig=array['search_path=""']),
 'Finder RPC keeps non-login RLS executor, STABLE and empty search_path');
select aroma_finder_test.ok(has_function_privilege('anon','api.catalog_finder_context()','execute')
  and has_function_privilege('authenticated','api.catalog_finder_context()','execute')
  and not has_function_privilege('service_role','api.catalog_finder_context()','execute'),
 'Finder grants only the same anonymous/authenticated public read audience');
select aroma_finder_test.ok(not has_table_privilege('anon','app.products','select')
  and not has_table_privilege('authenticated','app.product_variants','select'),
 'Public RPC does not grant raw table reads');
rollback;
