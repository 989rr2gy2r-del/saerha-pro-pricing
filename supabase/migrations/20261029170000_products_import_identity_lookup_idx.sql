-- Accelerate the exact identity lookup used by saerha_import_products_atomic.
-- The expressions match the importer predicates, including its blank-value defaults.
CREATE INDEX IF NOT EXISTS products_import_identity_lookup_idx
ON public.products (
  lower(trim(sku)),
  lower(trim(coalesce(name_ar, ''))),
  lower(trim(coalesce(brand, ''))),
  lower(trim(coalesce(unit, 'حبة'))),
  created_at,
  id
);