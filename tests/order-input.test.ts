import { describe, expect, it } from "vitest";

import { normalizeProductText, rankProductMatches } from "@/lib/matching/product-matcher";
import { parseTextOrderFallback } from "@/lib/order/order-input";

describe("order input parsing", () => {
  it("keeps numbered WhatsApp rows and parses the quantity from the unit, not the line number", () => {
    const text = [
      "1. PVC Circular Socket Box – 15 pcs",
      "2. PVC Solution Glue – 500 ml",
      "3. Four-Way Switch – 5 pcs",
      "4. 20A Round-Pin Power Socket / Switch – 3 pcs",
      "5. SDB Board – 12 pcs",
      "6. Single-Pole MCB – 10A – 4 pcs",
      "7. Single-Pole MCB – 20A – 3 pcs",
      "8. Multi Power Socket – 15A – 7 pcs",
      "9. RCCB Breaker – 4-Pole, 63A – 1 pc",
      "10. Electrical Tape – 12 pcs",
      "11. PVC Small Electrical Connector – 5A – 30 pcs",
      "12. Main Power Cable – 4 × 10 mm² – 30 meters",
      "13. 1.5 mm² Cable – Red – 2 coils",
      "14. 1.5 mm² Cable – Black – 2 coils",
      "15. 1.5 mm² Cable – Green (Earth) – 1 coil",
      "16. 2.5 mm² Cable – Red – 1 coil",
      "17. 2.5 mm² Cable – Black – 1 coil",
      "18. 4 mm² Cable – Red – 1 coil",
      "19. 4 mm² Cable – Black – 1 coil",
      "20. PVC Circular Box – 4 Gang – 15 pcs",
      "21. PVC Circular Box – 2 Gang – 10 pcs",
      "22. Steel Switch / Power Socket Box – 1 Gang – 16pcs",
      "23. PVC Pipe – 5/8 inch or 3/4 inch – 20",
      "24. Pvc band 5/8inch 15 pcs",
      "25. pvc choket 5/8 inch 1pcs",
    ].join("\n");

    const result = parseTextOrderFallback(text);
    expect(result.items).toHaveLength(25);
    expect(result.items[0]).toMatchObject({ quantity: 15, unit: "حبة" });
    expect(result.items[1]).toMatchObject({ quantity: 500, unit: "مل" });
    expect(result.items[11]).toMatchObject({ quantity: 30, unit: "متر" });
    expect(result.items[12]).toMatchObject({ quantity: 2, unit: "رول" });
    expect(result.items[19]).toMatchObject({ quantity: 15, unit: "حبة" });
    expect(result.items[22]).toMatchObject({ quantity: 20, unit: "" });
    expect(result.items[23]).toMatchObject({ quantity: 15, unit: "حبة" });
    expect(result.items[24]).toMatchObject({ quantity: 1, unit: "حبة" });
    expect(result.items[1].description).toBe("PVC Solution Glue –");
    expect(result.items[24].raw_text).toContain("pvc choket 5/8 inch 1pcs");
  });

  it("does not turn a numbered line into a catalog SKU", () => {
    const result = parseTextOrderFallback("25. PVC pipe 5/8 inch or 3/4 inch - 20");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ quantity: 20, unit: "" });
    expect(result.items[0].description).toContain("PVC pipe");
  });
});

describe("technical matching normalization", () => {
  it("normalizes numeric 4-way/2-way variants to the same gang signal", () => {
    expect(normalizeProductText("BOX WHITE 4WAY 20 MM")).toContain("4 دقمة");
    expect(normalizeProductText("BOX WHITE 2 WAY 20 MM")).toContain("2 دقمة");
  });

  it("uses the catalog candidate rather than guessing a product name", () => {
    const products = [
      {
        id: "a",
        sku: "228994",
        name_ar: "بوكس ابيض فور واي 4WAY 20مم",
        name_en: "BOX WHITE FOUR WAY 4WAY 20 MM",
        short_name: "بوكس ابيض فور واي 4WAY 20مم",
        brand: "",
        model: "",
        size: "",
        color: "ابيض",
        description: "",
        category_main: "بوكسات",
        category_sub: "",
        category_third: "",
        product_group: "",
        unit: "حبة",
      },
      {
        id: "b",
        sku: "31540261",
        name_ar: "بوكس ابيض تو واي 2WAY 20مم",
        name_en: "BOX WHITE TWO WAY 2WAY 20 MM",
        short_name: "بوكس ابيض تو واي 2WAY 20مم",
        brand: "",
        model: "",
        size: "",
        color: "ابيض",
        description: "",
        category_main: "بوكسات",
        category_sub: "",
        category_third: "",
        product_group: "",
        unit: "حبة",
      },
    ];

    const candidates = rankProductMatches(
      "PVC Circular Box 4 Gang",
      products,
      [],
      (product) => product.id,
      8,
    );

    expect(candidates[0]?.product.sku).toBe("228994");
  });
});
