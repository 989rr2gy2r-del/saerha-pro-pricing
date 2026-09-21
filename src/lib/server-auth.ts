import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export type AuthenticatedServerClient = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export async function authenticateStaffRequest(
  request: Request,
): Promise<AuthenticatedServerClient | Response> {
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");

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

  const supabaseUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const supabasePublishableKey =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !supabasePublishableKey) {
    return Response.json(
      { success: false, error: "Supabase is not configured on the server" },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: {
      fetch: createSupabaseFetch(supabasePublishableKey),
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
  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string" || !userId) {
    return Response.json(
      { success: false, error: "Unauthorized: invalid user token" },
      { status: 401 },
    );
  }

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "sales"])
    .limit(1);

  if (rolesError) {
    console.error("Staff authorization lookup failed", rolesError.message);
    return Response.json({ success: false, error: "Authorization check failed" }, { status: 500 });
  }

  if (!roles?.length) {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  return { supabase, userId };
}
