import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/routes/products.tsx", "utf8");
const data = readFileSync("src/lib/db/saerha-data.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261029120000_product_import_carton_count.sql",
  "utf8",
);

// Import must map against the original Excel headers, not already-normalized objects.
assert.match(route, /const rawRows = XLSX\.utils\.sheet_to_json/);
assert.match(route, /setPreviewRows\(rawRows\)/);
assert.match(route, /const mapping = defaultColumnMap\(headers\)/);
assert.match(route, /const value = row\[columnMap\[field\] \?\? ""\]/);

// Large-unit piece count and conversion factor are different import fields.
assert.match(route, /cartonCount: find\("carton_count", "cartoncount", "عدد قطع الكبرى", "عدد قطع الكبرى المصدر"\)/);
assert.match(route, /unitsPerPrimary: find\("units_per_primary", "unitsperprimary", "units_per_unit", "عدد الوحدات في الوحدة الكبرى"\)/);
assert.doesNotMatch(route, /unitsPerPrimary: find\([^\n]*عدد قطع الكبرى/);

// Both secondary price columns must map to their respective fields.
assert.match(route, /secondaryRetailPrice: find\([^\n]*بيع\/ص المصدر/);
assert.match(route, /secondaryResellerPrice: find\([^\n]*بيع\/ك المصدر/);

// The field must travel through TypeScript payload and SQL insert/update.
assert.match(data, /cartonCount\?: number \| string \| null/);
assert.match(data, /cartonCount: normalizePrice\(row\.cartonCount\)/);
assert.match(migration, /carton_count/);

console.log("Excel import mapping regression checks passed.");
