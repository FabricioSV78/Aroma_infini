-- Disposable PostgreSQL contracts. No hosted data or physical R2 deletion.
begin;
do $$begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Only isolated SQL fixtures';end if;end$$;
create schema aroma_retire_test;
grant usage on schema aroma_retire_test to anon,authenticated,service_role;
create function aroma_retire_test.id(i integer) returns uuid language sql immutable set search_path='' as $$
select ('e0350000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid$$;
create function aroma_retire_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function aroma_retire_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end$$;
create function aroma_retire_test.media() returns jsonb language sql immutable set search_path='' as $$
select '{"hombre":null,"mujer":null,"unisex":null,"complementos":null}'::jsonb$$;
create function aroma_retire_test.content(p_image boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('featuredBrandId',null,
  'announcement',jsonb_build_object('deliveryText','Local fixture','freeShippingLabel','Local fixture'),
  'hero',private.hero_upgrade((select jsonb_agg(jsonb_build_object('eyebrow','Fixture campaign','title','Fixture title','description','Fixture description',
    'cta','Fixture action','alt','Fixture photo','desktopImage',case when p_image then aroma_retire_test.id(20) end,'mobileImage',null)) from generate_series(0,4))),
  'film',jsonb_build_object('eyebrow','Fixture film','title','Fixture film','description','Fixture film','cta','Fixture film',
    'video',null,'poster',null,'mobileVideo',null,'mobilePoster',null),
  'finder',jsonb_build_object('eyebrow','Fixture finder','title','Fixture finder','description','Fixture finder','cta','Fixture finder',
    'desktopImage',null,'mobileImage',null,'entryLabel','Fixture choice','entryQuestion','Fixture question','modalTitle','Fixture modal',
    'steps',(select jsonb_object_agg(k,jsonb_build_object('label','Fixture label','question','Fixture question','description','Fixture help'))
      from unnest(array['family','occasion','intensity','budget']) k),
    'optionLabels','{"family":{},"occasion":{},"intensity":{}}'::jsonb,'enabledOptions','{"family":null,"occasion":null,"intensity":null}'::jsonb,
    'familyVisuals','{}'::jsonb,'noPreferenceLabel','Fixture none','budgets','[100,300]'::jsonb,'budgetNoLimitLabel','Fixture unlimited',
    'resultCopy',(select jsonb_object_agg(k,jsonb_build_object('title','Fixture result','description','Fixture description'))
      from unnest(array['matches','partial','budget','empty','unavailable','preferences']) k),'singleResultTitle','Fixture result'))$$;
-- Test-only helpers supply current versions, while the production RPC still
-- independently authorizes the JWT administrator and MFA for every save.
create function aroma_retire_test.save_home(p_content jsonb) returns jsonb language sql volatile security definer set search_path='' as $$
select api.admin_save_home(aroma_retire_test.media(),p_content,coalesce((select version from app.home_document where singleton),0),
  (select version from app.store_settings where singleton),false,null)$$;
grant execute on all functions in schema aroma_retire_test to anon,authenticated,service_role;
create table aroma_retire_test.saved(key text primary key,value jsonb);
grant select,insert,update on aroma_retire_test.saved to anon,authenticated,service_role;

select aroma_retire_test.ok((select count(*)=162 from app.media_builtin_aliases) and (select count(*)=99 from app.media_builtin_bindings),
  'Closed fallback inventory matches all reviewed resources and semantic owners');
select aroma_retire_test.ok(not has_table_privilege('authenticated','app.media_builtin_bindings','select,insert,update,delete')
  and not has_function_privilege('authenticated','private.builtin_reconcile_retention()','execute')
  and has_function_privilege('anon','api.builtin_media_build_state()','execute'),
  'Private ownership and retirement are not writable or executable by browsers');
select aroma_retire_test.ok(private.builtin_source_in_use('/images/unknown.webp')
  and not private.builtin_source_in_use('/images/ambre-480.webp')
  and not private.builtin_source_in_use('/videos/perfume-editorial-mobile.mp4'),
  'Unknown sources fail closed while unused catalog originals and the obsolete mobile MP4 are eligible for retirement');
select aroma_retire_test.ok(private.builtin_binding_in_use('home','{"owner":"future-owner"}')
  and private.builtin_binding_in_use('home','{"owner":"hero","fallbackIndex":"unsafe"}'),
  'Unknown ownership descriptors never authorize deletion');
set local role anon;
select aroma_retire_test.ok(api.builtin_media_resolve('/images/not-reviewed.webp')='{"asset":null,"retired":false}'::jsonb,
  'Unknown static routes never resolve an arbitrary R2 object');
select aroma_retire_test.ok(jsonb_array_length(api.builtin_media_build_state()->'items')=162
  and (select bool_and(item->>'status'='unavailable') from jsonb_array_elements(api.builtin_media_build_state()->'items') item),
  'Build state exposes missing migrations of bytes rather than pretending an unimported source is ready');
reset role;

insert into app.brands(id,name,slug) values(aroma_retire_test.id(31),'Retirement fixture brand','retirement-fixture-brand');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
values(aroma_retire_test.id(40),'local','/images/ambre-960.webp','image/webp',960,1200,'ready',now());
insert into app.products(id,name,slug,brand_id,short_description,description,active)
values(aroma_retire_test.id(41),'Retirement fixture perfume','retirement-fixture-perfume',aroma_retire_test.id(31),'Local fixture','Local fixture',false);
insert into app.product_variants(id,product_id,merchant_sku,ml,price_cents,stock,active)
values(aroma_retire_test.id(42),aroma_retire_test.id(41),'RETIREMENT-LOCAL',50,10000,1,true);
insert into app.product_images(product_id,position,media_id) values(aroma_retire_test.id(41),0,aroma_retire_test.id(40));
select aroma_retire_test.ok(private.builtin_source_in_use('/images/ambre-480.webp') and private.builtin_source_in_use('/images/ambre-960.webp'),
  'A committed local product image protects its reviewed gallery rendition group');
delete from app.product_images where product_id=aroma_retire_test.id(41);
select aroma_retire_test.ok(not private.builtin_source_in_use('/images/ambre-480.webp'),
  'A metadata row alone does not permanently pin a replaced catalog original');
update app.products set olfactory_media_id=aroma_retire_test.id(40) where id=aroma_retire_test.id(41);
select aroma_retire_test.ok(private.builtin_source_in_use('/images/ambre-480.webp'),
  'An independent olfactory placement still protects a shared local photograph');
update app.products set olfactory_media_id=null where id=aroma_retire_test.id(41);
select aroma_retire_test.ok(not private.builtin_source_in_use('/images/ambre-480.webp'),
  'Removing the final local product owner makes catalog originals eligible without deleting product data');

insert into auth.users(id,email) values(aroma_retire_test.id(1),'retirement-admin@example.invalid'),(aroma_retire_test.id(2),'retirement-customer@example.invalid');
insert into private.admin_memberships(user_id) values(aroma_retire_test.id(1));
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256,retire_after)
select aroma_retire_test.id(i),'r2','public/dynamic/'||aroma_retire_test.id(i)::text||'/'||repeat('a',64)||'/'||width::text||'.webp',
  'image/webp',width,height,'ready',now(),aroma_retire_test.id(i+100),'site-image',2000,repeat('a',64),clock_timestamp()+interval '24 hours'
from(values(10,1536,864),(11,960,1200),(12,160,200),(20,1600,900),(21,480,480),(22,800,1000)) f(i,width,height);
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id in(
aroma_retire_test.id(10),aroma_retire_test.id(11),aroma_retire_test.id(12),aroma_retire_test.id(20),aroma_retire_test.id(21),aroma_retire_test.id(22));
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_retire_test.id(2),'aal','aal2')::text,true);
set local role authenticated;
select aroma_retire_test.error('select api.admin_save_site_media(''seo.home'',aroma_retire_test.id(20),'''',1)','42501',
  'A customer cannot replace a provisional image even with AAL2');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_retire_test.id(1),'aal','aal1')::text,true);
set local role authenticated;
select aroma_retire_test.error('select api.admin_save_site_media(''seo.home'',aroma_retire_test.id(20),'''',1)','42501',
  'An administrator still needs MFA or independently verified device trust');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_retire_test.id(1),'aal','aal2')::text,true);
set local role authenticated;
select api.admin_save_media_alias('/images/hero-v2-lumiere-desktop-1536.webp',aroma_retire_test.id(10),1);
select api.admin_save_media_alias('/images/olfactory-cedre.webp',aroma_retire_test.id(11),1);
select api.admin_save_media_alias('/images/olfactory-cedre-thumb-160.webp',aroma_retire_test.id(12),1);
insert into aroma_retire_test.saved values('home',aroma_retire_test.save_home(aroma_retire_test.content(true)));
reset role;
select aroma_retire_test.ok((select retire_after is null from app.media_assets where id=aroma_retire_test.id(10)),
  'Replacing Hero retains its original photograph while the SEO Home placement still uses it');
select aroma_retire_test.ok(not private.builtin_source_in_use('/images/hero-v2-lumiere-mobile-1024.webp'),
  'Mobile inherits the uploaded desktop photograph and does not retain an unused campaign fallback');
set local role authenticated;
select api.admin_save_site_media('seo.home',aroma_retire_test.id(20),'Fixture sharing image',1);
reset role;
select aroma_retire_test.ok((select retire_after>clock_timestamp()+interval '23 hours' and retire_after<=clock_timestamp()+interval '24 hours'
  from app.media_assets where id=aroma_retire_test.id(10)),
  'Replacing the final effective Hero/SEO owner schedules the full 24-hour recovery window');
set local role authenticated;
select api.admin_save_site_media('seo.home',null,'Fixture original',2);
reset role;
select aroma_retire_test.ok((select retire_after is null from app.media_assets where id=aroma_retire_test.id(10)),
  'Restoring an original during its recovery window cancels retirement atomically');
set local role authenticated;
select api.admin_save_site_media('seo.home',aroma_retire_test.id(20),'Fixture replacement',3);
select aroma_retire_test.error('select api.admin_save_site_media(''seo.home'',null,'''',3)','PT409',
  'A stale restore cannot overwrite another administrative save');
reset role;
update app.media_assets set retire_after=clock_timestamp()-interval '1 second' where id in(aroma_retire_test.id(10),aroma_retire_test.id(11));
set local role service_role;
insert into aroma_retire_test.saved values('claims',api.media_gc_claim(50));
reset role;
select aroma_retire_test.ok((select status='deleting' from app.media_assets where id=aroma_retire_test.id(10)),
  'An expired original is claimable even though its audit alias row remains');
select aroma_retire_test.ok((select status='ready' and retire_after is null from app.media_assets where id=aroma_retire_test.id(11)),
  'The final pre-claim reconciliation protects referenced originals even with an expired timestamp');
set local role anon;
select aroma_retire_test.ok(api.builtin_media_resolve('/images/hero-v2-lumiere-desktop-1536.webp')='{"asset":null,"retired":true}'::jsonb
  and not exists(select 1 from jsonb_array_elements(api.public_media_aliases()->'items') item where item->>'path'='/images/hero-v2-lumiere-desktop-1536.webp'),
  'A claimed original has a terminal tombstone and never resolves back to bundled bytes');
select aroma_retire_test.ok((select item->>'status'='retired' from jsonb_array_elements(api.builtin_media_build_state()->'items') item
  where item->>'path'='/images/hero-v2-lumiere-desktop-1536.webp'),
  'The build may omit a retired original only after its effective references are gone');
reset role;
set local role authenticated;
select aroma_retire_test.error('select api.admin_save_site_media(''seo.home'',null,'''',4)','PT410',
  'A terminally claimed original cannot be restored through a null site fallback');
select aroma_retire_test.error('select aroma_retire_test.save_home(aroma_retire_test.content(false))','PT410',
  'A terminally claimed original cannot reappear through a null Hero fallback');
reset role;
select aroma_retire_test.ok((select version=4 and asset_id=aroma_retire_test.id(20) from app.site_media_slots where slot='seo.home')
  and (select content->'hero'->0->>'desktopImage'=aroma_retire_test.id(20)::text from app.home_document where singleton),
  'Rejected restores preserve the live image and both optimistic versions');
set local role service_role;
select api.media_gc_finalize(aroma_retire_test.id(10),(select (item->>'claimId')::uuid from
  jsonb_array_elements((select value from aroma_retire_test.saved where key='claims')) item where item->>'id'=aroma_retire_test.id(10)::text));
reset role;
select aroma_retire_test.ok((select status='deleted' from app.media_assets where id=aroma_retire_test.id(10)),
  'SQL finalization retains a deleted audit record rather than erasing the source identity');
set local role authenticated;
select aroma_retire_test.error('select api.admin_save_site_media(''seo.home'',null,'''',4)','PT410',
  'A fully deleted original cannot reappear through the restore button either');
reset role;

set local role authenticated;
select aroma_retire_test.save_home(jsonb_set(aroma_retire_test.content(true),'{finder,desktopImage}',to_jsonb(aroma_retire_test.id(20))));
reset role;
select aroma_retire_test.ok((select retire_after is null from app.media_assets where id=aroma_retire_test.id(11)),
  'Replacing the finder scene preserves the same photograph used by its family option');
set local role authenticated;
select aroma_retire_test.save_home(jsonb_set(jsonb_set(aroma_retire_test.content(true),'{finder,desktopImage}',to_jsonb(aroma_retire_test.id(20))),
  '{finder,familyVisuals}','{"amaderado":{"description":"Fixture wood","image":"e0350000-0000-4000-8000-000000000021"}}'::jsonb));
reset role;
select aroma_retire_test.ok((select bool_and(retire_after>clock_timestamp()+interval '23 hours') from app.media_assets
  where id in(aroma_retire_test.id(11),aroma_retire_test.id(12))),
  'Replacing the final family owner schedules both the original and its responsive thumbnail');
select aroma_retire_test.ok(not private.builtin_binding_in_use('home','{"owner":"hero","fallbackIndex":0,"orientation":"desktop"}')
  and private.builtin_binding_in_use('home','{"owner":"category","category":"complementos","layout":4}'),
  'Uploaded campaign images stop retaining defaults while hidden Complementos keeps its editable fallback');
select aroma_retire_test.ok((select count(*)=162 from app.media_builtin_aliases),
  'Retirement never deletes the closed inventory, aliases, historical migrations or commercial records');
set local role authenticated;
select api.admin_save_media_alias('/images/ambre-960.webp',aroma_retire_test.id(11),1);
reset role;
update app.media_assets set retire_after=clock_timestamp()-interval '1 second' where id=aroma_retire_test.id(11);
set local role service_role;
select api.media_gc_claim(50);
reset role;
select aroma_retire_test.error('insert into app.product_images(product_id,position,media_id) values(aroma_retire_test.id(41),0,aroma_retire_test.id(40))','PT410',
  'Legacy gallery references cannot resurrect a terminally retired catalog original');
select aroma_retire_test.error('update app.products set olfactory_media_id=aroma_retire_test.id(40) where id=aroma_retire_test.id(41)','PT410',
  'Legacy olfactory references cannot resurrect a terminally retired catalog original');
select aroma_retire_test.ok(not exists(select 1 from app.product_images where product_id=aroma_retire_test.id(41))
  and (select olfactory_media_id is null from app.products where id=aroma_retire_test.id(41)),
  'Rejected legacy references preserve the saved product and its real images');
update app.media_assets set retire_after=null where id=aroma_retire_test.id(12);
insert into app.product_images(product_id,position,media_id) values(aroma_retire_test.id(41),0,aroma_retire_test.id(22));
select aroma_retire_test.ok((select retire_after is null from app.media_assets where id=aroma_retire_test.id(12)),
  'Modern R2 gallery writes do not reconcile unrelated provisional assets or scan their effective ownership');
delete from app.product_images where product_id=aroma_retire_test.id(41);
select aroma_retire_test.ok((select retire_after is null from app.media_assets where id=aroma_retire_test.id(12)),
  'Removing a modern R2 photo uses its existing UUID retention and leaves unrelated defaults untouched');
update app.media_assets set retire_after=clock_timestamp()+interval '24 hours' where id=aroma_retire_test.id(12);
set constraints all immediate;
rollback;
