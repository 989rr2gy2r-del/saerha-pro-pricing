create or replace function public.save_order_with_quotation(
  p_order_id uuid,
  p_order jsonb,
  p_order_items jsonb,
  p_quotation jsonb,
  p_quotation_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_quote_id uuid;
  v_order_reference text;
  v_quote_reference text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_order_id is null then
    insert into public.orders (
      reference,
      customer_id,
      source,
      status,
      raw_text,
      notes
    )
    values (
      p_order->>'reference',
      nullif(p_order->>'customer_id','')::uuid,
      (p_order->>'source')::public.order_source,
      'in_review'::public.order_status,
      p_order->>'raw_text',
      p_order->>'notes'
    )
    returning id, reference into v_order_id, v_order_reference;
  else
    update public.orders
       set customer_id = nullif(p_order->>'customer_id','')::uuid,
           source = (p_order->>'source')::public.order_source,
           raw_text = p_order->>'raw_text',
           notes = p_order->>'notes',
           updated_at = now()
     where id = p_order_id
     returning id, reference into v_order_id, v_order_reference;

    if v_order_id is null then
      raise exception 'ORDER_NOT_FOUND';
    end if;

    delete from public.order_items where order_id = v_order_id;
  end if;

  insert into public.order_items (
    order_id, product_id, line_no, raw_name, matched_sku, quantity,
    unit, notes, brand, unit_price, line_total, extra
  )
  select
    v_order_id, x.product_id, x.line_no, x.raw_name, x.matched_sku, x.quantity,
    x.unit, x.notes, x.brand, x.unit_price, x.line_total,
    coalesce(x.extra, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_order_items, '[]'::jsonb)) as x(
    product_id uuid,
    line_no integer,
    raw_name text,
    matched_sku text,
    quantity numeric,
    unit text,
    notes text,
    brand text,
    unit_price numeric,
    line_total numeric,
    extra jsonb
  );

  insert into public.quotations (
    reference, customer_id, order_id, issue_date, expiry_date, price_type,
    discount_amount, tax_amount, subtotal, total, currency, status, notes
  )
  values (
    p_quotation->>'reference',
    nullif(p_quotation->>'customer_id','')::uuid,
    v_order_id,
    coalesce(nullif(p_quotation->>'issue_date','')::date, current_date),
    nullif(p_quotation->>'expiry_date','')::date,
    (p_quotation->>'price_type')::public.price_type,
    coalesce((p_quotation->>'discount_amount')::numeric, 0),
    coalesce((p_quotation->>'tax_amount')::numeric, 0),
    coalesce((p_quotation->>'subtotal')::numeric, 0),
    coalesce((p_quotation->>'total')::numeric, 0),
    coalesce(nullif(p_quotation->>'currency',''), 'KWD'),
    coalesce((p_quotation->>'status')::public.quote_status, 'draft'::public.quote_status),
    p_quotation->>'notes'
  )
  returning id, reference into v_quote_id, v_quote_reference;

  insert into public.quotation_items (
    quotation_id, line_no, product_id, product_name, sku, quantity, unit,
    unit_price, applied_price_type, is_manual_price, discount_amount, line_total, notes
  )
  select
    v_quote_id, x.line_no, x.product_id, x.product_name, x.sku, x.quantity, x.unit,
    x.unit_price, x.applied_price_type::public.price_type, x.is_manual_price,
    x.discount_amount, x.line_total, x.notes
  from jsonb_to_recordset(coalesce(p_quotation_items, '[]'::jsonb)) as x(
    line_no integer,
    product_id uuid,
    product_name text,
    sku text,
    quantity numeric,
    unit text,
    unit_price numeric,
    applied_price_type text,
    is_manual_price boolean,
    discount_amount numeric,
    line_total numeric,
    notes text
  );

  update public.orders
     set status = 'priced'::public.order_status,
         updated_at = now()
   where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_reference', v_order_reference,
    'quotation_id', v_quote_id,
    'quotation_reference', v_quote_reference,
    'status', 'priced'
  );
end;
$$;

revoke all on function public.save_order_with_quotation(uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_order_with_quotation(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
