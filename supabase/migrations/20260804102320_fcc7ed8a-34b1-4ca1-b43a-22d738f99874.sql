CREATE TYPE public.review_kind AS ENUM ('chat','call','lead_journey');
CREATE TYPE public.review_team AS ENUM ('control_tower','flow_ops','pcm','closing','cross_functional');
CREATE TYPE public.review_band AS ENUM ('gold','strong','coaching','risk','critical');
CREATE TYPE public.feedback_status AS ENUM ('new','viewed','acknowledged','correction_pending','submitted','re_review_pending','closed','escalated');
CREATE TYPE public.ack_choice AS ENUM ('understood','need_clarification','disagree');
CREATE TYPE public.verification_result AS ENUM ('closed_correctly','partially_corrected','correction_rejected','customer_unreachable','manager_intervention');

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  reviewee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  team public.review_team NOT NULL DEFAULT 'flow_ops',
  kind public.review_kind NOT NULL DEFAULT 'chat',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  review_day date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  source_ref text,
  transcript text,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_score integer NOT NULL DEFAULT 0,
  band public.review_band NOT NULL DEFAULT 'coaching',
  critical_error boolean NOT NULL DEFAULT false,
  critical_reasons text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  mandatory_reason text,
  what_happened text,
  what_was_missed text,
  customer_impact text,
  correct_approach text,
  corrective_action text,
  deadline timestamptz,
  status public.feedback_status NOT NULL DEFAULT 'new',
  ack public.ack_choice,
  ack_at timestamptz,
  employee_explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  correction_note text,
  evidence text[] NOT NULL DEFAULT '{}',
  submitted_at timestamptz,
  verification public.verification_result,
  reviewer_comment text,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  re_review_of uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_reviewee_day ON public.reviews(reviewee_id, review_day);
CREATE INDEX idx_reviews_status ON public.reviews(status);
CREATE INDEX idx_reviews_lead ON public.reviews(lead_id);

GRANT SELECT, INSERT, UPDATE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_select_all_authenticated" ON public.reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "reviews_insert_authenticated" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "reviews_update_participants" ON public.reviews FOR UPDATE TO authenticated
  USING (auth.uid() = reviewer_id OR auth.uid() = reviewee_id OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = reviewer_id OR auth.uid() = reviewee_id OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_reviews_upd BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.lead_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  team public.review_team,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity text NOT NULL,
  detail text,
  prev_stage text,
  new_stage text,
  prev_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  new_owner uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_outcome text,
  review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  score integer,
  feedback_status public.feedback_status,
  next_action text,
  deadline timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_timeline_lead_at ON public.lead_timeline(lead_id, at DESC);

GRANT SELECT, INSERT ON public.lead_timeline TO authenticated;
GRANT ALL ON public.lead_timeline TO service_role;
ALTER TABLE public.lead_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timeline_select_all_authenticated" ON public.lead_timeline FOR SELECT TO authenticated USING (true);
CREATE POLICY "timeline_insert_authenticated" ON public.lead_timeline FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.daily_quality_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.daily_quality_reports TO authenticated;
GRANT ALL ON public.daily_quality_reports TO service_role;
ALTER TABLE public.daily_quality_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dqr_select_all_authenticated" ON public.daily_quality_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "dqr_insert_authenticated" ON public.daily_quality_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "dqr_update_managers" ON public.daily_quality_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.tg_review_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE act text; det text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    act := 'Review created (' || NEW.kind || ')';
    det := 'Score ' || NEW.total_score || ' · band ' || NEW.band;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    act := 'Feedback ' || NEW.status;
    det := COALESCE(NEW.correction_note, NEW.corrective_action);
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    INSERT INTO public.lead_timeline(lead_id, team, actor, activity, detail, review_id, score, feedback_status, next_action, deadline)
    VALUES (NEW.lead_id, NEW.team, COALESCE(NEW.reviewer_id, NEW.reviewee_id), act, det, NEW.id, NEW.total_score, NEW.status, NEW.corrective_action, NEW.deadline);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reviews_timeline AFTER INSERT OR UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.tg_review_timeline();

CREATE OR REPLACE FUNCTION public.tg_lead_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_timeline(lead_id, team, actor, activity, new_stage, new_owner)
    VALUES (NEW.id, 'control_tower', auth.uid(), 'Lead created', NEW.status, NEW.current_owner);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_timeline(lead_id, team, actor, activity, prev_stage, new_stage)
    VALUES (NEW.id, 'control_tower', auth.uid(), 'Stage changed', OLD.status, NEW.status);
  END IF;
  IF NEW.current_owner IS DISTINCT FROM OLD.current_owner THEN
    INSERT INTO public.lead_timeline(lead_id, team, actor, activity, prev_owner, new_owner)
    VALUES (NEW.id, 'control_tower', auth.uid(), 'Owner changed', OLD.current_owner, NEW.current_owner);
  END IF;
  IF NEW.current_scenario IS DISTINCT FROM OLD.current_scenario THEN
    INSERT INTO public.lead_timeline(lead_id, team, actor, activity, customer_outcome)
    VALUES (NEW.id, 'flow_ops', auth.uid(), 'Customer outcome recorded', NEW.current_scenario::text);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_leads_timeline AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_timeline();

CREATE OR REPLACE FUNCTION public.tg_assignment_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_timeline(lead_id, team, actor, activity, new_owner, deadline)
    VALUES (NEW.lead_id, 'control_tower', auth.uid(), 'Lead assigned', NEW.owner_id, NEW.sla_deadline_accept);
  ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
    INSERT INTO public.lead_timeline(lead_id, team, actor, activity, detail, new_owner, deadline)
    VALUES (NEW.lead_id, 'flow_ops', auth.uid(), 'Assignment ' || NEW.state, NEW.reassign_reason, NEW.owner_id, NEW.sla_deadline_first_action);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_assignments_timeline AFTER INSERT OR UPDATE ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.tg_assignment_timeline();