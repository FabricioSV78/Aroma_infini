-- This fixture runs only in the disposable local PostgreSQL transaction.
begin;
do $$begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Use only the isolated SQL runner.';end if;
end$$;
create schema aroma_targeted_test;
grant usage on schema aroma_targeted_test to anon,authenticated,service_role;
create function aroma_targeted_test.id(i integer) returns uuid language sql immutable set search_path='' as $$
  select ('e0330000-0000-4000-8000-'||pg_catalog.lpad(i::text,12,'0'))::uuid;
$$;
create function aroma_targeted_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function aroma_targeted_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end$$;
grant execute on all functions in schema aroma_targeted_test to anon,authenticated,service_role;
insert into auth.users(id,email,encrypted_password) values(aroma_targeted_test.id(1),'targeted-admin@example.invalid','local-only'),(aroma_targeted_test.id(2),'targeted-customer@example.invalid','local-only');
insert into private.admin_memberships(user_id) values(aroma_targeted_test.id(1));
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
values(aroma_targeted_test.id(3),'local','/images/bois-960.webp','image/webp',800,1000,'ready',now());
insert into app.brands(id,name,slug,active) select aroma_targeted_test.id(1000+i),'Marca '||lpad(i::text,4,'0'),'targeted-brand-'||i,true from generate_series(1,1000)i;
insert into app.products(id,name,slug,brand_id,gender,aromatic_profile,short_description,description,active,intensity_level,occasion,low_stock_threshold)
select aroma_targeted_test.id(10000+i),'Perfume '||lpad(i::text,5,'0'),'targeted-product-'||i,aroma_targeted_test.id(1001+i%1000),'unisex','Floral','Prueba local','Prueba local',true,2,'Diario',3 from generate_series(1,3000)i;
insert into app.product_variants(id,product_id,merchant_sku,ml,price_cents,stock,active)
select aroma_targeted_test.id(20000+i),aroma_targeted_test.id(10000+i),'TARGETED-'||i,50,12000,10,true from generate_series(1,3000)i;
insert into app.product_images(product_id,position,media_id) select aroma_targeted_test.id(10000+i),0,aroma_targeted_test.id(3) from generate_series(1,3000)i;
insert into app.product_offers(product_id,enabled,discount_type,value) select aroma_targeted_test.id(10000+i),true,'percent',10 from generate_series(1,1000)i;
set constraints all immediate;
set constraints all deferred;
analyze app.products,app.product_variants,app.product_offers,app.brands;

set local role anon;
select aroma_targeted_test.error('select api.admin_catalog_context()','42501','Anonymous cannot obtain catalog metadata');
select aroma_targeted_test.error('select api.admin_catalog_choices()','42501','Anonymous cannot obtain product identities');
select aroma_targeted_test.error('select api.admin_import_conflicts(''[]'')','42501','Anonymous cannot probe SKU conflicts');
select aroma_targeted_test.error('select api.admin_offer_list()','42501','Anonymous cannot read private offers');
select aroma_targeted_test.error('select api.admin_products_by_ids(''{}'')','42501','Anonymous cannot read unpublished products');
reset role;
set local role service_role;
select aroma_targeted_test.error('select api.admin_catalog_context()','42501','Service role has no administrative context RPC grant');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_targeted_test.id(2),'aal','aal2')::text,true);
set local role authenticated;
select aroma_targeted_test.error('select api.admin_catalog_choices()','42501','Customer cannot read private selector identities');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_targeted_test.id(1),'aal','aal1')::text,true);
set local role authenticated;
select aroma_targeted_test.error('select api.admin_offer_list()','42501','MFA remains mandatory for offer pages');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_targeted_test.id(1),'aal','aal2')::text,true);
set local role authenticated;
select aroma_targeted_test.ok(not(api.admin_catalog_context()?'products') and jsonb_array_length(api.admin_catalog_context()->'brands')=1000,'Metadata for one thousand brands never contains three thousand product documents');
select aroma_targeted_test.ok((api.admin_catalog_choices()->>'total')::integer=3000 and jsonb_array_length(api.admin_catalog_choices()->'items')=25,'Product selector sends a bounded page of identities');
select aroma_targeted_test.ok(not((api.admin_catalog_choices()->'items'->0)?'variants') and not((api.admin_catalog_choices()->'items'->0)?'gallery'),'Selector identities contain no variants or galleries');
select aroma_targeted_test.ok((api.admin_catalog_choices('{"search":"Perfume 02999"}')->>'total')::integer=1,'Remote selector search covers products outside its first page');
select aroma_targeted_test.ok((api.admin_catalog_choices('{"withoutOffer":true}')->>'total')::integer=2000,'Offer selector excludes already configured discounts');
select aroma_targeted_test.ok(jsonb_array_length(api.admin_catalog_choices(jsonb_build_object('includeIds',jsonb_build_array(aroma_targeted_test.id(12999))))->'selected')=1,'Selected identity outside the first page is retrieved explicitly');
select aroma_targeted_test.ok(jsonb_array_length(api.admin_products_by_ids(array[aroma_targeted_test.id(12999)])->'products')=1,'Explicit product read constructs one canonical document only');
select aroma_targeted_test.ok((api.admin_offer_list()->>'total')::integer=1000 and jsonb_array_length(api.admin_offer_list()->'products')=12 and (api.admin_offer_list()->>'availableCount')::integer=2000,'One thousand offers send twelve canonical documents and exact totals');
select aroma_targeted_test.ok((api.admin_offer_list(1)->'products'->0->'product'->>'id') is distinct from (api.admin_offer_list(2)->'products'->0->'product'->>'id'),'Offer page two advances without a complete product snapshot');
select aroma_targeted_test.ok(api.admin_offer_list(1)->>'revision'=api.admin_offer_list(2)->>'revision','Unchanged offer pages share a coherent cohort revision');
select aroma_targeted_test.ok(jsonb_array_length(api.admin_import_conflicts('[{"row":2,"slug":"targeted-product-2999","name":"Unused name","brandId":"","sku":"TARGETED-2998"}]'))=1,'Import checks only submitted identities against the global catalog');
select aroma_targeted_test.ok(api.admin_import_conflicts('[{"row":2,"slug":"targeted-product-2999","name":"Unused name","brandId":"","sku":"TARGETED-2998"}]')->0->'reasons'='["slug","sku"]','Import reports exact slug and SKU conflicts together');
select aroma_targeted_test.ok(api.admin_import_conflicts('[{"row":2,"slug":"new-only","name":"New product","brandId":"","sku":"NEW-SKU"}]')='[]','Import allows a new name and SKU without downloading catalog documents');
select aroma_targeted_test.error('select api.admin_products_by_ids(array(select aroma_targeted_test.id(i) from generate_series(1,101)i))','22023','Explicit canonical reads reject more than one hundred IDs');
select aroma_targeted_test.error('select api.admin_import_conflicts(jsonb_build_array(jsonb_build_object(''row'',2,''sku'',''x'')))','22023','Incomplete import identity cannot bypass validation');
select aroma_targeted_test.error('select api.admin_catalog_choices(''{"unknown":true}'')','22023','Unknown selector filters are rejected');
reset role;
create temp table aroma_targeted_revision as select api.admin_offer_list()->>'revision' value;
update app.products set name='Changed name',version=version+1 where id=aroma_targeted_test.id(10001);
select aroma_targeted_test.ok(api.admin_offer_list()->>'revision'<>(select value from aroma_targeted_revision),'Same-count offer reordering changes its cohort revision');
update app.product_offers set value=11,version=version+1 where product_id=aroma_targeted_test.id(10002);
select aroma_targeted_test.ok(api.admin_offer_list()->>'revision'<>(select value from aroma_targeted_revision),'Offer edits invalidate the publication cohort');

create function aroma_targeted_test.measure() returns jsonb language plpgsql set search_path='' as $$
declare result jsonb:='[]';value jsonb;started timestamptz;sample integer;offset_value integer;bytes bigint;
begin
  for sample in 1..3 loop
    started:=clock_timestamp();bytes:=0;
    for offset_value in 0..29 loop value:=api.admin_catalog_page(100,offset_value*100);bytes:=bytes+octet_length(value::text);end loop;
    result:=result||jsonb_build_array(jsonb_build_object('sample',sample,'kind','full-catalog','calls',30,'ms',extract(epoch from clock_timestamp()-started)*1000,'jsonBytes',bytes));
    started:=clock_timestamp();value:=api.admin_catalog_context();
    result:=result||jsonb_build_array(jsonb_build_object('sample',sample,'kind','metadata','calls',1,'ms',extract(epoch from clock_timestamp()-started)*1000,'jsonBytes',octet_length(value::text)));
    started:=clock_timestamp();value:=api.admin_offer_list();
    result:=result||jsonb_build_array(jsonb_build_object('sample',sample,'kind','offers-page','calls',1,'ms',extract(epoch from clock_timestamp()-started)*1000,'jsonBytes',octet_length(value::text)));
    started:=clock_timestamp();value:=api.admin_import_conflicts((select jsonb_agg(jsonb_build_object('row',i+1,'slug','targeted-product-'||i,'name','Unused','brandId','','sku','TARGETED-'||i)) from generate_series(1,1000)i));
    if jsonb_array_length(value)<>1000 then raise exception 'Lost import conflict rows';end if;
    result:=result||jsonb_build_array(jsonb_build_object('sample',sample,'kind','import-1000-conflicts','calls',1,'ms',extract(epoch from clock_timestamp()-started)*1000,'jsonBytes',octet_length(value::text)));
  end loop;return result;
end$$;
grant execute on function aroma_targeted_test.measure() to authenticated;
set local role authenticated;
select 'PASS: Targeted catalog performance='||aroma_targeted_test.measure()::text;
reset role;
delete from private.admin_memberships where user_id=aroma_targeted_test.id(1);
set local role authenticated;
select aroma_targeted_test.error('select api.admin_catalog_context()','42501','Revoked administrator cannot reuse metadata RPC');
select aroma_targeted_test.error('select api.admin_import_conflicts(''[]'')','42501','Revoked administrator cannot validate private SKU identities');
reset role;
rollback;
