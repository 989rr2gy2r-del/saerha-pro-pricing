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
  const catalogSkus = new Set(["1200", "2200", "3222", "3202", "0765", "07251", "845451", "830301", "3802", "4380", "825301", "83001", "84631", "82431", "220250", "82031", "22022", "23349", "4005"]);

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

  const uploadedOrderCodeCases = [
    ["1 845451 صندوق GAL 10*45*45سم الجسار 40-101-115 3 PCS 9.100 27.300", "845451"],
    ["2 830301 صندوق تلفون 10*30*30سم - الجسار 40-505-116 5 PCS 6.400 32.000", "830301"],
    ["3 3802 ملبوش 15 قش 38 مم 1 PKT 3000 3.000", "3802"],
    ["4 4380 كوع عدساني 1.5 انش 38 مم 2 PCS 0.400 8.000", "4380"],
    ["5 825301 كيوبكل 30 واي 3 فيز BZ - الجسار 1 PCS 560.700 560.700", "825301"],
    ["6 83001 خزانة كتاوت 300 امبير مطري - الجسار 1 PCS 118.400 118.400", "83001"],
    ["7 84631 لوحة توزيع 4*6 / 10 واي 3 فيز - الجسار 3 PCS 48.300 144.900", "84631"],
    ["8 82431 لوحة توزيع 2*4 / 6 واي 3 فيز - الجسار 3 PCS 48.300 144.900", "82431"],
    ["9 0765 واير الخليج اخضر مقاس 6مل 4 ROLL 30330 121.320", "0765"],
    ["10 220250 كوع 3/4 مم اسود 30 PCS 0.200 6.000", "220250"],
    ["11 82031 صندوق انذار صوتي ومرئي مع محول - الجسار 1 PCS 36.750 36.750", "82031"],
    ["12 22022 ارث كفر تيب المتر 20 MIR 3000 60.000", "22022"],
    ["13 23349 ترنكي حديد 4 انش 1 PCS 4.000 4.000", "23349"],
    ["14 2200 سوكت عدساني 3/4 ثلاثة ارباع 20 مم 1 PKT 4.100 4.100", "2200"],
    ["15 4005 سيم خفيف 21 2 ROLL 2 4.100 4.100", "4005"],
  ];
  for (const [line, expectedSku] of uploadedOrderCodeCases) {
    assert.equal(extractOrderLineSignals(line, catalogSkus).sku, expectedSku, "uploaded order SKU: " + line);
  }

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
