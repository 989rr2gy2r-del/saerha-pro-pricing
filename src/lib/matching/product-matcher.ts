import { ratio as rapidRatio, tokenSetRatio as rapidTokenSetRatio, tokenSortRatio as rapidTokenSortRatio } from "@3leaps/string-metrics-wasm";

export type MatchCandidate<T> = {
  product: T;
  score: number;
  status: "HIGH_CONFIDENCE" | "NEEDS_REVIEW";
  reason: string;
  signals: {
    exact: boolean;
    alias: boolean;
    rapid: number;
    token: number;
    character: number;
    attributes: number;
    numeric: number;
    identity: number;
    cores: number;
  };
};

const MARKET_SYNONYMS: Array<[RegExp, string]> = [
  [/\bamps?\b/gi, "امبير"], [/\bamperes?\b/gi, "امبير"], [/\bmeters?\b/gi, "متر"], [/\brolls?\b|\bcoils?\b/gi, "رول"], [/(?:^|\s)(?:لفه|لفة|لف)(?=\s|$)/gi, "رول"], [/\bpcs?\b|\bpieces?\b/gi, "حبة"],
  [/\bgangs?\b/gi, "دقمة"], [/\b1[-\s]?way\b/gi, "1 دقمة"], [/\b2[-\s]?way\b/gi, "2 دقمة"], [/\b3[-\s]?way\b/gi, "3 دقمة"], [/\b4[-\s]?way\b/gi, "4 دقمة"], [/\b5[-\s]?way\b/gi, "5 دقمة"], [/\b6[-\s]?way\b/gi, "6 دقمة"], [/\bround[-\s]?pin\b/gi, "دائري"],

  [/\bpvc\b/gi, "بلاستيك"], [/\bcircular\b/gi, "دائري"],
  [/\bsolution\s+glue\b/gi, "لاصق"], [/\bglue\b/gi, "لاصق"],
  [/\bfour[-\s]?way\b/gi, "رباعي"], [/\bthree[-\s]?way\b/gi, "ثلاثي"], [/\btwo[-\s]?way\b/gi, "ثنائي"],
  [/\bsingle[-\s]?pole\b/gi, "سنجل"], [/\bmcb\b/gi, "mcb بريكر"], [/\brccb\b/gi, "rccb"],
  [/\bpanel\b/gi, "لوحة"], [/\bsdb\b/gi, "لوحة"], [/\bboard\b/gi, "لوحة"],
  [/\belectrical\s+tape\b/gi, "تيب"], [/\btape\b/gi, "تيب"],
  [/\bsmall\s+electrical\s+connector\b/gi, "موصل"], [/\bconnector\b/gi, "موصل"],
  [/\bmain\s+power\s+cable\b/gi, "كيبل"], [/\bpower\s+cable\b/gi, "كيبل"], [/\bcable\b/gi, "كيبل"],
  [/\bcoil(?:s)?\b/gi, "لف"], [/\bsteel\b/gi, "حديد"], [/\bbox(?:es)?\b/gi, "بوكس"],
  [/\bpipe(?:s)?\b/gi, "بايب"], [/\bband\b/gi, "ربطه"], [/\bchoket\b/gi, "تشوكت"],
  [/\bpower\s+socket\b/gi, "مفتاح"], [/\bsocket\b/gi, "ساكت"],

  [/راليه|رليه|ريله/gi, "ريليه"],
  [/دبي\s*بي|دي\s*بي/gi, "ديبي"],
  [/رابطه|ربطه|ربطة/gi, "ربطه"],
  [/كوبكل|كوبيكل|كيوبكل/gi, "كيوبكل"],
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


/**
 * Market-language expansion for English/Arabic order lines.
 * These are deterministic catalog-search synonyms, not AI corrections.
 * The original order text remains the source of hard technical constraints.
 */
const MARKET_QUERY_EXPANSIONS: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /\bfour.way\s+switch\b|\b4.way\s+switch\b/gi, terms: ["مفتاح رباعي", "سويتش رباعي 4"] },
  { pattern: /\btwo.way\s+switch\b|\b2.way\s+switch\b/gi, terms: ["مفتاح ثنائي", "سويتش ثنائي 2"] },
  { pattern: /\bone.way\s+switch\b|\b1.way\s+switch\b/gi, terms: ["مفتاح أحادي", "سويتش مفرد"] },
  { pattern: /\bround.pin\s+power\s+socket\b/gi, terms: ["بريزة دائرية", "مقبس دائري"] },
  { pattern: /\bmulti\s+power\s+socket\b/gi, terms: ["بريزة متعددة", "مقبس متعدد باور"] },
  // Do not let the generic expansion override more specific socket variants.
  { pattern: /(?<!round.pin\s)(?<!multi\s)\bpower\s+socket\b/gi, terms: ["بريزة كهربائية", "مقبس كهرباء"] },
  { pattern: /\bcircular\s+socket\s+box\b/gi, terms: ["علبة مفتاح دائرية", "بوكس دائري"] },
  { pattern: /\bcircular\s+box\b/gi, terms: ["بوكس دائري بلاستيك", "علبة دائرية"] },
  { pattern: /\bsteel\s+switch\s+box\b|\bsteel\s+socket\s+box\b/gi, terms: ["علبة حديد مفتاح", "بوكس حديد كهربائي"] },
  // Generic socket-box expansion must not erase circular/steel qualifiers.
  { pattern: /(?<!circular\s)(?<!steel\s)\bsocket\s+box\b/gi, terms: ["علبة مفتاح", "بوكس سويتش"] },
  { pattern: /\bsdb\b|\bdistribution\s+board\b/gi, terms: ["لوحة توزيع", "لوح كهرباء"] },
  { pattern: /\bmcb\b|\bsingle.pole\s+mcb\b/gi, terms: ["بريكر مفرد", "قاطع حراري أحادي"] },
  { pattern: /\brccb\b/gi, terms: ["قاطع تفاضلي", "قاطع تسريب"] },
  { pattern: /\bdouble\s+elbow\b/gi, terms: ["كوع دبل", "كوع مزدوج"] },
  { pattern: /\bstreet\s+elbow\b/gi, terms: ["كوع ذكر وانثى", "كوع سن خارجي داخلي"] },
  // Do not create a generic elbow variant from "double/street elbow".
  { pattern: /(?<!double\s)(?<!street\s)\belbows?\b/gi, terms: ["كوع", "أكواع", "زاوية", "كوع زاوية"] },
  { pattern: /\bknee\b/gi, terms: ["كوع", "زاوية"] },
  { pattern: /\bpvc\s+pipe\b/gi, terms: ["ماسورة بلاستيك", "بايب pvc"] },
  { pattern: /\bpvc\s+band\b|\bpvc\s+clamp\b/gi, terms: ["كلبس بايب", "مشبك ماسورة"] },
  { pattern: /\bpvc\s+socket\b|\bchoket\b/gi, terms: ["شوكيه بلاستيك", "سوكت"] },
  { pattern: /\bpvc\s+(?:capling|coupling|coupler)\b|\b(?:capling|coupling|coupler)\b/gi, terms: ["سوكت", "وصلة ماسورة"] },
  { pattern: /\bdouble\s+(?:melbus|mlbwsh)\b/gi, terms: ["ملبوش دبل", "ملبوش مزدوج"] },
  // Keep "double melbus" tied to the double variant; otherwise the generic
  // expansion can create a higher-scoring single-melbus candidate.
  { pattern: /(?<!double\s)(?<!دبل\s)(?<!مزدوج\s)\b(?:melbus|mlbwsh)\b/gi, terms: ["ملبوش"] },
  { pattern: /\b(?:gi|g\.i\.)\s+box\b/gi, terms: ["بوكس حديد", "بوكس GI"] },
  { pattern: /\b(?:adsany|adsani)\b/gi, terms: ["عدساني"] },
  { pattern: /\b(?:alfa)\b/gi, terms: ["الفا", "ألفا"] },
  { pattern: /\bpvc\s+glue\b|\bsolution\s+glue\b/gi, terms: ["غراء مواسير", "لاصق بلاستيك"] },
  { pattern: /\belectrical\s+tape\b/gi, terms: ["تيب كهربائي", "شريط عازل"] },
  // "connector" is already normalized by MARKET_SYNONYMS; avoid a generic
  // expansion that can erase "small electrical connector" specificity.

  // Keep "main/power cable" specificity intact; do not add a generic cable
  // variant that can beat a more specific catalog candidate.
  { pattern: /(?<!main power )(?<!power )\bcable\b|\bwire\b/gi, terms: ["كابل كهربائي", "واير سلك"] },
];

function buildMarketQueryVariants(query: string): string[] {
  const source = String(query ?? "").trim();
  if (!source) return [];
  const variants = new Set<string>([normalizeProductText(source)]);

  for (const expansion of MARKET_QUERY_EXPANSIONS) {
    if (!expansion.pattern.test(source)) {
      expansion.pattern.lastIndex = 0;
      continue;
    }
    expansion.pattern.lastIndex = 0;
    for (const term of expansion.terms) {
      const replaced = source.replace(expansion.pattern, term);
      variants.add(normalizeProductText(replaced));
    }
  }

  return [...variants].filter(Boolean);
}

/**
 * Return the deterministic Arabic market-search expansion used for audit/display.
 * This is a fixed dictionary, never an AI correction or a persisted alias.
 */
export function getMarketArabicTranslation(query: string): string {
  const source = String(query ?? "").trim();
  if (!source) return "";
  const arabicTerms = new Set<string>();
  for (const expansion of MARKET_QUERY_EXPANSIONS) {
    expansion.pattern.lastIndex = 0;
    if (!expansion.pattern.test(source)) continue;
    expansion.pattern.lastIndex = 0;
    for (const term of expansion.terms) {
      if (/[^a-z]/i.test(term)) arabicTerms.add(normalizeProductText(term));
    }
  }
  if (!arabicTerms.size) return normalizeProductText(source);
  return [...arabicTerms].join(" / ");
}

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

  // Customer orders frequently arrive from WhatsApp/OCR with Arabic market
  // words glued together: "بوكسستالايت", "كيسملبوشانشونص",
  // "حبهترانكي", "ربطهسيم", etc. Split only known catalog vocabulary;
  // never invent a product name from the surrounding text.
  const marketWords = [
    "بوكس", "ستالايت", "ستلايت", "راليه", "رليه", "ريله", "مصعد",
    "كيس", "ملبوش", "كيوبكل", "كوبيكل", "كوبكل",
    "ديبي", "دبي", "دي بي", "كوع", "ساكت", "كتاوت",
    "واير", "سيم", "ترنكي", "حبه", "ربطه", "باكيت",
    "باكت", "طلقات", "شرمات", "كفر", "تيب", "بايب",
    "عدساني", "نحاس", "حار", "اخضر", "أخضر",
  ].sort((a, b) => b.length - a.length);

  // Separate numbers from adjacent Arabic words so "3بوكس" and "4ف6"
  // become tokenizable without changing their meaning.
  text = text
    .replace(/([^\d\s])(\d)/g, "$1 $2")
    .replace(/(\d)([^\d\s])/g, "$1 $2");

  for (const word of marketWords) {
    const escaped = word;
    text = text.replace(new RegExp("(?<!\\s)(" + escaped + ")(?!\\s)", "gi"), " $1 ");
  }

  for (const [pattern, replacement] of MARKET_SYNONYMS) text = text.replace(pattern, replacement);

  return text
    .replace(/\b(انش|inch|in)(?=(?:ونص|ونصف|ربع)\b)/gi, "$1 ")
    .replace(/(\d+(?:\.\d+)?)\s*[ف×x*]\s*(\d+(?:\.\d+)?)/gi, "$1 x $2")
    .replace(/\b4\s*[/\-]\s*3\b/g, "3/4")
    .replace(/\b3\s*[/\-]\s*4\b/g, "3/4")
    .replace(/\b1\s*[/\-]\s*2\b/g, "1/2")
    .replace(/(\d+(?:\.\d+)?)\s*["”″]/g, "$1 انش")
    .replace(/(\d+(?:\.\d+)?)\s*(?:مم|mm)\b/gi, "$1 مم")
    .replace(/(\d+(?:\.\d+)?)\s*(?:سم|cm)\b/gi, "$1 سم")
    .replace(/(\d+(?:\.\d+)?)\s*(?:انش|inch|in)\b/gi, "$1 انش")
    // Market phrasing such as "انش ونص" / "انش ونصف" means 1.5 inch.
    .replace(/\b(انش|inch|in)\s+(?:ونص|ونصف)\b/gi, "1.5 انش")
    .replace(/\b(انش|inch|in)\s+(?:ربع)\b/gi, "1.25 انش")
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

type MatchConstraints = {
  productClass: "rccb" | "mcb" | "box" | "pipe" | "cable" | "wire" | "connector" | "tape" | "glue" | "switch" | "socket" | "distribution_board" | null;
  amps: string[];
  colors: string[];
  fractions: string[];
  metricSizes: string[];
  inchSizes: string[];
  pairs: string[];
  gangs: string[];
  poles: string[];
  cores: string[];
  qualifiers: string[];
  alternativeFractions: boolean;
  alternativeInches: boolean;
};

const NUMBER_WORD_TO_DIGIT: Record<string, string> = {
  واحد: "1", واحدة: "1", اثنين: "2", اثنان: "2", اثنتين: "2", اثنتان: "2",
  ثلاث: "3", ثلاثة: "3", ثلاثه: "3", اربع: "4", اربعة: "4", اربعه: "4",
  خمس: "5", خمسة: "5", خمسه: "5", ست: "6", ستة: "6", سته: "6",
  سبع: "7", سبعة: "7", سبعه: "7", ثمان: "8", ثمانية: "8", ثمانيه: "8",
};

export function extractMatchConstraints(value: string): MatchConstraints {
  const raw = normalizeProductText(value);
  const text = raw
    .replace(/(?:^|\s)(?:four|4)\s*(?:way|gang)\b/gi, "4 دقمة")
    .replace(/(?:^|\s)(?:three|3)\s*(?:way|gang)\b/gi, "3 دقمة")
    .replace(/(?:^|\s)(?:two|2)\s*(?:way|gang)\b/gi, "2 دقمة")
    .replace(/(?:^|\s)(?:one|1)\s*(?:way|gang)\b/gi, "1 دقمة");

  const productClass =
    /\brccb\b|قاطع تسريب|قاطع تفاضلي|حماية تسرب|تسريب أرضي/.test(text) ? "rccb" :
    /\bmcb\b/.test(text) || /(?:^|\s)بريكر(?:\s|$)/.test(text) || /مفتاح حراري|مينيتشر/.test(text) ? "mcb" :
    /(?:^|\s)(?:بوكس|صندوق)(?:\s|$)/.test(text) ? "box" :
    /(?:^|\s)بايب(?:\s|$)|\bpipe(?:s)?\b/.test(text) ? "pipe" :
    /(?:^|\s)(?:كيبل|كابل)(?:\s|$)|\bcable(?:s)?\b/.test(text) ? "cable" :
    /(?:^|\s)(?:واير|سلك)(?:\s|$)|\bwire(?:s)?\b/.test(text) ? "wire" :
    /(?:^|\s)كنكتر(?:\s|$)|\bconnector(?:s)?\b/.test(text) ? "connector" :
    /(?:^|\s)تيب(?:\s|$)|\btape\b/.test(text) ? "tape" :
    /(?:^|\s)(?:لاصق|غراء)(?:\s|$)|\bglue\b/.test(text) ? "glue" :
    /(?:^|\s)مفتاح(?:\s|$)|\bswitch(?:es)?\b/.test(text) ? "switch" :
    /(?:^|\s)(?:ساكت|سكت)(?:\s|$)|\bsocket(?:s)?\b/.test(text) ? "socket" :
    /(?:^|\s)لوحة(?:\s|$)|\bsdb\b|distribution board|لوحة توزيع/.test(text) ? "distribution_board" :
    null;

  const amps = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:امبير|a)\b/gi)].map((m) => m[1]);
  const colorAliases: Array<[string, string]> = [
    ["احمر", "احمر"], ["اسود", "اسود"], ["اخضر", "اخضر"], ["ابيض", "ابيض"], ["ازرق", "ازرق"], ["اصفر", "اصفر"],
    ["red", "احمر"], ["black", "اسود"], ["green", "اخضر"], ["white", "ابيض"], ["blue", "ازرق"], ["yellow", "اصفر"],
  ];
  const textTokens = new Set(text.split(" ").filter(Boolean));
  const colors = [...new Set(
    colorAliases.filter(([needle]) => textTokens.has(needle)).map(([, canonical]) => canonical),
  )];
  const fractions = [...text.matchAll(/\b(\d+\/\d+)\b/g)].map((m) => m[1]);
  const metricSizes = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:مم2|مم|ملم|mm2|mm)(?:\s|$|[^\p{L}\p{N}])/giu)].map((m) => m[1]);
  const wireLike = /(?:^|\s)(?:واير|كيبل|كابل|سلك|wire|cable)(?:\s|$)/i.test(text);
  const marketWireMetricSizes = wireLike
    ? [...text.matchAll(/(\d+(?:\.\d+)?)\s*مل(?:\s|$|[^\p{L}\p{N}])/giu)].map((m) => m[1])
    : [];
  const inchSizes = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:انش|inch|in)\b/gi)].map((m) => m[1]);
  const pairs = [...text.matchAll(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/gi)].map((m) => `${m[1]}x${m[2]}`);
  const gangs = [...text.matchAll(/(\d+)\s*(?:دقمة|gang)\b/gi)].map((m) => m[1]);
  const poles = [...text.matchAll(/(\d+)\s*(?:قطب|pole)(?:\s|$|[^\p{L}\p{N}])/giu)].map((m) => m[1]);
  const cores = [...text.matchAll(/(\d+)\s*(?:كور|core|cores)(?:\s|$|[^\p{L}\p{N}])/giu)].map((m) => m[1]);
  const alternativeFractions = /(?:\b(?:or|او)\b)/i.test(text) && fractions.length > 1;
  const alternativeInches = /(?:\b(?:or|او)\b)/i.test(text) && inchSizes.length > 1;

  for (const [word, digit] of Object.entries(NUMBER_WORD_TO_DIGIT)) {
    if (text.includes(word)) {
      if (text.includes("دقمة") && !gangs.length) gangs.push(digit);
      if (text.includes("قطب") && !poles.length) poles.push(digit);
      if (text.includes("كور") && !cores.length) cores.push(digit);
    }
  }
  if (!gangs.length) {
    if (text.includes("رباعي")) gangs.push("4");
    else if (text.includes("ثلاثي")) gangs.push("3");
    else if (text.includes("ثنائي")) gangs.push("2");
    else if (text.includes("مفرد") || text.includes("احادي")) gangs.push("1");
  }
  if (!poles.length && (text.includes("سنجل") || text.includes("single"))) poles.push("1");

  const qualifiers: string[] = [];
  const qualifierPatterns: Array<[RegExp, string]> = [
    [/\balfa\b|الفا/gi, "الفا"],
    [/\badsany\b|\badsani\b|عدساني/gi, "عدساني"],
    [/\bsaudi\b|سعودي/gi, "سعودي"],
    [/\bgulf\b|الخليج/gi, "الخليج"],
    [/\bskimo\b|سكيمو/gi, "سكيمو"],
    [/\bdagco\b|داجكو/gi, "داجكو"],
    [/\bhyundai\b|هيواندي/gi, "هيواندي"],
    [/\bhome\s*best\b|هوم\s*بست/gi, "هوم بست"],
    [/\bpower\s*lux\b|باور\s*لوكس/gi, "باور لوكس"],
    [/\bcrabtree\b|كرابتري/gi, "كرابتري"],
    [/\bjasar\b|الجسار/gi, "الجسار"],
    [/\bmagdonia\b|ماجدونيا/gi, "ماجدونيا"],
    [/\bspanish\b|اسباني/gi, "اسباني"],
    [/\bgerman\b|germany\b|الماني/gi, "الماني"],
    [/\bkhrafy\b|خرافي/gi, "خرافي"],
    [/\bkuwaiti\b|kwyty\b|كويتي/gi, "كويتي"],
  ];
  for (const [pattern, qualifier] of qualifierPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) qualifiers.push(qualifier);
    pattern.lastIndex = 0;
  }

  return {
    productClass,
    amps,
    colors,
    fractions,
    metricSizes: [...new Set([...metricSizes, ...marketWireMetricSizes])],
    inchSizes,
    pairs,
    gangs,
    poles,
    cores: [...new Set(cores)],
    qualifiers: [...new Set(qualifiers)],
    alternativeFractions,
    alternativeInches,
  };
}

export function candidateMatchesConstraints(text: string, constraints: MatchConstraints): boolean {
  if (!constraints.productClass && !constraints.amps.length && !constraints.colors.length &&
      !constraints.fractions.length && !constraints.metricSizes.length && !constraints.inchSizes.length &&
      !constraints.pairs.length && !constraints.gangs.length && !constraints.poles.length &&
      !constraints.cores.length && !constraints.qualifiers.length) return true;

  const normalized = normalizeProductText(text);
  const hasClass = (kind: MatchConstraints["productClass"]) => {
    switch (kind) {
      case "rccb": return /\brccb\b|قاطع تسريب|قاطع تفاضلي|حماية تسرب|تسريب أرضي/.test(normalized);
      case "mcb": return /\bبريكر\b|\bmcb\b|مفتاح حراري|مينيتشر/.test(normalized) && !/\brccb\b|قاطع تسريب|قاطع تفاضلي|حماية تسرب/.test(normalized);
      case "box": return /(?:^|\s)(?:بوكس|صندوق)(?:\s|$)/.test(normalized);
      case "pipe": return /(?:^|\s)بايب(?:\s|$)|\bpipe(?:s)?\b/.test(normalized);
      case "cable": return /(?:^|\s)(?:كيبل|كابل|واير)(?:\s|$)|\b(?:cable|wire)(?:s)?\b/.test(normalized);
      case "wire": return /(?:^|\s)(?:واير|كيبل|كابل|سلك)(?:\s|$)|\b(?:wire|cable)(?:s)?\b/.test(normalized);
      case "connector": return /(?:^|\s)كنكتر(?:\s|$)|\bconnector(?:s)?\b/.test(normalized);
      case "tape": return /(?:^|\s)تيب(?:\s|$)|\btape\b/.test(normalized);
      case "glue": return /(?:^|\s)(?:لاصق|غراء)(?:\s|$)|\bglue\b/.test(normalized);
      case "switch": return /(?:^|\s)مفتاح(?:\s|$)|\bswitch(?:es)?\b/.test(normalized);
      case "socket": return /(?:^|\s)(?:ساكت|سكت)(?:\s|$)|\bsocket(?:s)?\b/.test(normalized);
      case "distribution_board": return /(?:^|\s)لوحة(?:\s|$)|لوحة توزيع|\bsdb\b|distribution board/.test(normalized);
      default: return true;
    }
  };

  if (constraints.productClass && !hasClass(constraints.productClass)) return false;

  if (constraints.qualifiers.some((qualifier) => !normalized.includes(normalizeProductText(qualifier)))) {
    return false;
  }

  const hasAmp = (value: string) => new RegExp(String.raw`(?:^|\s)${value}\s*(?:امبير|a)(?:\s|$)`, "i").test(normalized);
  if (constraints.amps.some((value) => !hasAmp(value))) return false;

  if (constraints.colors.some((color) => !normalized.includes(color))) return false;

  if (constraints.fractions.length) {
    const fractionMatches = constraints.fractions.filter((fraction) => normalized.includes(fraction));
    if (constraints.alternativeFractions ? fractionMatches.length === 0 : fractionMatches.length < constraints.fractions.length) return false;
  }

  // Gulf electrical catalogs often write millimetres as "مل" (e.g. 1.5مل).
  // Accept it for technical cable/wire size matching without globally normalizing
  // "مل", which can mean millilitre in unrelated products.
  const hasMetric = (value: string) => new RegExp(String.raw`(?:^|\s)${value}\s*(?:مم2|مم|ملم|مل|mm2|mm)(?:\s|$)`, "i").test(normalized);
  if (constraints.metricSizes.some((value) => !hasMetric(value))) return false;

  const hasInch = (value: string) => new RegExp(String.raw`(?:^|\s)${value}\s*(?:انش|inch|in)(?:\s|$)`, "i").test(normalized);
  if (constraints.inchSizes.length) {
    const inchMatches = constraints.inchSizes.filter(hasInch);
    if (constraints.alternativeInches ? inchMatches.length === 0 : inchMatches.length < constraints.inchSizes.length) return false;
  }

  if (constraints.pairs.some((pair) => {
    const [a, b] = pair.split("x");
    const nums = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
    return !(nums.includes(a) && nums.includes(b));
  })) return false;

  const hasGang = (value: string) =>
    new RegExp(String.raw`(?:^|\s)${value}\s*(?:دقمة|gang)(?:\s|$)`, "i").test(normalized) ||
    (value === "4" && normalized.includes("رباعي")) ||
    (value === "3" && normalized.includes("ثلاثي")) ||
    (value === "2" && normalized.includes("ثنائي")) ||
    (value === "1" && normalized.includes("احادي"));
  if (constraints.gangs.some((value) => !hasGang(value))) return false;

  const hasPole = (value: string) =>
    new RegExp("(?:^|\\s)" + value + "\\s*(?:قطب|pole)(?:\\s|$)", "i").test(normalized) ||
    (value === "1" && /(?:^|\s)(?:سنجل|single)(?:\s|$)/i.test(normalized));
  if (constraints.poles.some((value) => !hasPole(value))) return false;

  const hasCore = (value: string) =>
    new RegExp(String.raw`(?:^|\s)${value}\s*(?:كور|core|cores)(?:\s|$)`, "i").test(normalized);
  if (constraints.cores.some((value) => !hasCore(value))) return false;

  return true;
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
    color?: string | null;
    description?: string | null;
    category_main?: string | null;
    category_sub?: string | null;
    category_third?: string | null;
    product_group?: string | null;
  };

  return [
    item.name_ar, item.name_en, item.short_name, item.brand, item.model, item.size,
    item.color, item.description, item.category_main, item.category_sub, item.category_third,
    item.product_group, item.sku,
  ].filter(Boolean) as string[];
}

const normalizedFieldsCache = new WeakMap<object, string[]>();

function cachedNormalizedFields<T>(product: T): string[] {
  if (typeof product !== "object" || product === null) {
    return fieldValues(product).map(normalizeProductText).filter(Boolean);
  }
  const key = product as object;
  const cached = normalizedFieldsCache.get(key);
  if (cached) return cached;
  const normalized = fieldValues(product).map(normalizeProductText).filter(Boolean);
  normalizedFieldsCache.set(key, normalized);
  return normalized;
}

type PreparedText = {
  value: string;
  tokens: string[];
  numbers: string[];
  fractions: string[];
  identity: string[];
  bigrams: Set<string>;
};

const preparedTextCache = new Map<string, PreparedText>();

function prepareText(value: string): PreparedText {
  const normalized = normalizeProductText(value);
  const cached = preparedTextCache.get(normalized);
  if (cached) return cached;

  const tokens = [...new Set(normalized.split(" ").filter(Boolean))];
  const numbers = tokens.filter((token) => /^\d+(?:\.\d+)?$/.test(token));
  const fractions = tokens.filter((token) => /^\d+\/\d+$/.test(token));
  const identity = tokens.filter(
    (token) =>
      !NON_IDENTITY_TOKENS.has(token) &&
      !/^\d+(?:\.\d+)?$/.test(token) &&
      !/^\d+\/\d+$/.test(token),
  );
  const compact = normalized.replace(/\s/g, "");
  const bigramSet = new Set<string>();
  for (let i = 0; i < compact.length - 1; i += 1) {
    bigramSet.add(compact.slice(i, i + 2));
  }

  const prepared = {
    value: normalized,
    tokens,
    numbers,
    fractions,
    identity,
    bigrams: bigramSet,
  };
  preparedTextCache.set(normalized, prepared);
  return prepared;
}

type PreparedProduct<T> = {
  product: T;
  id: string;
  fields: PreparedText[];
};

const preparedProductsCache = new WeakMap<object, PreparedProduct<unknown>>();
const aliasesByArrayCache = new WeakMap<object, Map<string, string[]>>();

function prepareProduct<T>(
  product: T,
  getId: (product: T) => string,
): PreparedProduct<T> {
  if (typeof product === "object" && product !== null) {
    const cached = preparedProductsCache.get(product as object) as PreparedProduct<T> | undefined;
    if (cached) return cached;
  }

  const prepared = {
    product,
    id: getId(product),
    fields: fieldValues(product).map(prepareText).filter((field) => Boolean(field.value)),
  };

  if (typeof product === "object" && product !== null) {
    preparedProductsCache.set(product as object, prepared as PreparedProduct<unknown>);
  }
  return prepared;
}

function prepareAliases(
  aliases: Array<{ product_id: string; alias: string; normalized_alias?: string | null }>,
) {
  const cached = aliasesByArrayCache.get(aliases as object);
  if (cached) return cached;

  const byProduct = new Map<string, string[]>();
  for (const row of aliases) {
    const alias = normalizeProductText(row.normalized_alias || row.alias);
    if (!alias) continue;
    byProduct.set(row.product_id, [...(byProduct.get(row.product_id) ?? []), alias]);
  }
  aliasesByArrayCache.set(aliases as object, byProduct);
  return byProduct;
}

function preparedSoftTokenScore(query: string[], candidate: string[]): number {
  if (!query.length || !candidate.length) return 0;
  let hits = 0;
  for (const q of query) {
    if (candidate.some((c) => c === q || (q.length >= 4 && (c.startsWith(q) || q.startsWith(c))))) hits += 1;
  }
  return hits / Math.max(query.length, candidate.length);
}

function preparedCharacterScore(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const item of left) if (right.has(item)) overlap += 1;
  return (2 * overlap) / (left.size + right.size);
}

/** RapidFuzz-compatible fuzzy score, normalized to 0..1. */
function rapidFuzzyScore(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  const ratio = rapidRatio(query, candidate) / 100;
  const tokenSort = rapidTokenSortRatio(query, candidate) / 100;
  const tokenSet = rapidTokenSetRatio(query, candidate) / 100;
  return Math.max(ratio, tokenSort, tokenSet);
}

function preparedOverlapScore(query: string[], candidate: string[]): number {
  if (!query.length || !candidate.length) return 0;
  const candidateSet = new Set(candidate);
  let hits = 0;
  for (const token of query) if (candidateSet.has(token)) hits += 1;
  return hits / query.length;
}

export function rankProductMatches<T>(
  query: string,
  products: T[],
  aliases: Array<{ product_id: string; alias: string; normalized_alias?: string | null }>,
  getId: (product: T) => string,
  limit = 8,
): Array<MatchCandidate<T> & { productId: string }> {
  const queryVariants = buildMarketQueryVariants(query);
  const normalizedQuery = queryVariants[0] ?? "";
  if (!normalizedQuery) return [];

  // Hard constraints are ALWAYS extracted from the original customer wording.
  // Synonym expansion is only used to improve lexical retrieval/ranking.
  const queryConstraints = extractMatchConstraints(query);
  const preparedVariants = queryVariants.map((variant) => prepareText(variant));
  const aliasesByProduct = prepareAliases(aliases);

  const ranked = products.map((product) => {
    const preparedProduct = prepareProduct(product, getId);
    const productAliases = (aliasesByProduct.get(preparedProduct.id) ?? []).map(prepareText);
    const searchable = [...preparedProduct.fields, ...productAliases];
    const searchableText = searchable.map((field) => field.value).join(" ");

    if (!candidateMatchesConstraints(searchableText, queryConstraints)) {
      return {
        product,
        productId: preparedProduct.id,
        score: 0,
        status: "NEEDS_REVIEW" as const,
        reason: "تم استبعاد الصنف لأن مواصفة مطلوبة في الطلب لا تطابق بياناته",
        signals: { exact: false, alias: false, rapid: 0, token: 0, character: 0, attributes: 0, numeric: 0, identity: 0, cores: 0 },
      };
    }

    const exact = preparedVariants.some((variant) => preparedProduct.fields.some((field) => field.value === variant.value));
    const alias = preparedVariants.some((variant) => productAliases.some((field) => field.value === variant.value));

    const variantScores = preparedVariants.map((variant) => {
      const token = Math.max(
        0,
        ...searchable.map((field) => preparedSoftTokenScore(variant.tokens, field.tokens)),
      );
      const candidateIdentityQuick = Math.max(
        0,
        ...searchable.map((field) => preparedOverlapScore(variant.identity, field.identity)),
      );
      const character =
        token > 0 || candidateIdentityQuick > 0
          ? Math.max(
              0,
              ...searchable.map((field) => preparedCharacterScore(variant.bigrams, field.bigrams)),
            )
          : 0;
      const rapid = Math.max(
        0,
        ...searchable.map((field) => rapidFuzzyScore(variant.value, field.value)),
      );
      const identity = variant.identity.length ? candidateIdentityQuick : 1;
      const identityPrecision = variant.identity.length
        ? Math.max(
            0,
            ...searchable.map((field) => {
              if (!field.identity.length) return 0;
              const variantSet = new Set(variant.identity);
              let matched = 0;
              for (const token of field.identity) if (variantSet.has(token)) matched += 1;
              return matched / field.identity.length;
            }),
          )
        : 1;
      return { token, character, rapid, identity, identityPrecision, variant };
    });

    const bestLexical = variantScores.reduce((best, current) => {
      const currentValue = 0.55 * current.identity + 0.25 * current.token + 0.20 * current.character;
      const bestValue = 0.55 * best.identity + 0.25 * best.token + 0.20 * best.character;
      return currentValue > bestValue ? current : best;
    }, variantScores[0]);

    const token = bestLexical.token;
    const character = bestLexical.character;
    const rapid = Math.max(...variantScores.map((item) => item.rapid));
    const identity = bestLexical.identity;
    const identityPrecision = bestLexical.identityPrecision;
    const queryNumbers = [...new Set(preparedVariants.flatMap((variant) => variant.numbers))];
    const queryFractions = [...new Set(preparedVariants.flatMap((variant) => variant.fractions))];
    const candidateNumbers = [...new Set(searchable.flatMap((field) => field.numbers))];
    const candidateFractions = [...new Set(searchable.flatMap((field) => field.fractions))];

    const numeric = queryNumbers.length
      ? queryNumbers.filter((number) => candidateNumbers.includes(number)).length / queryNumbers.length
      : 1;
    const fraction = queryFractions.length
      ? queryConstraints.alternativeFractions
        ? (queryFractions.some((number) => candidateFractions.includes(number)) ? 1 : 0)
        : queryFractions.filter((number) => candidateFractions.includes(number)).length / queryFractions.length
      : 1;

    const attributes = Math.min(numeric, fraction);
    const exactNameOrAlias = exact || alias;
    const specificationConflict =
      (queryNumbers.length > 0 && numeric < 1) ||
      (queryFractions.length > 0 && fraction < 1);

    // RapidFuzz is the primary fuzzy-retrieval signal. Identity and
    // technical attributes refine it; they never override hard constraints.
    let score = exactNameOrAlias
      ? 1
      : 0.50 * rapid + 0.20 * identity + 0.10 * identityPrecision + 0.10 * token + 0.10 * attributes;

    if (identity >= 1 && identityPrecision >= 0.95 && attributes === 1) score += 0.08;
    if (specificationConflict) score = Math.min(score, 0.72);
    score = Math.max(0, Math.min(1, score));

    const constraintSignals =
      (queryConstraints.productClass && queryConstraints.productClass !== null ? 1 : 0) +
      queryConstraints.amps.length +
      queryConstraints.colors.length +
      queryConstraints.fractions.length +
      queryConstraints.metricSizes.length +
      queryConstraints.inchSizes.length +
      queryConstraints.pairs.length +
      queryConstraints.gangs.length +
      queryConstraints.poles.length +
      queryConstraints.cores.length +
      queryConstraints.qualifiers.length;

    // When the catalog candidate satisfies the product class and every
    // explicit technical constraint, give that evidence meaningful weight.
    // Technical attributes must outrank broad name similarity.
    if (!exactNameOrAlias && constraintSignals > 0 && attributes === 1) {
      const classMatched = queryConstraints.productClass !== null;
      if (classMatched) score = Math.min(1, score + 0.12);
      if (queryConstraints.amps.length || queryConstraints.gangs.length || queryConstraints.poles.length || queryConstraints.cores.length) {
        score = Math.min(1, score + 0.08);
      }
    }

    const reason = exact
      ? "مطابقة مباشرة لاسم الصنف في قاعدة البيانات"
      : alias
        ? "مطابقة مباشرة لاسم بديل محفوظ"
        : specificationConflict
          ? "الاسم قريب لكن المواصفة أو المقاس لا يطابق الطلب"
          : identity >= 0.9 && attributes === 1
            ? "مطابقة قوية للاسم والمواصفات"
            : "تشابه جزئي يحتاج مراجعة";

    const fuzzyPass = rapid >= 0.70;
    const status: MatchCandidate<T>["status"] =
      exactNameOrAlias || (fuzzyPass && attributes === 1 && score >= 0.70)
        ? "HIGH_CONFIDENCE"
        : "NEEDS_REVIEW";

    return {
      product,
      productId: preparedProduct.id,
      score,
      status,
      reason,
      signals: { exact, alias, rapid, token, character, attributes, numeric, identity, cores: queryConstraints.cores.length ? 1 : 0 },
    };
  });

  return ranked
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}


export type MatchableProductRecord = {
  id: string;
  sku: string;
  name_ar: string;
  name_en?: string | null;
  unit?: string | null;
  color?: string | null;
};

function normalizeCommercialMatchUnit(value: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (/^(?:حبة|قطعة|قطع|pcs?|pieces?|piece)$/.test(raw)) return "piece";
  if (/^(?:رول|لفة|لفه|لف|rolls?|coils?)$/.test(raw)) return "roll";
  if (/^(?:متر|meters?|meter|m)$/.test(raw)) return "meter";
  if (/^(?:كرتون|كرتونه|cartons?|carton|box|boxes)$/.test(raw)) return "carton";
  if (/^(?:علبة|عبوة)$/.test(raw)) return "container";
  if (/^(?:طقم)$/.test(raw)) return "set";
  if (/^(?:باكيت|باك|packs?|packets?)$/.test(raw)) return "pack";
  return raw;
}

function hasExplicitColor(text: string): boolean {
  return /(احمر|اسود|ابيض|اخضر|ازرق|اصفر|بني|رمادي|ذهبي|silver|red|black|white|green|blue|yellow|brown|grey|gray|gold)/i.test(
    normalizeProductText(text),
  );
}

function candidateHasSpecificColor(product: MatchableProductRecord): boolean {
  return Boolean(
    product.color?.trim() ||
      /(احمر|اسود|ابيض|اخضر|ازرق|اصفر|بني|رمادي|ذهبي|فضي|red|black|white|green|blue|yellow|brown|grey|gray|gold|silver)/i.test(
        normalizeProductText(product.name_ar + " " + (product.name_en ?? "")),
      ),
  );
}

function stripCommercialOrderTail(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(
      /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:حبة|قطعة|قطع|كرتون|كرتونه|رول|لفة|لفه|لف|باكيت|باك|متر|عبوة|علبة|طقم|كيس|صندوق|دزينة|درزن|زوج|pcs?|pieces?|piece|rolls?|coils?|packets?|packs?|cartons?|boxes?|meters?|meter)\s*$/i,
      "",
    )
    .trim();
}

export function findUniqueTechnicalProduct<T extends MatchableProductRecord>(
  text: string,
  products: T[],
): T | null {
  const constraints = extractMatchConstraints(text);
  const hasHardConstraints =
    Boolean(constraints.productClass) ||
    constraints.amps.length > 0 ||
    constraints.colors.length > 0 ||
    constraints.fractions.length > 0 ||
    constraints.metricSizes.length > 0 ||
    constraints.inchSizes.length > 0 ||
    constraints.pairs.length > 0 ||
    constraints.gangs.length > 0 ||
    constraints.poles.length > 0 ||
    constraints.cores.length > 0 ||
    constraints.qualifiers.length > 0;

  if (!hasHardConstraints) return null;

  const matches = products.filter((product) =>
    candidateMatchesConstraints(
      fieldValues(product).join(" "),
      constraints,
    ),
  );

  const uniqueProducts = [...new Map(matches.map((product) => [product.id, product])).values()];
  return uniqueProducts.length === 1 ? uniqueProducts[0] : null;
}

export function findProductByNormalizedName<T extends MatchableProductRecord>(
  text: string,
  products: T[],
): T | null {
  const target = normalizeProductText(String(text ?? ""));
  if (!target) return null;

  const matches = products.filter((product) => {
    const names = [
      String(product.name_ar ?? ""),
      String((product as MatchableProductRecord & { short_name?: string | null }).short_name ?? ""),
    ]
      .map((value) => normalizeProductText(value))
      .filter(Boolean);

    const rawTarget = String(text ?? "").trim();
    return names.some((name, nameIndex) => {
      const rawName = String(
        nameIndex === 0
          ? product.name_ar ?? ""
          : (product as MatchableProductRecord & { short_name?: string | null }).short_name ?? "",
      ).trim();
      if (rawTarget && rawName && rawTarget === rawName) return true;
      if (name === target || target.includes(name) || name.includes(target)) return true;
      const nameTokens = uniqueTokens(name).filter((token) => !NON_IDENTITY_TOKENS.has(token));
      const targetTokens = new Set(uniqueTokens(target).filter((token) => !NON_IDENTITY_TOKENS.has(token)));
      return nameTokens.length >= 2 && nameTokens.every((token) => targetTokens.has(token));
    });
  });

  const uniqueProducts = [...new Map(matches.map((product) => [product.id, product])).values()];
  return uniqueProducts.length === 1 ? uniqueProducts[0] : null;
}

export function resolveProductByNormalizedNameCandidates<T extends MatchableProductRecord>(
  texts: Array<string | null | undefined>,
  products: T[],
): {
  product: T | null;
  candidates: string[];
  conflict: boolean;
} {
  const resolved = texts
    .map((text) => findProductByNormalizedName(String(text ?? ""), products))
    .filter((product): product is T => Boolean(product));

  const uniqueProducts = [...new Map(resolved.map((product) => [product.id, product])).values()];
  return {
    product: uniqueProducts.length === 1 ? uniqueProducts[0] : null,
    candidates: uniqueProducts.map((product) => String(product.sku ?? "")),
    conflict: uniqueProducts.length > 1,
  };
}

export function findProductBySku<T extends MatchableProductRecord>(
  sku: string,
  products: T[],
): T | null {
  const target = normalizeProductText(String(sku ?? "")).replace(/\s+/g, "");
  if (!target) return null;
  return products.find((product) => {
    const candidate = normalizeProductText(String(product.sku ?? "")).replace(/\s+/g, "");
    return candidate === target;
  }) ?? null;
}

/**
 * Resolve product identity from every trustworthy SKU representation available
 * on one order row. A single resolved product is safe; conflicting resolved
 * SKUs are intentionally left unresolved instead of guessing.
 */
export function resolveProductBySkuCandidates<T extends MatchableProductRecord>(
  skus: Array<string | null | undefined>,
  products: T[],
): {
  product: T | null;
  sku: string;
  candidates: string[];
  conflict: boolean;
} {
  const normalizedInputs = [...new Set(
    skus
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .map((value) => normalizeProductText(value).replace(/\s+/g, "")),
  )];

  const resolved = normalizedInputs
    .map((normalizedSku) => {
      const product = findProductBySku(normalizedSku, products);
      return product ? { normalizedSku, product } : null;
    })
    .filter((value): value is { normalizedSku: string; product: T } => Boolean(value));

  const uniqueProducts = [...new Map(resolved.map((row) => [row.product.id, row.product])).values()];
  const uniqueSkus = [...new Set(resolved.map((row) => row.product.sku).filter(Boolean))];

  if (uniqueProducts.length !== 1) {
    return {
      product: null,
      sku: "",
      candidates: uniqueSkus,
      conflict: uniqueProducts.length > 1,
    };
  }

  return {
    product: uniqueProducts[0],
    sku: String(uniqueProducts[0].sku ?? ""),
    candidates: uniqueSkus,
    conflict: false,
  };
}

export function findLocalProductMatch<T extends MatchableProductRecord>(
  text: string,
  products: T[],
  normalizedArabic = "",
  aliases:
    | Array<{ product_id: string; alias: string; normalized_alias?: string | null }>
    | Record<string, string[]> = [],
) {
  const requestedUnit = normalizeCommercialMatchUnit(
    text.match(/(?:حبة|قطعة|قطع|كرتون|كرتونه|رول|لفة|لفه|لف|باكيت|باك|متر|عبوة|طقم|كيس|صندوق|دزينة|درزن|زوج|pcs?|pieces?|piece|rolls?|coils?|packets?|packs?|cartons?|boxes?|meters?|meter)$/i)?.[0] ?? "",
  );
  const queries = [text, normalizedArabic]
    .map(stripCommercialOrderTail)
    .filter(Boolean);
  const aliasRows = Array.isArray(aliases)
    ? aliases
    : Object.entries(aliases).flatMap(([product_id, values]) =>
        values.map((alias) => ({ product_id, alias })),
      );
  if (!queries.length) return null;

  for (const query of queries) {
    const technicalProduct = findUniqueTechnicalProduct(query, products);
    if (technicalProduct) {
      return {
        product: technicalProduct,
        score: 1,
        status: "HIGH_CONFIDENCE" as const,
        reason: "مطابقة فنية وحيدة بعد تطبيق القيود الصريحة في الطلب",
        candidates: [{
          id: technicalProduct.id,
          sku: technicalProduct.sku,
          name_ar: technicalProduct.name_ar,
          score: 1,
          reason: "منتج وحيد يطابق جميع المواصفات الصريحة",
        }],
      };
    }
  }

  const ranked = queries.flatMap((query) =>
    rankProductMatches(query, products, aliasRows, (product) => product.id, 8),
  );

  const byProduct = new Map<string, (typeof ranked)[number]>();
  for (const candidate of ranked) {
    const previous = byProduct.get(candidate.productId);
    if (!previous || candidate.score > previous.score) byProduct.set(candidate.productId, candidate);
  }

  const sorted = [...byProduct.values()].sort((a, b) => b.score - a.score);
  const unitCompatible = requestedUnit
    ? sorted.filter((candidate) => normalizeCommercialMatchUnit(candidate.product.unit ?? "") === requestedUnit)
    : sorted;
  const considered = unitCompatible.length ? unitCompatible : sorted;
  const best = considered[0];
  const second = considered[1];

  if (!best || best.score < 0.55) return null;

  const margin = second ? best.score - second.score : 1;
  const competingExactEvidence = Boolean(
    second &&
      best.product.id !== second.product.id &&
      (best.signals.exact || best.signals.alias) &&
      (second.signals.exact || second.signals.alias) &&
      Math.abs(best.score - second.score) < 0.001,
  );
  const ambiguous =
    competingExactEvidence ||
    (Boolean(second) &&
      margin < 0.10 &&
      !best.signals.exact &&
      !best.signals.alias &&
      best.product.id !== second?.product?.id);

  const bestUnit = normalizeCommercialMatchUnit(best.product.unit ?? "");
  const unitMismatch = Boolean(requestedUnit && bestUnit && requestedUnit !== bestUnit);

  const colorVariantAmbiguous =
    !hasExplicitColor(text) &&
    candidateHasSpecificColor(best.product) &&
    considered.some(
      (candidate) =>
        !candidateHasSpecificColor(candidate.product) &&
        candidate.score >= best.score - 0.12,
    );

  const queryConstraints = extractMatchConstraints(text);
  const hardConstraintCount =
    (queryConstraints.productClass ? 1 : 0) +
    queryConstraints.amps.length +
    queryConstraints.colors.length +
    queryConstraints.fractions.length +
    queryConstraints.metricSizes.length +
    queryConstraints.inchSizes.length +
    queryConstraints.pairs.length +
    queryConstraints.gangs.length +
    queryConstraints.poles.length +
    queryConstraints.cores.length +
    queryConstraints.qualifiers.length;
  const hasHardConstraints = hardConstraintCount > 0;
  const exactCatalogEvidence = best.signals.exact || best.signals.alias;
  const uniqueTechnicalMatch = hasHardConstraints && considered.length === 1;
  const autoAccept =
    !ambiguous &&
    !unitMismatch &&
    !colorVariantAmbiguous &&
    (exactCatalogEvidence || uniqueTechnicalMatch);

  const candidates = considered.slice(0, 5).map((candidate) => ({
    id: candidate.product.id,
    sku: candidate.product.sku,
    name_ar: candidate.product.name_ar,
    score: candidate.score,
    reason: candidate.reason,
  }));

  return {
    product: autoAccept ? best.product : null,
    score: best.score,
    status: autoAccept ? ("HIGH_CONFIDENCE" as const) : ("NEEDS_REVIEW" as const),
    reason: autoAccept
      ? best.reason
      : unitMismatch
        ? "مرشح قوي لكن وحدة الطلب لا تطابق وحدة بيع المنتج في القاعدة"
        : colorVariantAmbiguous
          ? "الطلب لم يحدد اللون والمرشح مرتبط بلون محدد"
          : ambiguous
            ? "أكثر من صنف في القاعدة متقارب؛ يلزم اختيار المستخدم"
            : "المرشح لم يتجاوز شروط المطابقة الآمنة",
    candidates,
  };
}
