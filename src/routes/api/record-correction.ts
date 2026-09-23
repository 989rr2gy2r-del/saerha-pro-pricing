import { createFileRoute } from "@tanstack/react-router";

import { authenticateStaffRequest } from "@/lib/server-auth";

export const Route = createFileRoute("/api/record-correction" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateStaffRequest(request);
        if ("error" in auth) {
          return Response.json({ success: false, error: auth.error }, { status: auth.status });
        }

        try {
          const body = await request.json();
          const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";
          const normalizedText =
            typeof body?.normalizedText === "string" ? body.normalizedText.trim() : "";
          const productId = typeof body?.productId === "string" ? body.productId : null;
          const orderItemId = typeof body?.orderItemId === "string" ? body.orderItemId : null;
          const action = typeof body?.action === "string" ? body.action : "";
          const addAlias = body?.addAlias === true;

          if (!rawText || !normalizedText || !productId) {
            return Response.json(
              { success: false, error: "بيانات التصحيح غير مكتملة." },
              { status: 400 },
            );
          }

          if (!["accepted", "rejected", "corrected", "alias_added"].includes(action)) {
            return Response.json({ success: false, error: "نوع التصحيح غير صالح." }, { status: 400 });
          }

          const { error: correctionError } = await (auth.supabase as any).from("ai_corrections").insert({
            raw_text: rawText,
            normalized_text: normalizedText,
            product_id: productId,
            order_item_id: orderItemId,
            action,
            created_by: auth.userId,
          });

          if (correctionError) throw correctionError;

          if (addAlias) {
            const { data: existing } = await auth.supabase
              .from("product_aliases")
              .select("id")
              .eq("product_id", productId)
              .eq("normalized_alias", normalizedText)
              .maybeSingle();

            if (!existing) {
              const { error: aliasError } = await (auth.supabase as any).from("product_aliases").insert({
                product_id: productId,
                alias: rawText,
                normalized_alias: normalizedText,
                lang: "mixed",
                source: "learned",
              });
              if (aliasError) throw aliasError;
            }
          }

          return Response.json({ success: true });
        } catch (error) {
          console.error(
            "record-correction failed",
            error instanceof Error ? error.name : "unknown",
          );
          return Response.json(
            { success: false, error: "تعذر حفظ تصحيح المطابقة." },
            { status: 500 },
          );
        }
      },
    },
  },
});
