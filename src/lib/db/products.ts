/**
 * طبقة الوصول لبيانات المنتجات
 * لا تستخدم mock data كبديل حقيقي
 */
import { queryOptions } from "@tanstack/react-query";

import { fetchProducts as fetchLiveProducts, mapProductRow } from "@/lib/db/saerha-data";
import type { Product } from "@/lib/mock-data";

export type ProductsResult = {
  items: Product[];
  source: "database";
  error: string | null;
};

export async function fetchProducts(): Promise<ProductsResult> {
  try {
    const items = await fetchLiveProducts();
    return { items, source: "database", error: null };
  } catch (error) {
    return {
      items: [],
      source: "database",
      error: error instanceof Error ? error.message : "تعذّر الاتصال بقاعدة البيانات",
    };
  }
}

export const productsQueryOptions = queryOptions({
  queryKey: ["products"],
  queryFn: fetchProducts,
});

export { mapProductRow };
