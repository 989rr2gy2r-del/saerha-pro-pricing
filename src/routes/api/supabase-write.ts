import { createFileRoute } from "@tanstack/react-router";
import { authenticateStaffRequest } from "@/lib/server-auth";

const ALLOWED_TABLES = new Set(["products", "customers", "prices"]);
const ALLOWED_ACTIONS = new Set(["insert", "update", "delete", "upsert"]);
const ALLOWED_FILTER_COLUMNS = new Set(["id", "sku", "customer_id", "product_id", "price_type"]);

type Filter = { column?: unknown; value?: unknown };

export const Route = createFileRoute("/api/supabase-write")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateStaffRequest(request);
        if ("error" in auth) {
          return Response.json({ success: false, error: auth.error }, { status: auth.status });
        }

        try {
          const body = await request.json();
          const table = String(body?.table ?? "");
          const action = String(body?.action ?? "");
          const payload = body?.payload;
          const filters = Array.isArray(body?.filters) ? (body.filters as Filter[]) : [];
          const select = typeof body?.select === "string" ? body.select : "*";

          if (!ALLOWED_TABLES.has(table) || !ALLOWED_ACTIONS.has(action)) {
            return Response.json({ success: false, error: "Unsupported write operation" }, { status: 400 });
          }

          if (payload !== undefined && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
            return Response.json({ success: false, error: "Invalid payload" }, { status: 400 });
          }

          for (const filter of filters) {
            const column = String(filter?.column ?? "");
            if (!ALLOWED_FILTER_COLUMNS.has(column)) {
              return Response.json({ success: false, error: "Unsupported filter" }, { status: 400 });
            }
          }

          const query = auth.supabase.from(table as never) as any;

          const applyFilters = (builder: any) => {
            let result = builder;
            for (const filter of filters) {
              if (filter?.column && filter.value !== undefined) {
                result = result.eq(String(filter.column), filter.value);
              }
            }
            return result;
          };

          if (action === "insert") {
            const result = await query.insert(payload).select(select).single();
            if (result.error) throw new Error(result.error.message);
            return Response.json({ success: true, data: result.data });
          }

          if (action === "update") {
            if (!filters.length) {
              return Response.json({ success: false, error: "Update requires a filter" }, { status: 400 });
            }
            const result = await applyFilters(query.update(payload)).select(select).single();
            if (result.error) throw new Error(result.error.message);
            return Response.json({ success: true, data: result.data });
          }

          if (action === "delete") {
            if (!filters.length) {
              return Response.json({ success: false, error: "Delete requires a filter" }, { status: 400 });
            }
            const result = await applyFilters(query.delete()).select(select).single();
            if (result.error) throw new Error(result.error.message);
            return Response.json({ success: true, data: result.data });
          }

          if (!filters.length) {
            return Response.json({ success: false, error: "Upsert requires a filter" }, { status: 400 });
          }

          const existing = await applyFilters(query.select("*")).maybeSingle();
          if (existing.error) throw new Error(existing.error.message);

          if (existing.data) {
            const id = (existing.data as { id?: string }).id;
            if (!id) throw new Error("Existing record has no id");
            const result = await query
              .update({ ...payload, updated_at: new Date().toISOString() })
              .eq("id", id)
              .select(select)
              .single();
            if (result.error) throw new Error(result.error.message);
            return Response.json({ success: true, data: result.data });
          }

          const result = await query.insert(payload).select(select).single();
          if (result.error) throw new Error(result.error.message);
          return Response.json({ success: true, data: result.data });
        } catch (error) {
          console.error("supabase-write failed", error instanceof Error ? error.name : "unknown");
          return Response.json({ success: false, error: "تعذر تنفيذ العملية." }, { status: 500 });
        }
      },
    },
  },
});
