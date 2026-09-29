export type OrderLineSpan = {
  start: number;
  end: number;
  raw: string;
};

export type OrderLineSignals = {
  quantity: number | null;
  unit: string;
  quantityRaw: string;
  unitRaw: string;
  quantitySpan: OrderLineSpan | null;
  unitSpan: OrderLineSpan | null;
  sku: string;
  skuSpan: OrderLineSpan | null;
  confidence: number;
  issues: string[];
};

const COMMERCIAL_UNITS: Array<{ pattern: string; unit: string }> = [
  { pattern: "rolls?|رول|لفات?|لفة|لفه|لف", unit: "رول" },
  { pattern: "coils?", unit: "رول" },
  { pattern: "pcs?|pieces?|piece|حبة|قطعة|قطع", unit: "حبة" },
  { pattern: "packets?|packs?|packet|pack|pkt|pkts|باكت|باكيت|باك", unit: "باكيت" },
  { pattern: "cartons?|carton|كرتون|كرتونه", unit: "كرتون" },
  { pattern: "dozens?|dozen|dz|dzn|دزينة|درزن", unit: "دزينة" },
  { pattern: "meters?|meter|متر|مترات", unit: "متر" },
  { pattern: "sets?|set|طقم", unit: "طقم" },
  { pattern: "pairs?|pair|زوج", unit: "زوج" },
  { pattern: "bags?|bag|كيس", unit: "كيس" },
  { pattern: "containers?|container|عبوة|علبة", unit: "عبوة" },
];

const COMMERCIAL_UNIT_PATTERN = COMMERCIAL_UNITS.map((item) => item.pattern).join("|");

function toAsciiDigits(value: string): string {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (char) => String("٠١٢٣٤٥٦٧٨٩".indexOf(char)))
    .replace(/[۰-۹]/g, (char) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(char)))
    .replace(/,/g, ".");
}

function normalizeLine(value: string): string {
  return toAsciiDigits(value).replace(/[|¦]+/g, " ").replace(/\s+/g, " ").trim();
}

function makeSpan(line: string, start: number, end: number): OrderLineSpan {
  return { start, end, raw: line.slice(start, end) };
}

function parseNumber(value: string): number | null {
  const n = Number(toAsciiDigits(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function canonicalUnit(value: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  for (const item of COMMERCIAL_UNITS) {
    if (new RegExp("^(?:" + item.pattern + ")$", "iu").test(raw)) return item.unit;
  }
  return "";
}

function findSku(line: string, catalogSkus?: Set<string>): { sku: string; span: OrderLineSpan | null } {
  const normalized = normalizeLine(line);
  const matches = [...normalized.matchAll(/(?:^|\s)(\d{3,8})(?=\s|$)/g)];
  for (const match of matches) {
    const token = match[1] ?? "";
    if (catalogSkus?.has(token)) {
      const start = (match.index ?? 0) + (match[0].length - token.length);
      return { sku: token, span: makeSpan(line, start, start + token.length) };
    }
  }
  return { sku: "", span: null };
}

type QuantityUnitMatch = {
  quantity: number;
  unit: string;
  quantityRaw: string;
  unitRaw: string;
  quantityStart: number;
  quantityEnd: number;
  unitStart: number;
  unitEnd: number;
  matchStart: number;
  matchEnd: number;
};

function findExplicitCommercialPairs(line: string): QuantityUnitMatch[] {
  const normalized = normalizeLine(line);
  const results: QuantityUnitMatch[] = [];
  const unitPattern = COMMERCIAL_UNIT_PATTERN;

  const numberThenUnit = new RegExp(
    "(\\d+(?:\\.\\d+)?)\\s*(" + unitPattern + ")(?=\\s|$|[^\\p{L}\\p{N}])",
    "giu",
  );
  for (const match of normalized.matchAll(numberThenUnit)) {
    const quantityRaw = match[1] ?? "";
    const unitRaw = match[2] ?? "";
    const quantity = parseNumber(quantityRaw);
    const matchStart = match.index ?? 0;
    if (quantity == null) continue;
    const quantityStart = matchStart + (match[0].indexOf(quantityRaw));
    const unitStart = matchStart + match[0].indexOf(unitRaw);
    results.push({
      quantity,
      unit: canonicalUnit(unitRaw),
      quantityRaw,
      unitRaw,
      quantityStart,
      quantityEnd: quantityStart + quantityRaw.length,
      unitStart,
      unitEnd: unitStart + unitRaw.length,
      matchStart,
      matchEnd: matchStart + match[0].length,
    });
  }

  const unitThenNumber = new RegExp(
    "(" + unitPattern + ")\\s*(\\d+(?:\\.\\d+)?)(?=\\s|$|[^\\p{L}\\p{N}])",
    "giu",
  );
  for (const match of normalized.matchAll(unitThenNumber)) {
    const unitRaw = match[1] ?? "";
    const quantityRaw = match[2] ?? "";
    // Invoice prices commonly appear immediately after a unit (e.g. ROLL 2 12.600).
    // A three-decimal numeric token in that position is a price, not order quantity.
    if (/^\d+\.\d{3}$/.test(quantityRaw)) continue;
    const quantity = parseNumber(quantityRaw);
    const matchStart = match.index ?? 0;
    if (quantity == null) continue;
    const unitStart = matchStart + match[0].indexOf(unitRaw);
    const quantityStart = matchStart + match[0].indexOf(quantityRaw, unitRaw.length);
    results.push({
      quantity,
      unit: canonicalUnit(unitRaw),
      quantityRaw,
      unitRaw,
      quantityStart,
      quantityEnd: quantityStart + quantityRaw.length,
      unitStart,
      unitEnd: unitStart + unitRaw.length,
      matchStart,
      matchEnd: matchStart + match[0].length,
    });
  }

  return results.sort((a, b) => a.matchStart - b.matchStart);
}

function isLikelyListNumber(line: string, normalized: string, sku: string): boolean {
  const leading = normalized.match(/^(\d+(?:\.\d+)?)(?:[.)\-:]?)(?=\s|$)/);
  if (!leading) return false;
  const token = leading[1] ?? "";
  if (sku && normalized.slice(leading[0].length).match(new RegExp("^" + sku + "(?=\\s|$)"))) return true;
  // A punctuated leading number is normally an item/list number, not quantity.
  return /[.)\-:]$/.test(leading[0]);
}

export function extractOrderLineSignals(
  rawLine: string,
  catalogSkus?: Set<string>,
): OrderLineSignals {
  const line = String(rawLine ?? "");
  const normalized = normalizeLine(line);
  const { sku, span: skuSpan } = findSku(line, catalogSkus);
  const pairs = findExplicitCommercialPairs(line);
  const issues: string[] = [];

  // Explicit commercial quantity+unit is authoritative. Technical units such as
  // mm/mm²/cm/ml are deliberately excluded from COMMERCIAL_UNITS, so 6مل on a
  // wire is never mistaken for quantity 6 and unit ml.
  const explicit = pairs.length ? pairs[pairs.length - 1] : null;
  if (explicit) {
    return {
      quantity: explicit.quantity,
      unit: explicit.unit,
      quantityRaw: explicit.quantityRaw,
      unitRaw: explicit.unitRaw,
      quantitySpan: makeSpan(line, explicit.quantityStart, explicit.quantityEnd),
      unitSpan: makeSpan(line, explicit.unitStart, explicit.unitEnd),
      sku,
      skuSpan,
      confidence: 1,
      issues,
    };
  }

  const leading = normalized.match(/^(\d+(?:\.\d+)?)(?=\s|$)/);
  if (leading && !isLikelyListNumber(line, normalized, sku)) {
    const quantityRaw = leading[1] ?? "";
    const quantity = parseNumber(quantityRaw);
    if (quantity != null) {
      const start = normalized.indexOf(quantityRaw);
      return {
        quantity,
        unit: "",
        quantityRaw,
        unitRaw: "",
        quantitySpan: makeSpan(line, start, start + quantityRaw.length),
        unitSpan: null,
        sku,
        skuSpan,
        confidence: 0.72,
        issues: ["الكمية ظهرت دون وحدة تجارية صريحة؛ يلزم التحقق من وحدة الطلب."],
      };
    }
  }

  // Bare quantity is only accepted when explicitly separated by a dash/colon.
  // Do not treat invoice prices or technical dimensions as quantities.
  const trailing = normalized.match(/[\\-–—:]\\s*(\\d+(?:\\.\\d+)?)\\s*$/);
  if (trailing) {
    const quantityRaw = trailing[1] ?? "";
    const quantity = parseNumber(quantityRaw);
    if (quantity != null && !/\\.\\d{3}$/.test(quantityRaw)) {
      const start = (trailing.index ?? 0) + trailing[0].lastIndexOf(quantityRaw);
      return {
        quantity,
        unit: "",
        quantityRaw,
        unitRaw: "",
        quantitySpan: makeSpan(line, start, start + quantityRaw.length),
        unitSpan: null,
        sku,
        skuSpan,
        confidence: 0.68,
        issues: ["الكمية ظهرت دون وحدة تجارية؛ يلزم التحقق قبل الاعتماد."],
      };
    }
  }

  // Explicit technical units are not order units. Flag ambiguity rather than
  // inventing a quantity from values such as 6 mm, 2.5 mm, or 500 ml.
  if (/(?:\\d+(?:\\.\\d+)?)\\s*(?:مم2|مم|ملم|mm2|mm|cm|سم|ml|مل|l|لتر)(?=\\s|$|[^\\p{L}\\p{N}])/iu.test(normalized)) {
    issues.push("وجدت قيمة مواصفة/حجم بدون كمية تجارية صريحة؛ لم تُستخدم ككمية.");
  } else {
    issues.push("لم تُستخرج كمية تجارية مؤكدة من السطر.");
  }

  return {
    quantity: null,
    unit: "",
    quantityRaw: "",
    unitRaw: "",
    quantitySpan: null,
    unitSpan: null,
    sku,
    skuSpan,
    confidence: 0,
    issues,
  };
}


function normalizedIdentityTokens(value: string): string[] {
  return [...new Set(
    normalizeLine(value)
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff./]+/gi, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2 && !/^\d+(?:\.\d+)?$/.test(token)),
  )];
}

function sourceLineSimilarity(itemText: string, sourceText: string): number {
  const itemTokens = normalizedIdentityTokens(itemText);
  const sourceTokens = new Set(normalizedIdentityTokens(sourceText));
  if (!itemTokens.length || !sourceTokens.size) return 0;
  const hits = itemTokens.filter((token) => sourceTokens.has(token)).length;
  return hits / itemTokens.length;
}

export function alignOrderItemToSourceLine(
  itemText: string,
  itemIndex: number,
  sourceLines: Array<{ rawLine: string; signals: OrderLineSignals; index: number }>,
  usedSourceIndices: Set<number>,
): { rawLine: string; signals: OrderLineSignals; index: number; score: number } | null {
  let best: { rawLine: string; signals: OrderLineSignals; index: number; score: number } | null = null;
  for (const source of sourceLines) {
    if (usedSourceIndices.has(source.index)) continue;
    const similarity = sourceLineSimilarity(itemText, source.rawLine);
    const skuBoost =
      source.signals.sku && normalizeLine(itemText).includes(source.signals.sku)
        ? 0.65
        : 0;
    const positionDistance = Math.abs(source.index - itemIndex);
    const positionBoost = positionDistance === 0 ? 0.15 : Math.max(0, 0.08 - positionDistance * 0.01);
    const score = Math.min(1, similarity * 0.75 + skuBoost + positionBoost);
    if (!best || score > best.score) {
      best = { ...source, score };
    }
  }
  return best && best.score >= 0.28 ? best : null;
}

export function parseOrderSourceLines(
  sourceText: string,
  catalogSkus?: Set<string>,
): Array<{ rawLine: string; signals: OrderLineSignals; index: number }> {
  return String(sourceText ?? "")
    .split(/\r?\n/)
    .map((rawLine, index) => ({ rawLine: rawLine.trim(), index }))
    .filter((row) => row.rawLine.length >= 2)
    .map((row) => ({
      ...row,
      signals: extractOrderLineSignals(row.rawLine, catalogSkus),
    }));
}
