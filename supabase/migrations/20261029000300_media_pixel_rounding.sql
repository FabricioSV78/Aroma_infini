-- Canvas dimensions are integer pixels. A source of width 801 produces a
-- 1001px high 4:5 image; retain it without upscaling or rejecting its rounding.
-- Preserve the deployed functions' owners, privileges and validation logic.
do $$
declare v_name text; v_definition text; v_pattern text := 'v_width*5<>v_height*4';
begin
  foreach v_name in array array['api.media_upload_prepare(uuid,uuid,jsonb)', 'api.media_upload_complete(uuid,uuid,jsonb)'] loop
    v_definition := pg_catalog.pg_get_functiondef(v_name::regprocedure);
    if v_definition not like '%' || v_pattern || '%' then
      raise exception 'Unexpected image validation definition: %', v_name;
    end if;
    execute pg_catalog.replace(v_definition, v_pattern,
      'abs(v_width::numeric*5-v_height::numeric*4)>4');
  end loop;
end $$;
