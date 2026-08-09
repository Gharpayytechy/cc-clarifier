-- 1. Drop all open-access policies
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2. Remove anon access entirely; ensure authenticated/service_role grants
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 3. Operational tables: staff-only (any role), delete restricted to admin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','assignments','inbound_conversations','lead_cycles','lead_scenarios_log','lead_timeline','next_actions','duplicate_matches','sla_breaches','reviews'] LOOP
    EXECUTE format($f$CREATE POLICY "staff read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "staff insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "staff update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.any_role(auth.uid())) WITH CHECK (public.any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "admin delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'))$f$, t);
  END LOOP;
END $$;

-- 4. Reference / config tables: staff read, leadership write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['zones','whatsapp_sources','system_settings','zone_membership','daily_quality_reports','eod_reports','hourly_reports'] LOOP
    EXECUTE format($f$CREATE POLICY "staff read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.any_role(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "leadership write %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))$f$, t);
  END LOOP;
END $$;

-- 5. Profiles
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tower_ops(auth.uid()));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 6. Roles: read own, admin manages
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 7. Workload + performance: own row or leadership
CREATE POLICY "read own workload" ON public.workload_points FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tower_ops(auth.uid()));
CREATE POLICY "leadership write workload" ON public.workload_points FOR ALL TO authenticated
  USING (public.is_tower_ops(auth.uid())) WITH CHECK (public.is_tower_ops(auth.uid()));

CREATE POLICY "read own performance" ON public.performance_scores FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tower_ops(auth.uid()));
CREATE POLICY "leadership write performance" ON public.performance_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 8. Audit logs: admin read, staff append, immutable
CREATE POLICY "admin read audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff append audit" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.any_role(auth.uid()));
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- 9. SECURITY DEFINER functions: only policy helpers stay callable, and never by anon
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_assignment_timeline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_lead_timeline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_review_timeline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.any_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tower_ops(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.any_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tower_ops(uuid) TO authenticated;