-- Manage the existing family vocabulary without reclassifying any product.
-- Existing stable codes, product UUIDs, commercial SKUs and media stay intact.
alter table app.olfactory_families
  drop constraint olfactory_families_supported_code,
  add constraint olfactory_families_code_format check (char_length(code) between 1 and 64 and code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint olfactory_families_label_format check (char_length(label) between 1 and 80 and label=btrim(regexp_replace(label,'[[:space:]]+',' ','g')) and label !~ '[[:cntrl:]]'),
  add column name_key text generated always as (private.catalog_name_key(label)) stored,
  add column aroma_label text,
  add column active boolean not null default true,
  add column version bigint not null default 1 check (version>=1),
  add column aliases text[] not null default '{}'::text[],
  add column sort_order integer not null default 0 check (sort_order>=0),
  add constraint olfactory_families_name_unique unique(name_key);

update app.olfactory_families set
  aroma_label=case code when 'amaderado' then 'Amaderado' when 'citrico' then 'Cítrico'
    when 'aromatico' then 'Aromático' when 'fresco' then 'Fresco' else label end,
  sort_order=case code when 'amaderado' then 0 when 'floral' then 1 when 'verde' then 2 when 'ambar' then 3
    when 'citrico' then 4 when 'aromatico' then 5 when 'fresco' then 6 when 'gourmand' then 7 end;
alter table app.olfactory_families alter column aroma_label set not null,
  add constraint olfactory_families_aroma_format check (char_length(aroma_label) between 1 and 80 and aroma_label=btrim(regexp_replace(aroma_label,'[[:space:]]+',' ','g')) and aroma_label !~ '[[:cntrl:]]');

create function private.olfactory_aliases_valid(p_values text[])
returns boolean language sql immutable security invoker set search_path='' as $$
  select cardinality(p_values)<=100 and array_position(p_values,null) is null
    and not exists(select 1 from unnest(p_values) value where char_length(value) not between 1 and 80
      or value<>btrim(regexp_replace(value,'[[:space:]]+',' ','g')) or value ~ '[[:cntrl:]]');
$$;
alter table app.olfactory_families add constraint olfactory_families_aliases_valid check(private.olfactory_aliases_valid(aliases));
alter table app.product_olfactory_families drop constraint product_olfactory_families_position_check,
  add constraint product_olfactory_families_position_check check(position between 0 and 31);

grant insert,update,delete on app.olfactory_families to aro_catalog_admin_executor;
create policy catalog_admin_family_write on app.olfactory_families to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));

create function private.olfactory_slug(p_value text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select btrim(regexp_replace(private.catalog_name_key(p_value),'[^a-z0-9]+','-','g'),'-');
$$;
create function private.olfactory_family_document(p_code text,p_admin boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('value',f.code,'label',f.label,'aromaLabel',f.aroma_label,'active',f.active,'aliases',to_jsonb(f.aliases))
    || case when p_admin then jsonb_build_object('version',f.version,'productCount',
      (select count(*) from app.product_olfactory_families p where p.family_code=f.code)) else '{}'::jsonb end
  from app.olfactory_families f where f.code=p_code;
$$;
create function private.catalog_validate_family_selection(p_product_id uuid,p_codes jsonb)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_codes) is distinct from 'array' or jsonb_array_length(p_codes)>32
    or exists(select 1 from jsonb_array_elements(p_codes) v where jsonb_typeof(v) is distinct from 'string') then
    raise exception 'Selecciona hasta 32 familias olfativas válidas.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements_text(p_codes) value
      group by value having count(*)>1) then
    raise exception 'Selecciona familias olfativas sin repetir.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements_text(p_codes) value
      left join app.olfactory_families f on f.code=value
      where f.code is null or (not f.active and not exists(select 1 from app.product_olfactory_families p
        where p.product_id=p_product_id and p.family_code=f.code))) then
    raise exception 'Una familia ya no está disponible para nuevas asignaciones. Actualiza la selección.' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.olfactory_aliases_valid(text[]),private.olfactory_slug(text),
  private.olfactory_family_document(text,boolean),private.catalog_validate_family_selection(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.olfactory_aliases_valid(text[]),private.olfactory_slug(text),private.olfactory_family_document(text,boolean)
  to aro_api_executor,aro_catalog_admin_executor;
grant execute on function private.catalog_validate_family_selection(uuid,jsonb) to aro_catalog_admin_executor;

create function api.catalog_olfactory_families()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(private.olfactory_family_document(code,false) order by sort_order,code),'[]'::jsonb)
    from app.olfactory_families;
$$;
create function api.admin_olfactory_families()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin();
  return (select coalesce(jsonb_agg(private.olfactory_family_document(code,true) order by sort_order,code),'[]'::jsonb)
    from app.olfactory_families);
end;
$$;
create function api.admin_save_olfactory_family(p_label text,p_code text default null,p_active boolean default true,p_expected_version bigint default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_label text;v_code text;v_previous app.olfactory_families%rowtype;v_aroma text;v_aliases text[];v_terms text[];
begin
  perform private.require_catalog_admin();
  if p_label is null or p_label ~ '[[:cntrl:],]' or p_active is null then
    raise exception 'Escribe un nombre válido para la familia olfativa.' using errcode='22023';
  end if;
  v_label:=btrim(regexp_replace(p_label,'[[:space:]]+',' ','g'));
  if char_length(v_label) not between 1 and 80 or private.olfactory_slug(v_label)='' then
    raise exception 'Usa un nombre de 1 a 80 caracteres con letras o números.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(714482393);
  if p_code is null then
    if p_expected_version is not null then raise exception 'La familia ya no está disponible.' using errcode='PT409';end if;
    if (select count(*) from app.olfactory_families)>=500 then
      raise exception 'El catálogo admite hasta 500 familias olfativas.' using errcode='22023';
    end if;
    v_code:=rtrim(left(private.olfactory_slug(v_label),64),'-');
    v_aroma:=v_label;v_aliases:='{}';
  else
    select * into v_previous from app.olfactory_families where code=p_code for update;
    if not found or p_expected_version is null or p_expected_version<>v_previous.version then
      raise exception 'La familia cambió en otra sesión. Actualiza la lista antes de guardar.' using errcode='PT409';
    end if;
    v_code:=v_previous.code;
    v_aroma:=case when v_label=v_previous.label then v_previous.aroma_label else v_label end;
    select coalesce(array_agg(value order by first_position),'{}'::text[]) into v_aliases from (
      select value,min(ordinality) as first_position
      from unnest(v_previous.aliases||array[v_previous.label,v_previous.aroma_label]) with ordinality t(value,ordinality)
      where value<>v_label and value<>v_aroma group by value
    ) q;
    if cardinality(v_aliases)>100 then
      raise exception 'Esta familia alcanzó su límite de nombres anteriores. Contacta al equipo de soporte.' using errcode='22023';
    end if;
  end if;
  v_terms:=array[v_code,v_label,v_aroma]||v_aliases;
  -- Normalize each old/new term once, then join their keys. This avoids
  -- repeatedly normalizing a 500-family vocabulary for every retained alias.
  -- Equal normalized labels necessarily have the same slug key as well.
  if exists(with proposed as materialized (
      select distinct private.olfactory_slug(value) as key from unnest(v_terms) value
    ), registered as materialized (
      select private.olfactory_slug(value) as key from app.olfactory_families f
      cross join lateral unnest(array[f.code,f.label,f.aroma_label]||f.aliases) value
      where f.code<>coalesce(v_previous.code,'')
    ) select 1 from proposed join registered using(key)) then
    raise exception 'Ese nombre o uno de sus nombres anteriores ya identifica otra familia.' using errcode='23505';
  end if;
  if v_previous.code is null then
    insert into app.olfactory_families(code,label,aroma_label,active,aliases,sort_order)
      values(v_code,v_label,v_aroma,p_active,v_aliases,(select coalesce(max(sort_order),-1)+1 from app.olfactory_families));
  else
    update app.olfactory_families set label=v_label,aroma_label=v_aroma,active=p_active,
      aliases=v_aliases,version=version+1 where code=v_code;
  end if;
  return jsonb_build_object('family',private.olfactory_family_document(v_code,true));
end;
$$;
create function api.admin_delete_olfactory_family(p_code text,p_expected_version bigint)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  perform pg_advisory_xact_lock(714482393);
  select version into v_version from app.olfactory_families where code=p_code for update;
  if not found or p_expected_version is null or p_expected_version<>v_version then
    raise exception 'La familia cambió en otra sesión. Actualiza la lista.' using errcode='PT409';
  end if;
  if exists(select 1 from app.product_olfactory_families where family_code=p_code) then
    raise exception 'Esta familia está asignada a productos. Desactívala para dejar de ofrecerla en nuevas asignaciones.' using errcode='23503';
  end if;
  delete from app.olfactory_families where code=p_code;
end;
$$;

-- Existing settings/page contracts acquire the vocabulary before their callers
-- parse product classifications; no extra per-product request is required.
create or replace function api.catalog_settings()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('features',jsonb_build_object('complementsEnabled',s.complements_enabled),
    'featuredBrandId',(select b.id from app.brands b where b.id=s.featured_brand_id and b.active),
    'olfactoryFamilies',api.catalog_olfactory_families())
  from app.store_settings s where s.singleton;
$$;
do $$
declare v_definition text;v_marker text;
begin
  v_definition:=pg_get_functiondef('api.admin_catalog_page(integer,integer)'::regprocedure);
  v_marker:='  return pg_catalog.jsonb_build_object(';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected administrative catalog definition';end if;
  execute replace(v_definition,v_marker,v_marker||E'\n    ''olfactoryFamilies'',api.admin_olfactory_families(),');

  v_definition:=pg_get_functiondef('api.admin_save_product(jsonb,bigint)'::regprocedure);
  v_marker:='  perform pg_catalog.pg_advisory_xact_lock(714482392);';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected SKU lock boundary';end if;
  v_definition:=replace(v_definition,v_marker,'  perform pg_catalog.pg_advisory_xact_lock(714482393);'||chr(10)||v_marker);
  v_marker:='  p_record := private.catalog_prepare_variant_skus(pg_catalog.jsonb_build_array(p_record))->0;';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected SKU preparation boundary';end if;
  v_definition:=replace(v_definition,v_marker,'  perform private.catalog_validate_family_selection(v_id,v_product->''olfactoryFamilies'');'||chr(10)||v_marker);
  v_definition:=replace(v_definition,'pg_catalog.jsonb_array_length(v_product->''olfactoryFamilies'') > 8',
    'pg_catalog.jsonb_array_length(v_product->''olfactoryFamilies'') > 32');
  execute v_definition;

  -- The import prepares all SKU values before calling individual saves. Take
  -- the same taxonomy-before-SKU lock order there to avoid an inverted lock.
  v_definition:=pg_get_functiondef('private.catalog_prepare_variant_skus(jsonb)'::regprocedure);
  v_marker:='  perform pg_catalog.pg_advisory_xact_lock(714482392);';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected import SKU preparation definition';end if;
  execute replace(v_definition,v_marker,'  perform pg_catalog.pg_advisory_xact_lock(714482393);'||chr(10)||v_marker);
end $$;

grant create on schema api to aro_api_executor,aro_catalog_admin_executor;
alter function api.catalog_olfactory_families() owner to aro_api_executor;
alter function api.admin_olfactory_families() owner to aro_catalog_admin_executor;
alter function api.admin_save_olfactory_family(text,text,boolean,bigint) owner to aro_catalog_admin_executor;
alter function api.admin_delete_olfactory_family(text,bigint) owner to aro_catalog_admin_executor;
revoke create on schema api from aro_api_executor,aro_catalog_admin_executor;
revoke all on function api.catalog_olfactory_families(),api.admin_olfactory_families(),
  api.admin_save_olfactory_family(text,text,boolean,bigint),api.admin_delete_olfactory_family(text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function api.catalog_olfactory_families() to anon,authenticated,aro_api_executor;
grant execute on function api.admin_olfactory_families(),api.admin_save_olfactory_family(text,text,boolean,bigint),
  api.admin_delete_olfactory_family(text,bigint) to authenticated,aro_catalog_admin_executor;
