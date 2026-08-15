/**
 * Role guarantee — the workflow promise, expressed once per role.
 *
 * The org score answers "is the company moving?". This answers the harder
 * question: "is the guarantee holding for MY role?" Every role gets the same
 * five checks (owned · dated · in SLA · handed over intact · outcome recorded)
 * scored only on the work that role is accountable for, so no role can hide
 * behind another role's healthy numbers.
 */

import {
  DAY, HOUR, roleOfFunction, type LeadMotion, type PersonFlow,
  type ViolationCode, type WorkRoleId, WORK_ROLES,
} from "./engine";

export interface RoleMeta {
  id: WorkRoleId;
  label: string;
  /** the single sentence this role must be able to guarantee */
  promise: string;
  /** violations this role is accountable for clearing */
  owns: ViolationCode[];
  queueTo: string;
}

export const ROLE_META: Record<WorkRoleId, RoleMeta> = {
  "flow-ops": {
    id: "flow-ops",
    label: "Flow Ops",
    promise: "Every new lead is called fast, and no owned lead goes 24h without contact.",
    owns: ["NO_OWNER", "FIRST_CALL_OVERDUE", "NO_CALL_24H", "NO_NEXT_ACTION", "CONNECTED_NO_OUTCOME", "FOLLOWUP_OVERDUE"],
    queueTo: "/my-work",
  },
  tour: {
    id: "tour",
    label: "Tour / TCM",
    promise: "Every scheduled tour has a manager, gets confirmed, and is closed out with an outcome.",
    owns: ["TOUR_NO_OWNER", "TOUR_NOT_CONFIRMED", "TOUR_DONE_NO_OUTCOME", "FOLLOWUP_OVERDUE", "NO_NEXT_ACTION"],
    queueTo: "/tours",
  },
  closing: {
    id: "closing",
    label: "Closing",
    promise: "Every toured customer gets a quote, and every quote gets a dated closing follow-up.",
    owns: ["TOUR_DONE_NO_QUOTE", "QUOTE_NO_FOLLOWUP", "PAYMENT_INTENT_IDLE", "STAGE_IDLE", "NO_NEXT_ACTION"],
    queueTo: "/closing",
  },
  supply: {
    id: "supply",
    label: "Supply / PCM",
    promise: "No lead stays blocked on inventory — every block has a reason and a resolution date.",
    owns: ["INVENTORY_BLOCKED"],
    queueTo: "/inventory",
  },
  "check-in": {
    id: "check-in",
    label: "Booking & Check-in",
    promise: "Every booking is handed over with a named check-in owner and a date.",
    owns: ["BOOKING_NO_HANDOVER"],
    queueTo: "/tower/interventions",
  },
};

export interface RolePart { label: string; pct: number; detail: string }

export interface RoleGuarantee {
  role: WorkRoleId;
  meta: RoleMeta;
  /** leads currently sitting in this role's part of the chain */
  total: number;
  breaches: number;
  p0: number;
  score: number;
  state: "sealed" | "strained" | "broken";
  parts: RolePart[];
  /** most urgent items for this role, already ranked */
  top: LeadMotion[];
  people: PersonFlow[];
  headline: string;
}

const pct = (ok: number, total: number) => (total === 0 ? 100 : Math.round((ok / total) * 1000) / 10);
const stateOf = (p: number) => (p >= 95 ? "sealed" : p >= 80 ? "strained" : "broken") as RoleGuarantee["state"];

export function boardForRole(board: LeadMotion[], role: WorkRoleId): LeadMotion[] {
  return board.filter((m) => roleOfFunction(m.fn) === role);
}

export function roleGuarantee(board: LeadMotion[], people: PersonFlow[], role: WorkRoleId, now: number): RoleGuarantee {
  const meta = ROLE_META[role];
  const mine = boardForRole(board, role);
  const total = mine.length;

  const owned = mine.filter((m) => m.ownerId).length;
  const dated = mine.filter((m) => m.dueAt !== null || m.health === "blocked").length;
  const inSla = mine.filter((m) => !m.violations.some((v) => v.severity === "P0")).length;
  const intact = mine.filter((m) => !m.violations.some((v) => meta.owns.includes(v.code) && v.severity !== "P2")).length;
  const fresh = mine.filter((m) => m.idleMs < 2 * DAY || m.health === "blocked").length;

  const parts: RolePart[] = [
    { label: "Owned", pct: pct(owned, total), detail: `${total - owned} without an owner` },
    { label: "Dated next step", pct: pct(dated, total), detail: `${total - dated} with no due time` },
    { label: "Inside SLA", pct: pct(inSla, total), detail: `${total - inSla} breached` },
    { label: "Role promise held", pct: pct(intact, total), detail: `${total - intact} breaking this role's promise` },
    { label: "Still moving", pct: pct(fresh, total), detail: `${total - fresh} idle over 48h` },
  ];

  const score = Math.round((parts.reduce((s, p) => s + p.pct, 0) / parts.length) * 10) / 10;
  const breaches = mine.filter((m) => m.violations.some((v) => meta.owns.includes(v.code))).length;
  const p0 = mine.filter((m) => m.violations.some((v) => v.severity === "P0")).length;
  const rolePeople = people.filter((p) => p.role === role);

  const worstPart = [...parts].sort((a, b) => a.pct - b.pct)[0];
  const headline = total === 0
    ? "No work in this role right now — the guarantee holds by default."
    : score >= 95
      ? "Guarantee holding. Every item is owned, dated and inside SLA."
      : `Weakest link: ${worstPart.label.toLowerCase()} — ${worstPart.detail}.`;

  return {
    role, meta, total, breaches, p0, score, state: stateOf(score), parts,
    top: mine.filter((m) => m.violations.length).slice(0, 5),
    people: rolePeople,
    headline,
  };
}

export function allRoleGuarantees(board: LeadMotion[], people: PersonFlow[], now: number): RoleGuarantee[] {
  return WORK_ROLES.map((r) => roleGuarantee(board, people, r, now))
    .sort((a, b) => a.score - b.score);
}

/** Org score that only counts as 100% when EVERY role is at 100%. */
export function allRolesScore(roles: RoleGuarantee[]): number {
  const active = roles.filter((r) => r.total > 0);
  if (!active.length) return 100;
  return Math.round(Math.min(...active.map((r) => r.score)) * 10) / 10;
}

export { HOUR };
