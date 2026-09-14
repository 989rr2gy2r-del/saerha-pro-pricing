import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone, Plus, Search, Tag } from "lucide-react";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { customers } from "@/lib/mock-data";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "العملاء — سعّرها" },
      {
        name: "description",
        content: "إدارة عملاء شركة الأواب في سعّرها مع الاستعداد لربط سعر خاص لكل عميل.",
      },
      { property: "og:title", content: "العملاء — سعّرها" },
      { property: "og:description", content: "بيانات العملاء وأنواعهم وملاحظاتهم." },
    ],
  }),
  component: Customers,
});

function Customers() {
  return (
    <AppShell
      title="العملاء"
      subtitle="بيانات العملاء — جاهزة لربط سعر خاص بكل عميل"
      action={<CustomerForm />}
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-12 pr-10" placeholder="ابحث باسم العميل أو الشركة أو الهاتف" />
        </div>

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {customers.map((c) => (
            <Card key={c.id} className="shadow-card">
              <CardContent className="space-y-3 p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.company}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{c.type}</Badge>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p className="num flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.email}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> {c.address}
                  </p>
                </div>
                {c.hasSpecialPricing && (
                  <p className="flex items-center gap-2 rounded-lg bg-accent-soft/70 px-2.5 py-2 text-[11px] font-semibold">
                    <Tag className="h-3.5 w-3.5 text-accent" /> مؤهّل لسعر خاص بالعميل
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">{c.notes}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function CustomerForm() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-12 shrink-0 gap-2 font-extrabold">
          <Plus className="h-4 w-4" /> إضافة عميل
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
        <DialogHeader>
          <DialogTitle>إضافة عميل</DialogTitle>
          <DialogDescription>بيانات العميل الأساسية.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {["اسم العميل", "الشركة", "الهاتف", "البريد الإلكتروني", "العنوان"].map((f) => (
            <div key={f} className="space-y-1.5">
              <Label className="text-xs">{f}</Label>
              <Input className="h-11" placeholder={f} />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-xs">نوع العميل</Label>
            <Select>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                {["تجزئة", "جملة", "مقاول", "جهة حكومية"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea rows={3} />
          </div>
          <Button className="h-12 w-full font-extrabold sm:col-span-2">حفظ العميل</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
