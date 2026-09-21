// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

const mode = process.env["NODE_ENV"] ?? "development";
const env = loadEnv(mode, process.cwd(), "");

if (env["GEMINI_API_KEY"] && !process.env["GEMINI_API_KEY"]) {
  process.env["GEMINI_API_KEY"] = env["GEMINI_API_KEY"].trim().replace(/^['"]|['"]$/g, "");
}

// Lovable Cloud may provide Supabase as server-side environment variables
// (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY) while the browser bundle needs
// the Vite-prefixed equivalents. Bridge them at build time without storing
// credentials in Git.
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
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  vite: {
    define: supabaseClientEnv,
  },
});
