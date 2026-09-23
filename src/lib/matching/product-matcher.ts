export type MatchCandidate<T> = {
  product: T;
  score: number;
  status: "HIGH_CONFIDENCE" | "NEEDS_REVIEW";
  reason: string;
  signals: {
    exact: boolean;
    alias: boolean;
    token: number;
    character: number;
    attributes: number;
  };
};

export function normalizeProductText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[^a-z0-9\u0600-\u06ff.]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeProductText(value).split(" ").filter(Boolean));
}

function tokenScore(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function bigrams(value: string): Set<string> {
  const text = normalizeProductText(value).replace(/\s/g, "");
  const result = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) result.add(text.slice(i, i + 2));
  return result;
}

function characterScore(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const item of left) if (right.has(item)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

function attributeScore(query: string, productText: string): number {
  const q = normalizeProductText(query);
  const p = normalizeProductText(productText);
  const sizeMatches = q.match(/\b\d+(?:\.\d+)?(?:mm|cm|m|inch|in|\")?\b/g) ?? [];
  if (!sizeMatches.length) return 0.5;
  const hits = sizeMatches.filter((size) => p.includes(size)).length;
  return hits / sizeMatches.length;
}

export function rankProductMatches<T extends {
  sku?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  short_name?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  unit?: string | null;
}>(
  query: string,
  products: T[],
  aliases: Array<{ product_id: string; alias: string; normalized_alias?: string | null }>,
  getId: (product: T) => string,
  limit = 8,
): Array<MatchCandidate<T> & { productId: string }> {
  const normalizedQuery = normalizeProductText(query);
  if (!normalizedQuery) return [];

  const ranked = products.map((product) => {
    const id = getId(product);
    const fields = [
      product.sku,
      product.name_ar,
      product.name_en,
      product.short_name,
      product.brand,
      product.model,
      product.size,
      product.unit,
    ].filter(Boolean) as string[];

    const normalizedFields = fields.map(normalizeProductText);
    const aliasRows = aliases.filter((a) => a.product_id === id);
    const normalizedAliases = aliasRows.map((a) =>
      normalizeProductText(a.normalized_alias || a.alias),
    );

    const exact = normalizedFields.some((field) => field === normalizedQuery);
    const alias = normalizedAliases.some((field) => field === normalizedQuery);
    const token = Math.max(0, ...normalizedFields.map((field) => tokenScore(normalizedQuery, field)));
    const aliasToken = Math.max(0, ...normalizedAliases.map((field) => tokenScore(normalizedQuery, field)));
    const character = Math.max(0, ...normalizedFields.map((field) => characterScore(normalizedQuery, field)));
    const aliasCharacter = Math.max(0, ...normalizedAliases.map((field) => characterScore(normalizedQuery, field)));
    const attributes = attributeScore(
      normalizedQuery,
      [product.name_ar, product.name_en, product.brand, product.model, product.size, product.unit]
        .filter(Boolean)
        .join(" "),
    );

    const bestToken = Math.max(token, aliasToken);
    const bestCharacter = Math.max(character, aliasCharacter);
    let score = exact ? 1 : alias ? 0.98 : 0.45 * bestToken + 0.4 * bestCharacter + 0.15 * attributes;
    score = Math.max(0, Math.min(1, score));

    const status: MatchCandidate<T>["status"] = score >= 0.88 ? "HIGH_CONFIDENCE" : "NEEDS_REVIEW";
    const reason = exact
      ? "مطابقة مباشرة للاسم أو SKU"
      : alias
        ? "مطابقة مباشرة لاسم بديل محفوظ"
        : bestToken >= 0.75
          ? "تشابه قوي في الكلمات"
          : "تشابه جزئي يحتاج مراجعة";

    return {
      product,
      productId: id,
      score,
      status,
      reason,
      signals: {
        exact,
        alias,
        token: bestToken,
        character: bestCharacter,
        attributes,
      },
    };
  });

  return ranked
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
