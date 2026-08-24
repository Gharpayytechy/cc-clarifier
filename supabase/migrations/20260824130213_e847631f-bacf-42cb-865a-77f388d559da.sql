CREATE TABLE public.supply_properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'admin',
  notes TEXT,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supply_properties TO authenticated;
GRANT SELECT ON public.supply_properties TO anon;
GRANT ALL ON public.supply_properties TO service_role;

ALTER TABLE public.supply_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read supply properties"
  ON public.supply_properties FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert supply properties"
  ON public.supply_properties FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update supply properties"
  ON public.supply_properties FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete supply properties"
  ON public.supply_properties FOR DELETE TO authenticated
  USING (true);

CREATE INDEX supply_properties_enabled_idx ON public.supply_properties (enabled);
CREATE INDEX supply_properties_doc_idx ON public.supply_properties USING GIN (doc);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_supply_properties_updated_at
  BEFORE UPDATE ON public.supply_properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();