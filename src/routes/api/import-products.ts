import { createFileRoute } from "@tanstack/react-router";
import { authenticateStaffRequest } from "@/lib/server-auth";

const normalizeImportString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const normalizePrice = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;

  const raw = String(value).trim();
  const normalized = raw
    .replace(/٬/g, "")
    .replace(/\u0660/g, "0")
    .replace(/\u0661/g, "1")
    .replace(/\u0662/g, "2")
    .replace(/\u0663/g, "3")
    .replace(/\u0664/g, "4")
    .replace(/\u0665/g, "5")
    .replace(/\u0666/g, "6")
    .replace(/\u0667/g, "7")
    .replace(/\u0668/g, "8")
    .replace(/\u0669/g, "9")
    .replace(/[^0-9.-]/g, "")
    .replace(/(?!^)-/g, "")
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "");

  if (!normalized || normalized === "-" || normalized === ".") return null;
  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) && asNumber >= 0 ? asNumber : null;
};

export const Route = createFileRoute("/api/import-products")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateStaffRequest(request);
        if (auth instanceof Response) return auth;

        try {
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > 8 * 1024 * 1024) {
            return Response.json(
              { success: false, error: "حجم ملف الاستيراد أكبر من الحد المسموح." },
              { status: 413 },
            );
          }

          const body = await request.json();
          const rows = Array.isArray(body?.rows) ? body.rows : [];

          if (rows.length > 5000) {
            return Response.json(
              {
                success: false,
                error: "الاستيراد الواحد محدود بـ 5000 صف حاليًا. قسّم الملف إلى دفعات.",
              },
              { status: 413 },
            );
          }

          const supabase = auth.supabase;
          const summary = { new: 0, updated: 0, priceChanged: 0, duplicate: 0, error: 0 };
          const seen = new Set<string>();

          for (const row of rows) {
            const sku = normalizeImportString(row?.sku || row?.nameAr || row?.nameEn)
              .replace(/\s+/g, " ")
              .trim();
            const nameAr = normalizeImportString(row?.nameAr || row?.nameEn);
            const nameEn = normalizeImportString(row?.nameEn || row?.nameAr);

            if (!sku || (!nameAr && !nameEn)) {
              summary.error += 1;
              continue;
            }

            const key = sku.toLowerCase();
            if (seen.has(key)) {
              summary.duplicate += 1;
              continue;
            }
            seen.add(key);

            const existing = await supabase
              .from("products")
              .select("id")
              .eq("sku", sku)
              .maybeSingle();

            if (existing.error) throw new Error(existing.error.message);

            let productId = existing.data?.id;

            if (existing.data) {
              const updateResult = await supabase
                .from("products")
                .update({
                  name_ar: normalizeImportString(row?.nameAr || nameAr || nameEn),
                  name_en: nameEn || "",
                  short_name: normalizeImportString(
                    row?.shortName || row?.nameAr || row?.nameEn || "",
                  ),
                  brand: normalizeImportString(row?.brand || ""),
                  category_main: normalizeImportString(row?.category1 || ""),
                  category_sub: normalizeImportString(row?.category2 || ""),
                  category_third: normalizeImportString(row?.category3 || ""),
                  product_group: normalizeImportString(row?.group || ""),
                  model: normalizeImportString(row?.model || ""),
                  size: normalizeImportString(row?.size || ""),
                  color: normalizeImportString(row?.color || ""),
                  description: normalizeImportString(row?.description || ""),
                  unit: normalizeImportString(row?.unit || "حبة"),
                  status: row?.status === "inactive" ? "inactive" : "active",
                })
                .eq("id", existing.data.id)
                .select("id")
                .single();

              if (updateResult.error) throw new Error(updateResult.error.message);
              productId = updateResult.data.id;
              summary.updated += 1;
            } else {
              const insertResult = await supabase
                .from("products")
                .insert({
                  sku,
                  name_ar: nameAr || nameEn || "منتج",
                  name_en: nameEn || "",
                  short_name: normalizeImportString(
                    row?.shortName || row?.nameAr || row?.nameEn || "",
                  ),
                  brand: normalizeImportString(row?.brand || ""),
                  category_main: normalizeImportString(row?.category1 || ""),
                  category_sub: normalizeImportString(row?.category2 || ""),
                  category_third: normalizeImportString(row?.category3 || ""),
                  product_group: normalizeImportString(row?.group || ""),
                  model: normalizeImportString(row?.model || ""),
                  size: normalizeImportString(row?.size || ""),
                  color: normalizeImportString(row?.color || ""),
                  description: normalizeImportString(row?.description || ""),
                  unit: normalizeImportString(row?.unit || "حبة"),
                  status: row?.status === "inactive" ? "inactive" : "active",
                })
                .select("id")
                .single();

              if (insertResult.error) throw new Error(insertResult.error.message);
              productId = insertResult.data.id;
              summary.new += 1;
            }

            const prices: Array<{
              type: "retail" | "reseller" | "customer_special";
              value: unknown;
              customerName?: string | null;
            }> = [
              { type: "retail", value: row?.retailPrice },
              { type: "reseller", value: row?.resellerPrice },
              {
                type: "customer_special",
                value: row?.customerSpecialPrice,
                customerName: row?.customerName ?? null,
              },
            ];

            for (const priceCheck of prices) {
              const numericValue = normalizePrice(priceCheck.value);
              if (numericValue === null) continue;

              if (priceCheck.type === "customer_special") {
                const customerName = normalizeImportString(priceCheck.customerName || "");
                if (!customerName) continue;

                const customer = await supabase
                  .from("customers")
                  .select("id")
                  .ilike("name", customerName)
                  .limit(2);

                if (customer.error) throw new Error(customer.error.message);
                if (!customer.data?.length) continue;
                if (customer.data.length > 1) {
                  summary.error += 1;
                  continue;
                }

                const customerId = customer.data[0].id;
                const existingPrice = await supabase
                  .from("prices")
                  .select("id, amount")
                  .eq("product_id", productId)
                  .eq("price_type", priceCheck.type)
                  .eq("customer_id", customerId)
                  .maybeSingle();

                if (existingPrice.error) throw new Error(existingPrice.error.message);

                if (
                  existingPrice.data &&
                  Math.abs(Number(existingPrice.data.amount) - numericValue) > 0.0001
                ) {
                  const result = await supabase
                    .from("prices")
                    .update({
                      amount: numericValue,
                      currency: normalizeImportString(row?.currency || "KWD") || "KWD",
                      source: "excel_import",
                      valid_from: new Date().toISOString(),
                    })
                    .eq("id", existingPrice.data.id)
                    .select("id")
                    .single();

                  if (result.error) throw new Error(result.error.message);
                  summary.priceChanged += 1;
                  continue;
                }

                if (!existingPrice.data) {
                  const result = await supabase
                    .from("prices")
                    .insert({
                      product_id: productId,
                      price_type: priceCheck.type,
                      customer_id: customerId,
                      amount: numericValue,
                      currency: normalizeImportString(row?.currency || "KWD") || "KWD",
                      source: "excel_import",
                      valid_from: new Date().toISOString(),
                      is_active: true,
                    })
                    .select("id")
                    .single();

                  if (result.error) throw new Error(result.error.message);
                  summary.priceChanged += 1;
                }
                continue;
              }

              const existingPrice = await supabase
                .from("prices")
                .select("id, amount")
                .eq("product_id", productId)
                .eq("price_type", priceCheck.type)
                .is("customer_id", null)
                .maybeSingle();

              if (existingPrice.error) throw new Error(existingPrice.error.message);

              if (
                existingPrice.data &&
                Math.abs(Number(existingPrice.data.amount) - numericValue) > 0.0001
              ) {
                const result = await supabase
                  .from("prices")
                  .update({
                    amount: numericValue,
                    currency: normalizeImportString(row?.currency || "KWD") || "KWD",
                    source: "excel_import",
                    valid_from: new Date().toISOString(),
                  })
                  .eq("id", existingPrice.data.id)
                  .select("id")
                  .single();

                if (result.error) throw new Error(result.error.message);
                summary.priceChanged += 1;
                continue;
              }

              if (!existingPrice.data) {
                const result = await supabase
                  .from("prices")
                  .insert({
                    product_id: productId,
                    price_type: priceCheck.type,
                    customer_id: null,
                    amount: numericValue,
                    currency: normalizeImportString(row?.currency || "KWD") || "KWD",
                    source: "excel_import",
                    valid_from: new Date().toISOString(),
                    is_active: true,
                  })
                  .select("id")
                  .single();

                if (result.error) throw new Error(result.error.message);
                summary.priceChanged += 1;
              }
            }
          }

          return Response.json({ success: true, summary });
        } catch (error) {
          console.error("Product import failed", error instanceof Error ? error.name : "unknown");
          return Response.json(
            { success: false, error: "تعذر إتمام الاستيراد، يرجى المحاولة مرة أخرى." },
            { status: 500 },
          );
        }
      },
    },
  },
});
