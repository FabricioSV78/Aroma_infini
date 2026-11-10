-- Managed image references and upload lifecycle only. R2 bytes never enter SQL.
-- Confirmation and physical cleanup belong exclusively to the verified Worker.
-- Existing media, product UUIDs, local resources and catalog rules are retained.
create role aro_media_executor nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;
grant aro_media_executor to postgres;
grant usage on schema app, api, private to aro_media_executor;
grant execute on function private.is_admin(), private.request_user_id(),
  private.catalog_validate_product(uuid), private.catalog_flush_constraints()
  to aro_media_executor;
grant select on private.admin_memberships to aro_media_executor;
create policy media_membership_read on private.admin_memberships for select
  to aro_media_executor using (true);

alter table app.media_assets
  alter column object_key drop not null,
  alter column width drop not null,
  alter column height drop not null,
  alter column mime_type drop not null,
  drop constraint media_assets_status_check,
  add constraint media_assets_status_check check (status in ('pending','ready','disabled','deleting','deleted')),
  add column operation_id uuid unique,
  add column uploader_id uuid references auth.users(id) on delete set null,
  add column purpose text check (purpose in ('product-gallery','product-olfactory','category','hero-desktop','hero-mobile','finder-desktop','finder-mobile','finder-option','film-poster')),
  add column byte_size bigint check (byte_size > 0 and byte_size <= 4194304),
  add column sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  add column prepared_metadata jsonb,
  add column retire_after timestamptz,
  add column deletion_claim_id uuid,
  add column deletion_lease_until timestamptz,
  add column deleted_at timestamptz,
  add constraint media_assets_ready_metadata check (
    status <> 'ready' or (object_key is not null and mime_type is not null and width is not null and height is not null
      and (storage_kind <> 'r2' or (operation_id is not null and purpose is not null and byte_size is not null and sha256 is not null)))
  ),
  add constraint media_assets_claim_lifecycle check (
    (status not in ('deleting','deleted') and deletion_claim_id is null and deleted_at is null)
    or (status = 'deleting' and deletion_claim_id is not null and deleted_at is null)
    or (status = 'deleted' and deletion_claim_id is not null and deleted_at is not null)
  );
create index media_assets_cleanup_idx on app.media_assets(retire_after, created_at)
  where storage_kind = 'r2' and status in ('pending','ready','disabled','deleting');
create index media_assets_uploader_idx on app.media_assets(uploader_id) where uploader_id is not null;

create table app.media_renditions (
  asset_id uuid not null references app.media_assets(id) on delete restrict,
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 2400),
  mime_type text not null check (mime_type = 'image/webp'),
  byte_size bigint not null check (byte_size between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  object_key text not null unique check (object_key ~ '^public/dynamic/[0-9a-f-]{36}/[0-9a-f]{64}/[0-9]+[.]webp$'),
  primary key(asset_id, width)
);
alter table app.media_renditions enable row level security;
revoke all on app.media_renditions from public, anon, authenticated, service_role;
grant select on app.media_assets, app.media_renditions to aro_media_executor;
grant insert, update on app.media_assets to aro_media_executor;
grant insert on app.media_renditions to aro_media_executor;
create policy media_service_assets on app.media_assets to aro_media_executor using (true) with check (true);
create policy media_service_renditions on app.media_renditions to aro_media_executor using (true) with check (true);
grant select on app.media_renditions to aro_api_executor, aro_catalog_admin_executor;
create policy media_public_renditions on app.media_renditions for select to aro_api_executor using (true);
create policy media_admin_renditions on app.media_renditions for select to aro_catalog_admin_executor using ((select private.is_admin()));

create table private.media_upload_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null check (attempts between 1 and 60)
);
alter table private.media_upload_limits enable row level security;
alter table private.media_upload_limits force row level security;
revoke all on private.media_upload_limits from public, anon, authenticated, service_role;
grant select, insert, update on private.media_upload_limits to aro_media_executor;
create policy media_limit_service on private.media_upload_limits to aro_media_executor using (true) with check (true);

-- The media executor reads only what reference checks/deferred invariants need.
grant select on app.products, app.product_images, app.product_variants, app.brands,
  app.product_olfactory_families, app.product_notes, app.product_offers, app.store_settings
  to aro_media_executor;
create policy media_reference_products on app.products for select to aro_media_executor using (true);
create policy media_reference_images on app.product_images for select to aro_media_executor using (true);
create policy media_reference_variants on app.product_variants for select to aro_media_executor using (true);
create policy media_reference_brands on app.brands for select to aro_media_executor using (true);
create policy media_reference_families on app.product_olfactory_families for select to aro_media_executor using (true);
create policy media_reference_notes on app.product_notes for select to aro_media_executor using (true);
create policy media_reference_offers on app.product_offers for select to aro_media_executor using (true);
create policy media_reference_settings on app.store_settings for select to aro_media_executor using (true);

create function private.media_source(p_storage text, p_key text)
returns text language sql immutable strict security invoker set search_path = '' as $$
  select case when p_storage = 'r2' then '/media/' || p_key else p_key end;
$$;
create function private.media_document(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', m.id, 'src', private.media_source(m.storage_kind,m.object_key),
    'width',m.width,'height',m.height,
    'variants',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'src',private.media_source('r2',r.object_key),'width',r.width,'height',r.height) order by r.width)
      from app.media_renditions r where r.asset_id=m.id),'[]'::jsonb))
  from app.media_assets m where m.id=p_id and m.status='ready';
$$;
create function private.media_has_references(p_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  select exists(select 1 from app.product_images where media_id=p_id)
    or exists(select 1 from app.products where olfactory_media_id=p_id);
$$;
grant create on schema private to aro_media_executor;
alter function private.media_has_references(uuid) owner to aro_media_executor;
revoke create on schema private from aro_media_executor;
revoke all on function private.media_source(text,text), private.media_document(uuid), private.media_has_references(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.media_source(text,text), private.media_document(uuid)
  to aro_media_executor, aro_api_executor, aro_catalog_admin_executor;
grant execute on function private.media_has_references(uuid) to aro_media_executor, aro_catalog_admin_executor;

create function api.media_upload_reserve(p_operation_id uuid, p_purpose text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid; v_media app.media_assets%rowtype; v_attempts integer;
begin
  if not private.is_admin() then raise exception 'Administrative MFA is required.' using errcode='42501'; end if;
  v_actor := private.request_user_id();
  if p_operation_id is null or p_purpose is null or p_purpose not in
    ('product-gallery','product-olfactory','category','hero-desktop','hero-mobile','finder-desktop','finder-mobile','finder-option','film-poster') then
    raise exception 'Invalid upload operation.' using errcode='22023';
  end if;
  -- Serialize only this operation. UUIDs are unpredictable, but ownership is
  -- still checked when an existing operation is encountered.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,817513));
  select * into v_media from app.media_assets where operation_id=p_operation_id for update;
  if found then
    if v_media.uploader_id is distinct from v_actor then raise exception 'Upload operation is unavailable.' using errcode='42501'; end if;
    if v_media.purpose is distinct from p_purpose or v_media.status not in ('pending','ready') then
      raise exception 'Upload operation cannot be reused.' using errcode='PT409';
    end if;
    return pg_catalog.jsonb_build_object('id',v_media.id,'status',v_media.status,'operationId',v_media.operation_id,'asset',private.media_document(v_media.id));
  end if;
  insert into private.media_upload_limits(user_id,window_start,attempts) values(v_actor,pg_catalog.clock_timestamp(),1)
  on conflict(user_id) do update set
    window_start=case when private.media_upload_limits.window_start < pg_catalog.clock_timestamp()-interval '1 minute' then pg_catalog.clock_timestamp() else private.media_upload_limits.window_start end,
    attempts=case when private.media_upload_limits.window_start < pg_catalog.clock_timestamp()-interval '1 minute' then 1 else least(private.media_upload_limits.attempts+1,60) end
  where private.media_upload_limits.window_start < pg_catalog.clock_timestamp()-interval '1 minute' or private.media_upload_limits.attempts<60
  returning attempts into v_attempts;
  if v_attempts is null then raise exception 'Too many upload reservations.' using errcode='PT429'; end if;
  insert into app.media_assets(storage_kind,object_key,mime_type,width,height,status,operation_id,uploader_id,purpose,retire_after)
    values('r2',null,null,null,null,'pending',p_operation_id,v_actor,p_purpose,pg_catalog.now()+interval '24 hours') returning * into v_media;
  return pg_catalog.jsonb_build_object('id',v_media.id,'status',v_media.status,'operationId',v_media.operation_id,'asset',null);
end;
$$;

create function api.media_upload_status(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_media app.media_assets%rowtype;
begin
  if not private.is_admin() then raise exception 'Administrative MFA is required.' using errcode='42501'; end if;
  select * into v_media from app.media_assets where operation_id=p_operation_id and uploader_id=private.request_user_id();
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object('id',v_media.id,'status',v_media.status,'operationId',v_media.operation_id,'asset',private.media_document(v_media.id));
end;
$$;

create function api.media_upload_prepare(p_asset_id uuid,p_actor_id uuid,p_metadata jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_media app.media_assets%rowtype; v_item jsonb; v_width integer; v_height integer;
  v_bytes bigint; v_sha text; v_key text; v_count integer; v_master boolean:=false; v_seen integer[]:='{}';
begin
  if p_actor_id is null or not exists(select 1 from private.admin_memberships where user_id=p_actor_id and active) then
    raise exception 'Verified administrator is unavailable.' using errcode='42501';
  end if;
  select * into v_media from app.media_assets where id=p_asset_id for update;
  if not found or v_media.uploader_id is distinct from p_actor_id then raise exception 'Upload operation is unavailable.' using errcode='42501'; end if;
  if v_media.prepared_metadata is not null and v_media.prepared_metadata <> p_metadata then raise exception 'The operation already reserves other bytes.' using errcode='PT409'; end if;
  if v_media.status not in ('pending','ready') then raise exception 'Upload operation is retired.' using errcode='PT409'; end if;
  if pg_catalog.jsonb_typeof(p_metadata) is distinct from 'object' or pg_catalog.pg_column_size(p_metadata)>16384
    or p_metadata->>'mimeType' is distinct from 'image/webp'
    or coalesce(p_metadata->>'width','')!~'^[0-9]{1,4}$' or coalesce(p_metadata->>'height','')!~'^[0-9]{1,4}$'
    or coalesce(p_metadata->>'byteSize','')!~'^[0-9]{1,8}$'
    or coalesce(p_metadata->>'sha256','')!~'^[a-f0-9]{64}$'
    or pg_catalog.jsonb_typeof(p_metadata->'variants') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_metadata->'variants') not between 1 and 3 then
    raise exception 'Invalid verified image metadata.' using errcode='22023';
  end if;
  v_width:=(p_metadata->>'width')::integer; v_height:=(p_metadata->>'height')::integer;
  v_bytes:=(p_metadata->>'byteSize')::bigint; v_sha:=p_metadata->>'sha256';
  if v_width not between 1 and 1600 or v_height not between 1 and 2400 or v_width::bigint*v_height>4000000
    or v_bytes not between 1 and 4194304 then raise exception 'Verified image exceeds its limits.' using errcode='22023'; end if;
  if (v_media.purpose='product-gallery' and (v_width<800 or v_height<1000 or v_width*5<>v_height*4))
    or (v_media.purpose='product-olfactory' and (v_width<960 or v_height<1200 or v_width*5<>v_height*4))
    or (v_media.purpose='category' and (v_width<800 or v_height<1000 or v_width*5<>v_height*4))
    or (v_media.purpose in ('hero-desktop','finder-desktop') and (v_width<1536 or v_height<864 or abs(v_width::numeric/v_height-16::numeric/9)>0.005))
    or (v_media.purpose in ('hero-mobile','finder-mobile') and (v_width<780 or v_height<1170 or abs(v_width::numeric/v_height-2::numeric/3)>0.005))
    or (v_media.purpose='finder-option' and (v_width<480 or v_width<>v_height)) then
    raise exception 'Verified dimensions do not match the placement.' using errcode='22023';
  end if;
  v_key:='public/dynamic/'||p_asset_id::text||'/'||v_sha||'/'||v_width::text||'.webp';
  if p_metadata->>'objectKey' is distinct from v_key then raise exception 'Invalid managed image key.' using errcode='22023'; end if;
  if v_media.status='ready' then
    if v_media.sha256<>v_sha or v_media.width<>v_width or v_media.height<>v_height or v_media.byte_size<>v_bytes or v_media.object_key<>v_key then
      raise exception 'The operation already contains a different image.' using errcode='PT409';
    end if;
    if (select pg_catalog.count(*) from app.media_renditions where asset_id=p_asset_id)<>pg_catalog.jsonb_array_length(p_metadata->'variants')
      or exists(select 1 from pg_catalog.jsonb_array_elements(p_metadata->'variants') i where not exists(select 1 from app.media_renditions r
        where r.asset_id=p_asset_id and r.object_key=i->>'objectKey' and r.sha256=i->>'sha256' and r.width=(i->>'width')::integer
          and r.height=(i->>'height')::integer and r.byte_size=(i->>'byteSize')::bigint and r.mime_type=i->>'mimeType')) then
      raise exception 'The operation already contains different variants.' using errcode='PT409';
    end if;
    return private.media_document(p_asset_id);
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_metadata->'variants') loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' or v_item->>'mimeType' is distinct from 'image/webp'
      or coalesce(v_item->>'width','')!~'^[0-9]{1,4}$' or coalesce(v_item->>'height','')!~'^[0-9]{1,4}$'
      or coalesce(v_item->>'byteSize','')!~'^[0-9]{1,8}$' or coalesce(v_item->>'sha256','')!~'^[a-f0-9]{64}$' then
      raise exception 'Invalid verified rendition.' using errcode='22023';
    end if;
    v_count:=(v_item->>'width')::integer;
    if v_count not between 1 and v_width or v_count=any(v_seen) or (v_item->>'height')::integer not between 1 and v_height
      or abs(v_count::numeric/(v_item->>'height')::integer-v_width::numeric/v_height)>0.01
      or (v_item->>'byteSize')::bigint not between 1 and 4194304
      or v_item->>'objectKey' is distinct from 'public/dynamic/'||p_asset_id::text||'/'||v_sha||'/'||v_count::text||'.webp' then
      raise exception 'Invalid or enlarged image rendition.' using errcode='22023';
    end if;
    v_seen:=pg_catalog.array_append(v_seen,v_count);
    if v_count=v_width then
      if (v_item->>'height')::integer<>v_height or v_item->>'sha256'<>v_sha or (v_item->>'byteSize')::bigint<>v_bytes then
        raise exception 'The master rendition does not match its metadata.' using errcode='22023';
      end if;
      v_master:=true;
    end if;
    -- Validation only: R2 objects do not yet exist at this stage.
  end loop;
  if not v_master then raise exception 'The master rendition is missing.' using errcode='22023'; end if;
  -- Admission of an active bounded Worker request renews the pending window;
  -- otherwise a retry of a day-old operation could race its orphan cleanup.
  update app.media_assets set prepared_metadata=p_metadata,retire_after=pg_catalog.now()+interval '24 hours' where id=p_asset_id;
  perform private.catalog_flush_constraints();
  return pg_catalog.jsonb_build_object('id',p_asset_id,'status','pending','operationId',v_media.operation_id,'asset',null);
end;
$$;

create function api.media_upload_complete(p_asset_id uuid,p_actor_id uuid,p_metadata jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_media app.media_assets%rowtype; v_item jsonb; v_width integer; v_height integer;
  v_bytes bigint; v_sha text; v_key text; v_count integer; v_master boolean:=false; v_seen integer[]:='{}';
begin
  if p_actor_id is null or not exists(select 1 from private.admin_memberships where user_id=p_actor_id and active) then
    raise exception 'Verified administrator is unavailable.' using errcode='42501';
  end if;
  select * into v_media from app.media_assets where id=p_asset_id for update;
  if not found or v_media.uploader_id is distinct from p_actor_id then raise exception 'Upload operation is unavailable.' using errcode='42501'; end if;
  if v_media.prepared_metadata is distinct from p_metadata then raise exception 'The verified receipt does not match the reserved bytes.' using errcode='PT409'; end if;
  if v_media.status not in ('pending','ready') then raise exception 'Upload operation is retired.' using errcode='PT409'; end if;
  if pg_catalog.jsonb_typeof(p_metadata) is distinct from 'object' or pg_catalog.pg_column_size(p_metadata)>16384
    or p_metadata->>'mimeType' is distinct from 'image/webp'
    or coalesce(p_metadata->>'width','')!~'^[0-9]{1,4}$' or coalesce(p_metadata->>'height','')!~'^[0-9]{1,4}$'
    or coalesce(p_metadata->>'byteSize','')!~'^[0-9]{1,8}$'
    or coalesce(p_metadata->>'sha256','')!~'^[a-f0-9]{64}$'
    or pg_catalog.jsonb_typeof(p_metadata->'variants') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_metadata->'variants') not between 1 and 3 then
    raise exception 'Invalid verified image metadata.' using errcode='22023';
  end if;
  v_width:=(p_metadata->>'width')::integer; v_height:=(p_metadata->>'height')::integer;
  v_bytes:=(p_metadata->>'byteSize')::bigint; v_sha:=p_metadata->>'sha256';
  if v_width not between 1 and 1600 or v_height not between 1 and 2400 or v_width::bigint*v_height>4000000
    or v_bytes not between 1 and 4194304 then raise exception 'Verified image exceeds its limits.' using errcode='22023'; end if;
  if (v_media.purpose='product-gallery' and (v_width<800 or v_height<1000 or v_width*5<>v_height*4))
    or (v_media.purpose='product-olfactory' and (v_width<960 or v_height<1200 or v_width*5<>v_height*4))
    or (v_media.purpose='category' and (v_width<800 or v_height<1000 or v_width*5<>v_height*4))
    or (v_media.purpose in ('hero-desktop','finder-desktop') and (v_width<1536 or v_height<864 or abs(v_width::numeric/v_height-16::numeric/9)>0.005))
    or (v_media.purpose in ('hero-mobile','finder-mobile') and (v_width<780 or v_height<1170 or abs(v_width::numeric/v_height-2::numeric/3)>0.005))
    or (v_media.purpose='finder-option' and (v_width<480 or v_width<>v_height)) then
    raise exception 'Verified dimensions do not match the placement.' using errcode='22023';
  end if;
  v_key:='public/dynamic/'||p_asset_id::text||'/'||v_sha||'/'||v_width::text||'.webp';
  if p_metadata->>'objectKey' is distinct from v_key then raise exception 'Invalid managed image key.' using errcode='22023'; end if;
  if v_media.status='ready' then
    if v_media.sha256<>v_sha or v_media.width<>v_width or v_media.height<>v_height or v_media.byte_size<>v_bytes or v_media.object_key<>v_key then
      raise exception 'The operation already contains a different image.' using errcode='PT409';
    end if;
    if (select pg_catalog.count(*) from app.media_renditions where asset_id=p_asset_id)<>pg_catalog.jsonb_array_length(p_metadata->'variants')
      or exists(select 1 from pg_catalog.jsonb_array_elements(p_metadata->'variants') i where not exists(select 1 from app.media_renditions r
        where r.asset_id=p_asset_id and r.object_key=i->>'objectKey' and r.sha256=i->>'sha256' and r.width=(i->>'width')::integer
          and r.height=(i->>'height')::integer and r.byte_size=(i->>'byteSize')::bigint and r.mime_type=i->>'mimeType')) then
      raise exception 'The operation already contains different variants.' using errcode='PT409';
    end if;
    return private.media_document(p_asset_id);
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_metadata->'variants') loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' or v_item->>'mimeType' is distinct from 'image/webp'
      or coalesce(v_item->>'width','')!~'^[0-9]{1,4}$' or coalesce(v_item->>'height','')!~'^[0-9]{1,4}$'
      or coalesce(v_item->>'byteSize','')!~'^[0-9]{1,8}$' or coalesce(v_item->>'sha256','')!~'^[a-f0-9]{64}$' then
      raise exception 'Invalid verified rendition.' using errcode='22023';
    end if;
    v_count:=(v_item->>'width')::integer;
    if v_count not between 1 and v_width or v_count=any(v_seen) or (v_item->>'height')::integer not between 1 and v_height
      or abs(v_count::numeric/(v_item->>'height')::integer-v_width::numeric/v_height)>0.01
      or (v_item->>'byteSize')::bigint not between 1 and 4194304
      or v_item->>'objectKey' is distinct from 'public/dynamic/'||p_asset_id::text||'/'||v_sha||'/'||v_count::text||'.webp' then
      raise exception 'Invalid or enlarged image rendition.' using errcode='22023';
    end if;
    v_seen:=pg_catalog.array_append(v_seen,v_count);
    if v_count=v_width then
      if (v_item->>'height')::integer<>v_height or v_item->>'sha256'<>v_sha or (v_item->>'byteSize')::bigint<>v_bytes then
        raise exception 'The master rendition does not match its metadata.' using errcode='22023';
      end if;
      v_master:=true;
    end if;
    insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
      values(p_asset_id,v_count,(v_item->>'height')::integer,'image/webp',(v_item->>'byteSize')::bigint,v_item->>'sha256',v_item->>'objectKey');
  end loop;
  if not v_master then raise exception 'The master rendition is missing.' using errcode='22023'; end if;
  update app.media_assets set object_key=v_key,mime_type='image/webp',width=v_width,height=v_height,byte_size=v_bytes,
    sha256=v_sha,status='ready',verified_at=pg_catalog.now(),retire_after=pg_catalog.now()+interval '7 days' where id=p_asset_id;
  perform private.catalog_flush_constraints();
  return private.media_document(p_asset_id);
end;
$$;

create function api.media_public_asset(p_asset_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.media_document(m.id) from app.media_assets m
  where m.id=p_asset_id and m.storage_kind='r2' and m.status='ready' and m.purpose is not null;
$$;

-- Product attachment and GC share the same row lock. A deleted/claimed asset
-- never becomes attachable again merely because a worker lease expired.
grant update(retire_after) on app.media_assets to aro_catalog_admin_executor;
create policy media_catalog_retention_update on app.media_assets for update to aro_catalog_admin_executor
  using ((select private.is_admin())) with check ((select private.is_admin()));
create or replace function private.catalog_ready_image(p_reference text)
returns uuid language plpgsql volatile security invoker set search_path = '' as $$
declare v_id uuid; v_key text;
begin
  if p_reference is null or p_reference='' then return null; end if;
  if pg_catalog.char_length(p_reference)>512 then raise exception 'Invalid managed image reference.' using errcode='22023'; end if;
  v_key:=case when p_reference like '/media/public/dynamic/%' then pg_catalog.substr(p_reference,8) else p_reference end;
  select id into v_id from app.media_assets where object_key=v_key and status='ready'
    and mime_type like 'image/%' and (storage_kind='local' or p_reference='/media/'||object_key)
    order by storage_kind,id limit 1 for update;
  if v_id is null then raise exception 'The image is not available as a verified reference.' using errcode='22023'; end if;
  update app.media_assets set retire_after=null where id=v_id and storage_kind='r2';
  return v_id;
end;
$$;

create function private.media_reference_retention()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_ids uuid[];
begin
  if tg_table_name='product_images' then
    v_ids:=case when tg_op='INSERT' then array[new.media_id] when tg_op='DELETE' then array[old.media_id] else array[old.media_id,new.media_id] end;
  else
    v_ids:=case when tg_op='INSERT' then array[new.olfactory_media_id] when tg_op='DELETE' then array[old.olfactory_media_id] else array[old.olfactory_media_id,new.olfactory_media_id] end;
  end if;
  for v_id in select distinct value from pg_catalog.unnest(v_ids) value where value is not null order by value loop
    perform 1 from app.media_assets where id=v_id and storage_kind='r2' for update;
    update app.media_assets set retire_after=case when private.media_has_references(v_id) then null else pg_catalog.now()+interval '7 days' end
      where id=v_id and storage_kind='r2' and status='ready';
  end loop;
  return null;
end;
$$;
grant create on schema private to aro_media_executor;
alter function private.media_reference_retention() owner to aro_media_executor;
revoke create on schema private from aro_media_executor;
revoke all on function private.media_reference_retention() from public, anon, authenticated, service_role;
create trigger media_gallery_retention after insert or update or delete on app.product_images
  for each row execute function private.media_reference_retention();
create trigger media_olfactory_retention after insert or update of olfactory_media_id or delete on app.products
  for each row execute function private.media_reference_retention();

create function api.media_gc_claim(p_limit integer default 10)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_media app.media_assets%rowtype; v_result jsonb:='[]'; v_claim uuid;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid cleanup limit.' using errcode='22023'; end if;
  for v_media in select * from app.media_assets where storage_kind='r2' and
    ((status in ('pending','ready','disabled') and retire_after<=pg_catalog.now())
      or (status='deleting' and deletion_lease_until<=pg_catalog.now()))
    order by retire_after nulls last,created_at,id limit p_limit for update skip locked loop
    if private.media_has_references(v_media.id) then continue; end if;
    v_claim:=coalesce(v_media.deletion_claim_id,pg_catalog.gen_random_uuid());
    update app.media_assets set status='deleting',deletion_claim_id=v_claim,deletion_lease_until=pg_catalog.now()+interval '15 minutes'
      where id=v_media.id;
    v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',v_media.id,'claimId',v_claim,'prefix','public/dynamic/'||v_media.id::text||'/',
      'keys',coalesce((select pg_catalog.jsonb_agg(object_key order by width) from app.media_renditions where asset_id=v_media.id),'[]'::jsonb)));
  end loop;
  perform private.catalog_flush_constraints();
  return v_result;
end;
$$;
create function api.media_gc_finalize(p_asset_id uuid,p_claim_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_media app.media_assets%rowtype;
begin
  select * into v_media from app.media_assets where id=p_asset_id for update;
  if not found or p_claim_id is null or v_media.deletion_claim_id is distinct from p_claim_id
    or v_media.status not in ('deleting','deleted') then raise exception 'The cleanup claim is no longer valid.' using errcode='PT409'; end if;
  if private.media_has_references(p_asset_id) then raise exception 'The asset still has active references.' using errcode='PT409'; end if;
  if v_media.status='deleted' then return; end if;
  update app.media_assets set status='deleted',deleted_at=pg_catalog.now(),deletion_lease_until=null where id=p_asset_id;
  perform private.catalog_flush_constraints();
end;
$$;

-- Apply managed sources to both existing DTOs; retain their established fields
-- and owner/ACL boundaries. Append only verified R2 rendition manifests.
do $migration$
declare v_name text; v_definition text;
begin
  foreach v_name in array array['private.catalog_product_document(uuid)','private.admin_product_document(uuid)'] loop
    v_definition:=pg_catalog.pg_get_functiondef(v_name::regprocedure);
    v_definition:=pg_catalog.replace(v_definition,'main_image.object_key','private.media_source(main_image.storage_kind,main_image.object_key)');
    v_definition:=pg_catalog.replace(v_definition,'olfactory.object_key','private.media_source(olfactory.storage_kind,olfactory.object_key)');
    v_definition:=pg_catalog.replace(v_definition,'''image'', m.object_key','''image'', private.media_source(m.storage_kind,m.object_key)');
    v_definition:=pg_catalog.replace(v_definition,E'  )\n  from app.products p',E'  ) || pg_catalog.jsonb_build_object(''mediaAssets'', coalesce((select pg_catalog.jsonb_agg(private.media_document(ma.id) order by ma.id) from app.media_assets ma where ma.storage_kind=''r2'' and ma.status=''ready'' and (ma.id=p.olfactory_media_id or exists(select 1 from app.product_images pi where pi.product_id=p.id and pi.media_id=ma.id))),''[]''::jsonb))\n  from app.products p');
    execute v_definition;
  end loop;
end;
$migration$;

grant create on schema api to aro_media_executor;
alter function api.media_upload_reserve(uuid,text) owner to aro_media_executor;
alter function api.media_upload_status(uuid) owner to aro_media_executor;
alter function api.media_upload_prepare(uuid,uuid,jsonb) owner to aro_media_executor;
alter function api.media_upload_complete(uuid,uuid,jsonb) owner to aro_media_executor;
alter function api.media_public_asset(uuid) owner to aro_media_executor;
alter function api.media_gc_claim(integer) owner to aro_media_executor;
alter function api.media_gc_finalize(uuid,uuid) owner to aro_media_executor;
revoke create on schema api from aro_media_executor;
revoke all on function api.media_upload_reserve(uuid,text),api.media_upload_status(uuid),api.media_upload_prepare(uuid,uuid,jsonb),api.media_upload_complete(uuid,uuid,jsonb),
  api.media_public_asset(uuid),api.media_gc_claim(integer),api.media_gc_finalize(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function api.media_upload_reserve(uuid,text),api.media_upload_status(uuid) to authenticated;
grant execute on function api.media_public_asset(uuid) to anon,authenticated,service_role;
grant execute on function api.media_upload_prepare(uuid,uuid,jsonb),api.media_upload_complete(uuid,uuid,jsonb),api.media_gc_claim(integer),api.media_gc_finalize(uuid,uuid) to service_role;
comment on table app.media_renditions is 'Verified immutable derivative references only. No original bytes or fictitious srcset entries.';
comment on function api.media_upload_complete(uuid,uuid,jsonb) is 'Worker-only verification receipt. Actor identity and decoded/hash/HEAD metadata are verified by the server; browser roles cannot invoke this function.';
