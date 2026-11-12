-- Disposable equivalence and authorization fixtures for the page projection.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner.';
  end if;
end $$;
create schema aroma_catalog_query_test;
grant usage on schema aroma_catalog_query_test to anon,authenticated,service_role,aro_catalog_admin_executor;
create function aroma_catalog_query_test.id(i integer) returns uuid language sql immutable set search_path='' as $$
  select ('d1280000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid $$;
create function aroma_catalog_query_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_catalog_query_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end $$;
grant execute on all functions in schema aroma_catalog_query_test to anon,authenticated,service_role,aro_catalog_admin_executor;

-- The previous page query remains an independent oracle: the exact existing
-- single-product helper, the same restricted owner, and all global metadata.
create function aroma_catalog_query_test.previous(p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin();
  return pg_catalog.jsonb_build_object(
    'olfactoryFamilies',api.admin_olfactory_families(),
    'products',coalesce((select pg_catalog.jsonb_agg(private.admin_product_document(page.id) order by page.created_at,page.id)
      from(select id,created_at from app.products order by created_at,id limit p_limit offset p_offset)page),'[]'::jsonb),
    'brands',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'name',name,'slug',slug,'active',active) order by name_key,id) from app.brands),'[]'::jsonb),
    'features',(select pg_catalog.jsonb_build_object('complementsEnabled',complements_enabled) from app.store_settings where singleton),
    'productVersions',coalesce((select pg_catalog.jsonb_object_agg(page.id::text,page.version) from
      (select id,version from app.products order by created_at,id limit p_limit offset p_offset)page),'{}'::jsonb),
    'brandVersions',coalesce((select pg_catalog.jsonb_object_agg(id::text,version) from app.brands),'{}'::jsonb),
    'settingsVersion',(select version from app.store_settings where singleton),
    'featuredBrandId',(select featured_brand_id from app.store_settings where singleton),
    'total',(select pg_catalog.count(*) from app.products));
end $$;
grant create on schema aroma_catalog_query_test to aro_catalog_admin_executor;
alter function aroma_catalog_query_test.previous(integer,integer) owner to aro_catalog_admin_executor;
revoke create on schema aroma_catalog_query_test from aro_catalog_admin_executor;
revoke all on function aroma_catalog_query_test.previous(integer,integer) from public,anon,authenticated,service_role;
grant execute on function aroma_catalog_query_test.previous(integer,integer) to authenticated;

insert into auth.users(id,email,encrypted_password) values
 (aroma_catalog_query_test.id(1),'catalog-query-admin@example.invalid','fixture-only-password-hash'),
 (aroma_catalog_query_test.id(2),'catalog-query-customer@example.invalid','fixture-only-password-hash');
insert into private.admin_memberships(user_id) values(aroma_catalog_query_test.id(1));
insert into app.brands(id,name,slug,active,version) values
 (aroma_catalog_query_test.id(3),'Projection brand','projection-brand',true,3),
 (aroma_catalog_query_test.id(4),'Inactive projection brand','inactive-projection-brand',false,4);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
select aroma_catalog_query_test.id(i),'r2','public/dynamic/'||aroma_catalog_query_test.id(i)::text||'/'||repeat('a',64)||'/800.webp',
 'image/webp',800,1000,case when i=13 then 'disabled' else 'ready' end,now(),aroma_catalog_query_test.id(i+100),
 'product-gallery',2000,repeat('a',64) from generate_series(10,13)i;
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
select m.id,w.width,w.width*5/4,m.mime_type,m.byte_size,m.sha256,regexp_replace(m.object_key,'/800.webp$','/'||w.width::text||'.webp')
from app.media_assets m cross join(values(400),(800))w(width) where m.id between aroma_catalog_query_test.id(10) and aroma_catalog_query_test.id(13);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
values(aroma_catalog_query_test.id(14),'local','/images/projection-local.webp','image/webp',800,1000,'ready',now());
insert into app.olfactory_families(code,label,aroma_label,active,aliases,sort_order,version)
values('projection-archived','Projection archived','Projection aroma',false,array['Projection former'],100,7);
insert into app.products(id,name,slug,brand_id,product_type,gender,short_description,description,active,olfactory_media_id,
  aromatic_profile,intensity_level,occasion,season,display_rank,newest_rank,low_stock_threshold,version,created_at)
select aroma_catalog_query_test.id(i),'Projection product '||i,'projection-product-'||i,
 case when i=25 then null when i=24 then aroma_catalog_query_test.id(4) else aroma_catalog_query_test.id(3) end,
 case when i=25 then 'complemento' else 'perfume' end,case when i=25 then null else 'unisex' end,
 'Fixture short description',repeat('Complete fixture description. ',5),i not in(23,24),
 case when i=20 then aroma_catalog_query_test.id(11) when i=21 then aroma_catalog_query_test.id(13) else null end,
 case when i=25 then '' else 'Projection aroma' end,case when i=25 then null else 2 end,
 case when i=25 then '' else 'Daily' end,case when i=25 then '' else 'All year' end,i,26-i,3,i-18,
 now()-interval '1 day' from generate_series(20,25)i;
insert into app.product_variants(id,product_id,merchant_sku,ml,label,price_cents,stock,active,created_at)
select aroma_catalog_query_test.id(i+100),aroma_catalog_query_test.id(i),'PROJECTION-'||i,
 case when i=25 then null else 50 end,case when i=25 then 'Single' else null end,12000,
 case when i=22 then 0 else 4 end,true,now()-interval '1 day' from generate_series(20,25)i;
insert into app.product_variants(id,product_id,merchant_sku,ml,price_cents,stock,active,created_at)
values(aroma_catalog_query_test.id(220),aroma_catalog_query_test.id(20),'PROJECTION-UNAVAILABLE',100,20000,999,false,now()),
 (aroma_catalog_query_test.id(221),aroma_catalog_query_test.id(21),'PROJECTION-EMPTY',100,20000,0,true,now());
insert into app.product_images(product_id,position,media_id)
select aroma_catalog_query_test.id(i),0,aroma_catalog_query_test.id(10) from generate_series(20,25)i;
insert into app.product_images(product_id,position,media_id) values
 (aroma_catalog_query_test.id(20),1,aroma_catalog_query_test.id(11)),
 (aroma_catalog_query_test.id(20),2,aroma_catalog_query_test.id(13)),
 (aroma_catalog_query_test.id(20),3,aroma_catalog_query_test.id(14));
insert into app.product_olfactory_families(product_id,family_code,position) values
 (aroma_catalog_query_test.id(20),'projection-archived',0),(aroma_catalog_query_test.id(20),'floral',1),
 (aroma_catalog_query_test.id(21),'floral',0);
insert into app.product_notes(product_id,phase,position,label)
select aroma_catalog_query_test.id(20),phase,position,phase||' note '||position
from(values('top'),('heart'),('base'))phases(phase) cross join generate_series(0,1)position;
insert into app.product_recommendations(product_id,recommended_product_id,position) values
 (aroma_catalog_query_test.id(20),aroma_catalog_query_test.id(24),0),
 (aroma_catalog_query_test.id(20),aroma_catalog_query_test.id(21),1);
insert into app.product_offers(product_id,enabled,discount_type,value,starts_at,ends_at) values
 (aroma_catalog_query_test.id(20),true,'percent',10,now()-interval '1 day',now()+interval '1 day'),
 (aroma_catalog_query_test.id(23),false,'fixed',1000,null,null);
update app.store_settings set complements_enabled=true,featured_brand_id=aroma_catalog_query_test.id(3),version=9 where singleton;
set constraints all immediate;

select aroma_catalog_query_test.ok((select proowner='aro_catalog_admin_executor'::regrole and prosecdef and provolatile='s'
 and proconfig=array['search_path=""'] from pg_proc where oid='api.admin_catalog_page(integer,integer)'::regprocedure),
 'Catalog page keeps its restricted owner, stable definer and fixed search path');
select aroma_catalog_query_test.ok(has_function_privilege('authenticated','api.admin_catalog_page(integer,integer)','execute')
 and not has_function_privilege('anon','api.admin_catalog_page(integer,integer)','execute')
 and not has_function_privilege('service_role','api.admin_catalog_page(integer,integer)','execute'),
 'Catalog page retains only the authenticated browser RPC grant');
select aroma_catalog_query_test.ok((select not prosecdef and provolatile='s' and proconfig=array['search_path=""']
 and strpos(prosrc,'where p.id = p_product_id;')>0 from pg_proc where oid='private.admin_product_document(uuid)'::regprocedure),
 'Single-product write response helper keeps its invoker mode and original ID predicate');
set local role anon;
select aroma_catalog_query_test.error('select api.admin_catalog_page(1,0)','42501','Anonymous cannot call the optimized catalog page');
reset role;
set local role service_role;
select aroma_catalog_query_test.error('select api.admin_catalog_page(1,0)','42501','Service role gains no catalog listing access');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_catalog_query_test.id(2),'aal','aal2')::text,true);
set local role authenticated;
select aroma_catalog_query_test.error('select api.admin_catalog_page(1,0)','42501','Customer AAL2 cannot call the optimized catalog page');
reset role;
set local role aro_catalog_admin_executor;
select aroma_catalog_query_test.ok((select count(*)=0 from app.products),'Catalog executor RLS still hides products from a customer JWT');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_catalog_query_test.id(1),'aal','aal1')::text,true);
set local role authenticated;
select aroma_catalog_query_test.error('select api.admin_catalog_page(1,0)','42501','Untrusted AAL1 cannot call the optimized catalog page');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_catalog_query_test.id(1),'aal','aal2')::text,true);
set local role authenticated;
select aroma_catalog_query_test.ok(not exists(select 1 from(values(1),(2),(5),(100))sizes(size)
 cross join(values(0),(1),(5),(6),(100000))offsets(offset_value)
 where api.admin_catalog_page(size,offset_value) is distinct from aroma_catalog_query_test.previous(size,offset_value)),
 'AAL2 pages exactly preserve complete product DTOs, global metadata, versions, order, boundaries and empty pages');
select aroma_catalog_query_test.ok((api.admin_catalog_page(1,0)->'products'->0->'product'->'variants'->1->>'stock')::integer=999
 and (api.admin_catalog_page(1,0)->'products'->0->'product'->'variants'->1->>'active')::boolean=false
 and jsonb_array_length(api.admin_catalog_page(1,0)->'products'->0->'mediaAssets')=2
 and jsonb_array_length(api.admin_catalog_page(1,0)->'products'->0->'detail'->'recommendationIds')=2,
 'Page keeps unavailable variant stock, ready R2 deduplication and recommendations outside the selected page');
select aroma_catalog_query_test.ok((api.admin_catalog_page(1,2)->'products'->0->>'active')::boolean=false,
 'Effective stock still deactivates an exhausted product before either projection reads it');
select aroma_catalog_query_test.error('select api.admin_catalog_page(101,0)','22023','Page retains its 100-product maximum');
select aroma_catalog_query_test.error('select api.admin_catalog_page(1,100001)','22023','Page retains its offset maximum');
select aroma_catalog_query_test.error('select api.admin_catalog_page(null,0)','22023','Page rejects a null limit');
select aroma_catalog_query_test.error('select api.admin_catalog_page(1,null)','22023','Page rejects a null offset');
reset role;

-- Actual trusted-device registration and resume, rather than fabricated grants.
insert into auth.mfa_factors(id,user_id,factor_type,status,secret)
values(aroma_catalog_query_test.id(300),aroma_catalog_query_test.id(1),'totp','verified','fixture-only');
insert into auth.sessions(id,user_id,aal,factor_id) values
 (aroma_catalog_query_test.id(301),aroma_catalog_query_test.id(1),'aal2',aroma_catalog_query_test.id(300)),
 (aroma_catalog_query_test.id(302),aroma_catalog_query_test.id(1),'aal1',null);
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_catalog_query_test.id(1),'role','authenticated','aal','aal2',
 'session_id',aroma_catalog_query_test.id(301),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint),
 jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
select api.admin_device_register(encode(sha256(convert_to(repeat('e',64),'UTF8')),'hex'),'Catalog projection fixture');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_catalog_query_test.id(1),'role','authenticated','aal','aal1',
 'session_id',aroma_catalog_query_test.id(302),'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
set local role authenticated;
select aroma_catalog_query_test.ok(api.admin_device_resume(repeat('e',64))->>'trusted'='true','Genuine cookie proof authorizes the fixture AAL1 session');
select aroma_catalog_query_test.ok(not exists(select 1 from(values(1),(2),(5),(100))sizes(size)
 cross join(values(0),(1),(5),(6),(100000))offsets(offset_value)
 where api.admin_catalog_page(size,offset_value) is distinct from aroma_catalog_query_test.previous(size,offset_value)),
 'Trusted AAL1 preserves the exact previous catalog JSON across every tested page');
reset role;
update private.admin_memberships set active=false where user_id=aroma_catalog_query_test.id(1);
set local role authenticated;
select aroma_catalog_query_test.error('select api.admin_catalog_page(1,0)','42501','Membership revocation immediately denies the optimized trusted AAL1 page');
reset role;
set constraints all immediate;
rollback;
