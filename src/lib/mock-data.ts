/**
 * بيانات تجريبية مؤقتة فقط (Demo data).
 * لا تحتوي على أي بيانات تجارية أو أسعار حقيقية.
 * ستُستبدل لاحقاً بقاعدة بيانات حقيقية:
 * Products, Customers, Prices, PriceHistory, Units, ProductAliases,
 * Quotations, QuotationItems, Orders, Users, Settings.
 */

export const COMPANY = {
  nameAr: "شركة الأواب لتجارة الجملة والتجزئة",
  nameEn: "AL-AWAB FOR WHOLESALE & RETAIL TRADE CO.",
  addressAr: "المنقف – قطعة 3 – شارع 7 – عمارة 64 – خلف المطافي – بالقرب من جمعية المعلمين",
  addressEn: "Al-Mangaf - Block 3 - Street 7 - Building 64 - Behind the Fire Department",
};

export const SYSTEM = {
  nameAr: "سعّرها",
  nameEn: "Saerha",
  taglineAr: "نظام التسعير الذكي",
  ownerLineAr: "تابع لشركة الأواب لتجارة الجملة والتجزئة",
};

/** أنواع الأسعار الأربعة المدعومة في تصميم النظام */
export type PriceType = "retail" | "reseller" | "customer_special" | "manual_quote";

export const PRICE_TYPES: {
  id: PriceType;
  labelAr: string;
  labelEn: string;
  descAr: string;
  scopeAr: string;
}[] = [
  {
    id: "retail",
    labelAr: "سعر التجزئة",
    labelEn: "Retail Price",
    descAr: "السعر الأساسي المعروض للزبون النهائي.",
    scopeAr: "سعر أساسي على مستوى المنتج",
  },
  {
    id: "reseller",
    labelAr: "سعر الموزع",
    labelEn: "Reseller Price",
    descAr: "سعر مخصص لتجار الجملة والموزعين.",
    scopeAr: "سعر أساسي على مستوى المنتج",
  },
  {
    id: "customer_special",
    labelAr: "سعر خاص بالعميل",
    labelEn: "Customer Special Price",
    descAr: "سعر مرتبط بعميل محدد، ولا يلغي أسعار المنتج الأساسية.",
    scopeAr: "مرتبط بالعميل + المنتج",
  },
  {
    id: "manual_quote",
    labelAr: "سعر يدوي داخل عرض السعر",
    labelEn: "Manual Quote Price",
    descAr: "سعر يُكتب يدوياً داخل عرض سعر معين فقط، ولا يغيّر السعر الأساسي للمنتج.",
    scopeAr: "محصور داخل بند عرض السعر",
  },
];

export type ProductStatus = "active" | "inactive";

export type Product = {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  shortName: string;
  brand: string;
  category1: string;
  category2: string;
  category3: string;
  group: string;
  model: string;
  size: string;
  color: string;
  description: string;
  unit: string;
  image: string | null;
  status: ProductStatus;
};

export const products: Product[] = [
  {
    id: "p1",
    sku: "DEMO-EL-0001",
    nameAr: "قاطع كهربائي تجريبي",
    nameEn: "Demo Circuit Breaker",
    shortName: "قاطع تجريبي",
    brand: "ماركة تجريبية أ",
    category1: "مواد الكهرباء",
    category2: "قواطع",
    category3: "قاطع أحادي",
    group: "لوحات التوزيع",
    model: "DM-16A",
    size: "16 أمبير",
    color: "أبيض",
    description: "صنف تجريبي لأغراض العرض فقط.",
    unit: "حبة",
    image: null,
    status: "active",
  },
  {
    id: "p2",
    sku: "DEMO-LT-0002",
    nameAr: "كشاف إنارة تجريبي",
    nameEn: "Demo LED Floodlight",
    shortName: "كشاف تجريبي",
    brand: "ماركة تجريبية ب",
    category1: "الإنارة",
    category2: "كشافات",
    category3: "كشاف خارجي",
    group: "إنارة خارجية",
    model: "FL-50",
    size: "50 واط",
    color: "أسود",
    description: "صنف تجريبي لأغراض العرض فقط.",
    unit: "حبة",
    image: null,
    status: "active",
  },
  {
    id: "p3",
    sku: "DEMO-PL-0003",
    nameAr: "ماسورة سباكة تجريبية",
    nameEn: "Demo PPR Pipe",
    shortName: "ماسورة تجريبية",
    brand: "ماركة تجريبية ج",
    category1: "السباكة",
    category2: "مواسير",
    category3: "ماسورة PPR",
    group: "شبكات المياه",
    model: "PPR-25",
    size: "25 مم",
    color: "أخضر",
    description: "صنف تجريبي لأغراض العرض فقط.",
    unit: "متر",
    image: null,
    status: "active",
  },
  {
    id: "p4",
    sku: "DEMO-SN-0004",
    nameAr: "خلاط مغسلة تجريبي",
    nameEn: "Demo Basin Mixer",
    shortName: "خلاط تجريبي",
    brand: "ماركة تجريبية د",
    category1: "الصحي",
    category2: "خلاطات",
    category3: "خلاط مغسلة",
    group: "أدوات صحية",
    model: "BM-100",
    size: "قياس قياسي",
    color: "كروم",
    description: "صنف تجريبي لأغراض العرض فقط.",
    unit: "حبة",
    image: null,
    status: "inactive",
  },
  {
    id: "p5",
    sku: "DEMO-BM-0005",
    nameAr: "مادة بناء تجريبية",
    nameEn: "Demo Building Material",
    shortName: "مادة تجريبية",
    brand: "ماركة تجريبية هـ",
    category1: "مواد البناء",
    category2: "مواد أساسية",
    category3: "عام",
    group: "مواد إنشائية",
    model: "BM-01",
    size: "كيس",
    color: "رمادي",
    description: "صنف تجريبي لأغراض العرض فقط.",
    unit: "كيس",
    image: null,
    status: "active",
  },
];

export type Customer = {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  type: "تجزئة" | "جملة" | "مقاول" | "جهة حكومية";
  notes: string;
  hasSpecialPricing: boolean;
};

export const customers: Customer[] = [
  {
    id: "c1",
    name: "عميل تجريبي 1",
    company: "شركة تجريبية أ",
    phone: "0000000001",
    email: "demo1@example.com",
    address: "عنوان تجريبي",
    type: "جملة",
    notes: "بيانات تجريبية فقط.",
    hasSpecialPricing: true,
  },
  {
    id: "c2",
    name: "عميل تجريبي 2",
    company: "مؤسسة تجريبية ب",
    phone: "0000000002",
    email: "demo2@example.com",
    address: "عنوان تجريبي",
    type: "مقاول",
    notes: "بيانات تجريبية فقط.",
    hasSpecialPricing: false,
  },
  {
    id: "c3",
    name: "عميل تجريبي 3",
    company: "—",
    phone: "0000000003",
    email: "demo3@example.com",
    address: "عنوان تجريبي",
    type: "تجزئة",
    notes: "بيانات تجريبية فقط.",
    hasSpecialPricing: false,
  },
];

export type OrderSource = "صورة" | "PDF" | "Excel" | "نص" | "خط اليد";
export type OrderStatus = "جديد" | "قيد المراجعة" | "تم التسعير" | "مغلق";

export type Order = {
  id: string;
  ref: string;
  customer: string;
  source: OrderSource;
  itemsCount: number;
  date: string;
  status: OrderStatus;
};

export const orders: Order[] = [
  {
    id: "o1",
    ref: "ORD-D-1001",
    customer: "عميل تجريبي 1",
    source: "صورة",
    itemsCount: 8,
    date: "2026-09-12",
    status: "قيد المراجعة",
  },
  {
    id: "o2",
    ref: "ORD-D-1002",
    customer: "عميل تجريبي 2",
    source: "PDF",
    itemsCount: 4,
    date: "2026-09-12",
    status: "جديد",
  },
  {
    id: "o3",
    ref: "ORD-D-1003",
    customer: "عميل تجريبي 3",
    source: "خط اليد",
    itemsCount: 11,
    date: "2026-09-11",
    status: "تم التسعير",
  },
  {
    id: "o4",
    ref: "ORD-D-1004",
    customer: "عميل تجريبي 1",
    source: "Excel",
    itemsCount: 25,
    date: "2026-09-10",
    status: "مغلق",
  },
];

export type QuoteStatus = "مسودة" | "مرسل" | "مقبول" | "منتهي";

export type Quote = {
  id: string;
  ref: string;
  customer: string;
  date: string;
  expiry: string;
  priceType: PriceType;
  discount: number;
  tax: number;
  total: number;
  status: QuoteStatus;
  notes: string;
  items: QuoteItem[];
};

export type QuoteItem = {
  id: string;
  productName: string;
  sku: string;
  qty: number;
  unit: string;
  unitPrice: number;
  discount: number;
  total: number;
};

export const quotes: Quote[] = [
  {
    id: "q1",
    ref: "QT-D-2001",
    customer: "عميل تجريبي 1",
    date: "2026-09-12",
    expiry: "2026-09-26",
    priceType: "reseller",
    discount: 0,
    tax: 0,
    total: 0,
    status: "مسودة",
    notes: "عرض تجريبي — بدون أسعار حقيقية.",
    items: [
      {
        id: "qi1",
        productName: "قاطع كهربائي تجريبي",
        sku: "DEMO-EL-0001",
        qty: 10,
        unit: "حبة",
        unitPrice: 0,
        discount: 0,
        total: 0,
      },
      {
        id: "qi2",
        productName: "كشاف إنارة تجريبي",
        sku: "DEMO-LT-0002",
        qty: 4,
        unit: "حبة",
        unitPrice: 0,
        discount: 0,
        total: 0,
      },
    ],
  },
  {
    id: "q2",
    ref: "QT-D-2002",
    customer: "عميل تجريبي 3",
    date: "2026-09-11",
    expiry: "2026-09-25",
    priceType: "retail",
    discount: 0,
    tax: 0,
    total: 0,
    status: "مرسل",
    notes: "عرض تجريبي.",
    items: [
      {
        id: "qi3",
        productName: "ماسورة سباكة تجريبية",
        sku: "DEMO-PL-0003",
        qty: 60,
        unit: "متر",
        unitPrice: 0,
        discount: 0,
        total: 0,
      },
    ],
  },
  {
    id: "q3",
    ref: "QT-D-2003",
    customer: "عميل تجريبي 2",
    date: "2026-09-09",
    expiry: "2026-09-23",
    priceType: "customer_special",
    discount: 0,
    tax: 0,
    total: 0,
    status: "مقبول",
    notes: "عرض تجريبي.",
    items: [
      {
        id: "qi4",
        productName: "خلاط مغسلة تجريبي",
        sku: "DEMO-SN-0004",
        qty: 6,
        unit: "حبة",
        unitPrice: 0,
        discount: 0,
        total: 0,
      },
    ],
  },
];

export const reviewAlerts = [
  {
    id: "a1",
    titleAr: "طلبية بحاجة إلى مراجعة أصناف",
    refAr: "ORD-D-1001",
    severity: "warning" as const,
  },
  {
    id: "a2",
    titleAr: "منتج تجريبي بدون سعر تجزئة",
    refAr: "DEMO-BM-0005",
    severity: "warning" as const,
  },
  { id: "a3", titleAr: "عرض سعر مسودة لم يُرسل", refAr: "QT-D-2001", severity: "info" as const },
];

export const dashboardStats = [
  { id: "orders", labelAr: "الطلبات", value: orders.length, hintAr: "بيانات تجريبية" },
  { id: "quotes", labelAr: "عروض الأسعار", value: quotes.length, hintAr: "بيانات تجريبية" },
  { id: "products", labelAr: "المنتجات", value: products.length, hintAr: "بيانات تجريبية" },
  { id: "customers", labelAr: "العملاء", value: customers.length, hintAr: "بيانات تجريبية" },
];

export function priceTypeLabel(id: PriceType) {
  return PRICE_TYPES.find((p) => p.id === id)?.labelAr ?? id;
}
