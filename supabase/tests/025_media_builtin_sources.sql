-- SQL-only aliases for the reviewed built-in inventory; no imported file bytes.
begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Only isolated SQL fixtures';end if;end $$;
create schema aroma_alias_test;
grant usage on schema aroma_alias_test to anon,authenticated,service_role;
create function aroma_alias_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end $$;
create function aroma_alias_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end $$;
create function aroma_alias_test.id(value integer) returns uuid language sql immutable set search_path='' as $$
select ('d1250000-0000-4000-8000-'||lpad(value::text,12,'0'))::uuid $$;
grant execute on all functions in schema aroma_alias_test to anon,authenticated,service_role;
create table aroma_alias_test.saved(key text primary key,value jsonb);
grant select,insert on aroma_alias_test.saved to anon,authenticated,service_role;
insert into auth.users(id,email) values(aroma_alias_test.id(1),'builtin-admin@example.invalid'),(aroma_alias_test.id(2),'builtin-customer@example.invalid');
insert into private.admin_memberships(user_id) values(aroma_alias_test.id(1));
select aroma_alias_test.ok(not has_table_privilege('authenticated','app.media_builtin_aliases','select,insert,update,delete')
 and not has_table_privilege('aro_media_executor','app.media_builtin_aliases','insert,delete'),
 'Alias RPCs cannot create arbitrary source paths or expose raw inventory writes');
select aroma_alias_test.ok((select count(*)>100 and count(asset_id)=0 from app.media_builtin_aliases),
 'The reviewed static inventory retains original fallbacks until explicit verified imports');
set local role anon;
select aroma_alias_test.ok(api.public_media_aliases()='{"items":[]}'::jsonb,'Unimported built-in files create no fictitious R2 aliases');
select aroma_alias_test.error('select api.admin_media_aliases()','42501','Anonymous cannot inspect the administrative source inventory');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_alias_test.id(2),'aal','aal2')::text,true);
set local role authenticated;
select aroma_alias_test.error('select api.admin_media_aliases()','42501','Customer AAL2 cannot administer built-in aliases');
reset role;

insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256,retire_after)
 select aroma_alias_test.id(i),'r2','public/dynamic/'||aroma_alias_test.id(i)::text||'/'||repeat('a',64)||'/'||width::text||'.webp',
 'image/webp',width,height,'ready',now(),aroma_alias_test.id(i+100),'site-image',2000,repeat('a',64),now()+interval '24 hours'
 from(values(10,480,600),(11,960,1200),(12,480,600)) fixture(i,width,height);
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
 select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id in(
 aroma_alias_test.id(10),aroma_alias_test.id(11),aroma_alias_test.id(12));
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256,duration_ms,retire_after)
 values(aroma_alias_test.id(13),'r2','public/dynamic/'||aroma_alias_test.id(13)::text||'/'||repeat('b',64)||'/video.mp4',
 'video/mp4',720,900,'ready',now(),aroma_alias_test.id(113),'film-video',2000,repeat('b',64),5000,now()+interval '24 hours');
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_alias_test.id(1),'aal','aal2')::text,true);
set local role authenticated;
insert into aroma_alias_test.saved values('first',api.admin_save_media_alias('/images/ambre-480.webp',aroma_alias_test.id(10),1));
select aroma_alias_test.ok((select value->>'version'='2' and value->'asset'->>'id'=aroma_alias_test.id(10)::text from aroma_alias_test.saved where key='first'),
 'Import aliases bind only verified manifests and increment their own version');
select api.admin_save_media_alias('/images/cedre-480.webp',aroma_alias_test.id(10),1);
select aroma_alias_test.ok(api.admin_media_detail(aroma_alias_test.id(10))->>'useCount'='2'
 and (select count(*)=2 from jsonb_array_elements(api.admin_media_detail(aroma_alias_test.id(10))->'usages') u where u->>'key' like 'builtin:%'),
 'Every built-in alias contributes a separate central usage reference');
select aroma_alias_test.error('select api.admin_save_media_alias(''/images/ambre-480.webp'',aroma_alias_test.id(12),1)',
 'PT409','A stale importer cannot replace a newer source binding');
select aroma_alias_test.error('select api.admin_save_media_alias(''/images/ambre-480.webp'',aroma_alias_test.id(11),2)',
 '22023','Alias imports preserve exact original width and height');
select aroma_alias_test.error('select api.admin_save_media_alias(''/videos/perfume-editorial-mobile.mp4'',aroma_alias_test.id(10),1)',
 '22023','An image cannot replace a built-in MP4');
select aroma_alias_test.error('select api.admin_save_media_alias(''/images/not-reviewed.webp'',aroma_alias_test.id(10),1)',
 '22023','A source outside the reviewed inventory cannot be registered');
select aroma_alias_test.error('select api.admin_media_retire(aroma_alias_test.id(10),1)',
 'PT409','A shared built-in source protects its image from manual retirement');
select api.admin_save_media_alias('/videos/perfume-editorial-mobile.mp4',aroma_alias_test.id(13),1);
reset role;
select aroma_alias_test.ok(private.media_has_references(aroma_alias_test.id(10))
 and private.media_has_references(aroma_alias_test.id(13))
 and (select retire_after is null from app.media_assets where id=aroma_alias_test.id(10)),
 'Image and video alias references cancel scheduled cleanup using the shared retention trigger');
set local role anon;
select aroma_alias_test.ok(jsonb_array_length(api.public_media_aliases()->'items')=3
 and not(api.public_media_aliases()->'items'->0 ?|array['updated_by','operation_id','uploader_id']),
 'Public source aliases expose only the original path and ready immutable manifest');
reset role;
update app.media_assets set retire_after=clock_timestamp()-interval '1 second' where id in(
 aroma_alias_test.id(10),aroma_alias_test.id(11),aroma_alias_test.id(13));
set local role service_role;
insert into aroma_alias_test.saved values('claims',api.media_gc_claim(50));
select aroma_alias_test.ok(not exists(select 1 from jsonb_array_elements((select value from aroma_alias_test.saved where key='claims')) entry
 where entry->>'id' in(aroma_alias_test.id(10)::text,aroma_alias_test.id(13)::text))
 and exists(select 1 from jsonb_array_elements((select value from aroma_alias_test.saved where key='claims')) entry where entry->>'id'=aroma_alias_test.id(11)::text),
 'GC protects live built-in image and video sources even if their timestamps are erroneously expired');
reset role;
set local role authenticated;
select api.admin_save_media_alias('/images/ambre-480.webp',aroma_alias_test.id(12),2);
reset role;
select aroma_alias_test.ok((select retire_after is null from app.media_assets where id=aroma_alias_test.id(10)),
 'Replacing one built-in usage retains an image shared by another source');
set local role authenticated;
select api.admin_save_media_alias('/images/cedre-480.webp',aroma_alias_test.id(12),2);
select aroma_alias_test.error('select api.admin_save_media_alias(''/images/ambre-960.webp'',aroma_alias_test.id(11),1)',
 '22023','A terminally claimed asset cannot be revived by a built-in source importer');
reset role;
select aroma_alias_test.ok((select status='ready' and retire_after>clock_timestamp()+interval '23 hours'
 and retire_after<=clock_timestamp()+interval '24 hours' from app.media_assets where id=aroma_alias_test.id(10)),
 'Replacing the final built-in source starts the full 24-hour recovery window');
set constraints all immediate;
rollback;
