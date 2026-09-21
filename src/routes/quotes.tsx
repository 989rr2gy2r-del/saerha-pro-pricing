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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/quotes")({
  head: () => ({
    meta: [
      { title: "عروض الأسعار — سعّرها" },
      { name: "description", content: "إنشاء ومتابعة عروض أسعار شركة الأواب في سعّرها." },
      { property: "og:title", content: "عروض الأسعار — سعّرها" },
      { property: "og:description", content: "عروض أسعار مبنية على قاعدة الأسعار الفعلية." },
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
  tax_amount?: number;
  subtotal?: number;
  total?: number;
  currency?: string | null;
  status?: string | null;
  notes?: string | null;
  customers?: QuoteCustomer[] | null;
  quotation_items?: QuoteItem[];
};

const customerOf = (customers?: QuoteCustomer[] | null) =>
  customers?.[0] ?? { name: "عميل", company: "", phone: "" };

const money = (value: unknown) => Number(value ?? 0).toFixed(3);

function whatsappText(quote: Quote) {
  const customer = customerOf(quote.customers);
  const itemLines = (quote.quotation_items ?? []).map((item, index) =>
    `${index + 1}. ${item.product_name ?? ""} (${item.sku ?? ""}) — ${item.quantity ?? 0} ${item.unit ?? ""} × ${money(item.unit_price)} = ${money(item.line_total)} KWD`,
  );
  return [
    "شركة الأواب لتجارة الجملة والتجزئة",
    "عرض سعر — سعّرها",
    `رقم العرض: ${quote.reference}`,
    `العميل: ${customer.name ?? ""}${customer.company ? ` — ${customer.company}` : ""}`,
    `التاريخ: ${quote.issue_date ?? ""}`,
    `صالح حتى: ${quote.expiry_date ?? ""}`,
    "",
    ...itemLines,
    "",
    `المجموع قبل الخصم: ${money(quote.subtotal)} KWD`,
    `الخصم: ${money(quote.discount_amount)} KWD`,
    `الضريبة: ${money(quote.tax_amount)} KWD`,
    `الإجمالي: ${money(quote.total)} KWD`,
    quote.notes ? `ملاحظات: ${quote.notes}` : "",
  ].filter(Boolean).join("\n");
}

function downloadPdf(quote: Quote) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const customer = customerOf(quote.customers);
  const currency = quote.currency ?? "KWD";

  doc.setFontSize(18);
  doc.text("AL-AWAB FOR WHOLESALE & RETAIL TRADE CO.", 40, 50);
  doc.setFontSize(14);
  doc.text("QUOTATION / عرض سعر", 40, 76);
  doc.setFontSize(10);
  doc.text(`Reference: ${quote.reference}`, 40, 98);
  doc.text(`Customer: ${customer.name ?? ""} - ${customer.company ?? ""}`, 40, 114);
  doc.text(`Issue date: ${quote.issue_date ?? ""}`, 40, 130);
  doc.text(`Valid until: ${quote.expiry_date ?? ""}`, 40, 146);

  let y = 178;
  doc.setFontSize(9);
  doc.text("No.", 40, y);
  doc.text("Product", 70, y);
  doc.text("SKU", 285, y);
  doc.text("Qty", 370, y);
  doc.text("Unit price", 420, y);
  doc.text("Line total", 500, y);
  y += 18;

  for (const [index, item] of (quote.quotation_items ?? []).entries()) {
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
    doc.text(String(index + 1), 40, y);
    doc.text(String(item.product_name ?? "").slice(0, 34), 70, y);
    doc.text(String(item.sku ?? "").slice(0, 13), 285, y);
    doc.text(`${item.quantity ?? 0} ${item.unit ?? ""}`, 370, y);
    doc.text(money(item.unit_price), 420, y);
    doc.text(money(item.line_total), 500, y);
    y += 16;
  }

  y += 12;
  doc.text(`Subtotal: ${money(quote.subtotal)} ${currency}`, 40, y);
  y += 16;
  doc.text(`Discount: ${money(quote.discount_amount)} ${currency}`, 40, y);
  y += 16;
  doc.text(`Tax: ${money(quote.tax_amount)} ${currency}`, 40, y);
  y += 18;
  doc.setFontSize(12);
  doc.text(`TOTAL: ${money(quote.total)} ${currency}`, 40, y);
  if (quote.notes) {
    doc.setFontSize(9);
    doc.text(`Notes: ${String(quote.notes).slice(0, 100)}`, 40, y + 28);
  }
  doc.save(`${quote.reference}.pdf`);
}

function downloadExcel(quote: Quote) {
  const customer = customerOf(quote.customers);
  const rows = (quote.quotation_items ?? []).map((item, index) => ({
    "رقم": index + 1,
    "المنتج": item.product_name ?? "",
    "SKU": item.sku ?? "",
    "الكمية": item.quantity ?? 0,
    "الوحدة": item.unit ?? "",
    "سعر الوحدة": Number(item.unit_price ?? 0),
    "الخصم": Number(item.discount_amount ?? 0),
    "الإجمالي": Number(item.line_total ?? 0),
  }));

  const summary = [
    { "رقم": "", "المنتج": "المجموع قبل الخصم", "الإجمالي": Number(quote.subtotal ?? 0) },
    { "رقم": "", "المنتج": "الخصم", "الإجمالي": Number(quote.discount_amount ?? 0) },
    { "رقم": "", "المنتج": "الضريبة", "الإجمالي": Number(quote.tax_amount ?? 0) },
    { "رقم": "", "المنتج": "الإجمالي", "الإجمالي": Number(quote.total ?? 0) },
  ];

  const header = [{
    "رقم العرض": quote.reference,
    "العميل": customer.name ?? "",
    "الشركة": customer.company ?? "",
    "التاريخ": quote.issue_date ?? "",
    "صالح حتى": quote.expiry_date ?? "",
    "العملة": quote.currency ?? "KWD",
  }];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([...header, {}, ...rows, {}, ...summary]);
  XLSX.utils.book_append_sheet(workbook, sheet, "عرض السعر");
  XLSX.writeFile(workbook, `${quote.reference}.xlsx`);
}

async function shareWhatsApp(quote: Quote) {
  const text = whatsappText(quote);
  try {
    if (navigator.share) {
      await navigator.share({ title: `عرض ${quote.reference}`, text });
      return;
    }
  } catch {
    // Continue to WhatsApp URL when native sharing is cancelled/unavailable.
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

// CI verification for quote export flow.\nfunction Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadQuotes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotations")
      .select("id, reference, issue_date, expiry_date, price_type, discount_amount, tax_amount, subtotal, total, currency, status, notes, customers(name, company, phone), quotation_items(id, product_name, sku, quantity, unit, unit_price, discount_amount, line_total)")
      .order("issue_date", { ascending: false });

    if (!error) {
      setQuotes((data ?? []) as Quote[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadQuotes();
  }, []);

  const filteredQuotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return quotes;
    return quotes.filter((quote) => {
      const customer = customerOf(quote.customers);
      return [quote.reference, customer.name, customer.company]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [quotes, search]);

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
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">جارٍ تحميل العروض...</div>
        ) : filteredQuotes.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">لا توجد عروض مطابقة.</div>
        ) : null}

        <div className="space-y-3 lg:hidden">
          {filteredQuotes.map((quote) => (
            <Card key={quote.id} className="shadow-card" onClick={() => setOpen(quote)}>
              <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="num text-sm font-extrabold">{quote.reference}</p>
                  <p className="truncate text-sm">{customerOf(quote.customers).name}</p>
                  <p className="num text-xs text-muted-foreground">{quote.issue_date} — ينتهي {quote.expiry_date}</p>
                  <p className="num text-sm font-bold">{money(quote.total)} {quote.currency ?? "KWD"}</p>
                </div>
                <Badge variant="secondary">{quote.status}</Badge>
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
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التصدير</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="num font-bold">{quote.reference}</TableCell>
                    <TableCell>{customerOf(quote.customers).name}</TableCell>
                    <TableCell className="num">{quote.issue_date}</TableCell>
                    <TableCell className="num">{quote.expiry_date}</TableCell>
                    <TableCell>{quote.price_type}</TableCell>
                    <TableCell className="num">{money(quote.total)} {quote.currency ?? "KWD"}</TableCell>
                    <TableCell><Badge variant="secondary">{quote.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => downloadPdf(quote)}>PDF</Button>
                        <Button variant="ghost" size="sm" onClick={() => downloadExcel(quote)}>
                          <FileSpreadsheet className="ml-1 h-4 w-4" /> Excel
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void shareWhatsApp(quote)}>
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

      <Dialog open={!!open} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
          <DialogHeader>
            <DialogTitle className="num">{open?.reference}</DialogTitle>
            <DialogDescription>{customerOf(open?.customers).name}</DialogDescription>
          </DialogHeader>
          {open && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => downloadPdf(open)}>PDF</Button>
                <Button size="sm" variant="outline" onClick={() => downloadExcel(open)}>
                  <FileSpreadsheet className="ml-1 h-4 w-4" /> Excel
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void shareWhatsApp(open)}>
                  <MessageCircle className="ml-1 h-4 w-4" /> واتساب
                </Button>
              </div>
              {(open.quotation_items ?? []).map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-bold">{item.product_name}</p>
                  <p className="num text-xs text-accent">{item.sku}</p>
                  <dl className="num mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>الكمية: {item.quantity}</div>
                    <div>الوحدة: {item.unit}</div>
                    <div>سعر الوحدة: {money(item.unit_price)}</div>
                    <div>الخصم: {money(item.discount_amount)}</div>
                    <div>الإجمالي: {money(item.line_total)}</div>
                  </dl>
                </div>
              ))}
              <div className="rounded-lg bg-muted/60 p-3 text-xs">
                <p>المجموع قبل الخصم: {money(open.subtotal)} {open.currency ?? "KWD"}</p>
                <p>الخصم: {money(open.discount_amount)} {open.currency ?? "KWD"}</p>
                <p>الضريبة: {money(open.tax_amount)} {open.currency ?? "KWD"}</p>
                <p className="mt-1 font-extrabold">الإجمالي: {money(open.total)} {open.currency ?? "KWD"}</p>
              </div>
              {open.notes && <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{open.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
