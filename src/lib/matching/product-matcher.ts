type ProductLike = {
  id?: string | null;
  sku?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  short_name?: string | null;
  brand?: string | null;
  category_main?: string | null;
  category_sub?: string | null;
  model?: string | null;
  size?: string | null;
  unit?: string | null;
  description?: string | null;
};

type MatchInput = {
  raw_text?: string | null;
  normalized_text?: string | null;
  quantity?: number | null;
  unit?: string | null;
};

type MatchCandidate = {
  product: ProductLike | null;
  score: number;
  reason: string;
};

export type ProductMatchStatus = "matched" | "review" | "unmatched";

export type ProductMatchResult = {
  raw_text: string;
  normalized_text: string;
  sku: string | null;
  product_name: string | null;
  brand: string | null;
  quantity: number;
  unit: string | null;
  description: string | null;
  confidence: number;
  status: ProductMatchStatus;
};

const ABBREVIATIONS: Record<string, string[]> = {
  r: ["red", "حمر", "أحمر"],
  y: ["yellow", "اصفر", "أصفر"],
  b: ["blue", "ازرق", "أزرق"],
  black: ["black", "اسود", "أسود", "balak", "bdk", "bk"],
  green: ["green", "اخضر", "أخضر", "grew"],
  white: ["white", "ابيض", "أبيض"],
  blue: ["blue", "ازرق", "أزرق"],
  red: ["red", "احمر", "أحمر"],
  yellow: ["yellow", "اصفر", "أصفر"],
  wire: ["wire", "سلك", "كهربائي", "كهرباء"],
  pipe: ["pipe", "مواسير", "مسار", "انبوب"],
  screw: ["screw", "مفك", "براغي", "برغي"],
  كهرباء: ["كهرباء", "كهربائي"],
  كهربائي: ["كهربائي", "كهرباء"],
  كهراء: ["كهرباء", "كهربائي"],
  احمر: ["احمر", "أحمر", "red"],
  اصفر: ["اصفر", "أصفر", "yellow"],
  ازرق: ["ازرق", "أزرق", "blue"],
  اخضر: ["اخضر", "أخضر", "green"],
  اسود: ["اسود", "أسود", "black"],
};

function stripArabicDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (ch) => "٠١٢٣٤٥٦٧٨٩".indexOf(ch).toString());
}

function normalizeText(value: string): string {
  return stripArabicDigits(
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u0640]/g, "")
      .replace(/\bmm\b/gi, "مم")
      .replace(/\bpcs\b/gi, "حبة")
      .replace(/\bpiece(s)?\b/gi, "حبة")
      .replace(/\bpack(s)?\b/gi, "علبة")
      .replace(/\b(?:mtr|meter|mt)\b/gi, "متر")
      .replace(/\b(?:kilogram|kg)\b/gi, "كجم")
      .replace(/[`~!@#$%^&*()_+=\[\]{}\\|;:'",<>/?]/g, " ")
      .replace(/[_/\\-]+/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim(),
  );
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function expandAliases(text: string): string[] {
  const normalized = normalizeText(text);
  const set = new Set<string>([normalized]);

  const tokens = tokenize(text);
  for (const token of tokens) {
    const aliasMap = ABBREVIATIONS[token];
    if (aliasMap) {
      aliasMap.forEach((variant) => set.add(normalizeText(variant)));
    }
  }

  return [...set].filter(Boolean);
}

function safeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function extractQuantityAndUnit(rawText: string, fallbackUnit: string | null): {
  quantity: number;
  unit: string | null;
} {
  const text = rawText || "";
  const numberMatches = text.match(/\d+(?:\.\d+)?/g) ?? [];
  const explicitMultiplier = /(?:x|×|\*)/i.test(text);
  const candidateQty = explicitMultiplier
    ? numberMatches[numberMatches.length - 1]
    : numberMatches[0] ?? numberMatches[numberMatches.length - 1];
  const quantity = candidateQty ? safeNumber(candidateQty) : 0;

  let unit = fallbackUnit && fallbackUnit.trim() ? fallbackUnit.trim() : null;
  const unitText = text.toLowerCase();
  if (!unit && /\b(?:حبة|pcs|pc|piece|pieces)\b/i.test(unitText)) unit = "حبة";
  if (!unit && /\b(?:متر|meter|mt)\b/i.test(unitText)) unit = "متر";
  if (!unit && /\b(?:كجم|kg|كيلو|kilogram)\b/i.test(unitText)) unit = "كجم";
  if (!unit && /\b(?:علبة|box|بكج|pack)\b/i.test(unitText)) unit = "علبة";

  return { quantity, unit };
}

export class ProductMatcher {
  private readonly products: ProductLike[];

  constructor(products: ProductLike[]) {
    this.products = products;
  }

  match(input: MatchInput): ProductMatchResult {
    const rawText = (input.raw_text ?? input.normalized_text ?? "").trim();
    const normalizedText = normalizeText(rawText);
    const baseQuantity = safeNumber(input.quantity);
    const fallbackUnit = input.unit?.trim() || null;

    const { quantity, unit } = extractQuantityAndUnit(rawText, fallbackUnit);
    const effectiveQuantity = quantity > 0 ? quantity : baseQuantity > 0 ? baseQuantity : 0;
    const effectiveUnit = unit || fallbackUnit;

    if (!normalizedText) {
      return {
        raw_text: rawText,
        normalized_text: normalizedText,
        sku: null,
        product_name: null,
        brand: null,
        quantity: effectiveQuantity,
        unit: effectiveUnit,
        description: null,
        confidence: 0,
        status: "unmatched",
      };
    }

    let best: MatchCandidate = {
      product: null,
      score: 0,
      reason: "لا توجد مطابقة كافية",
    };

    for (const product of this.products) {
      const fields = [
        product.sku,
        product.name_ar,
        product.name_en,
        product.short_name,
        product.brand,
        product.category_main,
        product.category_sub,
        product.model,
        product.size,
        product.unit,
        product.description,
      ].filter(Boolean) as string[];

      const candidateText = fields.join(" ");
      const tokens = new Set(tokenize(candidateText));
      const rawTokens = new Set(tokenize(rawText));
      const overlap = [...rawTokens].filter((token) => tokens.has(token)).length;
      const ratio = tokens.size > 0 ? overlap / tokens.size : 0;

      const normalizedSku = product.sku ? normalizeText(product.sku) : "";
      const normalizedNameAr = product.name_ar ? normalizeText(product.name_ar) : "";
      const normalizedNameEn = product.name_en ? normalizeText(product.name_en) : "";
      const normalizedShort = product.short_name ? normalizeText(product.short_name) : "";
      const normalizedBrand = product.brand ? normalizeText(product.brand) : "";
      const normalizedSize = product.size ? normalizeText(product.size) : "";

      const exactNameMatch =
        normalizedNameAr === normalizedText || normalizedNameEn === normalizedText || normalizedShort === normalizedText;
      const partialTextMatch =
        normalizedText.includes(normalizedNameAr) ||
        normalizedText.includes(normalizedNameEn) ||
        normalizedText.includes(normalizedShort) ||
        normalizedText.includes(normalizedSku);
      const skuMatch = Boolean(normalizedSku && (normalizedText.includes(normalizedSku) || normalizedSku.includes(normalizedText)));
      const brandMatch = Boolean(normalizedBrand && (normalizedText.includes(normalizedBrand) || normalizedBrand.includes(normalizedText)));
      const sizeMatch = Boolean(normalizedSize && (normalizedText.includes(normalizedSize) || normalizedSize.includes(normalizedText)));
      const aliasScores = expandAliases(candidateText).reduce((sum, alias) => {
        return sum + (normalizedText.includes(normalizeText(alias)) ? 0.18 : 0);
      }, 0);

      let score = 0;
      if (skuMatch) score += 0.9;
      if (exactNameMatch) score += 0.8;
      if (partialTextMatch) score += 0.55;
      if (brandMatch) score += 0.15;
      if (sizeMatch) score += 0.15;
      score += aliasScores;
      score += Math.min(0.45, ratio * 0.4);

      if (score > best.score) {
        best = {
          product,
          score,
          reason: skuMatch
            ? "تطابق مباشر مع SKU"
            : exactNameMatch || partialTextMatch
              ? "مطابقة اسم المنتج"
              : brandMatch || sizeMatch
                ? "تشابه جزئي يحتاج مراجعة"
                : "تشابه نصي منخفض",
        };
      }
    }

    const genericTerms = new Set(["سلك", "wire", "مفك", "screw", "pipe", "مواسير", "ال", "و"]);
    const isGenericOnly = rawTokens.size > 0 && [...rawTokens].every((token) => genericTerms.has(token));
    if (isGenericOnly && best.score > 0) {
      best.score = Math.min(best.score, 0.55);
    }

    const status: ProductMatchStatus =
      best.score >= 0.9 ? "matched" : best.score >= 0.6 ? "review" : "unmatched";

    if (status === "unmatched") {
      best.product = null;
    }

    const chosenName = best.product
      ? /[a-z]/.test(rawText) && !/[ا-ي]/.test(rawText)
        ? best.product.name_en || best.product.name_ar || null
        : best.product.name_ar || best.product.name_en || null
      : null;

    return {
      raw_text: rawText,
      normalized_text: normalizedText,
      sku: best.product?.sku ?? null,
      product_name: chosenName,
      brand: best.product?.brand ?? null,
      quantity: effectiveQuantity,
      unit: effectiveUnit || best.product?.unit || null,
      description: best.product?.description ?? null,
      confidence: Number((best.score || 0).toFixed(2)),
      status,
    };
  }
}
