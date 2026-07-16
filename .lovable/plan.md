# GHARPAYY Lead Control Tower — Build Plan

A single, production-shaped operating system for 8 WhatsApp numbers. Built on Lovable Cloud (Postgres + RLS + Auth) with a TanStack Start front end. Everything is real data — no mocks, no in-memory stores.

## Guiding outcome
ZERO LEAD LEFT BEHIND. Operator enters only **Location** + **Move-in date**; the rest is captured, scored, assigned, timed and escalated automatically.

---

## Phase 1 — Data model & security (one migration)

Enums: `app_role` (admin, manager, operator, sales), `perf_category` (A, B, C, D), `lead_priority` (super_hot, hot, active, future, nurture), `zone_code`, `move_in_bucket`, `sla_state`, `scenario_code` (16 scenarios), `assignment_state`.

Tables (all in `public`, with GRANTs, RLS, `has_role()` security-definer function, and `updated_at` triggers):

- `profiles` (user_id, name, phone, zone_id, is_clocked_in, is_available, is_restricted)
- `user_roles` (user_id, role) — separate roles table per security rules
- `zones` (code, name, inventory_strength)
- `zone_membership` (user_id, zone_id, is_primary)
- `whatsapp_sources` (number, label, campaign)
- `inbound_conversations` (source_id, wa_name, phone, first_msg, last_msg, conversation_link, received_at, captured_at, captured_by, lead_id nullable)
- `leads` (phone unique-ish, wa_name, current_owner, current_zone, current_priority, current_scenario, score, location_score, movein_score, movein_bucket, movein_date, location_text, status)
- `lead_cycles` (lead_id, cycle_no, opened_at, closed_at, reason) — for returning leads
- `assignments` (lead_id, cycle_id, owner_id, assigned_at, accepted_at, first_action_at, state, sla_deadline_accept, sla_deadline_first_action, reassign_reason, previous_owner)
- `lead_scenarios_log` (lead_id, scenario, notes, created_by, created_at)
- `next_actions` (lead_id, kind, due_at, done_at, owner_id, notes)
- `sla_breaches` (assignment_id, kind, breached_at, resolved_at)
- `workload_points` (user_id snapshot: points, uncontacted, overdue_followups, tours_no_outcome, positive_no_quote, active_no_next_action, updated_at)
- `performance_scores` (user_id, window_days, conv_rate, sla_rate, tour_conv, followup_rate, crm_discipline, attendance, category, computed_at)
- `duplicate_matches` (phone, existing_lead_id, new_conversation_id, resolution)
- `audit_logs` (actor, entity, entity_id, action, prev, next, reason, at)
- `hourly_reports`, `eod_reports` (materialized snapshots)

RLS: operators & sales read/write scoped by role via `has_role()`; managers/admins broad access; `service_role` full.

## Phase 2 — Server logic (createServerFn)

- `captureConversation` — insert `inbound_conversations`.
- `checkDuplicate({phone})` — returns existing lead + cycles + history.
- `createAndAssign({conversation_id, location, movein_bucket, movein_date?})`:
  1. duplicate check → attach or open new cycle
  2. score = location_score + movein_score → priority bucket
  3. zone map from location
  4. eligible pool (active, clocked-in, zone, under cap, not restricted, category-matched)
  5. fair-distribution filter (≤40% super-hot share, no 3-in-a-row)
  6. pick best by (uncontacted↑, overdue↑, workload↑, conv↑, recency↑)
  7. insert `assignments` with SLA deadlines, audit log
- `acceptAssignment`, `declineAssignment(reason)`, `logFirstAction`.
- `setScenario({scenario, payload})` — always creates a `next_actions` row (per-scenario template).
- `reassign({lead_id, reason})` — preserves owner history.
- `recomputeWorkload(user_id)` and `recomputePerformance()` (also runnable by pg_cron nightly).
- `slaSweep()` — cron every minute: mark breaches, auto-reassign when deadline crossed.
- `hourlyReport()` and `eodReport()` — cron.
- `staffingRecommendation()` — reads last 3d volume & utilization.

All privileged fns use `requireSupabaseAuth` + `has_role()` check; `supabaseAdmin` only inside handlers when needed.

pg_cron:
- SLA sweep: `* * * * *`
- Workload recompute: `*/5 * * * *`
- Hourly report: `0 * * * *`
- Performance recompute: `0 3 * * *`

## Phase 3 — Auth & shell

- Google + Email sign-in (Cloud defaults).
- `_authenticated` layout gates the whole app.
- Roles bootstrapped: first user = admin; admin assigns others via Admin screen.

## Phase 4 — UI (TanStack routes under `_authenticated`)

- `/tower` — **Control Tower**: Incoming queue (all 8 numbers), Fast-Entry Panel (Location + Move-in only + Create&Assign), Exceptions Queue, Completion Counter. Live via Supabase Realtime.
- `/my-leads` — Sales owner view: pending accept (SLA countdown), active, scenario picker, mandatory next-action modal.
- `/team` — Workload dashboard: per-user category, points, caps, states.
- `/dashboard` — KPI cards + filters (date/hour/number/zone/priority/owner/SLA).
- `/reports/hourly`, `/reports/eod` — with **Zero Lead Left Behind** gate.
- `/admin` — scoring, workload limits, SLA, zones, roles, WhatsApp sources, staffing recommendations.
- `/leads/$id` — full lead detail: cycles, assignment history, scenarios log, next actions, audit trail.

Shared components: `SLACountdown`, `PriorityBadge`, `ScenarioPicker`, `NextActionModal`, `DuplicateResolver`, `CapacityChip`, `ExceptionCard`.

## Phase 5 — Tests & verification

Playwright end-to-end walking the 17 test cases in section 22 against the live preview with an authenticated session.

---

## Sequencing (what I'll ship this turn)

Because this is very large, I'll ship it in this order and stop for review only if you want:

1. **Migration** (all tables, enums, RLS, GRANTs, triggers, seed WhatsApp sources & zones, `has_role`, initial admin bootstrap trigger).
2. **Server functions** (`*.functions.ts`) for capture → assign → accept → scenario → next-action → reassign → SLA sweep + cron.
3. **Auth wiring** (Google + Email, `_authenticated` gate).
4. **Control Tower + My Leads + Team + Dashboard + Admin** screens wired to real data.
5. **Reports + EOD gate + Staffing alerts**.
6. Playwright smoke of the golden path.

Existing screens from earlier phases (Closing OS, Zones, Live Activity) stay in place; the Tower is added alongside and becomes the default landing route for operators.

## Technical notes / risks

- Fair-distribution counters need a rolling window table (`assignment_stats_daily`) — included in the migration.
- Auto-reassignment cron uses `SECURITY DEFINER` SQL function to avoid needing a service session.
- Realtime enabled on `inbound_conversations`, `assignments`, `next_actions` for the Tower.
- `supabaseAdmin` only for the SLA sweep cron endpoint (verified via `apikey` header per scheduled-jobs pattern).

Approve and I'll execute Phase 1 (migration) first, then stream the rest in the same turn.
