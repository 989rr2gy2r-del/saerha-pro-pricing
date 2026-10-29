-- Preserve existing English names when an import omits the English-name column.
-- New imports without an English name keep name_en NULL rather than copying the Arabic name.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.saerha_import_products_atomic(jsonb)'::regprocedure)
    into v_definition;

  v_definition := replace(
    v_definition,
    'v_name_ar := coalesce(nullif(v_name_ar, ''''), v_name_en);' || E'\n    ' || 'v_name_en := coalesce(nullif(v_name_en, ''''), v_name_ar);',
    'v_name_ar := nullif(v_name_ar, '''');' || E'\n    ' || 'v_name_en := nullif(v_name_en, '''');'
  );

  v_definition := replace(
    v_definition,
    'name_en = v_name_en,',
    'name_en = coalesce(v_name_en, name_en),'
  );

  if position('name_en = coalesce(v_name_en, name_en),' in v_definition) = 0 then
    raise exception 'Could not safely patch saerha_import_products_atomic';
  end if;

  execute v_definition;
end;
$$;