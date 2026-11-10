-- Disposable SQL contracts only: no hosted bucket or commercial content.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Only the isolated SQL runner may load Home fixtures.';end if;
end $$;
create schema aroma_home_test;
grant usage on schema aroma_home_test to anon,authenticated,service_role,aro_catalog_admin_executor;
create function aroma_home_test.ok(p_value boolean,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %',p_label;end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_home_test.error(p_sql text,p_state text,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
declare v_state text;
begin
  begin execute p_sql;exception when others then get stacked diagnostics v_state=returned_sqlstate;end;
  if v_state is distinct from p_state then raise exception 'FAIL: %, expected %, got %',p_label,p_state,coalesce(v_state,'success');end if;
  return 'PASS: '||p_label;
end $$;
create table aroma_home_test.saved(name text primary key,value jsonb not null);
create table aroma_home_test.ids(name text primary key,id uuid not null);
grant select,insert,update on aroma_home_test.saved,aroma_home_test.ids to authenticated,service_role;
grant select on aroma_home_test.saved,aroma_home_test.ids to anon;
create function aroma_home_test.content(p_images boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('featuredBrandId',null,
    'announcement',jsonb_build_object('deliveryText','SQL-only delivery fixture','freeShippingLabel','SQL-only free shipping fixture'),
    'hero',(select jsonb_agg(jsonb_build_object('eyebrow','SQL-only campaign','title','SQL-only title','description','SQL-only description',
      'cta','SQL-only action','alt','SQL-only image description',
      'desktopImage',case when p_images then (select id from aroma_home_test.ids where name='hero-desktop') end,
      'mobileImage',case when p_images then (select id from aroma_home_test.ids where name='hero-mobile') end)) from generate_series(1,5)),
    'film',jsonb_build_object('eyebrow','SQL-only film','title','SQL-only film title','description','SQL-only film description','cta','SQL-only film action',
      'video',case when p_images then (select id from aroma_home_test.ids where name='video') end,
      'poster',case when p_images then (select id from aroma_home_test.ids where name='poster') end,
      'mobileVideo',case when p_images then (select id from aroma_home_test.ids where name='video-mobile') end,
      'mobilePoster',case when p_images then (select id from aroma_home_test.ids where name='poster') end),
    'finder',jsonb_build_object('eyebrow','SQL-only finder','title','SQL-only finder title','description','SQL-only finder description','cta','SQL-only finder action',
      'desktopImage',case when p_images then (select id from aroma_home_test.ids where name='finder-desktop') end,
      'mobileImage',case when p_images then (select id from aroma_home_test.ids where name='finder-mobile') end,
      'entryLabel','SQL-only first choice','entryQuestion','SQL-only first question','modalTitle','SQL-only modal title',
      'steps',(select jsonb_object_agg(k,jsonb_build_object('label','SQL-only label','question','SQL-only question','description','SQL-only help'))
        from unnest(array['family','occasion','intensity','budget']) k),
      'optionLabels',jsonb_build_object('family',jsonb_build_object('floral','SQL-only floral label'),'occasion','{}'::jsonb,'intensity','{}'::jsonb),
      'enabledOptions',jsonb_build_object('family',jsonb_build_array('floral'),'occasion',null,'intensity',null),
      'familyVisuals',jsonb_build_object('floral',jsonb_build_object('description','SQL-only floral description',
        'image',case when p_images then (select id from aroma_home_test.ids where name='finder-option') end)),
      'noPreferenceLabel','SQL-only no preference','budgets',jsonb_build_array(100,400,600),'budgetNoLimitLabel','SQL-only no limit',
      'resultCopy',(select jsonb_object_agg(k,jsonb_build_object('title','SQL-only result','description','SQL-only result description'))
        from unnest(array['matches','partial','budget','empty','unavailable','preferences']) k),
      'singleResultTitle','SQL-only single result'));
$$;
create function aroma_home_test.media(p_images boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_object_agg(k,case when p_images then (select id from aroma_home_test.ids where name='category') end)
    from unnest(array['hombre','mujer','unisex','complementos']) k;
$$;
create function aroma_home_test.image(p_id uuid,p_width integer,p_height integer)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('width',p_width,'height',p_height,'mimeType','image/webp','byteSize',2000,'sha256',repeat('a',64),
    'objectKey','public/dynamic/'||p_id::text||'/'||repeat('a',64)||'/'||p_width::text||'.webp',
    'variants',jsonb_build_array(jsonb_build_object('width',p_width,'height',p_height,'mimeType','image/webp','byteSize',2000,
      'sha256',repeat('a',64),'objectKey','public/dynamic/'||p_id::text||'/'||repeat('a',64)||'/'||p_width::text||'.webp')));
$$;
create function aroma_home_test.video(p_mobile boolean default false)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('width',case when p_mobile then 720 else 1280 end,'height',case when p_mobile then 1280 else 720 end,
    'durationMs',12000,'byteSize',5242880,'sha256',repeat(case when p_mobile then 'c' else 'b' end,64));
$$;
grant execute on all functions in schema aroma_home_test to anon,authenticated,service_role,aro_catalog_admin_executor;
insert into auth.users(id,email,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','home-admin@example.invalid','{}'),
 ('91000000-0000-4000-8000-000000000002','home-customer@example.invalid','{"role":"admin"}');
insert into private.admin_memberships(user_id,active) values('91000000-0000-4000-8000-000000000001',true);
insert into app.brands(id,name,slug) values('92000000-0000-4000-8000-000000000001','Home SQL fixture','home-sql-fixture');
insert into aroma_home_test.saved values('settingsVersion',(select to_jsonb(version) from app.store_settings where singleton));
insert into aroma_home_test.saved values('productsBefore',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from app.products p));
select aroma_home_test.ok(not has_table_privilege('authenticated','app.home_document','insert,update,delete')
  and not has_table_privilege('anon','app.home_media','select'),'Home content and media joins have no browser table CRUD');
select aroma_home_test.ok(not has_function_privilege('authenticated','api.media_upload_complete_video(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('authenticated','api.media_upload_prepare_video(uuid,uuid,jsonb)','execute'),'Video manifests can only be verified by the server');
set local role anon;
select aroma_home_test.ok(api.home_document()='{"media":null,"content":null,"version":0,"mediaAssets":[]}'::jsonb,'Unconfigured Home explicitly returns version zero without importing local content');
select aroma_home_test.ok(api.catalog_settings()->'homeAnnouncement'='null'::jsonb and api.catalog_settings()->>'homeVersion'='0','Lightweight settings expose an explicit unconfigured announcement');
select aroma_home_test.ok(api.catalog_browse()->'homeAnnouncement'=api.catalog_settings()->'homeAnnouncement'
  and api.catalog_browse()->'homeVersion'=api.catalog_settings()->'homeVersion'
  and api.catalog_product_context('unknown-slug')->'homeVersion'=api.catalog_settings()->'homeVersion',
  'Unconfigured browse and detail metadata share settings without extra requests');
select aroma_home_test.error('select api.admin_home_document()','42501','Anonymous cannot inspect the Home editor');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),aroma_home_test.content(),0,1,false)','42501','Anonymous cannot save Home content');
select aroma_home_test.error('select api.media_upload_prepare_video(gen_random_uuid(),''91000000-0000-4000-8000-000000000001'',aroma_home_test.video())','42501','Anonymous cannot certify video metadata');
reset role;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
set local role authenticated;
select aroma_home_test.error('select api.admin_home_document()','42501','A customer cannot become an editor through user metadata');
reset role;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),aroma_home_test.content(),0,1,false)','42501','Home editing requires administrative MFA');
reset role;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_home_test.saved values('first',api.admin_save_home(aroma_home_test.media(),aroma_home_test.content(),0,
  (select (value#>>'{}')::bigint from aroma_home_test.saved where name='settingsVersion'),false));
select aroma_home_test.ok((select value->'home'->>'version'='1' and value->>'settingsVersion'=((select (value#>>'{}')::bigint+1
  from aroma_home_test.saved where name='settingsVersion'))::text from aroma_home_test.saved where name='first'),'First Home save atomically creates content and advances central settings');
select aroma_home_test.ok(api.admin_home_document()->'content'->'film' ? 'mobileVideo'
  and api.admin_home_document()->'content'->'film' ? 'mobilePoster','Film always projects optional mobile fields explicitly');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),aroma_home_test.content(),0,
  (select (value->>''settingsVersion'')::bigint from aroma_home_test.saved where name=''first''),true)','PT409','A stale Home version cannot overwrite a saved revision');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),aroma_home_test.content(),1,0,true)','PT409','A stale central settings version rejects the entire Home save');
select aroma_home_test.ok(api.admin_home_document()->>'version'='1'
  and api.catalog_settings()->'features'->>'complementsEnabled'='false','Conflicting settings do not partially publish a Home or toggle a feature');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),''{featuredBrandId}'',''"92000000-0000-4000-8000-000000000001"''),1,
  (select (value->>''settingsVersion'')::bigint from aroma_home_test.saved where name=''first''),true)','22023','Duplicated featured brand input must match the authoritative settings argument');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),''{hero}'',''[]''),1,1,false)','22023','Malformed campaign counts are rejected before mutation');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),''{hero,0,title}'',to_jsonb(repeat(''x'',91))),1,1,false)','22023','Campaign typography limits are validated on the server');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),''{finder,budgets}'',''[400,100]''),1,1,false)','22023','Budget amounts must be unique and increasing');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),''{finder,enabledOptions,family}'',''["floral","floral"]''),1,1,false)','22023','Duplicate quiz choices are rejected');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),''{finder,entryLabel}'',''"1/4 first question"''),1,1,false)','22023','Quiz progress cannot be duplicated in editable copy');
select aroma_home_test.error('select api.admin_save_home(jsonb_set(aroma_home_test.media(),''{hombre}'',''"data:image/webp;base64,AAAA"''),aroma_home_test.content(),1,1,false)','22023','SQL content accepts neither image bytes nor base64');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),''{film,video}'',''"https://arbitrary.invalid/movie.mp4"''),1,1,false)','22023','Arbitrary video URLs are not accepted as managed references');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media()||''{"unknown":null}'',aroma_home_test.content(),1,1,false)','22023','Unknown fields cannot hide unregistered media references');
select aroma_home_test.error('select api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),''{finder,familyVisuals}'',
  (select jsonb_object_agg(''family-''||n,jsonb_build_object(''description'','''',''image'',gen_random_uuid())) from generate_series(1,101) n)),1,1,false)',
  '22023','Home caps distinct media manifests before publication to match the client document limit');
select aroma_home_test.ok(api.admin_home_document()->>'version'='1','Validation failures preserve the previous saved document');

-- Reserve and verify a representative asset for every Home profile. These
-- receipts test SQL contracts; the Worker separately inspects real pixels/MP4.
insert into aroma_home_test.ids
  select purpose,(api.media_upload_reserve(gen_random_uuid(),purpose)->>'id')::uuid
    from unnest(array['category','hero-desktop','hero-mobile','finder-desktop','finder-mobile','finder-option']) purpose;
insert into aroma_home_test.ids values('poster',(api.media_upload_reserve(gen_random_uuid(),'film-poster')->>'id')::uuid),
  ('video',(api.media_upload_reserve(gen_random_uuid(),'film-video')->>'id')::uuid),
  ('video-mobile',(api.media_upload_reserve(gen_random_uuid(),'film-video')->>'id')::uuid),
  ('pending',(api.media_upload_reserve(gen_random_uuid(),'category')->>'id')::uuid),
  ('claimed',(api.media_upload_reserve(gen_random_uuid(),'category')->>'id')::uuid);
reset role;
set local role service_role;
select aroma_home_test.error('select api.media_upload_complete_video((select id from aroma_home_test.ids where name=''video''),
  ''91000000-0000-4000-8000-000000000001'',aroma_home_test.video())','PT409','Video confirmation requires its immutable pre-upload manifest');
select aroma_home_test.error('select api.media_upload_prepare_video((select id from aroma_home_test.ids where name=''video''),
  ''91000000-0000-4000-8000-000000000002'',aroma_home_test.video())','42501','Only the verified owner can prepare a video receipt');
select aroma_home_test.error('select api.media_upload_prepare_video((select id from aroma_home_test.ids where name=''category''),
  ''91000000-0000-4000-8000-000000000001'',aroma_home_test.video())','22023','An image reservation cannot be reinterpreted as video');
select aroma_home_test.error('select api.media_upload_prepare_video((select id from aroma_home_test.ids where name=''video''),
  ''91000000-0000-4000-8000-000000000001'',aroma_home_test.video()||''{"objectKey":"arbitrary"}'')','22023','Video keys are derived rather than trusted from a caller');
select aroma_home_test.error('select api.media_upload_prepare_video((select id from aroma_home_test.ids where name=''video''),
  ''91000000-0000-4000-8000-000000000001'',jsonb_set(aroma_home_test.video(),''{durationMs}'',''60001''))','22023','Long videos are rejected by the SQL receipt contract');
select aroma_home_test.error('select api.media_upload_prepare_video((select id from aroma_home_test.ids where name=''video''),
  ''91000000-0000-4000-8000-000000000001'',jsonb_set(aroma_home_test.video(),''{byteSize}'',''10485761''))','22023','Video files larger than ten MiB cannot be confirmed');
select aroma_home_test.error('select api.media_upload_prepare_video((select id from aroma_home_test.ids where name=''video''),
  ''91000000-0000-4000-8000-000000000001'',jsonb_set(aroma_home_test.video(),''{width}'',''479''))','22023','Video resolution must satisfy the minimum on both axes');
do $$
declare v_row record;v_w integer;v_h integer;v_manifest jsonb;
begin
  for v_row in select * from aroma_home_test.ids where name in ('category','hero-desktop','hero-mobile','finder-desktop','finder-mobile','finder-option','poster') loop
    v_w:=case when v_row.name in ('hero-desktop','finder-desktop') then 2304 when v_row.name in ('hero-mobile','finder-mobile') then 780
      when v_row.name='finder-option' then 480 when v_row.name='poster' then 1600 else 800 end;
    v_h:=case when v_row.name in ('hero-desktop','finder-desktop') then 1296 when v_row.name in ('hero-mobile','finder-mobile') then 1170
      when v_row.name='finder-option' then 480 when v_row.name='poster' then 900 else 1000 end;
    v_manifest:=aroma_home_test.image(v_row.id,v_w,v_h);
    perform api.media_upload_prepare(v_row.id,'91000000-0000-4000-8000-000000000001',v_manifest);
    perform api.media_upload_complete(v_row.id,'91000000-0000-4000-8000-000000000001',v_manifest);
  end loop;
end $$;
select api.media_upload_prepare_video((select id from aroma_home_test.ids where name='video'),'91000000-0000-4000-8000-000000000001',aroma_home_test.video());
select aroma_home_test.error('select api.media_upload_prepare_video((select id from aroma_home_test.ids where name=''video''),
  ''91000000-0000-4000-8000-000000000001'',jsonb_set(aroma_home_test.video(),''{sha256}'',to_jsonb(repeat(''d'',64))))','PT409','A prepared video operation cannot be reused for different bytes');
select aroma_home_test.ok(api.media_upload_complete_video((select id from aroma_home_test.ids where name='video'),'91000000-0000-4000-8000-000000000001',aroma_home_test.video())->>'src'
  like '/media/public/dynamic/%/video.mp4','Verified video completion returns a derived immutable MP4 path');
select aroma_home_test.ok(api.media_upload_complete_video((select id from aroma_home_test.ids where name='video'),'91000000-0000-4000-8000-000000000001',aroma_home_test.video())->>'byteSize'='5242880','Identical video completion is idempotent and includes the verified byte size');
select api.media_upload_prepare_video((select id from aroma_home_test.ids where name='video-mobile'),'91000000-0000-4000-8000-000000000001',aroma_home_test.video(true));
select api.media_upload_complete_video((select id from aroma_home_test.ids where name='video-mobile'),'91000000-0000-4000-8000-000000000001',aroma_home_test.video(true));
reset role;
select aroma_home_test.ok((select count(*)=0 from app.media_renditions where asset_id in(select id from aroma_home_test.ids where name in ('video','video-mobile'))),'SQL never invents image renditions for videos');
set local role anon;
select aroma_home_test.ok(api.media_public_asset((select id from aroma_home_test.ids where name='video'))->>'mimeType'='video/mp4'
  and not(api.media_public_asset((select id from aroma_home_test.ids where name='video')) ? 'variants'),'Public video manifests carry the distinct MP4 shape');
reset role;
set local role authenticated;
select aroma_home_test.error('select api.admin_save_home(jsonb_set(aroma_home_test.media(),''{hombre}'',to_jsonb((select id from aroma_home_test.ids where name=''pending''))),
  aroma_home_test.content(),1,(select (value->>''settingsVersion'')::bigint from aroma_home_test.saved where name=''first''),false)','22023','Unverified pending media cannot be published in the Home');
select aroma_home_test.error('select api.admin_save_home(jsonb_set(aroma_home_test.media(),''{hombre}'',to_jsonb((select id from aroma_home_test.ids where name=''hero-desktop''))),
  aroma_home_test.content(),1,(select (value->>''settingsVersion'')::bigint from aroma_home_test.saved where name=''first''),false)','22023','A verified image must still match its specific placement purpose');
insert into aroma_home_test.saved values('published',api.admin_save_home(aroma_home_test.media(true),aroma_home_test.content(true),1,
  (select (value->>'settingsVersion')::bigint from aroma_home_test.saved where name='first'),true));
select aroma_home_test.ok(api.admin_home_document()->>'version'='2' and jsonb_array_length(api.admin_home_document()->'mediaAssets')=9,'Home returns one verified manifest per distinct asset despite reused slots');
-- Keep the fixture's later version expectations while exercising a complete
-- replacement of a populated association set. The hosted HTTP test separately
-- verifies this command with Supabase's managed safeupdate extension loaded.
savepoint populated_home_replacement;
insert into aroma_home_test.saved values('replacementProbe',
  api.admin_save_home(aroma_home_test.media(),aroma_home_test.content(),2,
    (select (value->>'settingsVersion')::bigint from aroma_home_test.saved where name='published'),true));
select aroma_home_test.ok(
  (select value->'home'->>'version'='3' from aroma_home_test.saved where name='replacementProbe')
  and jsonb_array_length(api.admin_home_document()->'mediaAssets')=0,
  'Replacing a populated Home removes old media associations without requiring an unbounded delete');
rollback to savepoint populated_home_replacement;
release savepoint populated_home_replacement;
reset role;
select aroma_home_test.ok((select count(*)=21 from app.home_media),'All category, campaign, finder and mobile film slots acquire FK-backed associations');
select aroma_home_test.ok((select content->'hero'->0->>'desktopImage'=(select id::text from aroma_home_test.ids where name='hero-desktop')
  and not(content ? 'featuredBrandId') from app.home_document),'SQL stores managed UUIDs and keeps featured brand authority outside content');
select aroma_home_test.ok(not exists(select 1 from app.home_media h join app.media_assets m on m.id=h.media_id where m.retire_after is not null),'Every attached Home asset loses its orphan retirement deadline');
set local role anon;
select aroma_home_test.ok(api.home_document()->'content'->'hero'->0->>'desktopImage' like '/media/public/dynamic/%/2304.webp'
  and api.home_document()->'media'->>'hombre' like '/media/public/dynamic/%/800.webp','Public content resolves both category and campaign UUIDs into verified image sources');
select aroma_home_test.ok(api.home_document()->'content'->'film'->>'video' like '/media/public/dynamic/%/video.mp4'
  and api.home_document()->'content'->'film'->>'mobileVideo' like '/media/public/dynamic/%/video.mp4','Desktop and mobile MP4 sources remain independently verified');
select aroma_home_test.ok(api.catalog_settings()->>'homeVersion'='2' and api.catalog_settings()->'homeAnnouncement'=api.home_document()->'content'->'announcement'
  and not(api.catalog_settings() ? 'home'),'Global announcement settings are consistent without embedding the large Home payload');
select aroma_home_test.ok(api.catalog_browse()->'homeAnnouncement'=api.catalog_settings()->'homeAnnouncement'
  and api.catalog_browse()->'homeVersion'=api.catalog_settings()->'homeVersion'
  and api.catalog_product_context('unknown-slug')->'homeAnnouncement'=api.catalog_settings()->'homeAnnouncement'
  and api.catalog_product_context('unknown-slug')->'homeVersion'=api.catalog_settings()->'homeVersion',
  'Published browse and product context carry the exact announcement and revision from settings');
reset role;
set local role authenticated;
select aroma_home_test.ok(not(api.admin_catalog_page() ? 'home') and not(api.admin_catalog_page() ? 'homeDocument'),'Product catalog administration does not eagerly embed Home media');
insert into aroma_home_test.saved values('sharedProduct',api.admin_save_product(jsonb_build_object(
  'product',jsonb_build_object('id','93000000-0000-4000-8000-000000000001','name','SQL-only shared asset fixture','slug','sql-only-shared-home-asset',
    'brandId','92000000-0000-4000-8000-000000000001','productType','perfume','family','Floral','olfactoryFamilies',jsonb_build_array('floral'),
    'image',api.media_public_asset((select id from aroma_home_test.ids where name='category'))->>'src','discount',null,
    'variants',jsonb_build_array(jsonb_build_object('id','94000000-0000-4000-8000-000000000001','sku','HOME-SHARED-SQL','ml',50,'priceCents',30000,'stock',3,'active',true))),
  'detail',jsonb_build_object('shortDescription','SQL-only fixture','description','SQL-only shared reference fixture','olfactoryImage',null,'intensityLevel',null,
    'notes',jsonb_build_object('top','[]'::jsonb,'heart','[]'::jsonb,'base','[]'::jsonb),'recommendationIds','[]'::jsonb,
    'gallery',jsonb_build_array(jsonb_build_object('image',api.media_public_asset((select id from aroma_home_test.ids where name='category'))->>'src','framing','full'))),
  'active',true,'gender','unisex','popularity',0,'newest',0,'lowStockThreshold',2)));
select api.admin_delete_product('93000000-0000-4000-8000-000000000001',
  (select (value->>'version')::bigint from aroma_home_test.saved where name='sharedProduct'));
reset role;
select aroma_home_test.ok((select retire_after is null from app.media_assets where id=(select id from aroma_home_test.ids where name='category')),
  'Deleting a product never retires a photograph still referenced by Home');

-- Even an erroneously expired deadline cannot reclaim an attached Home asset.
update app.media_assets set retire_after=now()-interval '1 hour' where id in(select id from aroma_home_test.ids);
set local role service_role;
insert into aroma_home_test.saved values('claims',api.media_gc_claim(50));
select aroma_home_test.ok(jsonb_array_length((select value from aroma_home_test.saved where name='claims'))=2,'GC protects every Home association, including hidden-category and video placements');
reset role;
set local role authenticated;
select aroma_home_test.error('select api.admin_save_home(jsonb_set(aroma_home_test.media(),''{hombre}'',to_jsonb((select id from aroma_home_test.ids where name=''claimed''))),
  aroma_home_test.content(),2,(select (value->>''settingsVersion'')::bigint from aroma_home_test.saved where name=''published''),false)','22023','A terminally claimed asset cannot be resurrected through a Home editor');
insert into aroma_home_test.saved values('removed',api.admin_save_home(aroma_home_test.media(),aroma_home_test.content(),2,
  (select (value->>'settingsVersion')::bigint from aroma_home_test.saved where name='published'),false));
reset role;
select aroma_home_test.ok((select count(*)=0 from app.home_media),'Removing images clears associations without deleting R2 objects immediately');
select aroma_home_test.ok((select count(*)=9 from app.media_assets where id in(select id from aroma_home_test.ids)
  and status='ready' and retire_after>now()+interval '6 days'),'Detached images and videos retain seven days for recovery');
select aroma_home_test.ok((select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]'::jsonb) from app.products p)
  =(select value from aroma_home_test.saved where name='productsBefore'),'Home edits leave all existing product data untouched');
select aroma_home_test.ok((select count(*)=0 from app.product_olfactory_families),'Quiz configuration never assigns classifications to products');
set local role authenticated;
insert into aroma_home_test.saved values('featured',api.admin_save_home(aroma_home_test.media(),jsonb_set(aroma_home_test.content(),'{featuredBrandId}',
  '"92000000-0000-4000-8000-000000000001"'),3,(select (value->>'settingsVersion')::bigint from aroma_home_test.saved where name='removed'),false,
  '92000000-0000-4000-8000-000000000001'));
reset role;
update app.brands set active=false where id='92000000-0000-4000-8000-000000000001';
set local role anon;
select aroma_home_test.ok(api.home_document()->'content'->'featuredBrandId'='null'::jsonb and api.catalog_settings()->'featuredBrandId'='null'::jsonb,'Disabling a brand immediately clears its public shortcut through the central authority');
reset role;
rollback;
