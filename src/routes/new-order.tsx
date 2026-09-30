import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { Check, Database as DatabaseIcon, FileSpreadsheet, FileText, Image as ImageIcon, PenLine, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { createCustomer, fetchCustomers } from "@/lib/db/saerha-data";
import type { Customer } from "@/lib/mock-data";
import { convertQuantity } from "@/lib/pricing/unit-converter";
import { extractMatchConstraints, findLocalProductMatch, getMarketArabicTranslation, normalizeProductText, resolveProductBySkuCandidates } from "@/lib/matching/product-matcher";
import { normalizeQuantity, parseLocalOcrText, parseTextOrderFallback } from "@/lib/order/order-input";
import { extractOrderLineSignals, parseOrderSourceLines, reconcileOrderLineEvidence } from "@/lib/order/order-line-parser";

type ProductRecord = {
  id: string;
  sku: string;
  name_ar: string;
  name_en: string | null;
  short_name: string | null;
  brand: string | null;
  category_main: string | null;
  category_sub: string | null;
  category_third: string | null;
  product_group: string | null;
  model: string | null;
  size: string | null;
  unit: string | null;
  color: string | null;
  description: string | null;
};

type MatchStatus = "HIGH_CONFIDENCE" | "NEEDS_REVIEW" | "UNMATCHED";

type ReviewItem = {
  id: string;
  description: string;
  category_ar?: string;
  normalized_description_ar: string;
  quantity: number;
  unit: string;
  raw_text: string;
  confidence: number;
  extractionConfidence?: number;
  matchScore?: number | null;
  notes?: string;
  product: ProductRecord | null;
  matchReason: string;
  status: MatchStatus;
  rejected: boolean;
  accepted: boolean;
  priceAmount: number | null;
  basePriceAmount?: number | null;
  basePriceUnit?: string;
  priceType: string | null;
  priceLabel: string;
  discountPercent?: number;
  discountType?: "percent" | "amount";
  discountValue?: number;
  quoteName?: string;
  sourceSku?: string;
  sourceUnitPrice?: number | null;
  sourceTrace?: {
    raw_line: string;
    source_kind: "original_text" | "ai_ocr" | "local_ocr" | "unavailable";
    source_index: number | null;
    alignment_score: number;
    quantity_raw: string;
    unit_raw: string;
    quantity_span: { start: number; end: number; raw: string } | null;
    unit_span: { start: number; end: number; raw: string } | null;
    sku: string;
    ai_quantity: number | null;
    ai_unit: string;
    quantity_source: "source_text" | "unverified_ai" | "missing";
    unit_source: "source_text" | "unverified_ai" | "missing";
    issues: string[];
  };
  sourceLineTotal?: number | null;
  matchCandidates?: Array<{ id: string; sku: string; name_ar: string; score: number; reason: string }>;
};

type OrderAnalysisResult = {
  items: ReviewItem[];
  notes: string;
};

const sources = [
  { icon: ImageIcon, label: "صورة", hint: "JPG · PNG · WEBP · HEIC" },
  { icon: FileText, label: "PDF", hint: "ملف PDF" },
  { icon: FileSpreadsheet, label: "Excel", hint: "XLSX · XLS · CSV" },
  { icon: PenLine, label: "نص / خط اليد", hint: "نص مكتوب أو صورة مكتوبة بخط اليد" },
];



type LocalTesseractWorker = {
  recognize: (image: HTMLCanvasElement | string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
  setParameters?: (params: Record<string, string>) => Promise<unknown>;
};

type LocalTesseractApi = {
  createWorker: (
    langs?: string | string[],
    oem?: number,
    options?: { langPath?: string; logger?: (message: { status?: string; progress?: number }) => void },
  ) => Promise<LocalTesseractWorker>;
};

declare global {
  interface Window {
    Tesseract?: LocalTesseractApi;
  }
}

let tesseractLoader: Promise<LocalTesseractApi> | null = null;
let tesseractWorkerPromise: Promise<LocalTesseractWorker> | null = null;

function loadLocalTesseract(): Promise<LocalTesseractApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("محرك القراءة المحلي يعمل داخل المتصفح فقط."));
  }
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoader) return tesseractLoader;

  tesseractLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-saerha-tesseract="1"]');
    if (existing) {
      existing.addEventListener("load", () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error("تعذر تحميل محرك القراءة.")));
      existing.addEventListener("error", () => reject(new Error("تعذر تحميل محرك القراءة المحلي.")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.dataset.saerhaTesseract = "1";
    script.onload = () => window.Tesseract
      ? resolve(window.Tesseract)
      : reject(new Error("محرك القراءة المحلي لم يجهز."));
    script.onerror = () => reject(new Error("تعذر تحميل محرك القراءة المحلي."));
    document.head.appendChild(script);
  });

  return tesseractLoader;
}

async function prepareGeminiImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذر قراءة الصورة."));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("تعذر فتح الصورة."));
    element.src = dataUrl;
  });
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز الصورة للتحليل.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "medium";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function prepareOcrImage(file: File): Promise<HTMLCanvasElement> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذر قراءة الصورة."));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("تعذر فتح الصورة للقراءة."));
    element.src = dataUrl;
  });

  // Keep the local OCR canvas bounded. Upscaling a phone photo to 6K+ pixels
  // makes Tesseract dramatically slower without improving normal order OCR.
  const scale = Math.min(1.5, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز الصورة للقراءة.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "medium";
  // Let the browser do grayscale/contrast during drawing instead of copying
  // and rewriting every pixel with getImageData/putImageData.
  context.filter = "grayscale(1) contrast(1.25)";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.filter = "none";
  return canvas;
}

async function getTesseractWorker(onProgress?: (value: number) => void) {
  if (!tesseractWorkerPromise) {
    const tesseract = await loadLocalTesseract();
    tesseractWorkerPromise = tesseract.createWorker(["ara", "eng"], 1, {
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      logger: (message) => {
        if (typeof message.progress === "number") {
          onProgress?.(35 + Math.round(message.progress * 55));
        }
      },
    });
  }
  return tesseractWorkerPromise;
}

async function readImageLocally(file: File, onProgress?: (value: number) => void) {
  const worker = await getTesseractWorker(onProgress);
  const canvas = await prepareOcrImage(file);
  onProgress?.(35);
  const result = await worker.recognize(canvas);
  const text = result.data.text.trim();
  if (!text) throw new Error("لم يتم العثور على نص واضح في الصورة. جرّب صورة أوضح ومضاءة جيدًا.");
  return { text, items: parseLocalOcrText(text) };
}

const PRODUCT_SELECT_FIELDS =
  "id, sku, name_ar, name_en, short_name, brand, category_main, category_sub, category_third, product_group, model, size, color, unit, description";

const PRODUCT_SYNONYMS: Array<[RegExp, string]> = [
  [/\bamps?\b/gi, "امبير"], [/\bamperes?\b/gi, "امبير"], [/\bmeters?\b/gi, "متر"],
  [/\bgangs?\b/gi, "دقمة"],
  [/\b1[-\s]?way\b/gi, "1 دقمة"], [ /\b2[-\s]?way\b/gi, "2 دقمة"], [ /\b3[-\s]?way\b/gi, "3 دقمة"], [ /\b4[-\s]?way\b/gi, "4 دقمة"], [ /\b5[-\s]?way\b/gi, "5 دقمة"], [ /\b6[-\s]?way\b/gi, "6 دقمة"], [/\bround[-\s]?pin\b/gi, "دائري"],

  [/\bpvc\b/gi, "بلاستيك"], [/\bcircular\b/gi, "دائري"],
  [/\bsolution\s+glue\b/gi, "لاصق"], [/\bglue\b/gi, "لاصق"],
  [/\bfour[-\s]?way\b/gi, "رباعي"], [/\bthree[-\s]?way\b/gi, "ثلاثي"], [/\btwo[-\s]?way\b/gi, "ثنائي"],
  [/\bsingle[-\s]?pole\b/gi, "سنجل"], [/\bmcb\b/gi, "بريكر"], [/\brccb\b/gi, "rccb"],
  [/\bpanel\b/gi, "لوحة"], [/\bsdb\b/gi, "لوحة"], [/\bboard\b/gi, "لوحة"],
  [/\belectrical\s+tape\b/gi, "تيب"], [/\btape\b/gi, "تيب"],
  [/\bsmall\s+electrical\s+connector\b/gi, "كنكتر"], [/\bconnector(?:s)?\b/gi, "كنكتر"],
  [/\bmain\s+power\s+cable\b/gi, "كيبل"], [/\bpower\s+cable\b/gi, "كيبل"], [/\bcable\b/gi, "كيبل"],
  [/\bcoil(?:s)?\b/gi, "لف"], [/\bsteel\b/gi, "حديد"], [/\bbox(?:es)?\b/gi, "بوكس"],
  [/\bpipe(?:s)?\b/gi, "بايب"], [/\bband\b/gi, "ربطه"], [/\bchoket\b/gi, "تشوكت"],
  [/\bpower\s+socket\b/gi, "مفتاح"], [/\bsocket\b/gi, "ساكت"],

  [/\bpipe(?:s)?\b/gi, "بايب"], [/\b(?:كيوبكل|كوبيكل|كوبكل)\b/gi, "كيوبكل"],
  [/\b(?:دبي\s*بي|دي\s*بي)\b/gi, "ديبي"],
  [/\belbow(?:s)?\b/gi, "كوع"],
  [/\btee(?:s)?\b/gi, "تي"], [/\bcoupling(?:s)?\b/gi, "وصلة"],
  [/\bcoupler(?:s)?\b/gi, "وصلة"], [/\bsocket(?:s)?\b/gi, "سكت"],
  [/\badapter(?:s)?\b/gi, "أدبتر"], [/\badaptor(?:s)?\b/gi, "أدبتر"],
  [/\bconnector(?:s)?\b/gi, "موصل"], [/\bclamp(?:s)?\b/gi, "كلبس"],
  [/\bbox(?:es)?\b/gi, "بوكس"], [/\bnipple(?:s)?\b/gi, "نبل"],
  [/\bvalve(?:s)?\b/gi, "محبس"], [/\breducer(?:s)?\b/gi, "مخفض"],
  [/\bunion(?:s)?\b/gi, "وصلة"], [/\bflexible\b/gi, "فليكسيبل"],
  [/\bblack\b/gi, "اسود"], [/\bwhite\b/gi, "ابيض"],
  [/\bgreen\b/gi, "اخضر"], [/\bred\b/gi, "احمر"], [/\bblue\b/gi, "ازرق"],
  [/\broll(?:s)?\b/gi, "رول"], [/\bpiece(?:s)?\b/gi, "قطعة"],
  [/\bpcs\b/gi, "قطعة"], [/\bpc\b/gi, "قطعة"],
  [/\bcarton(?:s)?\b/gi, "كرتون"], [/\bpacket(?:s)?\b/gi, "باكيت"],
  [/\bpack(?:s)?\b/gi, "باكيت"], [/\bmm\b/gi, "مم"], [/\bcm\b/gi, "سم"],
  [/\binch(?:es)?\b/gi, "انش"],
];

function normalizeForMatch(value: string): string {
  let normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[٠-٩]/g, (char) => "٠١٢٣٤٥٦٧٨٩".indexOf(char).toString())
    .replace(/[أآإ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ء/g, "")
    .replace(/ـ/g, "").replace(/[ة]/g, "ة")
    .replace(/[`~!@#$%^&*()_+=\]{}\\|;:'",<>/?]/g, " ")
    .replace(/[_/\\-]+/g, " ").toLowerCase();
  for (const [pattern, replacement] of PRODUCT_SYNONYMS) normalized = normalized.replace(pattern, replacement);
  normalized = normalized
    .replace(/(\d+(?:\.\d+)?)\s*(?:مم|mm)\b/gi, "$1 مم")
    .replace(/(\d+(?:\.\d+)?)\s*(?:سم|cm)\b/gi, "$1 سم")
    .replace(/(\d+(?:\.\d+)?)\s*(?:انش|inch|in)\b/gi, "$1 انش")
    .replace(/\b(انش|inch|in)\s+(?:ونص|ونصف)\b/gi, "1.5 انش")
    .replace(/\b(انش|inch|in)\s+(?:ربع)\b/gi, "1.25 انش")
    .replace(/(\d+)\s*["”″]/g, "$1 انش")

    .replace(/\s+/g, " ").trim();
  return normalized;
}

function extractOrderSignals(rawText: string, catalogSkus?: Set<string>) {
  const trace = extractOrderLineSignals(rawText, catalogSkus);
  return { sku: trace.sku, unit: trace.unit, quantity: trace.quantity, trace };
}
function stripLeadingOrderQuantity(value: string, catalogSkus?: Set<string>): string {
  const text = String(value ?? "")
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .trim();
  const match = text.match(/^(\d+(?:\.\d+)?)(?:[.)\-:]?)(?=\s|$)/);
  if (!match) return text;
  const token = match[1];
  // A one- or two-digit leading number in an order line is quantity, not SKU.
  // Short service SKUs must never hijack quantity parsing.
  if (token.length >= 3 && catalogSkus?.has(token)) return text;
  return text.slice(match[0].length).trim();
}

function stripOrderPrefix(value: string, catalogSkus?: Set<string>): string {
  let text = stripLeadingOrderQuantity(value, catalogSkus);
  // After quantity, customers often write the order unit before the product.
  text = text.replace(
    /^(?:حبة|قطعة|قطع|كيس|كرتون|كرتونه|علبة|رول|لفة|لفه|لف|باكيت|باكت|باك|متر|سم|مم|كجم|كغ|جم|غ|لتر|مل|عبوة|طقم|صندوق|دزينة|درزن|زوج|pcs?|pieces?|piece|rolls?|packets?|packs?|cartons?|boxes?|meters?)\s+/i,
    "",
  );

  // IMPORTANT: the quantity at the END of an order line is not a product
  // specification. Leaving it in the matcher made "PVC Circular Socket Box -
  // 15 pcs" compete against catalog products using a fake "15" specification,
  // which suppressed otherwise correct matches.
  text = text
    .replace(
      /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:pcs?|pieces?|piece|حبة|قطعة|قطع|rolls?|roll|رول|لفات?|لفة|لفه|لف|coils?|coil|لفه|لف|packets?|packet|packs?|pack|باكيت|باكت|باك|cartons?|carton|كرتون|كرتونه|meters?|meter|m|متر)\s*$/i,
      "",
    )
    .trim();

  // Some customer lists put the quantity as a bare number at the end
  // ("PVC pipe 5/8 inch - 20"). Remove it only when the line already looks
  // like a product description; do not touch technical values such as 1.5,
  // 2.5, 4x10 or 63A.
  if (/\s[-–—]\s*\d+(?:[.,]\d+)?\s*$/.test(text)) {
    text = text.replace(/\s[-–—]\s*\d+(?:[.,]\d+)?\s*$/, "").trim();
  }

  return text.trim();
}


function normalizeUnitValue(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  const aliases: Record<string, string> = {
    "حبة": "حبة", "قطعة": "حبة", "قطع": "حبة", "pc": "حبة", "pcs": "حبة", "piece": "حبة", "pieces": "حبة",
    "كرتون": "كرتون", "كرتونه": "كرتون", "carton": "كرتون", "cartons": "كرتون", "box": "كرتون", "boxes": "كرتون",
    "علبة": "علبة", "علب": "علبة",
    "رول": "رول", "لفة": "رول", "لفه": "رول", "لف": "رول", "roll": "رول", "rolls": "رول",
    "باكيت": "باكيت", "باك": "باكيت", "pkt": "باكيت", "pkts": "باكيت", "pack": "باكيت", "packs": "باكيت", "packet": "باكيت", "packets": "باكيت",
    "متر": "متر", "m": "متر", "meter": "متر", "meters": "متر",
    "سم": "سم", "cm": "سم",
    "مم": "مم", "mm": "مم",
    "كيلوغرام": "كيلوغرام", "كغ": "كيلوغرام", "كجم": "كيلوغرام", "kg": "كيلوغرام",
    "غرام": "غرام", "جم": "غرام", "غ": "غرام", "g": "غرام",
    "لتر": "لتر", "l": "لتر", "liter": "لتر", "litre": "لتر",
    "مل": "مل", "ml": "مل",
    "عبوة": "عبوة", "طقم": "طقم", "كيس": "كيس", "صندوق": "صندوق",
  };
  return aliases[key] ?? raw;
}

function matchTokens(value: string): string[] {
  return normalizeForMatch(value).split(" ").map((token) => token.trim()).filter(Boolean);
}

function similarityScore(a: string, b: string): number {
  const normalizedA = normalizeForMatch(a);
  const normalizedB = normalizeForMatch(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  const aTokens = matchTokens(normalizedA);
  const bTokens = matchTokens(normalizedB);
  const tokenHits = aTokens.filter((token) => bTokens.some((candidate) => candidate === token || candidate.includes(token) || token.includes(candidate))).length;
  if (!tokenHits) return 0;
  const tokenScore = tokenHits / Math.max(aTokens.length, bTokens.length);
  const queryCoverage = tokenHits / aTokens.length;
  const numericA = aTokens.filter((token) => /^\d+(?:\.\d+)?$/.test(token));
  const numericB = bTokens.filter((token) => /^\d+(?:\.\d+)?$/.test(token));
  const numericHits = numericA.filter((token) => numericB.includes(token)).length;
  const numericScore = numericA.length ? numericHits / numericA.length : 0;
  return Math.min(1.25, tokenScore * 0.65 + queryCoverage * 0.25 + numericScore * 0.35);
}

function getPriceLookupKey(priceType: string): string {
  const map: Record<string, string> = {
    retail: "Retail", reseller: "Reseller", customer_special: "Customer Special", manual_quote: "Manual Quote",
    unit_price: "Unit Price", price_after_discount: "Price After Discount", retail_min: "Retail Min",
  };
  return map[priceType] ?? priceType;
}
type PreparedProductMatch = {
  product: ProductRecord;
  sku: string;
  fields: Array<{ value: string; weight: number }>;
  haystack: string;
};

const preparedProductCache = new WeakMap<ProductRecord, PreparedProductMatch>();
type MatchAliasRow = { product_id: string; alias: string; normalized_alias: string };
const aliasRowsCache = new WeakMap<object, MatchAliasRow[]>();

function prepareAliasRows(aliases: Record<string, string[]>): MatchAliasRow[] {
  const cached = aliasRowsCache.get(aliases);
  if (cached) return cached;

  const rows = Object.entries(aliases).flatMap(([productId, values]) =>
    values
      .map((alias) => String(alias ?? "").trim())
      .filter(Boolean)
      .map((alias) => ({
        product_id: productId,
        alias,
        normalized_alias: normalizeProductText(alias),
      })),
  );
  aliasRowsCache.set(aliases, rows);
  return rows;
}

function prepareProductForMatch(
  product: ProductRecord,
  aliases: Record<string, string[]>,
): PreparedProductMatch {
  const cached = preparedProductCache.get(product);
  if (cached) return cached;

  const fields = [
    { value: product.sku, weight: 1.25 },
    { value: product.name_ar, weight: 1.15 },
    { value: product.name_en, weight: 1.1 },
    { value: product.short_name, weight: 1.1 },
    { value: product.brand, weight: 0.8 },
    { value: product.model, weight: 0.85 },
    { value: product.size, weight: 0.75 },
    { value: product.color, weight: 0.95 },
    { value: product.description, weight: 0.65 },
    ...((aliases[product.id] ?? []).map((value) => ({ value, weight: 1.05 }))),
    { value: product.category_main, weight: 0.45 },
    { value: product.category_sub, weight: 0.45 },
    { value: product.category_third, weight: 0.4 },
    { value: product.product_group, weight: 0.4 },
  ]
    .filter((field): field is { value: string; weight: number } => Boolean(field.value))
    .map((field) => ({ value: normalizeForMatch(String(field.value)), weight: field.weight }))
    .filter((field) => Boolean(field.value));

  const prepared = {
    product,
    sku: normalizeForMatch(product.sku),
    fields,
    haystack: fields.map((field) => field.value).join(" "),
  };
  preparedProductCache.set(product, prepared);
  return prepared;
}

export const Route = createFileRoute("/new-order")({
  head: () => ({
    meta: [
      { title: "طلبية جديدة — سعّرها" },
      {
        name: "description",
        content: "ارفع طلبية الزبون في سعّرها كصورة أو PDF أو Excel أو نص أو طلب مكتوب بخط اليد.",
      },
      { property: "og:title", content: "طلبية جديدة — سعّرها" },
      { property: "og:description", content: "رفع طلبية الزبون بأي شكل داخل نظام سعّرها." },
    ],
  }),
  component: () => (
    <ProtectedRoute>
      <NewOrder />
    </ProtectedRoute>
  ),
});

function NewOrder() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisResult, setAnalysisResult] = useState<OrderAnalysisResult | null>(null);
  const [pastedOrderText, setPastedOrderText] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ name: string; size: number; type: string; status: string }>
  >([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productAliases, setProductAliases] = useState<Record<string, string[]>>({});
  // Reuse the initial catalog request if analysis starts before page-load finishes.
  // Without this guard, uploading immediately after opening the page triggered
  // a second full 4.5k-product download and made analysis unnecessarily slow.
  const productsLoadPromiseRef = useRef<Promise<{
    products: ProductRecord[];
    aliases: Record<string, string[]>;
  }> | null>(null);
  const [progress, setProgress] = useState(0);
  const [lastAnalyzedKey, setLastAnalyzedKey] = useState<string>("");
  const [productSearches, setProductSearches] = useState<Record<string, string>>({});
  const [openProductPickerId, setOpenProductPickerId] = useState<string | null>(null);
  const keyboardFieldRefs = useRef<Record<string, HTMLElement | null>>({});
const [skuDrafts, setSkuDrafts] = useState<Record<string, string>>({});
  const [skuErrors, setSkuErrors] = useState<Record<string, string>>({});
  // Keep numeric drafts as text while the user types so a decimal separator
  // such as "11." is not lost on every React render.
  const [numericDrafts, setNumericDrafts] = useState<Record<string, { quantity?: string; price?: string }>>({});
  const [discountDrafts, setDiscountDrafts] = useState<Record<string, string>>({});
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"percent" | "amount" | "both">("percent");
  const [invoiceDiscountPercentDraft, setInvoiceDiscountPercentDraft] = useState("0");
  const [invoiceDiscountAmountDraft, setInvoiceDiscountAmountDraft] = useState("0");
  const [orderSource, setOrderSource] = useState<"image" | "pdf" | "excel" | "text" | "handwriting">("text");
  const [orderRawText, setOrderRawText] = useState("");
  const [persistedOrderId, setPersistedOrderId] = useState<string | null>(null);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingQuoteReference, setEditingQuoteReference] = useState<string | null>(null);
  const [editingQuoteLoading, setEditingQuoteLoading] = useState(false);

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: `${product.name_ar} — ${product.sku}`,
      })),
    [products],
  );

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const MAX_RENDERED_PRODUCT_RESULTS = 150;

  const filterProductOptions = (query: string) => {
    const normalizedQuery = normalizeForMatch(query);
    if (!normalizedQuery) {
      return productOptions.slice(0, 25);
    }

    const queryTokens = normalizedQuery.split(" ").filter(Boolean);

    return productOptions
      .map((option) => {
        const product = productById.get(option.value);
        if (!product) return null;

        const fields = [
          product.sku,
          product.name_ar,
          product.name_en,
          product.short_name,
          product.brand,
          product.model,
          product.size,
          product.category_main,
          product.category_sub,
          product.category_third,
          product.product_group,
          product.description,
          product.unit,
          ...(productAliases[product.id] ?? []),
        ]
          .filter(Boolean)
          .map((value) => normalizeForMatch(String(value)));

        const haystack = fields.join(" ");
        if (!haystack) return null;

        const matches = queryTokens.every((token) => {
          if (/^\d+(?:\.\d+)?$/.test(token)) {
            return fields.some((field) => field.split(/\s+/).includes(token));
          }
          return haystack.includes(token);
        });
        if (!matches) return null;

        const exactField = fields.some((field) => field === normalizedQuery);
        const startsField = fields.some((field) => field.startsWith(normalizedQuery));
        const containsField = fields.some((field) => field.includes(normalizedQuery));

        return {
          option,
          score: exactField ? 3 : startsField ? 2 : containsField ? 1 : 0,
        };
      })
      .filter((entry): entry is { option: (typeof productOptions)[number]; score: number } => Boolean(entry))
      .sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label, "ar"))
      .slice(0, MAX_RENDERED_PRODUCT_RESULTS)
      .map((entry) => entry.option);
  };

  const loadCustomers = async () => {
    try {
      setCustomersLoading(true);
      setCustomersError("");
      const list = await fetchCustomers();
      setCustomers(list);
      setCustomerId((current) => (list.some((customer) => customer.id === current) ? current : ""));
    } catch (error) {
      setCustomers([]);
      setCustomerId("");
      setCustomersError(
        error instanceof Error ? error.message : "تعذر تحميل قائمة العملاء من Supabase.",
      );
    } finally {
      setCustomersLoading(false);
    }
  };

  const handleCreateCustomerInline = async () => {
    const name = newCustomerName.trim();
    const phone = newCustomerPhone.trim();

    if (!name) {
      setNewCustomerError("اكتب اسم العميل أولاً.");
      return;
    }
    if (!phone) {
      setNewCustomerError("اكتب رقم هاتف العميل.");
      return;
    }

    try {
      setNewCustomerSaving(true);
      setNewCustomerError("");
      const customer = await createCustomer({ name, phone, type: "تجزئة" });
      setCustomers((current) =>
        [...current, customer].sort((a, b) => a.name.localeCompare(b.name, "ar")),
      );
      setCustomerId(customer.id);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setCustomerDialogOpen(false);
    } catch (error) {
      setNewCustomerError(error instanceof Error ? error.message : "تعذر إضافة العميل.");
    } finally {
      setNewCustomerSaving(false);
    }
  };

  const loadProducts = async (): Promise<{
    products: ProductRecord[];
    aliases: Record<string, string[]>;
  }> => {
    if (products.length) {
      return { products, aliases: productAliases };
    }

    if (productsLoadPromiseRef.current) {
      return productsLoadPromiseRef.current;
    }

    const loadPromise = (async () => {
      try {
        const pageSize = 1000;
        const allProducts: ProductRecord[] = [];
        const aliasMap: Record<string, string[]> = {};
        let from = 0;

        while (true) {
          const offsets = Array.from({ length: 5 }, (_, index) => from + index * pageSize);
          const [pages, aliasResult] = await Promise.all([
            Promise.all(
              offsets.map(async (offset) => {
                const { data, error } = await supabase
                  .from("products")
                  .select(PRODUCT_SELECT_FIELDS)
                  .order("name_ar", { ascending: true })
                  .range(offset, offset + pageSize - 1);
                if (error) throw error;
                return (data ?? []) as ProductRecord[];
              }),
            ),
            from === 0
              ? supabase.from("product_aliases").select("product_id, alias").limit(20000)
              : Promise.resolve({ data: null, error: null }),
          ]);

          for (const page of pages) allProducts.push(...page);

          if (pages.every((page) => page.length < pageSize)) {
            const aliasRows = aliasResult.data ?? [];
            if (aliasResult.error) throw aliasResult.error;

            for (const row of aliasRows) {
              const alias = String(row.alias ?? "").trim();
              if (!alias) continue;
              aliasMap[row.product_id] = [...(aliasMap[row.product_id] ?? []), alias];
            }

            setProducts(allProducts);
            setProductAliases(aliasMap);
            return { products: allProducts, aliases: aliasMap };
          }

          from += pages.length * pageSize;
        }
      } catch {
        setProducts([]);
        setProductAliases({});
        throw new Error("تعذر تحميل قاعدة المنتجات من Supabase.");
      }
    })();

    productsLoadPromiseRef.current = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (productsLoadPromiseRef.current === loadPromise) {
        productsLoadPromiseRef.current = null;
      }
    }
  };

  const loadQuoteForEditing = async (quoteId: string) => {
    try {
      setEditingQuoteLoading(true);
      setAnalysisError("");

      const [{ data: quote, error: quoteError }, catalog] = await Promise.all([
        (supabase as any)
          .from("quotations")
          .select(
            "id, reference, customer_id, issue_date, expiry_date, price_type, discount_amount, total, notes, quotation_items(id, product_id, product_name, sku, quantity, unit, unit_price, discount_amount, line_total, applied_price_type, is_manual_price)",
          )
          .eq("id", quoteId)
          .maybeSingle(),
        loadProducts(),
      ]);

      if (quoteError) throw quoteError;
      if (!quote) throw new Error("لم يتم العثور على عرض السعر المطلوب.");

      const catalogById = new Map(catalog.products.map((product) => [product.id, product]));
      const items = Array.isArray(quote.quotation_items) ? quote.quotation_items : [];

      const loadedItems: ReviewItem[] = items.map((row: any, index: number) => {
        const product = catalogById.get(String(row.product_id ?? ""));
        const quantity = normalizeQuantity(Number(row.quantity ?? 0));
        const unitPrice = Number(row.unit_price ?? 0);
        const lineSubtotal = quantity * unitPrice;
        const lineDiscountAmount = Math.max(0, Number(row.discount_amount ?? 0));
        const discountPercent = getSavedLineDiscountPercent(row, lineSubtotal);

        return {
          id: String(row.id ?? ("edit-" + quoteId + "-" + index)),
          description: product?.name_ar ?? String(row.product_name ?? ""),
          normalized_description_ar: product?.name_ar ?? String(row.product_name ?? ""),
          quantity,
          unit: String(row.unit ?? product?.unit ?? "حبة"),
          raw_text: String(row.product_name ?? product?.name_ar ?? ""),
          confidence: 1,
          notes: String(row.notes ?? ""),
          product: product ?? null,
          matchReason: product
            ? "صنف محفوظ في عرض السعر — بياناته من قاعدة المنتجات"
            : "تعذر العثور على المنتج في قاعدة البيانات الحالية",
          status: product ? "HIGH_CONFIDENCE" : "UNMATCHED",
          rejected: false,
          accepted: Boolean(product),
          priceAmount: Number.isFinite(unitPrice) ? unitPrice : null,
          basePriceAmount: null,
          basePriceUnit: product?.unit ?? String(row.unit ?? ""),
          priceType: row.is_manual_price ? "manual_quote" : String(row.applied_price_type ?? quote.price_type ?? "retail"),
          priceLabel: row.is_manual_price ? "سعر يدوي" : getPriceLookupKey(String(row.applied_price_type ?? quote.price_type ?? "retail")),
          discountPercent: Number(discountPercent.toFixed(2)),
          discountType: "percent",
          discountValue: Number(discountPercent.toFixed(2)),
          quoteName: String(row.product_name ?? product?.name_ar ?? ""),
          sourceSku: String(row.sku ?? product?.sku ?? ""),
          sourceUnitPrice: unitPrice,
          sourceLineTotal: Number(row.line_total ?? 0),
        };
      });

      const lineDiscountTotal = loadedItems.reduce(
        (sum, item) => sum + getLineDiscountDetails(item).discountAmount,
        0,
      );
      const storedDiscountTotal = Math.max(0, Number(quote.discount_amount ?? 0));
      const invoiceDiscountAmount = Math.max(0, storedDiscountTotal - lineDiscountTotal);

      setEditingQuoteId(String(quote.id));
      setEditingQuoteReference(String(quote.reference ?? ""));
      setCustomerId(String(quote.customer_id ?? ""));
      setAnalysisResult({
        items: loadedItems,
        notes: String(quote.notes ?? ""),
      });
      setOrderSource("text");
      setOrderRawText(loadedItems.map((item) => item.raw_text || item.description).filter(Boolean).join("\n"));
      setInvoiceDiscountType(invoiceDiscountAmount > 0 ? "amount" : "percent");
      setInvoiceDiscountPercentDraft("0");
      setInvoiceDiscountAmountDraft(invoiceDiscountAmount.toFixed(3));
      setProgress(100);

      if (loadedItems.some((item) => !item.product)) {
        setAnalysisError("تم فتح العرض، لكن يوجد صنف لم يعد موجودًا في قاعدة المنتجات الحالية؛ راجعه قبل الحفظ.");
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "تعذر فتح عرض السعر للتعديل.");
    } finally {
      setEditingQuoteLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
    void loadProducts();
  }, []);

  useEffect(() => {
    const quoteId = new URLSearchParams(window.location.search).get("editQuote");
    if (quoteId) void loadQuoteForEditing(quoteId);
  }, []);

  const patchReviewItem = (index: number, updater: (item: ReviewItem) => ReviewItem) => {
    setAnalysisResult((prev) => {
      if (!prev) return prev;
      const nextItems = [...prev.items];
      const current = nextItems[index];
      if (!current) return prev;
      nextItems[index] = updater(current);
      return { ...prev, items: nextItems };
    });
  };

  const handleOpenProductPicker = (index: number) => {
    const item = analysisResult?.items[index];
    if (!item) return;

    console.log("arabic:", item.normalized_description_ar);

    const initialSearch = item.product
      ? ""
      : item.normalized_description_ar
        || stripLeadingOrderQuantity(item.description || item.raw_text);
    setOpenProductPickerId(item.id);
    setProductSearches((previous) => ({
      ...previous,
      [item.id]: initialSearch,
    }));
  };

  const focusAndSelectField = (element: HTMLElement) => {
    window.requestAnimationFrame(() => {
      element.focus();
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.select();
      }
    });
  };

  const handleCloseProductPicker = () => {
    setOpenProductPickerId(null);
  };


  const recordCorrection = async (
    item: ReviewItem,
    action: "accepted" | "corrected" | "alias_added",
    addAlias = false,
  ) => {
    if (!item.product) return;
    const rawText = item.raw_text || item.description || "";
    const normalizedText = normalizeForMatch(rawText);
    if (!normalizedText) return;

    const { data: sessionData } = await (supabase as any).auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { error } = await (supabase as any).from("ai_corrections").insert({
      product_id: item.product.id,
      raw_text: rawText,
      normalized_text: normalizedText,
      action,
      created_by: userId,
    });
    if (error) throw error;

    if (addAlias) {
      const { error: aliasError } = await (supabase as any).from("product_aliases").upsert(
        {
          product_id: item.product.id,
          alias: rawText,
          normalized_alias: normalizedText,
          lang: "ar",
          source: "manual",
        },
        { onConflict: "product_id,normalized_alias" },
      );
      if (aliasError) throw aliasError;
    }
  };

  const handleAcceptMatch = (index: number) => {
    const current = analysisResult?.items[index];
    if (current?.product) void recordCorrection(current, "accepted");
    patchReviewItem(index, (item) => ({
      ...item,
      accepted: true,
      rejected: false,
      status: item.product ? "HIGH_CONFIDENCE" : "UNMATCHED",
      matchReason: item.product
        ? "تمت مراجعة المنتج والموافقة عليه"
        : "يجب اختيار منتج قبل التأكيد",
    }));
  };

  const handleRejectLine = (index: number) => {
    patchReviewItem(index, (item) => ({
      ...item,
      product: null,
      rejected: true,
      accepted: false,
      status: "UNMATCHED",
      matchReason: "تم رفض السطر من قبل المستخدم",
    }));
  };

  const handleDeleteLine = (index: number) => {
    const item = analysisResult?.items[index];
    if (!item) return;
    if (!window.confirm(`هل تريد حذف هذا الصنف من الطلبية الحالية؟\n\n${item.description || item.raw_text || "الصنف"}`)) return;
    setAnalysisResult((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) };
    });
  };

  const handleClearCurrentOrder = () => {
    if (!analysisResult && uploadedFiles.length === 0) return;
    if (!window.confirm("هل تريد حذف الطلبية الحالية ونتيجة التحليل من الشاشة؟ لن يتم حذف أي سجل محفوظ في قاعدة البيانات.")) return;
    setAnalysisResult(null);
    setAnalysisError("");
    setUploadedFiles([]);
    setProductSearches({});
    setSkuDrafts({});
    setSkuErrors({});
    setOpenProductPickerId(null);
    setDiscountDrafts({});
    setInvoiceDiscountType("percent");
    setInvoiceDiscountPercentDraft("0");
    setInvoiceDiscountAmountDraft("0");
    setProgress(0);
    setLastAnalyzedKey("");
  };

  const beginSkuEdit = (index: number) => {
    const item = analysisResult?.items[index];
    if (!item) return;
    setSkuDrafts((previous) => ({
      ...previous,
      [item.id]: item.product?.sku ?? item.sourceSku ?? "",
    }));
  };  const focusOrderField = (index: number, field: "sku" | "product" | "quantity" | "unit" | "price" | "discount") => {
    const item = analysisResult?.items[index];
    if (!item) return;
    const target = keyboardFieldRefs.current[`${item.id}:${field}`];
    if (!target) return;
    window.requestAnimationFrame(() => {
      if (field === "product") {
        handleOpenProductPicker(index);
      }
      target.focus();
      if (target instanceof HTMLInputElement) {
        target.select();
        window.requestAnimationFrame(() => {
          target.focus();
          target.select();
        });
      }
    });
  };

  const focusNextOrderField = (index: number, field: "sku" | "product" | "quantity" | "unit" | "price" | "discount") => {
    const order: Array<"sku" | "product" | "quantity" | "unit" | "price" | "discount"> = ["sku", "product", "quantity", "unit", "price", "discount"];
    const position = order.indexOf(field);
    if (position < order.length - 1) focusOrderField(index, order[position + 1]);
    else if (index < (analysisResult?.items.length ?? 0) - 1) focusOrderField(index + 1, "sku");
  };



  const finishSkuEdit = (index: number) => {
    const item = analysisResult?.items[index];
    if (!item) return false;
    const draft = String(skuDrafts[item.id] ?? "").trim();

    if (!draft) {
      setSkuErrors((previous) => ({ ...previous, [item.id]: "اكتب كود الصنف أولًا." }));
      return false;
    }

    const normalized = normalizeForMatch(draft);
    const exact = products.find((product) => normalizeForMatch(product.sku) === normalized);

    if (!exact) {
      setSkuErrors((previous) => ({
        ...previous,
        [item.id]: "الكود غير موجود في قاعدة البيانات.",
      }));
      return;
    }

    setSkuErrors((previous) => {
      const next = { ...previous };
      delete next[item.id];
      return next;
    });

    void handleProductSelect(index, exact.id);
    setSkuDrafts((previous) => {
      const next = { ...previous };
      delete next[item.id];
      return next;
    });

    return true;
  };

  const handleProductSelect = (index: number, productId: string) => {
    const selected = products.find((product) => product.id === productId) ?? null;
    const current = analysisResult?.items[index];
    if (current && selected) {
      void recordCorrection({ ...current, product: selected }, "corrected");
    }
    patchReviewItem(index, (item) => {
      const nextStatus: MatchStatus = selected ? "HIGH_CONFIDENCE" : "UNMATCHED";
      const dbUnit = normalizeUnitValue(selected?.unit ?? "");
      const previousUnit = normalizeUnitValue(item.unit ?? "");
      const unitNote =
        selected && dbUnit && previousUnit && previousUnit !== dbUnit
          ? `الوحدة المقروءة من الطلب: ${previousUnit}. تم استخدام وحدة قاعدة البيانات: ${dbUnit}.`
          : "";
      const nextItem = {
        ...item,
        product: selected,
        quoteName: selected?.name_ar ?? item.quoteName,
        unit: dbUnit || previousUnit || "حبة",
        priceAmount: selected ? null : item.priceAmount,
        basePriceAmount: selected ? null : item.basePriceAmount,
        basePriceUnit: selected ? selected.unit ?? "" : item.basePriceUnit,
        priceType: selected ? null : item.priceType,
        priceLabel: selected ? "جارٍ جلب السعر من قاعدة الأسعار..." : item.priceLabel,
        accepted: Boolean(selected),
        rejected: false,
        status: nextStatus,
        matchScore: selected ? 1 : null,
        matchReason: selected ? "تم اختيار المنتج من قاعدة البيانات" : "لم يتم اختيار منتج",
        notes: [item.notes, unitNote].filter(Boolean).join(" "),
      };
      return nextItem;
    });
  };

  const refreshPreviewPrices = async (items: ReviewItem[], selectedCustomerId = "") => {
    const pricedItems = items.filter((item) => !item.rejected && item.product);
    const productIds = pricedItems.map((item) => item.product!.id);
    if (!productIds.length) return;

    try {
      let customerType = "retail";
      if (selectedCustomerId) {
        const { data } = await (supabase as any)
          .from("customers")
          .select("customer_type")
          .eq("id", selectedCustomerId)
          .maybeSingle();
        customerType = data?.customer_type ?? "retail";
      }

      const uniqueProductIds = [...new Set(productIds)];
      const { data: priceRows, error: priceError } = await supabase
        .from("prices")
        .select("product_id, price_type, customer_id, amount, valid_from, valid_to, is_active")
        .in("product_id", uniqueProductIds);
      if (priceError) throw priceError;

      const now = Date.now();
      const preferredType =
        customerType === "wholesale" || customerType === "contractor" || customerType === "government"
          ? "reseller"
          : "retail";

      // Only query conversions when at least one requested unit differs from
      // the product base unit. This keeps normal/base-unit pricing independent
      // of the optional conversion table.
      const needsConversion = pricedItems.some((item) => {
        const requested = (item.unit || item.product!.unit || "حبة").trim().toLowerCase();
        const base = (item.product!.unit || requested).trim().toLowerCase();
        return requested !== base;
      });

      let conversionRows: Array<{
        from_unit: string;
        to_unit: string;
        multiplier: number;
        product_id: string | null;
      }> = [];

      if (needsConversion) {
        const [{ data: productConversions, error: productConversionError }, { data: globalConversions, error: globalConversionError }] =
          await Promise.all([
            (supabase as any)
              .from("unit_conversions")
              .select("from_unit, to_unit, multiplier, product_id")
              .in("product_id", uniqueProductIds),
            (supabase as any)
              .from("unit_conversions")
              .select("from_unit, to_unit, multiplier, product_id")
              .is("product_id", null),
          ]);
        if (productConversionError) throw productConversionError;
        if (globalConversionError) throw globalConversionError;
        conversionRows = [
          ...((globalConversions ?? []) as typeof conversionRows),
          ...((productConversions ?? []) as typeof conversionRows),
        ];
      }

      setAnalysisResult((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.map((item) => {
            if (!item.product || item.rejected || item.priceType === "manual_quote") return item;

            const rows = (priceRows ?? [])
              .filter((row) => {
                const from = new Date(row.valid_from).getTime();
                const to = row.valid_to ? new Date(row.valid_to).getTime() : null;
                return (
                  row.product_id === item.product!.id &&
                  row.is_active !== false &&
                  Number.isFinite(from) &&
                  from <= now &&
                  (!to || (Number.isFinite(to) && to > now)) &&
                  Number(row.amount) >= 0
                );
              })
              .sort((a, b) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime());

            const chosen =
              rows.find((row) => row.price_type === "customer_special" && row.customer_id === selectedCustomerId) ??
              rows.find((row) => row.price_type === preferredType && !row.customer_id) ??
              rows.find((row) => row.price_type === "retail" && !row.customer_id) ??
              rows.find((row) => row.price_type === "reseller" && !row.customer_id);

            if (!chosen) {
              return {
                ...item,
                priceAmount: null,
                basePriceAmount: null,
                basePriceUnit: item.product!.unit ?? "",
                priceType: null,
                priceLabel: "لا يوجد سعر فعال",
              };
            }

            const basePrice = Number(chosen.amount);
            const requestedUnit = (item.unit || item.product!.unit || "حبة").trim();
            const baseUnit = (item.product!.unit || requestedUnit).trim();
            const sameUnit = requestedUnit.toLowerCase() === baseUnit.toLowerCase();

            if (sameUnit) {
              return {
                ...item,
                priceAmount: Number.isFinite(basePrice) ? basePrice : null,
                basePriceAmount: Number.isFinite(basePrice) ? basePrice : null,
                basePriceUnit: baseUnit,
                priceType: chosen.price_type,
                priceLabel: getPriceLookupKey(chosen.price_type),
              };
            }

            const conversion = convertQuantity(
              1,
              requestedUnit,
              baseUnit,
              conversionRows,
              item.product!.id,
            );

            if (!conversion.converted) {
              return {
                ...item,
                // Keep the real database price visible even when the requested
                // unit has no conversion. Do not show a misleading total.
                priceAmount: Number.isFinite(basePrice) ? basePrice : null,
                basePriceAmount: Number.isFinite(basePrice) ? basePrice : null,
                basePriceUnit: baseUnit,
                priceType: chosen.price_type,
                priceLabel: getPriceLookupKey(chosen.price_type) + " / " + baseUnit + " — لا توجد تحويلة لـ " + requestedUnit,
                notes: [item.notes, conversion.reason ?? "لا توجد تحويلة للوحدة المطلوبة"].filter(Boolean).join(" "),
              };
            }

            const requestedUnitPrice = basePrice * conversion.multiplier;
            return {
              ...item,
              priceAmount: Number.isFinite(requestedUnitPrice) ? requestedUnitPrice : null,
              basePriceAmount: Number.isFinite(basePrice) ? basePrice : null,
              basePriceUnit: baseUnit,
              priceType: chosen.price_type,
              priceLabel: getPriceLookupKey(chosen.price_type),
            };
          });
        const activePricedItems = nextItems.filter((item) => item.product && !item.rejected);
        if (activePricedItems.length && activePricedItems.every((item) => Number.isFinite(Number(item.priceAmount)))) {
          setAnalysisError("");
        }
        return {
          ...prev,
          items: nextItems,
        };
      });
    } catch (error) {
      console.error("Saerha preview pricing failed", error);
      setAnalysisResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.product && !item.rejected
              ? {
                  ...item,
                  priceAmount: null,
                  priceType: null,
                  priceLabel: "تعذر جلب السعر — أعد المحاولة",
                }
              : item,
          ),
        };
      });
      setAnalysisError("تعذر جلب الأسعار من قاعدة البيانات. لم يتم اختراع أي سعر.");
    }
  };

  const pricingKey = useMemo(
    () =>
      (analysisResult?.items ?? [])
        .map((item) =>
          [
            item.id,
            item.product?.id ?? "",
            item.unit ?? "",
            item.rejected ? "rejected" : "active",
            item.priceType === "manual_quote" ? "manual" : "database",
          ].join(":"),
        )
        .join("|"),
    [analysisResult?.items],
  );

  useEffect(() => {
    if (analysisResult?.items?.length && pricingKey) {
      void refreshPreviewPrices(analysisResult.items, customerId);
    }
  }, [customerId, pricingKey]);

  const handleQuantityChange = (index: number, value: number) => {
    patchReviewItem(index, (item) => ({
      ...item,
      quantity: normalizeQuantity(value),
    }));
  };

  const handleDiscountChange = (index: number, value: number) => {
    const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
    const discount = Math.min(100, normalized);
    patchReviewItem(index, (current) => ({
      ...current,
      discountType: "percent",
      discountValue: discount,
      discountPercent: discount,
    }));
  };

  const beginDiscountEdit = (index: number) => {
    const item = analysisResult?.items[index];
    if (!item) return;
    const value = Math.min(100, Math.max(0, Number(item.discountPercent ?? item.discountValue ?? 0)));
    setDiscountDrafts((previous) => ({ ...previous, [item.id]: String(value) }));
  };

  const updateDiscountDraft = (index: number, rawValue: string) => {
    const item = analysisResult?.items[index];
    if (!item) return;
    const normalized = normalizeDecimalDraft(rawValue);
    if (!/^\d*(?:\.\d*)?$/.test(normalized)) return;
    setDiscountDrafts((previous) => ({ ...previous, [item.id]: normalized }));
  };

  const finishDiscountEdit = (index: number) => {
    const item = analysisResult?.items[index];
    if (!item) return;
    const draft = discountDrafts[item.id];
    if (draft == null) return;
    const parsed = Number(normalizeDecimalDraft(draft));
    handleDiscountChange(index, draft === "" ? 0 : parsed);
    setDiscountDrafts((previous) => {
      const next = { ...previous };
      delete next[item.id];
      return next;
    });
  };

  const handleUnitChange = (index: number, value: string) => {
    const current = analysisResult?.items[index];
    if (!current) return;
    const shouldUseDatabasePrice = Boolean(current.product) && current.priceType !== "manual_quote";
    const nextItem = {
      ...current,
      unit: value,
      priceAmount: shouldUseDatabasePrice ? null : current.priceAmount,
      priceLabel: shouldUseDatabasePrice ? "جارٍ جلب السعر من قاعدة الأسعار..." : current.priceLabel,
    };
    patchReviewItem(index, () => nextItem);
    if (nextItem.product && nextItem.priceType !== "manual_quote") {
      void refreshPreviewPrices([nextItem], customerId);
    }
  };

  const handlePriceChange = (index: number, value: number) => {
    patchReviewItem(index, (item) => ({
      ...item,
      priceAmount: Number.isFinite(value) ? Math.max(0, value) : null,
      priceType: "manual_quote",
      priceLabel: "سعر يدوي",
    }));
    // A manual price is an explicit override for this quotation.
    // Clear any earlier "missing price" warning immediately.
    setAnalysisError("");
  };

  const normalizeDecimalDraft = (value: string) =>
    value.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/,/g, ".").replace(/\s/g, "");

  const updateInvoiceDiscountDraft = (kind: "percent" | "amount", rawValue: string) => {
    const normalized = normalizeDecimalDraft(rawValue);
    if (!/^\d*(?:\.\d*)?$/.test(normalized)) return;
    if (kind === "percent") setInvoiceDiscountPercentDraft(normalized);
    else setInvoiceDiscountAmountDraft(normalized);
  };

  const finishInvoiceDiscountEdit = (kind: "percent" | "amount") => {
    const raw = kind === "percent" ? invoiceDiscountPercentDraft : invoiceDiscountAmountDraft;
    const normalized = normalizeDecimalDraft(raw);
    const parsed = Number(normalized);
    const value = normalized === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, parsed);
    if (kind === "percent") setInvoiceDiscountPercentDraft(String(Math.min(100, value)));
    else setInvoiceDiscountAmountDraft(String(value));
  };

  const getSavedLineDiscountPercent = (row: any, productSubtotal: number) => {
    const note = String(row?.notes ?? "");
    const noteMatch = note.match(/(?:خصم|discount)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (noteMatch) {
      const savedPercent = Number(noteMatch[1]);
      if (Number.isFinite(savedPercent)) return Math.min(100, Math.max(0, savedPercent));
    }

    const amount = Number(row?.discount_amount ?? 0);
    if (productSubtotal <= 0 || !Number.isFinite(amount) || amount <= 0) return 0;
    return Math.min(100, Math.max(0, Number(((amount / productSubtotal) * 100).toFixed(2))));
  };

  const getLineDiscountDetails = (item: ReviewItem) => {
    const lineSubtotal =
      item.priceAmount !== null && Number.isFinite(Number(item.priceAmount))
        ? Number(item.priceAmount) * Number(item.quantity || 0)
        : 0;
    const type = "percent" as const;
    const rawValue = Number(item.discountPercent ?? item.discountValue ?? 0);
    const value = Number.isFinite(rawValue) ? Math.min(100, Math.max(0, rawValue)) : 0;
    const discountAmount = lineSubtotal * (value / 100);
    return {
      type,
      value: type === "percent" ? Math.min(100, value) : value,
      discountAmount,
      lineTotal: Math.max(0, lineSubtotal - discountAmount),
    };
  };

  const calculateOrderTotals = (items: ReviewItem[]) => {
    const rawSubtotal = items.reduce(
      (sum, item) =>
        sum +
        (item.priceAmount !== null && Number.isFinite(Number(item.priceAmount))
          ? Number(item.priceAmount) * Number(item.quantity || 0)
          : 0),
      0,
    );

      const lineDiscountTotal = items.reduce(
      (sum, item) => sum + getLineDiscountDetails(item).discountAmount,
      0,
    );

    const afterLineDiscount = Math.max(0, rawSubtotal - lineDiscountTotal);
    const invoicePercentInput = Number(normalizeDecimalDraft(invoiceDiscountPercentDraft));
    const invoiceAmountInput = Number(normalizeDecimalDraft(invoiceDiscountAmountDraft));
    const invoicePercent = Number.isFinite(invoicePercentInput) ? Math.min(100, Math.max(0, invoicePercentInput)) : 0;
    const invoiceAmount = Number.isFinite(invoiceAmountInput) ? Math.max(0, invoiceAmountInput) : 0;
    // With both selected: percentage first, then fixed amount.
    const percentDiscountAmount =
      invoiceDiscountType === "amount" ? 0 : afterLineDiscount * (invoicePercent / 100);
    const afterInvoicePercent = Math.max(0, afterLineDiscount - percentDiscountAmount);
    const fixedDiscountAmount =
      invoiceDiscountType === "percent" ? 0 : Math.min(afterInvoicePercent, invoiceAmount);
    const invoiceDiscountAmount = Math.min(afterLineDiscount, percentDiscountAmount + fixedDiscountAmount);
    const totalDiscount = lineDiscountTotal + invoiceDiscountAmount;
    const finalTotal = Math.max(0, afterLineDiscount - invoiceDiscountAmount);

    return {
      rawSubtotal,
      lineDiscountTotal,
      afterLineDiscount,
      invoiceDiscountAmount,
      totalDiscount,
      finalTotal,
    };
  };

  const updateNumericDraft = (index: number, field: "quantity" | "price", rawValue: string) => {
    const item = analysisResult?.items[index];
    if (!item) return;

    const normalized = normalizeDecimalDraft(rawValue);
    const value =
      field === "quantity"
        ? normalized.replace(/\D/g, "")
        : normalized.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

    if (field === "quantity" ? !/^\d*$/.test(value) : !/^\d*(?:\.\d*)?$/.test(value)) {
      return;
    }

    // Keep the field editable while typing. Commit only on Enter/blur.
    setNumericDrafts((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], [field]: value },
    }));
  };

  const beginNumericEdit = (index: number, field: "quantity" | "price") => {
    const item = analysisResult?.items[index];
    if (!item) return;
    const value =
      field === "quantity"
        ? String(normalizeQuantity(Number(item.quantity ?? 0)))
        : item.priceAmount == null
          ? ""
          : String(item.priceAmount);
    setNumericDrafts((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], [field]: value },
    }));
  };

  const finishNumericEdit = (index: number, field: "quantity" | "price") => {
    const item = analysisResult?.items[index];
    if (!item) return;
    const draft = numericDrafts[item.id]?.[field];
    if (draft == null) return;

    const value = normalizeDecimalDraft(draft);
    const parsed = Number(value);

    if (value !== "" && Number.isFinite(parsed)) {
      if (field === "quantity") handleQuantityChange(index, parsed);
      else handlePriceChange(index, parsed);
    }

    setNumericDrafts((prev) => {
      const next = { ...prev };
      const current = { ...(next[item.id] ?? {}) };
      delete current[field];
      if (!current.quantity && !current.price) delete next[item.id];
      else next[item.id] = current;
      return next;
    });
  };

  const handleSaveAlias = async (index: number) => {
    const item = analysisResult?.items[index];
    if (!item?.product) return;

    const aliasText =
      item.raw_text || item.description || item.product.name_ar || item.product.name_en || "";
    if (!aliasText.trim()) return;

    const normalizedText = normalizeForMatch(aliasText);
    if (!normalizedText) return;

    try {
      await recordCorrection(item, "alias_added", true);
      setAnalysisError("");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "تعذر حفظ الاختصار.");
    }
  };


  const handlePasteOrder = async () => {
    const text = pastedOrderText.trim();
    if (!text) {
      setAnalysisError("الصق نص الطلبية أولًا.");
      return;
    }

    const file = new File([text], "طلبية-ملصقة.txt", {
      type: "text/plain",
      lastModified: Date.now(),
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    await handleFileChange({
      target: { files: transfer.files },
    } as ChangeEvent<HTMLInputElement>);
  };

  
type PdfJsModule = {
  getDocument: (options: { data: Uint8Array; disableWorker?: boolean }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: (options?: Record<string, unknown>) => Promise<{
          items: Array<{ str?: string }>;
        }>;
        getViewport: (options: { scale: number }) => { width: number; height: number };
        render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
      }>;
    }>;
  };
  GlobalWorkerOptions: { workerSrc: string };
};

let pdfJsLoader: Promise<PdfJsModule> | null = null;

function loadPdfJs(): Promise<PdfJsModule> {
  if (pdfJsLoader) return pdfJsLoader;
  const remoteImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<PdfJsModule>;
  pdfJsLoader = remoteImport(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs",
  );
  return pdfJsLoader.then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs";
    return pdfjs;
  });
}

async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfDocument = await pdfjs.getDocument({ data, disableWorker: false }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const content = await page.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });
    const pageText = content.items
      .map((item) => item.str ?? "")
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push(pageText);
  }

  return { text: pages.join("\n"), pageCount: pdfDocument.numPages };
}

async function readCanvasLocally(canvas: HTMLCanvasElement, onProgress?: (value: number) => void) {
  const worker = await getTesseractWorker(onProgress);
  const result = await worker.recognize(canvas);
  const text = result.data.text.trim();
  if (!text) throw new Error("لم يتم العثور على نص واضح في الصفحة.");
  return { text, items: parseLocalOcrText(text) };
}

async function readPdfLocally(file: File, onProgress?: (value: number) => void) {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfDocument = await pdfjs.getDocument({ data, disableWorker: false }).promise;
  const chunks: string[] = [];
  const maxPagesForOcr = Math.min(pdfDocument.numPages, 8);

  for (let pageNumber = 1; pageNumber <= maxPagesForOcr; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvasContext: context, viewport }).promise;
    try {
      const local = await readCanvasLocally(canvas, onProgress);
      if (local.text.trim()) chunks.push(local.text.trim());
    } catch {
      // Continue with the next page. A single bad page must not erase the PDF.
    }
    onProgress?.(30 + Math.round((pageNumber / maxPagesForOcr) * 20));
  }

  return chunks.join("\n");
}


function workbookToPreservedText(workbook: XLSX.WorkBook): string {
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet["!ref"];
    if (!ref) return `ورقة: ${sheetName}`;

    const range = XLSX.utils.decode_range(ref);
    const rows: string[] = [];
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const cells: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[address];
        cells.push(String(cell?.w ?? cell?.v ?? ""));
      }
      rows.push(cells.join("\t"));
    }
    return `ورقة: ${sheetName}\n${rows.join("\n")}`;
  }).join("\n\n");
}

const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    const accepted = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/vnd.ms-excel",
      "application/msword",
      "text/plain",
    ];
    const validFiles = files.filter(
      (file) =>
        accepted.includes(file.type) ||
        /\.(jpe?g|png|webp|heic|pdf|xlsx|xls|csv|txt)$/i.test(file.name),
    );

    setUploadedFiles(
      validFiles.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        status: "جاهز",
      })),
    );

    const first = validFiles[0];
    if (!first) return;

    const detectedSource: "image" | "pdf" | "excel" | "text" | "handwriting" =
      first.type === "application/pdf" || /\.pdf$/i.test(first.name)
        ? "pdf"
        : first.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            first.type === "application/vnd.ms-excel" ||
            /\.(xlsx|xls|csv)$/i.test(first.name)
          ? "excel"
          : first.type === "text/plain" || /\.txt$/i.test(first.name)
            ? "text"
            : "image";
    setOrderSource(detectedSource);
    setOrderRawText("");
    setPersistedOrderId(null);

    const analyzedKey = `${first.name}|${first.size}|${first.lastModified}`;
    if (lastAnalyzedKey === analyzedKey) {
      setAnalysisError("تم تحليل هذا الملف مسبقًا، الرجاء اختيار ملف جديد للمعالجة.");
      return;
    }

    setProgress(10);
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisResult(null);
    setLastAnalyzedKey(analyzedKey);

    try {
      let image = "";
      let text = "";

      if (first.type === "text/csv" || /\.csv$/i.test(first.name)) {
        text = await first.text();
      } else if (
        first.type === "text/plain" ||
        /\.txt$/i.test(first.name)
      ) {
        text = await first.text();
      } else if (
        first.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        first.type === "application/vnd.ms-excel" ||
        /\.(xlsx|xls)$/i.test(first.name)
      ) {
        const workbook = XLSX.read(await first.arrayBuffer(), { type: "array", cellDates: true });
        text = workbookToPreservedText(workbook);
      } else if (first.type === "application/pdf" || /\.pdf$/i.test(first.name)) {
        setProgress(20);
        const extractedPdf = await extractPdfText(first);
        text = extractedPdf.text;

        if (text.trim().length < 20) {
          setProgress(25);
          text = await readPdfLocally(first, setProgress);
          if (!text.trim()) {
            const reader = new FileReader();
            image = await new Promise<string>((resolve, reject) => {
              reader.onload = () =>
                typeof reader.result === "string"
                  ? resolve(reader.result)
                  : reject(new Error("تعذر تجهيز ملف PDF للتحليل."));
              reader.onerror = () => reject(new Error("تعذر قراءة ملف PDF."));
              reader.readAsDataURL(first);
            });
          }
        }
        setProgress(50);
      } else {
        setProgress(20);
        image = await prepareGeminiImage(first);
        setProgress(28);
        // Run the existing local OCR before Gemini as a second, auditable text
        // channel. Gemini still sees the original image and remains authoritative
        // for ambiguous handwriting; the OCR text is only supporting evidence.
        try {
          const localOcr = await readImageLocally(first, setProgress);
          text = localOcr.text;
        } catch {
          text = "";
        }
        setProgress(35);
      }

      if (!image && !text.trim()) {
        throw new Error("الملف فارغ أو لم نتمكن من استخراج محتواه.");
      }


      const { data: authSession } = await (supabase as any).auth.getSession();
      const accessToken = authSession.session?.access_token;
      if (!accessToken) {
        throw new Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.");
      }

      let rawResult: Record<string, unknown>;
      let fallbackNotice = "";
      if (first.name === "طلبية-ملصقة.txt") {
        // Pasted text is already structured input. Parse every line deterministically
        // so an LLM cannot omit rows from a customer order.
        rawResult = await parseTextOrderFallback(text);
      } else {
        try {
        const supabaseUrl =
          import.meta.env["VITE_SUPABASE_URL"] ||
          "https://ebtjwwrjhsebojurkvgy.supabase.co";

        setProgress(45);
        const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/analyze-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            image,
            fileType: first.type || first.name,
            text,
            textSource: detectedSource === "image" ? "ocr" : detectedSource,
          }),
        }, 90000);

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "تعذر تشغيل محرك القراءة الذكي.");

        if (typeof data.result === "string") {
          rawResult = JSON.parse(data.result) as Record<string, unknown>;
        } else {
          rawResult = (data.result ?? data) as Record<string, unknown>;
        }
      } catch (serverError) {
        // The AI is the primary path, but a local fallback keeps both images
        // and pasted text usable during a temporary Gemini/network failure.
        const timedOut = serverError instanceof DOMException && serverError.name === "AbortError";
        const serverMessage = serverError instanceof Error ? serverError.message.trim() : "";
        fallbackNotice = timedOut
          ? "القراءة الذكية تأخرت قليلًا؛ جارٍ تشغيل القراءة الاحتياطية."
          : serverMessage
            ? `تعذر تشغيل القراءة الذكية: ${serverMessage} — جارٍ تشغيل القراءة الاحتياطية.`
            : "تعذر تشغيل القراءة الذكية؛ جارٍ تشغيل القراءة الاحتياطية.";
        setAnalysisError(fallbackNotice);
        setProgress(30);
        if (image && /^data:image\//i.test(image)) {
          const local = await readImageLocally(first, setProgress);
          rawResult = { items: local.items, notes: `تمت قراءة الصورة محليًا. النص المستخرج: ${local.text}` };
        } else if (text.trim()) {
          const localText = await parseTextOrderFallback(text);
          if (!localText.items.length) throw serverError;
          rawResult = localText;
        } else {
          throw serverError;
        }
      }
        }

      const rawItems = Array.isArray(rawResult["items"])
        ? (rawResult["items"] as Record<string, unknown>[])
        : [];
      const normalizedItems = rawItems.map((item, index: number) => ({
        id: `${Date.now()}-${index}`,
        description: String(item["description"] ?? item["raw_text"] ?? "").trim(),
        category_ar: String(item["category_ar"] ?? "").trim(),
        normalized_description_ar: String(
          item["normalized_description_ar"] ?? item["arabic_name"] ?? item["description"] ?? item["raw_text"] ?? "",
        ).trim(),
        raw_text: String(item["raw_text"] ?? item["description"] ?? "").trim(),
        quantity: normalizeQuantity(Number(item["quantity"] ?? 0)),
        unit: String(item["unit"] ?? "").trim(),
        sourceSku: String(item["sku"] ?? "").trim(),
        sourceUnitPrice: item["unit_price"] == null ? null : Number(item["unit_price"]),
        sourceLineTotal: item["line_total"] == null ? null : Number(item["line_total"]),
        confidence: (() => {
          const value = Number(item["confidence"] ?? 0.5);
          return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
        })(),
        extractionConfidence: (() => {
          const value = Number(item["confidence"] ?? 0.5);
          return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
        })(),
        matchScore: null,
        notes: String(item["notes"] ?? "").trim(),
      }));

            // Match each extracted line against the products loaded from Supabase.
      // Keep the review state explicit so the user can confirm or correct every match.
      // Product loading runs on page mount and can still be in flight when the
      // user uploads a file immediately. Ensure matching always uses a fully
      // loaded Supabase product catalog instead of an empty/stale React state.
      let matchingProducts = products;
      let matchingAliases = productAliases;
      if (!matchingProducts.length) {
        const loaded = await loadProducts();
        matchingProducts = loaded.products;
        matchingAliases = loaded.aliases;
      }

      if (!matchingProducts.length) {
        throw new Error("تعذر تحميل قاعدة المنتجات من Supabase؛ لا يمكن إجراء المطابقة بأمان.");
      }

      const catalogSkus = new Set(matchingProducts.map((product) => normalizeForMatch(product.sku)));
      const sourceLines = parseOrderSourceLines(text, catalogSkus);
      const sourceDataLines = sourceLines.filter(
        (row) => !/^(?:الصنف|الكمية|الطلبية|البيان|item|product|quantity)\b/i.test(row.rawLine),
      );

      // Never fuzzy-align one extracted item to a nearby source line. That can
      // move a quantity/color from one repeated row to another. For text-like
      // inputs the original line is authoritative; for images/handwriting the
      // model's own raw OCR line is the source evidence, with local OCR only as
      // an index-preserving fallback when counts are identical.
      const sourceKind =
        detectedSource === "text" || detectedSource === "pdf" || detectedSource === "excel"
          ? "original_text" as const
          : "ai_ocr" as const;

      const usedOriginalSourceIndices = new Set<number>();
      const matchedItems: ReviewItem[] = normalizedItems.map((item, itemIndex) => {
        let effectiveRawText = "";
        let effectiveSourceKind: "original_text" | "ai_ocr" | "local_ocr" | "unavailable" = "unavailable";
        let sourceIndex: number | null = null;
        let sourceAlignmentScore = 0;

        if (sourceKind === "original_text") {
          const normalizedAiRaw = normalizeForMatch(item.raw_text || "");
          const exactSource = normalizedAiRaw
            ? sourceDataLines.find(
                (row) =>
                  !usedOriginalSourceIndices.has(row.index) &&
                  normalizeForMatch(row.rawLine) === normalizedAiRaw,
              )
            : null;
          const indexedSource = sourceDataLines[itemIndex];
          const chosenSource =
            exactSource ??
            (indexedSource && !usedOriginalSourceIndices.has(indexedSource.index) ? indexedSource : null);
          if (chosenSource) {
            usedOriginalSourceIndices.add(chosenSource.index);
            effectiveRawText = chosenSource.rawLine;
            effectiveSourceKind = "original_text";
            sourceIndex = chosenSource.index;
            sourceAlignmentScore = exactSource ? 1 : 0.95;
          }
        } else if (item.raw_text.trim()) {
          effectiveRawText = item.raw_text.trim();
          effectiveSourceKind = "ai_ocr";
          sourceIndex = itemIndex;
          sourceAlignmentScore = 1;
        } else if (sourceLines.length === normalizedItems.length && sourceLines[itemIndex]) {
          const fallbackSource = sourceLines[itemIndex];
          effectiveRawText = fallbackSource.rawLine;
          effectiveSourceKind = "local_ocr";
          sourceIndex = fallbackSource.index;
          sourceAlignmentScore = 0.75;
        }

        // SKU is a primary identity key, not a fuzzy-search hint. When the
        // OCR/AI row and the parsed source disagree on position, locate the exact
        // source row by its catalog SKU before doing any name matching.
        const rawItemSignals = extractOrderLineSignals(item.raw_text || "", catalogSkus);
        const currentSourceSignals = extractOrderLineSignals(effectiveRawText, catalogSkus);
        const skuHint =
          rawItemSignals.sku ||
          String(item.sourceSku ?? "").trim() ||
          currentSourceSignals.sku;
        if (skuHint) {
          const skuSource = sourceDataLines.find(
            (row) =>
              !usedOriginalSourceIndices.has(row.index) &&
              row.signals.sku === skuHint,
          );
          if (skuSource && skuSource.index !== sourceIndex) {
            if (sourceIndex != null) usedOriginalSourceIndices.delete(sourceIndex);
            usedOriginalSourceIndices.add(skuSource.index);
            effectiveRawText = skuSource.rawLine;
            effectiveSourceKind = sourceKind === "original_text" ? "original_text" : "local_ocr";
            sourceIndex = skuSource.index;
            sourceAlignmentScore = 1;
          }
        }

        const evidenceRawLine =
          effectiveRawText && currentSourceSignals.sku
            ? effectiveRawText
            : rawItemSignals.sku
              ? item.raw_text
              : effectiveRawText || item.raw_text;
        const evidence = reconcileOrderLineEvidence(
          evidenceRawLine,
          item.quantity,
          item.unit,
          catalogSkus,
        );
        const evidenceIssues = [...evidence.issues];

        // For images/handwriting, corroborate the model's raw OCR line with the
        // independent local OCR at the same row when the row counts agree.
        // Only explicit hard-attribute conflicts are flagged; a missing OCR
        // attribute is not treated as a contradiction.
        if (
          sourceKind !== "original_text" &&
          effectiveSourceKind === "ai_ocr" &&
          sourceLines.length === normalizedItems.length &&
          sourceLines[itemIndex]
        ) {
          const peerRaw = sourceLines[itemIndex].rawLine;
          const aiHard = extractMatchConstraints(effectiveRawText);
          const ocrHard = extractMatchConstraints(peerRaw);
          const sameSet = (a: string[], b: string[]) =>
            a.length === b.length && a.every((value) => b.includes(value));
          if (aiHard.colors.length && ocrHard.colors.length && !sameSet(aiHard.colors, ocrHard.colors)) {
            evidenceIssues.push("تعارض لون بين قراءتي الصورة؛ لم يتم اعتماد اللون تلقائيًا.");
          }
          if (aiHard.metricSizes.length && ocrHard.metricSizes.length && !sameSet(aiHard.metricSizes, ocrHard.metricSizes)) {
            evidenceIssues.push("تعارض مقاس بين قراءتي الصورة؛ لم يتم اعتماد المقاس تلقائيًا.");
          }
          if (aiHard.cores.length && ocrHard.cores.length && !sameSet(aiHard.cores, ocrHard.cores)) {
            evidenceIssues.push("تعارض عدد القلوب بين قراءتي الصورة؛ لم يتم اعتماد المطابقة تلقائيًا.");
          }
          const peerSignals = reconcileOrderLineEvidence(peerRaw, null, null, catalogSkus).signals;
          if (
            evidence.quantity != null &&
            peerSignals.quantity != null &&
            evidence.quantity !== peerSignals.quantity
          ) {
            evidenceIssues.push("تعارض كمية بين قراءتي المصدر؛ لم يتم اعتماد البند تلقائيًا.");
          }
          if (
            evidence.unit &&
            peerSignals.unit &&
            evidence.unit !== peerSignals.unit
          ) {
            evidenceIssues.push("تعارض وحدة بين قراءتي المصدر؛ لم يتم اعتماد البند تلقائيًا.");
          }
        }

        const sourceSignals = { ...evidence.signals, issues: evidenceIssues };
        const productQuery = effectiveRawText
          ? stripOrderPrefix(effectiveRawText, catalogSkus)
          : stripOrderPrefix(item.raw_text || item.description, catalogSkus);
        const commercialUnit = sourceSignals.unit;
        const searchQuery = [productQuery, commercialUnit].filter(Boolean).join(" ").trim();
        const marketTranslationAr = getMarketArabicTranslation(searchQuery);

        // Exact SKU match always resolves to the real catalog row. This bypasses
        // fuzzy ranking when the customer/OCR already supplied a catalog code,
        // preventing a valid coded item from becoming "needs review".
        const skuResolution = resolveProductBySkuCandidates(
          [
            item.sourceSku,
            rawItemSignals.sku,
            sourceSignals.sku,
            currentSourceSignals.sku,
          ],
          matchingProducts,
        );
        const exactSkuProduct = skuResolution.product;
        const identitySku =
          skuResolution.sku ||
          String(item.sourceSku ?? rawItemSignals.sku ?? sourceSignals.sku ?? "").trim();

        if (skuResolution.conflict) {
          evidenceIssues.push(
            `تعارض أكواد المصدر: ${skuResolution.candidates.join(" / ")}؛ لم يتم اختيار منتج تلقائيًا.`,
          );
        }

        const match = exactSkuProduct && !skuResolution.conflict
          ? {
              product: exactSkuProduct,
              score: 1,
              status: "HIGH_CONFIDENCE" as const,
              reason: "مطابقة مباشرة لكود الصنف الموجود في قاعدة البيانات",
              candidates: [{
                id: exactSkuProduct.id,
                sku: exactSkuProduct.sku,
                name_ar: exactSkuProduct.name_ar,
                score: 1,
                reason: "كود الصنف مطابق مباشرة",
              }],
            }
          : searchQuery
            ? findLocalProductMatch(searchQuery, matchingProducts, marketTranslationAr, matchingAliases)
            : null;

        const selectedMatch = match;
        const sourceQuantityKnown = sourceSignals.quantity != null && sourceSignals.quantity > 0;
        const sourceUnitKnown = Boolean(sourceSignals.unit);
        const sourceEvidenceSafe =
          effectiveSourceKind !== "unavailable" &&
          sourceQuantityKnown &&
          sourceUnitKnown &&
          !evidenceIssues.some((issue) => /لم يتم اعتمادها|لا تطابق|أكثر من زوج|تعارض/.test(issue));

        const selectedProduct =
          selectedMatch &&
          selectedMatch.status === "HIGH_CONFIDENCE" &&
          !skuResolution.conflict &&
          (Boolean(exactSkuProduct) || sourceEvidenceSafe)
            ? selectedMatch.product
            : null;
        const confidence = selectedMatch
          ? Math.min(1, Math.max(0, selectedMatch.score))
          : 0;
        const status: MatchStatus = selectedProduct && confidence >= 0.86
          ? "HIGH_CONFIDENCE"
          : selectedMatch
            ? "NEEDS_REVIEW"
            : "UNMATCHED";

        const matchReason = exactSkuProduct && selectedProduct
          ? "مطابقة مباشرة لكود الصنف الموجود في قاعدة البيانات"
          : !selectedMatch
            ? !effectiveRawText
              ? "لا يوجد سطر مصدر قابل للتدقيق؛ لم يتم اختيار منتج أو كمية تلقائيًا."
              : "لم يتم العثور على منتج مطابق؛ لم يتم اختراع منتج من خارج القاعدة."
            : !sourceQuantityKnown
              ? "تعذر إثبات كمية الطلب من نص السطر المصدر؛ لم تُستخدم كمية القراءة الذكية."
              : !sourceUnitKnown
                ? "تعذر إثبات وحدة الطلب من نص السطر المصدر؛ لم تُستخدم وحدة القراءة الذكية."
                : !sourceEvidenceSafe
                  ? "يوجد تعارض بين القراءة الذكية ودليل السطر المصدر؛ تُرك البند للمراجعة."
                  : selectedMatch.status === "HIGH_CONFIDENCE" && selectedProduct
                    ? "مطابقة آمنة: خصائص السطر المصدر تطابق سجلًا حقيقيًا في قاعدة المنتجات."
                    : selectedMatch.reason;

        return {
          ...item,
          description: selectedProduct?.name_ar ?? (productQuery || item.description || item.raw_text),
          normalized_description_ar: marketTranslationAr,
          quoteName: selectedProduct?.name_ar ?? undefined,
          quantity: sourceSignals.quantity != null ? normalizeQuantity(sourceSignals.quantity) : 0,
          confidence,
          extractionConfidence: item.extractionConfidence ?? item.confidence,
          matchScore: selectedMatch?.score ?? null,
          product: selectedProduct,
          sourceSku: identitySku || String(item.sourceSku ?? "").trim(),
          sourceTrace: {
            raw_line: effectiveRawText,
            source_kind: effectiveSourceKind,
            source_index: sourceIndex,
            alignment_score: sourceAlignmentScore,
            quantity_raw: sourceSignals.quantityRaw,
            unit_raw: sourceSignals.unitRaw,
            quantity_span: sourceSignals.quantitySpan,
            unit_span: sourceSignals.unitSpan,
            sku: identitySku,
            ai_quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null,
            ai_unit: String(item.unit ?? ""),
            quantity_source: evidence.quantitySource,
            unit_source: evidence.unitSource,
            issues: evidenceIssues,
          },
          sourceUnitPrice: item.sourceUnitPrice ?? null,
          sourceLineTotal: item.sourceLineTotal ?? null,
          matchCandidates: selectedMatch?.candidates,
          unit: sourceSignals.unit || "",
          matchReason,
          status,
          rejected: false,
          accepted: Boolean(selectedProduct && status === "HIGH_CONFIDENCE"),
          priceAmount: null,
          priceType: null,
          priceLabel: "جاري جلب السعر...",
        };
      });
      setAnalysisError(fallbackNotice);
      setAnalysisResult({
        items: matchedItems,
        notes: String(rawResult["notes"] ?? "").trim(),
      });
      setOrderRawText(
        text.trim() ||
          matchedItems
            .map((item) => item.raw_text || item.description)
            .filter(Boolean)
            .join("\n"),
      );
      void refreshPreviewPrices(matchedItems, customerId);
      setProgress(100);
    } catch (error) {
      setAnalysisError((error as Error)?.message ?? "حدث خطأ أثناء تحليل الطلبية.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createQuoteFromAnalysis = async () => {
    if (!analysisResult?.items?.length || !customerId) {
      setAnalysisError("اختر عميلًا ثم أنشئ العرض.");
      return;
    }

    const validItems = analysisResult.items.filter(
      (item) =>
        !item.rejected &&
        item.product &&
        item.quantity > 0 &&
        item.status === "HIGH_CONFIDENCE" &&
        item.accepted,
    );
    if (!validItems.length) {
      setAnalysisError("لا توجد عناصر مؤكدة ومطابقة لإنشاء عرض السعر بعد المراجعة.");
      return;
    }

    try {
      const { data: customerRow, error: customerError } = await supabase
        .from("customers")
        .select("id, customer_type")
        .eq("id", customerId)
        .maybeSingle();
      if (customerError) throw customerError;
      if (!customerRow) throw new Error("العميل غير موجود.");

      const productIds = validItems.map((item) => item.product!.id);
      const [{ data: priceRows, error: priceError }, { data: conversionRows, error: conversionError }] =
        await Promise.all([
          (supabase as any)
            .from("prices")
            .select("id, product_id, price_type, customer_id, amount, currency, source, valid_from, valid_to")
            .in("product_id", productIds)
            .order("valid_from", { ascending: false }),
          (supabase as any)
            .from("unit_conversions")
            .select("from_unit, to_unit, multiplier, product_id")
            .or(`product_id.is.null,product_id.in.(${productIds.join(",")})`),
        ]);
      if (priceError) throw priceError;
      if (conversionError) throw conversionError;

      const preferredType =
        customerRow.customer_type === "wholesale" ||
        customerRow.customer_type === "contractor" ||
        customerRow.customer_type === "government"
          ? "reseller"
          : "retail";

      const now = new Date();
      const quoteLines = validItems.map((item) => {
        const productId = item.product!.id;
        const rows = (priceRows ?? []).filter((row) => {
          const validFrom = new Date(row.valid_from);
          const validTo = row.valid_to ? new Date(row.valid_to) : null;
          return (
            row.product_id === productId &&
            !Number.isNaN(validFrom.getTime()) &&
            validFrom.getTime() <= now.getTime() &&
            (!validTo ||
              (!Number.isNaN(validTo.getTime()) && validTo.getTime() > now.getTime())) &&
            Number(row.amount) >= 0
          );
        });
        const customerSpecial = rows
          .filter((row) => row.price_type === "customer_special" && row.customer_id === customerId)
          .sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];
        const preferred = rows
          .filter((row) => row.price_type === preferredType && !row.customer_id)
          .sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];
        const retail = rows
          .filter((row) => row.price_type === "retail" && !row.customer_id)
          .sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];
        const reseller = rows
          .filter((row) => row.price_type === "reseller" && !row.customer_id)
          .sort((a, b) => String(b.valid_from).localeCompare(String(a.valid_from)))[0];
        const manualPrice =
          item.priceType === "manual_quote" && Number.isFinite(Number(item.priceAmount)) && Number(item.priceAmount) >= 0
            ? Number(item.priceAmount)
            : null;
        const chosen = customerSpecial ?? preferred ?? retail ?? reseller ?? null;
        const requestedUnit = item.unit || item.product!.unit || "حبة";

        // When editing an existing quotation, preserve its saved quantity, unit,
        // and price unless the user explicitly changed them in the table.
        // Re-looking up current prices or applying unit conversions here could
        // silently change an old quotation just by opening and saving it.
        if (editingQuoteId && item.priceAmount !== null && Number.isFinite(Number(item.priceAmount))) {
          return {
            ...item,
            quantity: normalizeQuantity(Number(item.quantity)),
            unit: requestedUnit,
            priceAmount: Number(item.priceAmount),
            priceType: item.priceType ?? "retail",
            priceLabel: item.priceType === "manual_quote" ? "سعر يدوي" : getPriceLookupKey(item.priceType ?? "retail"),
          };
        }

        if (manualPrice !== null) {
          return {
            ...item,
            quantity: normalizeQuantity(Number(item.quantity)),
            unit: requestedUnit,
            priceAmount: manualPrice,
            priceType: "manual_quote",
            priceLabel: "سعر يدوي",
          };
        }

        const conversion = convertQuantity(
          Number(item.quantity),
          requestedUnit,
          item.product!.unit || requestedUnit,
          (conversionRows ?? []) as unknown as Array<{
            from_unit: string;
            to_unit: string;
            multiplier: number;
            product_id: string | null;
          }>,
          productId,
        );
        if (!chosen) {
          return {
            ...item,
            priceAmount: null,
            priceType: null,
            priceLabel: "لا يوجد سعر مناسب",
            quantity: normalizeQuantity(conversion.quantity),
            unit: requestedUnit,
          };
        }

        // A database price is still a valid price even when the requested
        // display unit has no conversion. The preview uses this same database
        // price, so saving must not incorrectly report "no price".
        const hasUnitConversion = conversion.converted;
        const savedUnitPrice = hasUnitConversion
          ? Number(chosen.amount) * conversion.multiplier
          : Number(chosen.amount);

        return {
          ...item,
          quantity: hasUnitConversion ? conversion.quantity : normalizeQuantity(Number(item.quantity)),
          unit: requestedUnit,
          priceAmount: Number.isFinite(savedUnitPrice) ? savedUnitPrice : null,
          priceType: chosen.price_type,
          priceLabel: getPriceLookupKey(chosen.price_type) + (hasUnitConversion ? "" : " / " + (item.product!.unit || requestedUnit)),
          notes: !hasUnitConversion && requestedUnit !== (item.product!.unit || requestedUnit)
            ? [item.notes, "السعر من قاعدة الأسعار بوحدة " + (item.product!.unit || requestedUnit) + " — لا توجد تحويلة للوحدة المطلوبة"].filter(Boolean).join(" ")
            : item.notes,
        };
      });

      const missingPrices = quoteLines.filter(
        (line) => line.priceAmount === null || !Number.isFinite(line.priceAmount),
      );
      if (missingPrices.length > 0) {
        setAnalysisError("بعض البنود لا يوجد لها سعر مناسب في قاعدة الأسعار الحالية.");
        return;
      }

      const orderTotals = calculateOrderTotals(quoteLines);

      if (editingQuoteId) {
        const { data: existingQuote, error: existingQuoteError } = await (supabase as any)
          .from("quotations")
          .select("id, order_id")
          .eq("id", editingQuoteId)
          .maybeSingle();
        if (existingQuoteError) throw existingQuoteError;
        if (!existingQuote) throw new Error("عرض السعر الذي تريد تعديله لم يعد موجودًا.");

        const { error: updateQuoteError } = await (supabase as any)
          .from("quotations")
          .update({
            customer_id: customerId,
            price_type: quoteLines[0]?.priceType ?? "retail",
            discount_amount: orderTotals.totalDiscount,
            tax_amount: 0,
            subtotal: orderTotals.rawSubtotal,
            total: orderTotals.finalTotal,
            currency: "KWD",
            status: "draft",
            notes: [
              "تم تعديل عرض السعر بعد مراجعة المنتج والسعر.",
              orderTotals.lineDiscountTotal > 0
                ? "خصم الأصناف: " + orderTotals.lineDiscountTotal.toFixed(3) + " د.ك"
                : "",
              orderTotals.invoiceDiscountAmount > 0
                ? "خصم الفاتورة: " +
                  (invoiceDiscountType === "percent"
                    ? Number(invoiceDiscountPercentDraft || 0).toFixed(3) + "%"
                    : invoiceDiscountType === "amount"
                      ? Number(invoiceDiscountAmountDraft || 0).toFixed(3) + " د.ك"
                      : Number(invoiceDiscountPercentDraft || 0).toFixed(3) + "% + " +
                        Number(invoiceDiscountAmountDraft || 0).toFixed(3) + " د.ك")
                : "",
              analysisResult.notes?.trim() || "",
            ].filter(Boolean).join(" — "),
          })
          .eq("id", editingQuoteId);
        if (updateQuoteError) throw updateQuoteError;

        const { error: deleteItemsError } = await (supabase as any)
          .from("quotation_items")
          .delete()
          .eq("quotation_id", editingQuoteId);
        if (deleteItemsError) throw deleteItemsError;

        const itemRows: Array<Database["public"]["Tables"]["quotation_items"]["Insert"]> =
          quoteLines.flatMap((line, index) => {
            if (!line.product) return [];
            return [
              {
                quotation_id: editingQuoteId,
                line_no: index + 1,
                product_id: line.product.id,
                product_name: line.quoteName?.trim() || line.product.name_ar,
                sku: line.product.sku,
                quantity: Number(line.quantity || 0),
                unit: line.unit || line.product.unit || "حبة",
                unit_price: Number(line.priceAmount ?? 0),
                discount_amount: getLineDiscountDetails(line).discountAmount,
                line_total: getLineDiscountDetails(line).lineTotal,
                applied_price_type: (line.priceType ?? "retail") as
                  "retail" | "reseller" | "customer_special" | "manual_quote",
                is_manual_price: line.priceType === "manual_quote",
                notes: "سعر " + line.priceLabel + " — خصم " + Number(getLineDiscountDetails(line).value || 0).toFixed(2) + "%",
              },
            ];
          });

        const { error: itemsError } = await (supabase as any)
          .from("quotation_items")
          .insert(itemRows);
        if (itemsError) throw itemsError;

        if (existingQuote.order_id) {
          await (supabase as any)
            .from("orders")
            .update({
              customer_id: customerId,
              updated_at: new Date().toISOString(),
              status: "priced",
            })
            .eq("id", existingQuote.order_id);
        }

        setAnalysisError("");
        const referenceLabel = editingQuoteReference ? '"' + editingQuoteReference + '" ' : "";
        alert("تم حفظ تعديلات عرض السعر " + referenceLabel + "بنجاح.");
        return;
      }

      // Persist the reviewed customer request before creating the quotation.
      // The order remains "in_review" until the quotation and its lines are saved.
      let orderId = persistedOrderId;
      if (!orderId) {
        const orderReference = `O-${Date.now()}`;
        const { data: order, error: orderError } = await (supabase as any)
          .from("orders")
          .insert({
            reference: orderReference,
            customer_id: customerId,
            source: orderSource,
            status: "in_review",
            raw_text: orderRawText.trim() || validItems.map((item) => item.raw_text || item.description).filter(Boolean).join("\n"),
            notes: [
              "تم حفظ الطلب بعد مراجعة المنتجات وقبل إنشاء عرض السعر.",
              analysisResult.notes?.trim() || "",
            ].filter(Boolean).join(" — "),
          })
          .select("id")
          .single();
        if (orderError) throw orderError;
        orderId = order.id;
        setPersistedOrderId(orderId);

        const orderItemRows = validItems.map((line, index) => ({
          order_id: orderId,
          product_id: line.product!.id,
          line_no: index + 1,
          raw_name: line.raw_text || line.description,
          matched_sku: line.product!.sku,
          quantity: Number(line.quantity || 0),
          unit: line.unit || line.product!.unit || "حبة",
          notes: line.notes || line.matchReason || null,
          brand: line.product!.brand || null,
          unit_price: Number(line.priceAmount ?? 0),
          line_total: getLineDiscountDetails(line).lineTotal,
          extra: {
            confidence: line.confidence,
            extraction_confidence: line.extractionConfidence ?? null,
            match_score: line.matchScore ?? line.confidence ?? null,
            match_status: line.status,
            match_reason: line.matchReason || null,
            selected_product_id: line.product!.id,
            accepted: line.accepted,
            source_sku: line.sourceSku || null,
            source_unit_price: line.sourceUnitPrice ?? null,
            source_line_total: line.sourceLineTotal ?? null,
            match_candidates: line.matchCandidates ?? [],
            source_trace: line.sourceTrace ?? null,
          },
        }));

        const { error: orderItemsError } = await (supabase as any)
          .from("order_items")
          .insert(orderItemRows);
        if (orderItemsError) throw orderItemsError;
      }

      const { data: quote, error: quoteError } = await supabase
        .from("quotations")
        .insert({
          reference: `Q-${Date.now()}`,
          customer_id: customerId,
          order_id: orderId,
          issue_date: new Date().toISOString().slice(0, 10),
          expiry_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          price_type: quoteLines[0]?.priceType ?? "retail",
          discount_amount: orderTotals.totalDiscount,
          tax_amount: 0,
          subtotal: orderTotals.rawSubtotal,
          total: orderTotals.finalTotal,
          currency: "KWD",
          status: "draft",
          notes: [
            "تم إنشاء العرض من الطلبية بعد مراجعة المنتج وسعره.",
            orderTotals.lineDiscountTotal > 0
              ? `خصم الأصناف: ${orderTotals.lineDiscountTotal.toFixed(3)} د.ك`
              : "",
            orderTotals.invoiceDiscountAmount > 0
              ? `خصم الفاتورة: ${invoiceDiscountType === "percent"
                ? `${Number(invoiceDiscountPercentDraft || 0).toFixed(3)}%`
                : invoiceDiscountType === "amount"
                  ? `${Number(invoiceDiscountAmountDraft || 0).toFixed(3)} د.ك`
                  : `${Number(invoiceDiscountPercentDraft || 0).toFixed(3)}% + ${Number(invoiceDiscountAmountDraft || 0).toFixed(3)} د.ك`}`
              : "",
          ].filter(Boolean).join(" — "),
        })
        .select()
        .single();

      if (quoteError) throw quoteError;

      const itemRows: Array<Database["public"]["Tables"]["quotation_items"]["Insert"]> =
        quoteLines.flatMap((line, index) => {
          if (!line.product) return [];
          return [
            {
              quotation_id: quote.id,
              line_no: index + 1,
              product_id: line.product.id,
              product_name: line.quoteName?.trim() || line.product.name_ar,
              sku: line.product.sku,
              quantity: Number(line.quantity || 0),
              unit: line.unit || line.product.unit || "حبة",
              unit_price: Number(line.priceAmount ?? 0),
              discount_amount: getLineDiscountDetails(line).discountAmount,
              line_total: getLineDiscountDetails(line).lineTotal,
              applied_price_type: (line.priceType ?? "retail") as
                "retail" | "reseller" | "customer_special" | "manual_quote",
              is_manual_price: line.priceType === "manual_quote",
              notes: `سعر ${line.priceLabel}`,
            },
          ];
        });

      const { error: itemsError } = await (supabase as any).from("quotation_items").insert(itemRows);
      if (itemsError) throw itemsError;

      const { error: orderStatusError } = await (supabase as any)
        .from("orders")
        .update({
          status: "priced",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (orderStatusError) throw orderStatusError;

      setPersistedOrderId(null);
      setAnalysisError("");
      alert("تم حفظ عرض السعر " + quote.reference + " وربطه بالطلب بنجاح.");
      window.location.assign(`${import.meta.env.BASE_URL}quotes`);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "تعذّر إنشاء عرض السعر.");
    }
  };

  return (
    <AppShell
      title={editingQuoteId ? "تعديل عرض السعر" : "طلبية جديدة"}
      subtitle={editingQuoteId ? "فتح عرض سعر محفوظ وتعديل أصنافه وأسعاره ثم حفظ التعديلات." : "رفع طلبية العميل والمرور بمطابقة منتجات حقيقية ثم إنشاء عرض سعر."}
    >
      <div className="space-y-5">
        {editingQuoteLoading ? (
          <Card className="border-2 border-primary/20 bg-background shadow-card">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              جارٍ فتح عرض السعر وتجهيز بياناته للتعديل...
            </CardContent>
          </Card>
        ) : null}

        {!editingQuoteId && <Card className="border-2 border-dashed border-accent/50 bg-accent-soft/40 shadow-card">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-raised">
              <Upload className="h-8 w-8" />
            </div>
            <div>
              <p className="text-base font-extrabold">رفع طلبية</p>
              <p className="mt-1 text-xs text-muted-foreground">
                اختر ملفًا واحدًا أو أكثر من أنواع: JPG · PNG · WEBP · HEIC · PDF · XLSX · CSV · TXT.
              </p>
            </div>
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,.xlsx,.xls,.csv,.txt"
              multiple
              className="h-12 cursor-pointer text-sm"
              onChange={handleFileChange}
              disabled={isAnalyzing}
            />
            {uploadedFiles.length > 0 && (
              <div className="w-full space-y-2 text-right">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="rounded-lg border bg-card p-2 text-xs text-muted-foreground"
                  >
                    <div className="flex justify-between">
                      <span>{file.name}</span>
                      <span>{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px]">{file.status}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>}

        {!editingQuoteId && <Card className="border-2 border-primary/20 bg-background shadow-card">
          <CardContent className="p-5">
            <div className="mb-3">
              <p className="text-base font-extrabold">أو الصق الطلبية كنص</p>
              <p className="mt-1 text-xs text-muted-foreground">
                الصق الجدول كما وصلك من واتساب أو Excel أو البريد. سعّرها سيقرأ رقم الصنف والاسم والكمية والوحدة، ثم يطابق الأصناف مع قاعدة البيانات.
              </p>
            </div>
            <Textarea
              value={pastedOrderText}
              onChange={(event) => setPastedOrderText(event.target.value)}
              placeholder={"مثال:\nم\tالصنف\tالكمية\n1\tبايب عدساني 20 مم\t6 رول\n2\tسكت 20 مم\t2 كرتون"}
              className="min-h-44 font-mono text-sm leading-7"
              dir="rtl"
              disabled={isAnalyzing}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                لا تحتاج إلى تنسيق خاص؛ سيحاول النظام فهم الصفوف حتى لو كانت مفصولة بمسافات أو Tab.
              </p>
              <Button type="button" onClick={handlePasteOrder} disabled={isAnalyzing || !pastedOrderText.trim()}>
                <PenLine className="ml-1 h-4 w-4" />
                تحليل الطلبية الملصقة
              </Button>
            </div>
          </CardContent>
        </Card>}

        {(isAnalyzing || analysisError || analysisResult) && (
          <Card className="mb-5 border-2 border-accent/30">
            <CardContent className="p-5">
              <div className="mb-5 rounded-xl border-2 border-primary/15 bg-background p-4 shadow-sm" dir="rtl">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground">بيانات العرض</p>
                    <h3 className="mt-1 text-xl font-black text-primary">
                      {editingQuoteId ? "تعديل عرض السعر " + (editingQuoteReference ?? "") : "عرض سعر جديد"}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {editingQuoteId
                        ? "رقم العرض محفوظ ويمكنك تعديل بيانات العميل والأصناف ثم حفظ التعديلات."
                        : "اختر العميل أو أضف عميلاً جديدًا مباشرة من هنا."}
                    </p>
                  </div>

                  <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:max-w-2xl">
                    <div className="space-y-2">
                      <Label>العميل</Label>
                      <div className="flex gap-2">
                        <Select value={customerId} onValueChange={setCustomerId} disabled={customersLoading}>
                          <SelectTrigger className="h-12 min-w-0 flex-1 font-bold">
                            <SelectValue
                              placeholder={customersLoading ? "جاري تحميل العملاء..." : "اختر عميلاً"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name}{customer.phone ? " — " + customer.phone : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          className="h-12 shrink-0 gap-1 font-extrabold"
                          onClick={() => {
                            setNewCustomerError("");
                            setCustomerDialogOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                          عميل جديد
                        </Button>
                      </div>
                      {customersError && <p className="text-xs text-destructive">{customersError}</p>}
                    </div>

                    <div className="space-y-2 sm:min-w-44">
                      <Label>رقم العرض</Label>
                      <div className="flex h-12 items-center rounded-md border bg-muted/30 px-3 font-black tabular-nums">
                        {editingQuoteReference ?? "سيُنشأ عند حفظ العرض"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isAnalyzing && (
                <p className="text-sm text-muted-foreground">
                  جارٍ تحليل الملف والمطابقة الذكية مع قاعدة المنتجات...
                </p>
              )}
              {analysisError && (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  {analysisError}
                </p>
              )}
              {analysisResult && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button type="button" variant="destructive" size="sm" onClick={handleClearCurrentOrder}>
                      <Trash2 className="ml-2 h-4 w-4" />
                      حذف الطلبية الحالية
                    </Button>
                  </div>
                  {analysisResult.items?.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                      <div className="border-b bg-muted/40 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-extrabold">جدول الأصناف والأسعار</p>
                            <p className="text-xs text-muted-foreground">
                              تمت مطابقة الأصناف وعرض أسعار قاعدة البيانات تلقائيًا. اضغط مباشرة على الصنف أو الكود أو الكمية أو الوحدة أو السعر للتعديل أو الاختيار.
                            </p>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {analysisResult.items.length} صنف
                          </p>
                        </div>
                      </div>

                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[900px] text-sm" dir="rtl">
                          <thead className="bg-muted/60 text-xs font-extrabold">
                            <tr>
                              <th className="px-3 py-3 text-right">الكود</th>
                              <th className="px-3 py-3 text-right">الصنف</th>
                              <th className="px-3 py-3 text-right">الكمية</th>
                              <th className="px-3 py-3 text-right">الوحدة</th>
                              <th className="px-3 py-3 text-right">السعر</th>
                              <th className="px-3 py-3 text-right">الخصم %</th>
                              <th className="px-3 py-3 text-right">الإجمالي</th>
                              <th className="px-3 py-3 text-right">الإجراء</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {analysisResult.items.map((item, index) => {
                              const displayName =
                                item.quoteName?.trim() ||
                                item.product?.name_ar ||
                                item.description ||
                                item.raw_text ||
                                "صنف غير محدد";
                              const lineSubtotal =
                                item.priceAmount !== null && Number.isFinite(Number(item.priceAmount))
                                  ? Number(item.priceAmount) * Number(item.quantity || 0)
                                  : null;
                              const discountDetails = getLineDiscountDetails(item);
                              const discountAmount = lineSubtotal !== null ? discountDetails.discountAmount : 0;
                              const lineTotal = lineSubtotal !== null ? discountDetails.lineTotal : null;

                              return (
                                <tr
                                  key={item.id}
                                >
                                  <td className="px-3 py-3 align-top">
                                    <Input
                                      ref={(node) => { keyboardFieldRefs.current[`${item.id}:sku`] = node; }}
                                      type="text"
                                      inputMode="numeric"
                                      value={skuDrafts[item.id] ?? item.product?.sku ?? item.sourceSku ?? ""}
                                      onFocus={(event) => {
                                        beginSkuEdit(index);
                                        event.currentTarget.select();
                                      }}
                                      onChange={(event) => {
                                        setSkuDrafts((previous) => ({
                                          ...previous,
                                          [item.id]: event.target.value,
                                        }));
                                        setSkuErrors((previous) => {
                                          if (!previous[item.id]) return previous;
                                          const next = { ...previous };
                                          delete next[item.id];
                                          return next;
                                        });
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          const matched = finishSkuEdit(index);
                                          if (matched) {
                                            focusOrderField(index, "quantity");
                                          }
                                        }
                                      }}
                                      placeholder="الكود / الباركود"
                                      className="h-10 w-32 font-mono font-extrabold tabular-nums"
                                      aria-label="الكود أو الباركود"
                                      title="تحرير الكود ثم اضغط Enter"
                                    />
                                    <div className="mt-1 text-[10px] text-muted-foreground">
                                      اكتب الكود ثم Enter
                                    </div>
                                    {skuErrors[item.id] && (
                                      <p className="mt-1 text-[10px] font-semibold text-destructive">
                                        {skuErrors[item.id]}
                                      </p>
                                    )}
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                    <div className="relative min-w-[300px]">
                                      <button
                                        ref={(node) => {
                                          keyboardFieldRefs.current[`${item.id}:product`] = node;
                                        }}
                                        type="button"
                                        className={openProductPickerId === item.id
                                          ? "w-full cursor-pointer rounded-lg border-2 border-primary bg-background px-3 py-2 text-right shadow-sm"
                                          : "w-full cursor-pointer rounded-lg border border-transparent bg-muted/50 px-3 py-2 text-right transition hover:border-primary/40 hover:bg-background"}
                                        title="تحرير/بحث عن الصنف — Enter للانتقال للكمية"
                                        onClick={(event) => {
                                          if (event.detail === 0) {
                                            if (item.product) {
                                              handleCloseProductPicker();
                                              focusOrderField(index, "quantity");
                                            } else {
                                              handleOpenProductPicker(index);
                                            }
                                            return;
                                          }
                                          handleOpenProductPicker(index);
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            if (item.product) {
                                              handleCloseProductPicker();
                                              focusOrderField(index, "quantity");
                                            } else {
                                              handleOpenProductPicker(index);
                                            }
                                          }
                                        }}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2 font-bold text-foreground"><PenLine className="h-3.5 w-3.5 shrink-0 text-primary" />{displayName}</div>
                                            <div className="mt-1 text-[10px] text-muted-foreground">الطلب: <span dir="ltr">{item.raw_text || item.description || "—"}</span></div>
                                            <div className="mt-0.5 text-[10px] text-muted-foreground">العربية السوقية: {item.normalized_description_ar || "—"}</div>
                                            {item.product?.name_en && (
                                              <div className="mt-1 text-[10px] text-muted-foreground" dir="ltr">
                                                {item.product.name_en}
                                              </div>
                                            )}
                                          </div>
                                          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 font-mono text-[10px] font-black text-primary">
                                            {item.product?.sku ?? "اختيار"}
                                          </span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                          {item.product ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                                              <DatabaseIcon className="h-3 w-3" />
                                              بيانات الصنف من القاعدة · مطابقة {Math.round((item.matchScore ?? item.confidence) * 100)}% · قراءة {Math.round((item.extractionConfidence ?? 0) * 100)}%
                                            </span>
                                          ) : (
                                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                                              {item.status === "NEEDS_REVIEW"
                                                ? "يحتاج مراجعة · مطابقة " + Math.round((item.matchScore ?? item.confidence) * 100) + "% · قراءة " + Math.round((item.extractionConfidence ?? 0) * 100) + "%"
                                                : "اضغط لاختيار الصنف"}
                                            </span>
                                          )}
                                        </div>
                                      </button>

                                      {!item.product && item.matchCandidates && item.matchCandidates.length > 0 && (
                                        <div className="absolute right-0 top-[calc(100%+6px)] z-[110] w-full min-w-[300px] max-w-[420px] rounded-xl border bg-background p-2 shadow-xl">
                                          <div className="mb-2 flex items-center justify-between gap-2 px-1">
                                            <p className="text-[10px] font-extrabold text-muted-foreground">
                                              أفضل الخيارات من قاعدة البيانات
                                            </p>
                                            <span className="text-[9px] text-muted-foreground">اختر الصنف الصحيح</span>
                                          </div>
                                          <div className="space-y-1">
                                            {item.matchCandidates.slice(0, 3).map((candidate) => (
                                              <button
                                                key={candidate.id}
                                                type="button"
                                                className="grid w-full grid-cols-[72px_1fr] items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-right transition hover:border-primary/40 hover:bg-muted"
                                                onClick={() => {
                                                  handleProductSelect(index, candidate.id);
                                                  handleCloseProductPicker();
                                                  focusOrderField(index, "quantity");
                                                }}
                                              >
                                                <span className="font-mono text-[10px] font-black text-primary">{candidate.sku}</span>
                                                <span className="min-w-0 truncate text-[10px] font-bold">{candidate.name_ar}</span>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {openProductPickerId === item.id && (
                                        <div
                                          className="absolute right-0 top-[calc(100%+6px)] z-[100] w-full min-w-[300px] overflow-hidden rounded-xl border bg-background p-2 shadow-2xl"
                                        >
                                          <div className="flex items-center gap-2 border-b pb-2">
                                            <div className="relative flex-1">
                                              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                              <Input
                                                autoFocus
                                                value={productSearches[item.id] ?? ""}
                                                onChange={(event) =>
                                                  setProductSearches((previous) => ({
                                                    ...previous,
                                                    [item.id]: event.target.value,
                                                  }))
                                                }
                                                placeholder="ابحث باسم الصنف أو الكود أو الماركة..."
                                                className="h-10 pr-9"
                                                dir="rtl"
                                                onFocus={(event) => event.currentTarget.select()}
                                                onKeyDown={(event) => {
                                                  if (event.key !== "Enter") return;
                                                  event.preventDefault();
                                                  const search = (productSearches[item.id] ?? "").trim();
                                                  const filtered = filterProductOptions(search);
                                                  const currentOption = item.product
                                                    ? productOptions.find((option) => option.value === item.product?.id)
                                                    : null;
                                                  const firstOption = filtered[0] ?? currentOption;
                                                  if (!firstOption) return;
                                                  handleProductSelect(index, firstOption.value);
                                                  handleCloseProductPicker();
                                                  focusOrderField(index, "quantity");
                                                }}
                                              />
                                            </div>
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              onClick={handleCloseProductPicker}
                                              aria-label="إغلاق قائمة الأصناف"
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </div>

                                          <div
                                        className="mt-2 overflow-y-auto rounded-lg border"
                                        style={{ maxHeight: 288 }}
                                      >
                                            {(() => {
                                              const search = productSearches[item.id] ?? "";
                                              const filtered = filterProductOptions(search);
                                              const currentOption = item.product
                                                ? productOptions.find((option) => option.value === item.product?.id)
                                                : null;
                                              const visible = [
                                                ...(currentOption ? [currentOption] : []),
                                                ...filtered.filter((option) => option.value !== item.product?.id),
                                              ];
                                              
                                              return visible.length > 0 ? (
                                                visible.map((option) => {
                                                  const product = productById.get(option.value);
                                                  return (
                                                    <button
                                                      key={option.value}
                                                      type="button"
                                                      className="grid w-full grid-cols-[90px_1fr] gap-3 border-b px-3 py-2.5 text-right last:border-b-0 hover:bg-muted"
                                                      onClick={(event) => {
                                                        event.preventDefault();
                                                        handleProductSelect(index, option.value);
                                                        handleCloseProductPicker();
                                                        focusOrderField(index, "quantity");
                                                      }}
                                                    >
                                                      <span className="font-mono text-xs font-black text-primary">
                                                        {product?.sku ?? "—"}
                                                      </span>
                                                      <span className="min-w-0">
                                                        <span className="block font-bold">{product?.name_ar ?? option.label}</span>
                                                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                                          {product?.brand || "بدون ماركة"} · {product?.unit || "بدون وحدة"}
                                                        </span>
                                                      </span>
                                                    </button>
                                                  );
                                                })
                                              ) : (
                                                <div className="px-3 py-4 text-sm text-muted-foreground">
                                                  لا توجد مطابقة. جرّب جزءًا أقصر من الاسم أو الكود.
                                                </div>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                    <Input
                                      ref={(node) => { keyboardFieldRefs.current[`${item.id}:quantity`] = node; }}
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      value={numericDrafts[item.id]?.quantity ?? String(item.quantity ?? 0)}
                                      onFocus={(event) => {
                                        beginNumericEdit(index, "quantity");
                                        event.currentTarget.select();
                                      }}
                                      onChange={(event) => updateNumericDraft(index, "quantity", event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          finishNumericEdit(index, "quantity");
                                          focusNextOrderField(index, "quantity");
                                        }
                                      }}
                                      onBlur={() => finishNumericEdit(index, "quantity")}
                                      className="h-10 w-28 font-bold tabular-nums"
                                      aria-label="الكمية"
                                      title="تحرير الكمية"
                                    />
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                    <Select value={item.unit || "حبة"} onValueChange={(value) => handleUnitChange(index, value)}><SelectTrigger
                                        ref={(node) => { keyboardFieldRefs.current[`${item.id}:unit`] = node; }}
                                        className="h-10 w-32 cursor-pointer font-bold"
                                        title="اختيار الوحدة — Enter للانتقال للسعر"
                                          onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            focusNextOrderField(index, "unit");
                                          }
                                        }}
                                      ><SelectValue placeholder="اختر الوحدة" /></SelectTrigger><SelectContent>{["حبة", "قطعة", "قطع", "كرتون", "علبة", "رول", "لفة", "متر", "كيلوغرام", "غرام", "لتر", "عبوة", "باكيت", "كيس", "صندوق", "طقم", "زوج"].map((unit) => (<SelectItem key={unit} value={unit}>{unit}</SelectItem>))}</SelectContent></Select>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                    <Input
                                      ref={(node) => { keyboardFieldRefs.current[`${item.id}:price`] = node; }}
                                      type="text"
                                      inputMode="decimal"
                                      value={numericDrafts[item.id]?.price ?? (item.priceAmount == null ? "" : String(item.priceAmount))}
                                      onFocus={(event) => {
                                        beginNumericEdit(index, "price");
                                        event.currentTarget.select();
                                      }}
                                      onChange={(event) => updateNumericDraft(index, "price", event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          finishNumericEdit(index, "price");
                                          focusNextOrderField(index, "price");
                                        }
                                      }}
                                      onBlur={() => finishNumericEdit(index, "price")}
                                      placeholder={item.priceAmount === null ? "جاري جلب السعر..." : "السعر"}
                                      className="h-10 w-32 font-bold tabular-nums"
                                      aria-label="السعر"
                                      title="تحرير السعر"
                                    />
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                      {item.priceLabel === "سعر يدوي"
                                        ? "سعر يدوي"
                                        : item.priceAmount === null && item.basePriceAmount != null
                                          ? "الأساس: " + Number(item.basePriceAmount).toFixed(3) + " د.ك / " + (item.basePriceUnit || item.product?.unit || "الوحدة")
                                          : item.priceLabel || "بانتظار السعر"}
                                    </p>
                                    {item.priceAmount !== null && item.priceType !== "manual_quote" && (
                                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                        <DatabaseIcon className="h-3 w-3" />
                                        من قاعدة الأسعار
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <div className="flex items-center gap-2">
                                      <Input
                                        ref={(node) => { keyboardFieldRefs.current[`${item.id}:discount`] = node; }}
                                        type="text"
                                        inputMode="decimal"
                                        value={discountDrafts[item.id] ?? String(Number(item.discountPercent ?? item.discountValue ?? 0))}
                                        onFocus={(event) => {
                                          beginDiscountEdit(index);
                                          event.currentTarget.select();
                                        }}
                                          onChange={(event) => updateDiscountDraft(index, event.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            finishDiscountEdit(index);
                                            focusNextOrderField(index, "discount");
                                          }
                                        }}
                                        onBlur={() => finishDiscountEdit(index)}
                                        className="h-10 w-24 font-bold tabular-nums"
                                        aria-label="نسبة خصم الصنف"
                                        title="تحرير نسبة الخصم فقط"
                                      />
                                      <span className="font-black text-muted-foreground">%</span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-muted-foreground">0–100% فقط</div>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                    <div className="rounded-lg bg-muted/60 px-3 py-2 text-left font-extrabold tabular-nums">
                                      {lineTotal !== null ? lineTotal.toFixed(3) : "—"}
                                    </div>
                                    <div className="mt-1 text-[10px] text-muted-foreground">د.ك</div>
                                  </td>

                                  <td className="px-3 py-3 align-top">
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => {
                                          handleDeleteLine(index);
                                        }}
                                      >
                                        <Trash2 className="ml-1 h-4 w-4" />
                                        حذف
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="border-t bg-muted/40">
                            <tr>
                              <td colSpan={8} className="px-4 py-4">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                  <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-xl">
                                    <div className="space-y-1">
                                      <Label className="text-xs font-extrabold">نوع خصم الفاتورة كاملة</Label>
                                      <Select
                                        value={invoiceDiscountType}
                                        onValueChange={(value) =>
                                          setInvoiceDiscountType(
                                            value === "amount" ? "amount" : value === "both" ? "both" : "percent",
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-10 font-bold">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="percent">نسبة %</SelectItem>
                                          <SelectItem value="amount">مبلغ د.ك</SelectItem>
                                          <SelectItem value="both">نسبة % + مبلغ د.ك</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs font-extrabold">
                                        {invoiceDiscountType === "both" ? "قيمة خصم الفاتورة كاملة — نسبة + مبلغ" : "قيمة خصم الفاتورة كاملة"}
                                      </Label>
                                      {invoiceDiscountType === "both" ? (
                                        <div className="grid grid-cols-2 gap-2">
                                          <Input type="text" inputMode="decimal" value={invoiceDiscountPercentDraft}
                                            onFocus={(event) => event.currentTarget.select()}
                                            onChange={(event) => updateInvoiceDiscountDraft("percent", event.target.value)}
                                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishInvoiceDiscountEdit("percent"); event.currentTarget.blur(); } }}
                                            onBlur={() => finishInvoiceDiscountEdit("percent")}
                                            placeholder="النسبة %" className="h-10 font-bold tabular-nums" aria-label="نسبة خصم الفاتورة كاملة" />
                                          <Input type="text" inputMode="decimal" value={invoiceDiscountAmountDraft}
                                            onFocus={(event) => event.currentTarget.select()}
                                            onChange={(event) => updateInvoiceDiscountDraft("amount", event.target.value)}
                                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishInvoiceDiscountEdit("amount"); event.currentTarget.blur(); } }}
                                            onBlur={() => finishInvoiceDiscountEdit("amount")}
                                            placeholder="المبلغ د.ك" className="h-10 font-bold tabular-nums" aria-label="مبلغ خصم الفاتورة كاملة" />
                                        </div>
                                      ) : (
                                        <Input type="text" inputMode="decimal"
                                          value={invoiceDiscountType === "percent" ? invoiceDiscountPercentDraft : invoiceDiscountAmountDraft}
                                          onFocus={(event) => event.currentTarget.select()}
                                          onChange={(event) => updateInvoiceDiscountDraft(invoiceDiscountType === "percent" ? "percent" : "amount", event.target.value)}
                                          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishInvoiceDiscountEdit(invoiceDiscountType === "percent" ? "percent" : "amount"); event.currentTarget.blur(); } }}
                                          onBlur={() => finishInvoiceDiscountEdit(invoiceDiscountType === "percent" ? "percent" : "amount")}
                                          placeholder={invoiceDiscountType === "percent" ? "0" : "0.000"}
                                          className="h-10 font-bold tabular-nums" aria-label="خصم الفاتورة كاملة" />
                                      )}
                                      <p className="text-[10px] text-muted-foreground">
                                        {invoiceDiscountType === "percent" ? "يمكن إدخال نسبة صحيحة أو كسرية من 0 إلى 100." : "يمكن إدخال أي مبلغ صحيح أو كسري، ولن يتجاوز قيمة الفاتورة."}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="w-full space-y-2 text-left lg:max-w-sm">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                      <span>إجمالي الأصناف قبل الخصومات</span>
                                      <span className="font-bold tabular-nums">{calculateOrderTotals(analysisResult.items).rawSubtotal.toFixed(3)} د.ك</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                      <span>خصم الأصناف</span>
                                      <span className="font-bold tabular-nums">-{calculateOrderTotals(analysisResult.items).lineDiscountTotal.toFixed(3)} د.ك</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                      <span>خصم الفاتورة</span>
                                      <span className="font-bold tabular-nums">-{calculateOrderTotals(analysisResult.items).invoiceDiscountAmount.toFixed(3)} د.ك</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 border-t pt-2 text-lg">
                                      <span className="font-black">الإجمالي النهائي</span>
                                      <span className="font-black tabular-nums">{calculateOrderTotals(analysisResult.items).finalTotal.toFixed(3)} د.ك</span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <div className="space-y-3 p-3 md:hidden" dir="rtl">
                        {analysisResult.items.map((item, index) => {
                          const displayName =
                            item.quoteName?.trim() ||
                            item.product?.name_ar ||
                            item.description ||
                            item.raw_text ||
                            "صنف غير محدد";
                          const lineSubtotal =
                            item.priceAmount !== null && Number.isFinite(Number(item.priceAmount))
                              ? Number(item.priceAmount) * Number(item.quantity || 0)
                              : null;
                          const discountPercent = Math.min(100, Math.max(0, Number(item.discountPercent ?? 0)));
                          const discountAmount =
                            lineSubtotal !== null ? lineSubtotal * (discountPercent / 100) : 0;
                          const lineTotal = lineSubtotal !== null ? lineSubtotal - discountAmount : null;

                          return (
                            <div
                              key={item.id}
                              className="rounded-xl border bg-background p-3 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="relative min-w-0 flex-1">
                                  <div className="mb-1 flex items-center gap-2">
                                    <Input
                                      type="text"
                                      inputMode="numeric"
                                      value={skuDrafts[item.id] ?? item.product?.sku ?? ""}
                                      onFocus={(event) => {
                                        beginSkuEdit(index);
                                        event.currentTarget.select();
                                      }}
                                      onChange={(event) => {
                                        setSkuDrafts((previous) => ({
                                          ...previous,
                                          [item.id]: event.target.value,
                                        }));
                                        setSkuErrors((previous) => {
                                          if (!previous[item.id]) return previous;
                                          const next = { ...previous };
                                          delete next[item.id];
                                          return next;
                                        });
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          const matched = finishSkuEdit(index);
                                          if (matched) {
                                            focusOrderField(index, "quantity");
                                          }
                                        }
                                      }}
                                      placeholder="الكود / الباركود"
                                      className="h-9 w-32 font-mono text-xs font-black tabular-nums"
                                      aria-label="الكود أو الباركود"
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                      اكتب الكود ثم Enter
                                    </span>
                                    {skuErrors[item.id] && (
                                      <p className="absolute right-0 top-full z-10 mt-1 w-max max-w-[260px] text-[10px] font-semibold text-destructive">
                                        {skuErrors[item.id]}
                                      </p>
                                    )}
                                  </div>

                                  <button
                                    ref={undefined}
                                    type="button"
                                    className={openProductPickerId === item.id
                                      ? "w-full rounded-lg border-2 border-primary bg-background p-2 text-right"
                                      : "w-full rounded-lg border border-transparent p-2 text-right transition hover:border-primary/30 hover:bg-muted/40"}
                                    onClick={() => handleOpenProductPicker(index)}
                                  >
                                    <p className="line-clamp-2 text-sm font-extrabold">{displayName}</p>
                                    {item.product?.name_en && (
                                      <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground" dir="ltr">
                                        {item.product.name_en}
                                      </p>
                                    )}
                                  </button>

                                  {openProductPickerId === item.id && (
                                    <div className="absolute right-0 top-[calc(100%+8px)] z-[100] w-full max-w-[560px] rounded-xl border bg-background p-2 shadow-2xl">
                                      <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                          <Input
                                            autoFocus
                                            value={productSearches[item.id] ?? ""}
                                            onChange={(event) =>
                                              setProductSearches((previous) => ({
                                                ...previous,
                                                [item.id]: event.target.value,
                                              }))
                                            }
                                            placeholder="ابحث باسم الصنف أو الكود..."
                                            className="h-10 pr-9"
                                            dir="rtl"
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="ghost"
                                          onClick={handleCloseProductPicker}
                                          aria-label="إغلاق قائمة الأصناف"
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>

                                      <div
                                        className="mt-2 overflow-y-auto rounded-lg border"
                                        style={{ maxHeight: 288 }}
                                      >
                                        {(() => {
                                          const search = productSearches[item.id] ?? "";
                                          const filtered = filterProductOptions(search);
                                          const currentOption = item.product
                                            ? productOptions.find((option) => option.value === item.product?.id)
                                            : null;
                                          const visible = [
                                            ...(currentOption ? [currentOption] : []),
                                            ...filtered.filter((option) => option.value !== item.product?.id),
                                          ];
                                          
                                          return visible.length > 0 ? (
                                            visible.map((option) => {
                                              const product = productById.get(option.value);
                                              return (
                                                <button
                                                  key={option.value}
                                                  type="button"
                                                  className="block w-full border-b px-3 py-2.5 text-right last:border-b-0 hover:bg-muted"
                                                  onClick={() => {
                                                    handleProductSelect(index, option.value);
                                                    handleCloseProductPicker();
                                                  }}
                                                >
                                                  <div className="font-bold">{product?.name_ar ?? option.label}</div>
                                                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                                                    {product?.sku ?? "—"} · {product?.brand || "بدون ماركة"} · {product?.unit || "بدون وحدة"}
                                                  </div>
                                                </button>
                                              );
                                            })
                                          ) : (
                                            <div className="px-3 py-4 text-sm text-muted-foreground">
                                              لا توجد مطابقة. جرّب جزءًا أقصر من الاسم أو الكود.
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  )}

                                  <div className="mt-2">
                                    {item.product ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                                        <DatabaseIcon className="h-3 w-3" />
                                        بيانات الصنف من القاعدة
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                                        يحتاج اختيار صنف
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="shrink-0 text-left">
                                  <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                                  <p className="text-base font-black tabular-nums">
                                    {lineTotal !== null ? lineTotal.toFixed(3) : "—"} د.ك
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">الكمية</Label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={numericDrafts[item.id]?.quantity ?? String(item.quantity ?? 0)}
                                    onFocus={(event) => {
                                        beginNumericEdit(index, "quantity");
                                        event.currentTarget.select();
                                      }}
                                    onChange={(event) => updateNumericDraft(index, "quantity", event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        finishNumericEdit(index, "quantity");
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    onBlur={() => finishNumericEdit(index, "quantity")}
                                    className="font-bold tabular-nums"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">الوحدة</Label>
                                  <Select value={item.unit || "حبة"} onValueChange={(value) => handleUnitChange(index, value)}>
                                    <SelectTrigger><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                                    <SelectContent>{["حبة", "قطعة", "قطع", "كرتون", "علبة", "رول", "لفة", "متر", "كيلوغرام", "غرام", "لتر", "عبوة", "باكيت", "كيس", "صندوق", "طقم", "زوج"].map((unit) => (<SelectItem key={unit} value={unit}>{unit}</SelectItem>))}</SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">السعر</Label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={numericDrafts[item.id]?.price ?? (item.priceAmount == null ? "" : String(item.priceAmount))}
                                    onFocus={(event) => {
                                        beginNumericEdit(index, "price");
                                        event.currentTarget.select();
                                      }}
                                    onChange={(event) => updateNumericDraft(index, "price", event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        finishNumericEdit(index, "price");
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    onBlur={() => finishNumericEdit(index, "price")}
                                    placeholder={item.priceAmount === null ? "جاري جلب السعر..." : "السعر"}
                                    className="font-bold tabular-nums"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">خصم الصنف (%)</Label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={discountDrafts[item.id] ?? String(Number(item.discountPercent ?? item.discountValue ?? 0))}
                                    onFocus={(event) => {
                                      beginDiscountEdit(index);
                                      event.currentTarget.select();
                                    }}
                                    onChange={(event) => updateDiscountDraft(index, event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        finishDiscountEdit(index);
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    onBlur={() => finishDiscountEdit(index)}
                                    placeholder="0"
                                    className="font-bold tabular-nums"
                                  />
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                                <div className="rounded-lg bg-muted/50 px-2 py-2">
                                  <p className="text-[10px] text-muted-foreground">الكمية</p>
                                  <p className="mt-0.5 font-extrabold tabular-nums">{item.quantity || 0}</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 px-2 py-2">
                                  <p className="text-[10px] text-muted-foreground">الوحدة</p>
                                  <p className="mt-0.5 font-extrabold">{item.unit || "—"}</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 px-2 py-2">
                                  <p className="text-[10px] text-muted-foreground">السعر</p>
                                  <p className="mt-0.5 font-extrabold tabular-nums">
                                    {item.priceAmount !== null ? Number(item.priceAmount).toFixed(3) : "—"}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-muted/50 px-2 py-2">
                                  <p className="text-[10px] text-muted-foreground">الخصم</p>
                                  <p className="mt-0.5 font-extrabold tabular-nums">
                                    {Number(item.discountPercent ?? item.discountValue ?? 0).toFixed(2)}%
                                  </p>
                                </div>
                              </div>

                              <div className="mt-3 flex items-center justify-between gap-2">
                                <span className="text-[10px] text-muted-foreground">
                                  {item.priceAmount !== null && item.priceType !== "manual_quote"
                                    ? "السعر مقروء تلقائيًا من قاعدة الأسعار"
                                    : item.priceLabel || "السعر غير متاح"}
                                </span>
                                <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    handleDeleteLine(index);
                                  }}
                                >
                                  <Trash2 className="ml-1 h-4 w-4" />
                                  حذف
                                </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        <div className="rounded-xl border bg-muted/40 p-3">
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-xs font-extrabold">نوع خصم الفاتورة كاملة</Label>
                                <Select
                                  value={invoiceDiscountType}
                                  onValueChange={(value) =>
                                          setInvoiceDiscountType(
                                            value === "amount" ? "amount" : value === "both" ? "both" : "percent",
                                          )
                                        }
                                >
                                  <SelectTrigger className="h-10 font-bold">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="percent">خصم بالنسبة %</SelectItem>
                                    <SelectItem value="amount">خصم بالمبلغ د.ك</SelectItem>
                                    <SelectItem value="both">خصم بالنسبة + مبلغ د.ك</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-extrabold">
                                  {"قيمة خصم الفاتورة كاملة"}
                                </Label>
                                {invoiceDiscountType === "both" ? (
                                        <div className="grid grid-cols-2 gap-2">
                                          <Input type="text" inputMode="decimal" value={invoiceDiscountPercentDraft}
                                            onFocus={(event) => event.currentTarget.select()}
                                            onChange={(event) => updateInvoiceDiscountDraft("percent", event.target.value)}
                                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishInvoiceDiscountEdit("percent"); event.currentTarget.blur(); } }}
                                            onBlur={() => finishInvoiceDiscountEdit("percent")}
                                            placeholder="النسبة %" className="h-10 font-bold tabular-nums" aria-label="نسبة خصم الفاتورة كاملة" />
                                          <Input type="text" inputMode="decimal" value={invoiceDiscountAmountDraft}
                                            onFocus={(event) => event.currentTarget.select()}
                                            onChange={(event) => updateInvoiceDiscountDraft("amount", event.target.value)}
                                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishInvoiceDiscountEdit("amount"); event.currentTarget.blur(); } }}
                                            onBlur={() => finishInvoiceDiscountEdit("amount")}
                                            placeholder="المبلغ د.ك" className="h-10 font-bold tabular-nums" aria-label="مبلغ خصم الفاتورة كاملة" />
                                        </div>
                                      ) : (
                                        <Input type="text" inputMode="decimal"
                                          value={invoiceDiscountType === "percent" ? invoiceDiscountPercentDraft : invoiceDiscountAmountDraft}
                                          onFocus={(event) => event.currentTarget.select()}
                                          onChange={(event) => updateInvoiceDiscountDraft(invoiceDiscountType === "percent" ? "percent" : "amount", event.target.value)}
                                          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishInvoiceDiscountEdit(invoiceDiscountType === "percent" ? "percent" : "amount"); event.currentTarget.blur(); } }}
                                          onBlur={() => finishInvoiceDiscountEdit(invoiceDiscountType === "percent" ? "percent" : "amount")}
                                          placeholder={invoiceDiscountType === "percent" ? "0" : "0.000"}
                                          className="h-10 font-bold tabular-nums" aria-label="خصم الفاتورة كاملة" />
                                      )}
                              </div>
                            </div>

                            <div className="space-y-2 border-t pt-3">
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span>إجمالي الأصناف قبل الخصومات</span>
                                <span className="font-bold tabular-nums">{calculateOrderTotals(analysisResult.items).rawSubtotal.toFixed(3)} د.ك</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span>خصم الأصناف</span>
                                <span className="font-bold tabular-nums">-{calculateOrderTotals(analysisResult.items).lineDiscountTotal.toFixed(3)} د.ك</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span>خصم الفاتورة</span>
                                <span className="font-bold tabular-nums">-{calculateOrderTotals(analysisResult.items).invoiceDiscountAmount.toFixed(3)} د.ك</span>
                              </div>
                              <div className="flex items-center justify-between gap-3 border-t pt-2 text-lg">
                                <span className="font-black">الإجمالي النهائي</span>
                                <span className="font-black tabular-nums">{calculateOrderTotals(analysisResult.items).finalTotal.toFixed(3)} د.ك</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      لم يتم استخراج أصناف واضحة من الملف.
                    </p>
                  )}
                  {analysisResult.notes && (
                    <p className="rounded-lg bg-muted p-3 text-sm">
                      <strong>ملاحظات:</strong> {analysisResult.notes}
                    </p>
                  )}
                  <Button
                    size="lg"
                    className="h-14 w-full text-base font-extrabold"
                    onClick={() => void createQuoteFromAnalysis()}
                    disabled={editingQuoteLoading || isAnalyzing || !analysisResult.items?.length}
                  >
                    {editingQuoteId ? "حفظ تعديلات عرض السعر" : "إنشاء وحفظ عرض السعر"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة عميل جديد</DialogTitle>
              <DialogDescription>
                أضف اسم العميل ورقم هاتفه وسيُضاف مباشرة إلى قائمة العملاء ويُختار لهذا العرض.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="inline-customer-name">اسم العميل</Label>
                <Input
                  id="inline-customer-name"
                  value={newCustomerName}
                  onChange={(event) => setNewCustomerName(event.target.value)}
                  placeholder="اسم العميل"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inline-customer-phone">رقم الهاتف</Label>
                <Input
                  id="inline-customer-phone"
                  value={newCustomerPhone}
                  onChange={(event) => setNewCustomerPhone(event.target.value)}
                  placeholder="مثال: 5xxxxxxx"
                  inputMode="tel"
                />
              </div>
              {newCustomerError && (
                <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                  {newCustomerError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCustomerDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="button" onClick={() => void handleCreateCustomerInline()} disabled={newCustomerSaving}>
                {newCustomerSaving ? "جارٍ الحفظ..." : "إضافة واختيار العميل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sources.map((s) => (
            <Card key={s.label} className="shadow-card">
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <s.icon className="h-6 w-6 text-primary" />
                <p className="text-sm font-bold">{s.label}</p>
                <p className="text-[11px] text-muted-foreground">{s.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

      </div>
    </AppShell>
  );
}