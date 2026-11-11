-- A restricted static SVG receipt is verified by the Worker. It is never
-- accepted by product/Home image profiles or treated as inline HTML.
alter table app.media_assets drop constraint media_assets_purpose_check,
  add constraint media_assets_purpose_check check(purpose in('product-gallery','product-olfactory','category',
    'hero-desktop','hero-mobile','finder-desktop','finder-mobile','finder-option','film-poster','film-video','site-image','site-vector')),
  add constraint media_static_vector_limits check(purpose is distinct from 'site-vector' or status<>'ready' or
    (mime_type='image/svg+xml' and width between 1 and 4096 and height between 1 and 4096 and byte_size between 1 and 524288));

do $migration$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('api.media_upload_reserve(uuid,text)'::regprocedure);
  marker:='''film-video'',''site-image'')';
  if strpos(definition,marker)=0 then raise exception 'Unexpected upload purposes';end if;
  execute replace(definition,marker,'''film-video'',''site-image'',''site-vector'')');
  definition:=pg_get_functiondef('api.admin_save_site_media(text,uuid,text,bigint)'::regprocedure);
  marker:='not private.media_placement_compatible(asset.mime_type,asset.width,asset.height,''site-image'')';
  if strpos(definition,marker)=0 then raise exception 'Unexpected site media boundary';end if;
  execute replace(definition,marker,'not (private.media_placement_compatible(asset.mime_type,asset.width,asset.height,''site-image'') or
    (p_slot=''identity.logo'' and asset.mime_type=''image/svg+xml'' and asset.purpose=''site-vector''))');
  definition:=pg_get_functiondef('private.media_library_json(app.media_assets,app.media_library,bigint,jsonb)'::regprocedure);
  marker:='if p_media.mime_type=''video/mp4'' then';
  if strpos(definition,marker)=0 then raise exception 'Unexpected library manifest boundary';end if;
  execute replace(definition,marker,'if p_media.mime_type=''image/svg+xml'' then
      manifest:=jsonb_build_object(''id'',p_media.id,''src'',''/media/''||p_media.object_key,''width'',p_media.width,''height'',p_media.height,
        ''byteSize'',p_media.byte_size,''mimeType'',''image/svg+xml'');
    elsif p_media.mime_type=''video/mp4'' then');
end;
$migration$;

create or replace function private.media_document(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select case when m.mime_type='image/svg+xml' then jsonb_build_object(
    'id',m.id,'src',private.media_source(m.storage_kind,m.object_key),'width',m.width,'height',m.height,
    'byteSize',m.byte_size,'mimeType','image/svg+xml')
  when m.purpose='film-video' then jsonb_build_object(
    'id',m.id,'src',private.media_source(m.storage_kind,m.object_key),'width',m.width,'height',m.height,
    'durationMs',m.duration_ms,'byteSize',m.byte_size,'mimeType','video/mp4') else jsonb_build_object(
    'id',m.id,'src',private.media_source(m.storage_kind,m.object_key),'width',m.width,'height',m.height,
    'variants',coalesce((select jsonb_agg(jsonb_build_object('src',private.media_source('r2',r.object_key),
      'width',r.width,'height',r.height) order by r.width) from app.media_renditions r where r.asset_id=m.id),'[]'::jsonb)) end
  from app.media_assets m where m.id=p_id and m.status='ready';
$$;

create function api.media_upload_prepare_svg(p_asset_id uuid,p_actor_id uuid,p_manifest jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare asset app.media_assets%rowtype;w integer;h integer;bytes bigint;sha text;
begin
  if p_actor_id is null or not exists(select 1 from private.admin_memberships where user_id=p_actor_id and active) then
    raise exception 'Verified administrator unavailable.' using errcode='42501';end if;
  select * into asset from app.media_assets where id=p_asset_id for update;
  if not found or asset.uploader_id is distinct from p_actor_id then raise exception 'Upload unavailable.' using errcode='42501';end if;
  if asset.purpose is distinct from 'site-vector' then raise exception 'Invalid vector profile.' using errcode='22023';end if;
  if asset.status not in('pending','ready') then raise exception 'Upload retired.' using errcode='PT409';end if;
  if asset.prepared_metadata is not null and asset.prepared_metadata is distinct from p_manifest then
    raise exception 'Immutable receipt mismatch.' using errcode='PT409';end if;
  if jsonb_typeof(p_manifest) is distinct from 'object' or pg_column_size(p_manifest)>2048 then
    raise exception 'Invalid vector receipt.' using errcode='22023';end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_manifest) key)
    is distinct from array['byteSize','height','sha256','width']::text[]
    or jsonb_typeof(p_manifest->'width') is distinct from 'number'
    or jsonb_typeof(p_manifest->'height') is distinct from 'number'
    or jsonb_typeof(p_manifest->'byteSize') is distinct from 'number'
    or jsonb_typeof(p_manifest->'sha256') is distinct from 'string'
    or coalesce(p_manifest->>'width','')!~'^[0-9]{1,4}$'
    or coalesce(p_manifest->>'height','')!~'^[0-9]{1,4}$'
    or coalesce(p_manifest->>'byteSize','')!~'^[0-9]{1,6}$'
    or coalesce(p_manifest->>'sha256','')!~'^[a-f0-9]{64}$' then
    raise exception 'Invalid vector receipt.' using errcode='22023';end if;
  w:=(p_manifest->>'width')::integer;h:=(p_manifest->>'height')::integer;
  bytes:=(p_manifest->>'byteSize')::bigint;sha:=p_manifest->>'sha256';
  if w not between 1 and 4096 or h not between 1 and 4096 or bytes not between 1 and 524288 then
    raise exception 'Vector limits exceeded.' using errcode='22023';end if;
  if asset.status='ready' then
    if asset.width<>w or asset.height<>h or asset.byte_size<>bytes or asset.sha256<>sha then
      raise exception 'Immutable vector mismatch.' using errcode='PT409';end if;
    return private.media_document(p_asset_id);
  end if;
  update app.media_assets set prepared_metadata=p_manifest,retire_after=clock_timestamp()+interval '24 hours' where id=p_asset_id;
  return jsonb_build_object('id',p_asset_id,'status','pending');
end;
$$;
create function api.media_upload_complete_svg(p_asset_id uuid,p_actor_id uuid,p_manifest jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare asset app.media_assets%rowtype;
begin
  select * into asset from app.media_assets where id=p_asset_id for update;
  if not found or asset.uploader_id is distinct from p_actor_id then raise exception 'Upload unavailable.' using errcode='42501';end if;
  if asset.prepared_metadata is null or asset.prepared_metadata is distinct from p_manifest then
    raise exception 'Prepare the immutable receipt first.' using errcode='PT409';end if;
  perform api.media_upload_prepare_svg(p_asset_id,p_actor_id,p_manifest);
  if asset.status='ready' then return private.media_document(p_asset_id);end if;
  update app.media_assets set object_key='public/dynamic/'||p_asset_id::text||'/'||(p_manifest->>'sha256')||'/vector.svg',
    mime_type='image/svg+xml',width=(p_manifest->>'width')::integer,height=(p_manifest->>'height')::integer,
    byte_size=(p_manifest->>'byteSize')::bigint,sha256=p_manifest->>'sha256',status='ready',verified_at=clock_timestamp(),
    retire_after=clock_timestamp()+interval '24 hours' where id=p_asset_id;
  perform private.catalog_flush_constraints();
  return private.media_document(p_asset_id);
end;
$$;
grant create on schema api to aro_media_executor;
alter function api.media_upload_prepare_svg(uuid,uuid,jsonb) owner to aro_media_executor;
alter function api.media_upload_complete_svg(uuid,uuid,jsonb) owner to aro_media_executor;
revoke create on schema api from aro_media_executor;
revoke all on function api.media_upload_prepare_svg(uuid,uuid,jsonb),api.media_upload_complete_svg(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function api.media_upload_prepare_svg(uuid,uuid,jsonb),api.media_upload_complete_svg(uuid,uuid,jsonb) to service_role;
