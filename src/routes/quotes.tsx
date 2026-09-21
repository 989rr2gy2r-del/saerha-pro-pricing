import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, MessageCircle, Plus, Search } from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
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
  component: () => (
    <ProtectedRoute>
      <Quotes />
    </ProtectedRoute>
  ),
});

type QuoteItem = {
  id?: string;
  product_name?: string;
  sku?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  discount_amount?: number;
  line_total?: number;
};

type QuoteCustomer = { name?: string; company?: string; phone?: string };

type Quote = {
  id: string;
  reference: string;
  issue_date?: string | null;
  expiry_date?: string | null;
  price_type?: string;
  discount_amount?: number;
  total?: number;
  status?: string | null;
  notes?: string | null;
  customers?: QuoteCustomer[] | null;
  quotation_items?: QuoteItem[];
};

const getCustomerList = (customers?: QuoteCustomer[] | null) => customers ?? [];

const getCustomerName = (customers?: QuoteCustomer[] | null) =>
  getCustomerList(customers)[0]?.name ?? "عميل";

function Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadQuotes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotations")
      .select(
        "id, reference, issue_date, expiry_date, price_type, discount_amount, tax_amount, subtotal, total, currency, status, notes, customers(name, company, phone), quotation_items(id, product_name, sku, quantity, unit, unit_price, discount_amount, line_total)",
      )
      .order("issue_date", { ascending: false });
    if (!error) setQuotes((data ?? []) as Quote[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadQuotes();
  }, []);

  const downloadPdf = (quote: Quote) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const customer = getCustomerList(quote.customers)[0] ?? { name: "عميل", company: "" };
    doc.setFontSize(18);
    doc.text("عرض سعر", 40, 50);
    doc.setFontSize(10);
    doc.text(`رقم العرض: ${quote.reference}`, 40, 75);
    doc.text(`العميل: ${customer.name ?? ""} - ${customer.company ?? ""}`, 40, 95);
    doc.text(`التاريخ: ${quote.issue_date}`, 40, 115);
    doc.text(`تاريخ الانتهاء: ${quote.expiry_date ?? ""}`, 40, 135);
    doc.text(`العملة: KWD`, 40, 155);
    let y = 190;
    quote.quotation_items?.forEach((item: QuoteItem, idx: number) => {
      doc.text(`${idx + 1}. ${item.product_name}`, 40, y);
      doc.text(`${item.quantity} ${item.unit ?? "حبة"}`, 250, y);
      doc.text(`${Number(item.unit_price ?? 0).toFixed(3)}`, 330, y);
      doc.text(`${Number(item.discount_amount ?? 0).toFixed(3)}`, 410, y);
      doc.text(`${Number(item.line_total ?? 0).toFixed(3)}`, 500, y);
      y += 18;
    });
    doc.save(`${quote.reference}.pdf`);
  };

  return (
    <AppShell
      title="عروض الأسعار"
      subtitle="عروض أسعار حقيقية من Supabase"
      action={
        <Button className="h-12 shrink-0 gap-2 font-extrabold">
          <Plus className="h-4 w-4" /> عرض سعر جديد
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-12 pr-10"
            placeholder="ابحث برقم العرض أو اسم العميل"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            جارٍ تحميل العروض...
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            لا توجد بيانات بعد.
          </div>
        ) : null}

        <div className="space-y-3 lg:hidden">
          {filteredQuotes.map((q) => (
            <Card key={q.id} className="shadow-card" onClick={() => setOpen(q)}>
              <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="num text-sm font-extrabold">{q.reference}</p>
                  <p className="truncate text-sm">{getCustomerName(q.customers)}</p>
                  <p className="num text-xs text-muted-foreground">
                    {q.issue_date} — ينتهي {q.expiry_date}
                  </p>
                  <p className="text-xs text-accent">{q.price_type}</p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {q.status}
                </Badge>
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
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التصدير</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="num font-bold">{q.reference}</TableCell>
                    <TableCell>{getCustomerName(q.customers)}</TableCell>
                    <TableCell className="num">{q.issue_date}</TableCell>
                    <TableCell className="num">{q.expiry_date}</TableCell>
                    <TableCell>{q.price_type}</TableCell>
                    <TableCell className="num">
                      {Number(q.discount_amount ?? 0).toFixed(3)}
                    </TableCell>
                    <TableCell className="num">{Number(q.total ?? 0).toFixed(3)} KWD</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{q.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => downloadPdf(q)}>PDF</Button>
                        <Button variant="ghost" size="sm" onClick={() => downloadExcel(q)}>
                          <FileSpreadsheet className="ml-1 h-4 w-4" /> Excel
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void openWhatsApp(q)}>
                          <MessageCircle className="ml-1 h-4 w-4" /> واتساب
                        </Button>
                      </div>
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
            <DialogTitle className="num">{open?.reference}</DialogTitle>
            <DialogDescription>{getCustomerName(open?.customers)}</DialogDescription>
          </DialogHeader>
          {open && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => downloadPdf(open)}>PDF</Button>
                <Button size="sm" variant="outline" onClick={() => downloadExcel(open)}>
                  <FileSpreadsheet className="ml-1 h-4 w-4" /> Excel
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void openWhatsApp(open)}>
                  <MessageCircle className="ml-1 h-4 w-4" /> واتساب
                </Button>
              </div>
              {open.quotation_items?.map((it: QuoteItem) => (
                <div key={it.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-bold">{it.product_name}</p>
                  <p className="num text-xs text-accent">{it.sku}</p>
                  <dl className="num mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>الكمية: {it.quantity}</div>
                    <div>الوحدة: {it.unit}</div>
                    <div>سعر الوحدة: {Number(it.unit_price ?? 0).toFixed(3)}</div>
                    <div>الخصم: {Number(it.discount_amount ?? 0).toFixed(3)}</div>
                    <div>الإجمالي: {Number(it.line_total ?? 0).toFixed(3)}</div>
                  </dl>
                </div>
              ))}
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                {open.notes}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
