-- Private complaint book. Public writes cross only the rate-limited Worker.
create role aro_complaints_executor nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
grant aro_complaints_executor to postgres;
grant usage on schema app,api,private to aro_complaints_executor;
grant execute on function private.is_admin(),private.request_user_id(),private.home_object(jsonb,text[],text[]),private.commerce_hash(text),private.commerce_integer(jsonb,bigint,bigint) to aro_complaints_executor;
grant select on app.site_settings to aro_complaints_executor;
create policy complaint_provider_snapshot on app.site_settings for select to aro_complaints_executor using(true);

create sequence app.complaint_reference_seq start 1;
create table app.complaints (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  receipt_hash text not null check(receipt_hash ~ '^[a-f0-9]{64}$'),
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  reference text not null unique,
  submitted_at timestamptz not null default now(),
  input jsonb not null,
  provider jsonb not null,
  demonstration boolean not null,
  status text not null default 'received' check(status in('received','reviewing','responded')),
  response text not null default '' check(char_length(response)<=10000),
  response_channel text not null default '' check(response_channel in('','letter','email-manual')),
  response_delivered_at timestamptz,
  delivery_evidence text not null default '' check(char_length(delivery_evidence)<=1000),
  version bigint not null default 1 check(version>0)
);
create index complaints_status_date on app.complaints(status,submitted_at desc,id);
create table private.complaint_history (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references app.complaints(id) on delete restrict,
  changed_at timestamptz not null default now(),
  previous_status text,
  next_status text not null,
  actor_id uuid references auth.users(id) on delete set null
);
create index complaint_history_owner on private.complaint_history(complaint_id,id);
create table private.complaint_limits (
  identifier text primary key check(identifier ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  attempts integer not null check(attempts between 1 and 5)
);
create index complaint_limit_window on private.complaint_limits(window_start);
alter table app.complaints enable row level security;
alter table app.complaints force row level security;
alter table private.complaint_history enable row level security;
alter table private.complaint_history force row level security;
alter table private.complaint_limits enable row level security;
alter table private.complaint_limits force row level security;
revoke all on app.complaints,private.complaint_history,private.complaint_limits from public,anon,authenticated,service_role;
revoke all on sequence app.complaint_reference_seq,private.complaint_history_id_seq from public,anon,authenticated,service_role;
grant select,insert,update on app.complaints to aro_complaints_executor;
grant select,insert on private.complaint_history to aro_complaints_executor;
grant select,insert,update,delete on private.complaint_limits to aro_complaints_executor;
grant usage,select on sequence app.complaint_reference_seq,private.complaint_history_id_seq to aro_complaints_executor;
create policy complaint_executor on app.complaints to aro_complaints_executor using(true) with check(true);
create policy complaint_history_executor on private.complaint_history to aro_complaints_executor using(true) with check(true);
create policy complaint_limit_executor on private.complaint_limits to aro_complaints_executor using(true) with check(true);

create function private.complaint_text(p_value jsonb,p_max int,p_empty boolean default false) returns text language plpgsql immutable set search_path='' as $$
declare v text;
begin
  if jsonb_typeof(p_value) is distinct from 'string' then raise exception 'Revisa los campos del formulario.' using errcode='22023';end if;
  v:=p_value#>>'{}';
  if char_length(v)>p_max or (not p_empty and btrim(v)='') or translate(v,E'\r\n\t','')~'[[:cntrl:]]' then raise exception 'Revisa los campos del formulario.' using errcode='22023';end if;
  return v;
end $$;
create function private.validate_complaint(p_input jsonb) returns void language plpgsql immutable set search_path='' as $$
declare c jsonb;p jsonb;
begin
  perform private.home_object(p_input,array['kind','consumer','purchase','detail','request'],array['kind','consumer','purchase','detail','request']);
  if octet_length(p_input::text)>28000 or coalesce(p_input->>'kind','') not in('claim','complaint') then raise exception 'Revisa el tipo de solicitud.' using errcode='22023';end if;
  c:=p_input->'consumer';p:=p_input->'purchase';
  perform private.home_object(c,array['name','documentType','documentNumber','email','phone','address','minor','guardianName','guardianDocument'],array['name','documentType','documentNumber','email','phone','address','minor','guardianName','guardianDocument']);
  perform private.home_object(p,array['kind','description','amountCents','orderReference'],array['kind','description','amountCents','orderReference']);
  perform private.complaint_text(c->'name',240);perform private.complaint_text(c->'documentNumber',30);
  perform private.complaint_text(c->'email',254);perform private.complaint_text(c->'phone',30);perform private.complaint_text(c->'address',500);
  if coalesce(c->>'documentType','') not in('DNI','CE','PASSPORT') or (c->>'documentType'='DNI' and c->>'documentNumber'!~'^[0-9]{8}$')
    or c->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or c->>'phone'!~'^[+()0-9[:space:]-]{7,30}$' or jsonb_typeof(c->'minor')<>'boolean' then raise exception 'Revisa tus datos de contacto.' using errcode='22023';end if;
  perform private.complaint_text(c->'guardianName',240,not(c->>'minor')::boolean);perform private.complaint_text(c->'guardianDocument',60,not(c->>'minor')::boolean);
  if coalesce(p->>'kind','') not in('product','service') then raise exception 'Revisa el bien o servicio.' using errcode='22023';end if;
  perform private.complaint_text(p->'description',2000);perform private.commerce_integer(p->'amountCents',100000000);perform private.complaint_text(p->'orderReference',80,true);
  perform private.complaint_text(p_input->'detail',6000);perform private.complaint_text(p_input->'request',4000);
end $$;
create function private.complaint_document(p_id uuid,p_history boolean default false) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',c.id,'reference',c.reference,'submittedAt',to_char(c.submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'input',c.input,'provider',c.provider,'demonstration',c.demonstration,'status',c.status,'response',c.response,'responseChannel',c.response_channel,
    'responseDeliveredAt',case when c.response_delivered_at is null then null else to_char(c.response_delivered_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'deliveryEvidence',c.delivery_evidence,'version',c.version,'history',case when p_history then coalesce((select jsonb_agg(jsonb_build_object('at',to_char(h.changed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'previous',h.previous_status,'next',h.next_status,'actorId',h.actor_id) order by h.id) from private.complaint_history h where h.complaint_id=c.id),'[]'::jsonb) else '[]'::jsonb end)
  from app.complaints c where c.id=p_id;
$$;
create function api.create_complaint(p_operation_id uuid,p_receipt_secret text,p_input jsonb,p_client_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app.complaints%rowtype;v_provider jsonb;v_demo boolean;v_attempts int;v_window timestamptz:=date_trunc('hour',now());v_input_hash text;v_receipt_hash text;v_number text;
begin
  if p_operation_id is null or p_receipt_secret is null or p_receipt_secret!~'^[a-f0-9]{64}$' or p_client_hash is null or p_client_hash!~'^[a-f0-9]{64}$' then raise exception 'Revisa el formulario.' using errcode='22023';end if;
  perform private.validate_complaint(p_input);
  v_input_hash:=private.commerce_hash(p_input::text);v_receipt_hash:=private.commerce_hash(p_receipt_secret);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,782154));
  select * into c from app.complaints where operation_id=p_operation_id;
  if found then
    if c.receipt_hash<>v_receipt_hash or c.input_hash<>v_input_hash then raise exception 'Esta solicitud tiene otros datos. Conserva el formulario y revisa el registro.' using errcode='PT409';end if;
    return private.complaint_document(c.id,false);
  end if;
  perform pg_advisory_xact_lock(714482415);
  delete from private.complaint_limits where window_start<now()-interval '24 hours';
  if (select count(*) from private.complaint_limits)>50000 and not exists(select 1 from private.complaint_limits where identifier=p_client_hash) then raise exception 'Intenta más tarde.' using errcode='PT429';end if;
  select attempts into v_attempts from private.complaint_limits where identifier=p_client_hash and window_start=v_window;
  if coalesce(v_attempts,0)>=5 then raise exception 'Espera antes de registrar otra solicitud.' using errcode='PT429';end if;
  insert into private.complaint_limits(identifier,window_start,attempts) values(p_client_hash,v_window,1)
    on conflict(identifier) do update set window_start=v_window,attempts=case when private.complaint_limits.window_start=v_window then private.complaint_limits.attempts+1 else 1 end;
  select data->'business',coalesce((data->>'demonstration')::boolean,true) into v_provider,v_demo from app.site_settings where singleton;
  if v_provider is null then v_provider:='{"name":"Aroma Infini","legalName":"Aroma Infini — datos de demostración","taxId":"","address":"Dirección de demostración, Lima, Perú"}'::jsonb;v_demo:=true;end if;
  v_number:=nextval('app.complaint_reference_seq')::text;
  insert into app.complaints(operation_id,receipt_hash,input_hash,reference,input,provider,demonstration)
    values(p_operation_id,v_receipt_hash,v_input_hash,'LR-'||to_char(now() at time zone 'America/Lima','YYYY')||'-'||lpad(v_number,greatest(6,char_length(v_number)),'0'),p_input,v_provider,v_demo) returning * into c;
  insert into private.complaint_history(complaint_id,next_status) values(c.id,'received');
  return private.complaint_document(c.id,false);
end $$;
create function api.admin_complaints(p_page integer default 1,p_limit integer default 20,p_status text default '',p_search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Requiere administración y MFA.' using errcode='42501';end if;
  if p_page is null or p_page not between 1 and 100000 or p_limit is null or p_limit not between 1 and 100 or p_status is null or p_status not in('','received','reviewing','responded') or p_search is null or char_length(p_search)>100 then raise exception 'Revisa los filtros.' using errcode='22023';end if;
  return jsonb_build_object('page',p_page,'total',(select count(*) from app.complaints c where (p_status='' or c.status=p_status) and (p_search='' or c.reference ilike '%'||p_search||'%' or c.input#>>'{consumer,name}' ilike '%'||p_search||'%')),
    'items',coalesce((select jsonb_agg(private.complaint_document(x.id,true) order by x.submitted_at desc,x.id) from (select c.id,c.submitted_at from app.complaints c where (p_status='' or c.status=p_status) and (p_search='' or c.reference ilike '%'||p_search||'%' or c.input#>>'{consumer,name}' ilike '%'||p_search||'%') order by c.submitted_at desc,c.id limit p_limit offset (p_page-1)*p_limit)x),'[]'::jsonb));
end $$;
create function api.admin_update_complaint(p_id uuid,p_expected_version bigint,p_status text,p_response text default '',p_response_channel text default '',p_delivered_at timestamptz default null,p_delivery_evidence text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app.complaints%rowtype;v_user uuid:=private.request_user_id();
begin
  if not private.is_admin() then raise exception 'Requiere administración y MFA.' using errcode='42501';end if;
  if p_id is null or p_expected_version is null or p_status is null or p_status not in('received','reviewing','responded') or p_response is null or char_length(p_response)>10000 or p_response_channel is null or p_response_channel not in('','letter','email-manual') or p_delivery_evidence is null or char_length(p_delivery_evidence)>1000 then raise exception 'Revisa la respuesta.' using errcode='22023';end if;
  if p_status='responded' and (btrim(p_response)='' or p_response_channel='' or p_delivered_at is null or p_delivered_at>now() or btrim(p_delivery_evidence)='') then raise exception 'Registra la respuesta escrita y la constancia de entrega antes de marcar Respondido.' using errcode='22023';end if;
  select * into c from app.complaints where id=p_id for update;
  if not found then raise exception 'No encontramos la solicitud.' using errcode='P0002';end if;
  if c.version<>p_expected_version then raise exception 'Esta solicitud cambió en otra sesión. Vuelve a cargarla.' using errcode='PT409';end if;
  if p_status='responded' and p_delivered_at<c.submitted_at then raise exception 'La entrega no puede ser anterior a la solicitud.' using errcode='22023';end if;
  if c.status='responded' and (p_status<>'responded' or c.response<>p_response or c.response_channel<>p_response_channel or c.response_delivered_at is distinct from p_delivered_at or c.delivery_evidence<>p_delivery_evidence) then raise exception 'La respuesta entregada permanece en el registro.' using errcode='22023';end if;
  if c.status=p_status and c.response=p_response and c.response_channel=p_response_channel and c.response_delivered_at is not distinct from p_delivered_at and c.delivery_evidence=p_delivery_evidence then return private.complaint_document(c.id,true);end if;
  update app.complaints set status=p_status,response=p_response,response_channel=p_response_channel,response_delivered_at=p_delivered_at,delivery_evidence=p_delivery_evidence,version=version+1 where id=c.id;
  insert into private.complaint_history(complaint_id,previous_status,next_status,actor_id) values(c.id,c.status,p_status,v_user);
  return private.complaint_document(c.id,true);
end $$;
grant create on schema private,api to aro_complaints_executor;
alter function private.complaint_text(jsonb,int,boolean) owner to aro_complaints_executor;
alter function private.validate_complaint(jsonb) owner to aro_complaints_executor;
alter function private.complaint_document(uuid,boolean) owner to aro_complaints_executor;
alter function api.create_complaint(uuid,text,jsonb,text) owner to aro_complaints_executor;
alter function api.admin_complaints(integer,integer,text,text) owner to aro_complaints_executor;
alter function api.admin_update_complaint(uuid,bigint,text,text,text,timestamptz,text) owner to aro_complaints_executor;
revoke create on schema private,api from aro_complaints_executor;
revoke all on function private.complaint_text(jsonb,int,boolean),private.validate_complaint(jsonb),private.complaint_document(uuid,boolean),api.create_complaint(uuid,text,jsonb,text),api.admin_complaints(integer,integer,text,text),api.admin_update_complaint(uuid,bigint,text,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function api.create_complaint(uuid,text,jsonb,text) to service_role;
grant execute on function api.admin_complaints(integer,integer,text,text),api.admin_update_complaint(uuid,bigint,text,text,text,timestamptz,text) to authenticated;
