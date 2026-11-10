-- Isolated fixtures: no R2 network and no claim that decoding is tested by SQL.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Only the isolated local SQL runner may load media fixtures.';
  end if;
end $$;
create schema aroma_media_test;
grant usage on schema aroma_media_test to anon,authenticated,service_role,aro_catalog_admin_executor;
create function aroma_media_test.ok(p_value boolean,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %',p_label; end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_media_test.error(p_sql text,p_state text,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
declare v_state text;
begin
  begin execute p_sql; exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
  if v_state is distinct from p_state then raise exception 'FAIL: %, expected %, got %',p_label,p_state,coalesce(v_state,'success'); end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_media_test.metadata(p_id uuid,p_hash text default repeat('a',64),p_width integer default 1600,p_height integer default 2000)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('width',p_width,'height',p_height,'mimeType','image/webp','byteSize',2000,
    'sha256',p_hash,'objectKey','public/dynamic/'||p_id::text||'/'||p_hash||'/'||p_width::text||'.webp',
    'variants',jsonb_build_array(
      jsonb_build_object('width',480,'height',600,'mimeType','image/webp','byteSize',500,'sha256',repeat('b',64),
        'objectKey','public/dynamic/'||p_id::text||'/'||p_hash||'/480.webp'),
      jsonb_build_object('width',p_width,'height',p_height,'mimeType','image/webp','byteSize',2000,'sha256',p_hash,
        'objectKey','public/dynamic/'||p_id::text||'/'||p_hash||'/'||p_width::text||'.webp')));
$$;
create function aroma_media_test.product(p_id uuid,p_gallery text,p_olfactory text default null)
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('product',jsonb_build_object('id',p_id,'name','SQL media fixture','slug','media-'||p_id::text,
    'brandId','52000000-0000-4000-8000-000000000001','productType','perfume','family','Floral','olfactoryFamilies',jsonb_build_array('floral'),
    'image',p_gallery,'variants',jsonb_build_array(jsonb_build_object('id',p_id,'ml',50,'priceCents',30000,'stock',2,'active',true)),'discount',null),
    'detail',jsonb_build_object('shortDescription','SQL-only fixture','description','SQL-only fixture not commercial',
      'olfactoryImage',p_olfactory,'intensityLevel',null,'notes',jsonb_build_object('top','[]'::jsonb,'heart','[]'::jsonb,'base','[]'::jsonb),
      'gallery',jsonb_build_array(jsonb_build_object('image',p_gallery,'framing','full')),'recommendationIds','[]'::jsonb),
    'active',true,'gender','unisex','popularity',0,'newest',0,'lowStockThreshold',2);
$$;
grant execute on all functions in schema aroma_media_test to anon,authenticated,service_role,aro_catalog_admin_executor;
create table aroma_media_test.ids(name text primary key,id uuid not null);
grant select,insert on aroma_media_test.ids to authenticated,service_role;
grant select on aroma_media_test.ids to anon;
insert into auth.users(id,email,raw_user_meta_data) values
 ('51000000-0000-4000-8000-000000000001','media-admin@example.invalid','{}'),
 ('51000000-0000-4000-8000-000000000002','media-other-admin@example.invalid','{}'),
 ('51000000-0000-4000-8000-000000000003','media-customer@example.invalid','{"role":"admin"}');
insert into private.admin_memberships(user_id,active) values
 ('51000000-0000-4000-8000-000000000001',true),('51000000-0000-4000-8000-000000000002',true);
insert into app.brands(id,name,slug) values('52000000-0000-4000-8000-000000000001','Media fixture brand','media-fixture-brand');

select aroma_media_test.ok(not exists(select 1 from pg_roles where rolname='aro_media_executor' and (rolcanlogin or rolsuper or rolbypassrls or rolinherit or rolcreaterole)), 'Media executor has no login or bypass');
select aroma_media_test.ok(not has_table_privilege('authenticated','app.media_assets','insert,update')
  and not has_table_privilege('authenticated','app.media_renditions','select,insert,update'), 'Browser roles have no raw media CRUD');
select aroma_media_test.ok(not has_function_privilege('authenticated','api.media_upload_complete(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('anon','api.media_gc_claim(integer)','execute'), 'Only server may confirm metadata or claim cleanup');
select aroma_media_test.ok(not has_column_privilege('aro_catalog_admin_executor','app.media_assets','verified_at','update')
  and has_column_privilege('aro_catalog_admin_executor','app.media_assets','retire_after','update'), 'Catalog can coordinate retention without verifying images');
set local role anon;
select aroma_media_test.error('select api.media_upload_reserve(''53000000-0000-4000-8000-000000000001'',''product-gallery'')','42501','Anonymous cannot reserve uploads');
select aroma_media_test.ok(api.media_public_asset('54000000-0000-4000-8000-000000000001') is null,'Unknown public media returns no metadata');
reset role;
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
set local role authenticated;
select aroma_media_test.error('select api.media_upload_reserve(''53000000-0000-4000-8000-000000000001'',''product-gallery'')','42501','Customer metadata cannot authorize uploads');
reset role;
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_media_test.error('select api.media_upload_reserve(''53000000-0000-4000-8000-000000000001'',''product-gallery'')','42501','Upload reservation requires MFA');
reset role;
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_media_test.ids select 'gallery',(api.media_upload_reserve('53000000-0000-4000-8000-000000000001','product-gallery')->>'id')::uuid;
insert into aroma_media_test.ids select 'olfactory',(api.media_upload_reserve('53000000-0000-4000-8000-000000000002','product-olfactory')->>'id')::uuid;
insert into aroma_media_test.ids select 'orphan',(api.media_upload_reserve('53000000-0000-4000-8000-000000000003','product-gallery')->>'id')::uuid;
insert into aroma_media_test.ids select 'pending',(api.media_upload_reserve('53000000-0000-4000-8000-000000000004','product-gallery')->>'id')::uuid;
select aroma_media_test.ok((api.media_upload_reserve('53000000-0000-4000-8000-000000000001','product-gallery')->>'id')::uuid=(select id from aroma_media_test.ids where name='gallery'),'Reservation retry returns the same asset');
select aroma_media_test.error('select api.media_upload_reserve(''53000000-0000-4000-8000-000000000001'',''product-olfactory'')','PT409','An operation cannot change its placement');
select aroma_media_test.ok(api.media_upload_status('53000000-0000-4000-8000-000000000001')->>'status'='pending','Owner can inspect pending upload status');
select aroma_media_test.error('select api.media_upload_complete((select id from aroma_media_test.ids where name=''gallery''),''51000000-0000-4000-8000-000000000001'', ''{}'')','42501','Administrator cannot forge verified metadata directly');
reset role;
select aroma_media_test.ok((select width is null and height is null and mime_type is null and object_key is null and verified_at is null from app.media_assets where id=(select id from aroma_media_test.ids where name='pending')),'Pending uploads contain no invented dimensions or keys');
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
set local role authenticated;
select aroma_media_test.error('select api.media_upload_reserve(''53000000-0000-4000-8000-000000000001'',''product-gallery'')','42501','Another administrator cannot take over the operation');
select aroma_media_test.ok(api.media_upload_status('53000000-0000-4000-8000-000000000001') is null,'Another administrator cannot inspect owner upload metadata');
reset role;
set local role service_role;
select aroma_media_test.error('select api.media_upload_complete((select id from aroma_media_test.ids where name=''gallery''),''51000000-0000-4000-8000-000000000002'',aroma_media_test.metadata((select id from aroma_media_test.ids where name=''gallery'')))','42501','Server receipt must match the reserved actor');
select aroma_media_test.error('select api.media_upload_complete((select id from aroma_media_test.ids where name=''gallery''),''51000000-0000-4000-8000-000000000001'',aroma_media_test.metadata((select id from aroma_media_test.ids where name=''gallery'')))','PT409','A stored receipt must first reserve its immutable bytes');
select aroma_media_test.error('select api.media_upload_prepare((select id from aroma_media_test.ids where name=''gallery''),''51000000-0000-4000-8000-000000000001'',jsonb_set(aroma_media_test.metadata((select id from aroma_media_test.ids where name=''gallery'')),''{objectKey}'',''"https://arbitrary.invalid/fake.webp"''))','22023','Server metadata cannot register an arbitrary URL');
select aroma_media_test.error('select api.media_upload_prepare((select id from aroma_media_test.ids where name=''gallery''),''51000000-0000-4000-8000-000000000001'',jsonb_set(aroma_media_test.metadata((select id from aroma_media_test.ids where name=''gallery'')),''{byteSize}'',''5000000''))','22023','Oversized verified metadata is rejected');
select aroma_media_test.error('select api.media_upload_prepare((select id from aroma_media_test.ids where name=''gallery''),''51000000-0000-4000-8000-000000000001'',aroma_media_test.metadata((select id from aroma_media_test.ids where name=''gallery''),repeat(''a'',64),800,800))','22023','Gallery dimensions must retain the approved ratio');
select api.media_upload_prepare((select id from aroma_media_test.ids where name='gallery'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='gallery')));
select aroma_media_test.error('select api.media_upload_prepare((select id from aroma_media_test.ids where name=''gallery''),''51000000-0000-4000-8000-000000000001'',aroma_media_test.metadata((select id from aroma_media_test.ids where name=''gallery''),repeat(''c'',64)))','PT409','Prepared content cannot change before upload completes');
select aroma_media_test.ok(api.media_upload_complete((select id from aroma_media_test.ids where name='gallery'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='gallery')))->>'src' like '/media/public/dynamic/%/1600.webp','Verified receipt returns a managed permanent source');
select aroma_media_test.ok(jsonb_array_length(api.media_upload_complete((select id from aroma_media_test.ids where name='gallery'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='gallery')))->'variants')=2,'Identical confirmation retry preserves exact renditions');
select aroma_media_test.error('select api.media_upload_complete((select id from aroma_media_test.ids where name=''gallery''),''51000000-0000-4000-8000-000000000001'',aroma_media_test.metadata((select id from aroma_media_test.ids where name=''gallery''),repeat(''c'',64)))','PT409','Retry cannot replace an immutable image with other bytes');
select api.media_upload_prepare((select id from aroma_media_test.ids where name='olfactory'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='olfactory')));
select api.media_upload_complete((select id from aroma_media_test.ids where name='olfactory'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='olfactory')));
select api.media_upload_prepare((select id from aroma_media_test.ids where name='orphan'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='orphan')));
select api.media_upload_complete((select id from aroma_media_test.ids where name='orphan'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='orphan')));
reset role;
select aroma_media_test.ok((select count(*)=6 from app.media_renditions),'Only actual confirmed renditions are stored');
update app.media_assets set retire_after=now()-interval '1 hour' where id=(select id from aroma_media_test.ids where name='pending');
set local role service_role;
select api.media_upload_prepare((select id from aroma_media_test.ids where name='pending'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='pending')));
reset role;
select aroma_media_test.ok((select width is null and prepared_metadata is not null and retire_after>now()+interval '23 hours'
  from app.media_assets where id=(select id from aroma_media_test.ids where name='pending')),'Preparing an active retry renews pending retention without claiming uploaded bytes');
set local role anon;
select aroma_media_test.ok(jsonb_array_length(api.media_public_asset((select id from aroma_media_test.ids where name='gallery'))->'variants')=2,'Anonymous public manifest exposes verified derivatives only');
select aroma_media_test.ok(not(api.media_public_asset((select id from aroma_media_test.ids where name='gallery')) ? 'uploader_id')
  and not(api.media_public_asset((select id from aroma_media_test.ids where name='gallery')) ? 'operationId'),'Public manifest excludes operator and upload-operation metadata');
select aroma_media_test.ok(api.media_public_asset((select id from aroma_media_test.ids where name='pending')) is null,'Pending upload has no public manifest');
reset role;
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_media_test.ok(api.admin_save_product(aroma_media_test.product('55000000-0000-4000-8000-000000000001',
  api.media_public_asset((select id from aroma_media_test.ids where name='gallery'))->>'src',
  api.media_public_asset((select id from aroma_media_test.ids where name='olfactory'))->>'src'))->'record'->'product'->>'image' like '/media/public/dynamic/%','Product save accepts existing managed media references');
select aroma_media_test.ok(jsonb_array_length(api.catalog_product('media-55000000-0000-4000-8000-000000000001')->'mediaAssets')=2,'Public product DTO includes verified gallery and separate olfactory manifests');
select aroma_media_test.ok(jsonb_array_length(api.admin_catalog_page()->'products'->0->'mediaAssets')=2,'Administrative DTO shares the same verified manifests');
reset role;
select aroma_media_test.ok((select retire_after is null from app.media_assets where id=(select id from aroma_media_test.ids where name='gallery')),'Referenced media loses its orphan-retirement deadline');
update app.media_assets set retire_after=now()-interval '1 hour' where id in (select id from aroma_media_test.ids);
set local role service_role;
select aroma_media_test.ok(jsonb_array_length(api.media_gc_claim())=2,'Cleanup claims expired unreferenced assets but preserves gallery and olfactory links');
reset role;
select aroma_media_test.ok((select count(*)=2 from app.media_assets where status='deleting'),'Claimed uploads become terminally unavailable for new associations');
select aroma_media_test.ok((select status='ready' from app.media_assets where id=(select id from aroma_media_test.ids where name='gallery')),'Cleanup cannot retire an attached gallery');
set local role anon;
select aroma_media_test.ok(api.media_public_asset((select id from aroma_media_test.ids where name='orphan')) is null,'Claimed media disappears from public delivery metadata');
reset role;
select set_config('request.jwt.claims','{"sub":"51000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
select aroma_media_test.error('select api.admin_save_product(aroma_media_test.product(''55000000-0000-4000-8000-000000000002'',''/media/public/dynamic/''||(select id::text from aroma_media_test.ids where name=''orphan'')||''/''||repeat(''a'',64)||''/1600.webp''))','22023','A claimed orphan cannot be attached by a concurrent editor');
select aroma_media_test.error('select api.media_upload_reserve(''53000000-0000-4000-8000-000000000003'',''product-gallery'')','PT409','A claimed operation cannot be revived by upload retry');
reset role;
update app.media_assets set deletion_lease_until=now()-interval '1 minute' where status='deleting';
insert into aroma_media_test.ids select 'original-claim',deletion_claim_id from app.media_assets where id=(select id from aroma_media_test.ids where name='orphan');
set local role service_role;
select aroma_media_test.ok((select (entry->>'claimId')::uuid=(select id from aroma_media_test.ids where name='original-claim')
  from jsonb_array_elements(api.media_gc_claim()) entry where (entry->>'id')::uuid=(select id from aroma_media_test.ids where name='orphan')),'Expired leases retain their immutable deletion identity');
select aroma_media_test.error('select api.media_gc_finalize((select id from aroma_media_test.ids where name=''orphan''),''56000000-0000-4000-8000-000000000001'')','PT409','Cleanup finalization requires the matching claim');
select api.media_gc_finalize((select id from aroma_media_test.ids where name='orphan'),(select id from aroma_media_test.ids where name='original-claim'));
select api.media_gc_finalize((select id from aroma_media_test.ids where name='orphan'),(select id from aroma_media_test.ids where name='original-claim'));
reset role;
select aroma_media_test.ok((select status='deleted' and deleted_at is not null from app.media_assets where id=(select id from aroma_media_test.ids where name='orphan')),'Repeated cleanup finalization preserves a deletion tombstone');
set local role authenticated;
select api.admin_delete_product('55000000-0000-4000-8000-000000000001',1);
reset role;
select aroma_media_test.ok((select retire_after>now()+interval '6 days' from app.media_assets where id=(select id from aroma_media_test.ids where name='gallery')),'Removing the final product link starts the seven-day recovery period');
set local role authenticated;
insert into aroma_media_test.ids select 'rounded',(api.media_upload_reserve('53000000-0000-4000-8000-000000000005','product-gallery')->>'id')::uuid;
reset role;
set local role service_role;
select aroma_media_test.error('select api.media_upload_prepare((select id from aroma_media_test.ids where name=''rounded''),''51000000-0000-4000-8000-000000000001'',aroma_media_test.metadata((select id from aroma_media_test.ids where name=''rounded''),repeat(''a'',64),801,1006))','22023','Pixel rounding does not allow a distorted aspect ratio');
select aroma_media_test.ok(api.media_upload_prepare((select id from aroma_media_test.ids where name='rounded'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='rounded'),repeat('a',64),801,1001))->>'status'='pending','A rounded 801px master can be prepared without enlargement');
select aroma_media_test.ok(api.media_upload_complete((select id from aroma_media_test.ids where name='rounded'),'51000000-0000-4000-8000-000000000001',aroma_media_test.metadata((select id from aroma_media_test.ids where name='rounded'),repeat('a',64),801,1001))->>'width'='801','Confirmation accepts the same integer-pixel rounding as image preparation');
reset role;
update private.admin_memberships set active=false where user_id='51000000-0000-4000-8000-000000000001';
set local role service_role;
select aroma_media_test.error('select api.media_upload_complete((select id from aroma_media_test.ids where name=''pending''),''51000000-0000-4000-8000-000000000001'',aroma_media_test.metadata((select id from aroma_media_test.ids where name=''pending'')))','42501','Revoked membership blocks pending verification receipts');
reset role;
set constraints all immediate;
-- Model only the restricted database privileges of an Auth deletion. This is
-- not an emulation of GoTrue; hosted tests verify its real administrative API.
create role aroma_auth_delete_test nologin noinherit nobypassrls;
grant aroma_auth_delete_test to postgres;
grant usage on schema auth to aroma_auth_delete_test;
grant select,delete on auth.users to aroma_auth_delete_test;
set local role aroma_auth_delete_test;
delete from auth.users where id='51000000-0000-4000-8000-000000000001';
reset role;
select aroma_media_test.ok(not exists(select 1 from auth.users where id='51000000-0000-4000-8000-000000000001'),'A restricted Auth deletion can remove the temporary uploader');
select aroma_media_test.ok(not exists(select 1 from app.media_assets where uploader_id='51000000-0000-4000-8000-000000000001'),'Deleting an uploader clears identity references without invalidating permanent assets');
rollback;
