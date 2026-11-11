-- Disposable contracts only. No network, R2 bytes, or hosted identities.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Only isolated SQL fixtures';end if;end $$;
create schema aroma_library_test;
grant usage on schema aroma_library_test to anon,authenticated,service_role;
create function aroma_library_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_library_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end $$;
create function aroma_library_test.id(value integer) returns uuid language sql immutable set search_path='' as $$
select ('d1240000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid $$;
create function aroma_library_test.metadata(asset uuid,width integer default 1600,height integer default 2000) returns jsonb language sql immutable set search_path='' as $$
select jsonb_build_object('width',width,'height',height,'mimeType','image/webp','byteSize',2000,'sha256',repeat('a',64),
 'objectKey','public/dynamic/'||asset::text||'/'||repeat('a',64)||'/'||width::text||'.webp','variants',jsonb_build_array(jsonb_build_object(
 'width',width,'height',height,'mimeType','image/webp','byteSize',2000,'sha256',repeat('a',64),
 'objectKey','public/dynamic/'||asset::text||'/'||repeat('a',64)||'/'||width::text||'.webp'))) $$;
grant execute on all functions in schema aroma_library_test to anon,authenticated,service_role;
create table aroma_library_test.saved(key text primary key,value jsonb);
grant select,insert,update on aroma_library_test.saved to anon,authenticated,service_role;
insert into auth.users(id,email,encrypted_password) values
 (aroma_library_test.id(1),'library-admin@example.invalid','fixture-password'),
 (aroma_library_test.id(2),'library-customer@example.invalid','fixture-password');
insert into private.admin_memberships(user_id) values(aroma_library_test.id(1));

select aroma_library_test.ok(not has_table_privilege('authenticated','app.media_library','select,insert,update,delete')
 and not has_table_privilege('anon','app.site_media_slots','select,insert,update,delete')
 and not has_table_privilege('service_role','private.media_lifecycle_events','select,insert,update,delete'),
 'Library, site placements and lifecycle history expose no raw browser/server table CRUD');
select aroma_library_test.ok(not has_function_privilege('authenticated','api.media_gc_recheck(uuid,uuid)','execute')
 and not has_function_privilege('anon','api.media_gc_failure(uuid,uuid,text)','execute')
 and has_function_privilege('service_role','api.media_gc_recheck(uuid,uuid)','execute'),
 'Only the verified Worker can authorize physical cleanup and report its failures');
select aroma_library_test.ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in(
 'app.media_library'::regclass,'app.site_media_slots'::regclass,'private.media_lifecycle_events'::regclass)),
 'Every new metadata, placement and event table forces RLS');
set local role anon;
select aroma_library_test.error('select api.admin_media_library()','42501','Anonymous cannot list the media library');
select aroma_library_test.ok(jsonb_array_length(api.site_media_document()->'items')=9,'Public slot inventory includes empty rows for cache invalidation');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_library_test.id(2),'aal','aal2')::text,true);
set local role authenticated;
select aroma_library_test.error('select api.admin_media_library()','42501','Customer AAL2 cannot list the media library');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_library_test.id(1),'aal','aal1')::text,true);
set local role authenticated;
select aroma_library_test.error('select api.admin_media_library()','42501','Untrusted administrative AAL1 cannot list the media library');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_library_test.id(1),'aal','aal2')::text,true);
set local role authenticated;
insert into aroma_library_test.saved values('upload',api.media_upload_reserve(aroma_library_test.id(10),'site-image'));
select aroma_library_test.ok((api.admin_media_library()->'items'->0->>'state')='pending'
 and api.admin_media_library()->'items'->0->'asset'='null'::jsonb,'Pending uploads have descriptive metadata but no fictitious manifest');
insert into aroma_library_test.saved values('metadata',api.admin_media_metadata(
 (select (value->>'id')::uuid from aroma_library_test.saved where key='upload'),'Library amber',repeat('a',500),'about',1));
select aroma_library_test.ok((select value->>'version'='2' and value->>'name'='Library amber' and char_length(value->>'alt')=500
 from aroma_library_test.saved where key='metadata'),'Bounded descriptive metadata has an independent optimistic version');
select aroma_library_test.ok(api.admin_media_library('amber','about','all',1,20)->>'total'='1','Indexed name search and section filters find the uploaded resource');
select aroma_library_test.error('select api.admin_media_library('''',''all'',''all'',1,51)','22023','Library page size is bounded');
select aroma_library_test.error('select api.admin_media_library('''',''all'',''all'',0,20)','22023','Library page numbers are bounded');
select aroma_library_test.error('select api.admin_media_metadata((select (value->>''id'')::uuid from aroma_library_test.saved where key=''upload''),''stale'','''',''other'',1)',
 'PT409','Stale metadata edits return deterministic HTTP conflicts');
reset role;
set local role service_role;
select api.media_upload_prepare((select (value->>'id')::uuid from aroma_library_test.saved where key='upload'),aroma_library_test.id(1),
 aroma_library_test.metadata((select (value->>'id')::uuid from aroma_library_test.saved where key='upload')));
select api.media_upload_complete((select (value->>'id')::uuid from aroma_library_test.saved where key='upload'),aroma_library_test.id(1),
 aroma_library_test.metadata((select (value->>'id')::uuid from aroma_library_test.saved where key='upload')));
reset role;
select aroma_library_test.ok((select status='ready' and retire_after>now()+interval '23 hours' and retire_after<=clock_timestamp()+interval '24 hours'
 from app.media_assets where id=(select (value->>'id')::uuid from aroma_library_test.saved where key='upload')),
 'A completed standalone library upload has the full 24-hour unused window');
select aroma_library_test.ok(not private.media_has_references((select (value->>'id')::uuid from aroma_library_test.saved where key='upload')),
 'Metadata and library visibility are deliberately not retention references');
select aroma_library_test.ok(private.media_placement_compatible('image/webp',1600,900,'finder-desktop')
 and private.media_placement_compatible('image/webp',960,1200,'category')
 and private.media_placement_compatible('image/webp',960,1200,'product-olfactory')
 and not private.media_placement_compatible('image/webp',1600,900,'category')
 and not private.media_placement_compatible('video/mp4',1600,900,'site-image'),
 'Reuse checks target dimensions and MIME rather than the original placement label');
select aroma_library_test.ok((select bool_and(
 private.site_image_compatible(slot,width,height,'image/webp')
 and not private.site_image_compatible(slot,width-1,height,'image/webp')
 and not private.site_image_compatible(slot,width,height-1,'image/webp'))
 from(values
 ('about.hero.desktop',1536,864),('about.hero.mobile',780,858),('about.story',960,1200),
 ('auth.customer.desktop',780,1170),('auth.customer.mobile',960,320),('identity.logo',774,374),
 ('seo.home',1200,630),('seo.catalog',1200,630),('seo.brands',1200,630)) quality(slot,width,height)),
 'Each site placement accepts its exact quality minimum and rejects either dimension one pixel below it');
select aroma_library_test.ok(not private.site_image_compatible('about.hero.desktop',2304,2400,'image/webp')
 and private.site_image_compatible('identity.logo',1,1,'image/svg+xml')
 and not private.site_image_compatible('about.story',1536,2000,'image/svg+xml'),
 'Slot quality retains the generic four-megapixel cap and resolution-independent identity vectors only');

insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256,retire_after)
 select aroma_library_test.id(i),'r2','public/dynamic/'||aroma_library_test.id(i)::text||'/'||repeat('a',64)||'/'||width::text||'.webp',
 'image/webp',width,height,'ready',now(),aroma_library_test.id(i+100),purpose,2000,repeat('a',64),now()+interval '24 hours'
 from (values(20,1600,900,'hero-desktop'),(21,960,1200,'category'),(22,800,1000,'product-gallery'),(23,64,32,'site-image')) f(i,width,height,purpose);
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
 select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id in(
 aroma_library_test.id(20),aroma_library_test.id(21),aroma_library_test.id(22),aroma_library_test.id(23));
insert into app.brands(id,name,slug) values(aroma_library_test.id(31),'Library fixture brand','library-fixture-brand');
insert into app.products(id,name,slug,brand_id,short_description,description,active)
 values(aroma_library_test.id(30),'Library product','library-product',aroma_library_test.id(31),'SQL fixture','SQL fixture',false);
insert into app.product_variants(id,product_id,ml,price_cents,stock,active)
 values(aroma_library_test.id(32),aroma_library_test.id(30),50,1000,1,false);
insert into app.product_images(product_id,position,media_id) values(aroma_library_test.id(30),0,aroma_library_test.id(21));
insert into app.home_document(singleton,media,content) values(true,'{}','{}');
insert into app.home_media(slot,media_id) values(array['content','hero','0','desktopImage'],aroma_library_test.id(20));
insert into app.orders(id,reference,operation_id,tracking_hash,request_hash,mode,first_name,last_name,email,phone,delivery_method,
 subtotal_cents,product_discount_cents,discount_cents,shipping_cents,total_cents,shipping_estimate,department,province,district,street)
 values(aroma_library_test.id(40),'AI-LIBRARY-TEST',aroma_library_test.id(41),repeat('a',64),repeat('b',64),'guest',
 'SQL','Fixture','library-order@example.invalid','912345678','courier',1000,0,0,0,1000,'SQL fixture','lima','1501','150131','SQL fixture');
insert into app.order_items(order_id,position,media_id,product_code,product_slug,image_source,product_name,brand_name,quantity,unit_price_cents,original_unit_price_cents)
 values(aroma_library_test.id(40),0,aroma_library_test.id(22),'SQL-LIB','library-history','/media/fixture','SQL historical image','SQL',1,1000,1000);
set constraints all immediate;set constraints all deferred;

set local role authenticated;
select aroma_library_test.error('select api.admin_save_site_media(''about.hero.desktop'',aroma_library_test.id(23),''Too small for this placement'',1)',
 '22023','A verified generic site image cannot bypass the hero placement quality minimum');
insert into aroma_library_test.saved values('site',api.admin_save_site_media('about.hero.desktop',
 (select (value->>'id')::uuid from aroma_library_test.saved where key='upload'),'Managed site image',1));
select aroma_library_test.ok((select i->>'version'='2' and i->>'assetId'=(select value->>'id' from aroma_library_test.saved where key='upload')
 from jsonb_array_elements(api.admin_site_media_document()->'items') i where i->>'slot'='about.hero.desktop'),
 'A site placement attaches a ready managed image and increments its slot version');
select aroma_library_test.error('select api.admin_save_site_media(''about.hero.desktop'',null,'''',1)','PT409','A stale site editor cannot overwrite newer placements');
select aroma_library_test.error('select api.admin_save_site_media(''unknown.slot'',null,'''',1)','22023','Site placement keys are a fixed allowlist');
select aroma_library_test.error('select api.admin_media_retire((select (value->>''id'')::uuid from aroma_library_test.saved where key=''upload''),2)',
 'PT409','An administrator cannot schedule a referenced site image for deletion');
select api.admin_save_site_media('about.hero.desktop',null,'',2);
reset role;
select aroma_library_test.ok((select retire_after>clock_timestamp()+interval '23 hours' and retire_after<=clock_timestamp()+interval '24 hours'
 from app.media_assets where id=(select (value->>'id')::uuid from aroma_library_test.saved where key='upload')),
 'Detaching the last site placement starts a fresh full 24-hour window');
set local role anon;
select aroma_library_test.ok((select i->'asset'='null'::jsonb and i->>'version'='3'
 from jsonb_array_elements(api.site_media_document()->'items') i where i->>'slot'='about.hero.desktop'),
 'Clearing a slot remains in the public document with its new version and null asset');
reset role;
set local role authenticated;
select api.admin_save_site_media('about.hero.desktop',(select (value->>'id')::uuid from aroma_library_test.saved where key='upload'),'Reused image',3);
reset role;
select aroma_library_test.ok((select retire_after is null from app.media_assets where id=(select (value->>'id')::uuid from aroma_library_test.saved where key='upload'))
 and exists(select 1 from private.media_lifecycle_events where asset_id=(select (value->>'id')::uuid from aroma_library_test.saved where key='upload') and event_type='cancelled'),
 'Committed reuse cancels scheduled cleanup under the shared asset row lock and audits cancellation');
set local role authenticated;
select api.admin_save_site_media('about.hero.desktop',null,'',4);
insert into aroma_library_test.saved values('retire',api.admin_media_retire((select (value->>'id')::uuid from aroma_library_test.saved where key='upload'),2));
select aroma_library_test.ok((select value->>'version'='3' and value->>'state'='unused' from aroma_library_test.saved where key='retire'),
 'Explicit retirement schedules a fresh window without deleting bytes or changing readiness');
select api.admin_save_site_media('about.story',aroma_library_test.id(21),'Shared product image',1);
reset role;
delete from app.product_images where product_id=aroma_library_test.id(30);
select aroma_library_test.ok((select retire_after is null from app.media_assets where id=aroma_library_test.id(21)),
 'Removing a product placement never retires an image still used by another site section');
set local role authenticated;
select aroma_library_test.ok(api.admin_media_detail(aroma_library_test.id(22))->>'useCount'='1'
 and api.admin_media_detail(aroma_library_test.id(22))->'usages'->0->>'label'='Pedido AI-LIBRARY-TEST',
 'Historical order image references appear in the central usage inventory');
select aroma_library_test.error('select api.admin_media_retire(aroma_library_test.id(22),1)','PT409','Historical order usage prevents administrative retirement');
reset role;
update app.media_assets set retire_after=clock_timestamp()-interval '1 second' where storage_kind='r2';
set local role service_role;
insert into aroma_library_test.saved values('claims',api.media_gc_claim(50));
select aroma_library_test.ok(jsonb_array_length((select value from aroma_library_test.saved where key='claims'))=2,
 'GC claims only expired unreferenced assets while preserving Home, site and historical orders');
reset role;
select aroma_library_test.ok((select bool_and(status='ready') from app.media_assets where id in(
 aroma_library_test.id(20),aroma_library_test.id(21),aroma_library_test.id(22))),
 'Every committed placement protects bytes even if its retirement timestamp is erroneously expired');
set local role authenticated;
select aroma_library_test.error('select api.admin_save_site_media(''about.hero.desktop'',(select (value->>''id'')::uuid from aroma_library_test.saved where key=''upload''),'''',5)',
 '22023','A terminally claimed asset cannot be attached through a site editor');
reset role;
set local role service_role;
select aroma_library_test.ok(not api.media_gc_recheck((select (value->>'id')::uuid from aroma_library_test.saved where key='upload'),aroma_library_test.id(99)),
 'A stale or forged deletion claim cannot authorize physical deletion');
select aroma_library_test.ok(api.media_gc_recheck((select (value->>'id')::uuid from aroma_library_test.saved where key='upload'),
 (select deletion->>'claimId' from aroma_library_test.saved s,jsonb_array_elements(s.value) deletion
 where s.key='claims' and deletion->>'id'=(select value->>'id' from aroma_library_test.saved where key='upload'))::uuid),
 'The matching terminal claim passes an immediate pre-deletion reference check');
select aroma_library_test.error('select api.media_gc_failure((select (value->>''id'')::uuid from aroma_library_test.saved where key=''upload''),
 (select (d->>''claimId'')::uuid from aroma_library_test.saved s,jsonb_array_elements(s.value) d where s.key=''claims'' limit 1),''https://secret.invalid'')',
 '22023','Failure reporting accepts bounded codes rather than provider bodies or URLs');
reset role;
insert into aroma_library_test.saved values('claim',(select d from aroma_library_test.saved s,jsonb_array_elements(s.value) d
 where s.key='claims' and d->>'id'=(select value->>'id' from aroma_library_test.saved where key='upload')));
set local role service_role;
select api.media_gc_failure((select (value->>'id')::uuid from aroma_library_test.saved where key='claim'),
 (select (value->>'claimId')::uuid from aroma_library_test.saved where key='claim'),'storage-delete');
reset role;
update app.media_assets set deletion_lease_until=clock_timestamp()-interval '1 second' where status='deleting';
set local role service_role;
select aroma_library_test.ok(exists(select 1 from jsonb_array_elements(api.media_gc_claim(50)) d
 where d->>'id'=(select value->>'id' from aroma_library_test.saved where key='claim')
 and d->>'claimId'=(select value->>'claimId' from aroma_library_test.saved where key='claim')),
 'Lease retries retain the immutable deletion identity so stale workers cannot target reused bytes');
select api.media_gc_finalize((select (value->>'id')::uuid from aroma_library_test.saved where key='claim'),(select (value->>'claimId')::uuid from aroma_library_test.saved where key='claim'));
select api.media_gc_finalize((select (value->>'id')::uuid from aroma_library_test.saved where key='claim'),(select (value->>'claimId')::uuid from aroma_library_test.saved where key='claim'));
reset role;
set local role authenticated;
select aroma_library_test.ok(api.admin_media_detail((select (value->>'id')::uuid from aroma_library_test.saved where key='claim'))->>'state'='deleted'
 and exists(select 1 from jsonb_array_elements(api.admin_media_detail((select (value->>'id')::uuid from aroma_library_test.saved where key='claim'))->'events') e
 where e->>'type'='failed' and e->>'code'='storage-delete'),
 'Deletion tombstones and sanitized failure history remain available for administrators');
reset role;
select aroma_library_test.ok((select count(*)=1 from private.media_lifecycle_events where asset_id=(select (value->>'id')::uuid from aroma_library_test.saved where key='claim') and event_type='deleted'),
 'Repeated finalization emits one deletion audit event');

-- Reuse the real trusted-device helper; never synthesize AAL2 to authorize UI.
insert into auth.mfa_factors(id,user_id,factor_type,status,secret) values(aroma_library_test.id(60),aroma_library_test.id(1),'totp','verified','fixture-only');
insert into auth.sessions(id,user_id,aal,factor_id) values(aroma_library_test.id(61),aroma_library_test.id(1),'aal2',aroma_library_test.id(60));
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_library_test.id(1),'session_id',aroma_library_test.id(61),'aal','aal2','amr',
 jsonb_build_array(jsonb_build_object('method','password'),jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
select api.admin_device_register(encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex'),'Library fixture');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_library_test.id(1),'session_id',aroma_library_test.id(61),'aal','aal1','amr',
 jsonb_build_array(jsonb_build_object('method','password')))::text,true);
set local role authenticated;
select aroma_library_test.ok(api.admin_device_resume(repeat('a',64))->>'trusted'='true',
 'A password session proves its trusted device before accessing media');
select aroma_library_test.ok(api.admin_media_library() ? 'items' and api.current_actor()->>'aal'='aal1',
 'Cookie-proven trusted AAL1 can access media through the established authorization helper');
reset role;
update private.admin_memberships set active=false where user_id=aroma_library_test.id(1);
set local role authenticated;
select aroma_library_test.error('select api.admin_media_library()','42501','Membership revocation immediately blocks remembered media administration');
reset role;
set constraints all immediate;
rollback;
