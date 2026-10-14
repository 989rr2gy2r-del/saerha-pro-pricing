import { describe, expect, it } from "vitest";

import { ProductMatcher } from "./product-matcher";

const products = [
  {
    id: "p-001",
    sku: "ABC-1001",
    name_ar: "مفك براغي 10 مم",
    name_en: "Phillips Screwdriver 10mm",
    short_name: "مفك براغي",
    brand: "AL-AWAB",
    category_main: "أدوات يدوية",
    category_sub: "إصلاح",
    model: "PH-10",
    size: "10 مم",
    unit: "حبة",
    description: "أداة تشحيم ومفك براغي",
  },
  {
    id: "p-002",
    sku: "RGB-2205",
    name_ar: "سلك كهربائي أحمر 2.5 مم",
    name_en: "Red Electric Wire 2.5mm",
    short_name: "سلك أحمر",
    brand: "AL-AWAB",
    category_main: "كهرباء",
    category_sub: "أسلاك",
    model: "RW-25",
    size: "2.5 مم",
    unit: "متر",
    description: "سلك كهربائي أحمر",
  },
  {
    id: "p-003",
    sku: "TUB-5004",
    name_ar: "مواسير PVC 1 بوصة",
    name_en: "PVC Pipe 1 Inch",
    short_name: "مواسير PVC",
    brand: "AL-AWAB",
    category_main: "سباكة",
    category_sub: "مواسير",
    model: "PVC-1",
    size: "1 بوصة",
    unit: "متر",
    description: "مواسير PVC",
  },
  {
    id: "p-004",
    sku: "HND-9912",
    name_ar: "دباسة ورق صغيرة",
    name_en: "Stapler Small",
    short_name: "دباسة",
    brand: "OfficePro",
    category_main: "مكاتب",
    category_sub: "لوازم مكتبية",
    model: "ST-12",
    size: "صغير",
    unit: "حبة",
    description: "أداة لربط الأوراق",
  },
];

describe("ProductMatcher", () => {
  const matcher = new ProductMatcher(products);

  it("matches exact SKU", () => {
    const result = matcher.match({ raw_text: "ABC-1001", quantity: 2, unit: "حبة" });
    expect(result.status).toBe("matched");
    expect(result.sku).toBe("ABC-1001");
  });

  it("matches Arabic name", () => {
    const result = matcher.match({ raw_text: "مفك براغي 10 مم", quantity: 1, unit: "حبة" });
    expect(result.status).toBe("matched");
    expect(result.product_name).toBe("مفك براغي 10 مم");
  });

  it("matches English name", () => {
    const result = matcher.match({ raw_text: "Phillips Screwdriver 10mm", quantity: 1, unit: "حبة" });
    expect(result.status).toBe("matched");
    expect(result.product_name).toContain("Phillips");
  });

  it("handles spelling mistake and abbreviation", () => {
    const result = matcher.match({ raw_text: "سلك كهراء احمر 2.5 مم", quantity: 5, unit: "متر" });
    expect(result.status).not.toBe("unmatched");
    expect(result.brand ?? "AL-AWAB").toBeTruthy();
  });

  it("matches abbreviation variants", () => {
    const result = matcher.match({ raw_text: "R wire 2.5mm", quantity: 2, unit: "متر" });
    expect(result.status).not.toBe("unmatched");
  });

  it("returns unmatched for impossible text", () => {
    const result = matcher.match({ raw_text: "منتج غير موجود في المخزون deltasignal xyz", quantity: 1, unit: "حبة" });
    expect(result.status).toBe("unmatched");
  });

  it("returns review for ambiguous match", () => {
    const result = matcher.match({ raw_text: "سلك", quantity: 1, unit: "متر" });
    expect(["review", "unmatched"]).toContain(result.status);
  });

  it("extracts quantity and unit correctly", () => {
    const result = matcher.match({ raw_text: "مفك براغي 10 مم × 5", quantity: 0, unit: "" });
    expect(result.quantity).toBe(5);
    expect(result.unit).toBe("حبة");
  });

  it("does not invent a SKU or price", () => {
    const result = matcher.match({ raw_text: "مفك براغي 10 مم", quantity: 1, unit: "حبة" });
    expect(result.sku).toBe("ABC-1001");
    expect(result.product_name).not.toContain("PRICE");
  });
});
