import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type OrderItemRow = {
  id: string;
  raw_name?: string | null;
  matched_sku?: string | null;
  quantity?: number | null;
  unit?: string | null;
  line_total?: number | null;
};

type CustomerSummary = {
  name?: string | null;
  company?: string | null;
};

type OrderRow = {
  id: string;
  reference: string;
  status: string;
  source: string | null;
  received_at?: string | null;
  notes?: string | null;
  customer_id?: string | null;
  customers?: CustomerSummary | CustomerSummary[] | null;
  order_items?: OrderItemRow[] | null;
};

const orderStatusMap: Record<string, string> = {
  new: "جديدة",
  in_review: "قيد المراجعة",
  priced: "مسعّرة",
  closed: "مكتملة",
};

const sourceMap: Record<string, string> = {
  image: "صورة",
  pdf: "PDF",
  excel: "Excel",
  text: "نص",
  handwriting: "خط يد",
};

const formatDisplayDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-KW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "الطلبات — سعّرها" },
      { name: "description", content: "متابعة طلبات الزبائن ومصادرها وحالتها داخل نظام سعّرها." },
      { property: "og:title", content: "الطلبات — سعّرها" },
      { property: "og:description", content: "متابعة طلبات الزبائن وحالة تسعيرها." },
    ],
  }),
  component: () => (
    <ProtectedRoute>
      <Orders />
    </ProtectedRoute>
  ),
});

function Orders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from("orders")
        .select(
          "id, reference, status, source, received_at, notes, customer_id, customers(name, company), order_items(id, raw_name, matched_sku, quantity, unit, line_total)",
        )
        .order("received_at", { ascending: false });

      if (queryError) throw queryError;
      setOrders((data ?? []) as OrderRow[]);
    } catch (loadError) {
      console.error(loadError);
      setError("تعذر تحميل الطلبات من قاعدة البيانات.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const visibleOrders = useMemo(() => {
    const term = query.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      if (!matchesStatus) return false;

      if (!term) return true;

      const customer = Array.isArray(order.customers)
        ? order.customers[0]
        : (order.customers ?? { name: "", company: "" });
      const customerName = customer?.name ?? "";
      const customerCompany = customer?.company ?? "";
      const itemsText = (order.order_items ?? [])
        .map((item) => `${item.raw_name ?? ""} ${item.matched_sku ?? ""}`)
        .join(" ");

      return [order.reference, customerName, customerCompany, itemsText]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [orders, query, statusFilter]);

  return (
    <AppShell
      title="الطلبات"
      subtitle="جميع طلبيات الزبائن المستلمة من قاعدة البيانات الحقيقية"
      action={
        <Link
          to="/new-order"
          className="hidden min-h-12 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground shadow-raised lg:inline-flex"
        >
          <Plus className="h-4 w-4" /> رفع طلبية
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-12 pr-10"
            placeholder="ابحث برقم الطلبية أو اسم العميل أو المنتج"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { value: "all", label: "الكل" },
            { value: "new", label: "جديدة" },
            { value: "in_review", label: "قيد المراجعة" },
            { value: "priced", label: "مسعّرة" },
            { value: "closed", label: "مكتملة" },
          ].map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={statusFilter === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            جارٍ تحميل الطلبات...
          </div>
        ) : null}

        {!loading && visibleOrders.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            لا توجد طلبات تطابق المعايير الحالية.
          </div>
        ) : null}

        <div className="space-y-3 lg:hidden">
          {visibleOrders.map((order) => {
            const customer = Array.isArray(order.customers)
              ? order.customers[0]
              : (order.customers ?? { name: "عميل", company: "" });
            const itemCount = order.order_items?.length ?? 0;
            const total = (order.order_items ?? []).reduce(
              (sum, item) => sum + Number(item.line_total ?? 0),
              0,
            );

            return (
              <Card key={order.id} className="shadow-card">
                <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="num text-sm font-extrabold">{order.reference}</p>
                    <p className="truncate text-sm">{customer?.name ?? "عميل"}</p>
                    <p className="num text-xs text-muted-foreground">
                      {sourceMap[order.source ?? ""] ?? order.source ?? "غير محدّد"} · {itemCount}{" "}
                      صنف · {formatDisplayDate(order.received_at)}
                    </p>
                    {total > 0 && (
                      <p className="num text-xs text-accent">الإجمالي: {total.toFixed(3)} KWD</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="secondary" className="shrink-0">
                      {orderStatusMap[order.status] ?? order.status}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <Eye className="h-3.5 w-3.5" /> تفاصيل
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="hidden shadow-card lg:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الطلبية</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">المصدر</TableHead>
                  <TableHead className="text-right">عدد الأصناف</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">تفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOrders.map((order) => {
                  const customer = Array.isArray(order.customers)
                    ? order.customers[0]
                    : (order.customers ?? { name: "عميل", company: "" });
                  const itemCount = order.order_items?.length ?? 0;
                  const total = (order.order_items ?? []).reduce(
                    (sum, item) => sum + Number(item.line_total ?? 0),
                    0,
                  );

                  return (
                    <TableRow key={order.id}>
                      <TableCell className="num font-bold">{order.reference}</TableCell>
                      <TableCell>{customer?.name ?? "عميل"}</TableCell>
                      <TableCell>
                        {sourceMap[order.source ?? ""] ?? order.source ?? "غير محدّد"}
                      </TableCell>
                      <TableCell className="num">{itemCount}</TableCell>
                      <TableCell className="num">{formatDisplayDate(order.received_at)}</TableCell>
                      <TableCell className="num">
                        {total > 0 ? `${total.toFixed(3)} KWD` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {orderStatusMap[order.status] ?? order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                        >
                          عرض
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={(isOpen) => !isOpen && setSelectedOrder(null)}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
          <DialogHeader>
            <DialogTitle className="num">{selectedOrder?.reference}</DialogTitle>
            <DialogDescription>
              {selectedOrder && (
                <>
                  {(Array.isArray(selectedOrder.customers)
                    ? selectedOrder.customers[0]
                    : (selectedOrder.customers ?? { name: "عميل", company: "" })
                  )?.name ?? "عميل"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  المصدر:{" "}
                  {sourceMap[selectedOrder.source ?? ""] ?? selectedOrder.source ?? "غير محدّد"}
                </div>
                <div>الحالة: {orderStatusMap[selectedOrder.status] ?? selectedOrder.status}</div>
                <div>التاريخ: {formatDisplayDate(selectedOrder.received_at)}</div>
                <div>
                  الإجمالي:{" "}
                  {(
                    (selectedOrder.order_items ?? []).reduce(
                      (sum, item) => sum + Number(item.line_total ?? 0),
                      0,
                    ) || 0
                  ).toFixed(3)}{" "}
                  KWD
                </div>
              </div>

              <div className="space-y-2">
                {(selectedOrder.order_items ?? []).length > 0 ? (
                  selectedOrder.order_items?.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border p-3">
                      <p className="font-bold">{item.raw_name ?? "منتج غير محدد"}</p>
                      <p className="num text-xs text-accent">{item.matched_sku ?? "—"}</p>
                      <dl className="num mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>الكمية: {Number(item.quantity ?? 0)}</div>
                        <div>الوحدة: {item.unit ?? "—"}</div>
                        <div>الإجمالي: {Number(item.line_total ?? 0).toFixed(3)}</div>
                      </dl>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    لا توجد بنود مرفقة في هذه الطلبية.
                  </p>
                )}
              </div>

              {selectedOrder.notes && (
                <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  {selectedOrder.notes}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
