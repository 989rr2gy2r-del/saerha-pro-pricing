import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone, Plus, Search, Tag, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
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
import { createCustomer, deleteCustomer, updateCustomer } from "@/lib/db/saerha-data";
import { supabase } from "@/integrations/supabase/client";
import type { Customer } from "@/lib/mock-data";

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
  component: () => (
    <ProtectedRoute>
      <Customers />
    </ProtectedRoute>
  ),
});

function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, company, phone, email, address, customer_type, notes, is_active")
        .order("name", { ascending: true });
      if (error) throw error;
      setCustomers(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          company: row.company ?? "",
          phone: row.phone ?? "",
          email: row.email ?? "",
          address: row.address ?? "",
          type:
            row.customer_type === "wholesale"
              ? "جملة"
              : row.customer_type === "contractor"
                ? "مقاول"
                : row.customer_type === "government"
                  ? "جهة حكومية"
                  : "تجزئة",
          notes: row.notes ?? "",
          hasSpecialPricing: Boolean(row.is_active),
        })),
      );
    } catch (error) {
      console.error(error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const filtered = customers.filter((c) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [c.name, c.company, c.phone, c.email].some((value) =>
      value.toLowerCase().includes(term),
    );
  });

  return (
    <AppShell
      title="العملاء"
      subtitle="بيانات العملاء — مرتبطة بقاعدة البيانات"
      action={<CustomerForm onSaved={loadCustomers} />}
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 pr-10"
            placeholder="ابحث باسم العميل أو الشركة أو الهاتف"
          />
        </div>

        {filtered.length === 0 && !loading ? (
          <Card className="shadow-card">
            <CardContent className="p-6 text-sm text-muted-foreground">
              لا توجد بيانات بعد.
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="shadow-card">
              <CardContent className="space-y-3 p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.company}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {c.type}
                  </Badge>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p className="num flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {c.phone}
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />{" "}
                    <span className="truncate">{c.email}</span>
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
                <CustomerForm selected={c} onSaved={loadCustomers} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function CustomerForm({
  selected,
  onSaved,
}: {
  selected?: Customer;
  onSaved?: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    company: string;
    phone: string;
    email: string;
    address: string;
    type: Customer["type"];
    notes: string;
    hasSpecialPricing: boolean;
  }>({
    name: selected?.name ?? "",
    company: selected?.company ?? "",
    phone: selected?.phone ?? "",
    email: selected?.email ?? "",
    address: selected?.address ?? "",
    type: selected?.type ?? "تجزئة",
    notes: selected?.notes ?? "",
    hasSpecialPricing: selected?.hasSpecialPricing ?? false,
  });

  useEffect(() => {
    if (selected) {
      setForm({
        name: selected.name,
        company: selected.company,
        phone: selected.phone,
        email: selected.email,
        address: selected.address,
        type: selected.type,
        notes: selected.notes,
        hasSpecialPricing: selected.hasSpecialPricing,
      });
    }
  }, [selected, open]);

  const removeCustomer = async () => {
    if (!selected) return;
    if (!window.confirm(`هل تريد حذف العميل "${selected.name}" نهائيًا؟`)) return;
    try {
      setLoading(true);
      await deleteCustomer(selected.id);
      setOpen(false);
      if (onSaved) await onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حذف العميل");
    } finally {
      setLoading(false);
    }
  };

  const saveCustomer = async () => {
    try {
      setLoading(true);
      if (selected) {
        await updateCustomer(selected.id, {
          name: form.name,
          company: form.company,
          phone: form.phone,
          email: form.email,
          address: form.address,
          type: form.type as Customer["type"],
          notes: form.notes,
          hasSpecialPricing: form.hasSpecialPricing,
        });
      } else {
        await createCustomer({
          name: form.name,
          company: form.company,
          phone: form.phone,
          email: form.email,
          address: form.address,
          type: form.type as Customer["type"],
          notes: form.notes,
          hasSpecialPricing: form.hasSpecialPricing,
        });
      }
      setOpen(false);
      if (onSaved) await onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ العميل");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-12 shrink-0 gap-2 font-extrabold" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> {selected ? "تعديل" : "إضافة عميل"}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
        <DialogHeader>
          <DialogTitle>{selected ? "تعديل العميل" : "إضافة عميل"}</DialogTitle>
          <DialogDescription>بيانات العميل الأساسية.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">اسم العميل</Label>
            <Input
              className="h-11"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="اسم العميل"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الشركة</Label>
            <Input
              className="h-11"
              value={form.company}
              onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
              placeholder="الشركة"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الهاتف</Label>
            <Input
              className="h-11"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="الهاتف"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">البريد الإلكتروني</Label>
            <Input
              className="h-11"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="البريد الإلكتروني"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">العنوان</Label>
            <Input
              className="h-11"
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="العنوان"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">نوع العميل</Label>
            <Select
              value={form.type}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, type: value as Customer["type"] }))
              }
            >
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
          <div className="space-y-1.5">
            <Label className="text-xs">خصم خاص / سعر خاص</Label>
            <Select
              value={form.hasSpecialPricing ? "yes" : "no"}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, hasSpecialPricing: value === "yes" }))
              }
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="اختر" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">نعم</SelectItem>
                <SelectItem value="no">لا</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            <Button
              className="h-12 w-full font-extrabold"
              onClick={saveCustomer}
              disabled={loading}
            >
              {loading ? "جارٍ الحفظ..." : "حفظ العميل"}
            </Button>
            {selected && (
              <Button
                type="button"
                variant="destructive"
                className="h-12 w-full font-extrabold"
                onClick={() => void removeCustomer()}
                disabled={loading}
              >
                <Trash2 className="ml-2 h-4 w-4" />
                حذف العميل
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
