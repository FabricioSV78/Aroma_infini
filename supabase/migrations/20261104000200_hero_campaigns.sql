-- Extend only the established Hero content. Existing defaults, source indices,
-- media receipts, optimistic locks, MFA and lifecycle ownership remain intact.
create function private.hero_upgrade(p_hero jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='[]'::jsonb;item jsonb;position integer:=0;
begin
  if jsonb_typeof(p_hero) is distinct from 'array' or jsonb_array_length(p_hero)<>5 then return p_hero;end if;
  if exists(select 1 from jsonb_array_elements(p_hero) e where jsonb_typeof(e) is distinct from 'object'
    or not(e ?& array['eyebrow','title','description','cta','alt','desktopImage','mobileImage'])
    or (select count(*) from jsonb_object_keys(e))<>7) then return p_hero;end if;
  for item in select value from jsonb_array_elements(p_hero) loop
    result:=result||jsonb_build_array(item||jsonb_build_object(
      'id','campaign-'||position,'fallbackIndex',position,
      'order',case position when 0 then 0 when 1 then 1 when 2 then 4 when 3 then 2 else 3 end,
      'mediaType','image','video',null,'mobileVideo',null,'poster',null,'mobilePoster',null,
      'showText',true,'showButton',true,'published',true,'destination',jsonb_build_object('type','shop')));
    position:=position+1;
  end loop;
  return result;
end;
$$;

create function private.hero_validate(p_hero jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb;target jsonb;seen_ids text[]:='{}';seen_orders integer[]:='{}';position integer;key text;
begin
  if jsonb_typeof(p_hero) is distinct from 'array' then
    raise exception 'El carrusel admite entre una y diez campañas.' using errcode='22023';end if;
  if jsonb_array_length(p_hero) not between 1 and 10 then
    raise exception 'El carrusel admite entre una y diez campañas.' using errcode='22023';end if;
  for item in select value from jsonb_array_elements(private.hero_upgrade(p_hero)) loop
    perform private.home_object(item,array['id','fallbackIndex','order','mediaType','video','mobileVideo','poster','mobilePoster',
      'showText','showButton','published','destination','eyebrow','title','description','cta','alt','desktopImage','mobileImage']);
    if jsonb_typeof(item->'id') is distinct from 'string' or item->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,99}$'
      or item->>'id'=any(seen_ids) then raise exception 'Cada campaña necesita un identificador único.' using errcode='22023';end if;
    seen_ids:=array_append(seen_ids,item->>'id');
    if jsonb_typeof(item->'order') is distinct from 'number' or item->>'order'!~'^[0-9]$' then
      raise exception 'El orden del carrusel no es válido.' using errcode='22023';end if;
    position:=(item->>'order')::integer;
    if position=any(seen_orders) then raise exception 'Las posiciones del carrusel no pueden repetirse.' using errcode='22023';end if;
    seen_orders:=array_append(seen_orders,position);
    if item->'fallbackIndex'<>'null'::jsonb and (jsonb_typeof(item->'fallbackIndex') is distinct from 'number'
      or item->>'fallbackIndex'!~'^[0-4]$') then raise exception 'La campaña original no es válida.' using errcode='22023';end if;
    if jsonb_typeof(item->'mediaType') is distinct from 'string' or item->>'mediaType' not in ('image','video')
      or jsonb_typeof(item->'showText') is distinct from 'boolean' or jsonb_typeof(item->'showButton') is distinct from 'boolean'
      or jsonb_typeof(item->'published') is distinct from 'boolean' then
      raise exception 'Revisa el tipo y la visibilidad de la campaña.' using errcode='22023';end if;
    perform private.home_text(item->'eyebrow',60,true);
    perform private.home_text(item->'title',90,not((item->>'showText')::boolean and (item->>'published')::boolean),case when item->>'title'='' then 2147483647 else 3 end);
    perform private.home_text(item->'description',180,true);
    perform private.home_text(item->'cta',45,not((item->>'showButton')::boolean and (item->>'published')::boolean));
    perform private.home_text(item->'alt',160,item->>'mediaType'='video' or not(item->>'published')::boolean);
    target:=item->'destination';
    if target->>'type'='shop' then perform private.home_object(target,array['type']);
    elsif target->>'type'='product' then
      perform private.home_object(target,array['type','productId']);perform private.home_reference(target->'productId');
      if target->'productId'='null'::jsonb then raise exception 'Selecciona un producto de destino.' using errcode='22023';end if;
    elsif target->>'type'='category' then
      perform private.home_object(target,array['type','category']);
      if jsonb_typeof(target->'category') is distinct from 'string' or target->>'category' not in ('hombre','mujer','unisex','complementos') then
        raise exception 'Selecciona una categoría válida.' using errcode='22023';end if;
    elsif target->>'type'='page' then
      perform private.home_object(target,array['type','page']);
      if jsonb_typeof(target->'page') is distinct from 'string' or target->>'page' not in ('/nosotros','/contacto','/envios','/seguir-pedido','/marcas') then
        raise exception 'Selecciona una página interna válida.' using errcode='22023';end if;
    else raise exception 'Selecciona un destino interno válido.' using errcode='22023';end if;
    foreach key in array array['desktopImage','mobileImage','video','mobileVideo','poster','mobilePoster'] loop
      perform private.home_reference(item->key);
    end loop;
    if (item->>'published')::boolean and item->>'mediaType'='video'
      and (item->'video'='null'::jsonb or item->'poster'='null'::jsonb) then
      raise exception 'Selecciona video y portada antes de publicar la campaña.' using errcode='22023';end if;
    if (item->>'published')::boolean and item->>'mediaType'='image'
      and item->'fallbackIndex'='null'::jsonb and item->'desktopImage'='null'::jsonb then
      raise exception 'Selecciona una imagen antes de publicar la campaña.' using errcode='22023';end if;
    if item->'mobileVideo'<>'null'::jsonb and item->'mobilePoster'='null'::jsonb then
      raise exception 'El video móvil necesita su portada.' using errcode='22023';end if;
  end loop;
end;
$$;

-- Retain all placements, even on hidden campaigns. Deleting/replacing a slide
-- removes its joins atomically; the same media row locks still coordinate GC.
create or replace function private.home_references(p_media jsonb,p_content jsonb)
returns table(slot text[],media_id uuid,purpose text) language plpgsql immutable security invoker set search_path='' as $$
declare v_key text;v_index integer;v_item jsonb;
begin
  for v_key in select unnest(array['hombre','mujer','unisex','complementos']) loop
    slot:=array['media',v_key];media_id:=private.home_reference(p_media->v_key);purpose:='category';return next;
  end loop;
  for v_index in 0..jsonb_array_length(p_content->'hero')-1 loop
    foreach v_key in array array['desktopImage','mobileImage','video','mobileVideo','poster','mobilePoster'] loop
      slot:=array['content','hero',v_index::text,v_key];
      media_id:=private.home_reference(coalesce(p_content->'hero'->v_index->v_key,'null'::jsonb));
      purpose:=case v_key when 'desktopImage' then 'hero-desktop' when 'mobileImage' then 'hero-mobile'
        when 'video' then 'film-video' when 'mobileVideo' then 'film-video' else 'film-poster' end;return next;
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

-- Public responses omit hidden campaigns and their exclusively used manifests.
-- The administrative projection keeps all campaigns and media for editing.
create or replace function private.home_document_projection(p_admin boolean default false)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_home app.home_document%rowtype;v_result jsonb;v_link record;v_asset jsonb;v_assets jsonb;v_brand uuid;
begin
  select * into v_home from app.home_document where singleton;
  if not found then return jsonb_build_object('media',null,'content',null,'version',0,'mediaAssets','[]'::jsonb);end if;
  select s.featured_brand_id into v_brand from app.store_settings s where s.singleton
    and (p_admin or exists(select 1 from app.brands b where b.id=s.featured_brand_id and b.active));
  v_result:=jsonb_build_object('media',v_home.media,'content',v_home.content||jsonb_build_object('featuredBrandId',v_brand),'version',v_home.version);
  for v_link in select slot,media_id from app.home_media order by slot loop
    if not p_admin and not (case when v_link.slot[2]='hero' then
      coalesce((v_home.content->'hero'->(v_link.slot[3])::integer->>'published')::boolean,true) else true end) then continue;end if;
    v_asset:=private.media_document(v_link.media_id);
    if v_asset is null then raise exception 'Un recurso publicado del Home no está disponible.' using errcode='PT503';end if;
    v_result:=jsonb_set(v_result,v_link.slot,v_asset->'src',false);
  end loop;
  if not p_admin then
    v_result:=jsonb_set(v_result,'{content,hero}',coalesce((select jsonb_agg(c.value order by c.ordinality)
      from jsonb_array_elements(v_result->'content'->'hero') with ordinality c(value,ordinality)
      where coalesce((c.value->>'published')::boolean,true)),'[]'::jsonb));
  end if;
  select coalesce(jsonb_agg(private.media_document(m.media_id) order by m.media_id),'[]'::jsonb) into v_assets
    from (select distinct h.media_id from app.home_media h
      where p_admin or case when h.slot[2]='hero' then
        coalesce((v_home.content->'hero'->(h.slot[3])::integer->>'published')::boolean,true) else true end) m;
  return v_result||jsonb_build_object('mediaAssets',v_assets);
end;
$$;

-- Keep the rest of the established Home validator exactly as deployed.
do $migration$
declare definition text;old_block text;
begin
  definition:=pg_get_functiondef('private.home_validate(jsonb,jsonb)'::regprocedure);
  old_block:=substring(definition from '  if jsonb_typeof\(p_content->''hero''\)[\s\S]*?  v_item:=p_content->''film'';');
  if old_block is null then raise exception 'Unexpected Hero validation boundary';end if;
  execute replace(definition,old_block,E'  perform private.hero_validate(p_content->''hero'');\n  v_item:=p_content->''film'';');
  definition:=pg_get_functiondef('api.admin_save_home(jsonb,jsonb,bigint,bigint,boolean,uuid)'::regprocedure);
  if strpos(definition,'  perform private.require_catalog_admin();')=0 then raise exception 'Unexpected Home authorization boundary';end if;
  execute replace(definition,'  perform private.require_catalog_admin();',E'  perform private.require_catalog_admin();\n  p_content:=jsonb_set(p_content,''{hero}'',private.hero_upgrade(p_content->''hero''));');
end;
$migration$;

revoke all on function private.hero_upgrade(jsonb),private.hero_validate(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.hero_upgrade(jsonb),private.hero_validate(jsonb) to aro_catalog_admin_executor;

-- Metadata only: no new photos, campaigns or media associations are seeded.
update app.home_document set content=jsonb_set(content,'{hero}',private.hero_upgrade(content->'hero')),
  version=version+1,updated_at=now()
where singleton and content->'hero' is distinct from private.hero_upgrade(content->'hero');
notify pgrst, 'reload schema';
