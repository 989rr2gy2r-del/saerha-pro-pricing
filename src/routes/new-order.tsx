import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { FileSpreadsheet, FileText, Image as ImageIcon, PenLine, Upload } from "lucide-react";
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

type MatchStatus = "HIGH_CONFIDENCE" | "NEEDS_REVIEW" | "UNMATCHED";

type ReviewItem = {
  id: string;
  description: string;
  quantity: number;
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

  const scale = Math.min(2.5, Math.max(1.5, 2200 / Math.max(image.naturalWidth, image.naturalHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز الصورة للقراءة.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = Math.round(
      0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2],
    );
    const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    pixels.data[i] = boosted;
    pixels.data[i + 1] = boosted;
    pixels.data[i + 2] = boosted;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function parseLocalOcrText(text: string) {
  const units = "حبة|قطعة|علبة|كرتون|كرتونه|كرتون|متر|سم|مم|كجم|كغ|جم|غ|لتر|ل|مل|رول|لفة|باكيت|كيس|طقم|زوج|متر".split("|");
  const unitPattern = units.join("|");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|¦]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2);

  return lines.map((line, index) => {
    let description = line;
    let quantity = 0;
    let unit = "";

    const startMatch = line.match(new RegExp(`^([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?\\s+(.+)$`, "i"));
    const endMatch = line.match(new RegExp(`^(.+?)\\s+([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?$`, "i"));

    if (startMatch) {
      quantity = Number(String(startMatch[1]).replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(",", "."));
      unit = startMatch[2] ?? "";
      description = startMatch[3].trim();
    } else if (endMatch) {
      quantity = Number(String(endMatch[2]).replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(",", "."));
      unit = endMatch[3] ?? "";
      description = endMatch[1].trim();
    }

    return {
      id: `ocr-${Date.now()}-${index}`,
      description,
      raw_text: line,
      quantity: Number.isFinite(quantity) ? quantity : 0,
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

function findLocalProductMatch(text: string, products: ProductRecord[]) {
  const normalized = normalizeForMatch(text);
  if (!normalized) return null;
  const scored = products.map((product) => {
    const fields = [
      { value: product.sku, weight: 1.0 },
      { value: product.name_ar, weight: 0.95 },
      { value: product.name_en, weight: 0.9 },
      { value: product.short_name, weight: 0.9 },
      { value: product.brand, weight: 0.65 },
      { value: product.model, weight: 0.65 },
      { value: product.size, weight: 0.55 },
      { value: product.description, weight: 0.45 },
    ];
    let score = 0;
    for (const field of fields) {
      if (!field.value) continue;
      const candidate = normalizeForMatch(field.value);
      if (!candidate) continue;
      if (candidate === normalized) score = Math.max(score, field.weight);
      else if (candidate.includes(normalized) || normalized.includes(candidate)) score = Math.max(score, field.weight * 0.9);
    }
    const tokens = normalized.split(" ").filter(Boolean);
    if (tokens.length > 1) {
      const haystack = normalizeForMatch([
        product.sku, product.name_ar, product.name_en, product.short_name,
        product.brand, product.model, product.size, product.description,
      ].filter(Boolean).join(" "));
      const overlap = tokens.filter((token) => haystack.includes(token)).length / tokens.length;
      score = Math.max(score, overlap * 0.8);
    }
    return { product, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 0.65 ? best : null;
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
  const [progress, setProgress] = useState(0);
  const [lastAnalyzedKey, setLastAnalyzedKey] = useState<string>("");
  const [productSearches, setProductSearches] = useState<Record<string, string>>({});

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: `${product.name_ar} — ${product.sku}`,
      })),
    [products],
  );

  const filterProductOptions = (query: string) => {
    const normalizedQuery = normalizeForMatch(query);
    if (!normalizedQuery) {
      return productOptions.slice(0, 25);
    }

    const queryTokens = normalizedQuery.split(" ").filter(Boolean);

    return productOptions
      .map((option) => {
        const product = products.find((entry) => entry.id === option.value);
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
        ]
          .filter(Boolean)
          .map((value) => normalizeForMatch(String(value)));

        const haystack = fields.join(" ");
        if (!haystack) return null;

        // Very sensitive partial search:
        // "ف" -> every field containing ف
        // "في" -> every field containing في
        // "فيو" -> every field containing فيو
        // "فيوز" -> every field containing فيوز
        // Multiple words must all occur somewhere in the product data.
        const matches = queryTokens.every((token) => haystack.includes(token));
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

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT_FIELDS)
      .order("name_ar", { ascending: true });
    if (!error) {
      setProducts((data ?? []) as ProductRecord[]);
    }
  };

  useEffect(() => {
    void loadCustomers();
    void loadProducts();
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

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { error } = await supabase.from("ai_corrections").insert({
      product_id: item.product.id,
      raw_text: rawText,
      normalized_text: normalizedText,
      action,
      created_by: userId,
    });
    if (error) throw error;

    if (addAlias) {
      const { error: aliasError } = await supabase.from("product_aliases").upsert(
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

  const handleProductSelect = (index: number, productId: string) => {
    const selected = products.find((product) => product.id === productId) ?? null;
    const current = analysisResult?.items[index];
    if (current && selected) {
      void recordCorrection({ ...current, product: selected }, "corrected");
    }
    patchReviewItem(index, (item) => {
      const nextStatus: MatchStatus = selected ? "HIGH_CONFIDENCE" : "UNMATCHED";
      const nextItem = {
        ...item,
        product: selected,
        accepted: Boolean(selected),
        rejected: false,
        status: nextStatus,
        matchReason: selected ? "تم اختيار منتج يدويًا من قاعدة المنتجات" : "لم يتم اختيار منتج",
      };
      if (selected) void refreshPreviewPrices([nextItem], customerId);
      return nextItem;
    });
  };

  const refreshPreviewPrices = async (items: ReviewItem[], selectedCustomerId = "") => {
    const productIds = items.filter((item) => !item.rejected && item.product).map((item) => item.product!.id);
    if (!productIds.length) return;
    try {
      let customerType = "retail";
      if (selectedCustomerId) {
        const { data } = await supabase.from("customers").select("customer_type").eq("id", selectedCustomerId).maybeSingle();
        customerType = data?.customer_type ?? "retail";
      }
      const { data: priceRows, error } = await supabase
        .from("prices")
        .select("product_id, price_type, customer_id, amount, valid_from, valid_to")
        .in("product_id", [...new Set(productIds)]);
      if (error) throw error;
      const now = Date.now();
      setAnalysisResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) => {
            if (!item.product) return item;
            const rows = (priceRows ?? []).filter((row) => {
              const from = new Date(row.valid_from).getTime();
              const to = row.valid_to ? new Date(row.valid_to).getTime() : null;
              return row.product_id === item.product!.id && Number.isFinite(from) && from <= now &&
                (!to || (Number.isFinite(to) && to > now)) && Number(row.amount) >= 0;
            });
            const preferredType =
              customerType === "wholesale" || customerType === "contractor" || customerType === "government"
                ? "reseller"
                : "retail";
            const chosen =
              rows.find((row) => row.price_type === "customer_special" && row.customer_id === selectedCustomerId) ??
              rows.find((row) => row.price_type === preferredType && !row.customer_id) ??
              rows.find((row) => row.price_type === "retail" && !row.customer_id) ??
              rows.find((row) => row.price_type === "reseller" && !row.customer_id);
            return {
              ...item,
              priceAmount: chosen ? Number(chosen.amount) : null,
              priceType: chosen?.price_type ?? null,
              priceLabel: chosen ? getPriceLookupKey(chosen.price_type) : "لا يوجد سعر",
            };
          }),
        };
      });
    } catch {
      // Keep analysis usable if preview pricing fails.
    }
  };

  useEffect(() => {
    if (customerId && analysisResult?.items?.length) {
      void refreshPreviewPrices(analysisResult.items, customerId);
    }
  }, [customerId]);

  const handleQuantityChange = (index: number, value: number) => {
    patchReviewItem(index, (item) => ({
      ...item,
      quantity: Number.isFinite(value) ? Math.max(0, value) : 0,
    }));
  };

  const handleUnitChange = (index: number, value: string) => {
    patchReviewItem(index, (item) => ({ ...item, unit: value }));
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
      } else {
        setProgress(20);
        image = await prepareGeminiImage(first);
        setProgress(35);
      }

      if (!image && !text.trim()) {
        throw new Error("الملف فارغ أو لم نتمكن من استخراج محتواه.");
      }


      const { data: authSession } = await supabase.auth.getSession();
      const accessToken = authSession.session?.access_token;
      if (!accessToken) {
        throw new Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.");
      }

      let rawResult: Record<string, unknown>;
      const localOcrPromise = image
        ? readImageLocally(first).catch(() => null)
        : Promise.resolve(null);

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
        }, 30000);

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
        setAnalysisError(
          timedOut
            ? "القراءة الذكية تأخرت قليلًا؛ جارٍ تشغيل القراءة المحلية الاحتياطية."
            : serverMessage
              ? `تعذر تشغيل القراءة الذكية: ${serverMessage} — جارٍ تشغيل القراءة المحلية الاحتياطية.`
              : "تعذر تشغيل القراءة الذكية؛ جارٍ تشغيل القراءة المحلية الاحتياطية.",
        );
        setProgress(30);
        const local = (await localOcrPromise) ?? await readImageLocally(first, setProgress);
        rawResult = {
          items: local.items,
          notes: `تمت قراءة الصورة محليًا. النص المستخرج: ${local.text}`,
        };
      }

      const rawItems = Array.isArray(rawResult["items"])
        ? (rawResult["items"] as Record<string, unknown>[])
        : [];
      const normalizedItems = rawItems.map((item, index: number) => ({
        id: `${Date.now()}-${index}`,
        description: String(item["description"] ?? item["raw_text"] ?? "").trim(),
        raw_text: String(item["raw_text"] ?? item["description"] ?? "").trim(),
        quantity: Number(item["quantity"] ?? 0),
        unit: String(item["unit"] ?? "").trim(),
        confidence: Number(item["confidence"] ?? 0.5),
        notes: String(item["notes"] ?? "").trim(),
      }));

            // Match each extracted line against the products loaded from Supabase.
      // Keep the review state explicit so the user can confirm or correct every match.
      const matchedItems: ReviewItem[] = normalizedItems.map((item) => {
        const match = findLocalProductMatch(item.description || item.raw_text, products);
        const confidence = match ? Math.max(item.confidence, match.score) : item.confidence;
        const status: MatchStatus = match
          ? confidence >= 0.85
            ? "HIGH_CONFIDENCE"
            : "NEEDS_REVIEW"
          : "UNMATCHED";

        return {
          ...item,
          confidence,
          product: match?.product ?? null,
          matchReason: match
            ? "تمت المطابقة محليًا مع قاعدة المنتجات"
            : "لم يتم العثور على منتج مطابق تلقائيًا",
          status,
          rejected: false,
          accepted: false,
          priceAmount: null,
          priceType: null,
          priceLabel: "جاري جلب السعر...",
        };
      });

      setAnalysisError("");
      setAnalysisResult({
        items: matchedItems,
        notes: String(rawResult["notes"] ?? "").trim(),
      });
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
      (item) => !item.rejected && item.product && item.quantity > 0 && item.accepted,
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
          supabase
            .from("prices")
            .select("id, product_id, price_type, customer_id, amount, currency, source, valid_from, valid_to")
            .in("product_id", productIds)
            .order("valid_from", { ascending: false }),
          supabase
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
        const conversion = convertQuantity(
          Number(item.quantity),
          requestedUnit,
          item.product!.unit || requestedUnit,
          (conversionRows ?? []) as Array<{
            from_unit: string;
            to_unit: string;
            multiplier: number;
            product_id: string | null;
          }>,
          productId,
        );
        if (
          manualPrice === null &&
          (!chosen || (conversion.reason && conversion.quantity === Number(item.quantity) && requestedUnit !== (item.product!.unit || requestedUnit)))
        ) {
          return { ...item, priceAmount: null, priceType: null, priceLabel: "لا يوجد سعر مناسب", quantity: conversion.quantity, unit: item.product!.unit || requestedUnit };
        }
        return {
          ...item,
          quantity: conversion.quantity,
          unit: item.product!.unit || requestedUnit,
          priceAmount: manualPrice ?? Number(chosen!.amount),
          priceType: manualPrice !== null ? "manual_quote" : chosen!.price_type,
          priceLabel: manualPrice !== null ? "سعر يدوي" : getPriceLookupKey(chosen!.price_type),
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

      const { error: itemsError } = await supabase.from("quotation_items").insert(itemRows);
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
                  {analysisResult.items?.length > 0 ? (
                    analysisResult.items.map((item, index) => (
                      <div key={item.id} className="rounded-lg border bg-card p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-bold text-base">
                              {item.description || item.raw_text}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              الكمية: {item.quantity || 0} · الوحدة: {item.unit || "غير محددة"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              النص الأصلي: {item.raw_text || item.description}
                            </p>
                          </div>
                          <div className="text-left">
                            <p className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-medium">
                              {item.status}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              ثقة {Math.round((item.confidence ?? 0) * 100)}%
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>المنتج المقترح</Label>
                            <Select
                              value={item.product?.id ?? ""}
                              onValueChange={(value) => handleProductSelect(index, value)}
                            >
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="اختر منتجًا" />
                              </SelectTrigger>
                              <SelectContent className="max-h-80">
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
                                    onKeyDown={(event) => {
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
                                  const filtered = filterProductOptions(
                                    productSearches[item.id] ?? "",
                                  );

                                  if (!filtered.length) {
                                    return (
                                      <div className="px-3 py-2 text-sm text-muted-foreground">
                                        لا توجد منتجات مطابقة للبحث
                                      </div>
                                    );
                                  }

                                  return filtered.slice(0, 25).map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ));
                                })()}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>SKU</Label>
                            <Input value={item.product?.sku ?? "-"} readOnly className="h-11" />
                          </div>
                          <div className="space-y-2">
                            <Label>الاسم العربي</Label>
                            <Input value={item.product?.name_ar ?? "-"} readOnly className="h-11" />
                          </div>
                          <div className="space-y-2">
                            <Label>الاسم الإنجليزي</Label>
                            <Input value={item.product?.name_en ?? "-"} readOnly className="h-11" />
                          </div>
                          <div className="space-y-2">
                            <Label>الماركة</Label>
                            <Input value={item.product?.brand ?? "-"} readOnly className="h-11" />
                          </div>
                          <div className="space-y-2">
                            <Label>الكمية</Label>
                            <Input
                              type="number"
                              min={0}
                              value={item.quantity || 0}
                              onChange={(event) =>
                                handleQuantityChange(index, Number(event.target.value))
                              }
                              className="h-11"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>السعر (د.ك)</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.001"
                              value={item.priceAmount ?? ""}
                              onChange={(event) => handlePriceChange(index, Number(event.target.value))}
                              placeholder="جاري جلب السعر..."
                              className="h-11 font-bold"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              {item.priceLabel === "سعر يدوي" ? "تم تعديل السعر يدويًا" : "مصدر السعر: " + item.priceLabel}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label>الإجمالي (د.ك)</Label>
                            <Input
                              value={item.priceAmount !== null ? (Number(item.priceAmount) * Number(item.quantity || 0)).toFixed(3) : ""}
                              readOnly
                              className="h-11 font-bold"
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>الوحدة</Label>
                            <Input
                              value={item.unit || ""}
                              onChange={(event) => handleUnitChange(index, event.target.value)}
                              className="h-11"
                              placeholder="اكتب الوحدة"
                            />
                          </div>
                        </div>

                        <p className="mt-3 text-[11px] text-muted-foreground">
                          سبب المطابقة: {item.matchReason}
                        </p>
                        {item.notes && (
                          <p className="mt-2 text-[11px] text-amber-600">ملاحظات: {item.notes}</p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAcceptMatch(index)}
                            disabled={!item.product}
                          >
                            قبول المطابقة
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRejectLine(index)}
                          >
                            رفض السطر
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleSaveAlias(index)}
                            disabled={!item.product}
                          >
                            حفظ الاختصار مستقبلًا
                          </Button>
                        </div>
                      </div>
                    ))
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
