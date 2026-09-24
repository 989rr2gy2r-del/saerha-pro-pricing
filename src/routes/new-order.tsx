import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { FileSpreadsheet, FileText, Image as ImageIcon, PenLine, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { fetchCustomers } from "@/lib/db/saerha-data";
import type { Customer } from "@/lib/mock-data";
import { convertQuantity } from "@/lib/pricing/unit-converter";

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
  description: string | null;
};

type UnitRecord = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
};

type MatchStatus = "HIGH_CONFIDENCE" | "NEEDS_REVIEW" | "UNMATCHED";

type ReviewItem = {
  id: string;
  description: string;
  normalized_description_ar: string;
  quantity: number | null;
  unit: string;
  raw_text: string;
  confidence: number;
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

function translateCommonEnglish(text: string): string {
  let value = String(text ?? "").trim();
  const replacements: Array<[RegExp, string]> = [
    [/\\bpvc\\b/gi, "PVC"],
    [/\\bpipe\\b/gi, "أنبوب"],
    [/\\bcapling\\b|\\bcoupling\\b/gi, "وصلة"],
    [/\\bdouble\\b/gi, "دبل"],
    [/\\bmelbus\\b/gi, "ملبوش"],
    [/\\bgi\\b/gi, "GI"],
    [/\\bbox\\b/gi, "علبة"],
    [/\\bbar\\b/gi, "بار"],
    [/\\btape\\b/gi, "شريط"],
    [/\\bconnector\\b/gi, "موصل"],
    [/\\bwire\\b/gi, "سلك"],
    [/\\bred\\b/gi, "أحمر"],
    [/\\bblack\\b/gi, "أسود"],
    [/\\byellow\\b/gi, "أصفر"],
    [/\\bgreen\\b/gi, "أخضر"],
    [/\\bgermany\\b/gi, "ألماني"],
    [/\\bdozen\\b/gi, "دزينة"],
    [/\\bmm\\b/gi, "ملم"],
    [/\\bamps?\\b/gi, "أمبير"],
  ];
  for (const [pattern, replacement] of replacements) value = value.replace(pattern, replacement);
  return value.replace(/\\s+/g, " ").trim();
}

function parseLocalOcrText(text: string) {
  const units = "حبة|قطعة|علبة|كرتون|كرتونه|كرتون|متر|سم|مم|كجم|كغ|جم|غ|لتر|ل|مل|رول|لفة|باكيت|كيس|طقم|زوج|rolls?|pcs?|pieces?|pc|dozen|box|boxes|bag|set".split("|");
  const unitPattern = units.join("|");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|¦]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2);

  return lines.map((line, index) => {
    let description = line;
    let quantity: number | null = null;
    let unit = "";

    const startMatch = line.match(new RegExp(`^([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?\\s+(.+)$`, "i"));
    const endMatch = line.match(new RegExp(`^(.+?)\\s+([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?$`, "i"));

    if (startMatch) {
      quantity = Number(String(startMatch[1] ?? "").replace(/[٠-٩]/g, (c: string) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(",", "."));
      unit = normalizeUnitValue(startMatch[2] ?? "");
      description = startMatch[3].trim();
    } else if (endMatch) {
      quantity = Number(String(endMatch[2] ?? "").replace(/[٠-٩]/g, (c: string) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(",", "."));
      unit = normalizeUnitValue(endMatch[3] ?? "");
      description = endMatch[1].trim();
    }

    const safeQuantity =
      typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
        ? quantity
        : null;

    return {
      id: `ocr-${Date.now()}-${index}`,
      description,
      normalized_description_ar: /[A-Za-z]/.test(description) ? translateCommonEnglish(description) : description,
      raw_text: line,
      quantity: safeQuantity,
      unit,
      confidence: 0.45,
      notes: "تمت القراءة محليًا من الصورة؛ راجع السطر قبل اعتماد العرض.",
    };
  });
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
  "id, sku, name_ar, name_en, short_name, brand, category_main, category_sub, category_third, product_group, model, size, unit, description";

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[٠-٩]/g, (char) => "٠١٢٣٤٥٦٧٨٩".indexOf(char).toString())
    .replace(/[أآإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ـ/g, "")
    .replace(/[ة]/g, "ة")
    .replace(/[`~!@#$%^&*()_+=\]{}\\|;:'",<>/?]/g, " ")
    .replace(/[_/\\-]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUnitValue(value: string | null | undefined): string {
  const normalized = normalizeForMatch(String(value ?? ""));
  const aliases: Record<string, string> = {
    roll: "لف",
    rolls: "لف",
    "رول": "لف",
    "لفة": "لف",
    "لفات": "لف",
    meter: "متر",
    meters: "متر",
    m: "متر",
    pc: "حبة",
    pcs: "حبة",
    piece: "حبة",
    pieces: "حبة",
    "قطعة": "حبة",
    box: "كرتون",
    boxes: "كرتون",
    "كرتونه": "كرتون",
    "كرتونة": "كرتون",
    bag: "كيس",
    set: "طقم",
    dozen: "دزينة",
    "دزينة": "دزينة",
  };
  return aliases[normalized] ?? String(value ?? "").trim();
}

function getPriceLookupKey(priceType: string): string {
  const map: Record<string, string> = {
    retail: "Retail",
    reseller: "Reseller",
    customer_special: "Customer Special",
    manual_quote: "Manual Quote",
    unit_price: "Unit Price",
    price_after_discount: "Price After Discount",
    retail_min: "Retail Min",
  };

  return map[priceType] ?? priceType;
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.95;
  }
  const aTokens = a.split(" ").filter(Boolean);
  const bTokens = b.split(" ").filter(Boolean);
  if (!aTokens.length || !bTokens.length) return 0;
  const tokenHits = aTokens.filter((token) =>
    bTokens.some((candidate) => candidate === token || candidate.includes(token) || token.includes(candidate)),
  ).length;
  return tokenHits / Math.max(aTokens.length, bTokens.length);
}

type PreparedProductMatch = {
  product: ProductRecord;
  sku: string;
  fields: Array<{ value: string; weight: number }>;
  haystack: string;
};

const preparedProductCache = new WeakMap<ProductRecord, PreparedProductMatch>();

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

function findLocalProductMatch(
  text: string,
  products: ProductRecord[],
  normalizedArabic = "",
  aliases: Record<string, string[]> = {},
) {
  const rawQuery = normalizeForMatch(text);
  const translatedQuery = normalizeForMatch(normalizedArabic);
  // For Arabic source text, only the original Arabic query may drive matching.
  // AI-normalized text may contain inferred brand/model/color details.
  const rawContainsArabic = /[\u0600-\u06FF]/.test(String(text ?? ""));
  const queries = rawContainsArabic
    ? [rawQuery].filter(Boolean)
    : [rawQuery, translatedQuery].filter(Boolean);
  if (!queries.length) return null;

  const prepared = products.map((product) => prepareProductForMatch(product, aliases));

  // SKU is the strongest signal. Resolve exact numeric OCR/SKU text before
  // doing any fuzzy matching across the catalog.
  for (const query of queries) {
    if (!/^\\d+$/.test(query)) continue;
    const exactSku = prepared.find((entry) => entry.sku === query);
    if (exactSku) return { product: exactSku.product, score: 1.25 };
  }

  // Narrow candidates cheaply using distinctive query tokens/numeric fragments.
  // This avoids scoring all 4,583 products for every OCR line.
  const candidateSet = new Set<PreparedProductMatch>();
  for (const query of queries) {
    const tokens = query.split(" ").filter((token) => token.length >= 2);
    const usefulToken = tokens.sort((a, b) => b.length - a.length)[0];
    if (usefulToken) {
      for (const entry of prepared) {
        if (entry.haystack.includes(usefulToken)) candidateSet.add(entry);
      }
    }
  }

  let candidates = candidateSet.size ? [...candidateSet] : prepared;

  // Numeric fragments such as "322" should surface SKUs like 3220/3222
  // without forcing a full fuzzy scan.
  const numericQueries = queries.filter((query) => /^\\d{2,}$/.test(query));
  if (numericQueries.length) {
    const numericCandidates = candidates.filter((entry) =>
      numericQueries.some((query) => entry.sku.includes(query) || entry.haystack.includes(query)),
    );
    if (numericCandidates.length) candidates = numericCandidates;
  }

  const scored = candidates.map((entry) => {
    let best = 0;
    let bestCoverage = 0;
    for (const query of queries) {
      const queryTokens = query.split(" ").filter(Boolean);
      for (const field of entry.fields) {
        const score = similarityScore(query, field.value) * field.weight;
        best = Math.max(best, score);

        if (queryTokens.length > 1) {
          const matchedTokens = queryTokens.filter((token) =>
            field.value.split(" ").some(
              (candidate) => candidate === token || candidate.includes(token) || token.includes(candidate),
            ),
          ).length;
          bestCoverage = Math.max(bestCoverage, matchedTokens / queryTokens.length);
        } else if (queryTokens.length === 1 && field.value.includes(queryTokens[0])) {
          bestCoverage = Math.max(bestCoverage, 1);
        }
      }

      if (queryTokens.length > 1) {
        const overlap = queryTokens.filter((token) => entry.haystack.includes(token)).length / queryTokens.length;
        best = Math.max(best, overlap * 0.9);
        bestCoverage = Math.max(bestCoverage, overlap);
      }
    }
    return {
      product: entry.product,
      score: Math.min(best, 1.25),
      coverage: bestCoverage,
    };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  // Generic/ambiguous lines must not be auto-matched to a specific brand/model/color.
  if (
    !best ||
    best.score < 0.88 ||
    (queries.some((query) => query.split(" ").filter(Boolean).length > 1) && best.coverage < 0.75) ||
    (second && best.score - second.score < 0.08)
  ) {
    return null;
  }

  return { ...best, score: Math.min(1, best.score) };
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
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ name: string; size: number; type: string; status: string }>
  >([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productAliases, setProductAliases] = useState<Record<string, string[]>>({});
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [progress, setProgress] = useState(0);
  const [lastAnalyzedKey, setLastAnalyzedKey] = useState<string>("");
  const [productSearches, setProductSearches] = useState<Record<string, string>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

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

  const loadUnits = async () => {
    const { data, error } = await (supabase as any)
      .from("units")
      .select("id, code, name_ar, name_en")
      .order("name_ar", { ascending: true });
    if (error) {
      console.error("Saerha units load failed", error);
      setUnits([]);
      return;
    }
    setUnits((data ?? []) as UnitRecord[]);
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

  const loadProducts = async (): Promise<{
    products: ProductRecord[];
    aliases: Record<string, string[]>;
  }> => {
    try {
      const pageSize = 1000;
      // Fetch the 4,583-product catalog in parallel pages instead of waiting
      // for five sequential network round trips. If the catalog grows beyond
      // 5,000 rows, continue in another parallel batch.
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
          const aliasError = aliasResult.error;
          if (aliasError) throw aliasError;

          for (const row of aliasRows ?? []) {
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
      return { products: [], aliases: {} };
    }
  };

  useEffect(() => {
    void loadCustomers();
    void loadProducts();
    void loadUnits();
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
    setProgress(0);
    setLastAnalyzedKey("");
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
        unit: dbUnit || previousUnit || "حبة",
        accepted: Boolean(selected),
        rejected: false,
        status: nextStatus,
        matchReason: selected ? "تم اختيار المنتج من قاعدة البيانات" : "لم يتم اختيار منتج",
        notes: [item.notes, unitNote].filter(Boolean).join(" "),
      };
      if (selected) void refreshPreviewPrices([nextItem], customerId);
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
        return {
          ...prev,
          items: prev.items.map((item) => {
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
                priceAmount: null,
                basePriceAmount: Number.isFinite(basePrice) ? basePrice : null,
                basePriceUnit: baseUnit,
                priceType: chosen.price_type,
                priceLabel: conversion.reason ?? "لا توجد تحويلة للوحدة المطلوبة",
                notes: [item.notes, conversion.reason ?? "لا توجد تحويلة للوحدة المطلوبة"]
                  .filter(Boolean)
                  .join(" "),
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
          }),
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

  useEffect(() => {
    if (analysisResult?.items?.length) {
      void refreshPreviewPrices(analysisResult.items, customerId);
    }
  }, [customerId, analysisResult?.items]);

  const handleQuantityChange = (index: number, value: number) => {
    patchReviewItem(index, (item) => ({
      ...item,
      quantity: Number.isFinite(value) && value > 0 ? value : null,
    }));
  };

  const handleUnitChange = (index: number, value: string) => {
    const current = analysisResult?.items[index];
    if (!current) return;
    const nextItem = { ...current, unit: value };
    patchReviewItem(index, () => nextItem);
    if (nextItem.product) void refreshPreviewPrices([nextItem], customerId);
  };

  const handlePriceChange = (index: number, value: number) => {
    patchReviewItem(index, (item) => ({
      ...item,
      priceAmount: Number.isFinite(value) ? Math.max(0, value) : null,
      priceType: "manual_quote",
      priceLabel: "سعر يدوي",
    }));
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
        const workbook = XLSX.read(await first.arrayBuffer(), { type: "array" });
        text = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          return `ورقة: ${sheetName}\n${csv}`;
        }).join("\n\n");
      } else if (first.type === "application/pdf" || /\.pdf$/i.test(first.name)) {
        setProgress(20);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("تعذر قراءة ملف PDF."));
          reader.onerror = () => reject(new Error("تعذر قراءة ملف PDF."));
          reader.readAsDataURL(first);
        });
        if (!/^data:application\/pdf;base64,/i.test(dataUrl)) {
          throw new Error("تعذر تجهيز ملف PDF للتحليل.");
        }
        image = dataUrl;
        setProgress(35);
      } else {
        setProgress(20);
        image = await prepareGeminiImage(first);
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
          }),
        }, 75000);

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "تعذر تشغيل محرك القراءة الذكي.");

        if (typeof data.result === "string") {
          rawResult = JSON.parse(data.result) as Record<string, unknown>;
        } else {
          rawResult = (data.result ?? data) as Record<string, unknown>;
        }
      } catch (serverError) {
        // GitHub Pages is static, so the local OCR fallback guarantees that
        // image reading still works even when the server AI endpoint is unavailable.
        if (!image || !/^data:image\//i.test(image)) {
          throw serverError;
        }

        const timedOut = serverError instanceof DOMException && serverError.name === "AbortError";
        const serverMessage =
          serverError instanceof Error ? serverError.message.trim() : "";
        // Do not expose raw provider/API diagnostics in the customer-facing UI.
        if (serverMessage) console.warn("analyze-order server error:", serverMessage);
        fallbackNotice =
          timedOut
            ? "القراءة الذكية تأخرت قليلًا؛ جارٍ تشغيل القراءة المحلية الاحتياطية."
            : "تعذر تشغيل القراءة الذكية؛ جارٍ تشغيل القراءة المحلية الاحتياطية.";
        setAnalysisError(fallbackNotice);
        setProgress(30);
        // Do not start local OCR while Gemini is running. On mobile this
        // competes for CPU/network and makes the primary smart-reading path slower.
        const local = await readImageLocally(first, setProgress);
        rawResult = {
          items: local.items,
          notes: `تمت قراءة الصورة محليًا. النص المستخرج: ${local.text}`,
        };
      }

      const rawItems = Array.isArray(rawResult["items"])
        ? (rawResult["items"] as Record<string, unknown>[])
        : [];
      // AI/OCR engines can occasionally return an empty placeholder object.
      // Never render that placeholder as a real order line.
      const normalizedItems = rawItems
        .map((item, index: number) => ({
          id: `${Date.now()}-${index}`,
          description: String(item["description"] ?? item["raw_text"] ?? "").trim(),
          normalized_description_ar: String(
            item["normalized_description_ar"] ?? item["arabic_name"] ?? item["description"] ?? item["raw_text"] ?? "",
          ).trim(),
          raw_text: String(item["raw_text"] ?? item["description"] ?? "").trim(),
          quantity: (() => {
            const value = Number(item["quantity"]);
            return Number.isFinite(value) && value > 0 ? value : null;
          })(),
          unit: normalizeUnitValue(String(item["unit"] ?? "").trim()),
          confidence: (() => {
            const value = Number(item["confidence"] ?? 0.5);
            return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
          })(),
          notes: String(item["notes"] ?? "").trim(),
        }))
        .filter((item) => item.description.length > 0 || item.raw_text.length > 0);

      if (!normalizedItems.length) {
        throw new Error("لم يتم استخراج أي سطر طلبية واضح من الملف.");
      }

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

      const matchedItems: ReviewItem[] = normalizedItems.map((item) => {
        const match = findLocalProductMatch(
          item.description || item.raw_text,
          matchingProducts,
          item.normalized_description_ar,
          matchingAliases,
        );
        const confidence = match
          ? Math.min(item.confidence, match.score)
          : 0;
        const status: MatchStatus = match
          ? confidence >= 0.85
            ? "HIGH_CONFIDENCE"
            : "NEEDS_REVIEW"
          : "UNMATCHED";

        return {
          ...item,
          confidence,
          product: match?.product ?? null,
          unit: normalizeUnitValue(match?.product?.unit) || normalizeUnitValue(item.unit) || "حبة",
          matchReason: match
            ? "تمت المطابقة مع قاعدة المنتجات — بيانات الصنف الأساسية من Supabase"
            : "لم يتم العثور على منتج مطابق تلقائيًا",
          status,
          rejected: false,
          accepted: Boolean(match && confidence >= 0.85),
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
      setEditingItemId(matchedItems[0]?.id ?? null);
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
      (item) => !item.rejected && item.product && item.quantity !== null && item.quantity > 0 && item.accepted,
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
        if (manualPrice !== null) {
          return {
            ...item,
            quantity: Number(item.quantity),
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
        if (
          !chosen ||
          (conversion.reason &&
            conversion.quantity === Number(item.quantity) &&
            requestedUnit !== (item.product!.unit || requestedUnit))
        ) {
          return {
            ...item,
            priceAmount: null,
            priceType: null,
            priceLabel: "لا يوجد سعر مناسب",
            quantity: conversion.quantity,
            unit: item.product!.unit || requestedUnit,
          };
        }
        return {
          ...item,
          quantity: conversion.quantity,
          unit: item.product!.unit || requestedUnit,
          priceAmount: Number(chosen.amount),
          priceType: chosen.price_type,
          priceLabel: getPriceLookupKey(chosen.price_type),
        };
      });

      const missingPrices = quoteLines.filter(
        (line) => line.priceAmount === null || !Number.isFinite(line.priceAmount),
      );
      if (missingPrices.length > 0) {
        setAnalysisError("بعض البنود لا يوجد لها سعر مناسب في قاعدة الأسعار الحالية.");
        return;
      }

      const subtotal = quoteLines.reduce(
        (sum, line) => sum + Number(line.priceAmount ?? 0) * Number(line.quantity || 0),
        0,
      );

      const { data: quote, error: quoteError } = await supabase
        .from("quotations")
        .insert({
          reference: `Q-${Date.now()}`,
          customer_id: customerId,
          issue_date: new Date().toISOString().slice(0, 10),
          expiry_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          price_type: quoteLines[0]?.priceType ?? "retail",
          discount_amount: 0,
          tax_amount: 0,
          subtotal,
          total: subtotal,
          currency: "KWD",
          status: "draft",
          notes: "تم إنشاء العرض من الطلبية بعد مراجعة المنتج وسعره.",
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
              product_name: line.product.name_ar,
              sku: line.product.sku,
              quantity: Number(line.quantity || 0),
              unit: line.unit || line.product.unit || "حبة",
              unit_price: Number(line.priceAmount ?? 0),
              discount_amount: 0,
              line_total: Number(line.priceAmount ?? 0) * Number(line.quantity || 0),
              applied_price_type: (line.priceType ?? "retail") as
                "retail" | "reseller" | "customer_special" | "manual_quote",
              is_manual_price: line.priceType === "manual_quote",
              notes: `سعر ${line.priceLabel}`,
            },
          ];
        });

      const { error: itemsError } = await (supabase as any).from("quotation_items").insert(itemRows);
      if (itemsError) throw itemsError;

      setAnalysisError("");
      alert("تم إنشاء عرض السعر بعد مراجعة المنتجات وتأكيد الأسعار بنجاح.");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "تعذّر إنشاء عرض السعر.");
    }
  };

  return (
    <AppShell
      title="طلبية جديدة"
      subtitle="رفع طلبية العميل والمرور بمطابقة منتجات حقيقية ثم إنشاء عرض سعر."
    >
      <div className="space-y-5">
        <Card className="border-2 border-dashed border-accent/50 bg-accent-soft/40 shadow-card">
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
        </Card>

        {(isAnalyzing || analysisError || analysisResult) && (
          <Card className="mb-5 border-2 border-accent/30">
            <CardContent className="p-5">
              <h3 className="mb-4 text-lg font-extrabold">نتيجة تحليل الطلب</h3>
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
                            <p className="font-extrabold">الأصناف المطابقة</p>
                            <p className="text-xs text-muted-foreground">
                              تم جلب الاسم والكود والوحدة والسعر مباشرة من قاعدة البيانات. عدّل فقط ما تحتاجه.
                            </p>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">{analysisResult.items.length} صنف</p>
                        </div>
                      </div>

                      <div className="space-y-3 p-3" dir="rtl">
                        {analysisResult.items.map((item, index) => {
                          const lineTotal =
                            item.priceAmount !== null && item.quantity !== null
                              ? Number(item.priceAmount) * Number(item.quantity || 0)
                              : null;
                          const isEditing = editingItemId === item.id;

                          return (
                            <div
                              key={item.id}
                              className={`rounded-xl border bg-background p-4 shadow-sm transition ${isEditing ? "border-primary ring-1 ring-primary/20" : ""}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="mb-1 flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-black text-primary" dir="ltr">
                                      {item.product?.sku ?? "غير مطابق"}
                                    </span>
                                    <span className={`text-[10px] ${item.confidence >= 0.85 ? "text-emerald-600" : "text-amber-600"}`}>
                                      ثقة {Math.round((item.confidence ?? 0) * 100)}%
                                    </span>
                                    {item.accepted && (
                                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                                        مطابق تلقائيًا
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-base font-extrabold leading-7">
                                    {item.product?.name_ar ?? item.description ?? item.raw_text ?? "صنف غير محدد"}
                                  </p>
                                  {item.product?.name_en && (
                                    <p className="mt-0.5 text-[10px] text-muted-foreground" dir="ltr">{item.product.name_en}</p>
                                  )}
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingItemId(item.id)}>
                                    <PenLine className="ml-1 h-4 w-4" />
                                    تعديل
                                  </Button>
                                  <Button type="button" size="icon" variant="destructive" title="حذف الصف" onClick={() => handleDeleteLine(index)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div className="rounded-lg bg-muted/50 px-3 py-2">
                                  <p className="text-[10px] text-muted-foreground">الكمية</p>
                                  <p className="mt-0.5 font-extrabold tabular-nums">{item.quantity ?? "—"}</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 px-3 py-2">
                                  <p className="text-[10px] text-muted-foreground">الوحدة</p>
                                  <p className="mt-0.5 font-extrabold">{item.unit || item.product?.unit || "—"}</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 px-3 py-2">
                                  <p className="text-[10px] text-muted-foreground">سعر قاعدة البيانات</p>
                                  <p className="mt-0.5 font-extrabold tabular-nums">
                                    {item.priceAmount !== null ? Number(item.priceAmount).toFixed(3) : "—"} د.ك
                                  </p>
                                </div>
                                <div className="rounded-lg bg-primary/5 px-3 py-2">
                                  <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                                  <p className="mt-0.5 font-black tabular-nums">{lineTotal !== null ? lineTotal.toFixed(3) : "—"} د.ك</p>
                                </div>
                              </div>

                              {item.notes && (
                                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                                  {item.notes}
                                </p>
                              )}

                              {isEditing && (
                                <div className="mt-4 rounded-xl border bg-muted/20 p-3">
                                  <div className="mb-3 flex items-center justify-between gap-2">
                                    <div>
                                      <p className="font-bold">تعديل الصنف</p>
                                      <p className="text-[11px] text-muted-foreground">غيّر الصنف أو الكمية أو الوحدة أو السعر فقط إذا احتجت.</p>
                                    </div>
                                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditingItemId(null)}>إغلاق</Button>
                                  </div>

                                  <div className="space-y-2">
                                    <Label className="text-xs font-bold">الصنف من قاعدة البيانات</Label>
                                    <Input
                                      value={productSearches[item.id] ?? ""}
                                      onChange={(event) => setProductSearches((previous) => ({ ...previous, [item.id]: event.target.value }))}
                                      placeholder="ابحث بالاسم أو الكود أو الماركة أو الموديل..."
                                      className="h-11"
                                      dir="rtl"
                                    />
                                    <div className="max-h-52 overflow-y-auto rounded-lg border bg-background">
                                      {(() => {
                                        const search = productSearches[item.id] ?? "";
                                        const filtered = filterProductOptions(search);
                                        const visible = filtered.slice(0, 12);
                                        if (!products.length) return <div className="px-3 py-3 text-sm text-destructive">قاعدة الأصناف لم تُحمّل بعد.</div>;
                                        if (!search.trim()) return <div className="px-3 py-3 text-xs text-muted-foreground">اكتب اسمًا أو كودًا لعرض الاقتراحات.</div>;
                                        if (!visible.length) return <div className="px-3 py-3 text-sm text-muted-foreground">لا توجد نتائج مطابقة.</div>;
                                        return visible.map((option) => (
                                          <button
                                            key={option.value}
                                            type="button"
                                            className="block w-full border-b px-3 py-2 text-right text-xs hover:bg-muted last:border-b-0"
                                            onClick={() => {
                                              handleProductSelect(index, option.value);
                                              setProductSearches((previous) => ({ ...previous, [item.id]: option.label }));
                                            }}
                                          >
                                            <span className="font-bold">{option.label}</span>
                                          </button>
                                        ));
                                      })()}
                                    </div>
                                  </div>

                                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <div className="space-y-1">
                                      <Label className="text-xs">الكمية</Label>
                                      <Input type="number" min={0} value={item.quantity ?? ""} onChange={(event) => handleQuantityChange(index, event.target.value === "" ? Number.NaN : Number(event.target.value))} className="h-10" />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">الوحدة</Label>
                                      <Select value={item.unit || "حبة"} onValueChange={(value) => handleUnitChange(index, value)}>
                                        <SelectTrigger className="h-10"><SelectValue placeholder="الوحدة" /></SelectTrigger>
                                        <SelectContent>
                                          {[
                                            ...unitOptions,
                                            ...(item.unit && !unitOptions.some((option) => option.value === item.unit) ? [{ value: item.unit, label: item.unit }] : []),
                                          ].map((option) => (
                                            <SelectItem key={item.id + "-edit-" + option.value} value={option.value}>{option.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs">السعر</Label>
                                      <Input type="number" min={0} step="0.001" value={item.priceAmount ?? ""} onChange={(event) => handlePriceChange(index, Number(event.target.value))} className="h-10 font-bold" />
                                    </div>
                                    <div className="flex items-end">
                                      <div className="w-full rounded-lg bg-background px-3 py-2">
                                        <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                                        <p className="font-black tabular-nums">
                                          {item.priceAmount !== null && item.quantity !== null ? (Number(item.priceAmount) * Number(item.quantity)).toFixed(3) : "—"} د.ك
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Button type="button" size="sm" onClick={() => handleAcceptMatch(index)} disabled={!item.product}>اعتماد التعديل</Button>
                                    <Button type="button" size="sm" variant="secondary" onClick={() => void handleSaveAlias(index)} disabled={!item.product}>حفظ الاختصار</Button>
                                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingItemId(null)}>تم</Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <div className="rounded-xl border bg-muted/40 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="font-extrabold">إجمالي الطلبية</span>
                              <p className="text-[10px] text-muted-foreground">يُحسب مباشرة من أسعار قاعدة البيانات أو السعر اليدوي.</p>
                            </div>
                            <span className="text-xl font-black tabular-nums">
                              {analysisResult.items.reduce(
                                (sum, item) => sum + (item.priceAmount !== null && item.quantity !== null ? Number(item.priceAmount) * Number(item.quantity || 0) : 0),
                                0,
                              ).toFixed(3)}{" "}د.ك
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                                            <span className="text-muted-foreground">اختر الصنف من قاعدة البيانات</span>
                                          )}
                                        </SelectTrigger>
                                        <SelectContent className="max-h-80" onClick={(event) => event.stopPropagation()}>
                                          <div className="border-b p-2">
                                            <Input
                                              autoFocus
                                              value={productSearches[item.id] ?? ""}
                                              onChange={(event) =>
                                                setProductSearches((previous) => ({
                                                  ...previous,
                                                  [item.id]: event.target.value,
                                                }))
                                              }
                                              placeholder="ابحث بالاسم أو الكود أو الماركة..."
                                              className="h-9"
                                              onPointerDown={(event) => event.stopPropagation()}
                                              onMouseDown={(event) => event.stopPropagation()}
                                              onFocus={(event) => event.stopPropagation()}
                                              onKeyDown={(event) => {
                                                event.stopPropagation();
                                                if (event.key === "Escape") {
                                                  event.preventDefault();
                                                  setProductSearches((previous) => ({
                                                    ...previous,
                                                    [item.id]: "",
                                                  }));
                                                }
                                              }}
                                            />
                                          </div>
                                          {(() => {
                                            const filtered = filterProductOptions(productSearches[item.id] ?? "");
                                            const visible = filtered.slice(0, MAX_RENDERED_PRODUCT_RESULTS);
                                            if (!filtered.length) {
                                              return (
                                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                                  لا توجد منتجات مطابقة للبحث
                                                </div>
                                              );
                                            }
                                            return (
                                              <>
                                                {visible.map((option) => (
                                                  <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                  </SelectItem>
                                                ))}
                                                {filtered.length > visible.length && (
                                                  <div className="border-t px-3 py-2 text-center text-[11px] text-muted-foreground">
                                                    عرض {visible.length} من {filtered.length} نتيجة — ضيّق البحث.
                                                  </div>
                                                )}
                                              </>
                                            );
                                          })()}
                                        </SelectContent>
                                      </Select>
                                      <div className="text-xs font-semibold">
                                        {item.product?.name_ar ?? item.description ?? item.raw_text ?? "صنف غير محدد"}
                                      </div>
                                      {item.product?.name_en && (
                                        <div className="text-[10px] text-muted-foreground" dir="ltr">
                                          {item.product.name_en}
                                        </div>
                                      )}
                                      <div className="text-[10px] text-muted-foreground">
                                        {isEditing ? "وضع التعديل مفعل" : "اضغط للتعديل"}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <Input
                                      type="number"
                                      min={0}
                                      value={item.quantity ?? ""}
                                      onChange={(event) => handleQuantityChange(index, event.target.value === "" ? Number.NaN : Number(event.target.value))}
                                      onClick={(event) => event.stopPropagation()}
                                      className="h-10 w-28 font-bold"
                                    />
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <Select
                                      value={item.unit || normalizeUnitValue(item.product?.unit) || "حبة"}
                                      onValueChange={(value) => handleUnitChange(index, value)}
                                    >
                                      <SelectTrigger
                                        className="h-10 w-32 bg-background"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        <SelectValue placeholder="اختر الوحدة" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {[
                                          ...unitOptions,
                                          ...(item.unit && !unitOptions.some((option) => option.value === item.unit)
                                            ? [{ value: item.unit, label: item.unit + " — مقروءة من الطلبية" }]
                                            : []),
                                          ...(item.product?.unit &&
                                          !unitOptions.some((option) => option.value === normalizeUnitValue(item.product?.unit)) &&
                                          normalizeUnitValue(item.product.unit) !== item.unit
                                            ? [{ value: normalizeUnitValue(item.product.unit), label: normalizeUnitValue(item.product.unit) + " — وحدة الصنف" }]
                                            : []),
                                        ].map((option) => (
                                          <SelectItem key={item.id + "-" + option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.001"
                                      value={item.priceAmount ?? ""}
                                      onChange={(event) => handlePriceChange(index, Number(event.target.value))}
                                      onClick={(event) => event.stopPropagation()}
                                      placeholder={item.priceAmount === null ? "غير متاح" : "السعر"}
                                      className="h-10 w-32 font-bold"
                                    />
                                    <p className="mt-1 max-w-[180px] text-[10px] text-muted-foreground">
                                      {item.priceLabel === "سعر يدوي"
                                        ? "سعر يدوي"
                                        : item.priceAmount === null && item.basePriceAmount != null
                                          ? `الأساس: ${Number(item.basePriceAmount).toFixed(3)} د.ك / ${item.basePriceUnit || item.product?.unit || "الوحدة"} — يلزم تحويل`
                                          : item.priceLabel}
                                    </p>
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <div className="rounded-lg bg-muted/60 px-3 py-2 text-left font-extrabold tabular-nums">
                                      {lineTotal !== null ? lineTotal.toFixed(3) : "—"}
                                    </div>
                                    <div className="mt-1 text-[10px] text-muted-foreground">د.ك</div>
                                  </td>
                                  <td className="px-3 py-3 align-top">
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="destructive"
                                      title="حذف الصف"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleDeleteLine(index);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="border-t bg-muted/40">
                            <tr>
                              <td colSpan={6} className="px-3 py-4 text-left font-extrabold">إجمالي الطلبية</td>
                              <td className="px-3 py-4 text-left text-lg font-black tabular-nums">
                                {analysisResult.items
                                  .reduce(
                                    (sum, item) =>
                                      sum +
                                      (item.priceAmount !== null
                                        ? Number(item.priceAmount) * Number(item.quantity || 0)
                                        : 0),
                                    0,
                                  )
                                  .toFixed(3)}{" "}
                                د.ك
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <div className="space-y-3 p-3 md:hidden" dir="rtl">
                        {analysisResult.items.map((item, index) => {
                          const isEditing = editingItemId === item.id;
                          const lineTotal =
                            item.priceAmount !== null
                              ? Number(item.priceAmount) * Number(item.quantity || 0)
                              : null;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setEditingItemId(item.id)}
                              className={`block w-full rounded-xl border bg-background p-3 text-right shadow-sm transition ${isEditing ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/30"}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="mb-1 flex items-center gap-2">
                                    <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-black text-primary">
                                      {item.product?.sku ?? "—"}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      ثقة {Math.round((item.confidence ?? 0) * 100)}%
                                    </span>
                                  </div>
                                  <p className="line-clamp-2 text-sm font-extrabold">
                                    {item.product?.name_ar ?? item.description ?? item.raw_text ?? "صنف غير محدد"}
                                  </p>
                                  {item.product?.name_en && (
                                    <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground" dir="ltr">
                                      {item.product.name_en}
                                    </p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-start gap-2 text-left">
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                                    <p className="text-base font-black tabular-nums">
                                      {lineTotal !== null ? lineTotal.toFixed(3) : "—"} د.ك
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="destructive"
                                    title="حذف الصف"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleDeleteLine(index);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
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
                              </div>

                              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>{isEditing ? "تم اختيار الصنف للتعديل أدناه" : "اضغط هنا للتعديل واختيار الصنف"}</span>
                                <span className="font-bold text-primary">✎ تعديل</span>
                              </div>
                            </button>
                          );
                        })}

                        <div className="rounded-xl border bg-muted/40 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-extrabold">إجمالي الطلبية</span>
                            <span className="text-lg font-black tabular-nums">
                              {analysisResult.items
                                .reduce(
                                  (sum, item) =>
                                    sum +
                                    (item.priceAmount !== null
                                      ? Number(item.priceAmount) * Number(item.quantity || 0)
                                      : 0),
                                  0,
                                )
                                .toFixed(3)}{" "}
                              د.ك
                            </span>
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
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">بيانات الطلبية</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>العميل</Label>
              <Select
                value={customerId}
                onValueChange={setCustomerId}
                disabled={customersLoading || customers.length === 0}
              >
                <SelectTrigger className="h-12">
                  <SelectValue
                    placeholder={customersLoading ? "جاري تحميل العملاء..." : "اختر عميلاً"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {customers.length > 0 ? (
                    customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} — {c.company || "بدون شركة"}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {customersError || "لا توجد عملاء في قاعدة البيانات."}
                    </div>
                  )}
                </SelectContent>
              </Select>
              {!customersLoading && customers.length === 0 && !customersError && (
                <p className="text-xs text-muted-foreground">لا توجد عملاء في قاعدة البيانات.</p>
              )}
              {customersError && <p className="text-xs text-destructive">{customersError}</p>}
            </div>
            <div className="space-y-2">
              <Label>مصدر الطلبية</Label>
              <Select defaultValue="image">
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="اختر المصدر" />
                </SelectTrigger>
                <SelectContent>
                  {["image", "pdf", "excel", "text", "handwriting"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>نص الطلبية (اختياري)</Label>
              <Textarea rows={5} placeholder="الصق نص الطلبية هنا إن كانت مكتوبة..." />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>ملاحظات</Label>
              <Textarea rows={3} placeholder="ملاحظات إضافية عن الطلبية" />
            </div>
            <Button
              size="lg"
              className="h-14 w-full text-base font-extrabold lg:col-span-2"
              onClick={() => void createQuoteFromAnalysis()}
            >
              إنشاء عرض سعر
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}