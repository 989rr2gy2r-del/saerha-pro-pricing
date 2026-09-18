import { createFileRoute } from "@tanstack/react-router";

import { getServerEnv } from "@/lib/server-env";

const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const PRIMARY_MAX_ATTEMPTS = 3;
const GEMINI_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

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
  const endpoint = buildGeminiEndpoint(model);
  const response = await fetch(endpoint, {
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
  });

  const responseText = await response.text();
  return { response, responseText };
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
      const { response, responseText } = await fetchGeminiRequest(
        apiKey,
        model,
        mimeType,
        base64Data,
        prompt,
      );

      if (response.ok) {
        return { response, responseText };
      }

      if (!isRetryableGeminiError(response.status) || attempt === maxAttempts - 1) {
        return { response, responseText };
      }

      console.warn(`[Gemini OCR] ${model} transient failure`, response.status);
      const delayMs = getRetryDelayMs(attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini OCR] ${model} transient exception`);
      if (attempt === maxAttempts - 1) {
        break;
      }
      const delayMs = getRetryDelayMs(attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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
        try {
          const apiKey = getGeminiApiKey();
          if (!apiKey) {
            return Response.json(
              { success: false, error: "Gemini غير مهيأ على الخادم." },
              { status: 503 },
            );
          }

          const body = await request.json();
          const image = body?.image;

          if (!image || typeof image !== "string") {
            return Response.json({ success: false, error: "لم يتم إرسال صورة." }, { status: 400 });
          }

          const match = image.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);

          if (!match) {
            return Response.json(
              { success: false, error: "صيغة الصورة غير صحيحة." },
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
            const primaryMessage = (() => {
              try {
                const payload = JSON.parse(primaryResult.responseText) as {
                  error?: { message?: unknown };
                };
                return typeof payload.error?.message === "string" ? payload.error.message : "";
              } catch {
                return "";
              }
            })();

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
                  const fallbackPayload = (() => {
                    try {
                      return JSON.parse(fallbackResult.responseText);
                    } catch {
                      return { raw: fallbackResult.responseText };
                    }
                  })();

                  const candidateText = (
                    fallbackPayload as {
                      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
                    }
                  ).candidates?.[0]?.content?.parts?.[0]?.text;

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
                      {
                        success: false,
                        error: "تعذر تحليل الصورة مؤقتًا، يرجى المحاولة مرة أخرى.",
                      },
                      { status: 503 },
                    );
                  }

                  const parsed = normalizeAnalysisResult(parsedJson);
                  return Response.json({ success: true, result: parsed });
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

            console.error(
              `Gemini HTTP ${primaryStatus}: ${primaryMessage || "Unknown Gemini error"}`,
            );
            return Response.json(
              {
                success: false,
                error: `Gemini HTTP ${primaryStatus}: ${primaryMessage || "Unknown Gemini error"}`,
              },
              { status: primaryStatus },
            );
          }

          let responsePayload: unknown;

          try {
            responsePayload = JSON.parse(primaryResult.responseText);
          } catch {
            responsePayload = { raw: primaryResult.responseText };
          }

          const candidateText = (
            responsePayload as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
            }
          ).candidates?.[0]?.content?.parts?.[0]?.text;

          let result = typeof candidateText === "string" ? candidateText : "";

          // Accept JSON-only output while tolerating a fenced response from the model.
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
              { success: false, error: "استجابة Gemini غير صالحة أو غير JSON." },
              { status: 400 },
            );
          }

          const parsed = normalizeAnalysisResult(parsedJson);

          return Response.json({
            success: true,
            result: parsed,
          });
        } catch (error) {
          console.error(
            "Gemini analyze-order request failed",
            error instanceof Error ? error.name : "unknown error",
          );

          return Response.json(
            {
              success: false,
              error: "حدث خطأ أثناء تحليل الصورة بواسطة Gemini.",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
