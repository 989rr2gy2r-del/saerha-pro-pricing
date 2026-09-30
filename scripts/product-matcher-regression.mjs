import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = fs.readFileSync(new URL("../src/lib/matching/product-matcher.ts", import.meta.url), "utf8");
const ts = await import("typescript");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const tempFile = path.join(new URL(".", import.meta.url).pathname, ".product-matcher-regression.generated.mjs");
fs.writeFileSync(tempFile, transpiled, "utf8");
try {
  const matcher = await import(pathToFileURL(tempFile).href + "?regression=1");
  const { rankProductMatches, extractMatchConstraints, candidateMatchesConstraints, findLocalProductMatch, findProductBySku, findProductByNormalizedName, resolveProductByNormalizedNameCandidates, resolveProductBySkuCandidates, findUniqueTechnicalProduct } = matcher;

const products = [
  ["0761", "واير الخليج احمر مقاس 6مل", "WAIR GULF RED SAIZ 6 ML"],
  ["0762", "واير الخليج اصفر مقاس 6مل", "WAIR GULF YELLOW SAIZ 6 ML"],
  ["0763", "واير الخليج ازرق مقاس 6مل", "WAIR GULF BLUE SAIZ 6 ML"],
  ["0764", "واير الخليج اسود مقاس 6مل", "WAIR GULF BLACK SAIZ 6 ML"],
  ["0765", "واير الخليج اخضر مقاس 6مل", "WAIR GULF GREEN SAIZ 6 ML"],
  ["07101", "واير الخليج احمر مقاس 10مل", "WAIR GULF RED SAIZ 10 ML"],
  ["07161", "واير الخليج احمر مقاس 16مل", "WAIR GULF RED SAIZ 16 ML"],
  ["07155", "واير الخليج اخضر مقاس 1.5مل", "WAIR GULF GREEN SAIZ 1.5 ML"],
  ["0736", "واير الخليج 3كور 6مل", "WAIR GULF 3 COR 6 ML"],
  ["07446", "واير الخليج 4كور 6مل", "WAIR GULF 4 COR 6 ML"],
  ["07251", "واير الخليج احمر مقاس 2.5مل", "WAIR GULF RED SAIZ 2.5 ML"],
  ["072512", "واير الخليج احمر مقاس 2.5مل متر", "WAIR GULF RED SAIZ 2.5 ML METER"],
  ["22080", "طلقات ديكور", "DECOR SHOTS"],
  ["22099", "مسمار طلقات ديكور", "SCREW TLQAT DYKWR"],
].map(([sku, name_ar, name_en]) => ({
  id: sku,
  sku,
  name_ar,
  name_en,
  short_name: null,
  brand: "الخليج",
  category_main: "كهرباء",
  category_sub: "واير",
  category_third: null,
  product_group: "واير الخليج",
  model: null,
  size: null,
  color: null,
  unit: sku === "07251" ? "لف" : "متر",
  description: null,
}));

assert.equal(findProductByNormalizedName("مسمار طلقات", products)?.sku, "22099", "a specific catalog-name prefix must resolve when it maps to one product");
assert.equal(findProductByNormalizedName("طلقات ديكور", products)?.sku, "22080", "exact normalized Arabic name must resolve the catalog product");
assert.equal(
  findUniqueTechnicalProduct("واير سلك كهرباء اخضر 1.5 مم",
    products,
  )?.sku,
  "07155",
  "unique color/size wire constraints must resolve the single catalog product",
);

assert.equal(
  findProductByNormalizedName("16 0 طلقات ديكور 2 7 1750 ميد", products)?.sku,
  "22080",
  "exact catalog name embedded in noisy OCR must resolve without fuzzy guessing",
);
const nameResolution = resolveProductByNormalizedNameCandidates(
  ["طقات ديكور", "طلقات ديكور"],
  products,
);
assert.equal(nameResolution.product?.sku, "22080", "one exact normalized name candidate must resolve");
assert.equal(nameResolution.conflict, false, "same normalized name candidate must not conflict");

assert.equal(findProductBySku("0765", products)?.sku, "0765", "exact SKU resolver must return the catalog product");
const skuResolution = resolveProductBySkuCandidates(["", " 0765 ", "0765"], products);
assert.equal(skuResolution.product?.sku, "0765", "resolver must use any valid SKU candidate");
assert.equal(skuResolution.conflict, false, "same SKU candidates must not conflict");
assert.equal(resolveProductBySkuCandidates(["0765", "999999"], products).product?.sku, "0765", "unknown secondary SKU must not erase a valid catalog SKU");

assert.equal(findProductBySku(" 0765 ", products)?.name_ar, "واير الخليج اخضر مقاس 6مل", "SKU resolver must tolerate surrounding whitespace");
assert.equal(findProductBySku("999999", products), null, "unknown SKU must not invent a product");

const aliases = [];

function match(query) {
  return rankProductMatches(query, products, aliases, (product) => product.id, 8);
}

for (const [query, expectedSku, expectedColor] of [
  ["واير الخليج احمر 6مل", "0761", "احمر"],
  ["واير الخليج اصفر 6مل", "0762", "اصفر"],
  ["واير الخليج ازرق 6مل", "0763", "ازرق"],
  ["واير الخليج اسود 6مل", "0764", "اسود"],
]) {
  const constraints = extractMatchConstraints(query);
  assert.deepEqual(constraints.colors, [expectedColor], query + " must extract its color");
  assert.deepEqual(constraints.metricSizes, ["6"], query + " must extract 6mm");
  assert.equal(candidateMatchesConstraints("واير الخليج " + expectedColor + " مقاس 6مل", constraints), true, query + " must pass its technical constraints");
  const candidates = match(query);
  assert.equal(candidates.length, 1, query + " must have one technical candidate");
  assert.equal(candidates[0].product.sku, expectedSku, query + " must resolve to the exact color/size SKU");
}

assert.equal(match("واير الخليج احمر 6مل").some((candidate) => candidate.product.sku === "07101"), false, "6mm red must reject 10mm red");
assert.equal(match("واير الخليج احمر 6مل").some((candidate) => candidate.product.sku === "07161"), false, "6mm red must reject 16mm red");
assert.equal(match("واير الخليج 3كور 6مل").some((candidate) => candidate.product.sku === "07446"), false, "3-core must reject 4-core");
assert.equal(match("واير الخليج 4كور 6مل").some((candidate) => candidate.product.sku === "0736"), false, "4-core must reject 3-core");


const resolverProducts = products.map((product) => ({
  ...product,
  id: product.sku,
}));

const resolvedGreenRoll = findLocalProductMatch(
  "9 0765 واير الخليج اخضر مقاس 6مل 4 ROLL",
  resolverProducts,
  "",
  {},
);
assert.equal(resolvedGreenRoll.product, null, "6mm wire requested as roll must not auto-select a meter-base product");
assert.equal(resolvedGreenRoll.status, "NEEDS_REVIEW", "commercial unit mismatch must force review");

const resolvedGreenMeter = findLocalProductMatch(
  "0765 واير الخليج اخضر مقاس 6مل 4 متر",
  resolverProducts,
  "",
  {},
);
assert.equal(resolvedGreenMeter.product?.sku, "0765", "6mm green meter request must resolve to the exact SKU");
assert.equal(resolvedGreenMeter.status, "HIGH_CONFIDENCE", "exact technical match with matching unit must auto-confirm");


const redRoll = findLocalProductMatch(
  "واير الخليج احمر 2.5مل 4 رول",
  resolverProducts,
  "",
  {},
);
assert.equal(redRoll.product?.sku, "07251", "2.5mm red roll must prefer the roll SKU over the meter variant");

const redMeter = findLocalProductMatch(
  "واير الخليج احمر 2.5مل 4 متر",
  resolverProducts,
  "",
  {},
);
assert.equal(redMeter.product?.sku, "072512", "2.5mm red meter must resolve to the meter SKU");

console.log("resolver safety regression: PASS");

  const duplicateProducts = [
  ...products,
  {
    ...products.find((product) => product.sku === "0761"),
    id: "0761-DUP",
    sku: "0761-DUP",
  },
];
const duplicateResult = findLocalProductMatch(
  `${products.find((product) => product.sku === "0761")?.name_ar ?? "واير الخليج احمر مقاس 6مل"} متر`,
  duplicateProducts,
  "",
  {},
);
assert.equal(duplicateResult?.product, null, "duplicate exact catalog evidence must remain for review");
assert.equal(duplicateResult?.status, "NEEDS_REVIEW", "duplicate exact catalog evidence must not auto-select");

console.log("product-matcher regression: PASS");
  console.log("validated exact 6mm color matches: red/yellow/blue/black");
  console.log("validated technical conflicts: 6/10/16mm and 3/4-core");
} finally {
  fs.rmSync(tempFile, { force: true });
}
