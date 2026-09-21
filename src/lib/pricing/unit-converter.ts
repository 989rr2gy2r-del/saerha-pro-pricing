// Unit aliases verified for pricing conversions.
export type UnitConversion = {
  from_unit: string;
  to_unit: string;
  multiplier: number;
  product_id: string | null;
};

const UNIT_ALIASES: Record<string, string> = {
  "حبة": "pcs", "حبات": "pcs", "قطعة": "pcs", "قطع": "pcs", "pc": "pcs", "pcs": "pcs",
  "علبة": "box", "علب": "box", "box": "box", "boxes": "box",
  "كرتون": "carton", "cartons": "carton", "carton": "carton",
  "كجم": "kg", "كغ": "kg", "كيلو": "kg", "كيلوغرام": "kg", "kg": "kg",
  "جرام": "g", "غرام": "g", "غم": "g", "g": "g",
  "لتر": "l", "لترات": "l", "liter": "l", "litre": "l", "l": "l",
  "مل": "ml", "مليلتر": "ml", "milliliter": "ml", "ml": "ml",
  "متر": "m", "امتار": "m", "meter": "m", "metre": "m", "m": "m",
  "سم": "cm", "سنتيمتر": "cm", "cm": "cm",
  "مم": "mm", "مليمتر": "mm", "mm": "mm",
};

const BUILTIN: Record<string, Record<string, number>> = {
  kg: { g: 1000 },
  g: { kg: 0.001 },
  l: { ml: 1000 },
  ml: { l: 0.001 },
  m: { cm: 100, mm: 1000 },
  cm: { m: 0.01, mm: 10 },
  mm: { m: 0.001, cm: 0.1 },
};

export function normalizeUnit(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return UNIT_ALIASES[raw] ?? raw;
}

export function convertQuantity(
  quantity: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
  conversions: UnitConversion[] = [],
  productId?: string,
): { quantity: number; multiplier: number; converted: boolean; reason?: string } {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { quantity: 0, multiplier: 1, converted: false, reason: "الكمية غير صالحة." };
  }

  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (!from || !to || from === to) {
    return { quantity, multiplier: 1, converted: from === to };
  }

  const edges = new Map<string, Array<{ to: string; multiplier: number }>>();
  const add = (a: string, b: string, multiplier: number) => {
    if (!Number.isFinite(multiplier) || multiplier <= 0) return;
    const list = edges.get(a) ?? [];
    list.push({ to: b, multiplier });
    edges.set(a, list);
  };

  for (const [a, targets] of Object.entries(BUILTIN)) {
    for (const [b, multiplier] of Object.entries(targets)) add(a, b, multiplier);
  }

  for (const row of conversions) {
    if (row.product_id && row.product_id !== productId) continue;
    add(normalizeUnit(row.from_unit), normalizeUnit(row.to_unit), Number(row.multiplier));
  }

  const queue: Array<{ unit: string; multiplier: number }> = [{ unit: from, multiplier: 1 }];
  const visited = new Set<string>([from]);

  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges.get(current.unit) ?? []) {
      const nextMultiplier = current.multiplier * edge.multiplier;
      if (edge.to === to) {
        return {
          quantity: Number((quantity * nextMultiplier).toFixed(6)),
          multiplier: nextMultiplier,
          converted: true,
        };
      }
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({ unit: edge.to, multiplier: nextMultiplier });
      }
    }
  }

  return {
    quantity,
    multiplier: 1,
    converted: false,
    reason: "لا يوجد تحويل معروف من " + (fromUnit || "الوحدة") + " إلى " + (toUnit || "الوحدة") + " لهذا المنتج.",
  };
}
