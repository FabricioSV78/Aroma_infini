-- Disposable SQL fixtures; no hosted requests or commercial classifications.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Only the isolated SQL runner may load family fixtures.';
  end if;
end $$;
create schema aroma_family_test;
grant usage on schema aroma_family_test to anon,authenticated,aro_catalog_admin_executor;
create function aroma_family_test.ok(p_value boolean,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %',p_label;end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_family_test.error(p_sql text,p_state text,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
declare v_state text;
begin
  begin execute p_sql;exception when others then get stacked diagnostics v_state=returned_sqlstate;end;
  if v_state is distinct from p_state then raise exception 'FAIL: %, expected %, got %',p_label,p_state,coalesce(v_state,'success');end if;
  return 'PASS: '||p_label;
end $$;
create function aroma_family_test.record(p_id uuid,p_codes jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('product',jsonb_build_object(
    'id',p_id,'name','Temporary family SQL fixture','slug','family-fixture-'||p_id::text,
    'brandId','72000000-0000-4000-8000-000000000001','productType','perfume',
    'family','Floral','olfactoryFamilies',p_codes,'image','/images/family-sql-fixture.webp','discount',null,
    'variants',jsonb_build_array(jsonb_build_object('id',p_id,'sku','FAMILY-'||p_id::text,'ml',100,'priceCents',18000,'stock',5,'active',true))),
    'detail',jsonb_build_object('shortDescription','SQL-only family fixture','description','SQL-only family fixture, never commercial.',
      'olfactoryImage','/images/family-sql-fixture.webp','intensityLevel',null,'occasion','','season','',
      'notes',jsonb_build_object('top','[]'::jsonb,'heart','[]'::jsonb,'base','[]'::jsonb),'recommendationIds','[]'::jsonb,
      'gallery',jsonb_build_array(jsonb_build_object('image','/images/family-sql-fixture.webp','framing','full'))),
    'active',true,'gender','unisex','popularity',0,'newest',0,'lowStockThreshold',2);
$$;
create table aroma_family_test.saved(name text primary key,value jsonb not null);
grant select,insert,update on aroma_family_test.saved to authenticated;
grant execute on all functions in schema aroma_family_test to anon,authenticated,aro_catalog_admin_executor;
insert into auth.users(id,email,raw_user_meta_data) values
 ('71000000-0000-4000-8000-000000000001','family-admin@example.invalid','{}'),
 ('71000000-0000-4000-8000-000000000002','family-customer@example.invalid','{"role":"admin"}');
insert into private.admin_memberships(user_id,active) values('71000000-0000-4000-8000-000000000001',true);
insert into app.brands(id,name,slug) values('72000000-0000-4000-8000-000000000001','Family SQL fixture','family-sql-fixture');
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
  values('74000000-0000-4000-8000-000000000001','local','/images/family-sql-fixture.webp','image/webp',800,1000,'ready',now());
select aroma_family_test.ok(not has_table_privilege('authenticated','app.olfactory_families','insert,update,delete')
  and not has_table_privilege('anon','app.olfactory_families','select'),'Family CRUD stays behind the bounded RPC layer');
select aroma_family_test.ok(not has_function_privilege('authenticated','private.catalog_validate_family_selection(uuid,jsonb)','execute'),'Browser roles cannot call internal classification helpers');
set local role anon;
select aroma_family_test.ok(jsonb_array_length(api.catalog_olfactory_families())=8,'Public vocabulary preserves the initial eight real family definitions');
select aroma_family_test.ok(api.catalog_olfactory_families()->0->>'value'='amaderado'
  and api.catalog_olfactory_families()->0->>'label'='Amaderada'
  and api.catalog_olfactory_families()->0->>'aromaLabel'='Amaderado','Initial labels, aromatic display forms and order are preserved');
select aroma_family_test.ok(not((api.catalog_olfactory_families()->0)?'version') and not((api.catalog_olfactory_families()->0)?'productCount'),'Public metadata omits administrative revisions and product counts');
select aroma_family_test.ok(jsonb_array_length(api.catalog_settings()->'olfactoryFamilies')=8,'Public settings return the vocabulary before products are parsed');
select aroma_family_test.error('select api.admin_olfactory_families()','42501','Anonymous cannot inspect administrative family metadata');
select aroma_family_test.error('select api.admin_save_olfactory_family(''Forbidden'')','42501','Anonymous cannot create a family');
reset role;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
set local role authenticated;
select aroma_family_test.error('select api.admin_save_olfactory_family(''Forbidden'')','42501','A customer cannot grant themselves family management through metadata');
select aroma_family_test.error('select api.admin_delete_olfactory_family(''floral'',1)','42501','Customer cannot delete vocabulary');
reset role;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_family_test.error('select api.admin_save_olfactory_family(''Forbidden'')','42501','An administrator still needs MFA to edit family definitions');
reset role;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
set local role authenticated;
insert into aroma_family_test.saved values('created',api.admin_save_olfactory_family('  Floral   frutal  '));
select aroma_family_test.ok((select value->'family'->>'value'='floral-frutal'
  and value->'family'->>'label'='Floral frutal' and value->'family'->>'aromaLabel'='Floral frutal'
  and value->'family'->>'version'='1' and value->'family'->>'productCount'='0' from aroma_family_test.saved where name='created'),'MFA administrator creates a stable code and normalized name without invented classifications');
select aroma_family_test.ok((api.admin_catalog_page()->'olfactoryFamilies'->8)?'version'
  and (api.admin_catalog_page()->'olfactoryFamilies'->8)?'productCount','Administrative catalog pages include revision and association counts');
select aroma_family_test.error('select api.admin_save_olfactory_family(''FLÓRAL  FRUTAL'')','23505','Accent, case and spacing variants cannot create duplicate names');
select aroma_family_test.error('select api.admin_save_olfactory_family(''floral-frutal'')','23505','A label cannot collide with an existing stable code');
select aroma_family_test.error('select api.admin_save_olfactory_family(''!!!'')','22023','Names without a usable identifier are rejected');
select aroma_family_test.error('select api.admin_save_olfactory_family(''Floral, frutal'')','22023','Commas cannot make a single family ambiguous with an Excel list of families');
select aroma_family_test.error('select api.admin_save_olfactory_family(repeat(''x'',81))','22023','Family names are bounded to eighty characters');
select aroma_family_test.error('select api.admin_save_olfactory_family(''Changed'',''floral-frutal'',true,99)','PT409','Stale taxonomy edits cannot overwrite a newer revision');
select aroma_family_test.error('select api.admin_save_olfactory_family(''Changed'',''missing'',true,1)','PT409','Editing a deleted or unknown family reports a conflict');
insert into aroma_family_test.saved values('renamed',api.admin_save_olfactory_family('Floral afrutada','floral-frutal',true,1));
select aroma_family_test.ok((select value->'family'->>'value'='floral-frutal' and value->'family'->>'label'='Floral afrutada'
  and value->'family'->'aliases' ? 'Floral frutal' and value->'family'->>'version'='2' from aroma_family_test.saved where name='renamed'),'Rename keeps the stable code and reserves the previous display name as an alias');
select aroma_family_test.error('select api.admin_save_olfactory_family(''Floral frutal'')','23505','A renamed family old alias cannot be reused for another identity');
select aroma_family_test.error('select api.admin_save_olfactory_family(''FLORAL AFRUTADA'')','23505','The current renamed label remains unique');
insert into aroma_family_test.saved values('product',api.admin_save_product(aroma_family_test.record('73000000-0000-4000-8000-000000000001','["floral","floral-frutal"]')));
select aroma_family_test.ok((api.admin_olfactory_families()->8->>'productCount')='1','Family usage counts distinct product associations');
select aroma_family_test.ok(api.admin_save_olfactory_family('Floral afrutada','floral-frutal',false,2)->'family'->>'active'='false','An assigned family can be deactivated without deleting its associations');
select aroma_family_test.error('select api.admin_delete_olfactory_family(''floral-frutal'',3)','23503','Used families cannot be deleted; their classification remains intact');
select aroma_family_test.ok(api.admin_save_product((select value->'record' from aroma_family_test.saved where name='product'),1)->>'version'='2','An existing product can retain its already assigned inactive family');
select aroma_family_test.error('select api.admin_save_product(aroma_family_test.record(''73000000-0000-4000-8000-000000000002'',''["floral-frutal"]''))','22023','An inactive family cannot be newly assigned to another product');
select aroma_family_test.error('select api.admin_save_product(aroma_family_test.record(''73000000-0000-4000-8000-000000000002'',''["invented-family"]''))','22023','Unknown identifiers cannot be assigned from a forged payload');
select aroma_family_test.error('select api.admin_save_product(aroma_family_test.record(''73000000-0000-4000-8000-000000000002'',''["floral","floral"]''))','22023','Duplicate product classifications are rejected');
select aroma_family_test.ok(api.admin_save_olfactory_family('Amaderada serena','amaderado',true,1)->'family'->'aliases' ? 'Amaderado','Renaming an original family preserves its previous aromatic form');
select aroma_family_test.error('select api.admin_save_olfactory_family(''AMADERADO'')','23505','A previous masculine aroma label cannot become a competing family');
select aroma_family_test.ok(api.admin_save_olfactory_family('Especiada seca')->'family'->>'value'='especiada-seca','A genuinely new family derives its code from the confirmed label');
select aroma_family_test.error('select api.admin_delete_olfactory_family(''especiada-seca'',99)','PT409','Deletion requires the current revision');
select api.admin_delete_olfactory_family('especiada-seca',1);
reset role;
select aroma_family_test.ok(not exists(select 1 from app.olfactory_families where code='especiada-seca'),'An unused family can be deleted individually');
select aroma_family_test.ok((select merchant_sku='FAMILY-73000000-0000-4000-8000-000000000001' and ml=100 and price_cents=18000 and stock=5 from app.product_variants where id='73000000-0000-4000-8000-000000000001'),'Family management and deactivation preserve presentation SKU, size, price and stock');
select aroma_family_test.ok((select product_code>=10000 and olfactory_media_id='74000000-0000-4000-8000-000000000001' and active from app.products where id='73000000-0000-4000-8000-000000000001')
  and (select media_id='74000000-0000-4000-8000-000000000001' and position=0 from app.product_images where product_id='73000000-0000-4000-8000-000000000001'),'Family changes do not rewrite internal codes, product visibility or image references');
set local role anon;
select aroma_family_test.ok(api.catalog_olfactory_families()->8->>'active'='false'
  and api.catalog_olfactory_families()->8->'aliases' ? 'Floral frutal','Public metadata retains inactive definitions and aliases for existing product display');
select aroma_family_test.ok(api.catalog_product('family-fixture-73000000-0000-4000-8000-000000000001')->'product'->'olfactoryFamilies' ? 'floral-frutal','Deactivation does not erase published product classification');
reset role;
-- Additional vocabulary exists only inside this rolled-back test transaction.
insert into app.olfactory_families(code,label,aroma_label,sort_order)
select 'fixture-'||n,'Fixture family '||n,'Fixture family '||n,100+n from generate_series(1,25) n;
set local role authenticated;
select aroma_family_test.ok(jsonb_array_length(api.admin_save_product(aroma_family_test.record('73000000-0000-4000-8000-000000000002',
  (select jsonb_agg(f->>'value') from (select value f from jsonb_array_elements(api.catalog_olfactory_families()) where (value->>'active')::boolean order by value->>'value' limit 32) q)))
  ->'record'->'product'->'olfactoryFamilies')=32,'The product command supports thirty-two explicit existing families');
select aroma_family_test.error('select api.admin_save_product(aroma_family_test.record(''73000000-0000-4000-8000-000000000003'',(select jsonb_agg(f->>''value'') from (select value f from jsonb_array_elements(api.catalog_olfactory_families()) where (value->>''active'')::boolean order by value->>''value'' limit 33)q)))','22023','Product classifications remain bounded at thirty-two');
reset role;
insert into app.olfactory_families(code,label,aroma_label,sort_order)
select 'limit-fixture-'||n,'Limit fixture family '||n,'Limit fixture family '||n,1000+n
  from generate_series(1,500-(select count(*)::integer from app.olfactory_families))n;
set local role authenticated;
select aroma_family_test.ok(jsonb_array_length(api.admin_olfactory_families())=500,'Vocabulary reads stay bounded by the managed five-hundred-family limit');
select aroma_family_test.error('select api.admin_save_olfactory_family(''One too many'')','22023','Creating beyond five hundred managed definitions is rejected');
reset role;
set constraints all immediate;
rollback;
