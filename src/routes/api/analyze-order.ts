import { createFileRoute } from "@tanstack/react-router";

import { authenticateStaffRequest } from "@/lib/server-auth";
import { getServerEnv } from "@/lib/server-env";

const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const PRIMARY_MAX_ATTEMPTS = 3;
const GEMINI_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_BASE64_CHARS = 12 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

const rateLimit = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const current = rateLimit.get(userId);

  if (!current || now >= current.resetAt) {
    rateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT_MAX_REQUESTS;
}

function buildGeminiEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function getRetryDelayMs(attempt: number): number {
  const baseDelayMs = 1000;
  const jitterMs = Math.floor(Math.random() * 250);
  return Math.min(4000, baseDelayMs * 2 ** attempt) + jitterMs;
}

function isRetryableGeminiError(status: number): boolean {
  return GEMINI_RETRYABLE_STATUS_CODES.has(status);
}

async function fetchGeminiRequest(
  apiKey: string,
  model: string,
  mimeType: string,
  base64Data: string,
  prompt: string,
): Promise<{ response: Response; responseText: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(buildGeminiEndpoint(model), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    return { response, responseText };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGeminiWithRetry(
  apiKey: string,
  model: string,
  mimeType: string,
  base64Data: string,
  prompt: string,
  maxAttempts: number,
): Promise<{ response: Response; responseText: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    console.info(`[Gemini OCR] ${model} attempt ${attempt + 1}/${maxAttempts}`);

    try {
      const result = await fetchGeminiRequest(apiKey, model, mimeType, base64Data, prompt);

      if (result.response.ok) {
        return result;
      }

      if (!isRetryableGeminiError(result.response.status) || attempt === maxAttempts - 1) {
        return result;
      }

      console.warn(`[Gemini OCR] ${model} transient failure`, result.response.status);
      await new Promise((resolve) => setTimeout(resolve, getRetryDelayMs(attempt)));
    } catch (error) {
      lastError = error;
      console.warn(
        `[Gemini OCR] ${model} transient exception`,
        error instanceof Error ? error.name : "unknown",
      );

      if (attempt === maxAttempts - 1) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, getRetryDelayMs(attempt)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

type AnalysisItem = {
  description: string;
  quantity: number;
  unit: string;
  raw_text: string;
  confidence: number;
  notes?: string;
};

type AnalysisResult = {
  items: AnalysisItem[];
  notes: string;
};

function getGeminiApiKey(): string | null {
  return getServerEnv("GEMINI_API_KEY");
}

function normalizeAnalysisResult(value: unknown): AnalysisResult {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawItems = Array.isArray(source["items"]) ? source["items"] : [];

  return {
    items: rawItems
      .map((item): AnalysisItem => {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const quantity = Number(row["quantity"]);
        const confidence = Number(row["confidence"]);

        return {
          description: typeof row["description"] === "string" ? row["description"].trim() : "",
          quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
          unit: typeof row["unit"] === "string" ? row["unit"].trim() : "",
          raw_text: typeof row["raw_text"] === "string" ? row["raw_text"].trim() : "",
          confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
          notes: typeof row["notes"] === "string" ? row["notes"].trim() : "",
        };
      })
      .filter((item) => item.description || item.raw_text),
    notes: typeof source["notes"] === "string" ? source["notes"].trim() : "",
  };
}

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/analyze-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateStaffRequest(request);
        if (auth instanceof Response) return auth;

        if (isRateLimited(auth.userId)) {
          return Response.json(
            { success: false, error: "تم تجاوز حد المحاولات، يرجى المحاولة بعد قليل." },
            { status: 429 },
          );
        }

        try {
          const apiKey = getGeminiApiKey();
          if (!apiKey) {
            return Response.json(
              { success: false, error: "خدمة تحليل الطلبات غير مهيأة حاليًا." },
              { status: 503 },
            );
          }

          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > MAX_REQUEST_BYTES) {
            return Response.json(
              { success: false, error: "حجم الصورة أكبر من الحد المسموح." },
              { status: 413 },
            );
          }

          const body = await request.json();
          const image = body?.image;

          if (!image || typeof image !== "string") {
            return Response.json({ success: false, error: "لم يتم إرسال صورة." }, { status: 400 });
          }

          if (image.length > MAX_BASE64_CHARS) {
            return Response.json(
              { success: false, error: "حجم الصورة أكبر من الحد المسموح." },
              { status: 413 },
            );
          }

          const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);

          if (!match) {
            return Response.json(
              { success: false, error: "صيغة الصورة غير مدعومة." },
              { status: 400 },
            );
          }

          const mimeType = match[1] ?? "image/png";
          const base64Data = match[2] ?? "";

          const prompt = `
أنت محرك قراءة طلبيات لمحل مواد كهربائية وصحية اسمه "سعّرها".

اقرأ صورة الطلبية بدقة واستخرج الأصناف والبيانات الظاهرة فقط.

أرجع JSON فقط بهذا الشكل:
{
  "items": [
    {
      "description": "اسم الصنف كما ظهر في الصورة",
      "quantity": 0,
      "unit": "الوحدة إن ظهرت",
      "raw_text": "النص الأصلي للصنف",
      "confidence": 0,
      "notes": "ملاحظات هذا السطر إن كانت غير واضحة"
    }
  ],
  "notes": "أي ملاحظات أو أجزاء غير واضحة"
}

القواعد:
- لا تخترع أي صنف.
- لا تخترع SKU.
- لا تخترع سعرًا.
- لا تخمن الكمية إذا لم تكن واضحة.
- احتفظ بالنص الأصلي قدر الإمكان.
- confidence رقم بين 0 و1.
- إذا كان جزء من النص غير واضح، اذكر ذلك في notes.
- المطلوب قراءة الطلبية فقط، وليس تسعيرها.
`;

          const primaryResult = await fetchGeminiWithRetry(
            apiKey,
            PRIMARY_MODEL,
            mimeType,
            base64Data,
            prompt,
            PRIMARY_MAX_ATTEMPTS,
          );

          if (!primaryResult.response.ok) {
            const primaryStatus = primaryResult.response.status;

            if (isRetryableGeminiError(primaryStatus)) {
              console.warn(`[Gemini OCR] primary transient failure ${primaryStatus}`);
              console.info("[Gemini OCR] fallback attempt");

              try {
                const fallbackResult = await fetchGeminiWithRetry(
                  apiKey,
                  FALLBACK_MODEL,
                  mimeType,
                  base64Data,
                  prompt,
                  1,
                );

                if (fallbackResult.response.ok) {
                  console.info("[Gemini OCR] fallback success");

                  let result = "";
                  try {
                    const fallbackPayload = JSON.parse(fallbackResult.responseText) as {
                      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
                    };
                    const candidateText =
                      fallbackPayload.candidates?.[0]?.content?.parts?.[0]?.text;
                    result = typeof candidateText === "string" ? candidateText : "";
                  } catch {
                    result = "";
                  }

                  result = result
                    .replace(/^```json\s*/i, "")
                    .replace(/^```\s*/i, "")
                    .replace(/\s*```$/i, "")
                    .trim();

                  const start = result.indexOf("{");
                  const end = result.lastIndexOf("}");
                  if (start >= 0 && end > start) {
                    result = result.slice(start, end + 1);
                  }

                  const parsedJson = safeParseJson(result);
                  if (!parsedJson) {
                    return Response.json(
                      {
                        success: false,
                        error: "تعذر تحليل الصورة مؤقتًا، يرجى المحاولة مرة أخرى.",
                      },
                      { status: 503 },
                    );
                  }

                  return Response.json({
                    success: true,
                    result: normalizeAnalysisResult(parsedJson),
                  });
                }

                console.warn("[Gemini OCR] fallback failure");
                return Response.json(
                  {
                    success: false,
                    error: "تعذر تحليل الصورة مؤقتًا، يرجى المحاولة مرة أخرى.",
                  },
                  { status: 503 },
                );
              } catch (fallbackError) {
                console.warn(
                  "[Gemini OCR] fallback failure",
                  fallbackError instanceof Error ? fallbackError.name : "unknown",
                );
                return Response.json(
                  {
                    success: false,
                    error: "تعذر تحليل الصورة مؤقتًا، يرجى المحاولة مرة أخرى.",
                  },
                  { status: 503 },
                );
              }
            }

            console.error(`Gemini HTTP ${primaryStatus}`);
            return Response.json(
              {
                success: false,
                error: "تعذر تحليل الصورة حاليًا، يرجى المحاولة مرة أخرى.",
              },
              { status: 502 },
            );
          }

          let responsePayload: unknown;

          try {
            responsePayload = JSON.parse(primaryResult.responseText);
          } catch {
            responsePayload = null;
          }

          const candidateText = (
            responsePayload as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
            } | null
          )?.candidates?.[0]?.content?.parts?.[0]?.text;

          let result = typeof candidateText === "string" ? candidateText : "";

          result = result
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

          const start = result.indexOf("{");
          const end = result.lastIndexOf("}");

          if (start >= 0 && end > start) {
            result = result.slice(start, end + 1);
          }

          const parsedJson = safeParseJson(result);
          if (!parsedJson) {
            return Response.json(
              { success: false, error: "استجابة خدمة التحليل غير صالحة." },
              { status: 502 },
            );
          }

          return Response.json({
            success: true,
            result: normalizeAnalysisResult(parsedJson),
          });
        } catch (error) {
          console.error(
            "Gemini analyze-order request failed",
            error instanceof Error ? error.name : "unknown error",
          );

          return Response.json(
            {
              success: false,
              error: "حدث خطأ أثناء تحليل الصورة، يرجى المحاولة مرة أخرى.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
