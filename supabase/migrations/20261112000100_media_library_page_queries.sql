-- The native 3k-asset/1k-order profile found that every library search counted
-- references for the entire history before selecting its at-most-50 items.
-- Only used/unused filtering needs that global count. Other filters select the
-- page first and count its exact usages through the same shared reference union.
-- CREATE OR REPLACE preserves the existing restricted owner, ACL and auth gate.
create or replace function api.admin_media_library(p_query text default '',p_section text default 'all',p_state text default 'all',p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare query_text text:=btrim(coalesce(p_query,''));query_filter tsquery;
begin
  if not private.is_admin() then raise exception 'Requiere acceso administrativo verificado.' using errcode='42501';end if;
  if char_length(query_text)>160 or p_section is null or p_section not in('all','home','products','about','account','identity','seo','other')
    or p_state is null or p_state not in('all','used','unused','pending','deleted') or p_page is null or p_page not between 1 and 100000
    or p_page_size is null or p_page_size not between 1 and 50 then raise exception 'Filtros de biblioteca no válidos.' using errcode='22023';end if;
  query_filter:=case when query_text<>'' then websearch_to_tsquery('simple'::regconfig,query_text) end;

  if p_state in('used','unused') then
    return (
      with usage_counts as materialized(select asset_id,count(*) as uses from private.media_usages() group by asset_id),
      matching as materialized(
        select m.id,coalesce(u.uses,0) as uses from app.media_assets m join app.media_library l on l.asset_id=m.id
        left join usage_counts u on u.asset_id=m.id where m.storage_kind='r2'
          and (p_section='all' or l.section=p_section) and (query_filter is null or l.search_document@@query_filter)
          and m.status='ready' and ((p_state='used' and coalesce(u.uses,0)>0) or (p_state='unused' and coalesce(u.uses,0)=0))),
      selected as materialized(select m as media,l as metadata,x.uses,m.created_at,m.id from matching x
        join app.media_assets m on m.id=x.id join app.media_library l on l.asset_id=m.id
        order by m.created_at desc,m.id limit p_page_size offset (p_page-1)*p_page_size),
      variants as(select r.asset_id,jsonb_agg(jsonb_build_object('src','/media/'||r.object_key,'width',r.width,'height',r.height) order by r.width) as manifest
        from app.media_renditions r where r.asset_id in(select id from selected) group by r.asset_id)
      select jsonb_build_object('items',coalesce((select jsonb_agg(private.media_library_json(s.media,s.metadata,s.uses,v.manifest)
        order by s.created_at desc,s.id) from selected s left join variants v on v.asset_id=s.id),'[]'::jsonb),
        'total',(select count(*) from matching),'page',p_page,'pageSize',p_page_size));
  end if;

  return (
    with matching as materialized(
      select m.id from app.media_assets m join app.media_library l on l.asset_id=m.id
      where m.storage_kind='r2'
        and (p_section='all' or l.section=p_section) and (query_filter is null or l.search_document@@query_filter)
        and (p_state='all'
          or (p_state='pending' and m.status<>'deleted' and (m.retire_after is not null or m.status='deleting'))
          or (p_state='deleted' and m.status='deleted'))),
    selected as materialized(select m as media,l as metadata,m.created_at,m.id from matching x
      join app.media_assets m on m.id=x.id join app.media_library l on l.asset_id=m.id
      order by m.created_at desc,m.id limit p_page_size offset (p_page-1)*p_page_size),
    usage_counts as(select asset_id,count(*) as uses from private.media_usages(array(select id from selected)) group by asset_id),
    variants as(select r.asset_id,jsonb_agg(jsonb_build_object('src','/media/'||r.object_key,'width',r.width,'height',r.height) order by r.width) as manifest
      from app.media_renditions r where r.asset_id in(select id from selected) group by r.asset_id)
    select jsonb_build_object('items',coalesce((select jsonb_agg(private.media_library_json(s.media,s.metadata,coalesce(u.uses,0),v.manifest)
      order by s.created_at desc,s.id) from selected s left join usage_counts u on u.asset_id=s.id left join variants v on v.asset_id=s.id),'[]'::jsonb),
      'total',(select count(*) from matching),'page',p_page,'pageSize',p_page_size));
end;
$$;
