-- Allow retail and reseller prices for the same secondary unit.
-- Base prices remain unique by product and price type; secondary-unit prices
-- are additionally distinguished by their source unit and source price type.
DROP INDEX IF EXISTS public.prices_base_unique;

CREATE UNIQUE INDEX prices_base_unique
ON public.prices (
  product_id,
  price_type,
  (coalesce(source_field, '')),
  (coalesce(source_price_type, ''))
)
WHERE customer_id IS NULL AND is_active;
