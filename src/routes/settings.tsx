import { createFileRoute } from "@tanstack/react-router";
import { Database, Rocket } from "lucide-react";

import { AlAwabLogo } from "@/components/brand/Logo";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPANY, SYSTEM } from "@/lib/mock-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — سعّرها" },
      {
        name: "description",
        content: "إعدادات نظام سعّرها وبيانات شركة الأواب لتجارة الجملة والتجزئة الرسمية.",
      },
      { property: "og:title", content: "الإعدادات — سعّرها" },
      { property: "og:description", content: "بيانات الشركة وإعدادات النظام." },
    ],
  }),
  component: SettingsPage,
});

const futureTables = [
  "Products",
  "Customers",
  "Prices",
  "Price History",
  "Units",
  "Product Aliases",
  "Quotations",
  "Quotation Items",
  "Orders",
  "Users",
  "Settings",
];

const roadmap = [
  "قاعدة بيانات منتجات شركة الأواب",
  "استيراد ملفات Excel وCSV",
  "تنظيف وتوحيد بيانات المنتجات",
  "نظام الأسعار",
  "OCR",
  "AI Vision",
  "قراءة الطلبات المكتوبة بخط اليد",
  "فهم أسماء المنتجات",
  "Fuzzy Matching",
  "Semantic Search",
  "Vector Search",
  "Confidence Score",
  "Product Aliases",
  "التعلم من تصحيحات المستخدم",
  "التسعير التلقائي",
  "إنشاء عروض الأسعار",
  "إنشاء PDF",
  "WhatsApp",
  "إدارة المخزون",
];

function SettingsPage() {
  return (
    <AppShell title="الإعدادات" subtitle="بيانات الشركة وإعدادات النظام">
      <div className="space-y-5">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">هوية النظام</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <AlAwabLogo className="h-16 shrink-0 border border-border" />
            <div className="min-w-0">
              <p className="text-lg font-extrabold text-primary">{SYSTEM.nameAr}</p>
              <p className="text-xs font-bold text-accent">{SYSTEM.taglineAr}</p>
              <p className="mt-1 text-xs text-muted-foreground">{SYSTEM.ownerLineAr}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">بيانات الشركة الرسمية</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم بالعربية</Label>
              <Input className="h-12" defaultValue={COMPANY.nameAr} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم بالإنجليزية</Label>
              <Input className="h-12" dir="ltr" defaultValue={COMPANY.nameEn} readOnly />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs">العنوان</Label>
              <Input className="h-12" defaultValue={COMPANY.addressAr} readOnly />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-accent" /> هيكل قاعدة البيانات المستقبلي
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {futureTables.map((t) => (
              <Badge key={t} variant="secondary" className="num text-[11px]">
                {t}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-accent" /> المراحل القادمة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-xs lg:grid-cols-2">
              {roadmap.map((r, i) => (
                <li key={r} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5">
                  <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="truncate font-semibold">{r}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
