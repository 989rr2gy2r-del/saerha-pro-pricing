import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/routes/new-order.tsx", import.meta.url), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract function: ${name}`);
}

function stripTypes(code) {
  return code
    .replace(/rawText:\s*string/g, "rawText")
    .replace(/catalogSkus\?:\s*Set<string>/g, "catalogSkus")
    .replace(/text:\s*string/g, "text")
    .replace(/value:\s*string/g, "value")
    .replace(/value:\s*number/g, "value")
    .replace(/: Array<\[RegExp, string\]>/g, "")
    .replace(/:\s*number\s*\|\s*null/g, "");
}

const normalizeQuantity = new Function(
  `${stripTypes(extractFunction("normalizeQuantity"))}; return normalizeQuantity;`,
)();
const normalizeUnitValue = new Function(
  `${stripTypes(extractFunction("normalizeUnitValue"))}; return normalizeUnitValue;`,
)();
const extractOrderSignals = new Function(
  `${stripTypes(extractFunction("extractOrderSignals"))}; return extractOrderSignals;`,
)();
const parseTextOrderFallback = new Function(
  "normalizeUnitValue",
  "normalizeQuantity",
  `${stripTypes(extractFunction("parseTextOrderFallback"))}; return parseTextOrderFallback;`,
)(normalizeUnitValue, normalizeQuantity);

const whatsappOrder = `1. PVC Circular Socket Box – 15 pcs
2. PVC Solution Glue – 500 ml
3. Four-Way Switch – 5 pcs
4. 20A Round-Pin Power Socket / Switch – 3 pcs
5. SDB Board – 12 pcs
6. Single-Pole MCB – 10A – 4 pcs
7. Single-Pole MCB – 20A – 3 pcs
8. Multi Power Socket – 15A – 7 pcs
9. RCCB Breaker – 4-Pole, 63A – 1 pc
10. Electrical Tape – 12 pcs
11. PVC Small Electrical Connector – 5A – 30 pcs
12. Main Power Cable – 4 × 10 mm² – 30 meters
13. 1.5 mm² Cable – Red – 2 coils
14. 1.5 mm² Cable – Black – 2 coils
15. 1.5 mm² Cable – Green (Earth) – 1 coil
16. 2.5 mm² Cable – Red – 1 coil
17. 2.5 mm² Cable – Black – 1 coil
18. 4 mm² Cable – Red – 1 coil
19. 4 mm² Cable – Black – 1 coil
20. PVC Circular Box – 4 Gang – 15 pcs
21. PVC Circular Box – 2 Gang – 10 pcs
22. Steel Switch / Power Socket Box – 1 Gang – 16pcs
23. PVC Pipe – 5/8 inch or 3/4 inch – 20
24. Pvc band 5/8inch 15 pcs
25. pvc choket 5/8 inch 1pcs`;

const expectedQuantities = [15,500,5,3,12,4,3,7,1,12,30,30,2,2,1,1,1,1,1,15,10,16,20,15,1];
const expectedUnits = ["حبة","مل","حبة","حبة","حبة","حبة","حبة","حبة","حبة","حبة","حبة","متر","رول","رول","رول","رول","رول","رول","رول","حبة","حبة","حبة","","حبة","حبة"];

const parsed = await parseTextOrderFallback(whatsappOrder);
assert.equal(parsed.items.length, 25, "WhatsApp order must preserve all 25 rows");
assert.deepEqual(parsed.items.map((item) => item.quantity), expectedQuantities);
assert.deepEqual(parsed.items.map((item) => item.unit), expectedUnits);
assert.ok(parsed.items.every((item) => !/^\d+[.)\-:]/.test(item.description)), "line numbers must not leak into descriptions");

const handwrittenOcrLines = [
  ["PVC pipe Adsany - 20mm - 1 Roll", 1, "رول"],
  ["PVC Capling - 20mm - 100 pcs", 100, "حبة"],
  ["PVC Melbus - 20mm - 50 pcs", 50, "حبة"],
  ["PVC Double Melbus 20mm - 3 dozen", 3, "دزينة"],
  ["petan - 2", 2, ""],
];
for (const [line, quantity, unit] of handwrittenOcrLines) {
  const signal = extractOrderSignals(line, new Set());
  assert.equal(signal.quantity, quantity, `quantity regression: ${line}`);
  assert.equal(signal.unit, unit, `unit regression: ${line}`);
}

assert.equal(normalizeUnitValue("coil"), "رول");
assert.equal(normalizeUnitValue("dozen"), "دزينة");

console.log("order-input regression: PASS");
console.log(`validated pasted rows: ${parsed.items.length}`);
console.log("validated handwritten/OCR quantity cases: 5");
