// Shared TanStack Start Vite configuration.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

const mode = process.env["NODE_ENV"] ?? "development";
const env = loadEnv(mode, process.cwd(), "");

if (env["GEMINI_API_KEY"] && !process.env["GEMINI_API_KEY"]) {
  process.env["GEMINI_API_KEY"] = env["GEMINI_API_KEY"].trim().replace(/^['\"]|['\"]$/g, "");
}

const supabaseUrl =
  env["VITE_SUPABASE_URL"] || env["SUPABASE_URL"] ||
  process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];

const supabasePublishableKey =
  env["VITE_SUPABASE_PUBLISHABLE_KEY"] || env["SUPABASE_PUBLISHABLE_KEY"] ||
  env["VITE_SUPABASE_ANON_KEY"] || env["SUPABASE_ANON_KEY"] ||
  env["VITE_SUPABASE_KEY"] || env["SUPABASE_KEY"] ||
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["VITE_SUPABASE_ANON_KEY"] || process.env["SUPABASE_ANON_KEY"] ||
  process.env["VITE_SUPABASE_KEY"] || process.env["SUPABASE_KEY"];

const supabaseClientEnv: Record<string, string> = {};
if (supabaseUrl) supabaseClientEnv["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(supabaseUrl);
if (supabasePublishableKey) {
  supabaseClientEnv["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] = JSON.stringify(supabasePublishableKey);
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    // GitHub Pages is static. Emit the browser-first application shell as
    // index.html so the project URL has a real entry point.
    spa: {
      enabled: true,
      prerender: {
        enabled: true,
        outputPath: "/index.html",
        crawlLinks: false,
        failOnError: true,
      },
    },
  },
  vite: {
    base: process.env["GITHUB_ACTIONS"] === "true" ? "/saerha-pro-pricing/" : "/",
    define: supabaseClientEnv,
  },
});
