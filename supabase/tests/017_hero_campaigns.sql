-- Only SQL fixtures in the disposable local PostgreSQL runner. No hosted media.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Only local fixtures';end if;
end $$;
create schema aroma_hero_test;
grant usage on schema aroma_hero_test to anon,authenticated,service_role,aro_catalog_admin_executor;
create function aroma_hero_test.ok(p boolean,label text) returns text language plpgsql set search_path='' as $$
begin if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_hero_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,actual;end if;return 'PASS: '||label;end $$;
create function aroma_hero_test.media() returns jsonb language sql immutable as $$
select '{"hombre":null,"mujer":null,"unisex":null,"complementos":null}'::jsonb $$;
create function aroma_hero_test.legacy() returns jsonb language sql immutable as $$
select jsonb_build_object('featuredBrandId',null,
  'announcement',jsonb_build_object('deliveryText','Fixture delivery','freeShippingLabel','Fixture free'),
  'hero',(select jsonb_agg(jsonb_build_object('eyebrow','Fixture campaign','title','Fixture title','description','Fixture description',
    'cta','Fixture action','alt','Fixture photo','desktopImage',null,'mobileImage',null)) from generate_series(0,4)),
  'film',jsonb_build_object('eyebrow','Fixture film','title','Fixture film','description','Fixture film','cta','Fixture film',
    'video',null,'poster',null,'mobileVideo',null,'mobilePoster',null),
  'finder',jsonb_build_object('eyebrow','Fixture finder','title','Fixture finder','description','Fixture finder','cta','Fixture finder',
    'desktopImage',null,'mobileImage',null,'entryLabel','Fixture choice','entryQuestion','Fixture question','modalTitle','Fixture modal',
    'steps',(select jsonb_object_agg(k,jsonb_build_object('label','Fixture label','question','Fixture question','description','Fixture help'))
      from unnest(array['family','occasion','intensity','budget']) k),
    'optionLabels','{"family":{},"occasion":{},"intensity":{}}'::jsonb,'enabledOptions','{"family":null,"occasion":null,"intensity":null}'::jsonb,
    'familyVisuals','{}'::jsonb,'noPreferenceLabel','Fixture none','budgets','[100,300]'::jsonb,'budgetNoLimitLabel','Fixture unlimited',
    'resultCopy',(select jsonb_object_agg(k,jsonb_build_object('title','Fixture result','description','Fixture description'))
      from unnest(array['matches','partial','budget','empty','unavailable','preferences']) k),'singleResultTitle','Fixture result'));
$$;
-- Fixture construction runs as its local owner; callers must not gain execute
-- permission on the production-private upgrade helper merely to build test data.
create function aroma_hero_test.content() returns jsonb language sql immutable security definer set search_path='' as $$
select jsonb_set(aroma_hero_test.legacy(),'{hero}',private.hero_upgrade(aroma_hero_test.legacy()->'hero')) $$;
grant execute on all functions in schema aroma_hero_test to anon,authenticated,service_role,aro_catalog_admin_executor;
create table aroma_hero_test.saved(name text primary key,value jsonb);
grant select,insert,update on aroma_hero_test.saved to anon,authenticated,service_role;

insert into auth.users(id,email) values('d7000000-0000-4000-8000-000000000001','hero-admin@example.invalid');
insert into private.admin_memberships(user_id,active) values('d7000000-0000-4000-8000-000000000001',true);
select aroma_hero_test.ok(not has_function_privilege('authenticated','private.hero_upgrade(jsonb)','execute')
 and not has_function_privilege('anon','private.hero_validate(jsonb)','execute'),'Hero helpers are not browser-callable');
select aroma_hero_test.ok(private.hero_upgrade(aroma_hero_test.legacy()->'hero')->0->>'id'='campaign-0'
 and private.hero_upgrade(aroma_hero_test.legacy()->'hero')->2->>'order'='4'
 and private.hero_upgrade(aroma_hero_test.legacy()->'hero')->3->>'order'='2','Legacy source-index content retains the approved presentation order');
select aroma_hero_test.ok(private.hero_upgrade(aroma_hero_test.content()->'hero')=aroma_hero_test.content()->'hero','Hero upgrade is idempotent');
select aroma_hero_test.error('select private.hero_validate(''[]'')','22023','Administrator must retain at least one campaign');
select aroma_hero_test.error('select private.hero_validate(jsonb_build_array(aroma_hero_test.content()->''hero''->0,aroma_hero_test.content()->''hero''->0))','22023','Duplicate campaign identities cannot publish');
select aroma_hero_test.error('select private.hero_validate(jsonb_set(aroma_hero_test.content()->''hero'',''{1,order}'',''0''))','22023','Duplicate campaign positions cannot publish');
select aroma_hero_test.error('select private.hero_validate(jsonb_set(aroma_hero_test.content()->''hero'',''{0,destination}'',''{"type":"page","page":"https://foreign.invalid"}''))','22023','External destinations are rejected');
select aroma_hero_test.error('select private.hero_validate(jsonb_set(aroma_hero_test.content()->''hero'',''{0,destination}'',''{"type":"page","page":"/admin"}''))','22023','Administrative routes cannot become campaign destinations');
select aroma_hero_test.error('select private.hero_validate(jsonb_set(aroma_hero_test.content()->''hero'',''{0,destination}'',''{"type":"product","productId":"../unsafe"}''))','22023','Product destinations require stable UUIDs rather than paths');
select aroma_hero_test.error('select private.hero_validate(jsonb_set(aroma_hero_test.content()->''hero'',''{0,video}'',''"data:video/mp4;base64,AAAA"''))','22023','Video bytes cannot enter PostgreSQL');
select aroma_hero_test.error('select private.hero_validate(jsonb_set(aroma_hero_test.content()->''hero'',''{0,mediaType}'',''"video"''))','22023','A published video requires both clip and poster');
select aroma_hero_test.error('select private.hero_validate(jsonb_set(aroma_hero_test.content()->''hero'',''{0,fallbackIndex}'',''null''))','22023','A published uploaded image campaign cannot lack its image');
select aroma_hero_test.error('select private.hero_validate(jsonb_set(aroma_hero_test.content()->''hero'',''{0,destination}'',''{"type":"shop","url":"javascript:alert(1)"}''))','22023','Unknown destination properties cannot bypass the allowlist');
select aroma_hero_test.ok((select count(*)=10 from jsonb_array_elements((select jsonb_agg((aroma_hero_test.content()->'hero'->0)
  ||jsonb_build_object('id','test-'||n,'order',n)) from generate_series(0,9) n))),'Ten campaigns have a bounded representation');
select private.hero_validate((select jsonb_agg((aroma_hero_test.content()->'hero'->0)||jsonb_build_object('id','test-'||n,'order',n)) from generate_series(0,9) n));
select aroma_hero_test.error('select private.hero_validate((select jsonb_agg((aroma_hero_test.content()->''hero''->0)||jsonb_build_object(''id'',''test-''||n,''order'',n)) from generate_series(0,10) n))','22023','Eleven campaigns exceed the bounded editor');

select set_config('request.jwt.claims','{}',true);
set local role anon;
select aroma_hero_test.error('select api.admin_home_document()','42501','Hidden campaigns are not an anonymous administrative resource');
reset role;
select set_config('request.jwt.claims','{"sub":"d7000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_hero_test.error('select api.admin_home_document()','42501','MFA remains required for campaign administration');
reset role;
select set_config('request.jwt.claims','{"sub":"d7000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_hero_test.saved values('legacy',api.admin_save_home(aroma_hero_test.media(),aroma_hero_test.legacy(),0,1,false));
select aroma_hero_test.ok(api.admin_home_document()->'content'->'hero'->0->>'id'='campaign-0','Legacy callers are upgraded at the authorized save boundary');
reset role;

-- These SQL-only receipts model verified media. Worker suites validate bytes.
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256,duration_ms)
values
 ('d7100000-0000-4000-8000-000000000001','r2','public/dynamic/d7100000-0000-4000-8000-000000000001/'||repeat('a',64)||'/video.mp4','video/mp4',1280,720,'ready',now(),gen_random_uuid(),'film-video',1000,repeat('a',64),12000),
 ('d7100000-0000-4000-8000-000000000002','r2','public/dynamic/d7100000-0000-4000-8000-000000000002/'||repeat('b',64)||'/1280.webp','image/webp',1280,720,'ready',now(),gen_random_uuid(),'film-poster',1000,repeat('b',64),null);
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
values('d7100000-0000-4000-8000-000000000002',1280,720,'image/webp',1000,repeat('b',64),'public/dynamic/d7100000-0000-4000-8000-000000000002/'||repeat('b',64)||'/1280.webp');
insert into aroma_hero_test.saved values('mixedContent',jsonb_set(aroma_hero_test.content(),'{hero}',jsonb_build_array(
  (aroma_hero_test.content()->'hero'->0)||jsonb_build_object('id','visible-image','showText',false,'showButton',false,'eyebrow','','title','','description','','cta',''),
  (aroma_hero_test.content()->'hero'->1)||jsonb_build_object('id','future-video','mediaType','video','published',false,'title','PRIVATE FUTURE CAMPAIGN',
    'video','d7100000-0000-4000-8000-000000000001','poster','d7100000-0000-4000-8000-000000000002',
    'destination',jsonb_build_object('type','product','productId','d7990000-0000-4000-8000-000000000001')))));
set local role authenticated;
insert into aroma_hero_test.saved values('mixed',api.admin_save_home(aroma_hero_test.media(),(select value from aroma_hero_test.saved where name='mixedContent'),1,
 (select (value->>'settingsVersion')::bigint from aroma_hero_test.saved where name='legacy'),false));
select aroma_hero_test.ok(jsonb_array_length(api.admin_home_document()->'content'->'hero')=2
 and jsonb_array_length(api.admin_home_document()->'mediaAssets')=2,'Administrator retains hidden campaigns and their verified media');
reset role;
set local role anon;
select aroma_hero_test.ok(jsonb_array_length(api.home_document()->'content'->'hero')=1
 and api.home_document()::text not like '%PRIVATE FUTURE CAMPAIGN%'
 and jsonb_array_length(api.home_document()->'mediaAssets')=0,'Public DTO omits future copy and exclusively hidden video/poster manifests');
reset role;
select aroma_hero_test.ok((select count(*)=2 from app.home_media),'Hidden video and poster keep FK-backed Home references');
update app.media_assets set retire_after=now()-interval '1 hour' where id in('d7100000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000002');
set local role service_role;
select aroma_hero_test.ok(jsonb_array_length(api.media_gc_claim(10))=0,'Cleanup cannot reclaim hidden campaign media');
reset role;
set local role authenticated;
select aroma_hero_test.error('select api.admin_save_home(aroma_hero_test.media(),aroma_hero_test.content(),1,3,false)','PT409','A stale editor cannot overwrite the mixed campaign revision');
insert into aroma_hero_test.saved values('allHidden',api.admin_save_home(aroma_hero_test.media(),
 jsonb_set(aroma_hero_test.content(),'{hero}',jsonb_build_array((aroma_hero_test.content()->'hero'->0)||jsonb_build_object('published',false))),2,
 (select (value->>'settingsVersion')::bigint from aroma_hero_test.saved where name='mixed'),false));
reset role;
set local role anon;
select aroma_hero_test.ok(api.home_document()->'content'->'hero'='[]'::jsonb,'All hidden campaigns yield an empty public Hero instead of invented defaults');
reset role;
select aroma_hero_test.ok((select count(*)=0 from app.home_media),'Removing campaign media removes only the Home associations');
select aroma_hero_test.ok((select count(*)=2 from app.media_assets where id in('d7100000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000002')
 and status='ready' and retire_after>now()+interval '6 days'),'Detached campaign bytes retain the existing recovery window');
select aroma_hero_test.ok((select count(*)=0 from app.products),'Campaign configuration never invents promoted products');
rollback;
