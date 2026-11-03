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
  const { rankProductMatches, diagnoseLocalProductMatch, extractMatchConstraints, candidateMatchesConstraints, findLocalProductMatch, findProductBySku, findProductByNormalizedName, resolveProductByNormalizedNameCandidates, resolveProductBySkuCandidates, findUniqueTechnicalProduct } = matcher;

const products = [
  ["0761", "واير الخليج احمر مقاس 6مل", "WAIR GULF RED SAIZ 6 ML"],
  ["0762", "واير الخليج اصفر مقاس 6مل", "WAIR GULF YELLOW SAIZ 6 ML"],
  ["0763", "واير الخليج ازرق مقاس 6مل", "WAIR GULF BLUE SAIZ 6 ML"],
  ["0764", "واير الخليج اسود مقاس 6مل", "WAIR GULF BLACK SAIZ 6 ML"],
  ["0765", "واير الخليج اخضر مقاس 6مل", "WAIR GULF GREEN SAIZ 6 ML"],
  ["07101", "واير الخليج احمر مقاس 10مل", "WAIR GULF RED SAIZ 10 ML"],
  ["07161", "واير الخليج احمر مقاس 16مل", "WAIR GULF RED SAIZ 16 ML"],
  ["07151", "واير سنجل كور 1.5 مم خليجي احمر", "WIRE SINGLE CORE 1.5 MM GULF RED"],
  ["07154", "واير سنجل كور 1.5 مم خليجي اسود", "WIRE SINGLE CORE 1.5 MM GULF BLACK"],
  ["07155", "واير سنجل كور 1.5 مم خليجي اخضر", "WIRE SINGLE CORE 1.5 MM GULF GREEN"],
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
  unit: sku.startsWith("0715") || sku === "07251" ? "رول" : "متر",
  description: null,
}));

assert.equal(findProductByNormalizedName("مسمار طلقات", products)?.sku, "22099", "a specific catalog-name prefix must resolve when it maps to one product");
assert.equal(
  findUniqueTechnicalProduct("واير سلك كهرباء اخضر 1.5 مم",
    products,
  )?.sku,
  "07155",
  "unique color/size wire constraints must resolve the single catalog product",
);

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

// Market-category regressions based on real catalog wording visible in order review.
const electricalProducts = [
  { id: "B10", sku: "B10", name_ar: "بريكر ابيض 10 امبير سنجل", name_en: "WHITE BREAKER 10 AMP SINGLE", unit: "PCS" },
  { id: "B16", sku: "B16", name_ar: "بريكر ابيض 16 امبير سنجل", name_en: "WHITE BREAKER 16 AMP SINGLE", unit: "PCS" },
  { id: "I16", sku: "I16", name_ar: "ايزوليتر 16 امبير هاجر", name_en: "ISOLATOR 16 AMP HAGER", unit: "PCS" },
  { id: "I20", sku: "I20", name_ar: "ايزوليتر 20 امبير", name_en: "ISOLATOR 20 AMP", unit: "PCS" },
  { id: "I32", sku: "I32", name_ar: "ايزوليتر 32 امبير سنجل", name_en: "ISOLATOR 32 AMP SINGLE", unit: "PCS" },
  { id: "I40", sku: "I40", name_ar: "ايزوليتر 40 امبير", name_en: "ISOLATOR 40 AMP", unit: "PCS" },
  { id: "P13", sku: "P13", name_ar: "بلاك 13 امبير", name_en: "13 AMP PLUG", unit: "PIC" },
  { id: "P15", sku: "P15", name_ar: "بلاك 15 امبير", name_en: "15 AMP PLUG", unit: "PIC" },
];

const breakerConstraints = extractMatchConstraints("بريكر 10 امبير");
assert.equal(breakerConstraints.productClass, "mcb", "Arabic breaker must be classified as MCB");
assert.deepEqual(breakerConstraints.amps, ["10"], "Arabic amp rating must be extracted");
assert.equal(
  candidateMatchesConstraints("بريكر ابيض 10 امبير سنجل", breakerConstraints),
  true,
  "Arabic breaker candidate with matching amp rating must pass hard constraints",
);
const breakerMatch = findLocalProductMatch("بريكر 10 امبير", electricalProducts, "", {});
assert.equal(breakerMatch?.product?.sku, "B10", "10A breaker must auto-match the exact 10A catalog item");
assert.equal(breakerMatch?.status, "HIGH_CONFIDENCE", "exact 10A breaker match must be high confidence");

const isolatorConstraints = extractMatchConstraints("ايزليتر 30 امبير");
assert.equal(isolatorConstraints.productClass, "isolator", "common OCR spelling of isolator must normalize to isolator class");
assert.deepEqual(isolatorConstraints.amps, ["30"], "isolator amp rating must be extracted");
const isolatorMatch = findLocalProductMatch("ايزليتر 30 امبير", electricalProducts, "", {});
assert.equal(isolatorMatch?.product, null, "30A request must not auto-select a 32A isolator");
assert.equal(isolatorMatch?.reviewProduct?.sku, "I32", "nearest 32A isolator must be offered for manual review");
assert.equal(isolatorMatch?.status, "NEEDS_REVIEW", "30A versus 32A isolator must remain review-only");

const plugConstraints = extractMatchConstraints("بلاك 13 امبير");
assert.equal(plugConstraints.productClass, "socket", "market term بلاك must be recognized as a socket/plug");
assert.deepEqual(plugConstraints.amps, ["13"], "plug amp rating must be extracted");
const plugMatch = findLocalProductMatch("بلاك 13 امبير", electricalProducts, "", {});
assert.equal(plugMatch?.product?.sku, "P13", "13A plug must auto-match the exact 13A catalog item");
assert.equal(plugMatch?.status, "HIGH_CONFIDENCE", "exact 13A plug match must be high confidence");

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

assert.equal(matcher.stripTrailingParsedQuantity("ساكت 1 انج 30", 30), "ساكت 1 انج", "remove a trailing parsed quantity from the product description");
assert.equal(matcher.stripTrailingParsedQuantity("كوع 3/4 انج 30", 30), "كوع 3/4 انج", "preserve the inch fraction while removing quantity");
assert.equal(matcher.stripTrailingParsedQuantity("كوع 30 ملم", 30), "كوع 30 ملم", "preserve an attached metric size");
assert.equal(matcher.stripTrailingParsedQuantity("بايب 25 مم 30", 30), "بايب 25 مم", "remove quantity while preserving the metric dimension");
assert.equal(matcher.stripTrailingParsedQuantity("ساكت 1 انج 25", 30), "ساكت 1 انج 25", "do not remove a trailing number that differs from parsed quantity");

const elbowProducts = [
  { id: "02225", sku: "02225", name_ar: "كوع مفتوح 3/4 اخضر عدساني 25 ملم", name_en: "KWAA MFTWH 3/4 GREEN ADSANY 25 MM", unit: "حبه" },
  { id: "12225", sku: "12225", name_ar: "كوع مفتوح 3/4 حار عدساني", name_en: "KWAA MFTWH 3/4 HAR ADSANY", unit: "حبه" },
  { id: "8411", sku: "8411", name_ar: "كوع مفتوح 3/4 حار بلاستيك بحريني", name_en: "KWAA MFTWH 3/4 HAR PLASTIC BHRYNY", unit: "بالحبه" },
];
const elbowDiagnostics = diagnoseLocalProductMatch("كوع مفتوح 3/4 إنج", elbowProducts);
assert.equal(elbowDiagnostics.retrievalStatus, "CANDIDATES_FOUND", "diagnostics must distinguish successful token retrieval");
assert.ok(elbowDiagnostics.normalizedVariants.length > 0, "diagnostics must expose normalized query variants");
assert.ok(elbowDiagnostics.identityTokens.includes("كوع"), "diagnostics must expose retrieval identity tokens");
assert.equal(elbowDiagnostics.candidatePoolCount, 3, "diagnostics must count all token-retrieved catalog products");
assert.equal(elbowDiagnostics.constraintPassedCount, 3, "diagnostics must count candidates passing technical constraints");
assert.equal(elbowDiagnostics.constraintRejectedCount, 0, "diagnostics must count candidates rejected by technical constraints");

assert.equal(
  matcher.normalizeProductText("سلك 1.5 احمر"),
  "واير 1.5 احمر",
  "Arabic normalization must preserve decimal conductor sizes",
);

// Market wording regression: a single bare number on a wire line is its mm size.
for (const [query, expectedSku] of [
  ["سلك 1.5 احمر رول", "07151"],
  ["سلك 1.5 اسود رول", "07154"],
  ["سلك 1.5 اخضر رول", "07155"],
]) {
  const constraints = extractMatchConstraints(query);
  assert.deepEqual(constraints.metricSizes, ["1.5"], query + " must infer the lone wire size as mm");
  const result = findLocalProductMatch(query, resolverProducts, "", {});
  assert.equal(result.product?.sku, expectedSku, query + " must resolve to the correct catalog SKU");
  assert.equal(result.status, "HIGH_CONFIDENCE", query + " must be high confidence");
}
assert.deepEqual(
  extractMatchConstraints("سلك 1.5 4 مللي احمر").metricSizes,
  ["4"],
  "multiple numbers must not trigger implicit-size inference; only explicit 4mm is constrained",
);

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
