-- ===== Enums =====
CREATE TYPE public.product_status AS ENUM ('active', 'inactive');
CREATE TYPE public.price_type AS ENUM ('retail', 'reseller', 'customer_special', 'manual_quote');
CREATE TYPE public.customer_type AS ENUM ('retail', 'wholesale', 'contractor', 'government');
CREATE TYPE public.order_source AS ENUM ('image', 'pdf', 'excel', 'text', 'handwriting');
CREATE TYPE public.order_status AS ENUM ('new', 'in_review', 'priced', 'closed');
CREATE TYPE public.quote_status AS ENUM ('draft', 'sent', 'accepted', 'expired');
CREATE TYPE public.alias_source AS ENUM ('manual', 'import', 'learned');

-- ===== Shared updated_at trigger =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===== Units =====
CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.units TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units readable" ON public.units FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "units writable by authenticated" ON public.units FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== Products =====
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  short_name text,
  brand text,
  category_main text,
  category_sub text,
  category_third text,
  product_group text,
  model text,
  size text,
  color text,
  description text,
  unit text,
  image_url text,
  status public.product_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_main_idx ON public.products (category_main);
CREATE INDEX products_brand_idx ON public.products (brand);
CREATE INDEX products_name_ar_idx ON public.products (name_ar);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products readable" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "products writable by authenticated" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== Product aliases =====
CREATE TABLE public.product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text,
  lang text,
  source public.alias_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, alias)
);
CREATE INDEX product_aliases_alias_idx ON public.product_aliases (alias);
CREATE INDEX product_aliases_normalized_idx ON public.product_aliases (normalized_alias);
GRANT SELECT ON public.product_aliases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_aliases TO authenticated;
GRANT ALL ON public.product_aliases TO service_role;
ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aliases readable" ON public.product_aliases FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "aliases writable by authenticated" ON public.product_aliases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== Customers =====
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  phone text,
  email text,
  address text,
  customer_type public.customer_type NOT NULL DEFAULT 'retail',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers by authenticated" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== Prices =====
-- Base product prices (retail/reseller) and customer-specific prices live here.
-- manual_quote prices are NOT stored here: they belong to a single quotation item
-- and must never change the product base price.
CREATE TABLE public.prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_type public.price_type NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  amount numeric(14,3) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'KWD',
  source text,
  is_active boolean NOT NULL DEFAULT true,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prices_no_manual_quote CHECK (price_type <> 'manual_quote'),
  CONSTRAINT prices_customer_scope CHECK (
    (price_type = 'customer_special' AND customer_id IS NOT NULL)
    OR (price_type <> 'customer_special' AND customer_id IS NULL)
  )
);
CREATE UNIQUE INDEX prices_base_unique ON public.prices (product_id, price_type)
  WHERE customer_id IS NULL AND is_active;
CREATE UNIQUE INDEX prices_customer_unique ON public.prices (product_id, customer_id)
  WHERE customer_id IS NOT NULL AND is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prices TO authenticated;
GRANT ALL ON public.prices TO service_role;
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prices by authenticated" ON public.prices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER prices_touch BEFORE UPDATE ON public.prices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== Price history =====
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_id uuid REFERENCES public.prices(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  price_type public.price_type NOT NULL,
  old_amount numeric(14,3),
  new_amount numeric(14,3),
  currency text NOT NULL DEFAULT 'KWD',
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_history_product_idx ON public.price_history (product_id, changed_at DESC);
GRANT SELECT, INSERT ON public.price_history TO authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price history readable" ON public.price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "price history insert" ON public.price_history FOR INSERT TO authenticated WITH CHECK (true);

-- Automatic history logging on base/customer price changes
CREATE OR REPLACE FUNCTION public.log_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.price_history (product_id, price_id, customer_id, price_type, old_amount, new_amount, currency, reason)
    VALUES (NEW.product_id, NEW.id, NEW.customer_id, NEW.price_type, NULL, NEW.amount, NEW.currency, NEW.source);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND (OLD.amount IS DISTINCT FROM NEW.amount) THEN
    INSERT INTO public.price_history (product_id, price_id, customer_id, price_type, old_amount, new_amount, currency, reason)
    VALUES (NEW.product_id, NEW.id, NEW.customer_id, NEW.price_type, OLD.amount, NEW.amount, NEW.currency, NEW.source);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prices_history AFTER INSERT OR UPDATE ON public.prices
FOR EACH ROW EXECUTE FUNCTION public.log_price_change();

-- ===== Orders =====
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  source public.order_source NOT NULL DEFAULT 'text',
  status public.order_status NOT NULL DEFAULT 'new',
  raw_text text,
  file_url text,
  notes text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders by authenticated" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  line_no integer,
  raw_name text,
  matched_sku text,
  quantity numeric(14,3),
  free_quantity numeric(14,3),
  unit text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order items by authenticated" ON public.order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== Quotations =====
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  issue_date date NOT NULL DEFAULT current_date,
  expiry_date date,
  price_type public.price_type NOT NULL DEFAULT 'retail',
  discount_amount numeric(14,3) NOT NULL DEFAULT 0,
  tax_amount numeric(14,3) NOT NULL DEFAULT 0,
  subtotal numeric(14,3) NOT NULL DEFAULT 0,
  total numeric(14,3) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'KWD',
  status public.quote_status NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotations by authenticated" ON public.quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER quotations_touch BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- quotation_items.unit_price may hold a manual_quote price; it is scoped to this
-- item only and never writes back to public.prices.
CREATE TABLE public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  line_no integer,
  product_name text NOT NULL,
  sku text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric(14,3) NOT NULL DEFAULT 0,
  applied_price_type public.price_type NOT NULL DEFAULT 'retail',
  is_manual_price boolean NOT NULL DEFAULT false,
  discount_amount numeric(14,3) NOT NULL DEFAULT 0,
  line_total numeric(14,3) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotation_items_quotation_idx ON public.quotation_items (quotation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotation_items TO service_role;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotation items by authenticated" ON public.quotation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ===== Users (profiles) & roles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'viewer');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- ===== Settings =====
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings writable by authenticated" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER app_settings_touch BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.app_settings (key, value) VALUES
('company', '{"name_ar":"شركة الأواب لتجارة الجملة والتجزئة","name_en":"AL-AWAB FOR WHOLESALE & RETAIL TRADE CO.","address_ar":"المنقف – قطعة 3 – شارع 7 – عمارة 64 – خلف المطافي – بالقرب من جمعية المعلمين","address_en":"Al-Mangaf - Block 3 - Street 7 - Building 64 - Behind the Fire Department"}'::jsonb),
('system', '{"name_ar":"سعّرها","name_en":"Saerha","tagline_ar":"نظام التسعير الذكي","currency":"KWD"}'::jsonb);

INSERT INTO public.units (code, name_ar, name_en) VALUES
('PC', 'حبة', 'Piece'),
('M', 'متر', 'Meter'),
('BAG', 'كيس', 'Bag'),
('BOX', 'كرتون', 'Box'),
('SET', 'طقم', 'Set'),
('ROLL', 'لف', 'Roll');