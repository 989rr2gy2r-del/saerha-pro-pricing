// The project uses the shared TanStack Start Vite configuration.
// We keep the custom server entry for the full runtime and enable static
// prerendering so the GitHub Pages smoke-test site has a real index.html.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

const mode = process.env["NODE_ENV"] ?? "development";
const env = loadEnv(mode, process.cwd(), "");

if (env["GEMINI_API_KEY"] && !process.env["GEMINI_API_KEY"]) {
  process.env["GEMINI_API_KEY"] = env["GEMINI_API_KEY"].trim().replace(/^['\"]|['\"]$/g, "");
}

const supabaseUrl =
  env["VITE_SUPABASE_URL"] ||
  env["SUPABASE_URL"] ||
  process.env["VITE_SUPABASE_URL"] ||
  process.env["SUPABASE_URL"];

const supabasePublishableKey =
  env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  env["SUPABASE_PUBLISHABLE_KEY"] ||
  env["VITE_SUPABASE_ANON_KEY"] ||
  env["SUPABASE_ANON_KEY"] ||
  env["VITE_SUPABASE_KEY"] ||
  env["SUPABASE_KEY"] ||
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["VITE_SUPABASE_ANON_KEY"] ||
  process.env["SUPABASE_ANON_KEY"] ||
  process.env["VITE_SUPABASE_KEY"] ||
  process.env["SUPABASE_KEY"];

const supabaseClientEnv: Record<string, string> = {};

if (supabaseUrl) {
  supabaseClientEnv["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(supabaseUrl);
}

if (supabasePublishableKey) {
  supabaseClientEnv["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] =
    JSON.stringify(supabasePublishableKey);
}

export default defineConfig({
  tanstackStart: {
    // Use our server wrapper for the real server/worker deployment.
    server: { entry: "server" },
    // GitHub Pages cannot execute the server bundle, so emit static HTML
    // for the browser-first shell and login route as a Pages smoke test.
    prerender: {
      enabled: true,
      autoSubfolderIndex: true,
      autoStaticPathsDiscovery: false,
      crawlLinks: false,
      failOnError: true,
    },
    pages: [
      { path: "/", prerender: { enabled: true, outputPath: "/index.html" } },
      { path: "/login", prerender: { enabled: true, outputPath: "/login/index.html" } },
    ],
  },
  vite: {
    base: process.env.GITHUB_ACTIONS === "true" ? "/saerha-pro-pricing/" : "/",
    define: supabaseClientEnv,
  },
});
