import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

const sb = (authorization: string) =>
  createClient(url, anon, { global: { headers: { Authorization: authorization } } });

function convert(quantity: number, from: string, to: string, rows: any[], productId: string) {
  if (!from || !to || from.trim().toLowerCase() === to.trim().toLowerCase()) {
    return { quantity, reason: "" };
  }
  const norm = (value: string) => value.trim().toLowerCase();
  const direct =
    rows.find((row) => row.product_id === productId && norm(row.from_unit) === norm(from) && norm(row.to_unit) === norm(to)) ??
    rows.find((row) => !row.product_id && norm(row.from_unit) === norm(from) && norm(row.to_unit) === norm(to));

  return direct
    ? { quantity: quantity * Number(direct.multiplier), reason: "" }
    : { quantity, reason: `لا توجد تحويلة من ${from} إلى ${to}` };
}

Deno.serve(async (req) => {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return Response.json({ success: false, error: "غير مصرح." }, { status: 401 });
  }

  try {
    const client = sb(authorization);
    const { data: { user } } = await client.auth.getUser();
    if (!user) return Response.json({ success: false, error: "غير مصرح." }, { status: 401 });

    const { data: role } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!role || !["admin", "sales"].includes(String(role.role))) {
      return Response.json({ success: false, error: "غير مصرح." }, { status: 403 });
    }

    const body = await req.json();
    const customerId = typeof body?.customerId === "string" ? body.customerId : "";
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!customerId || !items.length || items.length > 200) {
      return Response.json({ success: false, error: "بيانات التسعير غير مكتملة." }, { status: 400 });
    }

    const { data: customer, error: customerError } = await client
      .from("customers")
      .select("id, customer_type")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) return Response.json({ success: false, error: "العميل غير موجود." }, { status: 404 });

    const ids = [...new Set(items.map((item: any) => typeof item?.productId === "string" ? item.productId : "").filter(Boolean))];

    const [{ data: products, error: productError }, { data: prices, error: priceError }, { data: conversions, error: conversionError }] =
      await Promise.all([
        client.from("products").select("id,unit").in("id", ids),
        client.from("prices").select("id,product_id,price_type,customer_id,amount,currency,source,valid_from,valid_to").in("product_id", ids).order("valid_from", { ascending: false }),
        client.from("unit_conversions").select("from_unit,to_unit,multiplier,product_id").or(`product_id.is.null,product_id.in.(${ids.join(",")})`),
      ]);

    if (productError) throw productError;
    if (priceError) throw priceError;
    if (conversionError) throw conversionError;

    const unitByProduct = new Map((products ?? []).map((row: any) => [row.id, row.unit]));
    const today = new Date().toISOString().slice(0, 10);
    const validPrices = (prices ?? []).filter((row: any) =>
      row.valid_from <= today && (!row.valid_to || row.valid_to > today) && Number(row.amount) >= 0
    );
    const preferredType = ["wholesale", "contractor", "government"].includes(String(customer.customer_type))
      ? "reseller"
      : "retail";

    const results = items.map((item: any, index: number) => {
      const productId = String(item?.productId ?? "");
      const quantity = Number(item?.quantity ?? 0);
      const requestedUnit = String(item?.unit ?? "");
      const baseUnit = unitByProduct.get(productId) ?? null;
      const conversion = convert(quantity, requestedUnit || baseUnit || "", baseUnit || "", conversions ?? [], productId);
      const rows = validPrices.filter((row: any) => row.product_id === productId);

      const pick = (type: string, customer: string | null = null) =>
        rows
          .filter((row: any) => row.price_type === type && (customer ? row.customer_id === customer : !row.customer_id))
          .sort((a: any, b: any) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];

      const chosen =
        pick("customer_special", customerId) ??
        pick(preferredType) ??
        pick("retail") ??
        pick("reseller");

      return {
        index,
        productId,
        quantity: conversion.quantity,
        requestedUnit,
        baseUnit,
        conversion,
        price: chosen
          ? {
              id: chosen.id,
              amount: Number(chosen.amount),
              currency: chosen.currency,
              priceType: chosen.price_type,
              customerId: chosen.customer_id,
              source: chosen.source,
              selection: chosen.price_type,
            }
          : null,
        reason: chosen ? undefined : "لا يوجد سعر فعال لهذا المنتج والعميل.",
      };
    });

    return Response.json({
      success: true,
      customer: { id: customer.id, customerType: customer.customer_type },
      results,
    });
  } catch (error) {
    console.error("price-order", error);
    return Response.json({ success: false, error: "تعذر حساب الأسعار حاليًا." }, { status: 500 });
  }
});
