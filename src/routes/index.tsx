import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpLeft, ClipboardList, FileText, Info, Upload } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COMPANY,
  SYSTEM,
  dashboardStats,
  orders,
  priceTypeLabel,
  quotes,
  reviewAlerts,
} from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سعّرها — لوحة التحكم | نظام التسعير الذكي" },
      {
        name: "description",
        content:
          "لوحة تحكم سعّرها، نظام التسعير الذكي التابع لشركة الأواب لتجارة الجملة والتجزئة: الطلبات وعروض الأسعار والمنتجات والعملاء.",
      },
      { property: "og:title", content: "سعّرها — لوحة التحكم" },
      {
        property: "og:description",
        content: "نظام التسعير الذكي التابع لشركة الأواب لتجارة الجملة والتجزئة.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <AppShell title="لوحة التحكم" subtitle={`${SYSTEM.nameAr} — ${SYSTEM.taglineAr} · ${COMPANY.nameAr}`}>
      <div className="space-y-5">
        <Card className="overflow-hidden border-0 brand-gradient text-primary-foreground shadow-raised">
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-xs font-semibold text-accent">أهلاً بك في {SYSTEM.nameAr}</p>
              <h2 className="mt-1 text-xl font-extrabold leading-snug">
                استلم طلبية الزبون وحوّلها إلى عرض سعر احترافي
              </h2>
              <p className="mt-1 text-xs text-primary-foreground/75">
                {SYSTEM.ownerLineAr}
              </p>
            </div>
            <Link
              to="/new-order"
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-extrabold text-accent-foreground shadow-raised transition-transform active:scale-[0.98]"
            >
              <Upload className="h-5 w-5" />+ رفع طلبية
            </Link>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {dashboardStats.map((s) => (
            <Card key={s.id} className="shadow-card">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground">{s.labelAr}</p>
                <p className="num mt-1 text-3xl font-extrabold text-primary">{s.value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{s.hintAr}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-accent" /> آخر الطلبات
              </CardTitle>
              <Link to="/orders" className="flex items-center gap-1 text-xs font-bold text-primary">
                الكل <ArrowUpLeft className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {orders.slice(0, 4).map((o) => (
                <div
                  key={o.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-muted/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="num truncate text-sm font-bold">{o.ref}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.customer} · {o.source} · {o.itemsCount} صنف
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{o.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-accent" /> آخر عروض الأسعار
              </CardTitle>
              <Link to="/quotes" className="flex items-center gap-1 text-xs font-bold text-primary">
                الكل <ArrowUpLeft className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {quotes.map((q) => (
                <div
                  key={q.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-muted/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="num truncate text-sm font-bold">{q.ref}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {q.customer} · {priceTypeLabel(q.priceType)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{q.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-accent" /> عناصر تحتاج مراجعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reviewAlerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-accent-soft/60 p-3"
              >
                {a.severity === "warning" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{a.titleAr}</p>
                  <p className="num text-xs text-muted-foreground">{a.refAr}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
