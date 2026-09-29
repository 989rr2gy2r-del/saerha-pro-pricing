import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = fs.readFileSync(new URL("../src/lib/order/order-line-parser.ts", import.meta.url), "utf8");
const ts = await import("typescript");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const tempFile = path.join(new URL(".", import.meta.url).pathname, ".order-line-parser.generated.mjs");
fs.writeFileSync(tempFile, transpiled, "utf8");

try {
  const { extractOrderLineSignals, reconcileOrderLineEvidence } = await import(pathToFileURL(tempFile).href + "?regression=1");
  const catalogSkus = new Set(["1200", "2200", "3222", "3202", "0765", "07251"]);

  const cases = [
    ["1 1200 بايب عدساني 3/4 20 مم 2 ROLL 12.600 25.200", 2, "رول", "1200"],
    ["2 2200 سوكت عدساني 3/4 20 مم 1 PKT 4.100 4.100", 1, "باكيت", "2200"],
    ["9 0765 واير الخليج اخضر مقاس 6مل 4 ROLL 0.350 1.400", 4, "رول", "0765"],
    ["واير الخليج احمر 6مل 4 رول", 4, "رول", ""],
    ["PVC Solution Glue 500 ml - 2 pcs", 2, "حبة", ""],
    ["Main cable 4 x 10 mm2 - 30 meters", 30, "متر", ""],
    ["واير الخليج احمر 2.5مل 4 متر", 4, "متر", ""],
    ["واير الخليج احمر 2.5مل", null, "", ""],
  ];

  for (const [line, quantity, unit, sku] of cases) {
    const signals = extractOrderLineSignals(line, catalogSkus);
    assert.equal(signals.quantity, quantity, "quantity: " + line);
    assert.equal(signals.unit, unit, "unit: " + line);
    assert.equal(signals.sku, sku, "sku: " + line);
  }

  const reconciled = reconcileOrderLineEvidence(
    "واير الخليج احمر 2.5مل 4 رول",
    7,
    "رول",
    catalogSkus,
  );
  assert.equal(reconciled.quantity, 4, "source line quantity must beat AI quantity");
  assert.equal(reconciled.unit, "رول", "source line unit must beat AI unit");
  assert.equal(reconciled.quantitySource, "source_text");
  assert.ok(reconciled.issues.some((issue) => issue.includes("لا تطابق")), "quantity conflict must be audited");

  const spanLine = "واير الخليج احمر 2.5مل 4 رول";
  const spanSignals = extractOrderLineSignals(spanLine, catalogSkus);
  assert.equal(spanSignals.quantitySpan?.raw, "4");
  assert.equal(spanSignals.unitSpan?.raw, "رول");

  const ambiguousCommercial = extractOrderLineSignals("صنف 2 رول 3 متر", catalogSkus);
  assert.equal(ambiguousCommercial.quantity, null, "multiple commercial quantity pairs must not be guessed");

  console.log("order-line parser regression: PASS");
  console.log("validated commercial-vs-technical quantity separation and source SKU detection");
} finally {
  fs.rmSync(tempFile, { force: true });
}
