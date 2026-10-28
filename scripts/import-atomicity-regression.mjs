import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importer = readFileSync("src/lib/db/saerha-data.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261028190000_atomic_product_price_unit_import.sql",
  "utf8",
);
const start = importer.indexOf("export async function importProductsAndPrices(");
const end = importer.indexOf("\nexport async function fetchPricesByProduct", start);
assert.ok(start >= 0 && end > start, "import function boundaries exist");
const importFunction = importer.slice(start, end);

assert.match(importFunction, /supabase\.rpc\("saerha_import_products_atomic"/);
assert.doesNotMatch(
  importFunction,
  /supabase\.from\("(products|prices|unit_conversions)"\)/,
  "importer must not issue multi-step table writes outside the transaction",
);
assert.match(migration, /security invoker/i, "RPC must honor caller privileges and RLS");
assert.match(migration, /auth\.uid\(\) is null or not public\.is_staff\(auth\.uid\(\)\)/i);
assert.match(migration, /update public\.prices/i, "retire old imported prices without DELETE");
assert.doesNotMatch(migration, /delete\s+from\s+public\.prices/i, "staff import must not depend on admin-only price DELETE");
assert.match(migration, /delete from public\.unit_conversions[\s\S]*notes like 'Excel import:%'/i);
assert.match(migration, /unitsPerPrimary must be greater than zero/i);
assert.match(importFunction, /secondaryRetailPrice/);
assert.match(importFunction, /secondaryResellerPrice/);
assert.match(importFunction, /unitsPerPrimary/);
console.log("Atomic import regression checks passed (static contract checks; not a live database integration test).");
