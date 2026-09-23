import { createFileRoute } from "@tanstack/react-router";

import { authenticateStaffRequest } from "@/lib/server-auth";
import { convertQuantity } from "@/lib/pricing/unit-converter";

const PRODUCT_SELECT = "id, unit";
const PRICE_SELECT =
  "id, product_id, price_type, customer_id, amount, currency, source, source_price_type, valid_from, valid_to";

type PriceRow = {
  id: string;
  product_id: string;
  price_type: "retail" | "reseller" | "customer_special" | "manual_quote";
  customer_id: string | null;
  amount: number | string;
  currency: string;
  source: string | null;
  source_price_type: string | null;
  valid_from: string;
  valid_to: string | null;
};

type CustomerRow = {
  id: string;
  customer_type: "retail" | "wholesale" | "contractor" | "government";
};

function isActive(row: PriceRow, today: string) {
  return row.valid_from <= today && (!row.valid_to || row.valid_to > today);
}

function choosePrice(
  rows: PriceRow[],
  customerId: string,
  customerType: CustomerRow["customer_type"],
  today: string,
) {
  const active = rows.filter((row) => isActive(row, today) && Number(row.amount) >= 0);
  const customerSpecific = active
    .filter((row) => row.price_type === "customer_special" && row.customer_id === customerId)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];

  const preferredType =
    customerType === "wholesale" || customerType === "contractor" || customerType === "government"
      ? "reseller"
      : "retail";

  const preferred = active
    .filter((row) => row.price_type === preferredType && !row.customer_id)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];

  const retail = active
    .filter((row) => row.price_type === "retail" && !row.customer_id)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];

  const reseller = active
    .filter((row) => row.price_type === "reseller" && !row.customer_id)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];

  const chosen = customerSpecific ?? preferred ?? retail ?? reseller ?? null;
  if (!chosen) return null;

  return {
    ...chosen,
    amount: Number(chosen.amount),
    selection:
      chosen.id === customerSpecific?.id
        ? "customer_special"
        : chosen.price_type === preferredType
          ? preferredType
          : chosen.price_type,
  };
}

export const Route = createFileRoute("/api/price-order" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateStaffRequest(request);
        if ("error" in auth) {
          return Response.json({ success: false, error: auth.error }, { status: auth.status });
        }

        try {
          const body = await request.json();
          const customerId = typeof body?.customerId === "string" ? body.customerId : "";
          const items = Array.isArray(body?.items) ? body.items : [];

          if (!customerId || items.length === 0 || items.length > 200) {
            return Response.json(
              { success: false, error: "بيانات التسعير غير مكتملة." },
              { status: 400 },
            );
          }

          const { data: customer, error: customerError } = await (auth.supabase as any)
            .from("customers")
            .select("id, customer_type")
            .eq("id", customerId)
            .maybeSingle();

          if (customerError) throw customerError;
          if (!customer) {
            return Response.json(
              { success: false, error: "العميل غير موجود." },
              { status: 404 },
            );
          }

          const productIds = Array.from(
            new Set(
              items
                .map((item) => (typeof item?.productId === "string" ? item.productId : ""))
                .filter(Boolean),
            ),
          );

          if (productIds.length === 0) {
            return Response.json(
              { success: false, error: "لا توجد منتجات صالحة للتسعير." },
              { status: 400 },
            );
          }

          const [{ data: products, error: productsError }, { data: prices, error: pricesError }, { data: conversions, error: conversionsError }] =
            await Promise.all([
              ((auth.supabase as any) as any).from("products").select(PRODUCT_SELECT).in("id", productIds),
              (auth.supabase as any)
                .from("prices")
                .select(PRICE_SELECT)
                .in("product_id", productIds)
                .order("valid_from", { ascending: false }),
              (auth.supabase as any)
                .from("unit_conversions")
                .select("from_unit, to_unit, multiplier, product_id")
                .or("product_id.is.null,product_id.in.(" + productIds.join(",") + ")"),
            ]);

          if (productsError) throw productsError;
          if (pricesError) throw pricesError;
          if (conversionsError) throw conversionsError;

          const productUnitById = new Map(
            (products ?? []).map((row) => [row.id, row.unit as string | null]),
          );

          const today = new Date().toISOString().slice(0, 10);
          const rowsByProduct = new Map<string, PriceRow[]>();

          for (const row of (prices ?? []) as PriceRow[]) {
            const list = rowsByProduct.get(row.product_id) ?? [];
            list.push(row);
            rowsByProduct.set(row.product_id, list);
          }

          const results = items.map((item, index) => {
            const productId = typeof item?.productId === "string" ? item.productId : "";
            const requestedUnit = typeof item?.unit === "string" ? item.unit : "";
            const baseUnit = productUnitById.get(productId) ?? null;
            const rawQuantity = Number(item?.quantity ?? 0);
            const conversion = convertQuantity(
              rawQuantity,
              requestedUnit || baseUnit || "",
              String(baseUnit ?? ""),
              (conversions ?? []) as Array<{
                from_unit: string;
                to_unit: string;
                multiplier: number;
                product_id: string | null;
              }>,
              productId,
            );
            const selected = choosePrice(
              rowsByProduct.get(productId) ?? [],
              customerId,
              customer.customer_type,
              today,
            );

            if (!selected) {
              return {
                index,
                productId,
                quantity: rawQuantity,
                requestedUnit,
                baseUnit,
                conversion,
                price: null,
                reason: "لا يوجد سعر فعال لهذا المنتج والعميل.",
              };
            }

            if (conversion.reason && requestedUnit && baseUnit && conversion.quantity === rawQuantity) {
              return {
                index,
                productId,
                quantity: rawQuantity,
                requestedUnit,
                baseUnit,
                conversion,
                price: null,
                reason: conversion.reason,
              };
            }

            return {
              index,
              productId,
              quantity: conversion.quantity,
              requestedUnit,
              baseUnit,
              conversion,
              price: {
                id: selected.id,
                amount: selected.amount,
                currency: selected.currency,
                priceType: selected.price_type,
                customerId: selected.customer_id,
                source: selected.source,
                selection: selected.selection,
              },
            };
          });

          return Response.json({
            success: true,
            customer: {
              id: customer.id,
              customerType: customer.customer_type,
            },
            results,
          });
        } catch (error) {
          console.error(
            "Price-order request failed",
            error instanceof Error ? error.name : "unknown",
          );
          return Response.json(
            { success: false, error: "تعذر حساب الأسعار حاليًا." },
            { status: 500 },
          );
        }
      },
    },
  },
});
