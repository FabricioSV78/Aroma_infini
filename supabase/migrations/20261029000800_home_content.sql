-- Versioned Home content and verified media references. No local browser data,
-- illustrative assets, products or merchant content are imported by migration.
create table app.home_document (
  singleton boolean primary key default true check(singleton),
  media jsonb not null check(jsonb_typeof(media)='object'),
  content jsonb not null check(jsonb_typeof(content)='object' and not(content ? 'featuredBrandId')),
  version bigint not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table app.home_media (
  slot text[] primary key check(cardinality(slot) between 2 and 5),
  singleton boolean not null default true references app.home_document(singleton) on delete cascade,
  media_id uuid not null references app.media_assets(id) on delete restrict
);
create index home_media_asset_idx on app.home_media(media_id);
alter table app.home_document enable row level security;
alter table app.home_media enable row level security;
revoke all on app.home_document,app.home_media from public,anon,authenticated,service_role;
grant select on app.home_document,app.home_media to aro_api_executor,aro_media_executor,aro_catalog_admin_executor;
grant insert,update on app.home_document to aro_catalog_admin_executor;
grant insert,update,delete on app.home_media to aro_catalog_admin_executor;
create policy home_public_document on app.home_document for select to aro_api_executor using(true);
create policy home_public_media on app.home_media for select to aro_api_executor using(true);
create policy home_gc_document on app.home_document for select to aro_media_executor using(true);
create policy home_gc_media on app.home_media for select to aro_media_executor using(true);
create policy home_admin_document on app.home_document to aro_catalog_admin_executor
  using((select private.is_admin())) with check((select private.is_admin()));
create policy home_admin_media on app.home_media to aro_catalog_admin_executor
  using((select private.is_admin())) with check((select private.is_admin()));

-- Existing WebP rules retain their product caps. Other placements acquire
-- their own verified profile; videos never enter the image receipt API.
alter table app.media_assets drop constraint media_assets_purpose_check,
  add constraint media_assets_purpose_check check(purpose in
    ('product-gallery','product-olfactory','category','hero-desktop','hero-mobile',
     'finder-desktop','finder-mobile','finder-option','film-poster','film-video')),
  drop constraint media_assets_byte_size_check,
  add constraint media_assets_byte_size_check check(byte_size>0 and
    byte_size<=case when purpose='film-video' then 10485760 else 4194304 end),
  add column duration_ms integer,
  add constraint media_assets_video_metadata check(
    (purpose='film-video' and (status<>'ready' or
      (mime_type='video/mp4' and width between 480 and 4096 and height between 480 and 4096
       and duration_ms between 2000 and 60000 and duration_ms is not null)))
    or (purpose is distinct from 'film-video' and duration_ms is null));
alter table app.media_renditions drop constraint media_renditions_width_check,
  add constraint media_renditions_width_check check(width between 1 and 2304);

create function private.media_image_dimensions_valid(p_width integer,p_height integer,p_purpose text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(p_width>0 and p_height>0 and p_height<=2400 and p_width::bigint*p_height<=4000000 and
    case p_purpose
      when 'product-gallery' then p_width between 800 and 1600 and p_height>=1000 and abs(p_height-p_width::numeric*5/4)<=1
      when 'product-olfactory' then p_width between 960 and 1600 and p_height>=1200 and abs(p_height-p_width::numeric*5/4)<=1
      when 'category' then p_width between 800 and 1600 and p_height>=1000 and abs(p_height-p_width::numeric*5/4)<=1
      when 'hero-desktop' then p_width between 1536 and 2304 and p_height>=864 and abs(p_height-p_width::numeric*9/16)<=1
      when 'finder-desktop' then p_width between 1536 and 2304 and p_height>=864 and abs(p_height-p_width::numeric*9/16)<=1
      when 'hero-mobile' then p_width between 780 and 1560 and p_height>=1170 and abs(p_height-p_width::numeric*3/2)<=1
      when 'finder-mobile' then p_width between 780 and 1560 and p_height>=1170 and abs(p_height-p_width::numeric*3/2)<=1
      when 'finder-option' then p_width between 480 and 960 and abs(p_height-p_width)<=1
      when 'film-poster' then p_width between 320 and 1600 and p_height>=320
      else false end,false);
$$;
revoke all on function private.media_image_dimensions_valid(integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.media_image_dimensions_valid(integer,integer,text) to aro_media_executor;

do $$
declare v_definition text;v_name text;v_start integer;v_end integer;v_marker text;
begin
  v_definition:=pg_get_functiondef('api.media_upload_reserve(uuid,text)'::regprocedure);
  v_marker:='''finder-option'',''film-poster'')';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected media reservation purposes';end if;
  execute replace(v_definition,v_marker,'''finder-option'',''film-poster'',''film-video'')');
  foreach v_name in array array['api.media_upload_prepare(uuid,uuid,jsonb)','api.media_upload_complete(uuid,uuid,jsonb)'] loop
    v_definition:=pg_get_functiondef(v_name::regprocedure);
    v_start:=strpos(v_definition,'  if v_width not between 1 and 1600');
    v_end:=strpos(v_definition,'  v_key:=''public/dynamic/');
    if v_start=0 or v_end<=v_start then raise exception 'Unexpected image dimensions boundary: %',v_name;end if;
    v_definition:=substr(v_definition,1,v_start-1)||
      E'  if not private.media_image_dimensions_valid(v_width,v_height,v_media.purpose) or v_bytes not between 1 and 4194304 then\n    raise exception ''Verified dimensions do not match the placement.'' using errcode=''22023'';\n  end if;\n'||substr(v_definition,v_end);
    v_definition:=replace(v_definition,
      'abs(v_count::numeric/(v_item->>''height'')::integer-v_width::numeric/v_height)>0.01',
      'abs((v_item->>''height'')::numeric-v_count::numeric*v_height/v_width)>1');
    execute v_definition;
  end loop;
end $$;

create or replace function private.media_document(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select case when m.purpose='film-video' then jsonb_build_object(
    'id',m.id,'src',private.media_source(m.storage_kind,m.object_key),'width',m.width,'height',m.height,
    'durationMs',m.duration_ms,'byteSize',m.byte_size,'mimeType','video/mp4') else jsonb_build_object(
    'id',m.id,'src',private.media_source(m.storage_kind,m.object_key),'width',m.width,'height',m.height,
    'variants',coalesce((select jsonb_agg(jsonb_build_object('src',private.media_source('r2',r.object_key),
      'width',r.width,'height',r.height) order by r.width) from app.media_renditions r where r.asset_id=m.id),'[]'::jsonb)) end
  from app.media_assets m where m.id=p_id and m.status='ready';
$$;

create function api.media_upload_prepare_video(p_asset_id uuid,p_actor_id uuid,p_manifest jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_media app.media_assets%rowtype;v_width integer;v_height integer;v_duration integer;v_size bigint;v_sha text;
begin
  if p_actor_id is null or not exists(select 1 from private.admin_memberships where user_id=p_actor_id and active) then
    raise exception 'Verified administrator is unavailable.' using errcode='42501';end if;
  select * into v_media from app.media_assets where id=p_asset_id for update;
  if not found or v_media.uploader_id is distinct from p_actor_id then
    raise exception 'Upload operation is unavailable.' using errcode='42501';end if;
  if v_media.purpose is distinct from 'film-video' then raise exception 'This operation does not accept video.' using errcode='22023';end if;
  if v_media.status not in ('pending','ready') then raise exception 'Upload operation is retired.' using errcode='PT409';end if;
  if v_media.prepared_metadata is not null and v_media.prepared_metadata is distinct from p_manifest then
    raise exception 'The operation already reserves other bytes.' using errcode='PT409';end if;
  if jsonb_typeof(p_manifest) is distinct from 'object' or pg_column_size(p_manifest)>2048 then
    raise exception 'Invalid verified video manifest.' using errcode='22023';end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_manifest) key)
    is distinct from array['byteSize','durationMs','height','sha256','width']::text[]
    or jsonb_typeof(p_manifest->'width') is distinct from 'number'
    or jsonb_typeof(p_manifest->'height') is distinct from 'number'
    or jsonb_typeof(p_manifest->'durationMs') is distinct from 'number'
    or jsonb_typeof(p_manifest->'byteSize') is distinct from 'number'
    or coalesce(p_manifest->>'width','')!~'^[0-9]{1,4}$'
    or coalesce(p_manifest->>'height','')!~'^[0-9]{1,4}$'
    or coalesce(p_manifest->>'durationMs','')!~'^[0-9]{1,5}$'
    or coalesce(p_manifest->>'byteSize','')!~'^[0-9]{1,8}$'
    or jsonb_typeof(p_manifest->'sha256') is distinct from 'string'
    or coalesce(p_manifest->>'sha256','')!~'^[a-f0-9]{64}$' then
    raise exception 'Invalid verified video manifest.' using errcode='22023';end if;
  v_width:=(p_manifest->>'width')::integer;v_height:=(p_manifest->>'height')::integer;
  v_duration:=(p_manifest->>'durationMs')::integer;v_size:=(p_manifest->>'byteSize')::bigint;v_sha:=p_manifest->>'sha256';
  if v_width not between 480 and 4096 or v_height not between 480 and 4096
    or v_duration not between 2000 and 60000 or v_size not between 1 and 10485760 then
    raise exception 'Verified video exceeds its limits.' using errcode='22023';end if;
  if v_media.status='ready' then
    if v_media.width<>v_width or v_media.height<>v_height or v_media.duration_ms<>v_duration
      or v_media.byte_size<>v_size or v_media.sha256<>v_sha then
      raise exception 'The operation already contains a different video.' using errcode='PT409';end if;
    return private.media_document(p_asset_id);
  end if;
  update app.media_assets set prepared_metadata=p_manifest,retire_after=now()+interval '24 hours' where id=p_asset_id;
  return jsonb_build_object('id',p_asset_id,'status','pending');
end;
$$;
create function api.media_upload_complete_video(p_asset_id uuid,p_actor_id uuid,p_manifest jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_media app.media_assets%rowtype;
begin
  if p_actor_id is null or not exists(select 1 from private.admin_memberships where user_id=p_actor_id and active) then
    raise exception 'Verified administrator is unavailable.' using errcode='42501';end if;
  select * into v_media from app.media_assets where id=p_asset_id for update;
  if not found or v_media.uploader_id is distinct from p_actor_id then
    raise exception 'Upload operation is unavailable.' using errcode='42501';end if;
  if v_media.prepared_metadata is null or v_media.prepared_metadata is distinct from p_manifest then
    raise exception 'The video must reserve its immutable bytes before confirmation.' using errcode='PT409';end if;
  perform api.media_upload_prepare_video(p_asset_id,p_actor_id,p_manifest);
  if v_media.status='ready' then return private.media_document(p_asset_id);end if;
  update app.media_assets set object_key='public/dynamic/'||p_asset_id::text||'/'||(p_manifest->>'sha256')||'/video.mp4',
    mime_type='video/mp4',width=(p_manifest->>'width')::integer,height=(p_manifest->>'height')::integer,
    duration_ms=(p_manifest->>'durationMs')::integer,byte_size=(p_manifest->>'byteSize')::bigint,
    sha256=p_manifest->>'sha256',status='ready',verified_at=now(),retire_after=now()+interval '7 days' where id=p_asset_id;
  perform private.catalog_flush_constraints();
  return private.media_document(p_asset_id);
end;
$$;
grant create on schema api to aro_media_executor;
alter function api.media_upload_prepare_video(uuid,uuid,jsonb) owner to aro_media_executor;
alter function api.media_upload_complete_video(uuid,uuid,jsonb) owner to aro_media_executor;
revoke create on schema api from aro_media_executor;
revoke all on function api.media_upload_prepare_video(uuid,uuid,jsonb),api.media_upload_complete_video(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function api.media_upload_prepare_video(uuid,uuid,jsonb),api.media_upload_complete_video(uuid,uuid,jsonb)
  to service_role;

-- All references, including unpublished category/film placements, protect the
-- same immutable object row. A terminal GC claim can never be attached again.
create or replace function private.media_has_references(p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from app.product_images where media_id=p_id)
    or exists(select 1 from app.products where olfactory_media_id=p_id)
    or exists(select 1 from app.home_media where media_id=p_id);
$$;
do $$
declare v_definition text;v_marker text;
begin
  v_definition:=pg_get_functiondef('private.media_reference_retention()'::regprocedure);
  v_marker:='if tg_table_name=''product_images'' then';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected media retention trigger';end if;
  execute replace(v_definition,v_marker,'if tg_table_name in (''product_images'',''home_media'') then');
end $$;
create trigger media_home_retention after insert or update or delete on app.home_media
  for each row execute function private.media_reference_retention();

-- Validate the established editor shape rather than silently discarding bad
-- fields. References accepted here are UUIDs only, never paths/data URLs.
create function private.home_object(p_value jsonb,p_required text[],p_optional text[] default '{}')
returns void language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'object' then
    raise exception 'La estructura del Home no es válida.' using errcode='22023';end if;
  if exists(select 1 from unnest(p_required) k where not(p_value ? k))
    or exists(select 1 from jsonb_object_keys(p_value) k where not(k=any(p_required||p_optional))) then
    raise exception 'El Home contiene campos incompletos o desconocidos.' using errcode='22023';end if;
end;
$$;
create function private.home_text(p_value jsonb,p_max integer,p_empty boolean default false,p_lines integer default 2147483647)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare v_text text;
begin
  v_text:=p_value#>>'{}';
  if jsonb_typeof(p_value) is distinct from 'string' or char_length(v_text)>p_max
    or (not p_empty and btrim(v_text)='') or v_text ~ E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]'
    or (p_lines in (2,3) and exists(select 1 from unnest(string_to_array(v_text,E'\n')) x where btrim(x)=''))
    or cardinality(string_to_array(v_text,E'\n'))>p_lines then
    raise exception 'Revisa los textos y límites del Home.' using errcode='22023';end if;
end;
$$;
create function private.home_stable_key(p_key text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(char_length(p_key) between 1 and 100 and p_key not in ('__proto__','constructor','prototype')
    and p_key=private.catalog_name_key(p_key) and p_key!~'[[:cntrl:]]',false);
$$;
create function private.home_reference(p_value jsonb)
returns uuid language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_value='null'::jsonb then return null;end if;
  if jsonb_typeof(p_value) is distinct from 'string'
    or coalesce(p_value#>>'{}','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Selecciona un recurso gestionado y verificado.' using errcode='22023';end if;
  return (p_value#>>'{}')::uuid;
end;
$$;
create function private.home_references(p_media jsonb,p_content jsonb)
returns table(slot text[],media_id uuid,purpose text) language plpgsql immutable security invoker set search_path='' as $$
declare v_key text;v_index integer;v_item jsonb;
begin
  for v_key in select unnest(array['hombre','mujer','unisex','complementos']) loop
    slot:=array['media',v_key];media_id:=private.home_reference(p_media->v_key);purpose:='category';return next;
  end loop;
  for v_index in 0..4 loop
    foreach v_key in array array['desktopImage','mobileImage'] loop
      slot:=array['content','hero',v_index::text,v_key];media_id:=private.home_reference(p_content->'hero'->v_index->v_key);
      purpose:=case v_key when 'desktopImage' then 'hero-desktop' else 'hero-mobile' end;return next;
    end loop;
  end loop;
  foreach v_key in array array['desktopImage','mobileImage'] loop
    slot:=array['content','finder',v_key];media_id:=private.home_reference(p_content->'finder'->v_key);
    purpose:=case v_key when 'desktopImage' then 'finder-desktop' else 'finder-mobile' end;return next;
  end loop;
  for v_key,v_item in select key,value from jsonb_each(p_content->'finder'->'familyVisuals') loop
    slot:=array['content','finder','familyVisuals',v_key,'image'];media_id:=private.home_reference(v_item->'image');purpose:='finder-option';return next;
  end loop;
  foreach v_key in array array['video','poster','mobileVideo','mobilePoster'] loop
    slot:=array['content','film',v_key];media_id:=private.home_reference(coalesce(p_content->'film'->v_key,'null'::jsonb));
    purpose:=case when v_key in ('video','mobileVideo') then 'film-video' else 'film-poster' end;return next;
  end loop;
end;
$$;

create function private.home_validate(p_media jsonb,p_content jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare v_item jsonb;v_key text;v_step text;v_entry jsonb;v_budget integer;v_previous integer:=0;v_count integer;
begin
  if pg_column_size(p_media)>4096 or pg_column_size(p_content)>262144 then
    raise exception 'El contenido del Home supera su límite.' using errcode='22023';end if;
  perform private.home_object(p_media,array['hombre','mujer','unisex','complementos']);
  perform private.home_object(p_content,array['featuredBrandId','announcement','hero','film','finder']);
  perform private.home_reference(p_content->'featuredBrandId');
  perform private.home_object(p_content->'announcement',array['deliveryText','freeShippingLabel']);
  perform private.home_text(p_content->'announcement'->'deliveryText',70);
  perform private.home_text(p_content->'announcement'->'freeShippingLabel',40);
  if jsonb_typeof(p_content->'hero') is distinct from 'array' then
    raise exception 'El carrusel necesita cinco campañas.' using errcode='22023';end if;
  if jsonb_array_length(p_content->'hero')<>5 then raise exception 'El carrusel necesita cinco campañas.' using errcode='22023';end if;
  for v_item in select value from jsonb_array_elements(p_content->'hero') loop
    perform private.home_object(v_item,array['eyebrow','title','description','cta','alt','desktopImage','mobileImage']);
    perform private.home_text(v_item->'eyebrow',60);perform private.home_text(v_item->'title',90,false,3);
    perform private.home_text(v_item->'description',180);perform private.home_text(v_item->'cta',45);
    perform private.home_text(v_item->'alt',160);
  end loop;
  v_item:=p_content->'film';
  perform private.home_object(v_item,array['eyebrow','title','description','cta','video','poster'],array['mobileVideo','mobilePoster']);
  perform private.home_text(v_item->'eyebrow',60);perform private.home_text(v_item->'title',90,false,2);
  perform private.home_text(v_item->'description',300);perform private.home_text(v_item->'cta',45);
  v_item:=p_content->'finder';
  perform private.home_object(v_item,array['eyebrow','title','description','cta','desktopImage','mobileImage','entryLabel',
    'entryQuestion','modalTitle','steps','optionLabels','enabledOptions','familyVisuals','noPreferenceLabel','budgets',
    'budgetNoLimitLabel','resultCopy','singleResultTitle']);
  perform private.home_text(v_item->'eyebrow',60);perform private.home_text(v_item->'title',90,false,2);
  perform private.home_text(v_item->'description',180);perform private.home_text(v_item->'cta',45);
  perform private.home_text(v_item->'entryLabel',60);perform private.home_text(v_item->'entryQuestion',100);
  perform private.home_text(v_item->'modalTitle',90);perform private.home_text(v_item->'noPreferenceLabel',50);
  perform private.home_text(v_item->'budgetNoLimitLabel',60);perform private.home_text(v_item->'singleResultTitle',100);
  if v_item->>'entryLabel' ~ '^\s*[0-9]+\s*/\s*[0-9]+\y' then
    raise exception 'El progreso del cuestionario se muestra automáticamente.' using errcode='22023';end if;
  perform private.home_object(v_item->'steps',array['family','occasion','intensity','budget']);
  foreach v_key in array array['family','occasion','intensity','budget'] loop
    v_entry:=v_item->'steps'->v_key;perform private.home_object(v_entry,array['label','question','description']);
    perform private.home_text(v_entry->'label',40);perform private.home_text(v_entry->'question',100);
    perform private.home_text(v_entry->'description',220);
  end loop;
  perform private.home_object(v_item->'resultCopy',array['matches','partial','budget','empty','unavailable','preferences']);
  foreach v_key in array array['matches','partial','budget','empty','unavailable','preferences'] loop
    v_entry:=v_item->'resultCopy'->v_key;perform private.home_object(v_entry,array['title','description']);
    perform private.home_text(v_entry->'title',100);perform private.home_text(v_entry->'description',300);
  end loop;
  perform private.home_object(v_item->'optionLabels',array['family','occasion','intensity']);
  perform private.home_object(v_item->'enabledOptions',array['family','occasion','intensity']);
  foreach v_step in array array['family','occasion','intensity'] loop
    v_entry:=v_item->'optionLabels'->v_step;
    if jsonb_typeof(v_entry) is distinct from 'object' then raise exception 'Revisa las opciones del cuestionario.' using errcode='22023';end if;
    if (select count(*) from jsonb_object_keys(v_entry))>500 then raise exception 'Demasiadas etiquetas de opciones.' using errcode='22023';end if;
    for v_key,v_entry in select key,value from jsonb_each(v_entry) loop
      if not private.home_stable_key(v_key) then raise exception 'Una opción tiene una clave inválida.' using errcode='22023';end if;
      perform private.home_text(v_entry,60);
    end loop;
    v_entry:=v_item->'enabledOptions'->v_step;
    if v_entry<>'null'::jsonb then
      if jsonb_typeof(v_entry) is distinct from 'array' then raise exception 'Revisa las opciones activas.' using errcode='22023';end if;
      if jsonb_array_length(v_entry) not between 1 and 30 then raise exception 'Activa entre una y treinta opciones por paso.' using errcode='22023';end if;
      if exists(select 1 from jsonb_array_elements(v_entry) e where jsonb_typeof(e)<>'string' or not private.home_stable_key(e#>>'{}'))
        or (select count(distinct e) from jsonb_array_elements(v_entry) e)<>jsonb_array_length(v_entry) then
        raise exception 'Las opciones activas deben ser claves únicas.' using errcode='22023';end if;
    end if;
  end loop;
  if jsonb_typeof(v_item->'familyVisuals') is distinct from 'object' then raise exception 'Revisa las imágenes del cuestionario.' using errcode='22023';end if;
  if (select count(*) from jsonb_object_keys(v_item->'familyVisuals'))>500 then raise exception 'Demasiadas imágenes de familias.' using errcode='22023';end if;
  for v_key,v_entry in select key,value from jsonb_each(v_item->'familyVisuals') loop
    if not private.home_stable_key(v_key) then raise exception 'Una familia tiene una clave inválida.' using errcode='22023';end if;
    perform private.home_object(v_entry,array['description','image']);perform private.home_text(v_entry->'description',90,true);
  end loop;
  if jsonb_typeof(v_item->'budgets') is distinct from 'array' then raise exception 'Revisa los presupuestos.' using errcode='22023';end if;
  if jsonb_array_length(v_item->'budgets') not between 1 and 6 then raise exception 'Define entre uno y seis presupuestos.' using errcode='22023';end if;
  for v_entry in select value from jsonb_array_elements(v_item->'budgets') loop
    if jsonb_typeof(v_entry) is distinct from 'number' or (v_entry#>>'{}')!~'^[0-9]{1,5}$' then
      raise exception 'Los presupuestos deben ser importes enteros.' using errcode='22023';end if;
    v_budget:=(v_entry#>>'{}')::integer;
    if v_budget not between 1 and 10000 or v_budget<=v_previous then
      raise exception 'Ordena los presupuestos, sin duplicados, entre S/ 1 y S/ 10000.' using errcode='22023';end if;
    v_previous:=v_budget;
  end loop;
  -- Exhaustively checks every accepted media field, including optional film.
  perform 1 from private.home_references(p_media,p_content);
  if (select count(distinct media_id) from private.home_references(p_media,p_content) where media_id is not null)>100 then
    raise exception 'El Home admite hasta cien recursos distintos.' using errcode='22023';end if;
end;
$$;

create function private.home_document_projection(p_admin boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_home app.home_document%rowtype;v_result jsonb;v_link record;v_asset jsonb;v_assets jsonb;v_brand uuid;
begin
  select * into v_home from app.home_document where singleton;
  if not found then return jsonb_build_object('media',null,'content',null,'version',0,'mediaAssets','[]'::jsonb);end if;
  select s.featured_brand_id into v_brand from app.store_settings s where s.singleton
    and (p_admin or exists(select 1 from app.brands b where b.id=s.featured_brand_id and b.active));
  v_result:=jsonb_build_object('media',v_home.media,'content',v_home.content||jsonb_build_object('featuredBrandId',v_brand),'version',v_home.version);
  for v_link in select slot,media_id from app.home_media order by slot loop
    v_asset:=private.media_document(v_link.media_id);
    if v_asset is null then raise exception 'Un recurso publicado del Home no está disponible.' using errcode='PT503';end if;
    v_result:=jsonb_set(v_result,v_link.slot,v_asset->'src',false);
  end loop;
  select coalesce(jsonb_agg(private.media_document(m.media_id) order by m.media_id),'[]'::jsonb) into v_assets
    from (select distinct media_id from app.home_media) m;
  return v_result||jsonb_build_object('mediaAssets',v_assets);
end;
$$;
create function api.home_document()
returns jsonb language sql stable security definer set search_path='' as $$
  select private.home_document_projection(false);
$$;
create function api.admin_home_document()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_catalog_admin();return private.home_document_projection(true);
end;
$$;
create function api.admin_save_home(p_media jsonb,p_content jsonb,p_expected_version bigint,
  p_expected_settings_version bigint,p_complements_enabled boolean,p_featured_brand_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_version bigint;v_settings bigint;v_asset record;v_ready app.media_assets%rowtype;v_content jsonb;
begin
  perform private.require_catalog_admin();
  perform private.home_validate(p_media,p_content);
  if p_complements_enabled is null or private.home_reference(p_content->'featuredBrandId') is distinct from p_featured_brand_id then
    raise exception 'La configuración del Home no coincide con sus ajustes de catálogo.' using errcode='22023';end if;
  -- Follow the existing settings/brand lock before row locks, so concurrent
  -- brand activation/deletion cannot invalidate the atomic featured shortcut.
  perform pg_advisory_xact_lock(714482391);
  perform pg_advisory_xact_lock(714482394);
  if p_featured_brand_id is not null and not exists(select 1 from app.brands where id=p_featured_brand_id and active) then
    raise exception 'Selecciona una marca activa para destacarla.' using errcode='22023';end if;
  select version into v_settings from app.store_settings where singleton for update;
  if p_expected_settings_version is null or v_settings is distinct from p_expected_settings_version then
    raise exception 'La configuración cambió en otra sesión. Actualiza la página.' using errcode='PT409';end if;
  select version into v_version from app.home_document where singleton for update;
  if p_expected_version is null or coalesce(v_version,0)<>p_expected_version then
    raise exception 'El Home cambió en otra sesión. Actualiza la página.' using errcode='PT409';end if;
  -- Lock the complete old/new set in UUID order before replacing associations.
  -- GC locks the same assets first and checks every product/Home reference.
  for v_asset in select id,bool_or(is_new) as is_new from (
    select media_id as id,true as is_new from private.home_references(p_media,p_content) where media_id is not null
    union all select media_id,false from app.home_media) refs group by id order by id loop
    select * into v_ready from app.media_assets where id=v_asset.id for update;
    if v_asset.is_new and (v_ready.id is null or v_ready.status<>'ready' or v_ready.storage_kind<>'r2') then
      raise exception 'Un recurso del Home ya no está disponible. Vuelve a seleccionarlo.' using errcode='22023';end if;
  end loop;
  if exists(select 1 from private.home_references(p_media,p_content) r join app.media_assets m on m.id=r.media_id
    where m.purpose is distinct from r.purpose or (r.purpose='film-video') is distinct from (m.mime_type='video/mp4')) then
    raise exception 'El recurso no corresponde a este apartado del Home.' using errcode='22023';end if;
  v_content:=jsonb_set(jsonb_set(p_content-'featuredBrandId','{film,mobileVideo}',coalesce(p_content->'film'->'mobileVideo','null'::jsonb)),
    '{film,mobilePoster}',coalesce(p_content->'film'->'mobilePoster','null'::jsonb));
  insert into app.home_document(singleton,media,content,version) values(true,p_media,v_content,1)
    on conflict(singleton) do update set media=excluded.media,content=excluded.content,version=app.home_document.version+1,updated_at=now();
  delete from app.home_media;
  insert into app.home_media(slot,media_id) select slot,media_id from private.home_references(p_media,v_content) where media_id is not null;
  update app.store_settings set complements_enabled=p_complements_enabled,featured_brand_id=p_featured_brand_id,
    version=version+1 where singleton returning version into v_settings;
  return jsonb_build_object('home',private.home_document_projection(true),
    'features',jsonb_build_object('complementsEnabled',p_complements_enabled),
    'featuredBrandId',p_featured_brand_id,'settingsVersion',v_settings);
end;
$$;

-- A small global announcement does not require loading media manifests or the
-- complete questionnaire on every route. Catalog pages retain their size.
create or replace function api.catalog_settings()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('features',jsonb_build_object('complementsEnabled',s.complements_enabled),
    'featuredBrandId',(select b.id from app.brands b where b.id=s.featured_brand_id and b.active),
    'olfactoryFamilies',api.catalog_olfactory_families(),
    'homeAnnouncement',(select content->'announcement' from app.home_document where singleton),
    'homeVersion',coalesce((select version from app.home_document where singleton),0))
  from app.store_settings s where s.singleton;
$$;

-- Browse already includes its bounded metadata in the same request. Keep the
-- lightweight announcement/version there as well; detail context composes
-- catalog_settings() directly and inherits exactly these values.
do $$
declare v_definition text;v_marker text;
begin
  v_definition:=pg_get_functiondef('api.catalog_browse(jsonb,integer)'::regprocedure);
  v_marker:='    ''familyCodes'',coalesce(';
  if strpos(v_definition,v_marker)=0 then raise exception 'Unexpected browse metadata boundary';end if;
  execute replace(v_definition,v_marker,
    E'    ''homeAnnouncement'',(select content->''announcement'' from app.home_document where singleton),\n    ''homeVersion'',coalesce((select version from app.home_document where singleton),0),\n'||v_marker);
end $$;

revoke all on function private.home_object(jsonb,text[],text[]),private.home_text(jsonb,integer,boolean,integer),
  private.home_stable_key(text),private.home_reference(jsonb),private.home_references(jsonb,jsonb),private.home_validate(jsonb,jsonb),
  private.home_document_projection(boolean) from public,anon,authenticated,service_role;
grant execute on function private.home_object(jsonb,text[],text[]),private.home_text(jsonb,integer,boolean,integer),
  private.home_stable_key(text),private.home_reference(jsonb),private.home_references(jsonb,jsonb),private.home_validate(jsonb,jsonb)
  to aro_catalog_admin_executor;
grant execute on function private.home_document_projection(boolean) to aro_catalog_admin_executor,aro_api_executor;
grant create on schema api to aro_api_executor,aro_catalog_admin_executor;
alter function api.home_document() owner to aro_api_executor;
alter function api.admin_home_document() owner to aro_catalog_admin_executor;
alter function api.admin_save_home(jsonb,jsonb,bigint,bigint,boolean,uuid) owner to aro_catalog_admin_executor;
revoke create on schema api from aro_api_executor,aro_catalog_admin_executor;
revoke all on function api.home_document(),api.admin_home_document(),api.admin_save_home(jsonb,jsonb,bigint,bigint,boolean,uuid)
  from public,anon,authenticated,service_role;
grant execute on function api.home_document() to anon,authenticated;
grant execute on function api.admin_home_document(),api.admin_save_home(jsonb,jsonb,bigint,bigint,boolean,uuid) to authenticated;
comment on table app.home_document is 'Singleton editor content; media fields contain managed UUID references only. No local data is seeded. Featured brand authority stays in store_settings.';
comment on table app.home_media is 'FK-backed JSON placement paths; protects Home images and videos from orphan cleanup, including hidden Complementos placements.';
