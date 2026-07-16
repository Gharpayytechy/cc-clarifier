
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin','manager','operator','sales');
CREATE TYPE public.perf_category AS ENUM ('A','B','C','D');
CREATE TYPE public.lead_priority AS ENUM ('super_hot','hot','active','future','nurture');
CREATE TYPE public.move_in_bucket AS ENUM ('today','within_3d','within_7d','within_15d','within_30d','more_30d','not_confirmed');
CREATE TYPE public.assignment_state AS ENUM ('pending_accept','accepted','declined','reassigned','completed','expired');
CREATE TYPE public.scenario_code AS ENUM (
  'connected_qualified','connected_incomplete','callback_requested','no_answer',
  'whatsapp_sent','wrong_number','duplicate','location_changed','date_changed',
  'future_movein','tour_ready','virtual_tour','pre_booking','not_serviceable',
  'not_interested','invalid_spam'
);
CREATE TYPE public.sla_kind AS ENUM ('accept','first_action');
CREATE TYPE public.availability_state AS ENUM ('available','near_capacity','blocked','unavailable','restricted');

-- ============================================================
-- updated_at helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============================================================
-- user_roles + has_role
-- ============================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "roles admin write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- zones
-- ============================================================
CREATE TABLE public.zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  inventory_strength int NOT NULL DEFAULT 3, -- 1..5
  is_serviceable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zones TO authenticated;
GRANT ALL ON public.zones TO service_role;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zones read all auth" ON public.zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "zones admin write" ON public.zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_zones_upd BEFORE UPDATE ON public.zones FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  primary_zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL,
  is_clocked_in boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  is_restricted boolean NOT NULL DEFAULT false,
  performer_category public.perf_category NOT NULL DEFAULT 'C',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles read auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles self upsert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles self or admin update" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- zone_membership
-- ============================================================
CREATE TABLE public.zone_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, zone_id)
);
GRANT SELECT ON public.zone_membership TO authenticated;
GRANT ALL ON public.zone_membership TO service_role;
ALTER TABLE public.zone_membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zone_mem read" ON public.zone_membership FOR SELECT TO authenticated USING (true);
CREATE POLICY "zone_mem admin write" ON public.zone_membership FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- ============================================================
-- whatsapp_sources
-- ============================================================
CREATE TABLE public.whatsapp_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_number text NOT NULL UNIQUE,
  label text NOT NULL,
  campaign text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_sources TO authenticated;
GRANT ALL ON public.whatsapp_sources TO service_role;
ALTER TABLE public.whatsapp_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa read" ON public.whatsapp_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa admin write" ON public.whatsapp_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_wa_upd BEFORE UPDATE ON public.whatsapp_sources FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- leads
-- ============================================================
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  wa_name text,
  location_text text,
  zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL,
  movein_bucket public.move_in_bucket,
  movein_date date,
  location_score int NOT NULL DEFAULT 0,
  movein_score int NOT NULL DEFAULT 0,
  score int NOT NULL DEFAULT 0,
  priority public.lead_priority,
  current_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_scenario public.scenario_code,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX leads_phone_open_uk ON public.leads(phone) WHERE status = 'open';
CREATE INDEX leads_phone_idx ON public.leads(phone);
CREATE INDEX leads_owner_idx ON public.leads(current_owner);
CREATE INDEX leads_priority_idx ON public.leads(priority);
GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads read staff" ON public.leads FOR SELECT TO authenticated
  USING (public.any_role(auth.uid()));
CREATE POLICY "leads insert ops" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "leads update owner or mgmt" ON public.leads FOR UPDATE TO authenticated
  USING (current_owner = auth.uid() OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (current_owner = auth.uid() OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_leads_upd BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- lead_cycles (returning-lead journeys)
-- ============================================================
CREATE TABLE public.lead_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  cycle_no int NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  open_reason text,
  close_reason text,
  UNIQUE(lead_id, cycle_no)
);
GRANT SELECT, INSERT, UPDATE ON public.lead_cycles TO authenticated;
GRANT ALL ON public.lead_cycles TO service_role;
ALTER TABLE public.lead_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cycles read staff" ON public.lead_cycles FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "cycles write ops" ON public.lead_cycles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));

-- ============================================================
-- inbound_conversations
-- ============================================================
CREATE TABLE public.inbound_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.whatsapp_sources(id) ON DELETE SET NULL,
  wa_name text,
  phone text NOT NULL,
  first_message text,
  latest_message text,
  conversation_link text,
  received_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  captured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  cycle_id uuid REFERENCES public.lead_cycles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbound_phone_idx ON public.inbound_conversations(phone);
CREATE INDEX inbound_open_idx ON public.inbound_conversations(captured_at) WHERE captured_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.inbound_conversations TO authenticated;
GRANT ALL ON public.inbound_conversations TO service_role;
ALTER TABLE public.inbound_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbound read staff" ON public.inbound_conversations FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "inbound write ops" ON public.inbound_conversations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));

-- ============================================================
-- assignments
-- ============================================================
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.lead_cycles(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  priority public.lead_priority NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  first_action_at timestamptz,
  sla_deadline_accept timestamptz NOT NULL,
  sla_deadline_first_action timestamptz NOT NULL,
  state public.assignment_state NOT NULL DEFAULT 'pending_accept',
  reassign_reason text,
  reassigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_owner_idx ON public.assignments(owner_id, state);
CREATE INDEX assignments_lead_idx ON public.assignments(lead_id);
GRANT SELECT, INSERT, UPDATE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assign read staff" ON public.assignments FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "assign insert mgmt" ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "assign update owner or mgmt" ON public.assignments FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_assign_upd BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- scenarios log
-- ============================================================
CREATE TABLE public.lead_scenarios_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  scenario public.scenario_code NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.lead_scenarios_log TO authenticated;
GRANT ALL ON public.lead_scenarios_log TO service_role;
ALTER TABLE public.lead_scenarios_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scen read staff" ON public.lead_scenarios_log FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "scen insert staff" ON public.lead_scenarios_log FOR INSERT TO authenticated
  WITH CHECK (public.any_role(auth.uid()));

-- ============================================================
-- next_actions
-- ============================================================
CREATE TABLE public.next_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  due_at timestamptz NOT NULL,
  done_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX next_actions_open_idx ON public.next_actions(lead_id) WHERE done_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.next_actions TO authenticated;
GRANT ALL ON public.next_actions TO service_role;
ALTER TABLE public.next_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "next read staff" ON public.next_actions FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "next write staff" ON public.next_actions FOR ALL TO authenticated
  USING (public.any_role(auth.uid())) WITH CHECK (public.any_role(auth.uid()));
CREATE TRIGGER trg_next_upd BEFORE UPDATE ON public.next_actions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- sla_breaches
-- ============================================================
CREATE TABLE public.sla_breaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  kind public.sla_kind NOT NULL,
  breached_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(assignment_id, kind)
);
GRANT SELECT, INSERT, UPDATE ON public.sla_breaches TO authenticated;
GRANT ALL ON public.sla_breaches TO service_role;
ALTER TABLE public.sla_breaches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla read staff" ON public.sla_breaches FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "sla write mgmt" ON public.sla_breaches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

-- ============================================================
-- workload_points snapshot
-- ============================================================
CREATE TABLE public.workload_points (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points int NOT NULL DEFAULT 0,
  max_points int NOT NULL DEFAULT 25,
  uncontacted int NOT NULL DEFAULT 0,
  overdue_followups int NOT NULL DEFAULT 0,
  tours_no_outcome int NOT NULL DEFAULT 0,
  positive_no_quote int NOT NULL DEFAULT 0,
  active_no_next_action int NOT NULL DEFAULT 0,
  sla_breaches_open int NOT NULL DEFAULT 0,
  state public.availability_state NOT NULL DEFAULT 'available',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.workload_points TO authenticated;
GRANT ALL ON public.workload_points TO service_role;
ALTER TABLE public.workload_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wl read staff" ON public.workload_points FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "wl write mgmt" ON public.workload_points FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

-- ============================================================
-- performance_scores
-- ============================================================
CREATE TABLE public.performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_days int NOT NULL,
  conv_rate numeric(5,2) NOT NULL DEFAULT 0,
  sla_rate numeric(5,2) NOT NULL DEFAULT 0,
  tour_conv numeric(5,2) NOT NULL DEFAULT 0,
  followup_rate numeric(5,2) NOT NULL DEFAULT 0,
  crm_discipline numeric(5,2) NOT NULL DEFAULT 0,
  attendance numeric(5,2) NOT NULL DEFAULT 0,
  category public.perf_category NOT NULL DEFAULT 'C',
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.performance_scores TO authenticated;
GRANT ALL ON public.performance_scores TO service_role;
ALTER TABLE public.performance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf read staff" ON public.performance_scores FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "perf write mgmt" ON public.performance_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));

-- ============================================================
-- duplicate_matches
-- ============================================================
CREATE TABLE public.duplicate_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  existing_lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  new_conversation_id uuid REFERENCES public.inbound_conversations(id) ON DELETE CASCADE,
  resolution text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.duplicate_matches TO authenticated;
GRANT ALL ON public.duplicate_matches TO service_role;
ALTER TABLE public.duplicate_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dup read staff" ON public.duplicate_matches FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "dup write ops" ON public.duplicate_matches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));

-- ============================================================
-- audit_logs
-- ============================================================
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  prev jsonb,
  next jsonb,
  reason text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON public.audit_logs(entity, entity_id);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read mgmt" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR actor = auth.uid());
CREATE POLICY "audit insert staff" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.any_role(auth.uid()));

-- ============================================================
-- hourly_reports & eod_reports
-- ============================================================
CREATE TABLE public.hourly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hour_start timestamptz NOT NULL UNIQUE,
  received int NOT NULL DEFAULT 0,
  captured int NOT NULL DEFAULT 0,
  assigned int NOT NULL DEFAULT 0,
  accepted int NOT NULL DEFAULT 0,
  first_actioned int NOT NULL DEFAULT 0,
  sla_breaches int NOT NULL DEFAULT 0,
  reassignments int NOT NULL DEFAULT 0,
  duplicates int NOT NULL DEFAULT 0,
  unclear_location int NOT NULL DEFAULT 0,
  unclear_date int NOT NULL DEFAULT 0,
  pending_capture int NOT NULL DEFAULT 0,
  owners_at_capacity int NOT NULL DEFAULT 0,
  super_hot_pending int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.hourly_reports TO authenticated;
GRANT ALL ON public.hourly_reports TO service_role;
ALTER TABLE public.hourly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read staff" ON public.hourly_reports FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "hr write mgmt" ON public.hourly_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

CREATE TABLE public.eod_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.eod_reports TO authenticated;
GRANT ALL ON public.eod_reports TO service_role;
ALTER TABLE public.eod_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eod read staff" ON public.eod_reports FOR SELECT TO authenticated USING (public.any_role(auth.uid()));
CREATE POLICY "eod write mgmt" ON public.eod_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator'));

-- ============================================================
-- system_settings (scoring, workload, sla configs)
-- ============================================================
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ss read auth" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "ss admin write" ON public.system_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- First user becomes admin + auto profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles(user_id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.phone)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'operator') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'manager') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'sales') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.workload_points(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- SEED zones + whatsapp sources + default settings
-- ============================================================
INSERT INTO public.zones(code, name, inventory_strength) VALUES
  ('KOR','Koramangala',5),
  ('HSR','HSR Layout',5),
  ('BTM','BTM Layout',4),
  ('MRT','Marathahalli',4),
  ('WHF','Whitefield',4),
  ('ELC','Electronic City',3),
  ('IND','Indiranagar',3),
  ('BEL','Bellandur',4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.whatsapp_sources(wa_number, label, campaign) VALUES
  ('+919000000001','Gharpayy Main','organic'),
  ('+919000000002','Google Ads',   'google_ads'),
  ('+919000000003','Meta Ads',     'meta_ads'),
  ('+919000000004','Housing.com',  'housing'),
  ('+919000000005','MagicBricks',  'magicbricks'),
  ('+919000000006','NoBroker',     'nobroker'),
  ('+919000000007','Referral',     'referral'),
  ('+919000000008','Corporate',    'corporate')
ON CONFLICT (wa_number) DO NOTHING;

INSERT INTO public.system_settings(key, value) VALUES
  ('scoring.movein', '{"today":60,"within_3d":55,"within_7d":45,"within_15d":35,"within_30d":20,"more_30d":10,"not_confirmed":5}'::jsonb),
  ('scoring.location', '{"strong":40,"limited":35,"nearby":25,"weak":15,"unsupported":5}'::jsonb),
  ('workload.caps', '{"A":30,"B":25,"C":18,"D":0}'::jsonb),
  ('sla.super_hot', '{"accept_sec":120,"first_action_sec":300,"reassign_sec":420}'::jsonb),
  ('sla.hot',       '{"accept_sec":180,"first_action_sec":600,"reassign_sec":900}'::jsonb),
  ('sla.active',    '{"accept_sec":300,"first_action_sec":900,"reassign_sec":1200}'::jsonb),
  ('sla.future',    '{"accept_sec":900,"first_action_sec":28800,"reassign_sec":32400}'::jsonb),
  ('sla.nurture',   '{"accept_sec":900,"first_action_sec":28800,"reassign_sec":32400}'::jsonb),
  ('fair.super_hot_max_share', '0.40'::jsonb),
  ('fair.max_consecutive_super_hot', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbound_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.next_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workload_points;
