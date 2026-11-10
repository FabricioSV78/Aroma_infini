-- The native 500-product profile found repeated parsing of verified JWT claims
-- dominating catalog RLS, plus two canonical documents per imported product.
-- Keep the same verified identity source, owners, grants, RLS and MFA checks;
-- do not cache authorization in user-controlled GUCs or beyond the statement.

create or replace function private.request_user_id()
returns uuid language plpgsql stable security invoker set search_path='' as $$
declare v_subject text;
begin
  v_subject:=nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'');
  if v_subject is null then
    v_subject:=nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'sub';
  end if;
  return v_subject::uuid;
end;
$$;

create or replace function private.request_assurance()
returns text language plpgsql stable security invoker set search_path='' as $$
begin
  return nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'aal';
end;
$$;

create or replace function private.current_user_membership()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=private.request_user_id();
begin
  if v_actor is null then return false; end if;
  return exists(select 1 from private.admin_memberships m where m.user_id=v_actor and m.active);
end;
$$;

create or replace function private.is_admin()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=private.request_user_id();
begin
  if v_actor is null or coalesce(private.request_assurance(),'')<>'aal2' then return false; end if;
  -- The executor's original self-read policy is still enforced on this table.
  return exists(select 1 from private.admin_memberships m where m.user_id=v_actor and m.active);
end;
$$;

do $$
declare v_body text; v_marker text;
begin
  select prosrc into strict v_body from pg_catalog.pg_proc
    where oid='private.catalog_save_product_prepared(jsonb,bigint,boolean)'::regprocedure;
  v_marker:='  return pg_catalog.jsonb_build_object(''record'', private.admin_product_document(v_id),';
  if pg_catalog.strpos(v_body,v_marker)=0
    or pg_catalog.strpos(v_body,'perform private.require_catalog_admin();')=0
    or pg_catalog.strpos(v_body,'perform private.catalog_validate_product(v_id);')=0 then
    raise exception 'Unexpected reviewed prepared writer; abort cost migration';
  end if;
  v_body:=pg_catalog.replace(v_body,v_marker,
    '  if p_import_prepared then'||chr(10)||
    '    return pg_catalog.jsonb_build_object(''record'',pg_catalog.jsonb_build_object(''product'',pg_catalog.jsonb_build_object(''id'',v_id)));'||chr(10)||
    '  end if;'||chr(10)||v_marker);
  execute pg_catalog.format(
    'create or replace function private.catalog_save_product_prepared(p_record jsonb,p_expected_version bigint,p_import_prepared boolean) returns jsonb language plpgsql volatile security invoker set search_path='''' as %L',v_body);
end $$;

-- Public import DTOs are still generated only after all constraints succeed.
-- CREATE OR REPLACE retains the reviewed function owners and privilege ACLs.
