import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
const MODEL_TIMEOUT_MS = 8000;
const MAX_IMAGE_BASE64 = 8_000_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUser(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

function normalize(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const items = Array.isArray(source.items) ? source.items : [];
  return {
    items: items.map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const quantity = Number(row.quantity);
      const confidence = Number(row.confidence);
      return {
        description: typeof row.description === "string" ? row.description.trim() : "",
        quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
        unit: typeof row.unit === "string" ? row.unit.trim() : "",
        raw_text: typeof row.raw_text === "string" ? row.raw_text.trim() : "",
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
        notes: typeof row.notes === "string" ? row.notes.trim() : "",
      };
    }).filter((item) => item.description || item.raw_text),
    notes: typeof source.notes === "string" ? source.notes.trim() : "",
  };
}

function extractText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  let text = parts
    .map((part: any) => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
  text = text.replace(/^\`\`\`json\s*/i, "").replace(/^\`\`\`\s*/i, "").replace(/\s*\`\`\`$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

async function callGemini(
  apiKey: string,
  model: string,
  mimeType: string,
  base64Data: string,
  prompt: string,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              ...(base64Data
                ? [{ inline_data: { mime_type: mimeType, data: base64Data } }]
                : []),
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: 2048,
          },
        }),
      },
    );
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini ${model} HTTP ${response.status}`);
    }
    const result = normalize(extractText(JSON.parse(responseText)));
    return result;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const user = await getUser(req);
    if (!user) return json({ success: false, error: "جلسة الدخول غير صالحة." }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (!role || !["admin", "sales"].includes(String(role.role))) {
      return json({ success: false, error: "غير مصرح لك بتحليل الطلبات." }, 403);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ success: false, error: "محرك القراءة الذكي غير مهيأ على الخادم." }, 503);

    const body = await req.json();
    const image = typeof body?.image === "string" ? body.image : "";
    const textInput = typeof body?.text === "string" ? body.text.trim() : "";
    if (!image && !textInput) return json({ success: false, error: "أرسل صورة أو نصًا." }, 400);

    let mimeType = "";
    let base64Data = "";
    if (image) {
      const match = image.match(/^data:((?:image\/[a-z0-9.+-]+)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) return json({ success: false, error: "صيغة الصورة أو الملف غير مدعومة." }, 400);
      mimeType = match[1];
      base64Data = match[2];
      if (base64Data.length > MAX_IMAGE_BASE64) {
        return json({ success: false, error: "الصورة ما زالت كبيرة للتحليل السريع. جرّب صورة أصغر." }, 413);
      }
    }

    const prompt = `أنت محرك قراءة طلبيات لمحل مواد كهربائية وصحية اسمه "سعّرها".
اقرأ الطلبية بدقة واستخرج الأصناف والبيانات الظاهرة فقط.
أرجع JSON فقط بهذا الشكل:
{"items":[{"description":"اسم الصنف كما ظهر","quantity":0,"unit":"الوحدة","raw_text":"النص الأصلي","confidence":0,"notes":"ملاحظات"}],"notes":"ملاحظات عامة"}
لا تخترع صنفًا أو SKU أو سعرًا. لا تخمن الكمية. احتفظ بالنص الأصلي قدر الإمكان. confidence بين 0 و1.
${textInput ? "\nالمدخل النصي:\n" + textInput : ""}`;

    try {
      // Run the fast and full models in parallel. The first valid response wins,
      // so a slow first model no longer blocks the second one.
      const result = await Promise.any(
        MODELS.map((model) =>
          callGemini(apiKey, model, mimeType, base64Data, prompt).catch((error) => {
            console.warn(
              `Gemini ${model} timed out or failed`,
              error instanceof Error ? error.message : "unknown",
            );
            throw error;
          }),
        ),
      );
      return json({ success: true, result });
    } catch {
      return json(
        { success: false, error: "تعذر تحليل الطلبية بسرعة كافية. ستتم القراءة المحلية تلقائيًا." },
        503,
      );
    }
  } catch (error) {
    console.error("analyze-order", error);
    return json({ success: false, error: "حدث خطأ أثناء قراءة الطلبية." }, 500);
  }
});
