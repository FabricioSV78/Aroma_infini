-- The optimized query must remain identical to the original global-count DTO.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Only isolated SQL fixtures';end if;end $$;
create schema aroma_media_query_test;
grant usage on schema aroma_media_query_test to anon,authenticated;
create function aroma_media_query_test.id(i integer) returns uuid language sql immutable set search_path='' as $$
  select ('d1270000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid $$;
create function aroma_media_query_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_media_query_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end $$;
grant execute on all functions in schema aroma_media_query_test to anon,authenticated;

-- Reference implementation copied from the previous migrated query. This test
-- oracle is used only by the fixture owner, never granted to browser roles.
create function aroma_media_query_test.previous(p_query text,p_section text,p_state text,p_page integer,p_page_size integer)
returns jsonb language sql stable security invoker set search_path='' as $$
  with usage_counts as materialized(select asset_id,count(*) as uses from private.media_usages() group by asset_id),
  matching as materialized(
    select m.id,coalesce(u.uses,0) as uses from app.media_assets m join app.media_library l on l.asset_id=m.id
    left join usage_counts u on u.asset_id=m.id where m.storage_kind='r2'
      and (p_section='all' or l.section=p_section)
      and (p_query='' or l.search_document@@websearch_to_tsquery('simple'::regconfig,p_query))
      and (p_state='all' or (p_state='used' and m.status='ready' and coalesce(u.uses,0)>0)
        or (p_state='unused' and m.status='ready' and coalesce(u.uses,0)=0)
        or (p_state='pending' and m.status<>'deleted' and (m.retire_after is not null or m.status='deleting'))
        or (p_state='deleted' and m.status='deleted'))),
  selected as materialized(select m as media,l as metadata,x.uses,m.created_at,m.id from matching x
    join app.media_assets m on m.id=x.id join app.media_library l on l.asset_id=m.id
    order by m.created_at desc,m.id limit p_page_size offset (p_page-1)*p_page_size),
  variants as(select r.asset_id,jsonb_agg(jsonb_build_object('src','/media/'||r.object_key,'width',r.width,'height',r.height) order by r.width) as manifest
    from app.media_renditions r where r.asset_id in(select id from selected) group by r.asset_id)
  select jsonb_build_object('items',coalesce((select jsonb_agg(private.media_library_json(s.media,s.metadata,s.uses,v.manifest)
    order by s.created_at desc,s.id) from selected s left join variants v on v.asset_id=s.id),'[]'::jsonb),
    'total',(select count(*) from matching),'page',p_page,'pageSize',p_page_size);
$$;
revoke all on function aroma_media_query_test.previous(text,text,text,integer,integer) from public,anon,authenticated,service_role;

insert into auth.users(id,email) values(aroma_media_query_test.id(1),'query-admin@example.invalid'),(aroma_media_query_test.id(2),'query-customer@example.invalid');
insert into private.admin_memberships(user_id) values(aroma_media_query_test.id(1));
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256,retire_after,deletion_claim_id,deleted_at,created_at)
select aroma_media_query_test.id(i),'r2','public/dynamic/'||aroma_media_query_test.id(i)::text||'/'||repeat('a',64)||'/800.webp',
 'image/webp',800,1000,state,case when state='ready' then now() end,aroma_media_query_test.id(i+100),'product-gallery',2000,repeat('a',64),
 now()+interval '24 hours',case when state in('deleted','deleting') then aroma_media_query_test.id(i+200) end,
 case when state='deleted' then now() end,now()-i*interval '1 minute'
from(values(10,'ready'),(11,'ready'),(12,'ready'),(13,'disabled'),(14,'deleted'),(15,'pending'),(16,'deleting')) fixture(i,state);
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
 select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id between aroma_media_query_test.id(10) and aroma_media_query_test.id(16);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256,retire_after,created_at,duration_ms)
values
 (aroma_media_query_test.id(17),'r2','public/dynamic/'||aroma_media_query_test.id(17)::text||'/'||repeat('b',64)||'/vector.svg','image/svg+xml',100,50,'ready',now(),aroma_media_query_test.id(117),'site-vector',1000,repeat('b',64),now()+interval '24 hours',now()-interval '17 minutes',null),
 (aroma_media_query_test.id(18),'r2','public/dynamic/'||aroma_media_query_test.id(18)::text||'/'||repeat('c',64)||'/video.mp4','video/mp4',1600,900,'ready',now(),aroma_media_query_test.id(118),'film-video',2000,repeat('c',64),now()+interval '24 hours',now()-interval '18 minutes',3000);
update app.media_library set label='QueryAudit asset '||right(asset_id::text,2),alt='Query fixture',section=case when asset_id=aroma_media_query_test.id(17) then 'identity' when asset_id=aroma_media_query_test.id(12) then 'about' else 'products' end
 where asset_id between aroma_media_query_test.id(10) and aroma_media_query_test.id(18);
insert into app.brands(id,name,slug) values(aroma_media_query_test.id(3),'Query fixture','query-fixture');
insert into app.products(id,name,slug,brand_id,short_description,description,active)
 values(aroma_media_query_test.id(4),'Query fixture','query-fixture',aroma_media_query_test.id(3),'Fixture','Fixture',false);
insert into app.product_variants(product_id,ml,price_cents,stock,active) values(aroma_media_query_test.id(4),50,10000,1,true);
insert into app.product_images(product_id,position,media_id) values(aroma_media_query_test.id(4),0,aroma_media_query_test.id(10));
update app.site_media_slots set asset_id=aroma_media_query_test.id(17),version=version+1 where slot='identity.logo';

create table aroma_media_query_test.expected as
select query,section,state,page,size,aroma_media_query_test.previous(query,section,state,page,size) as document
from(values('queryaudit'),('queryaudit missing'))queries(query)
cross join(values('all'),('products'),('about'),('identity'))sections(section)
cross join(values('all'),('used'),('unused'),('pending'),('deleted'))states(state)
cross join(values(1),(2),(50))pages(page)
cross join(values(1),(20))sizes(size);
grant select on aroma_media_query_test.expected to authenticated;
select aroma_media_query_test.ok((select count(*)=240 from aroma_media_query_test.expected),'Library query equivalence covers 240 filter, page and size combinations');
select aroma_media_query_test.ok((select proowner='aro_media_executor'::regrole and prosecdef and provolatile='s' and proconfig=array['search_path=""']
 from pg_proc where oid='api.admin_media_library(text,text,text,integer,integer)'::regprocedure),
 'Library query optimization retains its restricted owner, stable definer and fixed search path');
select aroma_media_query_test.ok(has_function_privilege('authenticated','api.admin_media_library(text,text,text,integer,integer)','execute')
 and not has_function_privilege('anon','api.admin_media_library(text,text,text,integer,integer)','execute')
 and not has_function_privilege('service_role','api.admin_media_library(text,text,text,integer,integer)','execute'),
 'Library query optimization grants no anonymous or service listing access');
set local role anon;
select aroma_media_query_test.error('select api.admin_media_library()','42501','Anonymous still cannot list media after query optimization');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_media_query_test.id(2),'aal','aal2')::text,true);
set local role authenticated;
select aroma_media_query_test.error('select api.admin_media_library()','42501','Customer AAL2 still cannot list media after query optimization');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_media_query_test.id(1),'aal','aal1')::text,true);
set local role authenticated;
select aroma_media_query_test.error('select api.admin_media_library()','42501','Untrusted AAL1 still cannot list media after query optimization');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_media_query_test.id(1),'aal','aal2')::text,true);
set local role authenticated;
select aroma_media_query_test.ok(not exists(select 1 from aroma_media_query_test.expected e where
 api.admin_media_library(e.query,e.section,e.state,e.page,e.size) is distinct from e.document),
 'Library query preserves exact totals, ordering, uses, tombstones, WebP, MP4 and SVG JSON across every tested filter');
select aroma_media_query_test.ok(jsonb_array_length(api.admin_media_library('queryaudit','all','used',1,20)->'items')=2
 and jsonb_array_length(api.admin_media_library('queryaudit','all','unused',1,20)->'items')=3,
 'Used and unused filters retain full-reference membership rather than page-local approximations');
select aroma_media_query_test.error('select api.admin_media_library('''',''all'',''all'',1,51)','22023','Optimized library preserves the 50-item server limit');
reset role;
set constraints all immediate;
rollback;
