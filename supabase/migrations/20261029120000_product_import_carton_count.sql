-- Store the count of secondary pieces in the product's large unit.
alter table public.products add column if not exists carton_count integer;
alter table public.products drop constraint if exists products_carton_count_nonnegative;
alter table public.products add constraint products_carton_count_nonnegative check (carton_count is null or carton_count >= 0);

-- Keep product, price, and unit-conversion imports in one PostgreSQL transaction.
-- SECURITY INVOKER is intentional: the caller's authenticated role and RLS policies apply.
create or replace function public.saerha_import_products_atomic(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_row jsonb;
  v_product_id uuid;
  v_sku text;
  v_name_ar text;
  v_name_en text;
  v_brand text;
  v_unit text;
  v_secondary_unit text;
  v_units_per_primary numeric;
  v_amount numeric;
  v_now timestamptz := clock_timestamp();
  v_new integer := 0;
  v_updated integer := 0;
  v_prices integer := 0;
  v_status public.product_status;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then
    raise exception 'Not authorized to import products';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Import payload must be a JSON array';
  end if;

  for v_row in select value from jsonb_array_elements(payload) as item(value)
  loop
    v_sku := trim(coalesce(v_row->>'sku', ''));
    v_name_ar := trim(coalesce(v_row->>'nameAr', ''));
    v_name_en := trim(coalesce(v_row->>'nameEn', ''));
    v_brand := trim(coalesce(v_row->>'brand', ''));
    v_unit := coalesce(nullif(trim(v_row->>'unit'), ''), 'حبة');

    if v_sku = '' or (v_name_ar = '' and v_name_en = '') then
      raise exception 'Invalid product row: SKU and product name are required';
    end if;

    v_name_ar := coalesce(nullif(v_name_ar, ''), v_name_en);
    v_name_en := coalesce(nullif(v_name_en, ''), v_name_ar);
    v_status := case when lower(coalesce(v_row->>'status', 'active')) = 'inactive'
      then 'inactive'::public.product_status else 'active'::public.product_status end;

    v_product_id := null;
    select p.id into v_product_id
    from public.products p
    where lower(trim(p.sku)) = lower(v_sku)
      and lower(trim(coalesce(p.name_ar, ''))) = lower(v_name_ar)
      and lower(trim(coalesce(p.brand, ''))) = lower(v_brand)
      and lower(trim(coalesce(p.unit, 'حبة'))) = lower(v_unit)
    order by p.created_at, p.id
    limit 1
    for update;

    if v_product_id is null then
      insert into public.products (
        sku, name_ar, name_en, short_name, brand,
        category_main, category_sub, category_third, product_group,
        model, size, color, description, unit, status, source, carton_count
      ) values (
        v_sku, v_name_ar, v_name_en,
        coalesce(nullif(trim(v_row->>'shortName'), ''), v_name_ar),
        nullif(v_brand, ''),
        nullif(trim(coalesce(v_row->>'category1', '')), ''),
        nullif(trim(coalesce(v_row->>'category2', '')), ''),
        nullif(trim(coalesce(v_row->>'category3', '')), ''),
        nullif(trim(coalesce(v_row->>'group', '')), ''),
        nullif(trim(coalesce(v_row->>'model', '')), ''),
        nullif(trim(coalesce(v_row->>'size', '')), ''),
        nullif(trim(coalesce(v_row->>'color', '')), ''),
        nullif(trim(coalesce(v_row->>'description', '')), ''),
        v_unit, v_status, 'excel_import', nullif(trim(coalesce(v_row->>'cartonCount', '')), '')::integer
      ) returning id into v_product_id;
      v_new := v_new + 1;
    else
      update public.products set
        sku = v_sku,
        name_ar = v_name_ar,
        name_en = v_name_en,
        short_name = coalesce(nullif(trim(v_row->>'shortName'), ''), v_name_ar),
        brand = nullif(v_brand, ''),
        category_main = nullif(trim(coalesce(v_row->>'category1', '')), ''),
        category_sub = nullif(trim(coalesce(v_row->>'category2', '')), ''),
        category_third = nullif(trim(coalesce(v_row->>'category3', '')), ''),
        product_group = nullif(trim(coalesce(v_row->>'group', '')), ''),
        model = nullif(trim(coalesce(v_row->>'model', '')), ''),
        size = nullif(trim(coalesce(v_row->>'size', '')), ''),
        color = nullif(trim(coalesce(v_row->>'color', '')), ''),
        description = nullif(trim(coalesce(v_row->>'description', '')), ''),
        unit = v_unit,
        status = v_status,
        carton_count = nullif(trim(coalesce(v_row->>'cartonCount', '')), '')::integer,
        updated_at = v_now
      where id = v_product_id;
      v_updated := v_updated + 1;
    end if;

    -- Retire all previously imported prices for this product (including future-dated
    -- rows) without DELETE, which is intentionally unavailable to non-admin staff.
    update public.prices
    set is_active = false, updated_at = v_now
    where product_id = v_product_id
      and customer_id is null
      and source in ('excel_import', 'excel_import_secondary_unit')
      and price_type in ('retail'::public.price_type, 'reseller'::public.price_type, 'unit_price'::public.price_type)
      and is_active = true;

    v_amount := nullif(trim(coalesce(v_row->>'retailPrice', '')), '')::numeric;
    if v_amount is not null then
      insert into public.prices (product_id, price_type, customer_id, amount, currency, source, is_active, valid_from)
      values (v_product_id, 'retail', null, v_amount, coalesce(nullif(trim(v_row->>'currency'), ''), 'KWD'), 'excel_import', true, v_now);
      v_prices := v_prices + 1;
    end if;

    v_amount := nullif(trim(coalesce(v_row->>'resellerPrice', '')), '')::numeric;
    if v_amount is not null then
      insert into public.prices (product_id, price_type, customer_id, amount, currency, source, is_active, valid_from)
      values (v_product_id, 'reseller', null, v_amount, coalesce(nullif(trim(v_row->>'currency'), ''), 'KWD'), 'excel_import', true, v_now);
      v_prices := v_prices + 1;
    end if;

    v_secondary_unit := trim(coalesce(v_row->>'secondaryUnit', ''));
    if v_secondary_unit <> '' then
      v_amount := nullif(trim(coalesce(v_row->>'secondaryRetailPrice', '')), '')::numeric;
      if v_amount is not null then
        insert into public.prices (product_id, price_type, customer_id, amount, currency, source, source_field, source_price_type, is_active, valid_from)
        values (v_product_id, 'unit_price', null, v_amount, coalesce(nullif(trim(v_row->>'currency'), ''), 'KWD'), 'excel_import_secondary_unit', v_secondary_unit, 'retail', true, v_now);
        v_prices := v_prices + 1;
      end if;

      v_amount := nullif(trim(coalesce(v_row->>'secondaryResellerPrice', '')), '')::numeric;
      if v_amount is not null then
        insert into public.prices (product_id, price_type, customer_id, amount, currency, source, source_field, source_price_type, is_active, valid_from)
        values (v_product_id, 'unit_price', null, v_amount, coalesce(nullif(trim(v_row->>'currency'), ''), 'KWD'), 'excel_import_secondary_unit', v_secondary_unit, 'reseller', true, v_now);
        v_prices := v_prices + 1;
      end if;
    end if;

    -- Remove only importer-owned conversions, so omitted/invalid secondary-unit data
    -- cannot leave stale conversions. Manual conversions are preserved.
    delete from public.unit_conversions
    where product_id = v_product_id and notes like 'Excel import:%';

    v_units_per_primary := nullif(trim(coalesce(v_row->>'unitsPerPrimary', '')), '')::numeric;
    if v_secondary_unit <> '' and v_units_per_primary is not null then
      if v_units_per_primary <= 0 then
        raise exception 'unitsPerPrimary must be greater than zero for SKU %', v_sku;
      end if;
      insert into public.unit_conversions (product_id, from_unit, to_unit, multiplier, notes)
      values
        (v_product_id, v_secondary_unit, v_unit, 1 / v_units_per_primary, 'Excel import: secondary unit to primary unit'),
        (v_product_id, v_unit, v_secondary_unit, v_units_per_primary, 'Excel import: primary unit to secondary unit');
    end if;
  end loop;

  return jsonb_build_object('new', v_new, 'updated', v_updated, 'priceChanged', v_prices);
end;
$function$;

revoke all on function public.saerha_import_products_atomic(jsonb) from public, anon;
grant execute on function public.saerha_import_products_atomic(jsonb) to authenticated;
