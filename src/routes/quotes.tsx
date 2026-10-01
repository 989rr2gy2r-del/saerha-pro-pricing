import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, FolderOpen, MessageCircle, Plus, Search, Trash2 } from "lucide-react";
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

type QuoteCustomer = { name?: string; company?: string; phone?: string; address?: string };

type QuoteCustomerValue = QuoteCustomer | QuoteCustomer[] | null | undefined;

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
  customers?: QuoteCustomer[] | QuoteCustomer | null;
  quotation_items?: QuoteItem[];
};

const getCustomerList = (customers?: QuoteCustomerValue) => {
  if (Array.isArray(customers)) return customers;
  return customers ? [customers] : [];
};

const getCustomerName = (customers?: QuoteCustomerValue) =>
  getCustomerList(customers)[0]?.name?.trim() || "عميل";

function Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [open, setOpen] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);

  const openQuoteForEditing = (quote: Quote) => {
    window.location.assign(
      `${import.meta.env.BASE_URL}new-order?editQuote=${encodeURIComponent(quote.id)}`,
    );
  };

  const loadQuotes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotations")
      .select(
        "id, reference, issue_date, expiry_date, price_type, discount_amount, tax_amount, subtotal, total, currency, status, notes, customers(name, company, phone), quotation_items(id, product_name, sku, quantity, unit, unit_price, discount_amount, line_total)",
      )
      .order("issue_date", { ascending: false });
    if (!error) setQuotes((data ?? []) as unknown as Quote[]);
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
      setSelectedQuoteIds((current) => current.filter((id) => id !== quote.id));
      setQuotes((current) => current.filter((item) => item.id !== quote.id));
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : "تعذر حذف عرض السعر");
    } finally {
      setLoading(false);
    }
  };

  const toggleQuoteSelection = (quoteId: string) => {
    setSelectedQuoteIds((current) =>
      current.includes(quoteId)
        ? current.filter((id) => id !== quoteId)
        : [...current, quoteId],
    );
  };

  const selectAllQuotes = () => {
    setSelectedQuoteIds(filteredQuotes.map((quote) => quote.id));
  };

  const clearQuoteSelection = () => {
    setSelectedQuoteIds([]);
  };

  const handleDeleteSelectedQuotes = async () => {
    const selectedQuotes = quotes.filter((quote) => selectedQuoteIds.includes(quote.id));
    if (selectedQuotes.length === 0) return;

    if (!window.confirm(`هل تريد حذف ${selectedQuotes.length} عروض أسعار محددة نهائيًا؟ سيتم حذف بنودها أيضًا.`)) {
      return;
    }

    try {
      setLoading(true);
      for (const quote of selectedQuotes) {
        await deleteQuote(quote.id);
      }
      setOpen(null);
      setSelectedQuoteIds([]);
      setQuotes((current) =>
        current.filter((quote) => !selectedQuoteIds.includes(quote.id)),
      );
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : "تعذر حذف العروض المحددة");
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

  const downloadExcel = (quote: Quote) => {
    const rows = (quote.quotation_items ?? []).map((item) => ({ SKU: item.sku ?? "", Product: item.product_name ?? "", Quantity: item.quantity ?? 0, Unit: item.unit ?? "", UnitPrice: item.unit_price ?? 0, Discount: item.discount_amount ?? 0, Total: item.line_total ?? 0 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Quotation");
    XLSX.writeFile(workbook, `${quote.reference}.xlsx`);
  };

  const openWhatsApp = async (quote: Quote) => {
    const phone = getCustomerList(quote.customers)[0]?.phone?.replace(/\D/g, "");
    const message = `عرض سعر ${quote.reference} بإجمالي ${Number(quote.total ?? 0).toFixed(3)} KWD`;

    try {
      const pdfBlob = await createPdfBlob(quote);
      const file = new File([pdfBlob], `${quote.reference}.pdf`, { type: "application/pdf" });
      const shareData = { files: [file], title: `عرض سعر ${quote.reference}`, text: message };
      const canShareFiles =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share(shareData);
        return;
      }

      // Browsers that do not support sharing files cannot attach a PDF directly
      // to WhatsApp. Keep the PDF available as a download and open the chat with
      // the quote text pre-filled.
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = pdfUrl;
      anchor.download = `${quote.reference}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);

      const url = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("WhatsApp PDF share failed", error);
      window.alert("تعذر تجهيز ملف PDF للإرسال عبر واتساب. حاول مرة أخرى.");
    }
  };

  const createPdfBlob = async (quote: Quote) => {
    try {
      const [headerResponse, footerResponse, logoResponse, boldFontResponse, regularFontResponse, fallbackFontResponse] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}invoice-header.png`),
        fetch(`${import.meta.env.BASE_URL}invoice-footer.png`),
        fetch(`${import.meta.env.BASE_URL}al-awab-logo.jpg`),
        fetch("https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansArabic/NotoSansArabic-Bold.ttf").catch(() => null),
        fetch("https://raw.githubusercontent.com/hotosm/HDM-CartoCSS/master/fonts/NotoSansArabic-Regular.ttf").catch(() => null),
        fetch(import.meta.env.BASE_URL + "fonts/NotoNaskhArabic-Regular.ttf").catch(() => null),
      ]);

      if (!headerResponse.ok || !footerResponse.ok || !logoResponse.ok || (!regularFontResponse?.ok && !fallbackFontResponse?.ok)) {
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

      const [headerBase64, footerBase64, logoBase64, regularBase64] = await Promise.all([
        toBase64(headerResponse),
        toBase64(footerResponse),
        toBase64(logoResponse),
        regularFontResponse?.ok ? toBase64(regularFontResponse) : toBase64(fallbackFontResponse as Response),
      ]);
      const boldBase64 = boldFontResponse?.ok ? await toBase64(boldFontResponse as Response) : regularBase64;
      const arabicFontFile = "NotoSansArabic-Regular.ttf";
      const arabicFontName = "ArabicInvoice";
      const arabicBoldFontFile = "NotoSansArabic-Bold.ttf";
      const arabicBoldFontName = "ArabicInvoiceBold";

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const BLUE = "#104F82";
      const ORANGE = "#FF7F50";
      const GRID = "#D2D6DA";
      const TEXT = "#17324D";
      const LIGHT = "#F5F8FA";

      doc.addFileToVFS(arabicFontFile, regularBase64);
      doc.addFont(arabicFontFile, arabicFontName, "normal");
      doc.addFileToVFS(arabicBoldFontFile, boldBase64);
      doc.addFont(arabicBoldFontFile, arabicBoldFontName, "normal");
      doc.setFont(arabicFontName, "normal");
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
        bold = false,
      ) => {
        doc.setFont(bold ? arabicBoldFontName : arabicFontName, "normal");
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
        doc.setFont(arabicFontName, "normal");
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

      const footerHeight = contentWidth * (103 / 1055);
      const footerY = pageHeight - 12 - footerHeight;

      const createWatermark = async () => {
        const image = document.createElement("img");
        image.src = `data:image/jpeg;base64,${logoBase64}`;
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("تعذر تحميل شعار العلامة المائية"));
        });
        const canvas = document.createElement("canvas");
        const crop = Math.round(Math.min(image.width, image.height) * 0.10);
        canvas.width = Math.max(1, image.width - crop * 2);
        canvas.height = Math.max(1, image.height - crop * 2);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("تعذر تجهيز العلامة المائية");
        context.drawImage(
          image,
          crop,
          crop,
          image.width - crop * 2,
          image.height - crop * 2,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        return canvas.toDataURL("image/png");
      };

      const drawHeader = async () => {
        // Official header image from the approved invoice design.
        const headerHeight = contentWidth * (244 / 1055);
        doc.addImage(`data:image/png;base64,${headerBase64}`, "PNG", margin, 4, contentWidth, headerHeight);

        // Official logo watermark: kept behind the live invoice data.
        const watermark = await createWatermark();
        doc.saveGraphicsState();
        doc.setGState(doc.GState({ opacity: 0.10 }));
        doc.addImage(watermark, "PNG", 92.5, 279, 410, 338);
        doc.restoreGraphicsState();
      };

      const drawFooter = () => {
        // Official footer image from the approved invoice design.
        doc.addImage(`data:image/png;base64,${footerBase64}`, "PNG", margin, footerY, contentWidth, footerHeight);
      };

      const drawInfo = () => {
        // Exact geometry measured from the supplied official invoice PDF (A4: 595 x 842 pt).
        // The first information row starts directly below the official blue header band.
        const top = 132;
        const row = 29;
        const leftX = margin;
        const leftW = 180;
        const gap = 24;
        const rightX = leftX + leftW + gap;
        const rightW = contentWidth - leftW - gap;

        const drawLabelCell = (x: number, y: number, width: number, label: string) => {
          doc.setDrawColor(GRID);
          doc.setLineWidth(0.55);
          doc.setFillColor("#F1F5F7");
          doc.rect(x + width - 72, y, 72, row, "FD");
          doc.setFont(arabicBoldFontName, "normal");
          doc.setFontSize(9.2);
          doc.setTextColor(TEXT);
          doc.text(processArabic(label), x + width - 36, y + 19, { align: "center" });
        };

        const leftRows = [
          ["رقم الفاتورة", quote.reference],
          ["التاريخ والوقت", formatInvoiceDate(quote.issue_date)],
          ["المستخدم", ""],
          ["إجمالي الفاتورة", Number(quote.total ?? 0).toFixed(3)],
        ];

        leftRows.forEach(([label, value], i) => {
          const y = top + i * row;
          doc.setDrawColor(GRID);
          doc.setLineWidth(0.55);
          doc.setFillColor("#FFFFFF");
          doc.rect(leftX, y, leftW, row, "FD");
          drawLabelCell(leftX, y, leftW, label);
          doc.setFont(i === 0 ? "helvetica" : arabicBoldFontName, "normal");
          doc.setFontSize(9.2);
          doc.setTextColor(TEXT);
          const centeredValue = i === 0 || i === 1 || i === 3;
          const valueX = centeredValue ? leftX + (leftW - 72) / 2 : leftX + 8;
          const actualValue =
            i === 0
              ? String(quote.reference ?? "")
              : i === 1
                ? formatInvoiceDate(quote.issue_date) || String(quote.issue_date ?? "")
                : String(value);
          doc.text(actualValue, valueX, y + 19, { align: centeredValue ? "center" : "left" });
        });

        const customerRows = [
          ["اسم العميل", customer.name ?? "عميل"],
          ["التلفون", customer.phone ?? ""],
          ["العنوان", customer.address ?? ""],
        ];

        customerRows.forEach(([label, value], i) => {
          const y = top + i * row;
          doc.setDrawColor(GRID);
          doc.setLineWidth(0.55);
          doc.setFillColor("#FFFFFF");
          doc.rect(rightX, y, rightW, row, "FD");
          drawLabelCell(rightX, y, rightW, label);
          drawText(String(value), rightX + rightW - 82, y + 19, 9.2, "right", true);
        });

        // The last official row contains the transaction term plus the currency cell.
        const lastY = top + 3 * row;
        doc.setDrawColor(GRID);
        doc.setLineWidth(0.55);
        doc.setFillColor("#FFFFFF");
        doc.rect(rightX, lastY, rightW, row, "FD");

        const termLabelW = 72;
        const termValueW = 112;
        const currencyLabelW = 58;
        const currencyValueW = rightW - termLabelW - termValueW - currencyLabelW;

        const termLabelX = rightX + rightW - termLabelW;
        const termValueX = termLabelX - termValueW;
        const currencyLabelX = termValueX - currencyLabelW;
        const currencyValueX = rightX;

        doc.setFillColor("#F1F5F7");
        doc.rect(termLabelX, lastY, termLabelW, row, "F");
        doc.rect(currencyLabelX, lastY, currencyLabelW, row, "F");

        doc.setDrawColor(GRID);
        doc.setLineWidth(0.55);
        doc.line(termValueX, lastY, termValueX, lastY + row);
        doc.line(currencyLabelX, lastY, currencyLabelX, lastY + row);

        doc.setFont(arabicBoldFontName, "normal");
        doc.setFontSize(8.2);
        doc.setTextColor(TEXT);
        doc.text(processArabic("التعامل"), termLabelX + termLabelW / 2, lastY + 19, { align: "center" });
        doc.text(processArabic("العملة"), currencyLabelX + currencyLabelW / 2, lastY + 19, { align: "center" });

        drawText("نقدا", termValueX + termValueW - 8, lastY + 19, 9.2, "right", true);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.2);
        doc.setTextColor(TEXT);
        doc.text(currency, currencyValueX + 8, lastY + 19, { align: "left" });
      };

      const formatInvoiceDate = (value?: string | null) => {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        const hours24 = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const hours12 = hours24 % 12 || 12;
        const period = hours24 >= 12 ? "م" : "ص";
        return day + "/" + month + "/" + year + " " + String(hours12).padStart(2, "0") + ":" + minutes + " " + period;
      };

      const drawTableHeader = (y: number) => {
        const x = margin;
        // Official invoice columns, left-to-right:
        // TOTAL | PRICE | UNIT | QTY. | DESCRIPTION | CODE
        const widths = [104, 60, 52, 42, 188, 54, 23];
        const headers = [
          "الإجمالي",
          "السعر",
          "الوحدة",
          "الكمية",
          "الصنف",
          "الكود",
          "م",
        ];

        let cursor = x;
        const tableWidth = widths.reduce((a, b) => a + b, 0);
        doc.setFillColor(BLUE);
        doc.rect(x, y, tableWidth, 34, "F");

        headers.forEach((label, index) => {
          const w = widths[index];
          doc.setFont(arabicBoldFontName, "normal");
          doc.setTextColor("#FFFFFF");
          doc.setFontSize(8.2);
          doc.text(processArabic(label), cursor + w / 2, y + 21, { align: "center" });
          cursor += w;
        });

        return y + 34;
      };

      const drawTableRow = (y: number, item: QuoteItem, index: number) => {
        const widths = [104, 60, 52, 42, 188, 54, 23];
        const tableWidth = widths.reduce((a, b) => a + b, 0);
        const description = String(item.product_name ?? "");
        const descriptionLines = doc.splitTextToSize(processArabic(description), widths[4] - 10) as string[];
        const rowHeight = Math.max(30, Math.min(52, 12 + descriptionLines.length * 11));

        let cursor = margin;
        // Transparent body rows: keep the watermark visible through the table.
        doc.setDrawColor(GRID);
        doc.setLineWidth(0.45);
        doc.rect(margin, y, tableWidth, rowHeight, "S");

        const values = [
          Number(item.line_total ?? 0).toFixed(3),
          Number(item.unit_price ?? 0).toFixed(3),
          String(item.unit ?? ""),
          String(item.quantity ?? 0),
          "",
          String(item.sku ?? ""),
          String(index + 1),
        ];

        values.forEach((value, i) => {
          const w = widths[i];
          if (i === 4) {
            doc.setFont(arabicBoldFontName, "normal");
            doc.setFontSize(8.8);
            doc.setTextColor(TEXT);
            descriptionLines.slice(0, 3).forEach((line, lineIndex) => {
              doc.text(line, cursor + w - 7, y + 15 + lineIndex * 10, { align: "right" });
            });
          } else if (i === 0 || i === 1 || i === 2 || i === 3 || i === 5 || i === 6) {
            if (i === 2) {
              doc.setFont(arabicBoldFontName, "normal");
              doc.setFontSize(8.8);
              doc.setTextColor(TEXT);
              doc.text(processArabic(value), cursor + w / 2, y + rowHeight / 2 + 3, { align: "center" });
            } else {
              doc.setFont("helvetica", "bold");
              doc.setFontSize(8.8);
              doc.setTextColor(TEXT);
              doc.text(value, cursor + w / 2, y + rowHeight / 2 + 3, { align: "center" });
            }
          }
          cursor += w;
        });

        return y + rowHeight;
      };

      const drawTotals = (y: number) => {
        const boxW = 180;
        const rowH = 22;
        const boxX = margin;
        const shipping = 0;
        const paid = 0;
        const remaining = total;

        const totalRows = [
          ["الإجمالي", subtotal],
          ["الخصم", discount],
          ["الشحن", shipping],
          ["المدفوع", paid],
        ];

        totalRows.forEach(([label, value], index) => {
          const yy = y + index * rowH;
          doc.setDrawColor("#FFFFFF");
          doc.setFillColor(BLUE);
          doc.rect(boxX, yy, boxW, rowH, "F");
          doc.setFont(arabicBoldFontName, "normal");
          doc.setFontSize(9);
          doc.setTextColor("#FFFFFF");
          doc.text(processArabic(String(label)), boxX + boxW - 8, yy + 15, { align: "right" });
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.2);
          doc.text(Number(value).toFixed(3), boxX + 8, yy + 15);
        });

        const netY = y + totalRows.length * rowH;
        doc.setFillColor(ORANGE);
        doc.rect(boxX, netY, boxW, 28, "F");
        doc.setFont(arabicBoldFontName, "normal");
        doc.setFontSize(9.5);
        doc.setTextColor("#FFFFFF");
        doc.text(processArabic("الباقي"), boxX + boxW - 8, netY + 18, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(remaining.toFixed(3), boxX + 8, netY + 18);

        // Keep the barcode clearly below the table, with a visible breathing gap.
        drawCode39(quote.reference, pageWidth - margin - 156, y + 18, 156, 42);
      };
      let page = 1;
      // Keep the item table clearly below the blue header band and the invoice/customer information block.
      let y = 279;
      await drawHeader();
      drawInfo();
      y = drawTableHeader(y);
      const items = quote.quotation_items ?? [];

      for (const [index, item] of items.entries()) {
        if (y + 26 > footerY - 10) {
          drawFooter();
          doc.addPage();
          page += 1;
          await drawHeader();
          y = 279;
          y = drawTableHeader(y);
        }
        y = drawTableRow(y, item, index);
      }

      if (y + 145 > footerY - 10) {
        drawFooter();
        doc.addPage();
        page += 1;
        await drawHeader();
        y = 279;
        y = drawTableHeader(y);
      }

      drawTotals(y + 14);
      drawFooter();

      return doc.output("blob");
    } catch (error) {
      console.error("PDF generation failed", error);
      throw error instanceof Error ? error : new Error("تعذر إنشاء ملف PDF.");
    }
  };

  const downloadPdf = async (quote: Quote) => {
    try {
      const pdfBlob = await createPdfBlob(quote);
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = pdfUrl;
      anchor.download = `${quote.reference}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
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

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={selectAllQuotes}
            disabled={loading || filteredQuotes.length === 0}
          >
            تحديد الكل
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={clearQuoteSelection}
            disabled={loading || selectedQuoteIds.length === 0}
          >
            إلغاء التحديد
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleDeleteSelectedQuotes()}
            disabled={loading || selectedQuoteIds.length === 0}
          >
            <Trash2 className="ml-2 h-4 w-4" />
            حذف المحدد{selectedQuoteIds.length > 0 ? ` (${selectedQuoteIds.length})` : ""}
          </Button>
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
              <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4">
                <input
                  type="checkbox"
                  aria-label={`تحديد عرض السعر ${q.reference}`}
                  checked={selectedQuoteIds.includes(q.id)}
                  onChange={() => toggleQuoteSelection(q.id)}
                  onClick={(event) => event.stopPropagation()}
                  className="mt-1 h-4 w-4"
                />
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
                  <TableHead className="w-12 text-center">
                    <input
                      type="checkbox"
                      aria-label="تحديد كل العروض"
                      checked={filteredQuotes.length > 0 && filteredQuotes.every((quote) => selectedQuoteIds.includes(quote.id))}
                      onChange={(event) =>
                        event.target.checked ? selectAllQuotes() : clearQuoteSelection()
                      }
                      className="h-4 w-4"
                    />
                  </TableHead>
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
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`تحديد عرض السعر ${q.reference}`}
                        checked={selectedQuoteIds.includes(q.id)}
                        onChange={() => toggleQuoteSelection(q.id)}
                        className="h-4 w-4"
                      />
                    </TableCell>
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
                       <div className="flex flex-wrap gap-1">
                         <Button variant="ghost" size="sm" onClick={() => openQuoteForEditing(q)}>
                           <FolderOpen className="ml-1 h-4 w-4" /> فتح
                         </Button>
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
                 <Button size="sm" onClick={() => openQuoteForEditing(open)}>
                   <FolderOpen className="ml-1 h-4 w-4" /> فتح للتعديل
                 </Button>
                 <Button size="sm" onClick={() => void downloadPdf(open)}>PDF</Button>
                 <Button size="sm" variant="outline" onClick={() => downloadExcel(open)}>
                   <FileSpreadsheet className="ml-1 h-4 w-4" /> Excel
                 </Button>
                 <Button size="sm" variant="secondary" onClick={() => void openWhatsApp(open)}>
                   <MessageCircle className="ml-1 h-4 w-4" /> واتساب
                 </Button>
                 <Button size="sm" variant="destructive" onClick={() => void handleDeleteQuote(open)} disabled={loading}>
                   <Trash2 className="ml-1 h-4 w-4" /> حذف العرض
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
