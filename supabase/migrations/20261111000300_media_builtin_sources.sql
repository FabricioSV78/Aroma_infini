-- Immutable snapshot of the audited public resources. Their original bytes
-- remain the fallback until an authenticated import binds verified R2 assets.
create table app.media_builtin_aliases (
  path text primary key check(path ~ '^/(images|videos|brand)/[A-Za-z0-9_.-]+[.](webp|mp4|svg)$'),
  name text not null check(char_length(name) between 1 and 200),
  section text not null,
  kind text not null check(kind in('image','video','svg')),
  width integer not null, height integer not null,
  asset_id uuid references app.media_assets(id) on delete restrict,
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table app.media_builtin_aliases enable row level security;
alter table app.media_builtin_aliases force row level security;
revoke all on app.media_builtin_aliases from public,anon,authenticated,service_role;
grant select,update on app.media_builtin_aliases to aro_media_executor;
create policy media_builtin_executor on app.media_builtin_aliases to aro_media_executor using(true) with check(true);
create index media_builtin_asset on app.media_builtin_aliases(asset_id) where asset_id is not null;

insert into app.media_builtin_aliases(path,name,section,kind,width,height) values
('/brand/logo-on-light.svg','Logotipo Aroma Infini','Identidad','svg',774,374),
('/images/account-selection-v1-portrait-1024.webp','account-selection-v1-portrait-1024','Mi cuenta','image',1024,1536),
('/images/account-selection-v1-portrait-480.webp','account-selection-v1-portrait-480','Mi cuenta','image',480,720),
('/images/account-selection-v1-portrait-780.webp','account-selection-v1-portrait-780','Mi cuenta','image',780,1170),
('/images/account-selection-v1-wide-1536.webp','account-selection-v1-wide-1536','Mi cuenta','image',1536,512),
('/images/account-selection-v1-wide-960.webp','account-selection-v1-wide-960','Mi cuenta','image',960,320),
('/images/ambre-480.webp','ambre-480','Productos','image',480,600),
('/images/ambre-960.webp','ambre-960','Productos','image',960,1200),
('/images/ambre-alternate-480.webp','ambre-alternate-480','Productos','image',480,600),
('/images/ambre-alternate-960.webp','ambre-alternate-960','Productos','image',960,1200),
('/images/ambre-back-480.webp','ambre-back-480','Productos','image',480,600),
('/images/ambre-back-960.webp','ambre-back-960','Productos','image',960,1200),
('/images/ambre-detail-480.webp','ambre-detail-480','Productos','image',480,600),
('/images/ambre-detail-960.webp','ambre-detail-960','Productos','image',960,1200),
('/images/cedre-480.webp','cedre-480','Productos','image',480,600),
('/images/cedre-960.webp','cedre-960','Productos','image',960,1200),
('/images/cedre-alternate-480.webp','cedre-alternate-480','Productos','image',480,600),
('/images/cedre-alternate-960.webp','cedre-alternate-960','Productos','image',960,1200),
('/images/cedre-back-480.webp','cedre-back-480','Productos','image',480,600),
('/images/cedre-back-960.webp','cedre-back-960','Productos','image',960,1200),
('/images/cedre-detail-480.webp','cedre-detail-480','Productos','image',480,600),
('/images/cedre-detail-960.webp','cedre-detail-960','Productos','image',960,1200),
('/images/discovery-bois-1536.webp','discovery-bois-1536','Categorías','image',1536,2304),
('/images/discovery-bois-480.webp','discovery-bois-480','Categorías','image',480,720),
('/images/discovery-bois-960.webp','discovery-bois-960','Categorías','image',960,1440),
('/images/discovery-bois-category-1024.webp','discovery-bois-category-1024','Categorías','image',1024,1280),
('/images/discovery-bois-category-320.webp','discovery-bois-category-320','Categorías','image',320,400),
('/images/discovery-bois-category-480.webp','discovery-bois-category-480','Categorías','image',480,600),
('/images/discovery-bois-category-640.webp','discovery-bois-category-640','Categorías','image',640,800),
('/images/discovery-bois-category-800.webp','discovery-bois-category-800','Categorías','image',800,1000),
('/images/discovery-bois-category-960.webp','discovery-bois-category-960','Categorías','image',960,1200),
('/images/discovery-complements-v1-1122.webp','discovery-complements-v1-1122','Categorías','image',1122,1402),
('/images/discovery-complements-v1-480.webp','discovery-complements-v1-480','Categorías','image',480,600),
('/images/discovery-complements-v1-960.webp','discovery-complements-v1-960','Categorías','image',960,1200),
('/images/discovery-complements-v1-category-1120.webp','discovery-complements-v1-category-1120','Categorías','image',1120,1400),
('/images/discovery-complements-v1-category-320.webp','discovery-complements-v1-category-320','Categorías','image',320,400),
('/images/discovery-complements-v1-category-480.webp','discovery-complements-v1-category-480','Categorías','image',480,600),
('/images/discovery-complements-v1-category-640.webp','discovery-complements-v1-category-640','Categorías','image',640,800),
('/images/discovery-complements-v1-category-800.webp','discovery-complements-v1-category-800','Categorías','image',800,1000),
('/images/discovery-complements-v1-category-960.webp','discovery-complements-v1-category-960','Categorías','image',960,1200),
('/images/discovery-libre-1536.webp','discovery-libre-1536','Categorías','image',1536,1024),
('/images/discovery-libre-480.webp','discovery-libre-480','Categorías','image',480,320),
('/images/discovery-libre-960.webp','discovery-libre-960','Categorías','image',960,640),
('/images/discovery-libre-category-320.webp','discovery-libre-category-320','Categorías','image',320,400),
('/images/discovery-libre-category-480.webp','discovery-libre-category-480','Categorías','image',480,600),
('/images/discovery-libre-category-640.webp','discovery-libre-category-640','Categorías','image',640,800),
('/images/discovery-libre-category-800.webp','discovery-libre-category-800','Categorías','image',800,1000),
('/images/discovery-libre-category-816.webp','discovery-libre-category-816','Categorías','image',816,1020),
('/images/discovery-petale-1536.webp','discovery-petale-1536','Categorías','image',1536,1024),
('/images/discovery-petale-480.webp','discovery-petale-480','Categorías','image',480,320),
('/images/discovery-petale-960.webp','discovery-petale-960','Categorías','image',960,640),
('/images/discovery-petale-category-320.webp','discovery-petale-category-320','Categorías','image',320,400),
('/images/discovery-petale-category-480.webp','discovery-petale-category-480','Categorías','image',480,600),
('/images/discovery-petale-category-640.webp','discovery-petale-category-640','Categorías','image',640,800),
('/images/discovery-petale-category-800.webp','discovery-petale-category-800','Categorías','image',800,1000),
('/images/discovery-petale-category-816.webp','discovery-petale-category-816','Categorías','image',816,1020),
('/images/editorial-essential-v3-1536.webp','editorial-essential-v3-1536','Nosotros','image',1536,864),
('/images/editorial-essential-v3-480.webp','editorial-essential-v3-480','Nosotros','image',480,270),
('/images/editorial-essential-v3-960.webp','editorial-essential-v3-960','Nosotros','image',960,540),
('/images/editorial-essential-v3-mobile-480.webp','editorial-essential-v3-mobile-480','Nosotros','image',480,528),
('/images/editorial-essential-v3-mobile-780.webp','editorial-essential-v3-mobile-780','Nosotros','image',780,858),
('/images/featured-duo-v3-1536.webp','featured-duo-v3-1536','Compartir','image',1448,1086),
('/images/figue-480.webp','figue-480','Productos','image',480,600),
('/images/figue-960.webp','figue-960','Productos','image',960,1200),
('/images/figue-alternate-480.webp','figue-alternate-480','Productos','image',480,600),
('/images/figue-alternate-960.webp','figue-alternate-960','Productos','image',960,1200),
('/images/figue-back-480.webp','figue-back-480','Productos','image',480,600),
('/images/figue-back-960.webp','figue-back-960','Productos','image',960,1200),
('/images/figue-detail-480.webp','figue-detail-480','Productos','image',480,600),
('/images/figue-detail-960.webp','figue-detail-960','Productos','image',960,1200),
('/images/hero-v2-lumiere-desktop-1536.webp','hero-v2-lumiere-desktop-1536','Campañas','image',1536,864),
('/images/hero-v2-lumiere-desktop-2048.webp','hero-v2-lumiere-desktop-2048','Campañas','image',2048,1153),
('/images/hero-v2-lumiere-desktop-960.webp','hero-v2-lumiere-desktop-960','Campañas','image',960,540),
('/images/hero-v2-lumiere-mobile-1024.webp','hero-v2-lumiere-mobile-1024','Campañas','image',1024,1536),
('/images/hero-v2-lumiere-mobile-480.webp','hero-v2-lumiere-mobile-480','Campañas','image',480,720),
('/images/hero-v2-lumiere-mobile-780.webp','hero-v2-lumiere-mobile-780','Campañas','image',780,1170),
('/images/hero-v3-petale-desktop-1536.webp','hero-v3-petale-desktop-1536','Campañas','image',1536,864),
('/images/hero-v3-petale-desktop-2048.webp','hero-v3-petale-desktop-2048','Campañas','image',2048,1152),
('/images/hero-v3-petale-desktop-960.webp','hero-v3-petale-desktop-960','Campañas','image',960,540),
('/images/hero-v3-petale-mobile-1024.webp','hero-v3-petale-mobile-1024','Campañas','image',1024,1536),
('/images/hero-v3-petale-mobile-480.webp','hero-v3-petale-mobile-480','Campañas','image',480,720),
('/images/hero-v3-petale-mobile-780.webp','hero-v3-petale-mobile-780','Campañas','image',780,1170),
('/images/hero-v4-amber-desktop-1536.webp','hero-v4-amber-desktop-1536','Campañas','image',1536,864),
('/images/hero-v4-amber-desktop-2048.webp','hero-v4-amber-desktop-2048','Campañas','image',2048,1153),
('/images/hero-v4-amber-desktop-960.webp','hero-v4-amber-desktop-960','Campañas','image',960,540),
('/images/hero-v4-amber-mobile-1024.webp','hero-v4-amber-mobile-1024','Campañas','image',1024,1536),
('/images/hero-v4-amber-mobile-480.webp','hero-v4-amber-mobile-480','Campañas','image',480,720),
('/images/hero-v4-amber-mobile-780.webp','hero-v4-amber-mobile-780','Campañas','image',780,1170),
('/images/hero-v4-citrus-desktop-1536.webp','hero-v4-citrus-desktop-1536','Campañas','image',1536,864),
('/images/hero-v4-citrus-desktop-2048.webp','hero-v4-citrus-desktop-2048','Campañas','image',2048,1153),
('/images/hero-v4-citrus-desktop-960.webp','hero-v4-citrus-desktop-960','Campañas','image',960,540),
('/images/hero-v4-citrus-mobile-1024.webp','hero-v4-citrus-mobile-1024','Campañas','image',1024,1536),
('/images/hero-v4-citrus-mobile-480.webp','hero-v4-citrus-mobile-480','Campañas','image',480,720),
('/images/hero-v4-citrus-mobile-780.webp','hero-v4-citrus-mobile-780','Campañas','image',780,1170),
('/images/hero-v5-silence-desktop-1536.webp','hero-v5-silence-desktop-1536','Campañas','image',1536,864),
('/images/hero-v5-silence-desktop-2048.webp','hero-v5-silence-desktop-2048','Campañas','image',2048,1152),
('/images/hero-v5-silence-desktop-960.webp','hero-v5-silence-desktop-960','Campañas','image',960,540),
('/images/hero-v5-silence-mobile-1024.webp','hero-v5-silence-mobile-1024','Campañas','image',1024,1536),
('/images/hero-v5-silence-mobile-480.webp','hero-v5-silence-mobile-480','Campañas','image',480,720),
('/images/hero-v5-silence-mobile-780.webp','hero-v5-silence-mobile-780','Campañas','image',780,1170),
('/images/iris-480.webp','iris-480','Productos','image',480,600),
('/images/iris-960.webp','iris-960','Productos','image',960,1200),
('/images/iris-alternate-480.webp','iris-alternate-480','Productos','image',480,600),
('/images/iris-alternate-960.webp','iris-alternate-960','Productos','image',960,1200),
('/images/iris-back-480.webp','iris-back-480','Productos','image',480,600),
('/images/iris-back-960.webp','iris-back-960','Productos','image',960,1200),
('/images/iris-detail-480.webp','iris-detail-480','Productos','image',480,600),
('/images/iris-detail-960.webp','iris-detail-960','Productos','image',960,1200),
('/images/neroli-480.webp','neroli-480','Productos','image',480,600),
('/images/neroli-960.webp','neroli-960','Productos','image',960,1200),
('/images/neroli-alternate-480.webp','neroli-alternate-480','Productos','image',480,600),
('/images/neroli-alternate-960.webp','neroli-alternate-960','Productos','image',960,1200),
('/images/neroli-back-480.webp','neroli-back-480','Productos','image',480,600),
('/images/neroli-back-960.webp','neroli-back-960','Productos','image',960,1200),
('/images/neroli-detail-480.webp','neroli-detail-480','Productos','image',480,600),
('/images/neroli-detail-960.webp','neroli-detail-960','Productos','image',960,1200),
('/images/olfactory-ambre-thumb-160.webp','olfactory-ambre-thumb-160','Perfil olfativo y recomendador','image',160,200),
('/images/olfactory-ambre-thumb-320.webp','olfactory-ambre-thumb-320','Perfil olfativo y recomendador','image',320,400),
('/images/olfactory-ambre.webp','olfactory-ambre','Perfil olfativo y recomendador','image',960,1200),
('/images/olfactory-cedre-thumb-160.webp','olfactory-cedre-thumb-160','Perfil olfativo y recomendador','image',160,200),
('/images/olfactory-cedre-thumb-320.webp','olfactory-cedre-thumb-320','Perfil olfativo y recomendador','image',320,400),
('/images/olfactory-cedre.webp','olfactory-cedre','Perfil olfativo y recomendador','image',960,1200),
('/images/olfactory-figue.webp','olfactory-figue','Perfil olfativo y recomendador','image',960,1200),
('/images/olfactory-iris.webp','olfactory-iris','Perfil olfativo y recomendador','image',960,1200),
('/images/olfactory-neroli-thumb-160.webp','olfactory-neroli-thumb-160','Perfil olfativo y recomendador','image',160,200),
('/images/olfactory-neroli-thumb-320.webp','olfactory-neroli-thumb-320','Perfil olfativo y recomendador','image',320,400),
('/images/olfactory-neroli.webp','olfactory-neroli','Perfil olfativo y recomendador','image',960,1200),
('/images/olfactory-petale-thumb-160.webp','olfactory-petale-thumb-160','Perfil olfativo y recomendador','image',160,200),
('/images/olfactory-petale-thumb-320.webp','olfactory-petale-thumb-320','Perfil olfativo y recomendador','image',320,400),
('/images/olfactory-petale.webp','olfactory-petale','Perfil olfativo y recomendador','image',960,1200),
('/images/olfactory-santal.webp','olfactory-santal','Perfil olfativo y recomendador','image',960,1200),
('/images/olfactory-sillage-thumb-160.webp','olfactory-sillage-thumb-160','Perfil olfativo y recomendador','image',160,200),
('/images/olfactory-sillage-thumb-320.webp','olfactory-sillage-thumb-320','Perfil olfativo y recomendador','image',320,400),
('/images/olfactory-sillage.webp','olfactory-sillage','Perfil olfativo y recomendador','image',960,1200),
('/images/petale-480.webp','petale-480','Productos','image',480,600),
('/images/petale-960.webp','petale-960','Productos','image',960,1200),
('/images/petale-alternate-480.webp','petale-alternate-480','Productos','image',480,600),
('/images/petale-alternate-960.webp','petale-alternate-960','Productos','image',960,1200),
('/images/petale-back-480.webp','petale-back-480','Productos','image',480,600),
('/images/petale-back-960.webp','petale-back-960','Productos','image',960,1200),
('/images/petale-detail-480.webp','petale-detail-480','Productos','image',480,600),
('/images/petale-detail-960.webp','petale-detail-960','Productos','image',960,1200),
('/images/santal-480.webp','santal-480','Productos','image',480,600),
('/images/santal-960.webp','santal-960','Productos','image',960,1200),
('/images/santal-alternate-480.webp','santal-alternate-480','Productos','image',480,600),
('/images/santal-alternate-960.webp','santal-alternate-960','Productos','image',960,1200),
('/images/santal-back-480.webp','santal-back-480','Productos','image',480,600),
('/images/santal-back-960.webp','santal-back-960','Productos','image',960,1200),
('/images/santal-detail-480.webp','santal-detail-480','Productos','image',480,600),
('/images/santal-detail-960.webp','santal-detail-960','Productos','image',960,1200),
('/images/sillage-480.webp','sillage-480','Productos','image',480,600),
('/images/sillage-960.webp','sillage-960','Productos','image',960,1200),
('/images/sillage-alternate-480.webp','sillage-alternate-480','Productos','image',480,600),
('/images/sillage-alternate-960.webp','sillage-alternate-960','Productos','image',960,1200),
('/images/sillage-back-480.webp','sillage-back-480','Productos','image',480,600),
('/images/sillage-back-960.webp','sillage-back-960','Productos','image',960,1200),
('/images/sillage-detail-480.webp','sillage-detail-480','Productos','image',480,600),
('/images/sillage-detail-960.webp','sillage-detail-960','Productos','image',960,1200),
('/videos/perfume-editorial-mobile.mp4','perfume-editorial-mobile','Video editorial','video',720,900),
('/videos/perfume-editorial-mobile.webp','perfume-editorial-mobile · portada','Video editorial','image',720,900),
('/videos/perfume-editorial-wide.mp4','perfume-editorial-wide','Video editorial','video',1920,926),
('/videos/perfume-editorial-wide.webp','perfume-editorial-wide · portada','Video editorial','image',1920,926);


create or replace function private.media_has_references(p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from app.product_images where media_id=p_id)
    or exists(select 1 from app.products where olfactory_media_id=p_id)
    or exists(select 1 from app.home_media where media_id=p_id)
    or exists(select 1 from app.order_items where media_id=p_id)
    or exists(select 1 from app.site_media_slots where asset_id=p_id)
    or exists(select 1 from app.media_builtin_aliases where asset_id=p_id);
$$;
do $$ declare definition text; begin
  definition:=pg_get_functiondef('private.media_reference_retention()'::regprocedure);
  if strpos(definition,'tg_table_name=''site_media_slots''')=0 then raise exception 'Unexpected media retention branch';end if;
  execute replace(definition,'tg_table_name=''site_media_slots''','tg_table_name in(''site_media_slots'',''media_builtin_aliases'')');
end $$;
create trigger media_builtin_retention after insert or update or delete on app.media_builtin_aliases
  for each row execute function private.media_reference_retention();

create or replace function private.media_usages(p_ids uuid[] default null)
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
    from app.site_media_slots s where s.asset_id is not null and (p_ids is null or s.asset_id=any(p_ids))
  union all select a.asset_id,case a.section when 'Productos' then 'products' when 'Mi cuenta' then 'account'
      when 'Identidad' then 'identity' when 'Nosotros' then 'about' when 'Compartir' then 'seo' else 'home' end,a.name,'builtin:'||a.path
    from app.media_builtin_aliases a where a.asset_id is not null and (p_ids is null or a.asset_id=any(p_ids));
$$;

create function api.public_media_aliases()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('path',a.path,'asset',private.media_document(m.id)) order by a.path),'[]'::jsonb))
  from app.media_builtin_aliases a join app.media_assets m on m.id=a.asset_id where m.status='ready' and m.storage_kind='r2';
$$;
create function api.admin_media_aliases()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  return (select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('path',a.path,'name',a.name,'section',a.section,
    'kind',a.kind,'width',a.width,'height',a.height,'version',a.version,'assetId',a.asset_id,
    'asset',case when m.status='ready' then private.media_document(m.id) else null end) order by a.path),'[]'::jsonb))
    from app.media_builtin_aliases a left join app.media_assets m on m.id=a.asset_id);
end $$;
create function api.admin_save_media_alias(p_path text,p_asset_id uuid,p_expected_version bigint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare source app.media_builtin_aliases%rowtype;asset app.media_assets%rowtype;locked_id uuid;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  select * into source from app.media_builtin_aliases where path=p_path for update;
  if not found then raise exception 'El recurso no pertenece al inventario revisado.' using errcode='22023';end if;
  if source.version is distinct from p_expected_version then raise exception 'El recurso cambió en otra sesión.' using errcode='PT409';end if;
  for locked_id in select distinct id from unnest(array[source.asset_id,p_asset_id]) id where id is not null order by id loop
    perform 1 from app.media_assets where id=locked_id for update;
  end loop;
  select * into asset from app.media_assets where id=p_asset_id;
  if not found or asset.status<>'ready' or asset.storage_kind<>'r2'
    or asset.width<>source.width or asset.height<>source.height
    or asset.mime_type is distinct from (case source.kind when 'image' then 'image/webp' when 'video' then 'video/mp4' else 'image/svg+xml' end) then
    raise exception 'El archivo no conserva el formato y las dimensiones del original.' using errcode='22023';end if;
  update app.media_builtin_aliases set asset_id=p_asset_id,version=version+1,updated_at=clock_timestamp(),updated_by=private.request_user_id() where path=p_path;
  return jsonb_build_object('path',p_path,'version',source.version+1,'asset',private.media_document(p_asset_id));
end $$;
grant create on schema api to aro_media_executor;
alter function api.public_media_aliases() owner to aro_media_executor;
alter function api.admin_media_aliases() owner to aro_media_executor;
alter function api.admin_save_media_alias(text,uuid,bigint) owner to aro_media_executor;
revoke create on schema api from aro_media_executor;
revoke all on function api.public_media_aliases(),api.admin_media_aliases(),api.admin_save_media_alias(text,uuid,bigint)
  from public,anon,authenticated,service_role;
grant execute on function api.public_media_aliases() to anon,authenticated,service_role;
grant execute on function api.admin_media_aliases(),api.admin_save_media_alias(text,uuid,bigint) to authenticated;
