-- Large fixtures exist only in the runner's disposable PostgreSQL transaction.
begin;
do $$begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Use only the isolated SQL runner.';end if;
end$$;
create schema aroma_workspace_test;
grant usage on schema aroma_workspace_test to anon,authenticated,service_role;
create function aroma_workspace_test.id(i integer) returns uuid language sql immutable set search_path='' as $$
  select ('e0320000-0000-4000-8000-'||pg_catalog.lpad(i::text,12,'0'))::uuid;
$$;
create function aroma_workspace_test.ok(value boolean,label text) returns text language plpgsql set search_path='' as $$
begin if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function aroma_workspace_test.error(statement text,state text,label text) returns text language plpgsql set search_path='' as $$
declare actual text;begin begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
if actual is distinct from state then raise exception 'FAIL: %, expected %, got %',label,state,coalesce(actual,'success');end if;return 'PASS: '||label;end$$;
grant execute on all functions in schema aroma_workspace_test to anon,authenticated,service_role;

insert into auth.users(id,email,encrypted_password) select aroma_workspace_test.id(i),'workspace-'||i||'@example.invalid','local-fixture-only' from generate_series(1,2002)i;
insert into private.admin_memberships(user_id) values(aroma_workspace_test.id(1));
insert into app.brands(id,name,slug,active) values(aroma_workspace_test.id(3000),'Marca de escala','marca-escala',true);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
values(aroma_workspace_test.id(3001),'local','/images/bois-960.webp','image/webp',800,1000,'ready',now());
insert into app.products(id,name,slug,brand_id,gender,aromatic_profile,short_description,description,active,intensity_level,occasion,low_stock_threshold,created_at)
select aroma_workspace_test.id(10000+i),case when i%31=0 then 'Ámbar ' when i%23=0 then 'Ñandú ' else 'Perfume ' end||lpad(i::text,5,'0'),
 'workspace-'||i,aroma_workspace_test.id(3000),'unisex','Floral','Datos de prueba local','Descripción de prueba local',i%7<>0 and i%13<>0,2,'Diario',3,
 '2026-11-01'::timestamptz+(i||' seconds')::interval from generate_series(1,3000)i;
insert into app.product_variants(id,product_id,merchant_sku,ml,price_cents,stock,active)
select aroma_workspace_test.id(20000+i),aroma_workspace_test.id(10000+i),'WORKSPACE-'||i,50,12000,i%15,true from generate_series(1,3000)i;
insert into app.product_variants(id,product_id,merchant_sku,ml,price_cents,stock,active)
select aroma_workspace_test.id(23000+i),aroma_workspace_test.id(10000+i),'INACTIVE-WORKSPACE-'||i,100,22000,999,false from generate_series(1,3000)i;
insert into app.product_images(product_id,position,media_id) select aroma_workspace_test.id(10000+i),0,aroma_workspace_test.id(3001) from generate_series(1,3000)i where i%13<>0;
insert into app.product_olfactory_families(product_id,family_code,position) select aroma_workspace_test.id(10000+i),'floral',0 from generate_series(1,3000)i;
insert into app.orders(id,reference,user_id,operation_id,tracking_hash,request_hash,mode,first_name,last_name,email,phone,delivery_method,
 subtotal_cents,product_discount_cents,discount_cents,shipping_cents,total_cents,shipping_estimate,department,province,district,street,status,placed_at)
select aroma_workspace_test.id(30000+i),'AI-ESCALA-'||lpad(i::text,5,'0'),aroma_workspace_test.id(3+(i%2000)),aroma_workspace_test.id(40000+i),repeat('a',64),repeat('b',64),'demo-account',
 'José '||(i%2000),'Apellido','cliente-'||(i%2000)||'@example.invalid','999999999','courier',12000,0,0,1000,13000,'Prueba local','lima','1501','150101','Calle de prueba 123',
 (array['received','preparing','shipped','delivered'])[1+i%4], '2026-11-01 00:00:00+00'::timestamptz+(i||' minutes')::interval from generate_series(1,6000)i;
insert into app.order_items(order_id,position,product_id,variant_id,product_name,product_code,product_slug,image_source,brand_name,ml,quantity,unit_price_cents,original_unit_price_cents)
select aroma_workspace_test.id(30000+i),0,aroma_workspace_test.id(10001),aroma_workspace_test.id(20001),'Perfume 00001','10000','workspace-1','/images/bois-960.webp','Marca de escala',50,1,12000,12000 from generate_series(1,6000)i;
set constraints all immediate;
set constraints all deferred;
analyze app.products,app.product_variants,app.orders,app.order_items;

-- Later features may create their own tables/primary keys; this historical
-- assertion protects the indexes of the pre-pagination tables only.
select aroma_workspace_test.ok((select count(*)=120 from pg_indexes where schemaname in('app','private') and tablename not in('order_stock_reservations','media_builtin_bindings','admin_push_policy')),'Workspace pagination adds no indexes to existing tables');
set local role anon;
select aroma_workspace_test.error('select api.admin_product_list()','42501','Anonymous cannot read paged products');
select aroma_workspace_test.error('select api.admin_order_list()','42501','Anonymous cannot read paged orders');
select aroma_workspace_test.error('select api.admin_customer_list()','42501','Anonymous cannot read paged customers');
reset role;
set local role service_role;
select aroma_workspace_test.error('select api.admin_product_list()','42501','Service credentials do not receive the paged administrative RPC grant');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_workspace_test.id(2),'aal','aal2')::text,true);
set local role authenticated;
select aroma_workspace_test.error('select api.admin_product_list()','42501','Customer AAL2 cannot read admin products');
select aroma_workspace_test.error('select api.admin_order_list()','42501','Customer AAL2 cannot read admin orders');
select aroma_workspace_test.error('select api.admin_customer_list()','42501','Customer AAL2 cannot read admin customers');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_workspace_test.id(1),'aal','aal1')::text,true);
set local role authenticated;
select aroma_workspace_test.error('select api.admin_product_list()','42501','Administrator AAL1 still requires MFA');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',aroma_workspace_test.id(1),'aal','aal2')::text,true);
set local role authenticated;
select aroma_workspace_test.ok((api.admin_product_list()->>'total')::integer=3000 and jsonb_array_length(api.admin_product_list()->'products')=12,'Three thousand products send twelve canonical records');
select aroma_workspace_test.ok(jsonb_array_length(api.admin_product_list('{}',1,4)->'products')=4,'Mobile requests four product records only');
select aroma_workspace_test.ok((api.admin_product_list('{}',1,12)->'products'->0->'product'->>'id') is distinct from (api.admin_product_list('{}',2,12)->'products'->0->'product'->>'id'),'Product page two advances remotely');
select aroma_workspace_test.ok(jsonb_array_length(api.admin_product_list('{}',2147483647,12)->'products')=12,'Out-of-range product pages clamp to the last real page');
select aroma_workspace_test.ok((api.admin_product_list('{"search":"WORKSPACE-2911"}')->>'total')::integer=1,'Variant SKU search is applied before LIMIT');
select aroma_workspace_test.ok((api.admin_product_list('{"search":"not-present"}')->>'total')::integer=0 and api.admin_product_list('{"search":"not-present"}')->'products'='[]','Empty product results keep a valid total');
select aroma_workspace_test.ok((api.admin_product_list('{"visibility":"pending-images"}')->>'total')::integer=230,'Pending-photo filtering preserves missing-main rule');
select aroma_workspace_test.ok((api.admin_product_list('{"stock":"out"}')->>'total')::integer=200,'Inactive presentation stock cannot hide exhaustion');
select aroma_workspace_test.ok((api.admin_order_list()->>'total')::integer=6000 and jsonb_array_length(api.admin_order_list()->'orders')=20,'Six thousand orders send twenty canonical records');
select aroma_workspace_test.ok((api.admin_order_list('{"status":"preparing"}')->>'total')::integer=1500,'Order state filtering returns exact server counts');
select aroma_workspace_test.ok((api.admin_order_list('{"search":"jose"}')->>'total')::integer=6000,'Order search folds accents exactly as the existing search');
select aroma_workspace_test.ok((api.admin_order_list('{"search":"La Victoria"}')->>'total')::integer=0,'Order destination search uses actual location labels');
select aroma_workspace_test.ok((api.admin_order_list('{"from":"2026-11-01","until":"2026-11-01"}')->>'total')::integer=1440,'Order dates keep Lima calendar boundaries');
select aroma_workspace_test.ok(api.admin_order_list('{}',1,20)->'orderHistory'='[]','List views do not fetch invisible status histories');
select aroma_workspace_test.ok(jsonb_array_length(api.admin_order_list('{}',1,20,'selection')->'selection')=6000 and not (api.admin_order_list('{}',1,20,'selection')->'selection'->0?'lines'),'Select all retrieves filtered workflow headers without order lines');
select aroma_workspace_test.ok((api.admin_customer_list()->>'total')::integer=0,'Two thousand simulation-only customers remain excluded from commercial Customers');
select aroma_workspace_test.error('select api.admin_product_list(''{"stock":"unknown"}'')','22023','Unknown product filters are rejected');
select aroma_workspace_test.error('select api.admin_order_list(''{"status":"paid"}'')','22023','Payment states cannot replace fulfilment filters');
select aroma_workspace_test.error('select api.admin_product_list(''{}'',1,101)','22023','Product page size is bounded');
select aroma_workspace_test.error('select api.admin_order_list(''{}'',1,101)','22023','Order page size is bounded');
select aroma_workspace_test.ok(jsonb_array_length(api.admin_order_list('{"references":["AI-ESCALA-00001"]}',1,100,'details')->'orders')=1,'Explicit detail read retrieves its selected order only');
reset role;

-- Equivalence uses each existing canonical document helper under its existing
-- restricted owner, never a second hand-maintained DTO or altered RLS policy.
do $$declare v jsonb;expected jsonb;ids uuid[];q jsonb;plan jsonb;measurements jsonb:='[]';started timestamptz;elapsed numeric;bytes bigint;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',aroma_workspace_test.id(1),'aal','aal2')::text,true);
  foreach q in array array['{}'::jsonb,'{"stock":"alert"}'::jsonb,'{"visibility":"inactive"}'::jsonb] loop
    v:=api.admin_product_list(q,2,12);
    select array_agg((r->'product'->>'id')::uuid order by n) into ids from jsonb_array_elements(v->'products') with ordinality x(r,n);
    select jsonb_agg(private.admin_product_document(id) order by n) into expected from unnest(ids) with ordinality x(id,n);
    if v->'products' is distinct from expected then raise exception 'Canonical paged product DTO differs';end if;
  end loop;
  raise notice 'PASS: Paged product rows equal canonical detail documents';
  v:=api.admin_order_list('{}',2,20);
  select jsonb_agg(private.order_document((r->>'id')::uuid) order by n) into expected from jsonb_array_elements(v->'orders') with ordinality x(r,n);
  if v->'orders' is distinct from expected then raise exception 'Canonical paged order DTO differs';end if;
  raise notice 'PASS: Paged order rows equal canonical detail documents';
  -- Store explain plans/timings in a normal assertion result below, not only a
  -- function-name claim. The fixture transaction is rolled back at the end.
end$$;
select 'PASS: workspace-browser-samples='||jsonb_build_object(
  'products1',api.admin_product_list('{}',1,12),'products2',api.admin_product_list('{}',2,12),
  'productsMobile',api.admin_product_list('{}',1,4),'orders1',api.admin_order_list('{}',1,20),'orders2',api.admin_order_list('{}',2,20),
  'selection',api.admin_order_list('{"search":"AI-ESCALA-059"}',1,20,'selection'))::text;

create function aroma_workspace_test.measure() returns jsonb language plpgsql set search_path='' as $$
declare results jsonb:='[]';sample integer;offset_value integer;started timestamptz;value jsonb;bytes bigint;plan jsonb;query text;
begin
  for sample in 1..3 loop
    bytes:=0;started:=clock_timestamp();
    for offset_value in 0..29 loop
      value:=api.admin_catalog_page(100,offset_value*100);bytes:=bytes+octet_length(value::text);
    end loop;
    results:=results||jsonb_build_array(jsonb_build_object('sample',sample,'kind','products-before','calls',30,'rows',3000,'ms',extract(epoch from clock_timestamp()-started)*1000,'jsonBytes',bytes));
    started:=clock_timestamp();value:=api.admin_product_list('{}',1,12);
    results:=results||jsonb_build_array(jsonb_build_object('sample',sample,'kind','products-after','calls',1,'rows',jsonb_array_length(value->'products'),'ms',extract(epoch from clock_timestamp()-started)*1000,'jsonBytes',octet_length(value::text)));
    bytes:=0;started:=clock_timestamp();
    for offset_value in 0..59 loop
      value:=api.admin_orders(100,offset_value*100);bytes:=bytes+octet_length(value::text);
    end loop;
    results:=results||jsonb_build_array(jsonb_build_object('sample',sample,'kind','orders-before','calls',60,'rows',6000,'ms',extract(epoch from clock_timestamp()-started)*1000,'jsonBytes',bytes));
    started:=clock_timestamp();value:=api.admin_order_list('{}',1,20);
    results:=results||jsonb_build_array(jsonb_build_object('sample',sample,'kind','orders-after','calls',1,'rows',jsonb_array_length(value->'orders'),'ms',extract(epoch from clock_timestamp()-started)*1000,'jsonBytes',octet_length(value::text)));
  end loop;
  foreach query in array array['select api.admin_catalog_page(100,0)','select api.admin_product_list(''{}'',1,12)',
    'select api.admin_orders(100,0)','select api.admin_order_list(''{}'',1,20)','select api.admin_customer_list('''',1,25)'] loop
    execute 'explain(analyze,buffers,format json) '||query into plan;
    results:=results||jsonb_build_array(jsonb_build_object('query',query,'explain',plan));
  end loop;
  return results;
end$$;
select 'PASS: workspace-performance='||aroma_workspace_test.measure()::text;

do $$declare value jsonb;changes jsonb;begin
  select jsonb_agg(jsonb_build_object('reference',reference,'expectedVersion',version)) into changes
  from(select reference,version from app.orders where status='received' order by reference limit 50) selected;
  value:=api.admin_set_order_statuses(changes,'preparing',aroma_workspace_test.id(999999),false,'bulk');
  if jsonb_array_length(value->'updated')<>50 or (api.admin_order_list('{"status":"preparing"}')->>'total')::integer<>1550 then
    raise exception 'Bulk mutation is not reflected in fresh paged counts';end if;
end$$;
select aroma_workspace_test.ok((api.admin_order_list('{"status":"preparing"}')->>'total')::integer=1550,'Bulk changes invalidate no hidden cache and return fresh paged totals');
do $$declare v jsonb;changes jsonb;op uuid:=aroma_workspace_test.id(999998);before_count integer;begin
  select jsonb_agg(jsonb_build_object('reference',reference,'expectedVersion',version)) into changes
  from(select reference,version from app.orders where status='received' order by reference limit 10) selected;
  v:=api.admin_set_order_statuses_page(changes,'preparing',op,false,'bulk','{"status":"preparing"}',1,20);
  if jsonb_array_length(v->'updated')<>10 or (v->'page'->>'total')::integer<>1560 or jsonb_array_length(v->'page'->'orders')<>20 then
    raise exception 'Atomic status page does not reflect canonical committed changes';end if;
  v:=api.admin_set_order_statuses_page(changes,'preparing',op,false,'bulk','{"status":"preparing"}',1,20);
  if (v->'page'->>'total')::integer<>1560 then raise exception 'Idempotent status replay duplicates changes';end if;
  v:=api.admin_product_list('{}',1,12);
  if coalesce(jsonb_array_length(v->'products'->0->'product'->'variants'),0)=0 then raise exception 'Paged product fixture lacks variants: %',v->'products'->0;end if;
  v:=api.admin_save_product_page((v->'products'->0)||'{"active":false}',(v->'productVersions'->>(v->'products'->0->'product'->>'id'))::bigint,'{}',1,12);
  if jsonb_array_length(v->'page'->'products')<>12 then raise exception 'Atomic product page is not bounded';end if;
end$$;
select aroma_workspace_test.ok((api.admin_order_list('{"status":"preparing"}')->>'total')::integer=1560,'Atomic mutation pages include exact counts and idempotent replay');
update private.admin_memberships set active=false where user_id=aroma_workspace_test.id(1);
set local role authenticated;
select aroma_workspace_test.error('select api.admin_order_list()','42501','Revoked membership cannot read a previously visited order page');
select aroma_workspace_test.error('select api.admin_product_list()','42501','Revoked membership cannot read a previously visited product page');
reset role;
rollback;
