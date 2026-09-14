import { createFileRoute } from "@tanstack/react-router";
import { Info, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PRICE_TYPES, products } from "@/lib/mock-data";

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
  component: Prices,
});

function Prices() {
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
              <p>· كل تغيير سعر سيُسجّل لاحقاً في سجل تاريخ الأسعار (Price History).</p>
            </div>
          </CardContent>
        </Card>

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
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="num font-bold">{p.sku}</TableCell>
                    <TableCell className="min-w-40">{p.nameAr}</TableCell>
                    <TableCell>{p.unit}</TableCell>
                    <TableCell className="text-muted-foreground">— غير مُعرّف</TableCell>
                    <TableCell className="text-muted-foreground">— غير مُعرّف</TableCell>
                    <TableCell className="num text-muted-foreground">0</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              لم تُدخل أي أسعار بعد. الأسعار الحقيقية ستُضاف في مرحلة لاحقة بعد ربط قاعدة بيانات منتجات
              شركة الأواب.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
