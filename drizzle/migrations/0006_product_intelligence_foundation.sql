-- Product intelligence foundation for order matching, AI processing and unit conversion.
-- Depends on 0005_security_hardening.sql.

CREATE TABLE IF NOT EXISTS public.order_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, storage_path)
);
CREATE INDEX IF NOT EXISTS order_files_order_idx ON public.order_files(order_id);

CREATE TABLE IF NOT EXISTS public.ai_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  job_type text NOT NULL CHECK (job_type IN ('ocr','vision','match','pricing')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_message text,
  input_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_processing_jobs_order_idx ON public.ai_processing_jobs(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.order_item_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank > 0),
  score numeric(6,5) NOT NULL CHECK (score >= 0 AND score <= 1),
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','accepted','rejected')),
  reason text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id, rank)
);
CREATE INDEX IF NOT EXISTS order_item_candidates_item_idx ON public.order_item_candidates(order_item_id, score DESC);

CREATE TABLE IF NOT EXISTS public.ai_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  raw_text text NOT NULL,
  normalized_text text NOT NULL,
  action text NOT NULL CHECK (action IN ('accepted','rejected','corrected','alias_added')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_corrections_product_idx ON public.ai_corrections(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_corrections_normalized_idx ON public.ai_corrections(normalized_text);

CREATE TABLE IF NOT EXISTS public.unit_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_unit text NOT NULL,
  to_unit text NOT NULL,
  multiplier numeric(18,6) NOT NULL CHECK (multiplier > 0),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_unit, to_unit, product_id)
);
CREATE INDEX IF NOT EXISTS unit_conversions_lookup_idx ON public.unit_conversions(from_unit, to_unit);

ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order files staff access" ON public.order_files FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "ai jobs staff access" ON public.ai_processing_jobs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "order candidates staff access" ON public.order_item_candidates FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "ai corrections staff access" ON public.ai_corrections FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "unit conversions staff access" ON public.unit_conversions FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_processing_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_candidates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_corrections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_conversions TO authenticated;
GRANT ALL ON public.order_files, public.ai_processing_jobs, public.order_item_candidates, public.ai_corrections, public.unit_conversions TO service_role;
