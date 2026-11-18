begin;
do $$begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then raise exception 'Use only the isolated SQL runner.';end if;
end$$;
insert into app.brands(id,name,slug,active) values('e0310001-0000-4000-8000-000000000001','Profile Fixture','profile-fixture',true);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at)
values('e0310002-0000-4000-8000-000000000001','local','/images/profile-fixture.webp','image/webp',800,1000,'ready',now());
insert into app.products(id,name,slug,brand_id,gender,aromatic_profile,short_description,description,active,display_rank,intensity_level,occasion)
select ('e0310003-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Profile '||i,'profile-fixture-'||i,'e0310001-0000-4000-8000-000000000001','unisex',
case when i%2=1 then 'Floral' else 'FLORAL' end,'Fixture','Local only',i<>32,i,2,case when i%2=1 then 'Oficina' else 'OFICINA' end from generate_series(1,32)i;
insert into app.product_variants(product_id,merchant_sku,ml,price_cents,stock,active)
select ('e0310003-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'PROFILE-FIXTURE-'||i,50,12000,case when i=31 then 0 else 5 end,true from generate_series(1,32)i;
insert into app.product_images(product_id,position,media_id)
select ('e0310003-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,0,'e0310002-0000-4000-8000-000000000001' from generate_series(1,32)i;
set constraints all immediate;
set local role anon;
do $$declare v jsonb;p jsonb;begin
  v:=api.catalog_home_context();
  if (v->>'finderAvailableCount')::integer<>30 then raise exception 'Compaction must preserve the full eligible perfume count';end if;
  select jsonb_agg(profile order by ordinal) into p from jsonb_array_elements(v->'profiles') with ordinality x(profile,ordinal)
  where profile->>'brandId'='e0310001-0000-4000-8000-000000000001';
  if jsonb_array_length(p)<>4 or p->0->>'occasion'<>'Oficina' or p->1->>'occasion'<>'OFICINA' or p->2->>'occasion'<>'Oficina' or p->3->>'occasion'<>'OFICINA' then
    raise exception 'Home must retain first and last occurrences in original order';
  end if;
  if jsonb_array_length(v->'items')>4 or exists(select 1 from jsonb_array_elements(v->'items') i where i->'product'->>'slug' in('profile-fixture-31','profile-fixture-32')) then
    raise exception 'Unavailable products or oversized selection escaped publication rules';
  end if;
  raise notice 'PASS: Home compacts repeats, preserves first/last label order and publication rules';
end$$;
reset role;
do $$begin
  if not exists(select 1 from pg_proc where oid='api.catalog_home_context()'::regprocedure and proowner='aro_api_executor'::regrole and prosecdef and provolatile='s' and proconfig=array['search_path=""']) then raise exception 'Home security contract changed';end if;
  if has_function_privilege('service_role','api.catalog_home_context()','execute') then raise exception 'Unexpected service-role grant';end if;
  raise notice 'PASS: Home projection preserves its owner, privileges, STABLE and search path';
end$$;
rollback;
