import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownUp, Filter, ImageOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createProduct,
  deleteProduct,
  importProductsAndPrices,
  type ProductImportRow,
  updateProduct,
} from "@/lib/db/saerha-data";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/mock-data";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "المنتجات — سعّرها" },
      {
        name: "description",
        content:
          "إدارة منتجات شركة الأواب في سعّرها: كود الصنف، الأسماء، الماركة، التصنيفات، الموديل، المقاس، الوحدة والحالة.",
      },
      { property: "og:title", content: "المنتجات — سعّرها" },
      {
        property: "og:description",
        content: "إدارة أصناف الكهرباء والإنارة والصحي والسباكة ومواد البناء.",
      },
    ],
  }),
  component: () => (
    <ProtectedRoute>
      <Products />
    </ProtectedRoute>
  ),
});

const FIELDS: { key: keyof Product; label: string }[] = [
  { key: "sku", label: "SKU / كود الصنف" },
  { key: "nameAr", label: "الاسم العربي" },
  { key: "nameEn", label: "الاسم الإنجليزي" },
  { key: "shortName", label: "الاسم المختصر" },
  { key: "brand", label: "الماركة" },
  { key: "category1", label: "التصنيف الرئيسي" },
  { key: "category2", label: "التصنيف الفرعي" },
  { key: "category3", label: "التصنيف الثالث" },
  { key: "group", label: "المجموعة" },
  { key: "model", label: "الموديل" },
  { key: "size", label: "المقاس" },
  { key: "color", label: "اللون" },
  { key: "unit", label: "الوحدة" },
];

function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("sku");
  const [selected, setSelected] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("products")
        .select(
          "id, sku, name_ar, name_en, short_name, brand, category_main, category_sub, category_third, product_group, model, size, color, description, unit, image_url, status",
        )
        .order("sku", { ascending: true });
      if (queryError) throw queryError;
      setItems(
        (data ?? []).map((row) => ({
          id: row.id,
          sku: row.sku,
          nameAr: row.name_ar,
          nameEn: row.name_en ?? "",
          shortName: row.short_name ?? "",
          brand: row.brand ?? "",
          category1: row.category_main ?? "",
          category2: row.category_sub ?? "",
          category3: row.category_third ?? "",
          group: row.product_group ?? "",
          model: row.model ?? "",
          size: row.size ?? "",
          color: row.color ?? "",
          description: row.description ?? "",
          unit: row.unit ?? "",
          image: row.image_url ?? null,
          status: (row.status ?? "active") as Product["status"],
        })),
      );
      setError(null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : "تعذر تحميل المنتجات");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const categories = useMemo(
    () => [...new Set(items.map((p) => p.category1))].filter(Boolean),
    [items],
  );

  const rows = useMemo(() => {
    const term = q.trim();
    return items
      .filter((p) => (cat === "all" ? true : p.category1 === cat))
      .filter((p) =>
        term
          ? [p.sku, p.nameAr, p.nameEn, p.shortName, p.brand, p.model].some((v) =>
              v.toLowerCase().includes(term.toLowerCase()),
            )
          : true,
      )
      .sort((a, b) =>
        sort === "nameAr" ? a.nameAr.localeCompare(b.nameAr, "ar") : a.sku.localeCompare(b.sku),
      );
  }, [q, cat, sort, items]);

  return (
    <AppShell
      title="المنتجات"
      subtitle="إدارة أصناف شركة الأواب — بيانات حقيقية من Supabase"
      action={<ProductForm onSaved={refresh} />}
    >
      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-4">
        <Card className="shadow-card">
          <CardContent className="grid gap-3 p-4 lg:grid-cols-3">
            <div className="relative lg:col-span-3">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-12 pr-10"
                placeholder="ابحث بالكود أو الاسم أو الماركة أو الموديل"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Filter className="h-3.5 w-3.5" /> التصنيف الرئيسي
              </Label>
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع التصنيفات</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <ArrowDownUp className="h-3.5 w-3.5" /> الترتيب
              </Label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sku">كود الصنف</SelectItem>
                  <SelectItem value="nameAr">الاسم العربي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <p className="num text-xs text-muted-foreground">النتائج: {rows.length}</p>
              <Badge variant="default">{loading ? "جاري التحميل" : "من قاعدة البيانات"}</Badge>
            </div>
          </CardContent>
        </Card>

        {rows.length === 0 && !loading ? (
          <Card className="shadow-card">
            <CardContent className="p-6 text-sm text-muted-foreground">
              لا توجد بيانات بعد.
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-3 lg:hidden">
          {rows.map((p) => (
            <Card key={p.id} className="shadow-card">
              <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <ImageOff className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="num text-xs font-bold text-accent">{p.sku}</p>
                  <p className="truncate text-sm font-bold">{p.nameAr}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.brand} · {p.category1} · {p.unit}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setSelected(p)}
                >
                  تفاصيل
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="hidden shadow-card lg:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">SKU</TableHead>
                  <TableHead className="text-right">الاسم العربي</TableHead>
                  <TableHead className="text-right">الماركة</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">الموديل</TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="num font-bold">{p.sku}</TableCell>
                    <TableCell>{p.nameAr}</TableCell>
                    <TableCell>{p.brand}</TableCell>
                    <TableCell>{p.category1}</TableCell>
                    <TableCell className="num">{p.model}</TableCell>
                    <TableCell>{p.unit}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"}>
                        {p.status === "active" ? "مفعّل" : "غير مفعّل"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(p)}>
                        تفاصيل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
          <DialogHeader>
            <DialogTitle>{selected?.nameAr}</DialogTitle>
            <DialogDescription className="num">{selected?.sku}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="rounded-lg bg-muted/50 p-2.5">
                    <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold">
                      {String(selected[f.key])}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">الوصف</p>
                <p className="mt-0.5 text-sm">{selected.description}</p>
              </div>
              <ProductForm
                selected={selected}
                onSaved={async () => {
                  await refresh();
                  setSelected(null);
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ProductForm({
  selected,
  onSaved,
}: {
  selected?: Product;
  onSaved?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importReport, setImportReport] = useState<{
    new: number;
    updated: number;
    priceChanged: number;
    duplicate: number;
    error: number;
  } | null>(null);
  const [form, setForm] = useState<{
    sku: string;
    nameAr: string;
    nameEn: string;
    shortName: string;
    brand: string;
    category1: string;
    category2: string;
    category3: string;
    group: string;
    model: string;
    size: string;
    color: string;
    unit: string;
    description: string;
    image: string;
    status: Product["status"];
  }>({
    sku: selected?.sku ?? "",
    nameAr: selected?.nameAr ?? "",
    nameEn: selected?.nameEn ?? "",
    shortName: selected?.shortName ?? "",
    brand: selected?.brand ?? "",
    category1: selected?.category1 ?? "",
    category2: selected?.category2 ?? "",
    category3: selected?.category3 ?? "",
    group: selected?.group ?? "",
    model: selected?.model ?? "",
    size: selected?.size ?? "",
    color: selected?.color ?? "",
    unit: selected?.unit ?? "",
    description: selected?.description ?? "",
    image: selected?.image ?? "",
    status: selected?.status ?? "active",
  });

  useEffect(() => {
    if (selected) {
      setForm({
        sku: selected.sku,
        nameAr: selected.nameAr,
        nameEn: selected.nameEn,
        shortName: selected.shortName,
        brand: selected.brand,
        category1: selected.category1,
        category2: selected.category2,
        category3: selected.category3,
        group: selected.group,
        model: selected.model,
        size: selected.size,
        color: selected.color,
        unit: selected.unit,
        description: selected.description,
        image: selected.image ?? "",
        status: selected.status,
      });
    }
  }, [selected, open]);

  const readImportRows = (rows: Record<string, unknown>[]): ProductImportRow[] => {
    const readValue = (row: Record<string, unknown>, field?: string) => {
      if (!field) return "";
      const direct = row[field];
      if (direct !== undefined && direct !== null) return direct;
      return "";
    };

    const toStringOrNull = (value: unknown): string | null => {
      if (value === null || value === undefined || value === "") return null;
      return String(value);
    };

    const normalizeOptionalPrice = (value: unknown): string | number | null => {
      if (value === null || value === undefined || value === "") return null;
      return typeof value === "number" ? value : String(value);
    };

    return rows
      .map((row): ProductImportRow => ({
        sku: String(
          readValue(row, "sku") ||
            readValue(row, "SKU") ||
            readValue(row, "كود الصنف") ||
            readValue(row, "Code") ||
            readValue(row, "sku_code") ||
            "",
        ),
        nameAr: String(
          readValue(row, "name_ar") ||
            readValue(row, "nameAr") ||
            readValue(row, "الاسم العربي") ||
            readValue(row, "اسم عربي") ||
            readValue(row, "arabic_name") ||
            "",
        ),
        nameEn: String(
          readValue(row, "name_en") ||
            readValue(row, "nameEn") ||
            readValue(row, "الاسم الإنجليزي") ||
            readValue(row, "اسم انجليزي") ||
            readValue(row, "english_name") ||
            "",
        ),
        shortName: String(
          readValue(row, "short_name") ||
            readValue(row, "shortName") ||
            readValue(row, "اسم مختصر") ||
            readValue(row, "الاسم المختصر") ||
            readValue(row, "short_name") ||
            "",
        ),
        brand: String(
          readValue(row, "brand") ||
            readValue(row, "الماركة") ||
            readValue(row, "brand_name") ||
            "",
        ),
        category1: String(
          readValue(row, "category_main") ||
            readValue(row, "category1") ||
            readValue(row, "التصنيف الرئيسي") ||
            readValue(row, "main_category") ||
            "",
        ),
        category2: String(
          readValue(row, "category_sub") ||
            readValue(row, "category2") ||
            readValue(row, "التصنيف الفرعي") ||
            readValue(row, "sub_category") ||
            "",
        ),
        category3: String(
          readValue(row, "category_third") ||
            readValue(row, "category3") ||
            readValue(row, "التصنيف الثالث") ||
            readValue(row, "third_category") ||
            "",
        ),
        group: String(
          readValue(row, "product_group") ||
            readValue(row, "group") ||
            readValue(row, "المجموعة") ||
            readValue(row, "group_name") ||
            "",
        ),
        model: String(
          readValue(row, "model") ||
            readValue(row, "الموديل") ||
            readValue(row, "model_name") ||
            "",
        ),
        size: String(
          readValue(row, "size") || readValue(row, "المقاس") || readValue(row, "size_name") || "",
        ),
        color: String(
          readValue(row, "color") || readValue(row, "اللون") || readValue(row, "color_name") || "",
        ),
        unit: String(
          readValue(row, "unit") ||
            readValue(row, "الوحدة") ||
            readValue(row, "unit_name") ||
            "حبة",
        ),
        description: String(
          readValue(row, "description") ||
            readValue(row, "الوصف") ||
            readValue(row, "description_text") ||
            "",
        ),
        status:
          String(readValue(row, "status") || "active").toLowerCase() === "inactive"
            ? "inactive"
            : "active",
        retailPrice: normalizeOptionalPrice(
          readValue(row, "retail_price") ||
            readValue(row, "سعر التجزئة") ||
            readValue(row, "Retail Price") ||
            readValue(row, "retail") ||
            null,
        ),
        resellerPrice: normalizeOptionalPrice(
          readValue(row, "reseller_price") ||
            readValue(row, "سعر الموزع") ||
            readValue(row, "Reseller Price") ||
            readValue(row, "reseller") ||
            null,
        ),
        customerSpecialPrice: normalizeOptionalPrice(
          readValue(row, "customer_special_price") ||
            readValue(row, "سعر خاص") ||
            readValue(row, "Customer Special Price") ||
            readValue(row, "special_price") ||
            null,
        ),
        customerName: toStringOrNull(
          readValue(row, "customer_name") ||
            readValue(row, "اسم العميل") ||
            readValue(row, "Customer Name") ||
            readValue(row, "customer_name") ||
            "",
        ),
        currency: String(
          readValue(row, "currency") ||
            readValue(row, "العملة") ||
            readValue(row, "Currency") ||
            "KWD",
        ),
      }))
      .filter((row) => row.sku || row.nameAr || row.nameEn);
  };

  const defaultColumnMap = (headers: string[]) => {
    const find = (...keys: string[]) =>
      headers.find((header) =>
        keys.some((key) => key.toLowerCase() === String(header).toLowerCase()),
      ) ?? "";
    return {
      sku: find("sku", "كود الصنف", "code"),
      nameAr: find("name_ar", "namear", "اسم عربي", "الاسم العربي", "arabic_name"),
      nameEn: find("name_en", "nameen", "اسم انجليزي", "الاسم الإنجليزي", "english_name"),
      shortName: find("short_name", "shortname", "اسم مختصر", "الاسم المختصر"),
      brand: find("brand", "الماركة", "brand_name"),
      category1: find("category_main", "category1", "التصنيف الرئيسي", "main_category"),
      category2: find("category_sub", "category2", "التصنيف الفرعي", "sub_category"),
      category3: find("category_third", "category3", "التصنيف الثالث", "third_category"),
      group: find("product_group", "group", "المجموعة", "group_name"),
      model: find("model", "الموديل", "model_name"),
      size: find("size", "المقاس", "size_name"),
      color: find("color", "اللون", "color_name"),
      unit: find("unit", "الوحدة", "unit_name"),
      description: find("description", "الوصف", "description_text"),
      retailPrice: find("retail_price", "سعر التجزئة", "retail", "retail price"),
      resellerPrice: find("reseller_price", "سعر الموزع", "reseller", "reseller price"),
      customerSpecialPrice: find(
        "customer_special_price",
        "سعر خاص",
        "special price",
        "customer special price",
      ),
      customerName: find("customer_name", "اسم العميل", "customer name"),
      currency: find("currency", "العملة", "currency"),
    } as Record<string, string>;
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setImporting(true);
      setImportReport(null);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("الملف المحدد لا يحتوي على أوراق عمل.");
      const sheet = workbook.Sheets[firstSheetName];
      if (!sheet) throw new Error("تعذر قراءة الورقة الأولى من الملف.");
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const imported = readImportRows(rows as Record<string, unknown>[]);
      const headers = Object.keys((rows as Record<string, unknown>[])[0] ?? {});
      setPreviewRows(imported);
      setColumnMap(defaultColumnMap(headers));
      setOpen(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر قراءة الملف المختار");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const importRows = useMemo<ProductImportRow[]>(
    () =>
      previewRows.map((row): ProductImportRow => {
        const read = (field?: string) => {
          if (!field) return "";
          const value = row[field as keyof typeof row];
          return value === undefined ? "" : value;
        };

        const toStringOrNull = (value: unknown): string | null => {
          if (value === null || value === undefined || value === "") return null;
          return String(value);
        };

        const statusValue: ProductImportRow["status"] =
          String(read(columnMap["status"] ?? "") || read("status") || "active").toLowerCase() ===
          "inactive"
            ? "inactive"
            : "active";

        const normalizeOptionalPrice = (value: unknown): string | number | null => {
          if (value === null || value === undefined || value === "") return null;
          return typeof value === "number" ? value : String(value);
        };

        return {
          sku: String(read(columnMap["sku"]) || read("sku") || ""),
          nameAr: String(read(columnMap["nameAr"]) || read("nameAr") || ""),
          nameEn: String(read(columnMap["nameEn"]) || read("nameEn") || ""),
          shortName: String(read(columnMap["shortName"]) || read("shortName") || ""),
          brand: String(read(columnMap["brand"]) || read("brand") || ""),
          category1: String(read(columnMap["category1"]) || read("category1") || ""),
          category2: String(read(columnMap["category2"]) || read("category2") || ""),
          category3: String(read(columnMap["category3"]) || read("category3") || ""),
          group: String(read(columnMap["group"]) || read("group") || ""),
          model: String(read(columnMap["model"]) || read("model") || ""),
          size: String(read(columnMap["size"]) || read("size") || ""),
          color: String(read(columnMap["color"]) || read("color") || ""),
          unit: String(read(columnMap["unit"]) || read("unit") || "حبة"),
          description: String(read(columnMap["description"]) || read("description") || ""),
          status: statusValue,
          retailPrice: normalizeOptionalPrice(
            read(columnMap["retailPrice"] ?? "") || read("retailPrice") || null,
          ),
          resellerPrice: normalizeOptionalPrice(
            read(columnMap["resellerPrice"] ?? "") || read("resellerPrice") || null,
          ),
          customerSpecialPrice: normalizeOptionalPrice(
            read(columnMap["customerSpecialPrice"] ?? "") || read("customerSpecialPrice") || null,
          ),
          customerName: toStringOrNull(
            read(columnMap["customerName"] ?? "") || read("customerName") || "",
          ),
          currency: String(read(columnMap["currency"]) || read("currency") || "KWD"),
        };
      }),
    [previewRows, columnMap],
  );

  const confirmImport = async () => {
    if (importRows.length === 0) return;
    try {
      setSaving(true);
      const result = await importProductsAndPrices(importRows);
      setImportReport(result);
      setPreviewRows([]);
      setColumnMap({});
      if (onSaved) await onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر استيراد الملف");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    try {
      setSaving(true);
      if (selected) {
        await updateProduct(selected.id, {
          sku: form.sku,
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          shortName: form.shortName,
          brand: form.brand,
          category1: form.category1,
          category2: form.category2,
          category3: form.category3,
          group: form.group,
          model: form.model,
          size: form.size,
          color: form.color,
          unit: form.unit,
          description: form.description,
          status: form.status,
        });
      } else {
        await createProduct({
          sku: form.sku,
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          shortName: form.shortName,
          brand: form.brand,
          category1: form.category1,
          category2: form.category2,
          category3: form.category3,
          group: form.group,
          model: form.model,
          size: form.size,
          color: form.color,
          unit: form.unit || "حبة",
          description: form.description,
          image: form.image || null,
          status: form.status,
        });
      }
      setOpen(false);
      if (onSaved) await onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ المنتج");
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async () => {
    if (!selected) return;
    if (!window.confirm(`هل تريد حذف المنتج "${selected.nameAr}" (SKU: ${selected.sku}) نهائيًا؟ سيتم حذف أسعاره والاختصارات المرتبطة به.`)) return;
    try {
      setSaving(true);
      await deleteProduct(selected.id);
      setOpen(false);
      if (onSaved) await onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حذف المنتج");
    } finally {
      setSaving(false);
    }
  };

  const labels = [
    { key: "sku", label: "SKU / كود الصنف" },
    { key: "nameAr", label: "الاسم العربي" },
    { key: "nameEn", label: "الاسم الإنجليزي" },
    { key: "shortName", label: "الاسم المختصر" },
    { key: "brand", label: "الماركة" },
    { key: "category1", label: "التصنيف الرئيسي" },
    { key: "category2", label: "التصنيف الفرعي" },
    { key: "category3", label: "التصنيف الثالث" },
    { key: "group", label: "المجموعة" },
    { key: "model", label: "الموديل" },
    { key: "size", label: "المقاس" },
    { key: "color", label: "اللون" },
    { key: "unit", label: "الوحدة" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-12 shrink-0 gap-2 font-extrabold" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> {selected ? "تعديل المنتج" : "إضافة منتج"}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
        <DialogHeader>
          <DialogTitle>{selected ? "تعديل المنتج" : "إضافة منتج"}</DialogTitle>
          <DialogDescription>الحقول الأساسية لصنف في قاعدة منتجات شركة الأواب.</DialogDescription>
        </DialogHeader>

        <div className="mb-3 flex gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm font-semibold">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImport}
            />
            {importing ? "جارٍ قراءة الملف..." : "استيراد المنتجات"}
          </label>
          <a
            href="data:text/csv;charset=utf-8,%EF%BB%BFsku,name_ar,name_en,brand,category_main,category_sub,unit%0AABB-001,%D9%82%D8%A7%D8%B9%D8%A9%20%D8%AA%D8%AC%D8%B1%D9%8A%D8%A9,%D9%81%82%D9%81%D8%A7%D9%84%20%D8%A7%D9%84%D8%AA%D8%AC%D8%B1%D9%8A%D8%A9,AL-AWAB,%D9%83%D9%95%D8%A7%D8%AF,%,%D8%AD%D8%A8%D8%A9"
            download="saerha_products_template.csv"
            className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-sm font-bold text-accent-foreground"
          >
            قالب Excel
          </a>
        </div>

        {previewRows.length > 0 && (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 text-sm font-bold">معاينة قبل الحفظ</p>
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              {[
                { field: "sku", label: "SKU / كود الصنف" },
                { field: "nameAr", label: "الاسم العربي" },
                { field: "nameEn", label: "الاسم الإنجليزي" },
                { field: "brand", label: "الماركة" },
                { field: "unit", label: "الوحدة" },
                { field: "retailPrice", label: "سعر التجزئة" },
                { field: "resellerPrice", label: "سعر الموزع" },
                { field: "customerSpecialPrice", label: "سعر خاص" },
                { field: "customerName", label: "اسم العميل" },
                { field: "currency", label: "العملة" },
              ].map(({ field, label }) => {
                const options = Object.keys(previewRows[0] ?? {});
                return (
                  <div key={field} className="space-y-1.5">
                    <Label className="text-[11px]">{label}</Label>
                    <Select
                      value={columnMap[field] ?? ""}
                      onValueChange={(value) =>
                        setColumnMap((prev) => ({ ...prev, [field]: value }))
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="اختر العمود" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">لا يوجد</SelectItem>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
            <div className="max-h-52 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>الاسم العربي</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.slice(0, 5).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{row.sku || "—"}</TableCell>
                      <TableCell>{row.nameAr || row.nameEn || "—"}</TableCell>
                      <TableCell>
                        {row.retailPrice || row.resellerPrice || row.customerSpecialPrice || "—"}
                      </TableCell>
                      <TableCell>{row.sku ? "جاهز" : "خطأ"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button className="mt-3 w-full" onClick={confirmImport} disabled={saving}>
              تأكيد الاستيراد
            </Button>
          </div>
        )}

        {importReport && (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 text-sm font-bold">تقرير الاستيراد</p>
            <div className="grid gap-2 text-sm sm:grid-cols-5">
              <div className="rounded-md bg-background p-2">
                جديد: <span className="num font-bold">{importReport.new}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                محدث: <span className="num font-bold">{importReport.updated}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                سعر متغير: <span className="num font-bold">{importReport.priceChanged}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                مكرر: <span className="num font-bold">{importReport.duplicate}</span>
              </div>
              <div className="rounded-md bg-background p-2">
                خطأ: <span className="num font-bold">{importReport.error}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {labels.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs">{field.label}</Label>
              <Input
                className="h-11"
                value={form[field.key] as string}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.label}
              />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">الوصف</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">صورة المنتج</Label>
            <Input
              type="file"
              className="h-11"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () =>
                    setForm((prev) => ({
                      ...prev,
                      image: typeof reader.result === "string" ? reader.result : "",
                    }));
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الحالة</Label>
            <Select
              value={form.status}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, status: value as "active" | "inactive" }))
              }
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">مفعّل</SelectItem>
                <SelectItem value="inactive">غير مفعّل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="h-12 w-full font-extrabold sm:col-span-2"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "جارٍ الحفظ..." : selected ? "تحديث المنتج" : "حفظ المنتج"}
          </Button>
          {selected && (
            <Button
              type="button"
              variant="destructive"
              className="h-12 w-full font-extrabold sm:col-span-2"
              onClick={() => void removeProduct()}
              disabled={saving}
            >
              <Trash2 className="ml-2 h-4 w-4" />
              حذف المنتج نهائيًا
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
