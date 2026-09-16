-- 1) Price types coming from real sources (kept verbatim, not merged)
ALTER TYPE public.price_type ADD VALUE IF NOT EXISTS 'unit_price';
ALTER TYPE public.price_type ADD VALUE IF NOT EXISTS 'price_after_discount';
ALTER TYPE public.price_type ADD VALUE IF NOT EXISTS 'retail_min';

-- 2) Missing product attributes + bilingual categories + source metadata
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS country_of_origin text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS warranty text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_main_en text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_sub_en text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Prices: keep the original source field name and its literal price-type label
ALTER TABLE public.prices ADD COLUMN IF NOT EXISTS source_field text;
ALTER TABLE public.prices ADD COLUMN IF NOT EXISTS source_price_type text;
ALTER TABLE public.prices ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 4) Order lines: unit price and line total (source-bound, never product stock/price)
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price numeric(14,3);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_total numeric(14,3);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

-- SKU lookup performance for import matching
CREATE INDEX IF NOT EXISTS products_sku_lookup_idx ON public.products (sku);
CREATE INDEX IF NOT EXISTS order_items_matched_sku_idx ON public.order_items (matched_sku);
CREATE INDEX IF NOT EXISTS quotation_items_sku_idx ON public.quotation_items (sku);
CREATE INDEX IF NOT EXISTS product_aliases_normalized_idx ON public.product_aliases (normalized_alias);