-- Index contracts and original integrity/security boundaries, isolated only.
begin;
do $$ begin
  if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
    raise exception 'Use only the isolated SQL runner.';
  end if;
end $$;

create schema aroma_workload_index_test;
create function aroma_workload_index_test.ok(p_value boolean,p_label text)
returns text language plpgsql security invoker set search_path='' as $$
begin
  if p_value is distinct from true then raise exception 'FAIL: %',p_label;end if;
  return 'PASS: '||p_label;
end $$;

select aroma_workload_index_test.ok(
  (select count(*)=3 from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid=i.indexrelid
    join pg_catalog.pg_am m on m.oid=idx.relam
    where i.indexrelid in('app.products_admin_created_idx'::regclass,
      'app.order_items_product_idx'::regclass,'app.order_items_variant_idx'::regclass)
      and i.indisvalid and i.indisready and not i.indisunique
      and i.indpred is null and i.indexprs is null and m.amname='btree'),
  'Workload indexes are valid non-unique B-trees without changing uniqueness or publication predicates');

select aroma_workload_index_test.ok(
  (select array_agg(a.attname order by keys.ordinality)=array['created_at','id']::name[]
    from pg_catalog.pg_index i cross join lateral unnest(i.indkey) with ordinality keys(attnum,ordinality)
    join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=keys.attnum
    where i.indexrelid='app.products_admin_created_idx'::regclass)
  and (select indoption::text='0 0' from pg_catalog.pg_index
    where indexrelid='app.products_admin_created_idx'::regclass),
  'Administrative chronological pages use both ascending keys, including inactive and draft products');

select aroma_workload_index_test.ok(
  (select array_agg(a.attname order by idx.relname)=array['product_id','variant_id']::name[]
    from pg_catalog.pg_index i join pg_catalog.pg_class idx on idx.oid=i.indexrelid
    cross join lateral unnest(i.indkey) keys(attnum)
    join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=keys.attnum
    where i.indexrelid in('app.order_items_product_idx'::regclass,'app.order_items_variant_idx'::regclass)),
  'Historical reverse lookups lead with product and presentation, not the unrelated order ID');

select aroma_workload_index_test.ok(
  (select count(*)=2 from pg_catalog.pg_constraint
    where conrelid='app.order_items'::regclass and contype='f'
      and ((conname='order_items_product_id_fkey' and confdeltype='r' and not condeferrable)
        or (conname='order_items_variant_id_fkey' and confdeltype='a' and condeferrable and condeferred))),
  'Ordered product deletion stays restricted and presentation history keeps its original deferred FK');

select aroma_workload_index_test.ok(
  (select count(*)=2 from pg_catalog.pg_class where oid in('app.products'::regclass,'app.order_items'::regclass) and relrowsecurity)
    and not has_table_privilege('anon','app.order_items','select')
    and not has_table_privilege('authenticated','app.order_items','select')
    and not has_table_privilege('anon','app.products','select'),
  'New physical indexes expose no table data and preserve RLS and the RPC-only access boundary');

rollback;
