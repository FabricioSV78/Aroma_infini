-- Disposable local image-selection regression; never a hosted fixture import.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner.';
  end if;
end $$;
create schema aroma_media_query_test;
grant usage on schema aroma_media_query_test to anon,authenticated,aro_api_executor,aro_catalog_admin_executor;
create function aroma_media_query_test.ok(p_value boolean,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %',p_label;end if;
  return 'PASS: '||p_label;
end $$;
grant execute on function aroma_media_query_test.ok(boolean,text) to anon,authenticated,aro_api_executor,aro_catalog_admin_executor;

insert into auth.users(id,email) values('96000000-0000-4000-8000-000000000001','media-query@example.invalid');
insert into private.admin_memberships(user_id) values('96000000-0000-4000-8000-000000000001');
insert into app.brands(id,name,slug) values('96000000-0000-4000-8000-000000000002','Media Query Fixture','media-query-fixture');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
select ('96100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'r2',
  'public/dynamic/96100000-0000-4000-8000-'||lpad(i::text,12,'0')||'/'||repeat('a',64)||'/800.webp',
  'image/webp',800,1000,case when i=4 then 'disabled' else 'ready' end,now(),
  ('96200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'product-gallery',2000,repeat('a',64)
from generate_series(1,6)i;
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
  select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets
  where id::text like '96100000-%';
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
  values('96100000-0000-4000-8000-000000000007','local','/images/media-query-fixture.webp','image/webp',800,1000,'ready',now());
insert into app.products(id,name,slug,brand_id,short_description,description,active,gender,olfactory_media_id)
values
  ('96300000-0000-4000-8000-000000000001','Media Query One','media-query-one','96000000-0000-4000-8000-000000000002','Fixture','Local fixture',true,'unisex','96100000-0000-4000-8000-000000000002'),
  ('96300000-0000-4000-8000-000000000002','Media Query Two','media-query-two','96000000-0000-4000-8000-000000000002','Fixture','Local fixture',true,'unisex',null);
insert into app.product_variants(product_id,ml,price_cents,stock,active)
  select id,50,12000,5,true from app.products where id::text like '96300000-%';
insert into app.product_images(product_id,position,media_id) values
  ('96300000-0000-4000-8000-000000000001',0,'96100000-0000-4000-8000-000000000001'),
  ('96300000-0000-4000-8000-000000000001',1,'96100000-0000-4000-8000-000000000002'),
  ('96300000-0000-4000-8000-000000000001',2,'96100000-0000-4000-8000-000000000004'),
  ('96300000-0000-4000-8000-000000000001',3,'96100000-0000-4000-8000-000000000007'),
  ('96300000-0000-4000-8000-000000000002',0,'96100000-0000-4000-8000-000000000003');
set constraints all immediate;

-- Reference uses the previous independent membership predicate and the same
-- executor role. It exercises reuse, null olfactory IDs, local/disabled media,
-- unrelated assets, stable ordering and complete rendition manifests.
create function aroma_media_query_test.legacy_assets(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(private.media_document(ma.id) order by ma.id),'[]'::jsonb)
  from app.products p cross join app.media_assets ma
  where p.id=p_id and ma.storage_kind='r2' and ma.status='ready'
    and (ma.id=p.olfactory_media_id or exists(
      select 1 from app.product_images pi where pi.product_id=p.id and pi.media_id=ma.id));
$$;
grant execute on function aroma_media_query_test.legacy_assets(uuid) to aro_api_executor,aro_catalog_admin_executor;
set local role aro_api_executor;
select aroma_media_query_test.ok(
  bool_and(private.catalog_product_document(p.id)->'mediaAssets'=aroma_media_query_test.legacy_assets(p.id)),
  'Public product manifests preserve legacy membership, order, deduplication and full rendition JSON')
from app.products p where p.id::text like '96300000-%';
select aroma_media_query_test.ok(
  jsonb_array_length(private.catalog_product_document('96300000-0000-4000-8000-000000000001')->'mediaAssets')=2
  and jsonb_array_length(private.catalog_product_document('96300000-0000-4000-8000-000000000002')->'mediaAssets')=1,
  'Media manifests exclude unrelated, local and disabled assets without duplicating an olfactory/gallery image');
reset role;
select set_config('request.jwt.claims','{"sub":"96000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role aro_catalog_admin_executor;
select aroma_media_query_test.ok(
  bool_and(private.admin_product_document(p.id)->'mediaAssets'=aroma_media_query_test.legacy_assets(p.id)),
  'Administrative product manifests preserve the same legacy membership and rendition JSON')
from app.products p where p.id::text like '96300000-%';
reset role;
set local role anon;
select aroma_media_query_test.ok(
  jsonb_array_length(api.catalog_product('media-query-one')->'mediaAssets')=2,
  'Public catalog RPC keeps the existing bounded media projection');
reset role;
update app.products set active=false where id='96300000-0000-4000-8000-000000000001';
set constraints all immediate;
set local role anon;
select aroma_media_query_test.ok(api.catalog_product('media-query-one') is null,
  'Optimized media lookup does not publish a private product');
reset role;
rollback;
