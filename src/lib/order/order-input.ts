export type ParsedOrderItem = {
  id: string;
  description: string;
  normalized_description_ar: string;
  quantity: number;
  unit: string;
  raw_text: string;
  confidence: number;
  notes: string;
};

const ORDER_UNITS = [
  "حبة","قطعة","قطع","علبة","كرتون","كرتونه","رول","لفة","لفه","لف","باكيت","باك",
  "متر","مترات","meter","meters","m","سم","cm","مم","mm","كجم","كغ","جم","غ",
  "لتر","مل","ml","عبوة","طقم","كيس","صندوق","دزينة","درزن","dozen","dozens",
  "dz","dzn","زوج","pcs","pc","pieces","piece","roll","rolls","coil","coils",
  "packet","packets","pack","packs","carton","cartons","box","boxes",
].join("|");

const LOCAL_OCR_UNITS = [
  "حبة","قطعة","علبة","كرتون","كرتونه","متر","سم","مم","كجم","كغ","جم","غ",
  "لتر","ل","مل","رول","لفة","لفه","لف","باكيت","كيس","طقم","زوج","دزينة","درزن",
  "dozen","dozens","dz","dzn","pcs","pc","pieces","piece",
].join("|");

function toNumber(value: string): number {
  return Number(
    String(value ?? "")
      .replace(/[٠-٩]/g, (char) => String("٠١٢٣٤٥٦٧٨٩".indexOf(char)))
      .replace(/,/g, "."),
  );
}

export function normalizeQuantity(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function normalizeOrderUnit(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  const aliases: Record<string, string> = {
    "حبة": "حبة", "قطعة": "حبة", "قطع": "حبة", "pc": "حبة", "pcs": "حبة", "piece": "حبة", "pieces": "حبة",
    "كرتون": "كرتون", "كرتونه": "كرتون", "carton": "كرتون", "cartons": "كرتون",
    "علبة": "علبة", "علب": "علبة",
    "رول": "رول", "لفة": "رول", "لفه": "رول", "لف": "رول", "roll": "رول", "rolls": "رول", "coil": "رول", "coils": "رول",
    "باكيت": "باكيت", "باك": "باكيت", "pkt": "باكيت", "pkts": "باكيت", "pack": "باكيت", "packs": "باكيت", "packet": "باكيت", "packets": "باكيت",
    "متر": "متر", "m": "متر", "meter": "متر", "meters": "متر",
    "سم": "سم", "cm": "سم", "مم": "مم", "mm": "مم",
    "كيلوغرام": "كيلوغرام", "كغ": "كيلوغرام", "كجم": "كيلوغرام", "kg": "كيلوغرام",
    "غرام": "غرام", "جم": "غرام", "غ": "غرام", "g": "غرام",
    "لتر": "لتر", "l": "لتر", "liter": "لتر", "litre": "لتر",
    "مل": "مل", "ml": "مل",
    "عبوة": "عبوة", "طقم": "طقم", "كيس": "كيس", "صندوق": "صندوق",
    "دزينة": "دزينة", "درزن": "دزينة", "dozen": "دزينة", "dozens": "دزينة", "dz": "دزينة", "dzn": "دزينة",
  };
  return aliases[key] ?? raw;
}

const ORDER_FOOTER_MARKER = /(?:^|[\\s\\d'":;,.|_-])(?:subtotal|sub\\s*total|discount|total|vat|الإجمالي|الاجمالي|المجموع|الخصم|الصافي|الضريبة|المجموع\\s*الفرعي)(?=\\b|\\s|[:：]|$)/iu;

export function isOrderFooterNoise(line: string): boolean {
  const value = String(line ?? "").replace(/[|¦]+/g, " ").replace(/\\s+/g, " ").trim();
  return Boolean(value) && ORDER_FOOTER_MARKER.test(value);
}

export function stopAtOrderFooter<T>(lines: T[], getText: (line: T) => string): T[] {
  const footerIndex = lines.findIndex((line) => isOrderFooterNoise(getText(line)));
  return footerIndex >= 0 ? lines.slice(0, footerIndex) : lines;
}

export function parseLocalOcrText(text: string): ParsedOrderItem[] {
  const unitPattern = LOCAL_OCR_UNITS;
  const preparedLines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|¦]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2);
  const lines = stopAtOrderFooter(preparedLines, (line) => line);

  return lines.map((line, index) => {
    let description = line;
    let quantity = 0;
    let unit = "";

    const startMatch = line.match(new RegExp(`^([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?\\s+(.+)$`, "i"));
    const endMatch = line.match(new RegExp(`^(.+?)\\s+([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?$`, "i"));

    const tableUnitMatch = line.match(
      /(?:^|\s)(roll|rolls|rOLL|pkt|pkts|pack|packet|رول|لفة|لفه|لف|باكيت|باك|كرتون|حبة|قطعة|pcs?|pieces?)(?:\s+)([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)/i,
    );
    const numberBeforeUnit = line.match(
      /([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\s+(roll|rolls|pkt|pkts|pack|packet|رول|لفة|لفه|لف|باكيت|باك|كرتون|حبة|قطعة|pcs?|pieces?)(?:\s|$)/i,
    );

    if (tableUnitMatch) {
      quantity = toNumber(tableUnitMatch[2] ?? "");
      unit = normalizeOrderUnit(tableUnitMatch[1] ?? "");
    } else if (numberBeforeUnit) {
      quantity = toNumber(numberBeforeUnit[1] ?? "");
      unit = normalizeOrderUnit(numberBeforeUnit[2] ?? "");
    } else if (startMatch) {
      quantity = toNumber(startMatch[1] ?? "");
      unit = normalizeOrderUnit(startMatch[2] ?? "");
      description = startMatch[3].trim();
    } else if (endMatch) {
      quantity = toNumber(endMatch[2] ?? "");
      unit = normalizeOrderUnit(endMatch[3] ?? "");
      description = endMatch[1].trim();
    }

    return {
      id: `ocr-${Date.now()}-${index}`,
      description,
      normalized_description_ar: "",
      raw_text: line,
      quantity: normalizeQuantity(quantity),
      unit,
      confidence: 0.45,
      notes: "تمت القراءة محليًا من الصورة؛ راجع السطر قبل اعتماد العرض.",
    };
  });
}

export function parseTextOrderFallback(text: string): { items: ParsedOrderItem[]; notes: string } {
  const unitPattern = ORDER_UNITS;
  const preparedLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = stopAtOrderFooter(preparedLines, (line) => line);

  const items = lines.flatMap((line, index) => {
    const cleaned = line
      .replace(/[|¦]+/g, "\t")
      .replace(/^[-*•]+\s*/, "")
      .replace(/^\s*(?:م|رقم|no|item)\.?\s*/i, "")
      .replace(/^\s*\d+[.)\-:]\s*/, "")
      .trim();

    if (!cleaned || /^(?:الصنف|الكمية|الطلبية|البيان|item|product|quantity)\b/i.test(cleaned)) return [];

    const columns = cleaned.split(/\t+/).map((part) => part.trim()).filter(Boolean);
    let description = "";
    let quantity = 0;
    let unit = "";

    const quantityUnit = new RegExp(`^([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?\\s*$`, "i");
    const trailingQuantity = new RegExp(`^(.+?)\\s+([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?\\s*$`, "i");
    const leadingQuantity = new RegExp(`^([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s+(.+?)\\s+([0-9٠-٩]+(?:[.,][0-9٠-٩]+)?)\\s*(${unitPattern})?\\s*$`, "i");

    if (columns.length >= 2) {
      const last = columns[columns.length - 1] ?? "";
      const lastMatch = last.match(quantityUnit);
      if (lastMatch) {
        quantity = toNumber(lastMatch[1] ?? "");
        unit = normalizeOrderUnit(lastMatch[2] ?? "");
        description = columns.slice(0, -1).join(" ").replace(/^\d+[.)\-:]?\s+/, "").trim();
      }
    }

    if (!description) {
      const leading = cleaned.match(leadingQuantity);
      const trailing = cleaned.match(trailingQuantity);
      if (leading) {
        quantity = toNumber(leading[3] ?? "");
        unit = normalizeOrderUnit(leading[4] ?? "");
        description = (leading[2] ?? "").replace(/^\d+[.)\-:]?\s+/, "").trim();
      } else if (trailing) {
        quantity = toNumber(trailing[2] ?? "");
        unit = normalizeOrderUnit(trailing[3] ?? "");
        description = (trailing[1] ?? "").replace(/^\d+[.)\-:]?\s+/, "").trim();
      } else {
        description = cleaned.replace(/^\d+[.)\-:]?\s+/, "").trim();
      }
    }

    if (!description || !Number.isFinite(quantity) || quantity <= 0) return [];

    return [{
      id: `text-fallback-${Date.now()}-${index}`,
      description,
      normalized_description_ar: "",
      quantity: normalizeQuantity(quantity),
      unit,
      raw_text: line,
      confidence: 0.35,
      notes: "تعذر تشغيل التحليل الذكي للنص؛ تمت قراءة السطر محليًا، راجع المطابقة قبل الاعتماد.",
    }];
  });

  return {
    items,
    notes: items.length
      ? "تمت قراءة النص محليًا كخطة احتياطية. يمكنك تعديل أي سطر قبل اعتماد العرض."
      : "لم يتم العثور على صفوف واضحة في النص. جرّب فصل الصنف والكمية بعلامة Tab أو اكتب الكمية مع الوحدة.",
  };
}
