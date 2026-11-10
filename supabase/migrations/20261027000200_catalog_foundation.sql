-- Catalog foundation only. No demo catalog, browser snapshot, storage upload,
-- administrative write RPC or payment integration is installed here.
-- Depends on the bootstrap and identity migrations (schemas, executor role,
-- private.touch_updated_at). Public access is through bounded DTO functions.

create sequence app.product_code_seq
  as integer start with 10000 increment by 1
  minvalue 10000 maxvalue 99999 no cycle;
comment on sequence app.product_code_seq is
  'Atomic five-digit product codes; gaps after rollback are expected and never recycled. Variant merchant SKUs are independent.';

create function private.catalog_name_key(p_value text)
returns text
language sql immutable strict parallel safe
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      normalize(pg_catalog.btrim(pg_catalog.regexp_replace(
        normalize(p_value, NFKC), '[[:space:]]+', ' ', 'g'
      )), NFKD),
      U&'[\0300-\036f]', '', 'g'
    )
  );
$$;
revoke all on function private.catalog_name_key(text) from public, anon, authenticated;
grant execute on function private.catalog_name_key(text) to aro_api_executor;

create table app.brands (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null check (pg_catalog.btrim(name) <> '' and pg_catalog.char_length(name) <= 160),
  name_key text generated always as (private.catalog_name_key(name)) stored,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint brands_name_key_unique unique (name_key),
  constraint brands_slug_unique unique (slug)
);

create table app.media_assets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  storage_kind text not null default 'local' check (storage_kind in ('local', 'r2')),
  object_key text not null,
  mime_type text not null default 'image/webp'
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'video/mp4')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  status text not null default 'pending' check (status in ('pending', 'ready', 'disabled')),
  verified_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint media_assets_reference_unique unique (storage_kind, object_key),
  constraint media_assets_verified_ready check (status <> 'ready' or verified_at is not null),
  constraint media_assets_reference_only check (
    object_key !~ '[[:cntrl:]]'
    and object_key !~ '(^|/)\.\.(/|$)'
    and object_key !~ '(^|/)\.(/|$)'
    and object_key !~ '[:?#\\]'
    and (
      (storage_kind = 'local' and object_key ~ '^/(images|videos|brand)/[A-Za-z0-9][A-Za-z0-9._/-]*$')
      or
      (storage_kind = 'r2' and object_key ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$')
    )
  )
);
comment on table app.media_assets is
  'References only, never file bytes/base64/URLs with credentials. Ready means verified by an authorized media workflow. R2 is metadata-ready, not connected.';

create table app.products (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  legacy_id text unique check (legacy_id is null or pg_catalog.btrim(legacy_id) <> ''),
  product_code integer not null default pg_catalog.nextval('app.product_code_seq'::regclass)
    check (product_code between 10000 and 99999),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (pg_catalog.btrim(name) <> ''),
  brand_id uuid references app.brands(id) on delete restrict,
  product_type text not null default 'perfume' check (product_type in ('perfume', 'complemento')),
  gender text check (gender is null or gender in ('hombre', 'mujer', 'unisex')),
  aromatic_profile text not null default '',
  short_description text not null check (pg_catalog.btrim(short_description) <> ''),
  description text not null check (pg_catalog.btrim(description) <> ''),
  intensity_level smallint check (intensity_level is null or intensity_level between 1 and 3),
  occasion text not null default '',
  season text not null default '',
  olfactory_media_id uuid references app.media_assets(id) on delete restrict,
  active boolean not null default false,
  display_rank integer not null default 0 check (display_rank >= 0),
  newest_rank integer not null default 0 check (newest_rank >= 0),
  low_stock_threshold integer not null default 2 check (low_stock_threshold >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint products_code_unique unique (product_code),
  constraint products_slug_unique unique (slug),
  constraint products_perfume_brand check (product_type <> 'perfume' or brand_id is not null),
  constraint products_complement_fields check (
    product_type <> 'complemento'
    or (gender is null and aromatic_profile = '' and intensity_level is null
      and occasion = '' and season = '' and olfactory_media_id is null)
  )
);
alter sequence app.product_code_seq owned by app.products.product_code;
create index products_brand_idx on app.products(brand_id);
create index products_olfactory_media_idx on app.products(olfactory_media_id) where olfactory_media_id is not null;
create index products_public_order_idx on app.products(display_rank, id) where active;
create index products_type_idx on app.products(product_type) where active;

create table app.product_variants (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  legacy_id text unique check (legacy_id is null or pg_catalog.btrim(legacy_id) <> ''),
  product_id uuid not null references app.products(id) on delete cascade,
  merchant_sku text check (
    merchant_sku is null
    or (merchant_sku = pg_catalog.upper(pg_catalog.btrim(merchant_sku))
      and merchant_sku ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$')
  ),
  ml integer check (ml is null or ml > 0),
  label text check (label is null or (pg_catalog.btrim(label) <> '' and pg_catalog.char_length(label) <= 80)),
  presentation_key text generated always as (
    private.catalog_name_key(coalesce(nullif(pg_catalog.btrim(label), ''), ml::text || ' ml'))
  ) stored,
  price_cents bigint not null default 0 check (price_cents between 0 and 9007199254740991),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint product_variants_sku_unique unique (merchant_sku),
  constraint product_variants_presentation_unique unique (product_id, presentation_key),
  constraint product_variants_has_presentation check (ml is not null or label is not null)
);
create index product_variants_product_idx on app.product_variants(product_id);
create index product_variants_public_price_idx on app.product_variants(price_cents, product_id) where active;

create table app.olfactory_families (
  code text primary key,
  label text not null,
  constraint olfactory_families_supported_code check (code in (
    'amaderado', 'floral', 'verde', 'ambar', 'citrico', 'aromatico', 'fresco', 'gourmand'
  ))
);
-- Reference vocabulary only. No products or classifications are invented.
insert into app.olfactory_families(code, label) values
  ('amaderado', 'Amaderada'), ('floral', 'Floral'), ('verde', 'Verde'),
  ('ambar', 'Ámbar'), ('citrico', 'Cítrica'), ('aromatico', 'Aromática'),
  ('fresco', 'Fresca'), ('gourmand', 'Gourmand');

create table app.product_olfactory_families (
  product_id uuid not null references app.products(id) on delete cascade,
  family_code text not null references app.olfactory_families(code) on delete restrict,
  position smallint not null default 0 check (position between 0 and 7),
  primary key (product_id, family_code),
  constraint product_olfactory_families_position_unique unique (product_id, position)
);
create index product_olfactory_families_family_idx on app.product_olfactory_families(family_code, product_id);

create table app.product_notes (
  product_id uuid not null references app.products(id) on delete cascade,
  phase text not null check (phase in ('top', 'heart', 'base')),
  position integer not null check (position >= 0),
  label text not null check (pg_catalog.btrim(label) <> ''),
  primary key (product_id, phase, position)
);

create table app.product_images (
  product_id uuid not null references app.products(id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  media_id uuid not null references app.media_assets(id) on delete restrict,
  framing text not null default 'full' check (framing in ('full', 'detail-top', 'detail-base')),
  primary key (product_id, position),
  constraint product_images_no_duplicate unique (product_id, media_id)
);
create index product_images_media_idx on app.product_images(media_id);

create table app.product_recommendations (
  product_id uuid not null references app.products(id) on delete cascade,
  recommended_product_id uuid not null references app.products(id) on delete restrict,
  position smallint not null check (position between 0 and 3),
  primary key (product_id, recommended_product_id),
  constraint product_recommendations_position_unique unique (product_id, position),
  constraint product_recommendations_not_self check (product_id <> recommended_product_id)
);
create index product_recommendations_target_idx on app.product_recommendations(recommended_product_id);

create table app.product_offers (
  product_id uuid primary key references app.products(id) on delete cascade,
  enabled boolean not null default false,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  value bigint not null check (value > 0 and value <= 9007199254740991),
  starts_at timestamptz,
  ends_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint product_offers_percent_range check (discount_type <> 'percent' or value between 1 and 99),
  constraint product_offers_valid_dates check (starts_at is null or ends_at is null or starts_at < ends_at)
);

create table app.store_settings (
  singleton boolean primary key default true check (singleton),
  complements_enabled boolean not null default false,
  featured_brand_id uuid references app.brands(id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create index store_settings_featured_brand_idx on app.store_settings(featured_brand_id) where featured_brand_id is not null;
-- Explicitly keep the already-disabled product-type feature closed. No tariffs,
-- merchant content, sample brands or products are seeded by this migration.
insert into app.store_settings(singleton, complements_enabled) values (true, false);

-- Cross-table invariants are deferred until the complete product transaction
-- finishes, so variants, gallery and descriptions can be saved together later.
create function private.catalog_validate_product(p_product_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_product app.products%rowtype;
  v_offer app.product_offers%rowtype;
begin
  select * into v_product from app.products where id = p_product_id;
  if not found then return; end if;

  -- Evaluate availability from the transaction's final variant set. Removing
  -- one presentation and adding a stocked replacement must not deactivate a
  -- product because of an intermediate statement. Replenishment never
  -- republishes a previously disabled product.
  if v_product.active and not exists (
    select 1 from app.product_variants
    where product_id = p_product_id and active and stock > 0
  ) then
    update app.products set active = false, version = version + 1
    where id = p_product_id and active;
    v_product.active := false;
  end if;

  if not exists (select 1 from app.product_variants where product_id = p_product_id) then
    raise exception 'El producto necesita al menos una presentación.' using errcode = '23514';
  end if;
  if exists (
    select 1 from app.product_variants v where v.product_id = p_product_id
      and ((v_product.product_type = 'perfume' and v.ml is null)
        or (v_product.product_type = 'complemento' and (v.ml is not null or v.label is null)))
  ) then
    raise exception 'La presentación no corresponde al tipo de producto.' using errcode = '23514';
  end if;
  if v_product.product_type = 'complemento' and (
    exists (select 1 from app.product_olfactory_families where product_id = p_product_id)
    or exists (select 1 from app.product_notes where product_id = p_product_id)
  ) then
    raise exception 'Los complementos no tienen familias ni notas olfativas.' using errcode = '23514';
  end if;
  if exists (
    select 1 from app.product_images i join app.media_assets m on m.id = i.media_id
    where i.product_id = p_product_id and m.mime_type not like 'image/%'
  ) or (v_product.olfactory_media_id is not null and not exists (
    select 1 from app.media_assets m
    where m.id = v_product.olfactory_media_id and m.mime_type like 'image/%'
  )) then
    raise exception 'La galería y la familia olfativa necesitan referencias de imagen.' using errcode = '23514';
  end if;

  select * into v_offer from app.product_offers where product_id = p_product_id;
  if found then
    if not exists (select 1 from app.product_variants where product_id = p_product_id and active)
      or exists (
        select 1 from app.product_variants v where v.product_id = p_product_id and v.active
          and (v.price_cents <= 0 or
            case when v_offer.discount_type = 'percent'
              then pg_catalog.round(v.price_cents::numeric * v_offer.value / 100)
              else v_offer.value::numeric end not between 1 and v.price_cents - 1)
      ) then
      raise exception 'La oferta debe reducir el precio sin dejar en cero ninguna presentación activa.' using errcode = '23514';
    end if;
  end if;

  if v_product.active then
    if (v_product.brand_id is not null and not exists (
      select 1 from app.brands where id = v_product.brand_id and active
    )) or not exists (
      select 1 from app.product_variants where product_id = p_product_id and active and stock > 0
    ) or exists (
      select 1 from app.product_variants where product_id = p_product_id and active and price_cents <= 0
    ) or not exists (
      select 1 from app.product_images i join app.media_assets m on m.id = i.media_id
      where i.product_id = p_product_id and i.position = 0 and m.status = 'ready' and m.mime_type like 'image/%'
    ) then
      raise exception 'Para publicar, revisa marca, imagen principal, precio y stock de las presentaciones activas.' using errcode = '23514';
    end if;
  end if;
end;
$$;
revoke all on function private.catalog_validate_product(uuid) from public, anon, authenticated;

create function private.catalog_validate_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'products' then
    perform private.catalog_validate_product(new.id);
  elsif tg_table_name = 'brands' then
    perform private.catalog_validate_product(p.id) from app.products p where p.brand_id = new.id;
  elsif tg_table_name = 'media_assets' then
    perform private.catalog_validate_product(p.id) from app.products p
      where p.olfactory_media_id = new.id
        or exists (select 1 from app.product_images i where i.product_id = p.id and i.media_id = new.id);
  else
    if tg_op <> 'DELETE' then perform private.catalog_validate_product(new.product_id); end if;
    if tg_op <> 'INSERT' and (tg_op = 'DELETE' or old.product_id is distinct from new.product_id) then
      perform private.catalog_validate_product(old.product_id);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.catalog_validate_change() from public, anon, authenticated;

create constraint trigger catalog_products_valid
after insert or update on app.products deferrable initially deferred
for each row execute function private.catalog_validate_change();
create constraint trigger catalog_variants_valid
after insert or update or delete on app.product_variants deferrable initially deferred
for each row execute function private.catalog_validate_change();
create constraint trigger catalog_images_valid
after insert or update or delete on app.product_images deferrable initially deferred
for each row execute function private.catalog_validate_change();
create constraint trigger catalog_families_valid
after insert or update or delete on app.product_olfactory_families deferrable initially deferred
for each row execute function private.catalog_validate_change();
create constraint trigger catalog_notes_valid
after insert or update or delete on app.product_notes deferrable initially deferred
for each row execute function private.catalog_validate_change();
create constraint trigger catalog_offers_valid
after insert or update or delete on app.product_offers deferrable initially deferred
for each row execute function private.catalog_validate_change();
create constraint trigger catalog_brands_valid
after update on app.brands deferrable initially deferred
for each row execute function private.catalog_validate_change();
create constraint trigger catalog_media_valid
after update on app.media_assets deferrable initially deferred
for each row execute function private.catalog_validate_change();

create trigger brands_touch_updated_at before update on app.brands
for each row execute function private.touch_updated_at();
create trigger media_assets_touch_updated_at before update on app.media_assets
for each row execute function private.touch_updated_at();
create trigger products_touch_updated_at before update on app.products
for each row execute function private.touch_updated_at();
create trigger product_variants_touch_updated_at before update on app.product_variants
for each row execute function private.touch_updated_at();
create trigger product_offers_touch_updated_at before update on app.product_offers
for each row execute function private.touch_updated_at();
create trigger store_settings_touch_updated_at before update on app.store_settings
for each row execute function private.touch_updated_at();

-- Only the non-login DTO executor receives table reads. Auxiliary policies are
-- deliberately internal; visitors cannot SET ROLE to it or read these tables.
-- products is the public visibility gate and its predicate never queries
-- products again, so child-table queries do not create an RLS recursion cycle.
alter table app.brands enable row level security;
alter table app.media_assets enable row level security;
alter table app.products enable row level security;
alter table app.product_variants enable row level security;
alter table app.olfactory_families enable row level security;
alter table app.product_olfactory_families enable row level security;
alter table app.product_notes enable row level security;
alter table app.product_images enable row level security;
alter table app.product_recommendations enable row level security;
alter table app.product_offers enable row level security;
alter table app.store_settings enable row level security;

revoke all on table app.brands, app.media_assets, app.products, app.product_variants,
  app.olfactory_families, app.product_olfactory_families, app.product_notes,
  app.product_images, app.product_recommendations, app.product_offers, app.store_settings
  from public, anon, authenticated;
revoke all on sequence app.product_code_seq from public, anon, authenticated;
grant select on table app.brands, app.media_assets, app.products, app.product_variants,
  app.olfactory_families, app.product_olfactory_families, app.product_notes,
  app.product_images, app.product_recommendations, app.product_offers, app.store_settings
  to aro_api_executor;

create policy catalog_brands_internal_read on app.brands for select to aro_api_executor using (true);
create policy catalog_media_internal_read on app.media_assets for select to aro_api_executor using (true);
create policy catalog_variants_internal_read on app.product_variants for select to aro_api_executor using (true);
create policy catalog_families_internal_read on app.olfactory_families for select to aro_api_executor using (true);
create policy catalog_product_families_internal_read on app.product_olfactory_families for select to aro_api_executor using (true);
create policy catalog_notes_internal_read on app.product_notes for select to aro_api_executor using (true);
create policy catalog_images_internal_read on app.product_images for select to aro_api_executor using (true);
create policy catalog_recommendations_internal_read on app.product_recommendations for select to aro_api_executor using (true);
create policy catalog_offers_internal_read on app.product_offers for select to aro_api_executor using (true);
create policy catalog_settings_internal_read on app.store_settings for select to aro_api_executor using (true);

create function private.catalog_product_is_published(p_product app.products)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_product.active
    and (p_product.brand_id is null or exists (
      select 1 from app.brands b where b.id = p_product.brand_id and b.active
    ))
    and (p_product.product_type = 'perfume' or exists (
      select 1 from app.store_settings s where s.singleton and s.complements_enabled
    ))
    and exists (
      select 1 from app.product_variants v
      where v.product_id = p_product.id and v.active and v.stock > 0 and v.price_cents > 0
    )
    and not exists (
      select 1 from app.product_variants v
      where v.product_id = p_product.id and v.active and v.price_cents <= 0
    )
    and exists (
      select 1 from app.product_images i join app.media_assets m on m.id = i.media_id
      where i.product_id = p_product.id and i.position = 0
        and m.status = 'ready' and m.mime_type like 'image/%'
    );
$$;
revoke all on function private.catalog_product_is_published(app.products) from public, anon, authenticated;
grant execute on function private.catalog_product_is_published(app.products) to aro_api_executor;
create policy catalog_products_published_read on app.products
for select to aro_api_executor using (private.catalog_product_is_published(products));

create function private.catalog_price_cents(
  p_price bigint, p_enabled boolean, p_type text, p_value bigint,
  p_starts_at timestamptz, p_ends_at timestamptz, p_at timestamptz
)
returns bigint
language sql immutable parallel safe
set search_path = ''
as $$
  select case when p_enabled and (p_starts_at is null or p_at >= p_starts_at)
      and (p_ends_at is null or p_at < p_ends_at)
      and reduction between 1 and p_price - 1
    then p_price - reduction else p_price end
  from (select case when p_type = 'percent'
    then pg_catalog.round(p_price::numeric * p_value / 100)::bigint
    else p_value end as reduction) calculated;
$$;
revoke all on function private.catalog_price_cents(bigint, boolean, text, bigint, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function private.catalog_price_cents(bigint, boolean, text, bigint, timestamptz, timestamptz, timestamptz)
  to aro_api_executor;

create function private.catalog_product_document(p_product_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'product', pg_catalog.jsonb_build_object(
      'id', p.id, 'sku', p.product_code::text, 'slug', p.slug, 'name', p.name,
      'brandId', coalesce(p.brand_id::text, ''), 'productType', p.product_type,
      'image', main_image.object_key, 'family', p.aromatic_profile,
      'olfactoryFamilies', coalesce((select pg_catalog.jsonb_agg(f.family_code order by f.position)
        from app.product_olfactory_families f where f.product_id = p.id), '[]'::jsonb),
      'variants', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', v.id, 'sku', v.merchant_sku, 'ml', v.ml, 'label', v.label,
        'priceCents', v.price_cents, 'stock', v.stock, 'active', v.active,
        'finalPriceCents', private.catalog_price_cents(v.price_cents, o.enabled,
          o.discount_type, o.value, o.starts_at, o.ends_at, pg_catalog.now())
      ) order by v.price_cents, v.id) from app.product_variants v where v.product_id = p.id and v.active), '[]'::jsonb),
      'discount', case when o.enabled and (o.starts_at is null or pg_catalog.now() >= o.starts_at)
          and (o.ends_at is null or pg_catalog.now() < o.ends_at)
        then pg_catalog.jsonb_build_object('active', true, 'type', o.discount_type, 'value', o.value,
          'startsAt', coalesce(pg_catalog.to_char(o.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''),
          'endsAt', coalesce(pg_catalog.to_char(o.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''))
        else null end
    ),
    'detail', pg_catalog.jsonb_build_object(
      'shortDescription', p.short_description, 'description', p.description,
      'olfactoryImage', olfactory.object_key,
      'notes', pg_catalog.jsonb_build_object(
        'top', coalesce((select pg_catalog.jsonb_agg(n.label order by n.position) from app.product_notes n where n.product_id = p.id and n.phase = 'top'), '[]'::jsonb),
        'heart', coalesce((select pg_catalog.jsonb_agg(n.label order by n.position) from app.product_notes n where n.product_id = p.id and n.phase = 'heart'), '[]'::jsonb),
        'base', coalesce((select pg_catalog.jsonb_agg(n.label order by n.position) from app.product_notes n where n.product_id = p.id and n.phase = 'base'), '[]'::jsonb)
      ),
      'intensityLevel', p.intensity_level,
      'intensity', case p.intensity_level when 1 then 'Suave' when 2 then 'Moderada' when 3 then 'Intensa' else null end,
      'occasion', p.occasion, 'season', p.season,
      'gallery', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'image', m.object_key,
        'alt', p.name || coalesce(' · ' || b.name, '') || ' · Vista ' || (i.position + 1)::text,
        'framing', i.framing
      ) order by i.position) from app.product_images i join app.media_assets m on m.id = i.media_id
        where i.product_id = p.id and m.status = 'ready'), '[]'::jsonb),
      'recommendationIds', coalesce((select pg_catalog.jsonb_agg(r.recommended_product_id order by r.position)
        from app.product_recommendations r join app.products target on target.id = r.recommended_product_id
        where r.product_id = p.id), '[]'::jsonb)
    ),
    'gender', p.gender, 'popularity', p.display_rank, 'newest', p.newest_rank
  )
  from app.products p
  left join app.brands b on b.id = p.brand_id
  join app.product_images cover on cover.product_id = p.id and cover.position = 0
  join app.media_assets main_image on main_image.id = cover.media_id and main_image.status = 'ready'
  left join app.media_assets olfactory on olfactory.id = p.olfactory_media_id and olfactory.status = 'ready'
  left join app.product_offers o on o.product_id = p.id
  where p.id = p_product_id;
$$;
revoke all on function private.catalog_product_document(uuid) from public, anon, authenticated;
grant execute on function private.catalog_product_document(uuid) to aro_api_executor;

create function api.catalog_products(p_limit integer default 24, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'La página solicitada no es válida.' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(private.catalog_product_document(page.id)
      order by page.display_rank, page.id) from (
        select p.id, p.display_rank from app.products p
        order by p.display_rank, p.id limit p_limit offset p_offset
      ) page), '[]'::jsonb),
    'total', (select pg_catalog.count(*) from app.products)
  ) into v_result;
  return v_result;
end;
$$;

create function api.catalog_product(p_slug text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_slug is null or pg_catalog.char_length(p_slug) > 512
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return null;
  end if;
  return (select private.catalog_product_document(p.id) from app.products p where p.slug = p_slug);
end;
$$;

create function api.catalog_brands()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'name', b.name
  ) order by b.name_key, b.id), '[]'::jsonb)
  from app.brands b where b.active;
$$;

-- Ownership is distinct from the table owner and never bypasses RLS. CREATE is
-- granted only for the owner transfer, then removed again in this migration.
grant create on schema api to aro_api_executor;
alter function api.catalog_products(integer, integer) owner to aro_api_executor;
alter function api.catalog_product(text) owner to aro_api_executor;
alter function api.catalog_brands() owner to aro_api_executor;
revoke create on schema api from aro_api_executor;
revoke all on function api.catalog_products(integer, integer), api.catalog_product(text), api.catalog_brands()
  from public, anon, authenticated;
grant execute on function api.catalog_products(integer, integer), api.catalog_product(text), api.catalog_brands()
  to anon, authenticated;

comment on function api.catalog_products(integer, integer) is
  'Bounded read-only published catalog DTO. No administrative state, contacts, internal movements or write capability. Server prices and stock are revalidated at future checkout.';
