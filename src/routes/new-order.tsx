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

const PRODUCT_SELECT_FIELDS =
  "id, sku, name_ar, name_en, short_name, brand, category_main, category_sub, category_third, product_group, model, size, unit, description";

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[٠-٩]/g, (char) => "٠١٢٣٤٥٦٧٨٩".indexOf(char).toString())
    .replace(/[أآإ]/g, "ا")
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

    return productOptions.filter(({ value }) => {
      const product = products.find((entry) => entry.id === value);
      if (!product) return false;

      const haystack = [
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
        .join(" ");

      return normalizeForMatch(haystack).includes(normalizedQuery);
    });
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

  const handleAcceptMatch = (index: number) => {
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
    patchReviewItem(index, (item) => {
      const nextStatus: MatchStatus = selected ? "HIGH_CONFIDENCE" : "UNMATCHED";
      return {
        ...item,
        product: selected,
        accepted: Boolean(selected),
        rejected: false,
        status: nextStatus,
        matchReason: selected ? "تم اختيار منتج يدويًا من قاعدة المنتجات" : "لم يتم اختيار منتج",
      };
    });
  };

  const handleQuantityChange = (index: number, value: number) => {
    patchReviewItem(index, (item) => ({
      ...item,
      quantity: Number.isFinite(value) ? Math.max(0, value) : 0,
    }));
  };

  const handleUnitChange = (index: number, value: string) => {
    patchReviewItem(index, (item) => ({ ...item, unit: value }));
  };

  const handleSaveAlias = async (index: number) => {
    const item = analysisResult?.items[index];
    if (!item?.product) return;

    const aliasText =
      item.raw_text || item.description || item.product.name_ar || item.product.name_en || "";
    if (!aliasText.trim()) return;

    const normalizedText = normalizeForMatch(aliasText);
    if (!normalizedText) return;

    const { data: existing, error: selectError } = await supabase
      .from("product_aliases")
      .select("id, alias, normalized_alias")
      .eq("product_id", item.product.id)
      .order("created_at", { ascending: false });

    if (!selectError) {
      const duplicate = (existing ?? []).some(
        (row) =>
          normalizeForMatch(row.alias || "") === normalizedText ||
          normalizeForMatch(row.normalized_alias || "") === normalizedText,
      );
      if (duplicate) {
        setAnalysisError("هذا الاختصار محفوظ فعليًا ولا يحتاج تكرارًا.");
        return;
      }
    }

    const { error } = await supabase.from("product_aliases").insert({
      product_id: item.product.id,
      alias: aliasText.trim(),
      normalized_alias: normalizedText,
      lang: "mixed",
      source: "learned",
    });

    if (error) {
      setAnalysisError(error.message || "تعذر حفظ الاختصار.");
      return;
    }

    setAnalysisError("");
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
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/vnd.ms-excel",
      "application/msword",
      "text/plain",
    ];
    const validFiles = files.filter(
      (file) =>
        accepted.includes(file.type) ||
        /\.(jpe?g|png|webp|heic|pdf|docx|xlsx|xls|csv|txt)$/i.test(file.name),
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
        const reader = new FileReader();
        image = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            if (typeof reader.result === "string") resolve(reader.result);
            else reject(new Error("تعذر قراءة الملف."));
          };
          reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
          reader.readAsDataURL(first);
        });
      }

      if (!image && !text.trim()) {
        throw new Error("الملف فارغ أو لم نتمكن من استخراج محتواه.");
      }


      const { data: authSession } = await supabase.auth.getSession();
      const accessToken = authSession.session?.access_token;
      if (!accessToken) {
        throw new Error("انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.");
      }

      const response = await fetch("/api/analyze-order", {
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
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "تعذر تحليل الطلبية.");

      let rawResult: Record<string, unknown>;
      if (typeof data.result === "string") {
        try {
          rawResult = JSON.parse(data.result) as Record<string, unknown>;
        } catch {
          throw new Error("استجابة Gemini غير صالحة أو غير JSON.");
        }
      } else {
        rawResult = (data.result ?? data) as Record<string, unknown>;
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

      const { data: sessionData } = await supabase.auth.getSession();
      const matchResponse = await fetch("/api/match-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionData.session?.access_token
            ? { Authorization: `Bearer ${sessionData.session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          items: normalizedItems.map((item) => ({
            id: item.id,
            description: item.description,
            raw_text: item.raw_text,
            quantity: item.quantity,
            unit: item.unit,
          })),
        }),
      });

      const matchData = await matchResponse.json();
      if (!matchResponse.ok) {
        throw new Error(matchData?.error || "تعذر مطابقة الأصناف مع قاعدة المنتجات.");
      }

      const matchResults = Array.isArray(matchData?.results) ? matchData.results : [];
      const matchedItems = normalizedItems.map((item, index) => {
        const result = matchResults[index];
        const best = result?.best;
        const product = best?.product ? (best.product as ProductRecord) : null;
        const aiConfidence = Number(item.confidence);
        const matchConfidence = Number(best?.score ?? 0);
        const confidence = Number.isFinite(aiConfidence)
          ? Math.min(1, Math.max(0, Math.min(aiConfidence, matchConfidence || aiConfidence)))
          : matchConfidence;

        return {
          id: item.id,
          description: item.description,
          quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0,
          unit: item.unit,
          raw_text: item.raw_text,
          confidence,
          notes: item.notes,
          product,
          matchReason: String(best?.reason ?? "لا توجد مطابقة كافية"),
          status: best?.status === "HIGH_CONFIDENCE" ? "HIGH_CONFIDENCE" : product ? "NEEDS_REVIEW" : "UNMATCHED",
          rejected: false,
          accepted: Boolean(product) && best?.status === "HIGH_CONFIDENCE" && !result?.requiresReview,
        } as ReviewItem;
      });

      setAnalysisResult({
        items: matchedItems,
        notes: String(rawResult["notes"] ?? "").trim(),
      });
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
      const quoteLines = await Promise.all(
        validItems.map(async (item) => {
          const { data: priceRows, error } = await supabase
            .from("prices")
            .select(
              "id, product_id, price_type, customer_id, amount, currency, source, source_price_type",
            )
            .eq("product_id", item.product!.id)
            .order("created_at", { ascending: true });

          if (error) throw error;

          const customerSpecific = (priceRows ?? []).find(
            (row) => row.price_type === "customer_special" && row.customer_id === customerId,
          );
          const baseRetail = (priceRows ?? []).find(
            (row) => row.price_type === "retail" && !row.customer_id,
          );
          const baseReseller = (priceRows ?? []).find(
            (row) => row.price_type === "reseller" && !row.customer_id,
          );
          const chosen = customerSpecific ?? baseRetail ?? baseReseller ?? null;

          if (!chosen) {
            return { ...item, priceAmount: null, priceType: null, priceLabel: "لا يوجد سعر" };
          }

          return {
            ...item,
            priceAmount: Number(chosen.amount ?? 0),
            priceType: chosen.price_type,
            priceLabel: getPriceLookupKey(chosen.price_type),
          };
        }),
      );

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
              is_manual_price: false,
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
                اختر ملفًا واحدًا أو أكثر من أنواع: JPG · PNG · WEBP · HEIC · PDF · DOCX · XLSX ·
                CSV.
              </p>
            </div>
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,.docx,.xlsx,.xls,.csv"
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
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
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
