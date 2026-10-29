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
      action={<ProductForm items={items} onSaved={refresh} />}
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
                  <TableHead className="text-right">الاسم الإنجليزي</TableHead>
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
                    <TableCell dir="ltr" className="text-left">{p.nameEn || "—"}</TableCell>
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
                items={items}
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
  items,
  selected,
  onSaved,
}: {
  items: Product[];
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
  const downloadProductTemplate = () => {
    const headers = [
      "sku", "name_ar", "name_en", "short_name", "brand",
      "category_main", "category_sub", "category_third", "product_group",
      "model", "size", "color", "unit", "description", "status",
      "retail_price", "reseller_price", "secondary_unit", "units_per_primary",
      "secondary_retail_price", "secondary_reseller_price", "carton_count", "currency",
    ];
    const example = [
      "AW-001", "مثال: سلك كهربائي", "Example: Electrical Wire", "سلك",
      "الخليج", "الكهرباء", "الأسلاك", "", "الوايرات", "", "2.5 ملم", "أحمر",
      "رول", "مثال توضيحي — استبدله ببيانات الصنف الفعلية", "active",
      "", "", "متر", 100, "", "", "", "KWD",
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, example]);
    worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(16, header.length + 3) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
    XLSX.writeFile(workbook, "saerha_products_template.xlsx");
  };

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
    retailPrice: string;
    resellerPrice: string;
    secondaryUnit: string;
    unitsPerPrimary: string;
    secondaryRetailPrice: string;
    secondaryResellerPrice: string;
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
    retailPrice: "",
    resellerPrice: "",
    secondaryUnit: "",
    unitsPerPrimary: "",
    secondaryRetailPrice: "",
    secondaryResellerPrice: "",
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
        retailPrice: "",
        resellerPrice: "",
        secondaryUnit: "",
        unitsPerPrimary: "",
        secondaryRetailPrice: "",
        secondaryResellerPrice: "",
      });
    }
  }, [selected, open]);

  const normalizeHeader = (value: unknown) =>
    String(value ?? "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[\s_.\\-]+/g, "").replace(/\//g, "")
      .replace(/[：:]/g, "");

  const defaultColumnMap = (headers: string[]) => {
    const normalizedHeaders = headers.map((header) => ({
      original: header,
      normalized: normalizeHeader(header),
    }));
    const find = (...keys: string[]) => {
      const normalizedKeys = keys.map(normalizeHeader);
      return normalizedHeaders.find((header) => normalizedKeys.includes(header.normalized))?.original ?? "";
    };
    return {
      sku: find("sku", "كود الصنف", "code", "sku_code"),
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
      status: find("status", "الحالة"),
      retailPrice: find("retail_price", "retailprice", "سعر البيع/ص", "سعر التجزئة", "retail", "retail price"),
      resellerPrice: find("reseller_price", "resellerprice", "شراء/ص", "سعر الموزع", "reseller", "reseller price"),
      secondaryUnit: find("secondary_unit", "secondaryunit", "unit_secondary", "الوحدة الثانوية", "الوحدة الثانوية المصدر"),
      unitsPerPrimary: find("units_per_primary", "unitsperprimary", "units_per_unit", "عدد الوحدات في الوحدة الكبرى"),
      secondaryRetailPrice: find("secondary_retail_price", "secondaryretailprice", "بيع/ص المصدر", "سعر بيع الوحدة الثانوية"),
      secondaryResellerPrice: find("secondary_reseller_price", "secondaryresellerprice", "بيع/ك المصدر", "سعر جملة الوحدة الثانوية"),
      cartonCount: find("carton_count", "cartoncount", "عدد قطع الكبرى", "عدد قطع الكبرى المصدر"),
      customerSpecialPrice: find("customer_special_price", "سعر خاص", "special price", "customer special price"),
      customerName: find("customer_name", "اسم العميل", "customer name"),
      currency: find("currency", "العملة"),
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
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
      if (rawRows.length === 0) throw new Error("الملف لا يحتوي على صفوف بيانات.");
      const headers = Object.keys(rawRows[0] ?? {});
      const mapping = defaultColumnMap(headers);
      if (!mapping.sku) throw new Error("لم أجد عمود كود الصنف (SKU). تأكد من وجود عمود sku أو كود الصنف.");
      if (!mapping.nameAr && !mapping.nameEn) throw new Error("لم أجد عمود الاسم العربي أو الإنجليزي.");
      setPreviewRows(rawRows);
      setColumnMap(mapping);
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
        const read = (field: string) => {
          const value = row[columnMap[field] ?? ""];
          return value === undefined || value === null ? "" : value;
        };
        const optionalText = (value: unknown): string | null => {
          if (value === null || value === undefined || String(value).trim() === "") return null;
          return String(value).trim();
        };
        const optionalNumber = (value: unknown): string | number | null => {
          if (value === null || value === undefined || String(value).trim() === "") return null;
          return typeof value === "number" ? value : String(value).trim();
        };
        const statusValue = String(read("status") || "active").trim().toLowerCase();
        return {
          sku: String(read("sku") ?? "").trim(),
          nameAr: String(read("nameAr") ?? "").trim(),
          nameEn: String(read("nameEn") ?? "").trim(),
          shortName: String(read("shortName") ?? "").trim(),
          brand: String(read("brand") ?? "").trim(),
          category1: String(read("category1") ?? "").trim(),
          category2: String(read("category2") ?? "").trim(),
          category3: String(read("category3") ?? "").trim(),
          group: String(read("group") ?? "").trim(),
          model: String(read("model") ?? "").trim(),
          size: String(read("size") ?? "").trim(),
          color: String(read("color") ?? "").trim(),
          unit: String(read("unit") || "حبة").trim(),
          description: String(read("description") ?? "").trim(),
          status: statusValue === "inactive" || statusValue === "غير مفعّل" ? "inactive" : "active",
          retailPrice: optionalNumber(read("retailPrice")),
          resellerPrice: optionalNumber(read("resellerPrice")),
          secondaryUnit: optionalText(read("secondaryUnit")),
          unitsPerPrimary: optionalNumber(read("unitsPerPrimary")),
          secondaryRetailPrice: optionalNumber(read("secondaryRetailPrice")),
          secondaryResellerPrice: optionalNumber(read("secondaryResellerPrice")),
          cartonCount: optionalNumber(read("cartonCount")),
          customerSpecialPrice: optionalNumber(read("customerSpecialPrice")),
          customerName: optionalText(read("customerName")),
          currency: String(read("currency") || "KWD").trim(),
        };
      }).filter((row) => Boolean(row.sku || row.nameAr || row.nameEn)),
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
      if (form.secondaryUnit.trim() && (!form.unitsPerPrimary.trim() || !Number.isFinite(Number(form.unitsPerPrimary)) || Number(form.unitsPerPrimary) <= 0)) {
        throw new Error("أدخل معامل تحويل صحيحًا أكبر من صفر للوحدة الثانوية.");
      }
      if (!form.secondaryUnit.trim() && (form.unitsPerPrimary.trim() || form.secondaryRetailPrice.trim() || form.secondaryResellerPrice.trim())) {
        throw new Error("حدد الوحدة الثانوية أولًا قبل إدخال معامل التحويل أو أسعارها.");
      }
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
          image: form.image || null,
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
      if (
        form.retailPrice.trim() || form.resellerPrice.trim() || form.secondaryUnit.trim() ||
        form.secondaryRetailPrice.trim() || form.secondaryResellerPrice.trim()
      ) {
        await importProductsAndPrices([{
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
          status: form.status,
          retailPrice: form.retailPrice.trim() || null,
          resellerPrice: form.resellerPrice.trim() || null,
          secondaryUnit: form.secondaryUnit.trim() || null,
          unitsPerPrimary: form.unitsPerPrimary.trim() || null,
          secondaryRetailPrice: form.secondaryRetailPrice.trim() || null,
          secondaryResellerPrice: form.secondaryResellerPrice.trim() || null,
          currency: "KWD",
        }]);
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

  // حقول النموذج مرتبة كما في صورة نموذج Excel، مع الحفاظ على SKU كحقل إلزامي.
  const unitOptions = [...new Set(["رول", "متر", "حبة", "كرتون", "قطعة", "كيس", ...items.map((p) => p.unit)])].filter(Boolean);
  const categoryOptions = [...new Set(items.map((p) => p.category1))].filter(Boolean);
  const brandOptions = [...new Set(items.map((p) => p.brand))].filter(Boolean);
  const [cartonCount, setCartonCount] = useState("");
  const fieldClass = "h-12 rounded-xl border-slate-300 bg-white text-base";
  const textField = (key: "sku" | "nameAr" | "nameEn" | "retailPrice" | "resellerPrice" | "secondaryUnit" | "unitsPerPrimary" | "secondaryRetailPrice" | "secondaryResellerPrice" | "category1" | "brand", label: string, numeric = false) => (
    <div className="space-y-1.5" key={key}>
      <Label className="text-sm font-semibold">{label}</Label>
      <Input className={fieldClass} inputMode={numeric ? "decimal" : "text"} value={form[key]} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))} placeholder={label} required={key === "sku" || key === "nameAr"} />
    </div>
  );
  const selectField = (key: "unit" | "secondaryUnit" | "category1" | "brand", label: string, options: string[]) => (
    <div className="space-y-1.5" key={key}>
      <Label className="text-sm font-semibold">{label}</Label>
      <Select value={form[key]} onValueChange={(value) => setForm((prev) => ({ ...prev, [key]: value }))}>
        <SelectTrigger className={fieldClass}><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-12 shrink-0 gap-2 font-extrabold" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> {selected ? "تعديل المنتج" : "إضافة منتج"}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="w-[min(96vw,1200px)] max-w-[1200px] max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-6 text-right shadow-xl sm:p-8">
        <DialogHeader>
          <DialogTitle>{selected ? "تعديل المنتج" : "إضافة منتج"}</DialogTitle>
          <DialogDescription>أدخل بيانات المنتج حسب أعمدة نموذج ملف Excel.</DialogDescription>
        </DialogHeader>
        <div className="mb-3 flex gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md bg-secondary px-3 py-2 text-sm font-semibold">
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
            {importing ? "جارٍ قراءة الملف..." : "استيراد المنتجات"}
          </label>
          <Button type="button" variant="default" className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-sm font-bold text-accent-foreground" onClick={downloadProductTemplate}>قالب Excel</Button>
        </div>
        {previewRows.length > 0 && (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 text-sm font-bold">معاينة قبل الحفظ</p>
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              {[
                { field: "sku", label: "SKU / كود الصنف" }, { field: "nameAr", label: "الاسم العربي" },
                { field: "nameEn", label: "الاسم الإنجليزي" }, { field: "brand", label: "الماركة" },
                { field: "unit", label: "الوحدة" }, { field: "retailPrice", label: "سعر التجزئة" },
                { field: "resellerPrice", label: "سعر الموزع" }, { field: "customerSpecialPrice", label: "سعر خاص" },
                { field: "customerName", label: "اسم العميل" }, { field: "currency", label: "العملة" },
              ].map(({ field, label }) => {
                const options = Object.keys(previewRows[0] ?? {});
                return <div key={field} className="space-y-1.5"><Label className="text-[11px]">{label}</Label><Select value={columnMap[field] ?? ""} onValueChange={(value) => setColumnMap((prev) => ({ ...prev, [field]: value }))}><SelectTrigger className="h-10"><SelectValue placeholder="اختر العمود" /></SelectTrigger><SelectContent><SelectItem value="none">لا يوجد</SelectItem>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>;
              })}
            </div>
            <div className="max-h-52 overflow-auto"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>الاسم العربي</TableHead><TableHead>السعر</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader><TableBody>{importRows.slice(0, 5).map((row, idx) => <TableRow key={idx}><TableCell>{row.sku || "—"}</TableCell><TableCell>{row.nameAr || row.nameEn || "—"}</TableCell><TableCell>{row.retailPrice || row.resellerPrice || row.customerSpecialPrice || "—"}</TableCell><TableCell>{row.sku ? "جاهز" : "خطأ"}</TableCell></TableRow>)}</TableBody></Table></div>
            <Button className="mt-3 w-full" onClick={confirmImport} disabled={saving}>تأكيد الاستيراد</Button>
          </div>
        )}
        {importReport && <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3"><p className="mb-2 text-sm font-bold">تقرير الاستيراد</p><div className="grid gap-2 text-sm sm:grid-cols-5"><div className="rounded-md bg-background p-2">جديد: <span className="num font-bold">{importReport.new}</span></div><div className="rounded-md bg-background p-2">محدث: <span className="num font-bold">{importReport.updated}</span></div><div className="rounded-md bg-background p-2">سعر متغير: <span className="num font-bold">{importReport.priceChanged}</span></div><div className="rounded-md bg-background p-2">مكرر: <span className="num font-bold">{importReport.duplicate}</span></div><div className="rounded-md bg-background p-2">خطأ: <span className="num font-bold">{importReport.error}</span></div></div></div>}
        <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {textField("nameAr", "الاسم العربي")}
          {textField("nameEn", "الاسم الإنجليزي")}
          {textField("unitsPerPrimary", "العدد", true)}
          {selectField("unit", "الوحدة/ص", unitOptions)}
          {textField("resellerPrice", "شراء/ص", true)}
          {textField("retailPrice", "بيع/ص", true)}
          {selectField("secondaryUnit", "الوحدة/ك", unitOptions)}
          {textField("secondaryResellerPrice", "شراء/ك", true)}
          {textField("secondaryRetailPrice", "بيع/ك", true)}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">عدد قطع الكبرى</Label>
            <Input className={fieldClass} inputMode="numeric" value={cartonCount} onChange={(e) => setCartonCount(e.target.value)} placeholder="عدد قطع الكبرى" />
          </div>
          {selectField("category1", "التصنيف", categoryOptions)}
          {selectField("brand", "الماركة", brandOptions)}
          {textField("sku", "كود الصنف (SKU)")}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">صورة المنتج</Label>
            <Input
              className={fieldClass}
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  alert("اختر ملف صورة صالحًا.");
                  event.target.value = "";
                  return;
                }
                if (file.size > 2 * 1024 * 1024) {
                  alert("حجم الصورة يجب ألا يتجاوز 2 ميجابايت.");
                  event.target.value = "";
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") {
                    setForm((prev) => ({ ...prev, image: reader.result as string }));
                  }
                };
                reader.readAsDataURL(file);
              }}
            />
            {form.image && <img src={form.image} alt="معاينة صورة المنتج" className="h-16 w-16 rounded-lg border object-cover" />}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">الحالة</Label>
            <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as Product["status"] }))}>
              <SelectTrigger className={fieldClass}><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">مفعّل</SelectItem>
                <SelectItem value="inactive">غير مفعّل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-14 w-full rounded-xl bg-orange-500 text-base font-extrabold text-white hover:bg-orange-600 sm:col-span-2 lg:col-span-3" onClick={submit} disabled={saving}>{saving ? "جارٍ الحفظ..." : selected ? "تحديث المنتج" : "حفظ المنتج"}</Button>
          {selected && <Button type="button" variant="destructive" className="h-12 w-full font-extrabold sm:col-span-2 lg:col-span-3" onClick={() => void removeProduct()} disabled={saving}><Trash2 className="ml-2 h-4 w-4" /> حذف المنتج نهائيًا</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
