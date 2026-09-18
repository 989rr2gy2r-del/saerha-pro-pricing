import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpLeft, ClipboardList, FileText, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type CustomerSummary = {
  name?: string | null;
  company?: string | null;
};

type DashboardOrder = {
  id: string;
  reference: string;
  status: string;
  source: string | null;
  received_at: string | null;
  customer?: CustomerSummary | CustomerSummary[] | null;
  order_items?: Array<{ id: string; line_total?: number | null }> | null;
};

type DashboardQuote = {
  id: string;
  reference: string;
  status: string;
  total?: number | null;
  customers?: CustomerSummary | CustomerSummary[] | null;
};

const statusLabel: Record<string, string> = {
  new: "جديدة",
  in_review: "قيد المراجعة",
  priced: "مسعّرة",
  closed: "مكتملة",
};

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
  component: () => (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  ),
});

function Dashboard() {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [quotes, setQuotes] = useState<DashboardQuote[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const [ordersResult, quotesResult, productsResult, customersResult] = await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, reference, status, source, received_at, customers(name, company), order_items(id, line_total)",
            )
            .order("received_at", { ascending: false })
            .limit(8),
          supabase
            .from("quotations")
            .select("id, reference, status, total, customers(name, company)")
            .order("issue_date", { ascending: false })
            .limit(6),
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase.from("customers").select("id", { count: "exact", head: true }),
        ]);

        if (ordersResult.error) throw ordersResult.error;
        if (quotesResult.error) throw quotesResult.error;

        setOrders((ordersResult.data ?? []) as DashboardOrder[]);
        setQuotes((quotesResult.data ?? []) as DashboardQuote[]);
        setProductCount(productsResult.count ?? 0);
        setCustomerCount(customersResult.count ?? 0);
      } catch (loadError) {
        console.error(loadError);
        setError("تعذر تحميل مؤشرات لوحة التحكم من قاعدة البيانات.");
        setOrders([]);
        setQuotes([]);
        setProductCount(0);
        setCustomerCount(0);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  const metrics = useMemo(() => {
    const totalOrders = orders.length;
    const newOrders = orders.filter((order) => order.status === "new").length;
    const inReviewOrders = orders.filter((order) => order.status === "in_review").length;
    const quoted = quotes.length;

    return [
      { id: "orders", labelAr: "إجمالي الطلبات", value: totalOrders, hintAr: "الطلبات المسجلة" },
      { id: "new", labelAr: "جديدة", value: newOrders, hintAr: "تحتاج معالجة" },
      {
        id: "review",
        labelAr: "قيد المراجعة",
        value: inReviewOrders,
        hintAr: "في انتظار المراجعة",
      },
      { id: "quotes", labelAr: "عروض الأسعار", value: quoted, hintAr: "العروض الحالية" },
      { id: "customers", labelAr: "العملاء", value: customerCount, hintAr: "العملاء المسجلين" },
      { id: "products", labelAr: "المنتجات", value: productCount, hintAr: "المنتجات المتاحة" },
    ];
  }, [orders, quotes, productCount, customerCount]);

  const reviewItems = useMemo(
    () =>
      orders
        .filter((order) => order.status === "in_review")
        .slice(0, 4)
        .map((order) => {
          const customer = Array.isArray(order.customer)
            ? order.customer[0]
            : (order.customer ?? { name: "عميل", company: "" });
          return {
            id: order.id,
            titleAr: `طلبية ${order.reference}`,
            refAr: customer?.name ?? "عميل",
          };
        }),
    [orders],
  );

  const latestOrders = orders.slice(0, 4);

  return (
    <AppShell title="لوحة التحكم" subtitle="لوحة تحكم حقيقية مستندة إلى قاعدة البيانات">
      <div className="space-y-5">
        <Card className="overflow-hidden border-0 brand-gradient text-primary-foreground shadow-raised">
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-xs font-semibold text-accent">أهلاً بك في نظام سعّرها</p>
              <h2 className="mt-1 text-xl font-extrabold leading-snug">
                استلم طلبية الزبون وحوّلها إلى عرض سعر احترافي
              </h2>
            </div>
            <Link
              to="/new-order"
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-extrabold text-accent-foreground shadow-raised transition-transform active:scale-[0.98]"
            >
              <Upload className="h-5 w-5" />+ رفع طلبية
            </Link>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {metrics.map((s) => (
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
              {loading ? (
                <p className="text-sm text-muted-foreground">جارٍ تحميل الطلبات...</p>
              ) : latestOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد طلبات مسجلة.</p>
              ) : (
                latestOrders.map((order) => {
                  const customer = Array.isArray(order.customer)
                    ? order.customer[0]
                    : (order.customer ?? { name: "عميل", company: "" });
                  const itemCount = order.order_items?.length ?? 0;
                  return (
                    <div
                      key={order.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-muted/40 p-3"
                    >
                      <div className="min-w-0">
                        <p className="num truncate text-sm font-bold">{order.reference}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {customer?.name ?? "عميل"} · {order.source ?? "غير محدد"} · {itemCount}{" "}
                          صنف
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {statusLabel[order.status] ?? order.status}
                      </Badge>
                    </div>
                  );
                })
              )}
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
              {quotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد عروض أسعار مسجلة.</p>
              ) : (
                quotes.map((quote) => {
                  const customer = Array.isArray(quote.customers)
                    ? quote.customers[0]
                    : (quote.customers ?? { name: "عميل", company: "" });
                  return (
                    <div
                      key={quote.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-muted/40 p-3"
                    >
                      <div className="min-w-0">
                        <p className="num truncate text-sm font-bold">{quote.reference}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {customer?.name ?? "عميل"} · {Number(quote.total ?? 0).toFixed(3)} KWD
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {statusLabel[quote.status] ?? quote.status}
                      </Badge>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-accent" /> طلبات تحتاج مراجعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reviewItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد طلبات في حالة المراجعة حالياً.
              </p>
            ) : (
              reviewItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-accent-soft/60 p-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.titleAr}</p>
                    <p className="num text-xs text-muted-foreground">{item.refAr}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
