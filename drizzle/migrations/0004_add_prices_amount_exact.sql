ALTER TABLE public.prices ADD COLUMN IF NOT EXISTS amount_exact numeric;
UPDATE public.prices SET amount_exact = amount WHERE amount_exact IS NULL;