import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { authenticateStaffRequest } from "@/lib/server-auth";

type SingleResult = { data: unknown; error: { message: string } | null };

type TableQuery = {
  maybeSingle: () => Promise<SingleResult>;
  eq: (column: string, value: string | number | boolean | null) => TableQuery;
  select: (columns?: string) => TableQuery;
  single: () => Promise<SingleResult>;
};

type TableRequestBuilder = {
  select: (columns?: string) => TableQuery;
  insert: (payload: Record<string, unknown>) => TableQuery;
  update: (payload: Record<string, unknown>) => TableQuery;
  delete: () => TableQuery;
};

const ALLOWED_TABLES = new Set(["products", "customers", "prices"]);
const ALLOWED_ACTIONS = new Set(["insert", "update", "delete", "upsert"]);

export const Route = createFileRoute("/api/supabase-write")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateStaffRequest(request);
        if (auth instanceof Response) return auth;

        try {
          const body = await request.json();
          const table = String(body?.table ?? "");
          const action = body?.action;
          const payload =
            body?.payload && typeof body.payload === "object" ? body.payload : {};
          const filters = Array.isArray(body?.filters) ? body.filters : [];
          const select = typeof body?.select === "string" ? body.select : undefined;

          if (!table || !action) {
            return Response.json(
              { success: false, error: "table/action required" },
              { status: 400 },
            );
          }

          if (!ALLOWED_TABLES.has(table) || !ALLOWED_ACTIONS.has(action)) {
            return Response.json(
              { success: false, error: "Operation is not available through this endpoint" },
              { status: 403 },
            );
          }

          const tableName = table as keyof Database["public"]["Tables"];
          const tableQuery = auth.supabase.from(tableName) as unknown as TableRequestBuilder;

          if (action === "insert") {
            const result = await tableQuery
              .insert(payload as Record<string, unknown>)
              .select(select ?? "*")
              .single();

            if (result.error) throw new Error(result.error.message);
            return Response.json({ success: true, data: result.data });
          }

          if (action === "update") {
            let updateQuery = tableQuery.update(payload as Record<string, unknown>);

            for (const filter of filters) {
              if (filter?.column && filter?.value !== undefined) {
                updateQuery = updateQuery.eq(
                  String(filter.column),
                  filter.value as string | number | boolean | null,
                );
              }
            }

            const result = await updateQuery.select(select ?? "*").single();
            if (result.error) throw new Error(result.error.message);
            return Response.json({ success: true, data: result.data });
          }

          if (action === "delete") {
            let deleteQuery = tableQuery.delete();

            for (const filter of filters) {
              if (filter?.column && filter?.value !== undefined) {
                deleteQuery = deleteQuery.eq(
                  String(filter.column),
                  filter.value as string | number | boolean | null,
                );
              }
            }

            const result = await deleteQuery.select(select ?? "*").single();
            if (result.error) throw new Error(result.error.message);
            return Response.json({ success: true, data: result.data });
          }

          let matchQuery = tableQuery.select(select ?? "*");

          for (const filter of filters) {
            if (filter?.column && filter?.value !== undefined) {
              matchQuery = matchQuery.eq(
                String(filter.column),
                filter.value as string | number | boolean | null,
              );
            }
          }

          const existing = await matchQuery.maybeSingle();
          if (existing.error) throw new Error(existing.error.message);

          const existingId = (existing.data as { id?: string } | null | undefined)?.id;

          if (existing.data && existingId) {
            const result = await tableQuery
              .update({
                ...payload,
                updated_at: new Date().toISOString(),
              } as Record<string, unknown>)
              .eq("id", existingId)
              .select(select ?? "*")
              .single();

            if (result.error) throw new Error(result.error.message);
            return Response.json({ success: true, data: result.data });
          }

          const insertResult = await tableQuery
            .insert(payload as Record<string, unknown>)
            .select(select ?? "*")
            .single();

          if (insertResult.error) throw new Error(insertResult.error.message);
          return Response.json({ success: true, data: insertResult.data });
        } catch (error) {
          console.error(
            "Supabase write proxy failed",
            error instanceof Error ? error.name : "unknown",
          );
          return Response.json(
            { success: false, error: "تعذر تنفيذ العملية." },
            { status: 500 },
          );
        }
      },
    },
  },
});
