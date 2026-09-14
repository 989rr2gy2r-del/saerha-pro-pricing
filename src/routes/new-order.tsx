import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, FileText, Image as ImageIcon, PenLine, Upload } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { customers } from "@/lib/mock-data";

export const Route = createFileRoute("/new-order")({
  head: () => ({
    meta: [
      { title: "طلبية جديدة — سعّرها" },
      {
        name: "description",
        content: "ارفع طلبية الزبون في سعّرها كصورة أو PDF أو Excel أو نص أو طلب مكتوب بخط اليد.",
      },
      { property: "og:title", content: "طلبية جديدة — سعّرها" },
      { property: "og:description", content: "رفع طلبية الزبون بأي شكل داخل نظام سعّرها." },
    ],
  }),
  component: NewOrder,
});

const sources = [
  { icon: ImageIcon, label: "صورة", hint: "JPG · PNG · HEIC" },
  { icon: FileText, label: "PDF", hint: "ملف PDF" },
  { icon: FileSpreadsheet, label: "Excel", hint: "XLSX · CSV" },
  { icon: PenLine, label: "نص / خط اليد", hint: "نص مكتوب أو صورة مكتوبة بخط اليد" },
];

function NewOrder() {
  return (
    <AppShell title="طلبية جديدة" subtitle="ارفع طلبية الزبون بأي شكل، وسنجهزها للتسعير.">
      <div className="space-y-5">
        <Card className="border-2 border-dashed border-accent/50 bg-accent-soft/40 shadow-card">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-raised">
              <Upload className="h-8 w-8" />
            </div>
            <div>
              <p className="text-base font-extrabold">رفع طلبية</p>
              <p className="mt-1 text-xs text-muted-foreground">
                اسحب الملف هنا أو اختر من جهازك. الحد الأقصى المقترح 20 ميجابايت للملف.
              </p>
            </div>
            <Input type="file" multiple className="h-12 cursor-pointer text-sm" />
            <p className="rounded-lg bg-card px-3 py-2 text-[11px] text-muted-foreground">
              القراءة الآلية للطلبية (OCR والذكاء الاصطناعي ومطابقة المنتجات) ستُضاف في مرحلة قادمة.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sources.map((s) => (
            <Card key={s.label} className="shadow-card">
              <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                <s.icon className="h-6 w-6 text-primary" />
                <p className="text-sm font-bold">{s.label}</p>
                <p className="text-[11px] text-muted-foreground">{s.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">بيانات الطلبية</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>العميل</Label>
              <Select>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="اختر عميلاً" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>مصدر الطلبية</Label>
              <Select>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="اختر المصدر" />
                </SelectTrigger>
                <SelectContent>
                  {["صورة", "PDF", "Excel", "نص", "خط اليد"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>نص الطلبية (اختياري)</Label>
              <Textarea rows={5} placeholder="الصق نص الطلبية هنا إن كانت مكتوبة..." />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>ملاحظات</Label>
              <Textarea rows={3} placeholder="ملاحظات إضافية عن الطلبية" />
            </div>
            <Button size="lg" className="h-14 w-full text-base font-extrabold lg:col-span-2">
              حفظ الطلبية
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
