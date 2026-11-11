-- A library row describes an asset; it is deliberately not a live placement.
-- Only FK-backed committed placements retain bytes. No bucket/network changes.
create table app.media_library (
  asset_id uuid primary key references app.media_assets(id) on delete restrict,
  label text not null check(char_length(label) between 1 and 160 and label=btrim(label) and label !~ '[[:cntrl:]]'),
  alt text not null default '' check(char_length(alt)<=500 and alt !~ '[[:cntrl:]]'),
  section text not null check(section in('home','products','about','account','identity','seo','other')),
  version bigint not null default 1 check(version>0),
  search_document tsvector generated always as (to_tsvector('simple'::regconfig,label)) stored,
  updated_at timestamptz not null default clock_timestamp()
);
create index media_library_name_search_idx on app.media_library using gin(search_document);
create index media_library_section_idx on app.media_library(section,asset_id);
create index media_assets_library_order_idx on app.media_assets(created_at desc,id) where storage_kind='r2';

create table app.site_media_slots (
  slot text primary key check(slot in('about.hero.desktop','about.hero.mobile','about.story',
    'auth.customer.desktop','auth.customer.mobile','identity.logo','seo.home','seo.catalog','seo.brands')),
  asset_id uuid references app.media_assets(id) on delete restrict,
  alt text not null default '' check(char_length(alt)<=500 and alt !~ '[[:cntrl:]]'),
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default clock_timestamp()
);
create index site_media_slots_asset_idx on app.site_media_slots(asset_id) where asset_id is not null;
insert into app.site_media_slots(slot) select unnest(array['about.hero.desktop','about.hero.mobile','about.story',
  'auth.customer.desktop','auth.customer.mobile','identity.logo','seo.home','seo.catalog','seo.brands']);

create table private.media_lifecycle_events (
  id bigint generated always as identity primary key,
  asset_id uuid not null references app.media_assets(id) on delete restrict,
  event_type text not null check(event_type in('reserved','ready','scheduled','cancelled','claimed','retried','rechecked','failed','blocked','deleted','metadata')),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  claim_id uuid,
  code text check(code in('storage-list','storage-delete','confirmation','unavailable','references'))
);
create index media_lifecycle_events_asset_idx on private.media_lifecycle_events(asset_id,occurred_at desc,id desc);

alter table app.media_library enable row level security;
alter table app.media_library force row level security;
alter table app.site_media_slots enable row level security;
alter table app.site_media_slots force row level security;
alter table private.media_lifecycle_events enable row level security;
alter table private.media_lifecycle_events force row level security;
revoke all on app.media_library,app.site_media_slots,private.media_lifecycle_events from public,anon,authenticated,service_role;
revoke all on sequence private.media_lifecycle_events_id_seq from public,anon,authenticated,service_role;
grant select,insert,update on app.media_library,app.site_media_slots to aro_media_executor;
grant select,insert on private.media_lifecycle_events to aro_media_executor;
grant usage on sequence private.media_lifecycle_events_id_seq to aro_media_executor;
create policy media_library_executor on app.media_library to aro_media_executor using(true) with check(true);
create policy site_media_executor on app.site_media_slots to aro_media_executor using(true) with check(true);
create policy media_events_executor_read on private.media_lifecycle_events for select to aro_media_executor using(true);
create policy media_events_executor_insert on private.media_lifecycle_events for insert to aro_media_executor with check(true);

create function private.media_default_section(p_purpose text)
returns text language sql immutable security invoker set search_path='' as $$
  select case when p_purpose in('product-gallery','product-olfactory') then 'products'
    when p_purpose='site-vector' then 'identity'
    when p_purpose='site-image' or p_purpose is null then 'other' else 'home' end;
$$;
create function private.media_default_label(p_id uuid,p_purpose text)
returns text language sql immutable security invoker set search_path='' as $$
  select replace(coalesce(p_purpose,'media'),'-',' ')||' · '||substr(p_id::text,1,8);
$$;
insert into app.media_library(asset_id,label,section)
  select id,private.media_default_label(id,purpose),private.media_default_section(purpose) from app.media_assets where storage_kind='r2';

create function private.media_library_asset_change()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
  if new.storage_kind<>'r2' then return null;end if;
  if tg_op='INSERT' then
    insert into app.media_library(asset_id,label,section)
      values(new.id,private.media_default_label(new.id,new.purpose),private.media_default_section(new.purpose)) on conflict(asset_id) do nothing;
    insert into private.media_lifecycle_events(asset_id,event_type,actor_id)
      values(new.id,case when new.status='ready' then 'ready' else 'reserved' end,private.request_user_id());
  else
    if new.status is distinct from old.status then
      if new.status in('ready','deleting','deleted') then
        insert into private.media_lifecycle_events(asset_id,event_type,actor_id,claim_id)
          values(new.id,case new.status when 'deleting' then 'claimed' else new.status end,private.request_user_id(),new.deletion_claim_id);
      end if;
    end if;
    if new.status in('pending','ready','disabled') and new.retire_after is distinct from old.retire_after then
      insert into private.media_lifecycle_events(asset_id,event_type,actor_id)
        values(new.id,case when new.retire_after is null then 'cancelled' else 'scheduled' end,private.request_user_id());
    end if;
  end if;
  return null;
end;
$$;
create trigger media_library_asset_change after insert or update of status,retire_after on app.media_assets
  for each row execute function private.media_library_asset_change();

-- Keep the original immutable admission rules, adding one flexible site profile.
alter table app.media_assets drop constraint media_assets_purpose_check,
  add constraint media_assets_purpose_check check(purpose in('product-gallery','product-olfactory','category',
    'hero-desktop','hero-mobile','finder-desktop','finder-mobile','finder-option','film-poster','film-video','site-image'));
create or replace function private.media_image_dimensions_valid(p_width integer,p_height integer,p_purpose text)
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
      when 'site-image' then p_width between 64 and 2304 and p_height>=32
      else false end,false);
$$;
create function private.media_placement_compatible(p_mime text,p_width integer,p_height integer,p_purpose text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(case when p_purpose='film-video' then p_mime='video/mp4'
    else p_mime='image/webp' and private.media_image_dimensions_valid(p_width,p_height,p_purpose) end,false);
$$;
create function private.site_image_compatible(p_slot text,p_width integer,p_height integer,p_mime text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(case
    when p_mime='image/svg+xml' then p_slot='identity.logo'
    when p_mime='image/webp' then private.media_image_dimensions_valid(p_width,p_height,'site-image') and
      case p_slot
        when 'about.hero.desktop' then p_width>=1536 and p_height>=864
        when 'about.hero.mobile' then p_width>=780 and p_height>=858
        when 'about.story' then p_width>=960 and p_height>=1200
        when 'auth.customer.desktop' then p_width>=780 and p_height>=1170
        when 'auth.customer.mobile' then p_width>=960 and p_height>=320
        when 'identity.logo' then p_width>=774 and p_height>=374
        when 'seo.home' then p_width>=1200 and p_height>=630
        when 'seo.catalog' then p_width>=1200 and p_height>=630
        when 'seo.brands' then p_width>=1200 and p_height>=630
        else false end
    else false end,false);
$$;
grant execute on function private.media_image_dimensions_valid(integer,integer,text),
  private.media_placement_compatible(text,integer,integer,text) to aro_catalog_admin_executor;

do $migration$
declare definition text;signature text;marker text;
begin
  definition:=pg_get_functiondef('api.media_upload_reserve(uuid,text)'::regprocedure);
  marker:='''finder-option'',''film-poster'',''film-video'')';
  if strpos(definition,marker)=0 then raise exception 'Unexpected media reservation boundary';end if;
  execute replace(definition,marker,'''finder-option'',''film-poster'',''film-video'',''site-image'')');
  foreach signature in array array['api.media_upload_complete(uuid,uuid,jsonb)','api.media_upload_complete_video(uuid,uuid,jsonb)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if strpos(definition,'interval ''7 days''')=0 then raise exception 'Unexpected ready media retention boundary: %',signature;end if;
    execute replace(definition,'interval ''7 days''','interval ''86400 seconds''');
  end loop;
  definition:=pg_get_functiondef('api.admin_save_home(jsonb,jsonb,bigint,bigint,boolean,uuid)'::regprocedure);
  marker:='where m.purpose is distinct from r.purpose or (r.purpose=''film-video'') is distinct from (m.mime_type=''video/mp4'')';
  if strpos(definition,marker)=0 then raise exception 'Unexpected Home media compatibility boundary';end if;
  execute replace(definition,marker,'where not private.media_placement_compatible(m.mime_type,m.width,m.height,r.purpose)');
end;
$migration$;

-- Product commands retain their existing locks/auth/version/import boundary.
create function private.catalog_ready_image_for(p_reference text,p_purpose text)
returns uuid language plpgsql volatile security invoker set search_path='' as $$
declare asset_id uuid;asset app.media_assets%rowtype;
begin
  asset_id:=private.catalog_ready_image(p_reference);
  if asset_id is null then return null;end if;
  select * into asset from app.media_assets where id=asset_id;
  if asset.storage_kind='r2' and not private.media_placement_compatible(asset.mime_type,asset.width,asset.height,p_purpose) then
    raise exception 'La imagen no cumple las dimensiones de este apartado.' using errcode='22023';end if;
  return asset_id;
end;
$$;
grant execute on function private.catalog_ready_image_for(text,text) to aro_catalog_admin_executor;
do $migration$
declare definition text;marker text;
begin
  definition:=pg_get_functiondef('private.catalog_save_product_prepared(jsonb,bigint,boolean)'::regprocedure);
  marker:='private.catalog_ready_image(v_detail->>''olfactoryImage'')';
  if strpos(definition,marker)=0 then raise exception 'Unexpected olfactory media writer';end if;
  definition:=replace(definition,marker,'private.catalog_ready_image_for(v_detail->>''olfactoryImage'',''product-olfactory'')');
  marker:='private.catalog_ready_image(v_item->>''image'')';
  if strpos(definition,marker)=0 then raise exception 'Unexpected gallery media writer';end if;
  execute replace(definition,marker,'private.catalog_ready_image_for(v_item->>''image'',''product-gallery'')');
end;
$migration$;

create or replace function private.media_has_references(p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from app.product_images where media_id=p_id)
    or exists(select 1 from app.products where olfactory_media_id=p_id)
    or exists(select 1 from app.home_media where media_id=p_id)
    or exists(select 1 from app.order_items where media_id=p_id)
    or exists(select 1 from app.site_media_slots where asset_id=p_id);
$$;
create or replace function private.media_reference_retention()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare asset_id uuid;asset_ids uuid[];
begin
  if tg_table_name='site_media_slots' then
    asset_ids:=case tg_op when 'INSERT' then array[new.asset_id] when 'DELETE' then array[old.asset_id] else array[old.asset_id,new.asset_id] end;
  elsif tg_table_name in('product_images','home_media','order_items') then
    asset_ids:=case tg_op when 'INSERT' then array[new.media_id] when 'DELETE' then array[old.media_id] else array[old.media_id,new.media_id] end;
  else
    asset_ids:=case tg_op when 'INSERT' then array[new.olfactory_media_id] when 'DELETE' then array[old.olfactory_media_id] else array[old.olfactory_media_id,new.olfactory_media_id] end;
  end if;
  for asset_id in select distinct value from unnest(asset_ids) value where value is not null order by value loop
    perform 1 from app.media_assets where id=asset_id and storage_kind='r2' for update;
    update app.media_assets set retire_after=case when private.media_has_references(asset_id) then null else clock_timestamp()+interval '86400 seconds' end
      where id=asset_id and storage_kind='r2' and status='ready';
  end loop;
  return null;
end;
$$;
create trigger site_media_retention after insert or update or delete on app.site_media_slots
  for each row execute function private.media_reference_retention();

-- Existing unused objects receive a fresh full window; migration never performs
-- an immediate historical deletion. Referenced/deleting/deleted rows are kept.
update app.media_assets set retire_after=clock_timestamp()+interval '86400 seconds'
where storage_kind='r2' and status in('pending','ready','disabled') and not private.media_has_references(id);

create function private.media_usages(p_ids uuid[] default null)
returns table(asset_id uuid,section text,label text,key text) language sql stable security invoker set search_path='' as $$
  select i.media_id,'products',p.name,'product:'||p.id::text||':gallery:'||i.position::text
    from app.product_images i join app.products p on p.id=i.product_id where p_ids is null or i.media_id=any(p_ids)
  union all select p.olfactory_media_id,'products',p.name,'product:'||p.id::text||':olfactory'
    from app.products p where p.olfactory_media_id is not null and (p_ids is null or p.olfactory_media_id=any(p_ids))
  union all select h.media_id,'home',array_to_string(h.slot,'.'),'home:'||array_to_string(h.slot,'.')
    from app.home_media h where p_ids is null or h.media_id=any(p_ids)
  union all select i.media_id,'products','Pedido '||o.reference,'order:'||i.order_id::text||':'||i.position::text
    from app.order_items i join app.orders o on o.id=i.order_id where i.media_id is not null and (p_ids is null or i.media_id=any(p_ids))
  union all select s.asset_id,case split_part(s.slot,'.',1) when 'auth' then 'account' else split_part(s.slot,'.',1) end,s.slot,'site:'||s.slot
    from app.site_media_slots s where s.asset_id is not null and (p_ids is null or s.asset_id=any(p_ids));
$$;
grant select on app.orders to aro_media_executor;
create policy media_order_usage_read on app.orders for select to aro_media_executor using(true);

-- JSON assembly is pure; list queries aggregate references and renditions once.
create function private.media_library_json(p_media app.media_assets,p_library app.media_library,p_uses bigint,p_variants jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare manifest jsonb;
begin
  if p_media.status='ready' then
    if p_media.mime_type='video/mp4' then
      manifest:=jsonb_build_object('id',p_media.id,'src','/media/'||p_media.object_key,'width',p_media.width,'height',p_media.height,
        'durationMs',p_media.duration_ms,'byteSize',p_media.byte_size,'mimeType',p_media.mime_type);
    else
      manifest:=jsonb_build_object('id',p_media.id,'src','/media/'||p_media.object_key,'width',p_media.width,'height',p_media.height,
        'variants',coalesce(p_variants,'[]'::jsonb));
    end if;
  end if;
  return jsonb_build_object('id',p_media.id,'name',coalesce(p_library.label,private.media_default_label(p_media.id,p_media.purpose)),
    'alt',coalesce(p_library.alt,''),'section',coalesce(p_library.section,private.media_default_section(p_media.purpose)),
    'version',coalesce(p_library.version,1),'purpose',p_media.purpose,
    'state',case when p_media.status='ready' then case when p_uses>0 then 'used' else 'unused' end else p_media.status end,
    'createdAt',p_media.created_at,'retireAfter',p_media.retire_after,'useCount',p_uses,'asset',manifest,
    'mimeType',p_media.mime_type,'width',p_media.width,'height',p_media.height,'byteSize',p_media.byte_size);
end;
$$;
create function private.media_library_record(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.media_library_json(m,l,(select count(*) from private.media_usages(array[p_id])),
    (select jsonb_agg(jsonb_build_object('src','/media/'||r.object_key,'width',r.width,'height',r.height) order by r.width)
      from app.media_renditions r where r.asset_id=p_id))
  from app.media_assets m left join app.media_library l on l.asset_id=m.id where m.id=p_id and m.storage_kind='r2';
$$;
create function api.admin_media_library(p_query text default '',p_section text default 'all',p_state text default 'all',p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare query_text text:=btrim(coalesce(p_query,''));query_filter tsquery;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  if char_length(query_text)>160 or p_section is null or p_section not in('all','home','products','about','account','identity','seo','other')
    or p_state is null or p_state not in('all','used','unused','pending','deleted') or p_page is null or p_page not between 1 and 100000
    or p_page_size is null or p_page_size not between 1 and 50 then raise exception 'Filtros de biblioteca no válidos.' using errcode='22023';end if;
  query_filter:=case when query_text<>'' then websearch_to_tsquery('simple'::regconfig,query_text) end;
  return (
    with usage_counts as materialized(select asset_id,count(*) as uses from private.media_usages() group by asset_id),
    matching as materialized(
      select m.id,coalesce(u.uses,0) as uses from app.media_assets m join app.media_library l on l.asset_id=m.id
      left join usage_counts u on u.asset_id=m.id where m.storage_kind='r2'
        and (p_section='all' or l.section=p_section) and (query_filter is null or l.search_document@@query_filter)
        and (p_state='all' or (p_state='used' and m.status='ready' and coalesce(u.uses,0)>0)
          or (p_state='unused' and m.status='ready' and coalesce(u.uses,0)=0)
          or (p_state='pending' and m.status<>'deleted' and (m.retire_after is not null or m.status='deleting'))
          or (p_state='deleted' and m.status='deleted'))),
    selected as materialized(select m as media,l as metadata,x.uses,m.created_at,m.id from matching x
      join app.media_assets m on m.id=x.id join app.media_library l on l.asset_id=m.id
      order by m.created_at desc,m.id limit p_page_size offset (p_page-1)*p_page_size),
    variants as(select r.asset_id,jsonb_agg(jsonb_build_object('src','/media/'||r.object_key,'width',r.width,'height',r.height) order by r.width) as manifest
      from app.media_renditions r where r.asset_id in(select id from selected) group by r.asset_id)
    select jsonb_build_object('items',coalesce((select jsonb_agg(private.media_library_json(s.media,s.metadata,s.uses,v.manifest)
      order by s.created_at desc,s.id) from selected s left join variants v on v.asset_id=s.id),'[]'::jsonb),
      'total',(select count(*) from matching),'page',p_page,'pageSize',p_page_size));
end;
$$;
create function api.admin_media_detail(p_asset_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item jsonb;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  item:=private.media_library_record(p_asset_id);
  if item is null then raise exception 'El recurso ya no está disponible.' using errcode='PT404';end if;
  return item||jsonb_build_object('usages',coalesce((select jsonb_agg(jsonb_build_object('section',u.section,'label',u.label,'key',u.key) order by u.key)
    from private.media_usages(array[p_asset_id]) u),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id::text,'type',e.event_type,'createdAt',e.occurred_at,'code',e.code)
      order by e.occurred_at desc,e.id desc) from (select * from private.media_lifecycle_events where asset_id=p_asset_id order by occurred_at desc,id desc limit 50) e),'[]'::jsonb));
end;
$$;
create function api.admin_media_metadata(p_asset_id uuid,p_name text,p_alt text,p_section text,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare current_version bigint;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 160 or p_name~'[[:cntrl:]]'
    or p_alt is null or char_length(p_alt)>500 or p_alt~'[[:cntrl:]]' or p_section is null
    or p_section not in('home','products','about','account','identity','seo','other') then raise exception 'Metadatos no válidos.' using errcode='22023';end if;
  perform 1 from app.media_assets where id=p_asset_id and storage_kind='r2' for update;
  if not found then raise exception 'El recurso ya no está disponible.' using errcode='PT404';end if;
  select version into current_version from app.media_library where asset_id=p_asset_id for update;
  if p_expected_version is null or current_version is distinct from p_expected_version then raise exception 'El recurso cambió en otra sesión.' using errcode='PT409';end if;
  update app.media_library set label=btrim(p_name),alt=p_alt,section=p_section,version=version+1,updated_at=clock_timestamp() where asset_id=p_asset_id;
  insert into private.media_lifecycle_events(asset_id,event_type,actor_id) values(p_asset_id,'metadata',private.request_user_id());
  return private.media_library_record(p_asset_id);
end;
$$;
create function api.admin_media_retire(p_asset_id uuid,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare asset app.media_assets%rowtype;current_version bigint;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  select * into asset from app.media_assets where id=p_asset_id and storage_kind='r2' for update;
  if not found then raise exception 'El recurso ya no está disponible.' using errcode='PT404';end if;
  select version into current_version from app.media_library where asset_id=p_asset_id for update;
  if p_expected_version is null or current_version is distinct from p_expected_version then raise exception 'El recurso cambió en otra sesión.' using errcode='PT409';end if;
  if asset.status in('deleting','deleted') or private.media_has_references(p_asset_id) then
    raise exception 'Un recurso utilizado o en eliminación no se puede programar.' using errcode='PT409';end if;
  update app.media_library set version=version+1,updated_at=clock_timestamp() where asset_id=p_asset_id;
  update app.media_assets set retire_after=clock_timestamp()+interval '86400 seconds' where id=p_asset_id;
  return private.media_library_record(p_asset_id);
end;
$$;

create function private.site_media_projection()
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('slot',s.slot,'alt',s.alt,'version',s.version,
    'assetId',case when m.status='ready' then s.asset_id end,'asset',case when m.status='ready' then private.media_document(s.asset_id) end) order by s.slot),'[]'::jsonb))
  from app.site_media_slots s left join app.media_assets m on m.id=s.asset_id;
$$;
create function api.site_media_document()
returns jsonb language sql stable security definer set search_path='' as $$ select private.site_media_projection(); $$;
create function api.admin_site_media_document()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  return private.site_media_projection();
end;
$$;
create function api.admin_save_site_media(p_slot text,p_asset_id uuid,p_alt text,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare previous app.site_media_slots%rowtype;asset_id uuid;asset app.media_assets%rowtype;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  if p_alt is null or char_length(p_alt)>500 or p_alt~'[[:cntrl:]]' then raise exception 'Descripción no válida.' using errcode='22023';end if;
  select * into previous from app.site_media_slots where slot=p_slot for update;
  if not found then raise exception 'Apartado no válido.' using errcode='22023';end if;
  if p_expected_version is null or previous.version is distinct from p_expected_version then raise exception 'El apartado cambió en otra sesión.' using errcode='PT409';end if;
  for asset_id in select distinct value from unnest(array[previous.asset_id,p_asset_id]) value where value is not null order by value loop
    select * into asset from app.media_assets where id=asset_id for update;
    if asset_id=p_asset_id and (asset.id is null or asset.storage_kind<>'r2' or asset.status<>'ready'
      or not private.media_placement_compatible(asset.mime_type,asset.width,asset.height,'site-image')
      or not private.site_image_compatible(p_slot,asset.width,asset.height,asset.mime_type)) then
      raise exception 'Selecciona una imagen gestionada disponible para este apartado.' using errcode='22023';end if;
  end loop;
  update app.site_media_slots set asset_id=p_asset_id,alt=p_alt,version=version+1,updated_at=clock_timestamp() where slot=p_slot;
  return private.site_media_projection();
end;
$$;

create or replace function api.media_gc_claim(p_limit integer default 10)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare asset app.media_assets%rowtype;result jsonb:='[]';claim_id uuid;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid cleanup limit.' using errcode='22023';end if;
  for asset in select * from app.media_assets where storage_kind='r2' and
    ((status in('pending','ready','disabled') and retire_after<=clock_timestamp()) or (status='deleting' and deletion_lease_until<=clock_timestamp()))
    order by retire_after nulls last,created_at,id limit p_limit for update skip locked loop
    if private.media_has_references(asset.id) then continue;end if;
    claim_id:=coalesce(asset.deletion_claim_id,gen_random_uuid());
    update app.media_assets set status='deleting',deletion_claim_id=claim_id,deletion_lease_until=clock_timestamp()+interval '15 minutes' where id=asset.id;
    if asset.status='deleting' then insert into private.media_lifecycle_events(asset_id,event_type,claim_id) values(asset.id,'retried',claim_id);end if;
    result:=result||jsonb_build_array(jsonb_build_object('id',asset.id,'claimId',claim_id,'prefix','public/dynamic/'||asset.id::text||'/',
      'keys',coalesce((select jsonb_agg(object_key order by width) from app.media_renditions where asset_id=asset.id),'[]'::jsonb)));
  end loop;
  perform private.catalog_flush_constraints();return result;
end;
$$;
create function api.media_gc_recheck(p_asset_id uuid,p_claim_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare asset app.media_assets%rowtype;
begin
  select * into asset from app.media_assets where id=p_asset_id for update;
  if not found or p_claim_id is null or asset.status<>'deleting' or asset.deletion_claim_id is distinct from p_claim_id then return false;end if;
  if private.media_has_references(p_asset_id) then
    insert into private.media_lifecycle_events(asset_id,event_type,claim_id,code) values(p_asset_id,'blocked',p_claim_id,'references');return false;
  end if;
  update app.media_assets set deletion_lease_until=clock_timestamp()+interval '15 minutes' where id=p_asset_id;
  insert into private.media_lifecycle_events(asset_id,event_type,claim_id) values(p_asset_id,'rechecked',p_claim_id);
  return true;
end;
$$;
create function api.media_gc_failure(p_asset_id uuid,p_claim_id uuid,p_code text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if p_code is null or p_code not in('storage-list','storage-delete','confirmation','unavailable') then raise exception 'Invalid cleanup failure code.' using errcode='22023';end if;
  perform 1 from app.media_assets where id=p_asset_id and status='deleting' and deletion_claim_id=p_claim_id for update;
  if not found then raise exception 'The cleanup claim is no longer valid.' using errcode='PT409';end if;
  insert into private.media_lifecycle_events(asset_id,event_type,claim_id,code) values(p_asset_id,'failed',p_claim_id,p_code);
end;
$$;

grant create on schema private,api to aro_media_executor;
alter function private.media_library_asset_change() owner to aro_media_executor;
alter function private.media_usages(uuid[]) owner to aro_media_executor;
alter function private.media_library_record(uuid) owner to aro_media_executor;
alter function private.media_library_json(app.media_assets,app.media_library,bigint,jsonb) owner to aro_media_executor;
alter function private.media_default_section(text) owner to aro_media_executor;
alter function private.media_default_label(uuid,text) owner to aro_media_executor;
alter function private.site_media_projection() owner to aro_media_executor;
alter function api.admin_media_library(text,text,text,integer,integer) owner to aro_media_executor;
alter function api.admin_media_detail(uuid) owner to aro_media_executor;
alter function api.admin_media_metadata(uuid,text,text,text,bigint) owner to aro_media_executor;
alter function api.admin_media_retire(uuid,bigint) owner to aro_media_executor;
alter function api.site_media_document() owner to aro_media_executor;
alter function api.admin_site_media_document() owner to aro_media_executor;
alter function api.admin_save_site_media(text,uuid,text,bigint) owner to aro_media_executor;
alter function api.media_gc_recheck(uuid,uuid) owner to aro_media_executor;
alter function api.media_gc_failure(uuid,uuid,text) owner to aro_media_executor;
revoke create on schema private,api from aro_media_executor;
revoke all on function private.media_library_asset_change(),private.media_usages(uuid[]),private.media_library_record(uuid),
  private.media_library_json(app.media_assets,app.media_library,bigint,jsonb),private.media_default_section(text),
  private.media_default_label(uuid,text),private.site_media_projection(),private.media_placement_compatible(text,integer,integer,text),
  private.site_image_compatible(text,integer,integer,text),
  private.catalog_ready_image_for(text,text),api.admin_media_library(text,text,text,integer,integer),api.admin_media_detail(uuid),
  api.admin_media_metadata(uuid,text,text,text,bigint),api.admin_media_retire(uuid,bigint),api.site_media_document(),
  api.admin_site_media_document(),api.admin_save_site_media(text,uuid,text,bigint),api.media_gc_recheck(uuid,uuid),api.media_gc_failure(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function private.media_placement_compatible(text,integer,integer,text) to aro_media_executor,aro_catalog_admin_executor;
grant execute on function private.site_image_compatible(text,integer,integer,text) to aro_media_executor;
grant execute on function private.catalog_ready_image_for(text,text) to aro_catalog_admin_executor;
grant execute on function api.admin_media_library(text,text,text,integer,integer),api.admin_media_detail(uuid),
  api.admin_media_metadata(uuid,text,text,text,bigint),api.admin_media_retire(uuid,bigint),api.admin_site_media_document(),
  api.admin_save_site_media(text,uuid,text,bigint) to authenticated;
grant execute on function api.site_media_document() to anon,authenticated;
grant execute on function api.media_gc_recheck(uuid,uuid),api.media_gc_failure(uuid,uuid,text) to service_role;
comment on table app.media_library is 'Descriptive metadata only. Library visibility never protects unused bytes from the 24-hour collection window.';
comment on table app.site_media_slots is 'Fixed, versioned site placements. Cleared rows remain visible so clients can invalidate older imagery.';
comment on function api.media_gc_recheck(uuid,uuid) is 'Worker-only final reference check before R2 deletion. A terminal deletion claim is never revived or reused.';
notify pgrst,'reload schema';
