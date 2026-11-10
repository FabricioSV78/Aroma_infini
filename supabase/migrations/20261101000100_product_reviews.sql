-- Real customer opinions. No purchase-verification claim while payments are deferred.
create role aro_reviews_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant aro_reviews_executor to postgres;
grant usage on schema app, api, private to aro_reviews_executor;
grant create on schema api, private to aro_reviews_executor;
grant create on schema private to aro_api_executor;
grant execute on function private.request_user_id(), private.favorite_product_is_published(uuid) to aro_reviews_executor;

-- Exact word boundaries avoid rejecting words such as disputa or computadora.
-- Separator/leet normalization catches common attempts to conceal a blocked word.
create function private.review_content_allowed(p_text text)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_text text; v_word text; v_pattern text;
begin
  if p_text is null or char_length(p_text)>2000 then return false; end if;
  -- Explicit upper/lower accent folding also works with the runner's C collation.
  v_text:=translate(lower(translate(pg_catalog.normalize(p_text,'NFKC'),
    'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑáàäâãéèëêíìïîóòöôõúùüûñ',
    'aaaaaeeeeiiiiooooouuuunaaaaaeeeeiiiiooooouuuun')),
    '013457@$!|','oieastasii');
  foreach v_word in array array[
    'puta','puto','putas','putos','mierda','mierdas','carajo','carajos',
    'cabron','cabrona','cabrones','pendejo','pendeja','pendejos','pendejas',
    'imbecil','imbeciles','idiota','idiotas','estupido','estupida','estupidos','estupidas',
    'huevon','huevona','huevones','webon','weon','maricon','maricones',
    'cojudo','cojuda','cojudos','cojudas','gilipollas','joder',
    'conchatumadre','conchesumadre','fuck','fucking','shit','bitch','asshole'
  ] loop
    select '(^|[^a-z0-9])'||string_agg(substr(v_word,n,1)||'+','[^a-z0-9]*' order by n)||'([^a-z0-9]|$)'
      into v_pattern from generate_series(1,char_length(v_word)) n;
    if v_text ~ v_pattern then return false; end if;
  end loop;
  return true;
end;
$$;
alter function private.review_content_allowed(text) owner to aro_reviews_executor;
revoke all on function private.review_content_allowed(text) from public,anon,authenticated,service_role;

create table app.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references app.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_display text not null check(char_length(author_display) between 1 and 60),
  rating smallint not null check(rating between 1 and 5),
  title text not null check(char_length(btrim(title)) between 3 and 80 and title !~ '[[:cntrl:]]'),
  comment text not null check(char_length(btrim(comment)) between 10 and 1500 and translate(comment,E'\r\n\t','') !~ '[[:cntrl:]]'),
  size_ml integer check(size_ml is null or size_ml between 1 and 100000),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id,product_id),
  constraint product_reviews_respectful check(private.review_content_allowed(title||' '||comment))
);
create index product_reviews_public_idx on app.product_reviews(product_id,created_at desc,id) where published;
create index product_reviews_actor_idx on app.product_reviews(user_id,created_at desc);
alter table app.product_reviews enable row level security;
alter table app.product_reviews force row level security;
revoke all on app.product_reviews from public,anon,authenticated,service_role;
grant select,insert on app.product_reviews to aro_reviews_executor;
create policy product_reviews_executor on app.product_reviews to aro_reviews_executor using(true) with check(true);
grant select(user_id,first_name,last_name) on app.profiles to aro_reviews_executor;
create policy profiles_review_author on app.profiles for select to aro_reviews_executor
  using(user_id=(select private.request_user_id()));

create function private.review_size_available(p_product_id uuid,p_size integer)
returns boolean language sql stable security definer set search_path='' as $$
  select p_size is null or exists(select 1 from app.product_variants v
    where v.product_id=p_product_id and v.ml=p_size and v.active);
$$;
alter function private.review_size_available(uuid,integer) owner to aro_api_executor;
revoke all on function private.review_size_available(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.review_size_available(uuid,integer) to aro_reviews_executor;

create function private.review_document(p_review app.product_reviews)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_review.id,'author',p_review.author_display,
    'date',to_char(p_review.created_at at time zone 'UTC','YYYY-MM-DD'),
    'rating',p_review.rating,'title',p_review.title,'comment',p_review.comment,
    'sizeMl',coalesce(p_review.size_ml,0));
$$;
alter function private.review_document(app.product_reviews) owner to aro_reviews_executor;
revoke all on function private.review_document(app.product_reviews) from public,anon,authenticated,service_role;

create function api.product_reviews(p_product_id uuid,p_page integer default 1,
  p_rating integer default null,p_order text default 'recent')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_available boolean; v_total integer; v_count integer; v_average numeric; v_distribution jsonb; v_items jsonb;
begin
  if p_product_id is null or p_page is null or p_page not between 1 and 100000
    or (p_rating is not null and p_rating not between 1 and 5)
    or p_order is null or p_order not in ('recent','highest','lowest') then
    raise exception 'Revisa los filtros de reseñas.' using errcode='22023'; end if;
  v_available:=private.favorite_product_is_published(p_product_id);
  select count(*)::int,round(avg(rating),1) into v_count,v_average
    from app.product_reviews where product_id=p_product_id and published and v_available;
  select jsonb_object_agg(n::text,(select count(*) from app.product_reviews
    where product_id=p_product_id and published and rating=n and v_available))
    into v_distribution from generate_series(1,5) n;
  select count(*)::int into v_total from app.product_reviews where product_id=p_product_id
    and published and v_available and (p_rating is null or rating=p_rating);
  select coalesce(jsonb_agg(private.review_document(r.review) order by position),'[]'::jsonb) into v_items
    from (select pr as review,row_number() over(order by
      case when p_order='highest' then rating end desc,
      case when p_order='lowest' then rating end asc,created_at desc,id) position
      from app.product_reviews pr where product_id=p_product_id and published and v_available
        and (p_rating is null or rating=p_rating)
      order by case when p_order='highest' then rating end desc,
        case when p_order='lowest' then rating end asc,created_at desc,id
      limit 3 offset ((p_page-1)*3)) r;
  return jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',3,
    'count',v_count,'average',v_average,'distribution',v_distribution);
end;
$$;
alter function api.product_reviews(uuid,integer,integer,text) owner to aro_reviews_executor;
revoke all on function api.product_reviews(uuid,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function api.product_reviews(uuid,integer,integer,text) to anon,authenticated;

create function api.customer_product_review(p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=private.request_user_id();
begin
  if v_owner is null then raise exception 'Inicia sesión para consultar tu reseña.' using errcode='42501'; end if;
  return (select private.review_document(r) from app.product_reviews r
    where r.product_id=p_product_id and r.user_id=v_owner);
end;
$$;
alter function api.customer_product_review(uuid) owner to aro_reviews_executor;
revoke all on function api.customer_product_review(uuid) from public,anon,authenticated,service_role;
grant execute on function api.customer_product_review(uuid) to authenticated;

create function api.submit_product_review(p_product_id uuid,p_rating integer,p_title text,p_comment text,p_size_ml integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=private.request_user_id();v_review app.product_reviews%rowtype;v_first text;v_last text;v_author text;
begin
  if v_owner is null then raise exception 'Inicia sesión para publicar tu reseña.' using errcode='42501'; end if;
  if p_product_id is null or p_rating is null or p_rating not between 1 and 5
    or p_title is null or char_length(btrim(p_title)) not between 3 and 80
    or p_comment is null or char_length(btrim(p_comment)) not between 10 and 1500
    or p_title ~ '[[:cntrl:]]' or translate(p_comment,E'\r\n\t','') ~ '[[:cntrl:]]' then
    raise exception 'Revisa la valoración, el título y tu opinión.' using errcode='22023'; end if;
  if not private.review_content_allowed(p_title||' '||p_comment) then
    raise exception 'Expresa tu experiencia sin insultos ni palabras ofensivas.' using errcode='PT422'; end if;
  if not private.favorite_product_is_published(p_product_id)
    or not private.review_size_available(p_product_id,p_size_ml) then
    raise exception 'Revisa el producto y la presentación seleccionada.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,713195));
  select * into v_review from app.product_reviews where user_id=v_owner and product_id=p_product_id;
  if found then
    if v_review.rating=p_rating and v_review.title=btrim(p_title) and v_review.comment=btrim(p_comment)
      and v_review.size_ml is not distinct from p_size_ml then return private.review_document(v_review); end if;
    raise exception 'Ya publicaste una reseña para este producto.' using errcode='PT409';
  end if;
  if (select count(*) from app.product_reviews where user_id=v_owner and created_at>now()-interval '1 hour')>=10 then
    raise exception 'Espera un momento antes de publicar otra opinión.' using errcode='PT429'; end if;
  select split_part(btrim(regexp_replace(first_name,'[^[:alpha:] -]','','g')),' ',1),
    left(btrim(regexp_replace(last_name,'[^[:alpha:] -]','','g')),1)
    into v_first,v_last from app.profiles where user_id=v_owner;
  if not found then raise exception 'Completa tu perfil antes de publicar.' using errcode='42501'; end if;
  v_author:=coalesce(nullif(left(v_first,40),''),'Cliente')||case when coalesce(v_last,'')<>'' then ' '||v_last||'.' else '' end;
  if not private.review_content_allowed(v_author) then v_author:='Cliente'; end if;
  insert into app.product_reviews(product_id,user_id,author_display,rating,title,comment,size_ml)
    values(p_product_id,v_owner,v_author,p_rating,btrim(p_title),btrim(p_comment),p_size_ml)
    returning * into v_review;
  return private.review_document(v_review);
end;
$$;
alter function api.submit_product_review(uuid,integer,text,text,integer) owner to aro_reviews_executor;
revoke all on function api.submit_product_review(uuid,integer,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function api.submit_product_review(uuid,integer,text,text,integer) to authenticated;
revoke create on schema api,private from aro_reviews_executor;
revoke create on schema private from aro_api_executor;
comment on table app.product_reviews is 'Authenticated, respectful customer opinions; one per owner/product, no claim of verified purchase. Public projection omits owner ids and contact details.';
