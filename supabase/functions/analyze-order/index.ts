import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELS = [
  // Fast/high-throughput model first, then two independent fallback pools.
  { id: "gemini-3.5-flash-lite", timeoutMs: 20000 },
  { id: "gemini-3.6-flash", timeoutMs: 25000 },
  { id: "gemini-3.8-flash", timeoutMs: 25000 },
];

const MAX_IMAGE_BASE64 = 12_000_000;

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
        normalized_description_ar:
          typeof row.normalized_description_ar === "string"
            ? row.normalized_description_ar.trim()
            : typeof row.arabic_name === "string"
              ? row.arabic_name.trim()
              : "",
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
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
  // Gemini may return a JSON object wrapped in markdown or with a stray BOM.
  text = text.replace(/^\\uFEFF/, "").trim();
  return JSON.parse(text);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(message: string) {
  return /HTTP (408|429|500|502|503|504)|UNAVAILABLE|RESOURCE_EXHAUSTED|deadline|aborted|signal has been aborted/i.test(message);
}

async function callGemini(
  apiKey: string,
  model: string,
  timeoutMs: number,
  mimeType: string,
  base64Data: string,
  prompt: string,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
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
            responseJsonSchema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string" },
                      normalized_description_ar: { type: "string" },
                      quantity: { type: ["number", "null"] },
                      unit: { type: "string" },
                      raw_text: { type: "string" },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                      notes: { type: "string" },
                    },
                    required: ["description", "normalized_description_ar", "quantity", "unit", "raw_text", "confidence", "notes"],
                  },
                },
                notes: { type: "string" },
              },
              required: ["items", "notes"],
            },
            thinkingConfig: { thinkingLevel: "low" },
            maxOutputTokens: 4096,
          },
        }),
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      const detail = responseText.slice(0, 500).replace(/\s+/g, " ");
      throw new Error(`Gemini ${model} HTTP ${response.status}: ${detail}`);
    }

    return normalize(extractText(JSON.parse(responseText)));
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

    const apiKey =
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_API_KEY") ||
      Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
    if (!apiKey) {
      return json(
        { success: false, error: "مفتاح Gemini غير موجود في إعدادات الخادم (GEMINI_API_KEY)." },
        503,
      );
    }

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

    const prompt = `أنت محرك OCR وفهم طلبيات احترافي لنظام "سعّرها" لمواد الكهرباء والصحية.

اقرأ الطلبية سطرًا سطرًا من أعلى إلى أسفل، ولا تدمج سطرين مختلفين.
لكل سطر أرجع:
1) raw_text: النص الذي استطعت قراءته من الصورة كما هو قدر الإمكان.
2) description: الاسم الإنجليزي/العربي المقروء بعد تصحيح أخطاء OCR الواضحة فقط.
3) normalized_description_ar: الاسم التجاري المفهوم بالعربية، لأن هذا الحقل سيُستخدم لمطابقة قاعدة المنتجات.
4) quantity: الكمية الرقمية الموجودة في نفس السطر فقط.
5) unit: الوحدة المرتبطة بالكمية في نفس السطر مثل حبة، قطعة، رول، كرتون، دزينة، متر.
6) confidence: ثقتك في قراءة السطر من 0 إلى 1.

قاعدة الكمية مهمة جدًا:
- اقرأ الكمية من الطلبية كما هي مكتوبة، حتى لو كانت في بداية السطر أو نهايته أو بجانب الوحدة.
- لا تجعل quantity=0 إذا كانت هناك كمية مقروءة في السطر.
- لا تعتبر رقم الكود/SKU أو المقاس أو الأمبير أو الجهد كمية. مثال: "1200 PVC pipe 12 ROLL" الكمية هنا 12 والوحدة رول، وليس 1200.
- إذا ظهر رقم مع وحدة واضحة مثل "4 رول" أو "12 حبة" أو "3 كرتون" فهو quantity.
- إذا كانت الكمية غير واضحة فعلًا فقط عندها استخدم 0 وضع ذلك في notes.
7) notes: أي كلمة أو جزء غير مؤكد.

قواعد الفهم والترجمة:
- إذا كان الطلب بالإنجليزية، افهمه ثم ترجم الوصف إلى عربية تجارية واضحة في normalized_description_ar.
- لا تترجم أسماء الماركات أو الموديلات غير المؤكدة؛ احتفظ بها كما ظهرت.
- افهم الاختصارات والأخطاء الإملائية الواضحة في سياق مواد الكهرباء والصحية، مثل:
  Fuse = فيوز، Elbow = كوع، Tee = تي، Adapter = أدبتر، Coupling = وصلة/كوبلن، Male Adapter = أدبتر بسن خارجي، Female Adapter = أدبتر بسن داخلي، PVC = PVC، GI = حديد مجلفن.
- حافظ على المقاسات والأرقام والألوان والأمبير والجهد والماركة والموديل.
- "3 dozen" تعني quantity=3 وunit="دزينة"؛ لا تحولها إلى 36.
- "1 Roll" تعني quantity=1 وunit="رول".
- "pcs" تعني unit="قطعة".
- مهم جدًا: نفّذ القراءة أولًا ثم الفهم. لا تجعل الترجمة تغيّر النص المقروء.
- raw_text يجب أن يكون أقرب نسخة ممكنة لما هو مكتوب في الصورة، وليس تخمينًا لمعناه.
- description يجب أن يعكس النص المقروء بعد تصحيح OCR واضح فقط. إذا كانت الكلمة مثل "petan" أو "melbus" غير مؤكدة، لا تستبدلها بكلمة أخرى.
- normalized_description_ar لا يجوز أن يكون نسخة عربية مخترعة من نص غير مفهوم. املأه فقط عندما يكون معنى الصنف واضحًا من النص والمقاس والسياق. مثال: "PVC capling - 20mm" => "وصلة PVC - 20 ملم". أما "petan - 2" إذا لم يتضح المقصود => normalized_description_ar="" وnotes="الكلمة غير واضحة".
- ممنوع تحويل أي كلمة غير مفهومة إلى كلمة عربية لمجرد أنها تشبهها صوتيًا. وممنوع إضافة "مسمار" أو "كام" أو أي اسم منتج غير موجود في النص.
- إذا كانت كلمة غير واضحة فعلًا، لا تخترع لها معنى. اتركها في description كما قرأتها إن أمكن، وضع "غير واضح" في notes، ولا تبنِ عليها SKU.
- إذا كان السطر كله غير مقروء، اجعل description وnormalized_description_ar فارغين، واحتفظ بما أمكن في raw_text، confidence منخفضًا.
- لا تخترع SKU أو منتجًا أو سعرًا.
- لا تُرجع رموزًا أو حروفًا عشوائية على أنها اسم منتج.
- قبل إخراج JSON راجع كل سطر: هل normalized_description_ar ترجمة حقيقية لما قرأته؟ إذا لا، امسحه واتركه فارغًا.
- أرجع JSON فقط.

الشكل المطلوب:
{"items":[{"description":"","normalized_description_ar":"","quantity":0,"unit":"","raw_text":"","confidence":0,"notes":""}],"notes":""}
${textInput ? "\nالمدخل النصي:\n" + textInput : ""}`;

    const attempts: Array<{ model: string; error: string; upstreamStatus: number | null }> = [];
    let lastResult: ReturnType<typeof normalize> | null = null;

    for (let index = 0; index < MODELS.length; index += 1) {
      const model = MODELS[index];
      const modelPrompt =
        index === 0
          ? prompt
          : prompt + "\n\nهذه مراجعة ثانية بعد تعذر المحاولة الأولى. لا تخترع أي معلومة؛ ركز على قراءة كل الصفوف والكمية والوحدة بدقة.";

      // 503/429 are transient capacity errors. Retry once with jitter before
      // switching model pools instead of immediately falling back to weak OCR.
      for (let retry = 0; retry < 2; retry += 1) {
        try {
          if (retry > 0) {
            await sleep(1200 + Math.floor(Math.random() * 900));
          }

          const result = await callGemini(
            apiKey,
            model.id,
            model.timeoutMs,
            mimeType,
            base64Data,
            modelPrompt,
          );
          lastResult = result;

          const confidences = result.items.map((item) => item.confidence).filter((value) => value > 0);
          const averageConfidence = confidences.length
            ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
            : 0;

          if (result.items.length > 0 && averageConfidence >= 0.78) {
            return json({ success: true, result });
          }

          if (result.items.length > 0 && index === MODELS.length - 1) {
            return json({
              success: true,
              result,
              warning: "تمت القراءة لكن الثقة منخفضة؛ راجع السطور قبل الاعتماد.",
            });
          }

          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          const statusMatch = message.match(/HTTP (\d{3})/);
          const upstreamStatus = statusMatch ? Number(statusMatch[1]) : null;
          attempts.push({
            model: model.id,
            error: message.slice(0, 800),
            upstreamStatus,
          });
          console.warn("Gemini " + model.id + " failed", message);

          if (!isRetryableGeminiError(message) || retry === 1) break;
        }
      }
    }
    return json({
      success: false,
      error: "تعذر تشغيل محرك القراءة الذكي بعد محاولتين. سيتم تشغيل القراءة الاحتياطية.",
      code: attempts.some((attempt) => /AbortError|aborted|signal has been aborted/i.test(attempt.error))
        ? "GEMINI_TIMEOUT"
        : "GEMINI_FAILED",
      diagnostic: {
        attempts,
        hadResult: Boolean(lastResult?.items?.length),
      },
    }, 503);
  } catch (error) {
    console.error("analyze-order", error);
    return json({ success: false, error: "حدث خطأ أثناء قراءة الطلبية." }, 500);
  }
});
