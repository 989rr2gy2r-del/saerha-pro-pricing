import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { createFileRoute } from "@tanstack/react-router";
import { Info, Pencil, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { upsertPrice } from "@/lib/db/saerha-data";
import { supabase } from "@/integrations/supabase/client";
import { PRICE_TYPES } from "@/lib/mock-data";

type PriceRecord = {
  id: string;
  product_id: string;
  price_type: "retail" | "reseller" | "customer_special" | "manual_quote";
  customer_id: string | null;
  amount: number;
  currency: string;
  source: string | null;
  customers?: {
    name: string | null;
  } | null;
};

type ProductRow = {
  id: string;
  sku: string;
  name_ar: string;
  name_en: string | null;
  short_name: string | null;
  unit: string | null;
  brand: string | null;
  category_main: string | null;
};

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "غير محدد";
  }

  return `${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} KWD`;
};

const priceTypeLabel: Record<string, string> = {
  retail: "سعر التجزئة",
  reseller: "سعر الموزع",
  customer_special: "أسعار خاصة",
  manual_quote: "سعر يدوي",
};

export const Route = createFileRoute("/prices")({
  head: () => ({
    meta: [
      { title: "الأسعار — سعّرها" },
      {
        name: "description",
        content:
          "نظام الأسعار في سعّرها: سعر التجزئة، سعر الموزع، سعر خاص بالعميل، وسعر يدوي داخل عرض السعر.",
      },
      { property: "og:title", content: "الأسعار — سعّرها" },
      { property: "og:description", content: "أربعة أنواع أسعار مرنة لكل منتج." },
    ],
  }),
  component: () => (
    <ProtectedRoute>
      <Prices />
    </ProtectedRoute>
  ),
});

function Prices() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, PriceRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [productsResult, pricesResult] = await Promise.all([
        supabase
          .from("products")
          .select("id, sku, name_ar, name_en, short_name, unit, brand, category_main")
          .order("sku", { ascending: true }),
        supabase
          .from("prices")
          .select(
            "id, product_id, price_type, customer_id, amount, currency, source, customers(name)",
          )
          .order("product_id", { ascending: true })
          .order("price_type", { ascending: true }),
      ]);

      if (productsResult.error) throw new Error(productsResult.error.message);
      if (pricesResult.error) throw new Error(pricesResult.error.message);

      const nextProducts = (productsResult.data ?? []) as ProductRow[];
      const nextMap: Record<string, PriceRecord[]> = {};

      (pricesResult.data ?? []).forEach((row) => {
        const productId = String(row.product_id);
        if (!nextMap[productId]) nextMap[productId] = [];
        nextMap[productId].push(row as PriceRecord);
      });

      setProducts(nextProducts);
      setPriceMap(nextMap);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "تعذر تحميل أسعار المنتجات";
      setError(message);
      setProducts([]);
      setPriceMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleUpdatePrice = async (
    productId: string,
    type: "retail" | "reseller",
    currentValue?: number,
  ) => {
    const productName = products.find((product) => product.id === productId)?.name_ar ?? "المنتج";
    const value = window.prompt(
      `أدخل قيمة ${priceTypeLabel[type]} للمنتج: ${productName}`,
      currentValue !== undefined ? String(currentValue) : "",
    );

    if (value === null) return;

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("قيمة السعر غير صالحة، الرجاء إدخال رقم صحيح أو 0.");
      return;
    }

    try {
      setSavingKey(`${productId}-${type}`);
      setError(null);
      await upsertPrice({
        product_id: productId,
        price_type: type,
        amount: parsed,
        currency: "KWD",
        source: "manual",
        reason: "Manual price update from pricing matrix",
      });
      await loadData();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "تعذر تحديث السعر";
      setError(message);
    } finally {
      setSavingKey(null);
    }
  };

  const totals = useMemo(
    () => ({
      retail: products.filter((product) =>
        (priceMap[product.id] ?? []).some((row) => row.price_type === "retail"),
      ).length,
      reseller: products.filter((product) =>
        (priceMap[product.id] ?? []).some((row) => row.price_type === "reseller"),
      ).length,
      special: products.filter((product) =>
        (priceMap[product.id] ?? []).some((row) => row.price_type === "customer_special"),
      ).length,
    }),
    [products, priceMap],
  );

  return (
    <AppShell title="الأسعار" subtitle="هيكل الأسعار المرن — أربعة أنواع أسعار لكل منتج">
      <div className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-2">
          {PRICE_TYPES.map((p, i) => (
            <Card key={p.id} className="shadow-card">
              <CardContent className="space-y-2 p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-primary">
                      <span className="num text-accent">{i + 1}. </span>
                      {p.labelAr}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.labelEn}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {p.scopeAr}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed">{p.descAr}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-accent/40 bg-accent-soft/50 shadow-card">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="space-y-1 text-xs leading-relaxed">
              <p className="text-sm font-extrabold">قواعد حماية الأسعار</p>
              <p>· السعر اليدوي داخل عرض سعر معين لا يغيّر السعر الأساسي للمنتج.</p>
              <p>· السعر الخاص بالعميل لا يلغي أسعار المنتج الأساسية.</p>
              <p>· كل تغيير سعر يُسجّل تلقائياً في سجل تاريخ الأسعار (Price History).</p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">مصفوفة أسعار المنتجات</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">SKU</TableHead>
                  <TableHead className="text-right">المنتج</TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                  <TableHead className="text-right">سعر التجزئة</TableHead>
                  <TableHead className="text-right">سعر الموزع</TableHead>
                  <TableHead className="text-right">أسعار خاصة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      جاري تحميل أسعار المنتجات من Supabase...
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      لا توجد أسعار مسجلة حتى الآن.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => {
                    const rows = priceMap[product.id] ?? [];
                    const retail = rows.find((row) => row.price_type === "retail");
                    const reseller = rows.find((row) => row.price_type === "reseller");
                    const specials = rows.filter((row) => row.price_type === "customer_special");

                    return (
                      <TableRow key={product.id}>
                        <TableCell className="num font-bold">{product.sku}</TableCell>
                        <TableCell className="min-w-40">
                          <div className="space-y-0.5">
                            <p className="font-bold">{product.name_ar}</p>
                            {product.name_en ? (
                              <p className="text-xs text-muted-foreground">{product.name_en}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{product.unit ?? "—"}</TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <span className="num text-primary">
                              {formatCurrency(retail?.amount)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                handleUpdatePrice(product.id, "retail", retail?.amount)
                              }
                              disabled={savingKey === `${product.id}-retail`}
                              title="تحديث سعر التجزئة"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <span className="num text-primary">
                              {formatCurrency(reseller?.amount)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                handleUpdatePrice(product.id, "reseller", reseller?.amount)
                              }
                              disabled={savingKey === `${product.id}-reseller`}
                              title="تحديث سعر الموزع"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {specials.length === 0 ? (
                            <span className="text-muted-foreground">— غير محدد</span>
                          ) : (
                            <div className="space-y-1">
                              {specials.map((row) => (
                                <div key={row.id} className="text-xs text-muted-foreground">
                                  <span className="num text-primary">
                                    {formatCurrency(row.amount)}
                                  </span>
                                  {row.customers?.name ? ` · ${row.customers.name}` : ""}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1">
              <p>
                إجمالي المنتجات:{" "}
                <span className="num font-bold text-foreground">{products.length}</span>
              </p>
              <p>
                سعر التجزئة: <span className="num font-bold text-foreground">{totals.retail}</span>
              </p>
              <p>
                سعر الموزع: <span className="num font-bold text-foreground">{totals.reseller}</span>
              </p>
              <p>
                أسعار خاصة: <span className="num font-bold text-foreground">{totals.special}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
