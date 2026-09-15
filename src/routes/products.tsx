import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownUp, Filter, ImageOff, Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { productsQueryOptions } from "@/lib/db/products";
import { type Product } from "@/lib/mock-data";

export const Route = createFileRoute("/products")({
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQueryOptions),
  errorComponent: ({ error }) => (
    <div dir="rtl" role="alert" className="p-6 text-right text-sm">
      تعذّر تحميل المنتجات: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div dir="rtl" className="p-6 text-right text-sm">
      لا توجد منتجات.
    </div>
  ),
  head: () => ({
    meta: [
      { title: "المنتجات — سعّرها" },
      {
        name: "description",
        content:
          "إدارة منتجات شركة الأواب في سعّرها: كود الصنف، الأسماء، الماركة، التصنيفات، الموديل، المقاس، الوحدة والحالة.",
      },
      { property: "og:title", content: "المنتجات — سعّرها" },
      { property: "og:description", content: "إدارة أصناف الكهرباء والإنارة والصحي والسباكة ومواد البناء." },
    ],
  }),
  component: Products,
});

const FIELDS: { key: keyof Product; label: string }[] = [
  { key: "sku", label: "SKU / كود الصنف" },
  { key: "nameAr", label: "الاسم العربي" },
  { key: "nameEn", label: "الاسم الإنجليزي" },
  { key: "shortName", label: "الاسم المختصر" },
  { key: "brand", label: "الماركة" },
  { key: "category1", label: "التصنيف الرئيسي" },
  { key: "category2", label: "التصنيف الفرعي" },
  { key: "category3", label: "التصنيف الثالث" },
  { key: "group", label: "المجموعة" },
  { key: "model", label: "الموديل" },
  { key: "size", label: "المقاس" },
  { key: "color", label: "اللون" },
  { key: "unit", label: "الوحدة" },
];

function Products() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("sku");
  const [selected, setSelected] = useState<Product | null>(null);

  const { data } = useSuspenseQuery(productsQueryOptions);
  const items = data.items;

  const categories = useMemo(
    () => [...new Set(items.map((p) => p.category1))].filter(Boolean),
    [items],
  );

  const rows = useMemo(() => {
    const term = q.trim();
    return items
      .filter((p) => (cat === "all" ? true : p.category1 === cat))
      .filter((p) =>
        term
          ? [p.sku, p.nameAr, p.nameEn, p.shortName, p.brand, p.model].some((v) =>
              v.toLowerCase().includes(term.toLowerCase()),
            )
          : true,
      )
      .sort((a, b) =>
        sort === "nameAr" ? a.nameAr.localeCompare(b.nameAr, "ar") : a.sku.localeCompare(b.sku),
      );
  }, [q, cat, sort]);

  return (
    <AppShell
      title="المنتجات"
      subtitle="إدارة أصناف شركة الأواب — بيانات تجريبية قليلة"
      action={<ProductForm />}
    >
      <div className="space-y-4">
        <Card className="shadow-card">
          <CardContent className="grid gap-3 p-4 lg:grid-cols-3">
            <div className="relative lg:col-span-3">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-12 pr-10"
                placeholder="ابحث بالكود أو الاسم أو الماركة أو الموديل"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Filter className="h-3.5 w-3.5" /> التصنيف الرئيسي
              </Label>
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع التصنيفات</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <ArrowDownUp className="h-3.5 w-3.5" /> الترتيب
              </Label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sku">كود الصنف</SelectItem>
                  <SelectItem value="nameAr">الاسم العربي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <p className="num text-xs text-muted-foreground">النتائج: {rows.length}</p>
              <Badge variant={data.source === "database" ? "default" : "secondary"}>
                {data.source === "database" ? "من قاعدة البيانات" : "بيانات تجريبية مؤقتة"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3 lg:hidden">
          {rows.map((p) => (
            <Card key={p.id} className="shadow-card">
              <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <ImageOff className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="num text-xs font-bold text-accent">{p.sku}</p>
                  <p className="truncate text-sm font-bold">{p.nameAr}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.brand} · {p.category1} · {p.unit}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setSelected(p)}
                >
                  تفاصيل
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="hidden shadow-card lg:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">SKU</TableHead>
                  <TableHead className="text-right">الاسم العربي</TableHead>
                  <TableHead className="text-right">الماركة</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">الموديل</TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="num font-bold">{p.sku}</TableCell>
                    <TableCell>{p.nameAr}</TableCell>
                    <TableCell>{p.brand}</TableCell>
                    <TableCell>{p.category1}</TableCell>
                    <TableCell className="num">{p.model}</TableCell>
                    <TableCell>{p.unit}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"}>
                        {p.status === "active" ? "مفعّل" : "غير مفعّل"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(p)}>
                        تفاصيل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
          <DialogHeader>
            <DialogTitle>{selected?.nameAr}</DialogTitle>
            <DialogDescription className="num">{selected?.sku}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="rounded-lg bg-muted/50 p-2.5">
                    <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold">{String(selected[f.key])}</dd>
                  </div>
                ))}
              </dl>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-[11px] text-muted-foreground">الوصف</p>
                <p className="mt-0.5 text-sm">{selected.description}</p>
              </div>
              <Button variant="secondary" className="h-12 w-full font-bold">
                <Pencil className="h-4 w-4" /> تعديل المنتج
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ProductForm() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-12 shrink-0 gap-2 font-extrabold">
          <Plus className="h-4 w-4" /> إضافة منتج
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto text-right">
        <DialogHeader>
          <DialogTitle>إضافة منتج</DialogTitle>
          <DialogDescription>الحقول الأساسية لصنف في قاعدة منتجات شركة الأواب.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              <Input className="h-11" placeholder={f.label} />
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">الوصف</Label>
            <Textarea rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">صورة المنتج</Label>
            <Input type="file" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الحالة</Label>
            <Select defaultValue="active">
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">مفعّل</SelectItem>
                <SelectItem value="inactive">غير مفعّل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-12 w-full font-extrabold sm:col-span-2">حفظ المنتج</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
