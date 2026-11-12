-- Reviewed with EXPLAIN (ANALYZE, BUFFERS) on staging and a disposable
-- 10k-product/50k-order fixture. Existing PK/unique/partial indexes cannot
-- serve these leading keys. No data, RLS, RPC, trigger or constraint changes.
-- Use a short lock budget: fail for operator review rather than queue writes.
-- These transactional builds are intended for the verified small staging DB.
-- A large production rollout must review build/lock cost before authorizing it.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- admin_catalog_page selects the same chronological page for documents and
-- versions. Public active/display_rank indexes do not cover all admin rows.
create index products_admin_created_idx on app.products(created_at, id);

-- The historical UNIQUE(order_id, variant_id) serves order lines, not reverse
-- product/variant lookups. PostgreSQL does not create indexes on referencing
-- FK columns automatically. These avoid history-wide RI scans when editing
-- unused presentations or deleting products without orders; FK rules remain.
create index order_items_product_idx on app.order_items(product_id);
create index order_items_variant_idx on app.order_items(variant_id);

comment on index app.products_admin_created_idx is
  'Administrative chronological catalog pages, including inactive/draft products. Measured in the 2026-11-12 workload audit.';
comment on index app.order_items_product_idx is
  'Reverse product FK checks against historical order lines; does not authorize deletion of ordered products.';
comment on index app.order_items_variant_idx is
  'Reverse presentation FK checks against historical order lines; original deferred integrity rules remain unchanged.';
