import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Customer, Product } from "@/lib/mock-data";

export function supabaseConfigured() {
  const url =
    import.meta.env["VITE_SUPABASE_URL"] ||
    import.meta.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    "https://ebtjwwrjhsebojurkvgy.supabase.co";
  const key =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    import.meta.env["SUPABASE_PUBLISHABLE_KEY"] ||
    import.meta.env["VITE_SUPABASE_ANON_KEY"] ||
    import.meta.env["SUPABASE_ANON_KEY"] ||
    import.meta.env["VITE_SUPABASE_KEY"] ||
    import.meta.env["SUPABASE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_KEY"] ||
    process.env["SUPABASE_KEY"];
  return Boolean(url && key);
}

export type ProductInsertInput = {
  sku: string;
  nameAr: string;
  nameEn?: string;
  shortName?: string;
  brand?: string;
  category1?: string;
  category2?: string;
  category3?: string;
  group?: string;
  model?: string;
  size?: string;
  color?: string;
  description?: string;
  unit?: string;
  image?: string | null;
  status?: "active" | "inactive";
};

export type CustomerInsertInput = {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  type?: "تجزئة" | "جملة" | "مقاول" | "جهة حكومية";
  notes?: string;
  hasSpecialPricing?: boolean;
};

const customerTypeMap: Record<string, Customer["type"]> = {
  retail: "تجزئة",
  wholesale: "جملة",
  contractor: "مقاول",
  government: "جهة حكومية",
};

const customerTypeValueMap: Record<Customer["type"], string> = {
  تجزئة: "retail",
  جملة: "wholesale",
  مقاول: "contractor",
  "جهة حكومية": "government",
};

type DbRow = Record<string, unknown>;
type PriceType = Database["public"]["Enums"]["price_type"];
type ProductStatus = Database["public"]["Enums"]["product_status"];

const readString = (row: DbRow, key: string): string => {
  const value = row[key];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
};

const readStatus = (row: DbRow): ProductStatus =>
  row["status"] === "inactive" ? "inactive" : "active";

export function mapProductRow(row: DbRow): Product {
  return {
    id: String(row["id"] ?? ""),
    sku: String(row["sku"] ?? ""),
    nameAr: String(row["name_ar"] ?? row["nameAr"] ?? ""),
    nameEn: String(row["name_en"] ?? row["nameEn"] ?? ""),
    shortName: String(row["short_name"] ?? row["shortName"] ?? ""),
    brand: String(row["brand"] ?? ""),
    category1: String(row["category_main"] ?? row["category1"] ?? ""),
    category2: String(row["category_sub"] ?? row["category2"] ?? ""),
    category3: String(row["category_third"] ?? row["category3"] ?? ""),
    group: String(row["product_group"] ?? row["group"] ?? ""),
    model: String(row["model"] ?? ""),
    size: String(row["size"] ?? ""),
    color: String(row["color"] ?? ""),
    description: String(row["description"] ?? ""),
    unit: String(row["unit"] ?? ""),
    image:
      typeof row["image_url"] === "string"
        ? row["image_url"]
        : typeof row["image"] === "string"
          ? row["image"]
          : null,
    status: readStatus(row),
  };
}

export function mapCustomerRow(row: DbRow): Customer {
  const type = customerTypeMap[String(row["customer_type"] ?? row["type"] ?? "retail")] ?? "تجزئة";
  return {
    id: String(row["id"] ?? ""),
    name: readString(row, "name"),
    company: readString(row, "company"),
    phone: readString(row, "phone"),
    email: readString(row, "email"),
    address: readString(row, "address"),
    type,
    notes: readString(row, "notes"),
    hasSpecialPricing: Boolean(row["has_special_pricing"] ?? row["hasSpecialPricing"] ?? false),
  };
}

export async function fetchProducts(): Promise<Product[]> {
  if (!supabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, sku, name_ar, name_en, short_name, brand, category_main, category_sub, category_third, product_group, model, size, color, description, unit, image_url, status",
    )
    .order("sku", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapProductRow);
}

async function getAuthenticatedApiHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function createProduct(input: ProductInsertInput): Promise<Product> {
  if (typeof window !== "undefined") {
    const response = await fetch("/api/supabase-write", {
      method: "POST",
      headers: await getAuthenticatedApiHeaders(),
      body: JSON.stringify({
        table: "products",
        action: "insert",
        payload: {
          sku: input.sku,
          name_ar: input.nameAr,
          name_en: input.nameEn ?? "",
          short_name: input.shortName ?? input.nameAr,
          brand: input.brand ?? "",
          category_main: input.category1 ?? "",
          category_sub: input.category2 ?? "",
          category_third: input.category3 ?? "",
          product_group: input.group ?? "",
          model: input.model ?? "",
          size: input.size ?? "",
          color: input.color ?? "",
          description: input.description ?? "",
          unit: input.unit ?? "حبة",
          image_url: input.image ?? null,
          status: input.status ?? "active",
        },
        select:
          "id, sku, name_ar, name_en, short_name, brand, category_main, category_sub, category_third, product_group, model, size, color, description, unit, image_url, status",
      }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false)
      throw new Error(payload?.error ?? "تعذر إنشاء المنتج.");
    return mapProductRow(payload.data);
  }

  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");

  const status: "active" | "inactive" = input.status ?? "active";
  const { data, error } = await supabase
    .from("products")
    .insert({
      sku: input.sku,
      name_ar: input.nameAr,
      name_en: input.nameEn ?? "",
      short_name: input.shortName ?? input.nameAr,
      brand: input.brand ?? "",
      category_main: input.category1 ?? "",
      category_sub: input.category2 ?? "",
      category_third: input.category3 ?? "",
      product_group: input.group ?? "",
      model: input.model ?? "",
      size: input.size ?? "",
      color: input.color ?? "",
      description: input.description ?? "",
      unit: input.unit ?? "حبة",
      image_url: input.image ?? null,
      status: status as ProductStatus,
    } as Database["public"]["Tables"]["products"]["Insert"])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapProductRow(data);
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInsertInput>,
): Promise<Product> {
  if (typeof window !== "undefined") {
    const payload: Record<string, unknown> = {};
    if (input.sku) payload["sku"] = input.sku;
    if (input.nameAr) payload["name_ar"] = input.nameAr;
    if (input.nameEn !== undefined) payload["name_en"] = input.nameEn;
    if (input.shortName !== undefined) payload["short_name"] = input.shortName;
    if (input.brand !== undefined) payload["brand"] = input.brand;
    if (input.category1 !== undefined) payload["category_main"] = input.category1;
    if (input.category2 !== undefined) payload["category_sub"] = input.category2;
    if (input.category3 !== undefined) payload["category_third"] = input.category3;
    if (input.group !== undefined) payload["product_group"] = input.group;
    if (input.model !== undefined) payload["model"] = input.model;
    if (input.size !== undefined) payload["size"] = input.size;
    if (input.color !== undefined) payload["color"] = input.color;
    if (input.description !== undefined) payload["description"] = input.description;
    if (input.unit !== undefined) payload["unit"] = input.unit;
    if (input.image !== undefined) payload["image_url"] = input.image;
    if (input.status !== undefined) payload["status"] = input.status;

    const response = await fetch("/api/supabase-write", {
      method: "POST",
      headers: await getAuthenticatedApiHeaders(),
      body: JSON.stringify({
        table: "products",
        action: "update",
        filters: [{ column: "id", value: id }],
        payload,
        select:
          "id, sku, name_ar, name_en, short_name, brand, category_main, category_sub, category_third, product_group, model, size, color, description, unit, image_url, status",
      }),
    });
    const body = await response.json();
    if (!response.ok || body?.success === false)
      throw new Error(body?.error ?? "تعذر تحديث المنتج.");
    return mapProductRow(body.data);
  }

  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");

  const payload: Record<string, unknown> = {};
  if (input.sku) payload["sku"] = input.sku;
  if (input.nameAr) payload["name_ar"] = input.nameAr;
  if (input.nameEn !== undefined) payload["name_en"] = input.nameEn;
  if (input.shortName !== undefined) payload["short_name"] = input.shortName;
  if (input.brand !== undefined) payload["brand"] = input.brand;
  if (input.category1 !== undefined) payload["category_main"] = input.category1;
  if (input.category2 !== undefined) payload["category_sub"] = input.category2;
  if (input.category3 !== undefined) payload["category_third"] = input.category3;
  if (input.group !== undefined) payload["product_group"] = input.group;
  if (input.model !== undefined) payload["model"] = input.model;
  if (input.size !== undefined) payload["size"] = input.size;
  if (input.color !== undefined) payload["color"] = input.color;
  if (input.description !== undefined) payload["description"] = input.description;
  if (input.unit !== undefined) payload["unit"] = input.unit;
  if (input.image !== undefined) payload["image_url"] = input.image;
  if (input.status !== undefined) payload["status"] = input.status;

  const { data, error } = await supabase
    .from("products")
    .update(payload as Database["public"]["Tables"]["products"]["Update"])
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapProductRow(data);
}

export async function deleteProduct(id: string) {
  if (typeof window !== "undefined") {
    const response = await fetch("/api/supabase-write", {
      method: "POST",
      headers: await getAuthenticatedApiHeaders(),
      body: JSON.stringify({
        table: "products",
        action: "delete",
        filters: [{ column: "id", value: id }],
      }),
    });
    const body = await response.json();
    if (!response.ok || body?.success === false) throw new Error(body?.error ?? "تعذر حذف المنتج.");
    return;
  }

  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchCustomers(): Promise<Customer[]> {
  if (!supabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, company, phone, email, address, customer_type, notes, is_active")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCustomerRow);
}

export async function createCustomer(input: CustomerInsertInput): Promise<Customer> {
  if (typeof window !== "undefined") {
    const type = customerTypeValueMap[input.type ?? "تجزئة"] ?? "retail";
    const response = await fetch("/api/supabase-write", {
      method: "POST",
      headers: await getAuthenticatedApiHeaders(),
      body: JSON.stringify({
        table: "customers",
        action: "insert",
        payload: {
          name: input.name,
          company: input.company ?? "",
          phone: input.phone ?? "",
          email: input.email ?? "",
          address: input.address ?? "",
          customer_type: type as "retail" | "wholesale" | "contractor" | "government",
          notes: input.notes ?? "",
          is_active: true,
        },
        select: "id, name, company, phone, email, address, customer_type, notes, is_active",
      }),
    });
    const body = await response.json();
    if (!response.ok || body?.success === false)
      throw new Error(body?.error ?? "تعذر إنشاء العميل.");
    return mapCustomerRow(body.data);
  }

  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");

  const type = customerTypeValueMap[input.type ?? "تجزئة"] ?? "retail";
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name,
      company: input.company ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
      address: input.address ?? "",
      customer_type: type as "retail" | "wholesale" | "contractor" | "government",
      notes: input.notes ?? "",
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapCustomerRow(data);
}

export async function updateCustomer(
  id: string,
  input: Partial<CustomerInsertInput>,
): Promise<Customer> {
  if (typeof window !== "undefined") {
    const payload: Record<string, unknown> = {};
    if (input.name) payload["name"] = input.name;
    if (input.company !== undefined) payload["company"] = input.company;
    if (input.phone !== undefined) payload["phone"] = input.phone;
    if (input.email !== undefined) payload["email"] = input.email;
    if (input.address !== undefined) payload["address"] = input.address;
    if (input.type !== undefined)
      payload["customer_type"] = customerTypeValueMap[input.type] ?? "retail";
    if (input.notes !== undefined) payload["notes"] = input.notes;

    const response = await fetch("/api/supabase-write", {
      method: "POST",
      headers: await getAuthenticatedApiHeaders(),
      body: JSON.stringify({
        table: "customers",
        action: "update",
        filters: [{ column: "id", value: id }],
        payload,
        select: "id, name, company, phone, email, address, customer_type, notes, is_active",
      }),
    });
    const body = await response.json();
    if (!response.ok || body?.success === false)
      throw new Error(body?.error ?? "تعذر تحديث العميل.");
    return mapCustomerRow(body.data);
  }

  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");

  const payload: Record<string, unknown> = {};
  if (input.name) payload["name"] = input.name;
  if (input.company !== undefined) payload["company"] = input.company;
  if (input.phone !== undefined) payload["phone"] = input.phone;
  if (input.email !== undefined) payload["email"] = input.email;
  if (input.address !== undefined) payload["address"] = input.address;
  if (input.type !== undefined)
    payload["customer_type"] = customerTypeValueMap[input.type] ?? "retail";
  if (input.notes !== undefined) payload["notes"] = input.notes;

  const { data, error } = await supabase
    .from("customers")
    .update(payload as Database["public"]["Tables"]["customers"]["Update"])
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapCustomerRow(data);
}

export async function deleteCustomer(id: string) {
  if (typeof window !== "undefined") {
    const response = await fetch("/api/supabase-write", {
      method: "POST",
      headers: await getAuthenticatedApiHeaders(),
      body: JSON.stringify({
        table: "customers",
        action: "delete",
        filters: [{ column: "id", value: id }],
      }),
    });
    const body = await response.json();
    if (!response.ok || body?.success === false) throw new Error(body?.error ?? "تعذر حذف العميل.");
    return;
  }

  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type ProductImportRow = {
  sku?: string;
  nameAr?: string;
  nameEn?: string;
  shortName?: string;
  brand?: string;
  category1?: string;
  category2?: string;
  category3?: string;
  group?: string;
  model?: string;
  size?: string;
  color?: string;
  unit?: string;
  description?: string;
  status?: "active" | "inactive";
  retailPrice?: number | string | null;
  resellerPrice?: number | string | null;
  customerSpecialPrice?: number | string | null;
  customerName?: string | null;
  currency?: string;
};

export type ProductImportSummary = {
  new: number;
  updated: number;
  priceChanged: number;
  duplicate: number;
  error: number;
};

function normalizeImportString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const raw = String(value).trim();
  const normalized = raw
    .replace(/٬/g, "")
    .replace(/\u0660/g, "0")
    .replace(/\u0661/g, "1")
    .replace(/\u0662/g, "2")
    .replace(/\u0663/g, "3")
    .replace(/\u0664/g, "4")
    .replace(/\u0665/g, "5")
    .replace(/\u0666/g, "6")
    .replace(/\u0667/g, "7")
    .replace(/\u0668/g, "8")
    .replace(/\u0669/g, "9")
    .replace(/[^0-9.-]/g, "")
    .replace(/(?!^)-/g, "")
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "");

  if (!normalized || normalized === "-" || normalized === ".") return null;

  const asNumber = Number(normalized);
  return Number.isFinite(asNumber) ? asNumber : null;
}

export async function importProductsAndPrices(
  rows: ProductImportRow[],
): Promise<ProductImportSummary> {
  if (typeof window !== "undefined") {
    const response = await fetch("/api/import-products", {
      method: "POST",
      headers: await getAuthenticatedApiHeaders(),
      body: JSON.stringify({ rows }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false)
      throw new Error(payload?.error ?? "تعذر استيراد المنتجات.");
    return payload.summary as ProductImportSummary;
  }

  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");

  const summary: ProductImportSummary = {
    new: 0,
    updated: 0,
    priceChanged: 0,
    duplicate: 0,
    error: 0,
  };
  const seen = new Set<string>();

  for (const row of rows) {
    const status: "active" | "inactive" = row.status === "inactive" ? "inactive" : "active";
    const sku = normalizeImportString(row.sku || row.nameAr || row.nameEn)
      .replace(/\s+/g, " ")
      .trim();
    const nameAr = normalizeImportString(row.nameAr || row.nameEn);
    const nameEn = normalizeImportString(row.nameEn || row.nameAr);

    if (!sku || (!nameAr && !nameEn)) {
      summary.error += 1;
      continue;
    }

    const normalizedSku = sku.toLowerCase();
    if (seen.has(normalizedSku)) {
      summary.duplicate += 1;
      continue;
    }
    seen.add(normalizedSku);

    const { data: existingProduct, error: existingProductError } = await supabase
      .from("products")
      .select("id")
      .eq("sku", sku)
      .maybeSingle();

    if (existingProductError) throw new Error(existingProductError.message);

    let productId = existingProduct?.id;

    if (existingProduct) {
      const payload = {
        name_ar: normalizeImportString(row.nameAr || nameAr || nameEn),
        name_en: nameEn || "",
        short_name: normalizeImportString(row.shortName || row.nameAr || row.nameEn || ""),
        brand: normalizeImportString(row.brand || ""),
        category_main: normalizeImportString(row.category1 || ""),
        category_sub: normalizeImportString(row.category2 || ""),
        category_third: normalizeImportString(row.category3 || ""),
        product_group: normalizeImportString(row.group || ""),
        model: normalizeImportString(row.model || ""),
        size: normalizeImportString(row.size || ""),
        color: normalizeImportString(row.color || ""),
        description: normalizeImportString(row.description || ""),
        unit: normalizeImportString(row.unit || "حبة"),
        status: status as ProductStatus,
      };

      const { error: updateError } = await supabase
        .from("products")
        .update(payload as Database["public"]["Tables"]["products"]["Update"])
        .eq("id", String(existingProduct.id));
      if (updateError) throw new Error(updateError.message);
      summary.updated += 1;
    } else {
      const payload = {
        sku,
        name_ar: nameAr || nameEn || "منتج",
        name_en: nameEn || "",
        short_name: normalizeImportString(row.shortName || row.nameAr || row.nameEn || ""),
        brand: normalizeImportString(row.brand || ""),
        category_main: normalizeImportString(row.category1 || ""),
        category_sub: normalizeImportString(row.category2 || ""),
        category_third: normalizeImportString(row.category3 || ""),
        product_group: normalizeImportString(row.group || ""),
        model: normalizeImportString(row.model || ""),
        size: normalizeImportString(row.size || ""),
        color: normalizeImportString(row.color || ""),
        description: normalizeImportString(row.description || ""),
        unit: normalizeImportString(row.unit || "حبة"),
        status: status as ProductStatus,
      };

      const { data: insertedProduct, error: insertError } = await supabase
        .from("products")
        .insert(payload as Database["public"]["Tables"]["products"]["Insert"])
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      productId = insertedProduct.id;
      summary.new += 1;
    }

    if (!productId) {
      summary.error += 1;
      continue;
    }

    const priceChecks: Array<{
      type: "retail" | "reseller" | "customer_special";
      amount: unknown;
      customerName?: string | null;
    }> = [
      { type: "retail", amount: row.retailPrice },
      { type: "reseller", amount: row.resellerPrice },
      {
        type: "customer_special",
        amount: row.customerSpecialPrice,
        customerName: row.customerName ?? null,
      },
    ];

    for (const priceCheck of priceChecks) {
      const numericValue = normalizePrice(priceCheck.amount);
      if (numericValue === null) continue;

      if (priceCheck.type === "customer_special") {
        const customerName = normalizeImportString(priceCheck.customerName || "");
        if (!customerName) continue;

        const { data: customerRow, error: customerError } = await supabase
          .from("customers")
          .select("id")
          .ilike("name", customerName)
          .maybeSingle();

        if (customerError) throw new Error(customerError.message);
        if (!customerRow) continue;

        await upsertPrice({
          product_id: productId,
          price_type: "customer_special",
          customer_id: customerRow.id,
          amount: numericValue,
          currency: normalizeImportString(row.currency || "KWD") || "KWD",
          source: "excel_import",
          reason: "Excel import customer price sync",
        });
        summary.priceChanged += 1;
        continue;
      }

      const { data: existingPrice, error: existingPriceError } = await supabase
        .from("prices")
        .select("id, amount")
        .eq("product_id", productId)
        .eq("price_type", priceCheck.type)
        .is("customer_id", null)
        .maybeSingle();

      if (existingPriceError) throw new Error(existingPriceError.message);

      if (existingPrice) {
        const before = Number(existingPrice.amount ?? 0);
        if (Math.abs(before - numericValue) > 0.0001) {
          await upsertPrice({
            product_id: productId,
            price_type: priceCheck.type,
            amount: numericValue,
            currency: normalizeImportString(row.currency || "KWD") || "KWD",
            source: "excel_import",
            reason: "Excel import base price update",
          });
          summary.priceChanged += 1;
        }
      } else {
        await upsertPrice({
          product_id: productId,
          price_type: priceCheck.type,
          amount: numericValue,
          currency: normalizeImportString(row.currency || "KWD") || "KWD",
          source: "excel_import",
          reason: "Excel import base price insert",
        });
        summary.priceChanged += 1;
      }
    }
  }

  return summary;
}

export async function fetchPricesByProduct(productId?: string) {
  if (!supabaseConfigured()) return [] as Array<Record<string, unknown>>;

  let query = supabase
    .from("prices")
    .select(
      "id, product_id, price_type, customer_id, amount, currency, source, valid_from, valid_to, is_active",
    );
  if (productId) query = query.eq("product_id", productId);

  const { data, error } = await query.order("price_type", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertPrice(input: {
  product_id: string;
  price_type: PriceType;
  customer_id?: string | null;
  amount: number;
  currency?: string;
  source?: string;
  changed_by?: string | null;
  reason?: string;
}) {
  if (typeof window !== "undefined") {
    const response = await fetch("/api/supabase-write", {
      method: "POST",
      headers: await getAuthenticatedApiHeaders(),
      body: JSON.stringify({
        table: "prices",
        action: "upsert",
        payload: {
          product_id: input.product_id,
          price_type: input.price_type,
          customer_id: input.customer_id ?? null,
          amount: input.amount,
          currency: input.currency ?? "KWD",
          source: input.source ?? "manual",
          is_active: true,
          valid_from: new Date().toISOString(),
        },
        filters: [
          { column: "product_id", value: input.product_id },
          { column: "price_type", value: input.price_type },
          { column: "customer_id", value: input.customer_id ?? null },
        ],
        select:
          "id, product_id, price_type, customer_id, amount, currency, source, valid_from, valid_to, is_active",
      }),
    });
    const body = await response.json();
    if (!response.ok || body?.success === false)
      throw new Error(body?.error ?? "تعذر تحديث السعر.");
    return body.data;
  }

  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");

  let priceQuery = supabase
    .from("prices")
    .select("id, amount")
    .eq("product_id", input.product_id)
    .eq("price_type", input.price_type);

  if (input.customer_id === null || input.customer_id === undefined) {
    priceQuery = priceQuery.is("customer_id", null);
  } else {
    priceQuery = priceQuery.eq("customer_id", input.customer_id);
  }

  const { data: existing, error: findError } = await priceQuery.maybeSingle();

  if (findError) throw new Error(findError.message);

  let result: Record<string, unknown> | null = null;
  if (existing) {
    const { data, error } = await supabase
      .from("prices")
      .update({
        amount: input.amount,
        currency: input.currency ?? "KWD",
        source: input.source ?? "manual",
        valid_from: new Date().toISOString(),
        is_active: true,
      } as Database["public"]["Tables"]["prices"]["Update"])
      .eq("id", String(existing.id ?? ""))
      .select()
      .single();
    if (error) throw new Error(error.message);
    result = data;
  } else {
    const { data, error } = await supabase
      .from("prices")
      .insert({
        product_id: input.product_id,
        price_type: input.price_type,
        customer_id: input.customer_id ?? null,
        amount: input.amount,
        currency: input.currency ?? "KWD",
        source: input.source ?? "manual",
        is_active: true,
        valid_from: new Date().toISOString(),
      } as Database["public"]["Tables"]["prices"]["Insert"])
      .select()
      .single();
    if (error) throw new Error(error.message);
    result = data;
  }

  if (existing && existing.amount !== input.amount) {
    await supabase.from("price_history").insert({
      product_id: input.product_id,
      price_id: typeof result?.["id"] === "string" ? String(result["id"]) : null,
      customer_id: input.customer_id ?? null,
      price_type: input.price_type,
      old_amount: existing.amount,
      new_amount: input.amount,
      currency: "KWD",
      reason: input.reason ?? "manual update",
      changed_by: input.changed_by ?? null,
      changed_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["price_history"]["Insert"]);
  }

  if (!existing) {
    await supabase.from("price_history").insert({
      product_id: input.product_id,
      price_id: typeof result?.["id"] === "string" ? String(result["id"]) : null,
      customer_id: input.customer_id ?? null,
      price_type: input.price_type,
      old_amount: null,
      new_amount: input.amount,
      currency: "KWD",
      reason: input.reason ?? "initial insert",
      changed_by: input.changed_by ?? null,
      changed_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["price_history"]["Insert"]);
  }

  return result;
}

export async function fetchQuotes() {
  if (!supabaseConfigured()) return [] as Array<Record<string, unknown>>;

  const { data, error } = await supabase
    .from("quotations")
    .select(
      "id, reference, issue_date, expiry_date, price_type, discount_amount, tax_amount, total, status, customers(name, company)",
    )
    .order("issue_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createQuote(input: {
  customer_id: string;
  priceType: PriceType | "manual_quote";
  items: Array<{
    product_id: string;
    product_name: string;
    sku: string;
    quantity: number;
    unit: string;
    unit_price: number;
    discount_amount: number;
  }>;
  notes?: string;
  expiryDays?: number;
  reference?: string;
}) {
  if (!supabaseConfigured()) throw new Error("لم يتم تهيئة Supabase في بيئة المشروع.");

  const issueDate = new Date();
  const expiryDate = new Date(issueDate);
  expiryDate.setDate(expiryDate.getDate() + (input.expiryDays ?? 14));

  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const discountAmount = input.items.reduce((sum, item) => sum + item.discount_amount, 0);
  const taxAmount = 0;
  const total = subtotal - discountAmount + taxAmount;

  const { data: quote, error: quoteError } = await supabase
    .from("quotations")
    .insert({
      reference: input.reference ?? `Q-${Date.now()}`,
      customer_id: input.customer_id,
      issue_date: issueDate.toISOString().slice(0, 10),
      expiry_date: expiryDate.toISOString().slice(0, 10),
      price_type: input.priceType,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      subtotal,
      total,
      currency: "KWD",
      status: "draft",
      notes: input.notes ?? "",
    })
    .select()
    .single();

  if (quoteError) throw new Error(quoteError.message);

  const rows = input.items.map((item, index) => ({
    quotation_id: quote.id,
    product_id: item.product_id,
    line_no: index + 1,
    product_name: item.product_name,
    sku: item.sku,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    discount_amount: item.discount_amount,
    line_total: item.quantity * item.unit_price - item.discount_amount,
    applied_price_type: input.priceType as PriceType,
    is_manual_price: input.priceType === "manual_quote",
    notes: input.notes ?? "",
  }));

  const { error: itemError } = await supabase.from("quotation_items").insert(rows);
  if (itemError) throw new Error(itemError.message);

  return quote;
}
