ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team public.review_team;

CREATE OR REPLACE FUNCTION public.is_tower_ops(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','manager','operator','control_tower')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_tower_ops(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tower_ops(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "leads update owner or mgmt" ON public.leads;
CREATE POLICY "leads update owner or mgmt" ON public.leads
FOR UPDATE TO authenticated
USING (current_owner = auth.uid() OR public.is_tower_ops(auth.uid()));

DROP POLICY IF EXISTS "assign update owner or mgmt" ON public.assignments;
CREATE POLICY "assign update owner or mgmt" ON public.assignments
FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR public.is_tower_ops(auth.uid()));