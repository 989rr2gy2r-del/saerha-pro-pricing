-- Security hardening:
-- 1) remove anonymous access to private company data
-- 2) bind SECURITY DEFINER role helpers to the current authenticated user
-- 3) make the price-history trigger authoritative
-- 4) add basic integrity constraints for pricing/order data

REVOKE ALL ON public.units FROM anon;
REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.product_aliases FROM anon;
REVOKE ALL ON public.app_settings FROM anon;

DROP POLICY IF EXISTS "units readable" ON public.units;
DROP POLICY IF EXISTS "products readable" ON public.products;
DROP POLICY IF EXISTS "aliases readable" ON public.product_aliases;
DROP POLICY IF EXISTS "settings readable" ON public.app_settings;

CREATE POLICY "units staff select"
  ON public.units FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "products staff select"
  ON public.products FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "aliases staff select"
  ON public.product_aliases FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "settings authenticated select"
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);

-- Keep the existing function signatures so older policies remain compatible,
-- but prevent callers from checking arbitrary user IDs.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = _role
    );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'sales')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- Only the trigger should be able to append audit history.
DROP POLICY IF EXISTS "price history staff insert" ON public.price_history;
REVOKE INSERT ON public.price_history FROM authenticated;

CREATE OR REPLACE FUNCTION public.log_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.price_history (
      product_id,
      price_id,
      customer_id,
      price_type,
      old_amount,
      new_amount,
      currency,
      reason,
      changed_by
    )
    VALUES (
      NEW.product_id,
      NEW.id,
      NEW.customer_id,
      NEW.price_type,
      NULL,
      NEW.amount,
      NEW.currency,
      NEW.source,
      auth.uid()
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND (
    OLD.amount IS DISTINCT FROM NEW.amount
    OR OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.source IS DISTINCT FROM NEW.source
  ) THEN
    INSERT INTO public.price_history (
      product_id,
      price_id,
      customer_id,
      price_type,
      old_amount,
      new_amount,
      currency,
      reason,
      changed_by
    )
    VALUES (
      NEW.product_id,
      NEW.id,
      NEW.customer_id,
      NEW.price_type,
      OLD.amount,
      NEW.amount,
      NEW.currency,
      NEW.source,
      auth.uid()
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.prices
  ADD CONSTRAINT prices_valid_range_check
  CHECK (valid_to IS NULL OR valid_to > valid_from);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_nonnegative_check
  CHECK (
    (quantity IS NULL OR quantity >= 0)
    AND (free_quantity IS NULL OR free_quantity >= 0)
  );

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_amounts_nonnegative_check
  CHECK (
    discount_amount >= 0
    AND tax_amount >= 0
    AND subtotal >= 0
    AND total >= 0
  );

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_expiry_check
  CHECK (expiry_date IS NULL OR expiry_date >= issue_date);

ALTER TABLE public.quotation_items
  ADD CONSTRAINT quotation_items_amounts_nonnegative_check
  CHECK (
    quantity >= 0
    AND unit_price >= 0
    AND discount_amount >= 0
    AND line_total >= 0
  );

ALTER TABLE public.price_history
  ADD CONSTRAINT price_history_amounts_nonnegative_check
  CHECK (
    (old_amount IS NULL OR old_amount >= 0)
    AND (new_amount IS NULL OR new_amount >= 0)
  );

-- 0004 introduced amount_exact as a duplicate of prices.amount. It is not
-- referenced by the application, so keep a single canonical price amount.
ALTER TABLE public.prices DROP COLUMN IF EXISTS amount_exact;
