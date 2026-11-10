-- One versioned public business document; no customer or privileged information.
create table app.site_settings (
  singleton boolean primary key default true check(singleton),
  data jsonb not null,
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table app.site_settings enable row level security;
alter table app.site_settings force row level security;
revoke all on app.site_settings from public,anon,authenticated,service_role;
grant select on app.site_settings to aro_api_executor,aro_catalog_admin_executor;
grant insert,update on app.site_settings to aro_catalog_admin_executor;
create policy site_public_projection on app.site_settings for select to aro_api_executor using(true);
create policy site_admin_projection on app.site_settings to aro_catalog_admin_executor using(true) with check(true);

create function private.validate_site_settings(p_data jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare v_group text;v_key text;v_value text;v_social text;v_max int;
begin
  perform private.home_object(p_data,array['demonstration','business','contact','social','policies'],array['demonstration','business','contact','social','policies']);
  if jsonb_typeof(p_data->'demonstration')<>'boolean' or octet_length(p_data::text)>50000 then
    raise exception 'Revisa la configuración de la tienda.' using errcode='22023';end if;
  perform private.home_object(p_data->'business',array['name','legalName','taxId','address'],array['name','legalName','taxId','address']);
  perform private.home_object(p_data->'contact',array['whatsapp','email','hours'],array['whatsapp','email','hours']);
  perform private.home_object(p_data->'social',array['instagram','facebook','tiktok'],array['instagram','facebook','tiktok']);
  perform private.home_object(p_data->'policies',array['privacy','terms','returns'],array['privacy','terms','returns']);
  foreach v_group in array array['business','contact','social','policies'] loop
    for v_key,v_value in select key,value #>> '{}' from jsonb_each(p_data->v_group) loop
      v_max:=case when v_group='policies' then 12000 when v_key='name' then 160 when v_key in('legalName','hours') then 240 when v_key='taxId' then 11 when v_key='whatsapp' then 15 when v_key='email' then 254 else 500 end;
      if jsonb_typeof(p_data->v_group->v_key)<>'string' or char_length(v_value)>v_max
        or translate(v_value,E'\r\n\t','') ~ '[[:cntrl:]]' then
        raise exception 'Revisa los campos de configuración.' using errcode='22023';end if;
      if (v_group='policies' or (v_group='business' and v_key<>'taxId')) and btrim(v_value)='' then
        raise exception 'Completa los datos de la tienda y sus políticas.' using errcode='22023';end if;
    end loop;
  end loop;
  if (p_data#>>'{business,taxId}')<>'' and (p_data#>>'{business,taxId}')!~'^[0-9]{11}$' then
    raise exception 'El RUC debe tener once dígitos.' using errcode='22023';end if;
  if (p_data#>>'{contact,whatsapp}')<>'' and (p_data#>>'{contact,whatsapp}')!~'^[1-9][0-9]{7,14}$' then
    raise exception 'Revisa el número de WhatsApp.' using errcode='22023';end if;
  if (p_data#>>'{contact,email}')<>'' and (p_data#>>'{contact,email}')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Revisa el correo de atención.' using errcode='22023';end if;
  foreach v_social in array array['instagram','facebook','tiktok'] loop
    v_value:=p_data#>>array['social',v_social];
    if v_value<>'' and (v_value !~ ('^https://(www\.)?'||case v_social when 'instagram' then 'instagram\.com' when 'facebook' then '(facebook\.com|fb\.com)' else 'tiktok\.com' end||'/[^[:space:]#]*$')) then
      raise exception 'Usa la URL HTTPS del perfil oficial.' using errcode='22023';end if;
  end loop;
  if not (p_data->>'demonstration')::boolean and (
    (p_data#>>'{business,taxId}')='' or (p_data#>>'{contact,email}')='' or (p_data#>>'{contact,email}')~*'\.example$') then
    raise exception 'Completa los datos reales antes de quitar el modo demostración.' using errcode='22023';end if;
end;
$$;
create function api.site_settings() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((select jsonb_build_object('version',version,'data',data) from app.site_settings where singleton),jsonb_build_object('version',0,'data',null));
$$;
create function api.admin_save_site_settings(p_data jsonb,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_version bigint;
begin
  perform private.require_catalog_admin();
  perform private.validate_site_settings(p_data);
  perform pg_advisory_xact_lock(714482399);
  select version into v_version from app.site_settings where singleton for update;
  if p_expected_version is null or p_expected_version<>coalesce(v_version,0) then
    raise exception 'La configuración cambió en otra sesión. Vuelve a cargarla.' using errcode='PT409';end if;
  insert into app.site_settings(singleton,data,version,updated_by) values(true,p_data,1,private.request_user_id())
    on conflict(singleton) do update set data=excluded.data,version=app.site_settings.version+1,updated_at=now(),updated_by=excluded.updated_by;
  return (select jsonb_build_object('version',version,'data',data) from app.site_settings where singleton);
end;
$$;
grant create on schema private,api to aro_catalog_admin_executor;
grant create on schema api to aro_api_executor;
alter function private.validate_site_settings(jsonb) owner to aro_catalog_admin_executor;
alter function api.admin_save_site_settings(jsonb,bigint) owner to aro_catalog_admin_executor;
alter function api.site_settings() owner to aro_api_executor;
revoke create on schema private,api from aro_catalog_admin_executor;
revoke create on schema api from aro_api_executor;
grant execute on function private.home_object(jsonb,text[],text[]),private.request_user_id() to aro_catalog_admin_executor;
revoke all on function private.validate_site_settings(jsonb),api.site_settings(),api.admin_save_site_settings(jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function api.site_settings() to anon,authenticated;
grant execute on function api.admin_save_site_settings(jsonb,bigint) to authenticated;
