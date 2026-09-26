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
    numeric: number;
    identity: number;
  };
};

const MARKET_SYNONYMS: Array<[RegExp, string]> = [
  [/راليه|رليه|ريله/gi, "ريليه"],
  [/دبي\s*بي|دي\s*بي/gi, "ديبي"],
  [/رابطه|ربطه|ربطة/gi, "ربطه"],
  [/كوبكل|كوبيكل/gi, "كوبيكل"],
  [/ستالايت|ستلايت/gi, "ستلايت"],
  [/فلكسبل/gi, "فليكسيبل"],
  [/كيبل/gi, "كيبل"],
  [/واير/gi, "واير"],
  [/سيم/gi, "سيم"],
  [/بايب/gi, "بايب"],
  [/بوكس/gi, "بوكس"],
  [/كوع/gi, "كوع"],
  [/شرمات/gi, "شرمات"],
  [/ترنكي/gi, "ترنكي"],
  [/كتاوت/gi, "كتاوت"],
  [/ساكت/gi, "ساكت"],
  [/ملبوش/gi, "ملبوش"],
  [/انش|إنش|بوصه|بوصة/gi, "انش"],
  [/ملم|مم/gi, "مم"],
  [/امبير|أمبير/gi, "امبير"],
  [/اخضر|أخضر/gi, "اخضر"],
  [/ابيض|أبيض/gi, "ابيض"],
  [/اسود|أسود/gi, "اسود"],
  [/احمر|أحمر/gi, "احمر"],
  [/ازرق|أزرق/gi, "ازرق"],
];

const NUMBER_WORDS: Record<string, string> = {
  صفر: "0", واحد: "1", واحدة: "1",
  اثنين: "2", اثنان: "2", اثنتين: "2", اثنتان: "2",
  ثلاث: "3", ثلاثة: "3", ثلاثه: "3",
  اربع: "4", اربعة: "4", اربعه: "4",
  خمس: "5", خمسة: "5", خمسه: "5",
  ست: "6", ستة: "6", سته: "6",
  سبع: "7", سبعة: "7", سبعه: "7",
  ثمان: "8", ثمانية: "8", ثمانيه: "8",
  تسع: "9", تسعة: "9", تسعه: "9",
  عشر: "10", عشرة: "10", عشره: "10",
};

const NON_IDENTITY_TOKENS = new Set([
  "حبه", "قطعه", "قطعة", "كيس", "باكت", "باكيت", "كرتون", "علبه", "علبة",
  "رول", "لفه", "لف", "متر", "سم", "مم", "كجم", "كغ", "جم", "غ", "لتر", "مل",
  "صندوق", "درزن", "طقم", "زوج", "عدد",
]);

function normalizeNumberWords(text: string): string {
  let value = text;
  for (const [word, number] of Object.entries(NUMBER_WORDS)) {
    value = value.replace(new RegExp("\\b" + word + "\\b", "gi"), number);
  }

  return value
    .replace(/(\d+(?:\.\d+)?)\s+ونص\b/gi, "$1.5")
    .replace(/\bونص\s+(انش|مم|سم)\b/gi, "0.5 $1")
    .replace(/\bنص\s+(انش|مم|سم)\b/gi, "0.5 $1")
    .replace(/\bربع\s+(انش|مم|سم)\b/gi, "0.25 $1")
    .replace(/\bثلاثة\s+ارباع\s+(انش|مم|سم)\b/gi, "0.75 $1");
}

export function normalizeProductText(value: string): string {
  let text = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)));

  text = normalizeNumberWords(text);
  for (const [pattern, replacement] of MARKET_SYNONYMS) text = text.replace(pattern, replacement);

  return text
    .replace(/(\d+(?:\.\d+)?)\s*[ف×x*]\s*(\d+(?:\.\d+)?)/gi, "$1 x $2")
    .replace(/\b4\s*[/\-]\s*3\b/g, "3/4")
    .replace(/\b3\s*[/\-]\s*4\b/g, "3/4")
    .replace(/\b1\s*[/\-]\s*2\b/g, "1/2")
    .replace(/(\d+(?:\.\d+)?)\s*["”″]/g, "$1 انش")
    .replace(/(\d+(?:\.\d+)?)\s*(?:مم|mm)\b/gi, "$1 مم")
    .replace(/(\d+(?:\.\d+)?)\s*(?:سم|cm)\b/gi, "$1 سم")
    .replace(/(\d+(?:\.\d+)?)\s*(?:انش|inch|in)\b/gi, "$1 انش")
    .replace(/[^a-z0-9\u0600-\u06ff./]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTokens(value: string): string[] {
  return [...new Set(normalizeProductText(value).split(" ").filter(Boolean))];
}

function numericTokens(value: string): string[] {
  return uniqueTokens(value).filter((token) => /^\d+(?:\.\d+)?$/.test(token));
}

function fractionTokens(value: string): string[] {
  return uniqueTokens(value).filter((token) => /^\d+\/\d+$/.test(token));
}

function identityTokens(value: string): string[] {
  return uniqueTokens(value).filter(
    (token) =>
      !NON_IDENTITY_TOKENS.has(token) &&
      !/^\d+(?:\.\d+)?$/.test(token) &&
      !/^\d+\/\d+$/.test(token),
  );
}

function overlapScore(query: string[], candidate: string[]): number {
  if (!query.length || !candidate.length) return 0;
  const candidateSet = new Set(candidate);
  return query.filter((token) => candidateSet.has(token)).length / query.length;
}

function softTokenScore(query: string[], candidate: string[]): number {
  if (!query.length || !candidate.length) return 0;
  let hits = 0;
  for (const q of query) {
    if (candidate.some((c) => c === q || (q.length >= 4 && (c.startsWith(q) || q.startsWith(c))))) hits += 1;
  }
  return hits / Math.max(query.length, candidate.length);
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

function fieldValues<T>(product: T): string[] {
  const item = product as {
    sku?: string | null;
    name_ar?: string | null;
    name_en?: string | null;
    short_name?: string | null;
    brand?: string | null;
    model?: string | null;
    size?: string | null;
    unit?: string | null;
    description?: string | null;
    category_main?: string | null;
    category_sub?: string | null;
    category_third?: string | null;
    product_group?: string | null;
  };

  return [
    item.name_ar, item.name_en, item.short_name, item.brand, item.model, item.size,
    item.description, item.category_main, item.category_sub, item.category_third,
    item.product_group, item.sku,
  ].filter(Boolean) as string[];
}

export function rankProductMatches<T>(
  query: string,
  products: T[],
  aliases: Array<{ product_id: string; alias: string; normalized_alias?: string | null }>,
  getId: (product: T) => string,
  limit = 8,
): Array<MatchCandidate<T> & { productId: string }> {
  const normalizedQuery = normalizeProductText(query);
  if (!normalizedQuery) return [];

  const queryNumbers = numericTokens(normalizedQuery);
  const queryFractions = fractionTokens(normalizedQuery);
  const queryIdentity = identityTokens(normalizedQuery);

  const aliasesByProduct = new Map<string, string[]>();
  for (const row of aliases) {
    const alias = normalizeProductText(row.normalized_alias || row.alias);
    if (!alias) continue;
    aliasesByProduct.set(row.product_id, [...(aliasesByProduct.get(row.product_id) ?? []), alias]);
  }

  const ranked = products.map((product) => {
    const id = getId(product);
    const normalizedFields = fieldValues(product).map(normalizeProductText).filter(Boolean);
    const productAliases = aliasesByProduct.get(id) ?? [];
    const searchable = [...normalizedFields, ...productAliases];

    const exact = normalizedFields.some((field) => field === normalizedQuery);
    const alias = productAliases.some((field) => field === normalizedQuery);

    const token = Math.max(0, ...searchable.map((field) => softTokenScore(
      uniqueTokens(normalizedQuery),
      uniqueTokens(field),
    )));
    const character = Math.max(0, ...searchable.map((field) => characterScore(normalizedQuery, field)));

    const candidateText = searchable.join(" ");
    const candidateNumbers = numericTokens(candidateText);
    const candidateFractions = fractionTokens(candidateText);

    const numeric = queryNumbers.length
      ? queryNumbers.filter((number) => candidateNumbers.includes(number)).length / queryNumbers.length
      : 1;
    const fraction = queryFractions.length
      ? queryFractions.filter((number) => candidateFractions.includes(number)).length / queryFractions.length
      : 1;

    // Prefer query coverage over candidate length. A catalog name may contain
    // extra descriptors (brand/material/type) while still being the correct item.
    // For example: "ترنكي 4 انش حق كابل" should still surface
    // "ترنكي حديد 4 انش" for review instead of disappearing.
    const identity = queryIdentity.length
      ? Math.max(0, ...searchable.map((field) => {
          const candidateIdentity = identityTokens(field);
          if (!candidateIdentity.length) return 0;
          const candidateSet = new Set(candidateIdentity);
          return queryIdentity.filter((token) => candidateSet.has(token)).length / queryIdentity.length;
        }))
      : 1;

    const attributes = Math.min(numeric, fraction);
    const exactNameOrAlias = exact || alias;
    const specificationConflict =
      (queryNumbers.length > 0 && numeric < 1) ||
      (queryFractions.length > 0 && fraction < 1);

    let score = exactNameOrAlias
      ? 1
      : 0.50 * identity + 0.18 * token + 0.12 * character + 0.20 * attributes;

    if (identity >= 1 && attributes === 1) score += 0.10;
    if (specificationConflict) score = Math.min(score, 0.72);
    score = Math.max(0, Math.min(1, score));

    const reason = exact
      ? "مطابقة مباشرة لاسم الصنف في قاعدة البيانات"
      : alias
        ? "مطابقة مباشرة لاسم بديل محفوظ"
        : specificationConflict
          ? "الاسم قريب لكن المواصفة أو المقاس لا يطابق الطلب"
          : identity >= 0.9 && attributes === 1
            ? "مطابقة قوية للاسم والمواصفات"
            : "تشابه جزئي يحتاج مراجعة";

    const status: MatchCandidate<T>["status"] =
      exactNameOrAlias || (identity >= 0.9 && attributes === 1 && score >= 0.86)
        ? "HIGH_CONFIDENCE"
        : "NEEDS_REVIEW";

    return {
      product,
      productId: id,
      score,
      status,
      reason,
      signals: { exact, alias, token, character, attributes, numeric, identity },
    };
  });

  return ranked
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
