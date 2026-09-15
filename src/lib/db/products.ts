/**
 * طبقة الوصول لبيانات المنتجات (Data Access Layer).
 * تقرأ من قاعدة البيانات الحقيقية، وتستخدم البيانات التجريبية
 * كـ fallback مؤقت فقط إذا فشل الاتصال أو كانت القاعدة فارغة.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { products as mockProducts, type Product } from "@/lib/mock-data";

export type ProductsResult = {
  items: Product[];
  source: "database" | "mock";
  error: string | null;
};

/** صفوف قاعدة البيانات → نموذج الواجهة الحالي دون تغيير التصميم */
type Row = {
  id: string;
  sku: string;
  name_ar: string;
  name_en: string | null;
  short_name: string | null;
  brand: string | null;
  category_main: string | null;
  category_sub: string | null;
  category_third: string | null;
  product_group: string | null;
  model: string | null;
  size: string | null;
  color: string | null;
  description: string | null;
  unit: string | null;
  image_url: string | null;
  status: "active" | "inactive";
};

export function mapProductRow(row: Row): Product {
  return {
    id: row.id,
    sku: row.sku,
    nameAr: row.name_ar,
    nameEn: row.name_en ?? "",
    shortName: row.short_name ?? "",
    brand: row.brand ?? "",
    category1: row.category_main ?? "",
    category2: row.category_sub ?? "",
    category3: row.category_third ?? "",
    group: row.product_group ?? "",
    model: row.model ?? "",
    size: row.size ?? "",
    color: row.color ?? "",
    description: row.description ?? "",
    unit: row.unit ?? "",
    image: row.image_url,
    status: row.status,
  };
}

export async function fetchProducts(): Promise<ProductsResult> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, sku, name_ar, name_en, short_name, brand, category_main, category_sub, category_third, product_group, model, size, color, description, unit, image_url, status",
      )
      .order("sku", { ascending: true });

    if (error) {
      return { items: mockProducts, source: "mock", error: error.message };
    }
    if (!data || data.length === 0) {
      // القاعدة متصلة لكنها فارغة — نعرض البيانات التجريبية مؤقتاً
      return { items: mockProducts, source: "mock", error: null };
    }
    return { items: (data as Row[]).map(mapProductRow), source: "database", error: null };
  } catch (e) {
    return {
      items: mockProducts,
      source: "mock",
      error: e instanceof Error ? e.message : "تعذّر الاتصال بقاعدة البيانات",
    };
  }
}

export const productsQueryOptions = queryOptions({
  queryKey: ["products"],
  queryFn: fetchProducts,
});
