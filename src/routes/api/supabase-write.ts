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

export const Route = createFileRoute("/api/supabase-write")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader =
            request.headers.get("authorization") ?? request.headers.get("Authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return Response.json(
              { success: false, error: "Unauthorized: missing bearer token" },
              { status: 401 },
            );
          }

          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!token) {
            return Response.json(
              { success: false, error: "Unauthorized: empty bearer token" },
              { status: 401 },
            );
          }

          const SUPABASE_URL = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
          const SUPABASE_PUBLISHABLE_KEY =
            process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            return Response.json(
              { success: false, error: "Supabase is not configured on the server" },
              { status: 500 },
            );
          }

          const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: {
              fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              storage: undefined,
            },
          });

          const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
          if (claimsError || !claimsData?.claims?.sub) {
            return Response.json(
              { success: false, error: "Unauthorized: invalid user token" },
              { status: 401 },
            );
          }

          const body = await request.json();
          const table = String(body?.table ?? "");
          const action = body?.action;
          const payload = body?.payload ?? {};
          const filters = Array.isArray(body?.filters) ? body.filters : [];
          const select = body?.select;

          const tableName = table as keyof Database["public"]["Tables"];

          const allowedTables = new Set(["products", "customers", "prices"]);
          if (!table || !action) {
            return Response.json(
              { success: false, error: "table/action required" },
              { status: 400 },
            );
          }

          if (!allowedTables.has(table)) {
            return Response.json(
              { success: false, error: "Table is not available through this endpoint" },
              { status: 403 },
            );
          }

          const tableQuery = auth.supabase.from(tableName) as unknown as TableRequestBuilder;

          if (action === "insert") {
            let insertQuery = tableQuery.insert(payload as Record<string, unknown>);
            if (select) {
              insertQuery = insertQuery.select(select);
            }
            const result = await insertQuery.select(select ?? "*").single();
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

          if (action === "upsert") {
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
            if (existing.data) {
              const result = await tableQuery
                .update({
                  ...payload,
                  updated_at: new Date().toISOString(),
                } as Record<string, unknown>)
                .eq("id", existingId ?? "")
                .select(select ?? "*")
                .single();
              if (result.error) throw new Error(result.error.message);
              return Response.json({ success: true, data: result.data });
            }

            const insertResult = await tableQuery
              .insert({ ...payload } as Record<string, unknown>)
              .select(select ?? "*")
              .single();
            if (insertResult.error) throw new Error(insertResult.error.message);
            return Response.json({ success: true, data: insertResult.data });
          }

          return Response.json({ success: false, error: "Unsupported action" }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Supabase write failed";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
