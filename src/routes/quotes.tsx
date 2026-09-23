import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, MessageCircle, Plus, Search, Trash2 } from "lucide-react";
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
import { deleteQuote } from "@/lib/db/saerha-data";
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

  const handleDeleteQuote = async (quote: Quote) => {
    if (!window.confirm(`هل تريد حذف عرض السعر "${quote.reference}" نهائيًا؟ سيتم حذف بنوده أيضًا.`)) return;
    try {
      setLoading(true);
      await deleteQuote(quote.id);
      setOpen(null);
      setQuotes((current) => current.filter((item) => item.id !== quote.id));
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : "تعذر حذف عرض السعر");
    } finally {
      setLoading(false);
    }
  };

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return quotes;
    return quotes.filter((quote) =>
      [quote.reference, getCustomerName(quote.customers), quote.price_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [quotes, search]);

  const downloadPdf = async (quote: Quote) => {
    try {
      const [fontResponse, headerResponse, footerResponse] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}fonts/NotoNaskhArabic-Regular.ttf`),
        fetch(`${import.meta.env.BASE_URL}invoice-header.png`),
        fetch(`${import.meta.env.BASE_URL}invoice-footer.png`),
      ]);

      if (!fontResponse.ok || !headerResponse.ok || !footerResponse.ok) {
        throw new Error("تعذر تحميل موارد الفاتورة الرسمية");
      }

      const toBase64 = async (response: Response) => {
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
      };

      const [fontBase64, headerBase64, footerBase64] = await Promise.all([
        toBase64(fontResponse),
        toBase64(headerResponse),
        toBase64(footerResponse),
      ]);

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const BLUE = "#104F82";
      const ORANGE = "#FF7F50";
      const GRID = "#D2D6DA";
      const TEXT = "#17324D";
      const LIGHT = "#F5F8FA";

      doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", fontBase64);
      doc.addFont("NotoNaskhArabic-Regular.ttf", "NotoNaskhArabic", "normal");
      doc.setFont("NotoNaskhArabic", "normal");
      doc.setLanguage("ar-KW");
      doc.setR2L(false);

      const processArabic = (value: string) => {
        const api = doc as jsPDF & {
          processArabic?: (text: string) => string;
        };
        return typeof api.processArabic === "function" ? api.processArabic(value) : value;
      };

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 36;
      const right = pageWidth - margin;
      const customer = getCustomerList(quote.customers)[0] ?? {};
      const currency = "KWD";
      const subtotal = Number(quote.quotation_items?.reduce(
        (sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0),
        0,
      ) ?? 0);
      const discount = Number(quote.discount_amount ?? 0);
      const tax = 0;
      const total = Number(quote.total ?? subtotal - discount + tax);

      const drawText = (
        value: string,
        x: number,
        y: number,
        size = 9,
        align: "left" | "center" | "right" = "right",
      ) => {
        doc.setFont("NotoNaskhArabic", "normal");
        doc.setFontSize(size);
        doc.setTextColor(TEXT);
        doc.text(processArabic(value), x, y, { align });
      };

      const drawCell = (
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        value: string,
      ) => {
        doc.setFillColor("#FFFFFF");
        doc.setDrawColor(GRID);
        doc.rect(x, y, width, height, "FD");
        doc.setFillColor(BLUE);
        doc.rect(x + width - 72, y, 72, height, "F");
        drawText(label, x + width - 36, y + 15, 8.5, "center");
        doc.setTextColor("#FFFFFF");
        doc.setFont("NotoNaskhArabic", "normal");
        doc.setFontSize(8.5);
        doc.text(processArabic(label), x + width - 36, y + 15, { align: "center" });
        drawText(value, x + width - 82, y + 15, 8.5, "right");
      };

      const drawCode39 = (raw: string, x: number, y: number, width: number, height: number) => {
        const patterns: Record<string, string> = {
          "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw",
          "5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
          "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn",
          "F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
          "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn",
          "P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
          "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwwnwnnnn","Y":"wwnnwnnnn",
          "Z":"nwwwnnnnn","-":"nwwnnnnnw"," ":"nwwnwnwnn"
        };
        const normalized = raw.toUpperCase().replace(/[^0-9A-Z\- ]/g, "");
        const text = `*${normalized}*`;
        const units = [...text].map((ch) => patterns[ch] ?? patterns["-"]);
        const narrow = 1;
        const wide = 2.6;
        const gap = narrow;
        const totalUnits = units.reduce((sum, pattern) =>
          sum + [...pattern].reduce((p, c) => p + (c === "w" ? wide : narrow), 0) + gap, 0);
        const scale = Math.min(1.6, width / totalUnits);
        let cursor = x;
        doc.setFillColor("#111111");
        for (const pattern of units) {
          for (let i = 0; i < pattern.length; i++) {
            const barWidth = (pattern[i] === "w" ? wide : narrow) * scale;
            if (i % 2 === 0) doc.rect(cursor, y, barWidth, height, "F");
            cursor += barWidth;
          }
          cursor += gap * scale;
        }
        drawText(normalized, x + width / 2, y + height + 12, 7.5, "center");
      };

      const contentWidth = pageWidth - margin * 2;
      const headerHeight = contentWidth * (180 / 830);
      const footerHeight = contentWidth * (164 / 830);
      const footerY = pageHeight - footerHeight;

      const drawHeader = () => {
        // Official company header image: source of truth, preserved without crop or distortion.
        doc.addImage(`data:image/png;base64,${headerBase64}`, "PNG", margin, 0, contentWidth, headerHeight);
      };

      const drawFooter = () => {
        // Official company footer image: source of truth, preserved without crop or distortion.
        doc.addImage(`data:image/png;base64,${footerBase64}`, "PNG", margin, footerY, contentWidth, footerHeight);
      };
      const drawInfo = () => {
        const top = 132;
        const row = 25;
        const leftW = 255;
        const rightW = pageWidth - margin * 2 - leftW - 10;
        const leftX = margin;
        const rightX = leftX + leftW + 10;

        // Quote information.
        const info = [
          ["رقم العرض", quote.reference],
          ["التاريخ", quote.issue_date ?? ""],
          ["تاريخ الانتهاء", quote.expiry_date ?? ""],
          ["نوع السعر", quote.price_type ?? "retail"],
        ];
        info.forEach(([label, value], i) => {
          const y = top + i * row;
          doc.setDrawColor(GRID);
          doc.setFillColor("#FFFFFF");
          doc.rect(leftX, y, leftW, row, "FD");
          doc.setFillColor(BLUE);
          doc.rect(leftX + leftW - 82, y, 82, row, "F");
          doc.setFont("NotoNaskhArabic", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor("#FFFFFF");
          doc.text(processArabic(label), leftX + leftW - 41, y + 16, { align: "center" });
          drawText(String(value), leftX + leftW - 94, y + 16, 8.5, "right");
        });

        // Customer information.
        const customerRows = [
          ["اسم العميل", customer.name ?? "عميل"],
          ["الشركة", customer.company ?? ""],
          ["الهاتف", customer.phone ?? ""],
          ["العملة", currency],
        ];
        customerRows.forEach(([label, value], i) => {
          const y = top + i * row;
          doc.setDrawColor(GRID);
          doc.setFillColor("#FFFFFF");
          doc.rect(rightX, y, rightW, row, "FD");
          doc.setFillColor(BLUE);
          doc.rect(rightX, y, 78, row, "F");
          doc.setFont("NotoNaskhArabic", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor("#FFFFFF");
          doc.text(processArabic(label), rightX + 39, y + 16, { align: "center" });
          drawText(String(value), rightX + rightW - 10, y + 16, 8.5, "right");
        });
      };

      const drawTableHeader = (y: number) => {
        const x = margin;
        const widths = [65, 50, 65, 55, 45, 195, 60];
        const headers = [
          ["الإجمالي", "TOTAL"],
          ["الخصم", "DISC."],
          ["السعر", "PRICE"],
          ["الوحدة", "UNIT"],
          ["الكمية", "QTY."],
          ["الصنف", "DESCRIPTION"],
          ["الكود", "CODE"],
        ];
        let cursor = x;
        doc.setFillColor(BLUE);
        doc.rect(x, y, widths.reduce((a, b) => a + b, 0), 32, "F");
        headers.forEach(([ar, en], index) => {
          const w = widths[index];
          doc.setFont("NotoNaskhArabic", "normal");
          doc.setTextColor("#FFFFFF");
          doc.setFontSize(7.8);
          doc.text(processArabic(ar), cursor + w / 2, y + 12, { align: "center" });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.text(en, cursor + w / 2, y + 24, { align: "center" });
          cursor += w;
        });
        return y + 32;
      };

      const drawTableRow = (y: number, item: QuoteItem, index: number) => {
        const widths = [65, 50, 65, 55, 45, 195, 60];
        const values = [
          Number(item.line_total ?? 0).toFixed(3),
          Number(item.discount_amount ?? 0).toFixed(3),
          Number(item.unit_price ?? 0).toFixed(3),
          String(item.unit ?? ""),
          String(item.quantity ?? 0),
          String(item.product_name ?? ""),
          String(item.sku ?? ""),
        ];
        const rowHeight = 26;
        let cursor = margin;
        doc.setDrawColor(GRID);
        doc.setFillColor(index % 2 === 0 ? "#FFFFFF" : LIGHT);
        doc.rect(margin, y, widths.reduce((a, b) => a + b, 0), rowHeight, "FD");
        values.forEach((value, i) => {
          const w = widths[i];
          if (i === 5) {
            drawText(value, cursor + w - 8, y + 17, 7.8, "right");
          } else {
            drawText(value, cursor + w / 2, y + 17, 7.5, "center");
          }
          cursor += w;
        });
        return y + rowHeight;
      };

      const drawTotals = (y: number) => {
        const boxW = 190;
        const rowH = 23;
        const boxX = margin;

        const totalRows = [
          ["الإجمالي قبل الخصم", subtotal],
          ["الخصم", discount],
          ["الضريبة", tax],
        ];

        totalRows.forEach(([label, value], index) => {
          const yy = y + index * rowH;
          doc.setFillColor(BLUE);
          doc.rect(boxX, yy, boxW, rowH, "F");
          doc.setFont("NotoNaskhArabic", "normal");
          doc.setFontSize(8);
          doc.setTextColor("#FFFFFF");
          doc.text(processArabic(String(label)), boxX + boxW - 8, yy + 15, { align: "right" });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.text(Number(value).toFixed(3), boxX + 8, yy + 15);
        });

        const netY = y + totalRows.length * rowH;
        doc.setFillColor(ORANGE);
        doc.rect(boxX, netY, boxW, 28, "F");
        doc.setFont("NotoNaskhArabic", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor("#FFFFFF");
        doc.text(processArabic("الصافي"), boxX + boxW - 8, netY + 18, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(total.toFixed(3), boxX + 8, netY + 18);

        drawCode39(quote.reference, pageWidth - margin - 170, y + 8, 170, 42);
        drawText("المبلغ الإجمالي شامل الخصم والضريبة", pageWidth - margin - 85, y + 77, 7.5, "center");
        drawText("تم إنشاء الفاتورة من الطلبية بعد مراجعة المنتج وسعره", pageWidth - margin - 85, y + 94, 7.5, "center");
      };
      let page = 1;
      let y = 242;
      drawHeader();
      drawInfo();
      y = drawTableHeader(y);
      const items = quote.quotation_items ?? [];

      items.forEach((item, index) => {
        if (y + 26 > footerY - 10) {
          drawFooter();
          doc.addPage();
          page += 1;
          drawHeader();
          y = 132;
          y = drawTableHeader(y);
        }
        y = drawTableRow(y, item, index);
      });

      if (y + 145 > footerY - 10) {
        drawFooter();
        doc.addPage();
        page += 1;
        drawHeader();
        y = 132;
        y = drawTableHeader(y);
      }

      drawTotals(y + 14);
      drawFooter();

      doc.save(`${quote.reference}.pdf`);
    } catch (error) {
      console.error("PDF export failed", error);
      window.alert("تعذر إنشاء ملف PDF. حاول مرة أخرى.");
    }
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
                        <Button variant="ghost" size="sm" onClick={() => void downloadPdf(q)}>PDF</Button>
                        <Button variant="ghost" size="sm" onClick={() => downloadExcel(q)}>
                          <FileSpreadsheet className="ml-1 h-4 w-4" /> Excel
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void openWhatsApp(q)}>
                          <MessageCircle className="ml-1 h-4 w-4" /> واتساب
                         </Button>
                         <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void handleDeleteQuote(q)}>
                           <Trash2 className="ml-1 h-4 w-4" /> حذف
                         </Button>
                         <Button variant="ghost" size="sm" onClick={() => void openWhatsApp(q)}>
                           <MessageCircle className="ml-1 h-4 w-4" /> واتساب
                        </Button>
                 <Button size="sm" variant="destructive" onClick={() => void handleDeleteQuote(open)} disabled={loading}>
                   <Trash2 className="ml-1 h-4 w-4" /> حذف العرض
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
                <Button size="sm" onClick={() => void downloadPdf(open)}>PDF</Button>
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
