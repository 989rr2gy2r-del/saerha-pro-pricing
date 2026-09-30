import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELS = [
  // Fast path: use Flash-Lite first for quicker order extraction, with the full Flash model as fallback.
  { id: "gemini-3.5-flash-lite", timeoutMs: 7000, thinkingLevel: "minimal" },
  { id: "gemini-3.8-flash", timeoutMs: 11000, thinkingLevel: "low" },
];

const MAX_IMAGE_BASE64 = 12_000_000;
const MAX_EXPECTED_LINE_GAP = 2;

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
    items: items.map((item, index) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const quantity = Number(row.quantity);
      const confidence = Number(row.confidence);
      return {
        source_line_index: index,
        description: typeof row.description === "string" ? row.description.trim() : "",
        category_ar:
          typeof row.category_ar === "string" ? row.category_ar.trim() : "",
        normalized_description_ar:
          typeof row.normalized_description_ar === "string"
            ? row.normalized_description_ar.trim()
            : typeof row.arabic_name === "string"
              ? row.arabic_name.trim()
              : "",
        color: typeof row.color === "string" ? row.color.trim() : "",
        specification:
          typeof row.specification === "string"
            ? row.specification.trim()
            : typeof row.specs === "string"
              ? row.specs.trim()
              : "",
        brand: typeof row.brand === "string" ? row.brand.trim() : "",
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
  return /HTTP (408|429|5\d{2})|UNAVAILABLE|RESOURCE_EXHAUSTED|deadline|aborted|signal has been aborted|INVALID_JSON|EMPTY_ITEMS/i.test(message);
}

async function callGemini(
  apiKey: string,
  model: string,
  timeoutMs: number,
  mimeType: string,
  base64Data: string,
  prompt: string,
  externalSignal?: AbortSignal,
) {
  const startedAt = Date.now();
  let upstreamStatus: number | null = null;
  let normalizeMs: number | null = null;
  let attemptErrorType: "network" | "http" | "timeout" | "parse" | "empty" | "none" = "none";
  let attemptErrorMessage: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortExternal, { once: true });
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
                      source_line_index: { type: "integer", minimum: 0 },
                      description: { type: "string" },
                      category_ar: { type: "string" },
                      normalized_description_ar: { type: "string" },
                      color: { type: "string" },
                      specification: { type: "string" },
                      brand: { type: "string" },
                      quantity: { type: ["number", "null"] },
                      unit: { type: "string" },
                      raw_text: { type: "string" },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                      notes: { type: "string" },
                    },
                    required: ["source_line_index", "description", "category_ar", "normalized_description_ar", "color", "specification", "brand", "quantity", "unit", "raw_text", "confidence", "notes"],
                  },
                },
                notes: { type: "string" },
              },
              required: ["items", "notes"],
            },
            thinkingConfig: { thinkingLevel: model === "gemini-3.5-flash-lite" ? "minimal" : "low" },
            maxOutputTokens: 2048,
          },
        }),
      },
    ).catch((error) => {
      if (error instanceof TypeError) {
        const message = error instanceof Error ? error.message : "unknown";
        throw new Error(`Gemini ${model} FETCH_NETWORK_ERROR: ${message}`);
      }
      throw error;
    });

    const responseText = await response.text();
    if (!response.ok) {
      upstreamStatus = response.status;
      const detail = responseText.slice(0, 500).replace(/\s+/g, " ");
      throw new Error(`Gemini ${model} HTTP ${response.status}: ${detail}`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      throw new Error(`Gemini ${model} INVALID_JSON: ${message}`);
    }

    let result: ReturnType<typeof normalize>;
    try {
      const normalizeStartedAt = Date.now();
      result = normalize(extractText(payload));
      normalizeMs = Date.now() - normalizeStartedAt;
    } catch (error) {
      if (error instanceof SyntaxError) {
        const message = error instanceof Error ? error.message : "unknown";
        throw new Error(`Gemini ${model} INVALID_JSON: ${message}`);
      }
      throw error;
    }

    if (result.items.length === 0) {
      throw new Error(`Gemini ${model} EMPTY_ITEMS: normalized items list is empty`);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    attemptErrorType =
      message.includes(`Gemini ${model} FETCH_NETWORK_ERROR:`)
        ? "network"
        : /HTTP \d{3}/i.test(message)
          ? "http"
          : (typeof DOMException !== "undefined" &&
              error instanceof DOMException &&
              (error.name === "AbortError" || error.name === "TimeoutError")) ||
            /ETIMEDOUT|timed out|timeout/i.test(message)
            ? "timeout"
            : /INVALID_JSON|JSON/i.test(message)
              ? "parse"
              : /EMPTY_ITEMS/i.test(message)
                ? "empty"
                : "none";
    attemptErrorMessage = attemptErrorType === "none" ? null : message.slice(0, 300);
    throw error;
  } finally {
    if (attemptErrorType === "none") upstreamStatus = 200;
    console.warn(JSON.stringify({
      event: "gemini_attempt",
      model,
      durationMs: Date.now() - startedAt,
      upstreamStatus,
      errorType: attemptErrorType,
      errorMessage: attemptErrorMessage,
      normalizeMs,
    }));
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortExternal);
  }
}
Deno.serve(async (req) => {
  const functionStartedAt = Date.now();
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
    const textSource = typeof body?.textSource === "string" ? body.textSource.trim().toLowerCase() : "";
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
1) raw_text: النص الخام المقروء من الصورة، محافظًا على ترتيب الكلمات والأرقام كما ظهرت قدر الإمكان. لا تعيد بناء السطر من الترجمة.
2) description: الوصف المقروء بعد تصحيح أخطاء OCR الواضحة فقط، من دون اختراع اسم أو إضافة رقم.
3) category_ar: نوع المنتج الفني كما هو مفهوم من النص فقط، بكلمة/عبارة قصيرة مثل: كوع، سوكت، بايب، نيبل، نبل، محبس، بوكس، كنكتر. إذا لم يكن النوع واضحًا اتركه فارغًا.
4) source_line_index: رقم ترتيب السطر الذي قرأته، يبدأ من 0، ويجب أن يكون فريدًا ومحافظًا على ترتيب المصدر.
5) normalized_description_ar: الاسم التجاري المفهوم بالعربية، لأن هذا الحقل سيُستخدم لمطابقة قاعدة المنتجات. لا تستخدمه لاستبدال raw_text.
6) color: اللون المكتوب في نفس السطر فقط، مثل أخضر/أحمر/أصفر/أزرق/أسود. إذا لم يوجد لون صريح اتركه فارغًا. لا تستنتجه من اسم منتج آخر.
7) specification: المواصفة الفنية المكتوبة في نفس السطر فقط، مثل 1.5 مم أو 2.5 مم أو 30 سم أو 3 كور. لا تخترع مواصفة.
8) brand: الماركة/المصنع المكتوب في نفس السطر فقط. إذا لم توجد اتركه فارغًا.
9) quantity: الكمية الرقمية الموجودة في نفس السطر فقط.
6) unit: الوحدة المرتبطة بالكمية في نفس السطر مثل حبة، قطعة، رول، كرتون، دزينة، متر.
7) confidence: ثقتك في قراءة السطر من 0 إلى 1.

المصدر الإضافي للنص إن وُجد:
- textSource = "${textSource}".
- إذا كان هناك نص مستخرج من PDF أو Excel أو OCR، استخدمه كدليل مساعد فقط.
- في الصورة، الصورة الأصلية هي المرجع البصري الأعلى؛ لا تستبدل كلمة أو رقمًا من الصورة لمجرد أن OCR قرأه بشكل مختلف.
- في PDF/Excel/text، حافظ على ترتيب الصفوف والأسطر ولا تسقط بندًا موجودًا في النص.
- يجب أن يخرج عنصر واحد لكل سطر طلب واضح، ولا تدمج سطرين مختلفين لمجرد تشابه الصنف.

قاعدة الكمية مهمة جدًا:
- اقرأ الكمية من الطلبية كما هي مكتوبة، حتى لو كانت في بداية السطر أو نهايته أو بجانب الوحدة.
- لا تجعل quantity=0 إذا كانت هناك كمية مقروءة في السطر.
- لا تعتبر رقم الكود/SKU أو المقاس أو الأمبير أو الجهد كمية. مثال: "1200 PVC pipe 12 ROLL" الكمية هنا 12 والوحدة رول، وليس 1200.
- إذا كان السطر يبدأ بترقيم قائمة مثل "2. PVC capling..." أو "2) PVC capling..." أو "2- PVC capling..." فهذا الرقم رقم السطر وليس quantity.
- إذا ظهر رقم مع وحدة واضحة مثل "4 رول" أو "12 حبة" أو "3 كرتون" أو "3 dozen" فهو quantity.
- إذا ظهر رقم واضح بعد وحدة أو قبلها في نهاية السطر مثل "100 pcs" أو "3 dozen" فهذه هي الكمية حتى لو بدأ السطر برقم ترقيم.
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
- "pcs" و"pc" تعني unit="قطعة"، و"dozen/dozens" تعني unit="دزينة".
- مهم جدًا: نفّذ القراءة أولًا ثم الفهم. لا تجعل الترجمة تغيّر النص المقروء.
- raw_text يجب أن يكون أقرب نسخة ممكنة لما هو مكتوب في الصورة، وليس تخمينًا لمعناه. لا تلصق رقم الكمية أو رقم المقاس في بداية اسم المنتج إذا لم يكن ظاهرًا هناك. إذا كانت الكلمة "Elbow" أو "كوع" ظاهرة، فلا تحولها إلى رقم أو إلى كلمة غير مرتبطة بها.
- إذا كان أمامك نص OCR مساعد، فقد يحتوي على أخطاء أو أرقام مفقودة؛ استخدم الصورة الأصلية للتحقق منه، ولا تنقل خطأ OCR إلى raw_text أو quantity دون مراجعة.
- category_ar حقل مستقل للنوع الفني. استخرج النوع قبل الترجمة، ولا تتركه فارغًا إذا كان النوع ظاهرًا بوضوح.
- إذا كان في السطر "Elbow" أو "Double Elbow" أو "Street Elbow" فـ category_ar يجب أن يكون "كوع" أو "كوع دبل" أو "كوع ذكر وانثى" على الترتيب، مع بقاء المصطلح الأصلي في raw_text وdescription.
- description يجب أن يعكس النص المقروء بعد تصحيح OCR واضح فقط. إذا كانت الكلمة مثل "petan" أو "melbus" غير مؤكدة، لا تستبدلها بكلمة أخرى.
- normalized_description_ar لا يجوز أن يكون نسخة عربية مخترعة من نص غير مفهوم. املأه فقط عندما يكون معنى الصنف واضحًا من النص والمقاس والسياق. مثال: "PVC capling - 20mm" => "وصلة PVC - 20 ملم". أما "petan - 2" إذا لم يتضح المقصود => normalized_description_ar="" وnotes="الكلمة غير واضحة".

تعليمات تصفية إضافية (طبقة تصحيح) — لا تُعدّل المنطق الأساسي:
1. تصفية الضوضاء (Non-Items): يُمنع تمامًا اعتبار الكلمات التالية أصنافًا أو محاولة مطابقتها في قاعدة البيانات: Total, Subtotal, Discount, VAT, الاجمالي, الإجمالي, المجموع, الخصم, الصافي, الضريبة. توقف عن استخراج الأصناف عند الوصول إلى هذه الكلمات في نهاية الفاتورة.
2. تطبيع النص العربي (Arabic Normalization): عند فهم اسم الصنف، أزل التشكيل، وحرف التطويل "ـ"، والمسافات الزائدة. لا تغيّر الأحرف أو الكلمات الأخرى.
3. دقة المطابقة (Strict Matching): لا تخمّن SKU أو اسم صنف أو منتج. إذا لم يكن الاسم واضحًا، اترك normalized_description_ar فارغًا أو اترك السطر للمراجعة.
4. عدم المساس بالقديم: الكمية والوحدة والسعر وباقي بيانات السطر تُقرأ كما هي؛ هذه التعليمات تخص تصفية أسطر الإجمالي/الخصم/الضريبة وتطبيع الاسم فقط.
5. إذا كان اسم عربي واضح مثل "طلقات ديكور" ظاهرًا في السطر، حافظ عليه في description وnormalized_description_ar حتى لو كان OCR المساعد قد أخطأ في حرف، ولا تستبدل الاسم برقم أو رقم مالي من السطر.

- ممنوع تحويل أي كلمة غير مفهومة إلى كلمة عربية لمجرد أنها تشبهها صوتيًا. وممنوع إضافة "مسمار" أو "كام" أو أي اسم منتج غير موجود في النص.
- في مواد الـPVC والكهرباء، حافظ على مفردات السوق كما هي حتى لو كانت مكتوبة بتهجئة غير قياسية: مثل "capling/coupling" و"melbus/mlbwsh" و"GI box" و"Adsany/Adsani" و"Alfa". إذا كانت الكلمة ظاهرة في الصورة، اكتبها في raw_text كما قرأتها، ويمكن أن تضع مقابلاً عربيًا واضحًا في normalized_description_ar دون حذف الكلمة الأصلية.
- كلمات مثل "melbus" لا يجوز تحويلها إلى أرقام أو وصف مختلف. إذا ظهر "double melbus" فاحتفظ بصفة double/dبل، وإذا ظهر "capling" فاحتفظ بلفظ capling/coupling.
- لا تسقط سطرًا لأن كلمة المنتج غير مألوفة؛ المطلوب استخراج السطر والكمية والوحدة أولًا، ثم ترك الاسم غير المؤكد كما هو.
- إذا كانت كلمة غير واضحة فعلًا، لا تخترع لها معنى. اتركها في description كما قرأتها إن أمكن، وضع "غير واضح" في notes، ولا تبنِ عليها SKU.
- إذا كان السطر كله غير مقروء، اجعل description وnormalized_description_ar فارغين، واحتفظ بما أمكن في raw_text، confidence منخفضًا.
- لا تخترع SKU أو منتجًا أو سعرًا.
- لا تُرجع رموزًا أو حروفًا عشوائية على أنها اسم منتج.
- قبل إخراج JSON راجع كل سطر: هل normalized_description_ar ترجمة حقيقية لما قرأته؟ إذا لا، امسحه واتركه فارغًا.
- أرجع JSON فقط.

الشكل المطلوب:
{"items":[{"description":"","category_ar":"","normalized_description_ar":"","quantity":0,"unit":"","raw_text":"","confidence":0,"notes":""}],"notes":""}
${textInput
  ? textSource === "ocr"
    ? "\nنص OCR مساعد مستخرج آليًا من الصورة (قد يحتوي أخطاء؛ الصورة الأصلية هي المرجع):\n" + textInput
    : "\nالمدخل النصي الأصلي:\n" + textInput
  : ""}`;

    const attempts: Array<{ model: string; error: string; upstreamStatus: number | null }> = [];
    let lastResult: ReturnType<typeof normalize> | null = null;
    const hedgeController = new AbortController();

    // Run the two independent Gemini paths concurrently. Previously the second
    // model waited for the first to time out/fail, adding 7-18s before fallback.
    // The first successful model now wins; the slower loser is aborted.
    const modelCalls = MODELS.map((model, index) => {
      const modelPrompt =
        index === 0
          ? prompt
          : prompt + "\\n\\nهذه محاولة احتياطية موازية. لا تخترع أي معلومة؛ ركز على قراءة كل الصفوف والكمية والوحدة بدقة.";
      return callGemini(
        apiKey,
        model.id,
        model.timeoutMs,
        mimeType,
        base64Data,
        modelPrompt,
        hedgeController.signal,
      ).then((result) => ({ result, index, model }));
    });

    try {
      const winner = await Promise.any(modelCalls);
      lastResult = winner.result;
      hedgeController.abort();

      const confidences = winner.result.items.map((item) => item.confidence).filter((value) => value > 0);
      const averageConfidence = confidences.length
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : 0;

      const expectedLines = textInput
        ? textInput
            .split(/\\r?\\n/)
            .map((line) => line.trim())
            .filter((line) => line.length >= 3)
            .filter((line) => !/^(?:الصنف|الكمية|الطلبية|البيان|item|product|quantity)$/i.test(line))
            .length
        : 0;
      const missingLines = expectedLines > 0
        ? expectedLines - winner.result.items.length
        : 0;
      const lineCoverageOk = missingLines <= MAX_EXPECTED_LINE_GAP;

      const warning = !lineCoverageOk
        ? "تمت القراءة لكن بعض السطور لم تُستخرج؛ راجع الطلبية قبل الاعتماد."
        : averageConfidence < 0.78
          ? "تمت القراءة لكن الثقة منخفضة؛ راجع السطور قبل الاعتماد."
          : undefined;

      return json({
        success: true,
        result: winner.result,
        ...(warning ? { warning } : {}),
      });
    } catch (error) {
      hedgeController.abort();
      const errors = error instanceof AggregateError ? error.errors : [error];
      for (let index = 0; index < errors.length; index += 1) {
        const model = MODELS[index] ?? MODELS[0];
        const modelError = errors[index];
        const message = modelError instanceof Error ? modelError.message : String(modelError ?? "unknown");
        const statusMatch = message.match(/HTTP (\\d{3})/);
        attempts.push({
          model: model.id,
          error: message.slice(0, 800),
          upstreamStatus: statusMatch ? Number(statusMatch[1]) : null,
        });
      }
    }
    return json({
      success: false,
      error: "تعذر تشغيل محرك القراءة الذكي حاليًا. سيتم تشغيل القراءة الاحتياطية.",
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
  } finally {
    console.warn(JSON.stringify({
      event: "analyze_order_timing",
      totalDurationMs: Date.now() - functionStartedAt,
    }));
  }
});