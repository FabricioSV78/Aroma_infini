begin;
do $$ begin if current_setting('aroma.test_mode',true) is distinct from 'local-fixture' then
  raise exception 'Use only the isolated SQL runner.';end if;end $$;
create schema aroma_reviews_test;
grant usage on schema aroma_reviews_test to anon,authenticated,service_role;
create function aroma_reviews_test.ok(p_value boolean,p_label text) returns text language plpgsql as $$
begin if p_value is distinct from true then raise exception 'FAIL: %',p_label;end if;return 'PASS: '||p_label;end $$;
create function aroma_reviews_test.error(p_sql text,p_state text,p_label text) returns text language plpgsql as $$
declare v_state text;begin begin execute p_sql;exception when others then get stacked diagnostics v_state=returned_sqlstate;end;
if v_state is distinct from p_state then raise exception 'FAIL: %, expected %, got %',p_label,p_state,coalesce(v_state,'success');end if;
return 'PASS: '||p_label;end $$;
grant execute on all functions in schema aroma_reviews_test to anon,authenticated,service_role;
insert into auth.users(id,email) values
('d1000000-0000-4000-8000-000000000001','review-a@example.invalid'),
('d1000000-0000-4000-8000-000000000002','review-b@example.invalid'),
('d1000000-0000-4000-8000-000000000003','review-c@example.invalid'),
('d1000000-0000-4000-8000-000000000004','review-d@example.invalid');
update app.profiles set first_name='Ana',last_name='Torres',phone='912345678'
  where user_id='d1000000-0000-4000-8000-000000000001';
insert into app.brands(id,name,slug,active) values('d2000000-0000-4000-8000-000000000001','Review SQL','review-sql',true);
insert into app.media_assets(id,storage_kind,object_key,mime_type,width,height,status,verified_at,operation_id,purpose,byte_size,sha256)
values('d5000000-0000-4000-8000-000000000001','r2',
'public/dynamic/d5000000-0000-4000-8000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/800.webp',
'image/webp',800,1000,'ready',now(),'d5000000-0000-4000-8000-000000000002','product-gallery',2000,repeat('a',64));
insert into app.media_renditions(asset_id,width,height,mime_type,byte_size,sha256,object_key)
select id,width,height,mime_type,byte_size,sha256,object_key from app.media_assets where id='d5000000-0000-4000-8000-000000000001';
insert into app.products(id,name,slug,brand_id,short_description,description,active,gender,product_type)
values('d3000000-0000-4000-8000-000000000001','Review product','review-product','d2000000-0000-4000-8000-000000000001','SQL fixture','SQL fixture',true,'unisex','perfume');
insert into app.product_variants(id,product_id,ml,price_cents,stock,active,merchant_sku)
values('d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',50,12000,10,true,'REVIEW-SQL-1');
insert into app.product_images(product_id,position,media_id)
values('d3000000-0000-4000-8000-000000000001',0,'d5000000-0000-4000-8000-000000000001');
set constraints all immediate;set constraints all deferred;

select aroma_reviews_test.ok((select not(rolcanlogin or rolinherit or rolbypassrls or rolsuper) from pg_roles where rolname='aro_reviews_executor'),'Review executor cannot login or bypass RLS');
select aroma_reviews_test.ok(not has_schema_privilege('aro_reviews_executor','auth','usage') and not has_schema_privilege('aro_reviews_executor','api','create'),'Review executor has no Auth or schema creation privileges');
select aroma_reviews_test.ok(not has_table_privilege('anon','app.product_reviews','select,insert,update,delete') and not has_table_privilege('authenticated','app.product_reviews','select,insert,update,delete'),'No direct browser review CRUD');
select aroma_reviews_test.ok(private.review_content_allowed('No dura mucho. No me gustó su aroma y no lo recomiendo.'),'Respectful negative experiences remain publishable');
select aroma_reviews_test.ok(private.review_content_allowed('Hubo una disputa por el envío. Uso una computadora.'),'Words containing offensive-looking substrings are permitted');
select aroma_reviews_test.ok(not private.review_content_allowed('Eres un PÉNDEJO'),'Case and accents cannot bypass filtering');
select aroma_reviews_test.ok(not private.review_content_allowed('Esto es m13rd4'),'Leet substitutions cannot bypass filtering');
select aroma_reviews_test.ok(not private.review_content_allowed('p.u.t.a'),'Punctuation between letters cannot bypass filtering');
select aroma_reviews_test.ok(not private.review_content_allowed('p u t o'),'Spaces between letters cannot bypass filtering');
select aroma_reviews_test.ok(not private.review_content_allowed('puuuutaaa'),'Repeated letters cannot bypass filtering');
select aroma_reviews_test.ok(not private.review_content_allowed('ＦＵＣＫ'),'Unicode compatibility forms normalize before filtering');

set local role anon;
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001')->>'count'='0','Initial summary contains no fabricated reviews');
select aroma_reviews_test.error('select api.customer_product_review(''d3000000-0000-4000-8000-000000000001'')','42501','Anonymous owner reads are rejected');
select aroma_reviews_test.error('select api.submit_product_review(''d3000000-0000-4000-8000-000000000001'',5,''Buen aroma'',''Una fragancia agradable.'',50)','42501','Anonymous publication is rejected');
reset role;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select aroma_reviews_test.ok(api.submit_product_review('d3000000-0000-4000-8000-000000000001',2,'No es para mí','No dura mucho en mi piel, no lo recomiendo.',50)->>'author'='Ana T.','Author comes from a limited profile snapshot, not a client-supplied identity');
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001')->>'count'='1','A respectful negative review is published and included in totals');
select aroma_reviews_test.ok(api.submit_product_review('d3000000-0000-4000-8000-000000000001',2,'No es para mí','No dura mucho en mi piel, no lo recomiendo.',50)->>'rating'='2','An identical retry returns the existing review');
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001')->>'count'='1','A repeated request does not create a duplicate');
select aroma_reviews_test.error('select api.submit_product_review(''d3000000-0000-4000-8000-000000000001'',5,''Otro título'',''Otra opinión distinta.'',50)','PT409','A different second review is rejected clearly');
select aroma_reviews_test.ok(api.customer_product_review('d3000000-0000-4000-8000-000000000001')->>'author'='Ana T.','A customer can read their own review');
reset role;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
set local role authenticated;
select aroma_reviews_test.ok(api.customer_product_review('d3000000-0000-4000-8000-000000000001') is null,'Another customer cannot read the first customer ownership result');
select aroma_reviews_test.error('select api.submit_product_review(''d3000000-0000-4000-8000-000000000001'',6,''Buen aroma'',''Una fragancia agradable.'',50)','22023','Out-of-range ratings are rejected');
select aroma_reviews_test.error('select api.submit_product_review(''d3000000-0000-4000-8000-000000000001'',5,''Buen aroma'',''Una fragancia agradable.'',100)','22023','A presentation not belonging to the product is rejected');
select aroma_reviews_test.error('select api.submit_product_review(''d3000000-0000-4000-8000-000000000001'',5,''Buen aroma'',''Este perfume es una m13rd4.'',50)','PT422','Direct RPC cannot bypass the content check');
select aroma_reviews_test.ok(api.customer_product_review('d3000000-0000-4000-8000-000000000001') is null,'Rejected content is never stored');
select aroma_reviews_test.ok(api.submit_product_review('d3000000-0000-4000-8000-000000000001',5,'Me gustó','Un perfume muy agradable y fresco.',null)->>'rating'='5','Presentation is optional and author falls back safely');
reset role;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
set local role authenticated;
select api.submit_product_review('d3000000-0000-4000-8000-000000000001',4,'Buen aroma','Una fragancia cálida y agradable.',50);
reset role;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000004","aal":"aal1"}',true);
set local role authenticated;
select api.submit_product_review('d3000000-0000-4000-8000-000000000001',1,'No me gustó','El aroma no se adapta a lo que buscaba.',null);
reset role;
set local role anon;
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001')->>'count'='4','Summary is derived from four real stored rows');
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001')->>'average'='3.0','Average uses the actual ratings');
select aroma_reviews_test.ok(jsonb_array_length(api.product_reviews('d3000000-0000-4000-8000-000000000001')->'items')=3 and jsonb_array_length(api.product_reviews('d3000000-0000-4000-8000-000000000001',2)->'items')=1,'Pagination remains bounded to three opinions');
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001',1,5)->>'total'='1','Rating filters update the matching total');
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001',1,null,'highest')->'items'->0->>'rating'='5','Rating sorting is applied on the server');
select aroma_reviews_test.ok(not(api.product_reviews('d3000000-0000-4000-8000-000000000001')::text ~ 'review-a@|912345678|user_id|verifiedPurchase'),'Public DTOs contain no account identifiers, contacts or invented verification claim');
reset role;
update app.product_reviews set published=false where user_id='d1000000-0000-4000-8000-000000000004';
set local role anon;
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001')->>'count'='3','Unpublished opinions are excluded from list and summary');
reset role;
update app.products set active=false where id='d3000000-0000-4000-8000-000000000001';
set local role anon;
select aroma_reviews_test.ok(api.product_reviews('d3000000-0000-4000-8000-000000000001')->>'count'='0','Hidden products expose no public opinions');
reset role;
rollback;
