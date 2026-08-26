CREATE TABLE public.crib_bookings (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  property_id text not null,
  property_name text,
  room_type_id text not null,
  tenant_name text not null,
  country_code text not null default '+91',
  tenant_phone text not null,
  agreement_start_date date not null,
  rent_cycle text not null default 'monthly',
  monthly_rent numeric not null default 0,
  security_deposit numeric not null default 0,
  maintenance_amount numeric not null default 0,
  agreement_duration integer not null default 11,
  lock_in_period integer not null default 3,
  notice_period integer not null default 1,
  due_type text not null default 'day_of_month',
  due_value text not null default '5',
  status text not null default 'draft',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crib_bookings TO authenticated;
GRANT SELECT ON public.crib_bookings TO anon;
GRANT ALL ON public.crib_bookings TO service_role;

ALTER TABLE public.crib_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crib_bookings_read_all" ON public.crib_bookings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "crib_bookings_insert_auth" ON public.crib_bookings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "crib_bookings_update_auth" ON public.crib_bookings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "crib_bookings_delete_auth" ON public.crib_bookings FOR DELETE TO authenticated USING (public.is_tower_ops(auth.uid()));

CREATE TRIGGER trg_crib_bookings_upd BEFORE UPDATE ON public.crib_bookings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();