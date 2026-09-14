import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orders } from "@/lib/mock-data";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "الطلبات — سعّرها" },
      { name: "description", content: "متابعة طلبات الزبائن ومصادرها وحالتها داخل نظام سعّرها." },
      { property: "og:title", content: "الطلبات — سعّرها" },
      { property: "og:description", content: "متابعة طلبات الزبائن وحالة تسعيرها." },
    ],
  }),
  component: Orders,
});

function Orders() {
  return (
    <AppShell
      title="الطلبات"
      subtitle="جميع طلبيات الزبائن المستلمة — بيانات تجريبية"
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
          <Input className="h-12 pr-10" placeholder="ابحث برقم الطلبية أو اسم العميل" />
        </div>

        {/* بطاقات على الهاتف */}
        <div className="space-y-3 lg:hidden">
          {orders.map((o) => (
            <Card key={o.id} className="shadow-card">
              <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="num text-sm font-extrabold">{o.ref}</p>
                  <p className="truncate text-sm">{o.customer}</p>
                  <p className="num text-xs text-muted-foreground">
                    {o.source} · {o.itemsCount} صنف · {o.date}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">{o.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* جدول على الشاشات الكبيرة */}
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
                  <TableHead className="text-right">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="num font-bold">{o.ref}</TableCell>
                    <TableCell>{o.customer}</TableCell>
                    <TableCell>{o.source}</TableCell>
                    <TableCell className="num">{o.itemsCount}</TableCell>
                    <TableCell className="num">{o.date}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{o.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
