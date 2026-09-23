import { createFileRoute } from "@tanstack/react-router";
import { authenticateStaffRequest } from "@/lib/server-auth";
import { rankProductMatches } from "@/lib/matching/product-matcher";

type InputItem = { id?: string; description?: string; raw_text?: string; quantity?: number; unit?: string };

export const Route = createFileRoute("/api/match-order" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateStaffRequest(request);
        if ("error" in auth) return Response.json({ success: false, error: auth.error }, { status: auth.status });

        try {
          const body = await request.json();
          const items = Array.isArray(body?.items) ? body.items.slice(0, 200) as InputItem[] : [];
          if (!items.length) return Response.json({ success: false, error: "لا توجد بنود للمطابقة." }, { status: 400 });

          const [productsResult, aliasesResult, correctionsResult] = await Promise.all([
            ((auth.supabase as any) as any).from("products").select(
              "id, sku, name_ar, name_en, short_name, brand, model, size, unit",
            ).eq("status", "active").limit(10000),
            ((auth.supabase as any) as any).from("product_aliases").select("product_id, alias, normalized_alias").limit(20000),
            (auth.supabase as any)
              .from("ai_corrections")
              .select("product_id, raw_text, normalized_text, action")
              .in("action", ["accepted", "corrected", "alias_added"])
              .limit(20000),
          ]);

          if (productsResult.error) throw new Error(productsResult.error.message);
          if (aliasesResult.error) throw new Error(aliasesResult.error.message);
          if (correctionsResult.error) throw new Error(correctionsResult.error.message);

          const products = productsResult.data ?? [];
          const aliases = [
            ...(aliasesResult.data ?? []),
            ...(correctionsResult.data ?? []).map((row) => ({
              product_id: row.product_id,
              alias: row.raw_text,
              normalized_alias: row.normalized_text,
            })),
          ];

          const results = items.map((item, index) => {
            const text = String(item.description ?? item.raw_text ?? "").trim();
            const candidates = rankProductMatches(
              text,
              products,
              aliases,
              (product) => product.id,
            );
            const best = candidates[0] ?? null;
            return {
              index,
              id: item.id ?? String(index),
              description: item.description ?? "",
              quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
              unit: item.unit ?? "",
              best,
              candidates,
              requiresReview: !best || best.status !== "HIGH_CONFIDENCE" || (candidates[1] && best.score - candidates[1].score < 0.08),
            };
          });

          return Response.json({ success: true, results });
        } catch (error) {
          console.error("match-order failed", error instanceof Error ? error.name : "unknown");
          return Response.json({ success: false, error: "تعذر مطابقة الأصناف حاليًا." }, { status: 500 });
        }
      },
    },
  },
});
