-- Account favorites only. Guests continue using their independent browser list.
-- No account id is accepted from the client, and no public table CRUD is exposed.
create role aro_favorites_executor nologin nosuperuser nocreatedb nocreaterole
  noinherit nobypassrls;
grant aro_favorites_executor to postgres;
grant usage on schema api, app, private to aro_favorites_executor;
grant execute on function private.request_user_id() to aro_favorites_executor;
-- Hosted Supabase's migration operator is not a superuser. PostgreSQL requires
-- the destination owner to have CREATE on a function's schema during transfer.
-- These narrowly scoped grants are revoked before this migration commits.
grant create on schema private to aro_api_executor, aro_favorites_executor;
grant create on schema api to aro_favorites_executor;

create table app.favorite_lists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default pg_catalog.now()
);
create table app.customer_favorites (
  user_id uuid not null references app.favorite_lists(user_id) on delete cascade,
  product_id uuid not null references app.products(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, product_id)
);
create index customer_favorites_product_idx on app.customer_favorites(product_id);
comment on table app.favorite_lists is
  'Per-account optimistic version and row lock. An empty list starts at version zero; guest browser favorites are never imported implicitly.';
comment on table app.customer_favorites is
  'Saved product identities, including subsequently hidden/unavailable products. Product or Auth deletion cascades, without a product snapshot or personal customer data.';

alter table app.favorite_lists enable row level security;
alter table app.customer_favorites enable row level security;
revoke all on app.favorite_lists, app.customer_favorites
  from public, anon, authenticated, service_role;
grant select, insert, update on app.favorite_lists to aro_favorites_executor;
grant select, insert, delete on app.customer_favorites to aro_favorites_executor;
-- This NOLOGIN executor is reachable only through the fixed-owner RPCs below.
-- Internal policies also let a product-deletion cascade update the original
-- owner's version, even when the deletion is performed by an administrator.
create policy favorite_lists_executor on app.favorite_lists
  to aro_favorites_executor using (true) with check (true);
create policy customer_favorites_executor on app.customer_favorites
  to aro_favorites_executor using (true) with check (true);

-- Reuse the exact catalog publication predicate and its existing RLS policy.
-- Do not grant the favorites executor arbitrary catalog access or duplicate
-- active/stock/brand/media/Complementos rules in this module.
create function private.favorite_product_is_published(p_product_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.products p where p.id = p_product_id
    and private.catalog_product_is_published(p));
$$;
alter function private.favorite_product_is_published(uuid) owner to aro_api_executor;
revoke all on function private.favorite_product_is_published(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.favorite_product_is_published(uuid)
  to aro_favorites_executor;

-- Version changes are attached to row changes, including product FK cascades.
-- The list row is the common serialization lock for every account mutation.
create function private.bump_favorite_list_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update app.favorite_lists set version = version + 1,
    updated_at = pg_catalog.clock_timestamp()
    where user_id = case when TG_OP = 'DELETE' then OLD.user_id else NEW.user_id end;
  return null;
end;
$$;
alter function private.bump_favorite_list_version() owner to aro_favorites_executor;
revoke all on function private.bump_favorite_list_version()
  from public, anon, authenticated, service_role;
create trigger customer_favorites_version after insert or delete on app.customer_favorites
  for each row execute function private.bump_favorite_list_version();

create function api.customer_favorites()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_owner uuid := private.request_user_id();
begin
  if v_owner is null then
    raise exception 'Inicia sesión para consultar tus favoritos.' using errcode = '42501';
  end if;
  -- A single statement snapshot keeps version and membership consistent.
  return (select pg_catalog.jsonb_build_object(
    'productIds', coalesce((select pg_catalog.jsonb_agg(f.product_id order by f.created_at, f.product_id)
      from app.customer_favorites f where f.user_id = v_owner), '[]'::jsonb),
    'version', coalesce((select l.version from app.favorite_lists l where l.user_id = v_owner), 0)));
end;
$$;
alter function api.customer_favorites() owner to aro_favorites_executor;
revoke all on function api.customer_favorites() from public, anon, authenticated, service_role;
grant execute on function api.customer_favorites() to authenticated;

create function api.set_customer_favorite(
  p_product_id uuid, p_selected boolean, p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := private.request_user_id();
  v_version bigint;
  v_exists boolean;
begin
  if v_owner is null then
    raise exception 'Inicia sesión para guardar tus favoritos.' using errcode = '42501';
  end if;
  if p_product_id is null or p_selected is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Revisa el producto y la versión de tus favoritos.' using errcode = '22023';
  end if;
  begin
    insert into app.favorite_lists(user_id) values (v_owner) on conflict (user_id) do nothing;
  exception when foreign_key_violation then
    raise exception 'La cuenta ya no está disponible. Vuelve a iniciar sesión.' using errcode = '42501';
  end;
  select l.version into v_version from app.favorite_lists l
    where l.user_id = v_owner for update;
  select exists (select 1 from app.customer_favorites f
    where f.user_id = v_owner and f.product_id = p_product_id) into v_exists;

  -- Desired-state retries are safe even after the caller loses a response.
  -- A stale version is relevant only when this request would change the list.
  if v_exists = p_selected then return api.customer_favorites(); end if;
  if p_expected_version <> v_version then
    raise exception 'Tus favoritos cambiaron en otra sesión. Actualiza la lista e inténtalo de nuevo.'
      using errcode = 'PT409';
  end if;
  if p_selected then
    if not private.favorite_product_is_published(p_product_id) then
      raise exception 'Este producto ya no está disponible para añadir a favoritos.' using errcode = '22023';
    end if;
    if (select pg_catalog.count(*) from app.customer_favorites f where f.user_id = v_owner) >= 500 then
      raise exception 'Puedes guardar hasta 500 favoritos. Retira uno antes de añadir otro.' using errcode = '54000';
    end if;
    begin
      insert into app.customer_favorites(user_id, product_id) values (v_owner, p_product_id);
    exception when foreign_key_violation then
      raise exception 'Este producto ya no está disponible para añadir a favoritos.' using errcode = '22023';
    end;
  else
    delete from app.customer_favorites where user_id = v_owner and product_id = p_product_id;
  end if;
  return api.customer_favorites();
end;
$$;
alter function api.set_customer_favorite(uuid, boolean, bigint) owner to aro_favorites_executor;
revoke all on function api.set_customer_favorite(uuid, boolean, bigint)
  from public, anon, authenticated, service_role;
grant execute on function api.set_customer_favorite(uuid, boolean, bigint) to authenticated;

revoke create on schema private from aro_api_executor, aro_favorites_executor;
revoke create on schema api from aro_favorites_executor;
