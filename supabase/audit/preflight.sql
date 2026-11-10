-- Aroma Infini: PRE-FLIGHT DE SOLO LECTURA, no es una migración.
-- Ejecutar solo en el proyecto dev previsto desde SQL Editor/cliente autorizado.
-- No contiene claves, no consulta filas de clientes/Auth ni modifica objetos.
-- Los resultados son inventario técnico, no prueba completa de autorización.

begin read only;
set local statement_timeout = '15s';

-- 1. Motor y visibilidad de schemas configurada en esta sesión.
-- pgrst.db_schemas puede ser NULL; comprobar también Dashboard/Data API.
select current_database() as database_name,
       current_setting('server_version') as postgres_version,
       current_setting('pgrst.db_schemas', true) as session_exposed_schemas;

select schema_name
from information_schema.schemata
where schema_name in ('public', 'api', 'app', 'private')
order by schema_name;

-- Privilegios de schemas (USAGE/CREATE), incluidos los de PUBLIC.
select n.nspname as schema_name,
       case when a.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type, a.is_grantable
from pg_namespace n
cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
where n.nspname in ('public', 'api', 'app', 'private')
order by n.nspname, grantee, a.privilege_type;

-- Atributos de roles y membresías, sin contraseñas ni usuarios de Auth.
select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolcanlogin, rolreplication, rolbypassrls
from pg_roles
order by rolname;

select pg_get_userbyid(roleid) as granted_role,
       pg_get_userbyid(member) as member_role,
       pg_get_userbyid(grantor) as grantor_role, admin_option
from pg_auth_members
order by granted_role, member_role;

-- 2. Tablas/vistas y estado RLS: no se leen sus registros.
select n.nspname as schema_name, c.relname as object_name,
       c.relkind, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       pg_get_userbyid(c.relowner) as owner,
       c.reloptions as view_options
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'api', 'app', 'private')
  and c.relkind in ('r', 'p', 'v', 'm')
order by n.nspname, c.relname;

select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema in ('public', 'api', 'app', 'private')
order by table_schema, table_name, ordinal_position;

-- 3. Grants de objetos, incluido PUBLIC. Sin asumir defaults del proyecto.
select n.nspname as schema_name, c.relname as object_name,
       case when a.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type, a.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
where n.nspname in ('public', 'api', 'app', 'private')
  and c.relkind in ('r', 'p', 'v', 'm')
order by n.nspname, c.relname, grantee, a.privilege_type;

select table_schema, table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema in ('public', 'api', 'app', 'private')
order by table_schema, table_name, column_name, grantee;

-- 4. Políticas: expresiones de autorización, sin datos de las tablas.
-- Revisar resultados en entorno privado si una política antigua contiene PII.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'api', 'app', 'private')
order by schemaname, tablename, policyname;

-- 5. Funciones: permisos y SECURITY DEFINER/search_path. No mostrar prosrc.
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as owner,
       array(select setting from unnest(p.proconfig) as setting
             where setting like 'search_path=%'
                or setting like 'row_security=%') as security_settings,
       case when a.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where n.nspname in ('public', 'api', 'app', 'private')
order by n.nspname, p.proname, arguments, grantee;

-- 6. Defaults, sin cambiarlos. Incluir defaults globales del rol propietario.
select pg_get_userbyid(d.defaclrole) as object_creator,
       coalesce(n.nspname, '(global)') as schema_name,
       d.defaclobjtype as object_type,
       case when a.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where d.defaclnamespace = 0
   or n.nspname in ('public', 'api', 'app', 'private')
order by object_creator, schema_name, object_type, grantee;

-- 7. Integridad e índices existentes: solo definiciones de objetos.
select n.nspname as schema_name, c.relname as table_name,
       con.conname, con.contype, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'api', 'app', 'private')
order by n.nspname, c.relname, con.conname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname in ('public', 'api', 'app', 'private')
order by schemaname, tablename, indexname;

-- Secuencias existentes y ACL: sin nextval/setval ni consumo de códigos.
select schemaname, sequencename, sequenceowner, data_type,
       start_value, min_value, max_value, increment_by, cycle, cache_size,
       last_value
from pg_sequences
where schemaname in ('public', 'api', 'app', 'private')
order by schemaname, sequencename;

select n.nspname as schema_name, c.relname as sequence_name,
       case when a.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
where n.nspname in ('public', 'api', 'app', 'private')
  and c.relkind = 'S'
order by n.nspname, c.relname, grantee;

select extname, extversion
from pg_extension
order by extname;

-- Triggers relevantes, incluido el alta de perfil y automatismos de RLS.
-- Solo nombres/función; no argumentos ni cuerpos que pudieran contener secretos.
select n.nspname as schema_name, c.relname as table_name,
       t.tgname as trigger_name, t.tgenabled,
       t.tgfoid::regprocedure as trigger_function
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and (n.nspname in ('public', 'api', 'app', 'private')
       or (n.nspname = 'auth' and c.relname = 'users'))
order by n.nspname, c.relname, t.tgname;

select evtname as event_trigger_name, evtevent, evtenabled,
       pg_get_userbyid(evtowner) as owner,
       evtfoid::regprocedure as event_trigger_function
from pg_event_trigger
order by evtname;

commit;
