CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','sales')
  );
$$;

DROP POLICY IF EXISTS "customers by authenticated" ON public.customers;
CREATE POLICY "customers staff select" ON public.customers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "customers staff insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "customers staff update" ON public.customers FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "customers admin delete" ON public.customers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "orders by authenticated" ON public.orders;
CREATE POLICY "orders staff select" ON public.orders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "orders staff insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "orders staff update" ON public.orders FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "orders admin delete" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "order items by authenticated" ON public.order_items;
CREATE POLICY "order items staff select" ON public.order_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "order items staff insert" ON public.order_items FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "order items staff update" ON public.order_items FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "order items admin delete" ON public.order_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "quotations by authenticated" ON public.quotations;
CREATE POLICY "quotations staff select" ON public.quotations FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "quotations staff insert" ON public.quotations FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "quotations staff update" ON public.quotations FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "quotations admin delete" ON public.quotations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "quotation items by authenticated" ON public.quotation_items;
CREATE POLICY "quotation items staff select" ON public.quotation_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "quotation items staff insert" ON public.quotation_items FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "quotation items staff update" ON public.quotation_items FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "quotation items admin delete" ON public.quotation_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "prices by authenticated" ON public.prices;
CREATE POLICY "prices staff select" ON public.prices FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "prices staff insert" ON public.prices FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "prices staff update" ON public.prices FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "prices admin delete" ON public.prices FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "price history readable" ON public.price_history;
DROP POLICY IF EXISTS "price history insert" ON public.price_history;
CREATE POLICY "price history staff select" ON public.price_history FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "price history staff insert" ON public.price_history FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "products writable by authenticated" ON public.products;
CREATE POLICY "products staff insert" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "products staff update" ON public.products FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "products admin delete" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "aliases writable by authenticated" ON public.product_aliases;
CREATE POLICY "aliases staff insert" ON public.product_aliases FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "aliases staff update" ON public.product_aliases FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "aliases admin delete" ON public.product_aliases FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "settings writable by authenticated" ON public.app_settings;
CREATE POLICY "settings admin write" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "units writable by authenticated" ON public.units;
CREATE POLICY "units admin write" ON public.units FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));