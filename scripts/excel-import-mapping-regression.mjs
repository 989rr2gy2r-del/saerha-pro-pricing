import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/routes/products.tsx", "utf8");
const data = readFileSync("src/lib/db/saerha-data.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261029120000_product_import_carton_count.sql",
  "utf8",
);
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

// Verify the template has 23 headers and exactly one example cell per header.
const templateBlock = route.match(/const headers = \[([\s\S]*?)\];\s*const example = \[([\s\S]*?)\];/);
assert.ok(templateBlock, "Excel template headers/example block must exist");
const headers = [...templateBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const exampleSource = templateBlock[2];
const exampleCells = exampleSource.split(",").length;
assert.equal(headers.length, 23, "Template must contain exactly the known 23 columns");
assert.equal(exampleCells, headers.length, "Every template header must have exactly one example cell");

// Assert the fields with high-risk similar names map to their own headers.
const expected = {
  sku: ["sku"],
  nameAr: ["name_ar"],
  nameEn: ["name_en"],
  retailPrice: ["retail_price"],
  resellerPrice: ["reseller_price"],
  secondaryUnit: ["secondary_unit"],
  unitsPerPrimary: ["units_per_primary"],
  secondaryRetailPrice: ["secondary_retail_price"],
  secondaryResellerPrice: ["secondary_reseller_price"],
  cartonCount: ["carton_count"],
  currency: ["currency"],
  status: ["status"],
};
for (const [field, aliases] of Object.entries(expected)) {
  const line = route.split("\n").find((candidate) => new RegExp("^\\s*" + field + ": find\\(").test(candidate));
  assert.ok(line, `Missing mapping for ${field}`);
  for (const alias of aliases) assert.ok(line.includes(alias), `Mapping ${field} missing alias ${alias}`);
}

// A template header must not map to multiple fields through identical aliases.
const mappingLines = route.split("\n").filter((line) => /^\s*[A-Za-z]+: find\(/.test(line));
for (const header of headers) {
  const normalized = header.toLowerCase().replace(/[\s_.\\-/：:]/g, "");
  const matches = mappingLines.filter((line) =>
    [...line.matchAll(/"([^"]+)"/g)].some((m) =>
      m[1].toLowerCase().replace(/[\s_.\\-/：:]/g, "") === normalized,
    ),
  );
  assert.ok(matches.length <= 1, `Template header "${header}" maps to multiple fields`);
}

// Keep raw headers for row lookup; don't read values by already-normalized keys.
assert.match(route, /const rawRows = XLSX\.utils\.sheet_to_json/);
assert.match(route, /setPreviewRows\(rawRows\)/);
assert.match(route, /const mapping = defaultColumnMap\(headers\)/);
assert.match(route, /const value = row\[columnMap\[field\] \?\? ""\]/);

// Keep carton count distinct from conversion factor and in sync with generated schema.
assert.match(route, /cartonCount: find\("carton_count", "cartoncount", "عدد قطع الكبرى", "عدد قطع الكبرى المصدر"\)/);
assert.match(route, /unitsPerPrimary: find\("units_per_primary", "unitsperprimary", "units_per_unit", "عدد الوحدات في الوحدة الكبرى"\)/);
assert.doesNotMatch(route, /unitsPerPrimary: find\([^\n]*عدد قطع الكبرى/);
assert.match(data, /cartonCount\?: number \| string \| null/);
assert.match(data, /cartonCount: normalizePrice\(row\.cartonCount\)/);
assert.match(migration, /carton_count/);
assert.match(types, /carton_count: number \| null/);
assert.match(types, /carton_count\?: number \| null/);

// Blank price cells must preserve old prices; each supplied price is independent.
assert.match(migration, /Blank cells mean "not provided"/);
for (const field of ["retailPrice", "resellerPrice", "secondaryRetailPrice", "secondaryResellerPrice"]) {
  assert.ok(migration.includes("v_row->>'" + field + "'"), `Migration missing ${field}`);
}
assert.match(migration, /if nullif\(trim\(coalesce\(v_row->>'secondaryUnit'/);

console.log("Excel import safety regression checks passed.");
