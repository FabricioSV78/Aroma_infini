-- Operator-only, read-only inventory. Run in a READ ONLY transaction.
-- No application row contents, query texts, credentials or statistics resets.
-- A zero scan counter is not evidence that a constraint index can be removed.
select ns.nspname as schema_name, tbl.relname as table_name,
  idx.relname as index_name, method.amname as method,
  ind.indisprimary as primary_key, ind.indisunique as unique_index,
  ind.indisvalid as valid, ind.indisready as ready,
  pg_catalog.pg_get_indexdef(idx.oid) as definition,
  pg_catalog.pg_relation_size(idx.oid) as index_bytes,
  stats.idx_scan, stats.idx_tup_read, stats.idx_tup_fetch,
  (select pg_catalog.array_agg(con.conname order by con.conname)
    from pg_catalog.pg_constraint con
    where con.conindid = idx.oid and con.contype in ('p', 'u', 'x'))
    as constraint_dependencies
from pg_catalog.pg_index ind
join pg_catalog.pg_class idx on idx.oid = ind.indexrelid
join pg_catalog.pg_class tbl on tbl.oid = ind.indrelid
join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
join pg_catalog.pg_am method on method.oid = idx.relam
left join pg_catalog.pg_stat_user_indexes stats on stats.indexrelid = idx.oid
where ns.nspname in ('app', 'private')
order by ns.nspname, tbl.relname, idx.relname;

-- Exact structural duplicates only; overlapping prefixes are not automatically
-- redundant, and constraint/partial/include/opclass differences are retained.
select a.indrelid::pg_catalog.regclass as table_name,
  a.indexrelid::pg_catalog.regclass as first_index,
  b.indexrelid::pg_catalog.regclass as second_index
from pg_catalog.pg_index a
join pg_catalog.pg_index b on b.indrelid = a.indrelid
  and b.indexrelid > a.indexrelid
join pg_catalog.pg_class tbl on tbl.oid = a.indrelid
join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
join pg_catalog.pg_class ai on ai.oid = a.indexrelid
join pg_catalog.pg_class bi on bi.oid = b.indexrelid
where ns.nspname in ('app', 'private')
  and a.indisvalid and b.indisvalid
  and ai.relam = bi.relam
  and a.indisunique = b.indisunique
  and a.indnullsnotdistinct = b.indnullsnotdistinct
  and a.indnkeyatts = b.indnkeyatts and a.indnatts = b.indnatts
  and a.indkey = b.indkey and a.indclass = b.indclass
  and a.indcollation = b.indcollation and a.indoption = b.indoption
  and a.indexprs::text is not distinct from b.indexprs::text
  and a.indpred::text is not distinct from b.indpred::text
order by 1, 2, 3;

select schemaname, relname as table_name, n_live_tup, n_dead_tup,
  seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del, n_tup_hot_upd,
  last_analyze, last_autoanalyze,
  pg_catalog.pg_table_size(relid) as table_bytes,
  pg_catalog.pg_indexes_size(relid) as indexes_bytes
from pg_catalog.pg_stat_user_tables
where schemaname in ('app', 'private')
order by schemaname, relname;
