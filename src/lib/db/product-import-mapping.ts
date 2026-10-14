import type { ProductImportRow } from "@/lib/db/saerha-data";

function readValue(row: Record<string, unknown>, ...fields: string[]): unknown {
  for (const field of fields) {
    const value = row[field];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function optionalPrice(value: unknown): number | string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" ? value : String(value);
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function mapProductImportRows(rows: Record<string, unknown>[]): ProductImportRow[] {
  return rows
    .map((row): ProductImportRow => ({
      sku: String(readValue(row, "sku", "SKU", "كود الصنف", "Code", "sku_code")),
      nameAr: String(
        readValue(
          row,
          "name_ar",
          "nameAr",
          "Arabic Name",
          "الاسم العربي",
          "اسم عربي",
          "arabic_name",
        ),
      ),
      nameEn: String(
        readValue(
          row,
          "name_en",
          "nameEn",
          "English Name",
          "الاسم الإنجليزي",
          "اسم انجليزي",
          "english_name",
        ),
      ),
      shortName: String(readValue(row, "short_name", "shortName", "اسم مختصر", "الاسم المختصر")),
      brand: String(readValue(row, "brand", "Brand", "الماركة", "brand_name")),
      category1: String(
        readValue(
          row,
          "category_main",
          "category1",
          "Category EN",
          "Category AR",
          "التصنيف الرئيسي",
          "main_category",
        ),
      ),
      category2: String(
        readValue(
          row,
          "category_sub",
          "category2",
          "Subcategory EN",
          "Subcategory AR",
          "التصنيف الفرعي",
          "sub_category",
        ),
      ),
      category3: String(
        readValue(row, "category_third", "category3", "التصنيف الثالث", "third_category"),
      ),
      group: String(readValue(row, "product_group", "group", "المجموعة", "group_name")),
      model: String(readValue(row, "model", "الموديل", "model_name")),
      size: String(readValue(row, "size", "المقاس", "size_name")),
      color: String(readValue(row, "color", "اللون", "color_name")),
      unit: String(readValue(row, "unit", "UoM", "الوحدة", "unit_name") || "حبة"),
      description: String(readValue(row, "description", "الوصف", "description_text")),
      status:
        String(readValue(row, "status") || "active").toLowerCase() === "inactive"
          ? "inactive"
          : "active",
      retailPrice: optionalPrice(
        readValue(row, "retail_price", "سعر التجزئة", "Retail Price", "retail"),
      ),
      resellerPrice: optionalPrice(
        readValue(
          row,
          "reseller_price",
          "سعر الموزع",
          "Reseller Price",
          "Wholesale Price",
          "reseller",
        ),
      ),
      customerSpecialPrice: optionalPrice(
        readValue(
          row,
          "customer_special_price",
          "سعر خاص",
          "Customer Special Price",
          "special_price",
        ),
      ),
      customerName: optionalString(readValue(row, "customer_name", "اسم العميل", "Customer Name")),
      currency: String(readValue(row, "currency", "Currency", "العملة") || "KWD"),
    }))
    .filter((row) => row.sku || row.nameAr || row.nameEn);
}
