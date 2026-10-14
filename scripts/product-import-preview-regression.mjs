import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";

const workbookPath = new URL("../سعّرها_استيراد_المنتجات_285_جاهز.xlsx", import.meta.url);
const workbook = XLSX.read(fs.readFileSync(workbookPath), { type: "buffer" });
const sheetName = workbook.SheetNames[0];
assert.ok(sheetName, "workbook must contain a sheet");

const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
assert.equal(rows.length, 285, "workbook must contain all 285 product rows");

const source = fs.readFileSync(
  new URL("../src/lib/db/product-import-mapping.ts", import.meta.url),
  "utf8",
);
const ts = await import("typescript");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const { mapProductImportRows } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled, "utf8").toString("base64")}`
);

const products = mapProductImportRows(rows);
assert.equal(products.length, 285, "all workbook rows must map to importable products");
assert.equal(new Set(products.map((product) => product.sku)).size, 285, "SKUs must be unique");
assert.ok(
  products.every((product) => product.sku && product.nameAr && product.nameEn),
  "every row must include SKU and both product names",
);
assert.equal(products[0].retailPrice, 1, "retail price must map from the workbook");
assert.equal(products[0].category1, "Electrical Enclosures");
assert.equal(products[0].category2, "AC Boxes");
assert.equal(products[0].unit, "غير محدد");
assert.equal(products[0].currency, "KWD", "currency must map from the workbook");
assert.equal(
  products.filter((product) => product.retailPrice !== null).length,
  167,
  "all populated retail prices must map",
);
assert.equal(
  products.filter((product) => product.resellerPrice !== null).length,
  41,
  "all populated wholesale prices must map to reseller prices",
);

console.log("product import preview regression: PASS");
console.log(`validated products without database writes: ${products.length}`);
