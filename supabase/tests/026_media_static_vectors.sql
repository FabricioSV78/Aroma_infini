-- Metadata/authorization contracts only; static SVG sanitization runs in Worker tests.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Only isolated SQL fixtures';end if;end $$;
create schema aroma_vector_test;
grant usage on schema aroma_vector_test to anon,authenticated,service_role;
create function aroma_vector_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_vector_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end $$;
create function aroma_vector_test.id(value integer) returns uuid language sql immutable set search_path='' as $$
select ('d1260000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid $$;
create function aroma_vector_test.manifest() returns jsonb language sql immutable set search_path='' as $$
select jsonb_build_object('width',774,'height',374,'byteSize',2000,'sha256',repeat('a',64)) $$;
grant execute on all functions in schema aroma_vector_test to anon,authenticated,service_role;
create table aroma_vector_test.saved(key text primary key,value jsonb);
grant select,insert on aroma_vector_test.saved to anon,authenticated,service_role;
insert into auth.users(id,email) values(aroma_vector_test.id(1),'vector-admin@example.invalid'),(aroma_vector_test.id(2),'vector-other-admin@example.invalid');
insert into private.admin_memberships(user_id) values(aroma_vector_test.id(1)),(aroma_vector_test.id(2));
insert into app.brands(id,name,slug) values(aroma_vector_test.id(3),'Vector fixture brand','vector-fixture-brand');
insert into aroma_vector_test.saved select 'settings',to_jsonb(version) from app.store_settings where singleton;
select aroma_vector_test.ok(not has_function_privilege('authenticated','api.media_upload_prepare_svg(uuid,uuid,jsonb)','execute')
 and not has_function_privilege('authenticated','api.media_upload_complete_svg(uuid,uuid,jsonb)','execute')
 and not has_function_privilege('anon','api.media_upload_complete_svg(uuid,uuid,jsonb)','execute')
 and has_function_privilege('service_role','api.media_upload_complete_svg(uuid,uuid,jsonb)','execute'),
 'SVG receipts are exclusively admitted and completed by the verified Worker');
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_vector_test.id(1),'aal','aal2')::text,true);
set local role authenticated;
insert into aroma_vector_test.saved values('upload',api.media_upload_reserve(aroma_vector_test.id(10),'site-vector'));
insert into aroma_vector_test.saved values('invalid',api.media_upload_reserve(aroma_vector_test.id(11),'site-vector'));
insert into aroma_vector_test.saved values('image',api.media_upload_reserve(aroma_vector_test.id(12),'site-image'));
select aroma_vector_test.error('select api.media_upload_prepare_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''upload''),aroma_vector_test.id(1),aroma_vector_test.manifest())',
 '42501','Even an administrator cannot forge a verified SVG preparation');
select aroma_vector_test.error('select api.media_upload_complete_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''upload''),aroma_vector_test.id(1),aroma_vector_test.manifest())',
 '42501','Even an administrator cannot forge a verified SVG completion');
reset role;
set local role service_role;
select aroma_vector_test.error('select api.media_upload_complete_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''upload''),aroma_vector_test.id(1),aroma_vector_test.manifest())',
 'PT409','SVG completion requires an existing immutable preparation receipt');
select aroma_vector_test.error('select api.media_upload_prepare_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''upload''),aroma_vector_test.id(2),aroma_vector_test.manifest())',
 '42501','A server receipt must belong to the administrator who reserved the SVG');
select aroma_vector_test.error('select api.media_upload_prepare_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''image''),aroma_vector_test.id(1),aroma_vector_test.manifest())',
 '22023','SVG receipt APIs cannot confirm a raster upload operation');
select aroma_vector_test.error('select api.media_upload_prepare_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''invalid''),aroma_vector_test.id(1),aroma_vector_test.manifest()||jsonb_build_object(''url'',''https://arbitrary.invalid''))',
 '22023','SVG receipts contain only exact verified dimensions, bytes and SHA256');
select aroma_vector_test.error('select api.media_upload_prepare_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''invalid''),aroma_vector_test.id(1),jsonb_set(aroma_vector_test.manifest(),''{width}'',''4097''))',
 '22023','SVG dimensions remain bounded');
select aroma_vector_test.error('select api.media_upload_prepare_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''invalid''),aroma_vector_test.id(1),jsonb_set(aroma_vector_test.manifest(),''{byteSize}'',''524289''))',
 '22023','SVG byte size remains bounded');
select api.media_upload_prepare_svg((select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'),aroma_vector_test.id(1),aroma_vector_test.manifest());
select aroma_vector_test.error('select api.media_upload_complete_svg((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''upload''),aroma_vector_test.id(1),jsonb_set(aroma_vector_test.manifest(),''{sha256}'',to_jsonb(repeat(''b'',64))))',
 'PT409','Completion cannot replace the bytes reserved by a different SVG receipt');
insert into aroma_vector_test.saved values('asset',api.media_upload_complete_svg((select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'),aroma_vector_test.id(1),aroma_vector_test.manifest()));
select aroma_vector_test.ok(api.media_upload_complete_svg((select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'),aroma_vector_test.id(1),aroma_vector_test.manifest())
 =(select value from aroma_vector_test.saved where key='asset'),'Identical SVG confirmation retries preserve the immutable manifest');
reset role;
select aroma_vector_test.ok((select status='ready' and mime_type='image/svg+xml' and retire_after>clock_timestamp()+interval '23 hours'
 and retire_after<=clock_timestamp()+interval '24 hours' from app.media_assets where id=(select (value->>'id')::uuid from aroma_vector_test.saved where key='upload')),
 'A standalone verified SVG receives the same 24-hour unused cleanup window');
select aroma_vector_test.ok(not exists(select 1 from app.media_renditions where asset_id=(select (value->>'id')::uuid from aroma_vector_test.saved where key='upload')),
 'Vector receipts never invent WebP derivatives');
set local role anon;
select aroma_vector_test.ok(api.media_public_asset((select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'))->>'mimeType'='image/svg+xml'
 and api.media_public_asset((select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'))->>'src' like '/media/public/dynamic/%/vector.svg'
 and not(api.media_public_asset((select (value->>'id')::uuid from aroma_vector_test.saved where key='upload')) ? 'variants'),
 'Public SVG manifests expose the verified immutable vector path without raster variants');
reset role;
set local role authenticated;
select aroma_vector_test.ok(api.admin_media_detail((select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'))->'asset'->>'mimeType'='image/svg+xml'
 and api.admin_media_detail((select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'))->>'section'='identity',
 'The central library identifies vectors using their actual MIME and identity section');
select api.admin_save_site_media('identity.logo',(select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'),'Brand identity',1);
select aroma_vector_test.error('select api.admin_save_site_media(''about.story'',(select (value->>''id'')::uuid from aroma_vector_test.saved where key=''upload''),''Not a raster image'',1)',
 '22023','SVGs can occupy the identity slot but cannot replace photographic site imagery');
select aroma_vector_test.error('select api.admin_media_retire((select (value->>''id'')::uuid from aroma_vector_test.saved where key=''upload''),1)',
 'PT409','The active identity logo protects its verified vector from retirement');
reset role;
select aroma_vector_test.ok(not private.media_placement_compatible('image/svg+xml',774,374,'category')
 and not private.media_placement_compatible('image/svg+xml',774,374,'hero-desktop')
 and not private.media_placement_compatible('image/svg+xml',774,374,'product-gallery'),
 'Photographic placement profiles reject SVG vectors');

create function aroma_vector_test.product() returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('product',jsonb_build_object('id',aroma_vector_test.id(20),'name','Vector rejection fixture','slug','vector-rejection-fixture',
 'brandId',aroma_vector_test.id(3),'productType','perfume','family','Floral','olfactoryFamilies',jsonb_build_array('floral'),
 'image',(select value->>'src' from aroma_vector_test.saved where key='asset'),'variants',jsonb_build_array(jsonb_build_object('id',aroma_vector_test.id(21),'ml',50,'priceCents',1000,'stock',1,'active',true)),'discount',null),
 'detail',jsonb_build_object('shortDescription','SQL fixture','description','SQL fixture','olfactoryImage',null,'intensityLevel',null,
 'notes',jsonb_build_object('top','[]'::jsonb,'heart','[]'::jsonb,'base','[]'::jsonb),'recommendationIds','[]'::jsonb,
 'gallery',jsonb_build_array(jsonb_build_object('image',(select value->>'src' from aroma_vector_test.saved where key='asset'),'framing','full'))),
 'active',false,'gender','unisex','popularity',0,'newest',0,'lowStockThreshold',2) $$;
create function aroma_vector_test.home() returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('featuredBrandId',null,'announcement',jsonb_build_object('deliveryText','SQL fixture','freeShippingLabel','SQL fixture'),
 'hero',(select jsonb_agg(jsonb_build_object('eyebrow','SQL fixture','title','SQL fixture','description','SQL fixture','cta','SQL fixture','alt','SQL fixture',
 'desktopImage',(select value->>'id' from aroma_vector_test.saved where key='upload'),'mobileImage',null)) from generate_series(1,5)),
 'film',jsonb_build_object('eyebrow','SQL fixture','title','SQL fixture','description','SQL fixture','cta','SQL fixture','video',null,'poster',null,'mobileVideo',null,'mobilePoster',null),
 'finder',jsonb_build_object('eyebrow','SQL fixture','title','SQL fixture','description','SQL fixture','cta','SQL fixture','desktopImage',null,'mobileImage',null,
 'entryLabel','SQL fixture','entryQuestion','SQL fixture','modalTitle','SQL fixture','steps',(select jsonb_object_agg(k,jsonb_build_object('label','SQL fixture','question','SQL fixture','description','SQL fixture'))
 from unnest(array['family','occasion','intensity','budget']) k),'optionLabels',jsonb_build_object('family',jsonb_build_object('floral','SQL fixture'),'occasion','{}'::jsonb,'intensity','{}'::jsonb),
 'enabledOptions',jsonb_build_object('family',jsonb_build_array('floral'),'occasion',null,'intensity',null),
 'familyVisuals',jsonb_build_object('floral',jsonb_build_object('description','SQL fixture','image',null)),
 'noPreferenceLabel','SQL fixture','budgets',jsonb_build_array(100,400,600),'budgetNoLimitLabel','SQL fixture',
 'resultCopy',(select jsonb_object_agg(k,jsonb_build_object('title','SQL fixture','description','SQL fixture')) from unnest(array['matches','partial','budget','empty','unavailable','preferences']) k),
 'singleResultTitle','SQL fixture')) $$;
grant execute on function aroma_vector_test.product(),aroma_vector_test.home() to authenticated;
set local role authenticated;
select aroma_vector_test.error('select api.admin_save_product(aroma_vector_test.product(),null)',
 '22023','The real product save command rejects a verified SVG gallery image');
select aroma_vector_test.error('select api.admin_save_home(''{"hombre":null,"mujer":null,"unisex":null,"complementos":null}''::jsonb,aroma_vector_test.home(),0,
 (select (value#>>''{}'')::bigint from aroma_vector_test.saved where key=''settings''),false,null)',
 '22023','The real Home save command rejects a verified SVG hero image');
select api.admin_save_site_media('identity.logo',null,'',2);
reset role;
select aroma_vector_test.ok((select retire_after>clock_timestamp()+interval '23 hours' and retire_after<=clock_timestamp()+interval '24 hours'
 from app.media_assets where id=(select (value->>'id')::uuid from aroma_vector_test.saved where key='upload')),
 'Removing the last vector identity placement schedules the full recovery window');
set local role authenticated;
select api.admin_save_media_alias('/brand/logo-on-light.svg',(select (value->>'id')::uuid from aroma_vector_test.saved where key='upload'),1);
reset role;
update app.media_assets set retire_after=clock_timestamp()-interval '1 second' where id=(select (value->>'id')::uuid from aroma_vector_test.saved where key='upload');
set local role service_role;
select aroma_vector_test.ok(not exists(select 1 from jsonb_array_elements(api.media_gc_claim(50)) c where c->>'id'=(select value->>'id' from aroma_vector_test.saved where key='upload')),
 'A whitelisted built-in identity alias protects the exact SVG bytes from GC');
reset role;
select aroma_vector_test.ok(not exists(select 1 from app.products where id=aroma_vector_test.id(20))
 and not exists(select 1 from app.home_document),'Rejected vector placement attempts roll back every partial product and Home mutation');
set constraints all immediate;
rollback;
