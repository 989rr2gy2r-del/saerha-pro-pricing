import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useState } from "react";

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
import { priceTypeLabel, quotes, type Quote } from "@/lib/mock-data";

export const Route = createFileRoute("/quotes")({
  head: () => ({
    meta: [
      { title: "عروض الأسعار — سعّرها" },
      {
        name: "description",
        content: "إنشاء ومتابعة عروض أسعار شركة الأواب في سعّرها: البنود، الخصم، الضريبة، الحالة.",
      },
      { property: "og:title", content: "عروض الأسعار — سعّرها" },
      { property: "og:description", content: "عروض أسعار احترافية مبنية على أنواع أسعار مرنة." },
    ],
  }),
  component: Quotes,
});

function Quotes() {
  const [open, setOpen] = useState<Quote | null>(null);

  return (
    <AppShell
      title="عروض الأسعار"
      subtitle="جميع عروض الأسعار — بيانات تجريبية بدون أسعار حقيقية"
      action={
        <Button className="h-12 shrink-0 gap-2 font-extrabold">
          <Plus className="h-4 w-4" /> عرض سعر جديد
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-12 pr-10" placeholder="ابحث برقم العرض أو اسم العميل" />
        </div>

        <div className="space-y-3 lg:hidden">
          {quotes.map((q) => (
            <Card key={q.id} className="shadow-card" onClick={() => setOpen(q)}>
              <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="num text-sm font-extrabold">{q.ref}</p>
                  <p className="truncate text-sm">{q.customer}</p>
                  <p className="num text-xs text-muted-foreground">
                    {q.date} — ينتهي {q.expiry}
                  </p>
                  <p className="text-xs text-accent">{priceTypeLabel(q.priceType)}</p>
                </div>
                <Badge variant="secondary" className="shrink-0">{q.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="hidden shadow-card lg:block">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم العرض</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                  <TableHead className="text-right">نوع السعر</TableHead>
                  <TableHead className="text-right">الخصم</TableHead>
                  <TableHead className="text-right">الضريبة</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">البنود</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="num font-bold">{q.ref}</TableCell>
                    <TableCell>{q.customer}</TableCell>
                    <TableCell className="num">{q.date}</TableCell>
                    <TableCell className="num">{q.expiry}</TableCell>
                    <TableCell>{priceTypeLabel(q.priceType)}</TableCell>
                    <TableCell className="num">{q.discount}</TableCell>
                    <TableCell className="num">{q.tax}</TableCell>
                    <TableCell className="num">{q.total}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{q.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setOpen(q)}>
                        عرض
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
          <DialogHeader>
            <DialogTitle className="num">{open?.ref}</DialogTitle>
            <DialogDescription>
              {open?.customer} · {open && priceTypeLabel(open.priceType)}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <div className="space-y-3">
              {open.items.map((it) => (
                <div key={it.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-bold">{it.productName}</p>
                  <p className="num text-xs text-accent">{it.sku}</p>
                  <dl className="num mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>الكمية: {it.qty}</div>
                    <div>الوحدة: {it.unit}</div>
                    <div>سعر الوحدة: {it.unitPrice}</div>
                    <div>الخصم: {it.discount}</div>
                    <div>الإجمالي: {it.total}</div>
                  </dl>
                </div>
              ))}
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{open.notes}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
