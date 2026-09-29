import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/lib/matching/product-matcher.ts", import.meta.url), "utf8");
const ts = await import("typescript");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const moduleUrl = "data:text/javascript;base64," + Buffer.from(transpiled, "utf8").toString("base64");
const matcher = await import(moduleUrl);
const { rankProductMatches } = matcher;

const products = [
  ["0761", "واير الخليج احمر مقاس 6مل", "WAIR GULF RED SAIZ 6 ML"],
  ["0762", "واير الخليج اصفر مقاس 6مل", "WAIR GULF YELLOW SAIZ 6 ML"],
  ["0763", "واير الخليج ازرق مقاس 6مل", "WAIR GULF BLUE SAIZ 6 ML"],
  ["0764", "واير الخليج اسود مقاس 6مل", "WAIR GULF BLACK SAIZ 6 ML"],
  ["0765", "واير الخليج اخضر مقاس 6مل", "WAIR GULF GREEN SAIZ 6 ML"],
  ["07101", "واير الخليج احمر مقاس 10مل", "WAIR GULF RED SAIZ 10 ML"],
  ["07161", "واير الخليج احمر مقاس 16مل", "WAIR GULF RED SAIZ 16 ML"],
  ["0736", "واير الخليج 3كور 6مل", "WAIR GULF 3 COR 6 ML"],
  ["07446", "واير الخليج 4كور 6مل", "WAIR GULF 4 COR 6 ML"],
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
  unit: "متر",
  description: null,
}));

const aliases = [];

function match(query) {
  return rankProductMatches(query, products, aliases, (product) => product.id, 8);
}

for (const [query, expectedSku] of [
  ["واير الخليج احمر 6مل", "0761"],
  ["واير الخليج اصفر 6مل", "0762"],
  ["واير الخليج ازرق 6مل", "0763"],
  ["واير الخليج اسود 6مل", "0764"],
]) {
  const candidates = match(query);
  assert.equal(candidates.length, 1, query + " must have one technical candidate");
  assert.equal(candidates[0].product.sku, expectedSku, query + " must resolve to the exact color/size SKU");
}

assert.equal(match("واير الخليج احمر 6مل").some((candidate) => candidate.product.sku === "07101"), false, "6mm red must reject 10mm red");
assert.equal(match("واير الخليج احمر 6مل").some((candidate) => candidate.product.sku === "07161"), false, "6mm red must reject 16mm red");
assert.equal(match("واير الخليج 3كور 6مل").some((candidate) => candidate.product.sku === "07446"), false, "3-core must reject 4-core");
assert.equal(match("واير الخليج 4كور 6مل").some((candidate) => candidate.product.sku === "0736"), false, "4-core must reject 3-core");

console.log("product-matcher regression: PASS");
console.log("validated exact 6mm color matches: red/yellow/blue/black");
console.log("validated technical conflicts: 6/10/16mm and 3/4-core");
