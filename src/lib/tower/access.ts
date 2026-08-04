import type { Database } from "@/integrations/supabase/types";
import type { ReviewTeam } from "@/lib/tower/review-os";

export type Role = Database["public"]["Enums"]["app_role"];

/* ---------------- Roles ---------------- */

export const ALL_ROLES: Role[] = ["admin", "manager", "control_tower", "operator", "sales"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  control_tower: "Control Tower",
  operator: "Operator",
  sales: "Team Member",
};

export const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Full access — roles, teams, zones, settings and every review.",
  manager: "Full quality and performance view across all teams, closes reviews.",
  control_tower: "Only the major things: lead flow, assignment, SLA, review coverage and quality pulse.",
  operator: "Day-to-day lead operations plus the review queue.",
  sales: "Own leads, own feedback, and all reviews across teams.",
};

/** Roles that operate the tower itself (lead flow, assignment, SLA). */
export const TOWER_ROLES: Role[] = ["admin", "manager", "control_tower", "operator"];

/** Default team a role belongs to, used when the profile has no team set. */
export const ROLE_DEFAULT_TEAM: Partial<Record<Role, ReviewTeam>> = {
  admin: "control_tower",
  manager: "cross_functional",
  control_tower: "control_tower",
  operator: "control_tower",
};

/* ---------------- Modules ---------------- */

export type ModuleId =
  | "overview"
  | "my-leads"
  | "team"
  | "review"
  | "feedback"
  | "quality"
  | "dashboard"
  | "eod"
  | "access"
  | "admin";

export type TowerModule = {
  id: ModuleId;
  to: string;
  label: string;
  exact?: boolean;
  group: "Operations" | "Review OS" | "Management";
  purpose: string;
  roles: Role[];
};

export const MODULES: TowerModule[] = [
  {
    id: "overview",
    to: "/tower",
    label: "Control Tower",
    exact: true,
    group: "Operations",
    purpose: "Live lead flow, unassigned queue, SLA risk — the major picture only.",
    roles: ["admin", "manager", "control_tower", "operator"],
  },
  {
    id: "my-leads",
    to: "/tower/my-leads",
    label: "My Leads",
    group: "Operations",
    purpose: "The leads assigned to you, with the shared quality timeline on each.",
    roles: ["admin", "manager", "control_tower", "operator", "sales"],
  },
  {
    id: "team",
    to: "/tower/team",
    label: "Team",
    group: "Operations",
    purpose: "Who is on shift, workload and capacity across the floor.",
    roles: ["admin", "manager", "control_tower", "operator"],
  },
  {
    id: "review",
    to: "/tower/review",
    label: "Review OS",
    group: "Review OS",
    purpose: "Every chat, call and lead-journey review — visible to all teams.",
    roles: ["admin", "manager", "control_tower", "operator", "sales"],
  },
  {
    id: "feedback",
    to: "/tower/feedback",
    label: "My Feedback",
    group: "Review OS",
    purpose: "Your quality card, open corrections and deadlines.",
    roles: ["admin", "manager", "control_tower", "operator", "sales"],
  },
  {
    id: "quality",
    to: "/tower/quality",
    label: "Quality",
    group: "Review OS",
    purpose: "Company quality pulse, coverage per person and the daily cadence.",
    roles: ["admin", "manager", "control_tower"],
  },
  {
    id: "dashboard",
    to: "/tower/dashboard",
    label: "Dashboard",
    group: "Management",
    purpose: "Deeper performance analytics for managers.",
    roles: ["admin", "manager"],
  },
  {
    id: "eod",
    to: "/tower/eod",
    label: "EOD",
    group: "Management",
    purpose: "End-of-day close-out and checklist.",
    roles: ["admin", "manager", "control_tower"],
  },
  {
    id: "access",
    to: "/tower/access",
    label: "Access Map",
    group: "Management",
    purpose: "Who sees what — the role-wise visibility matrix.",
    roles: ["admin", "manager", "control_tower", "operator", "sales"],
  },
  {
    id: "admin",
    to: "/tower/admin",
    label: "Admin",
    group: "Management",
    purpose: "Roles, teams, zones and performer categories.",
    roles: ["admin"],
  },
];

export function modulesForRoles(roles: Role[]): TowerModule[] {
  if (roles.length === 0) return [];
  return MODULES.filter((m) => m.roles.some((r) => roles.includes(r)));
}

export function canAccess(id: ModuleId, roles: Role[]): boolean {
  const m = MODULES.find((x) => x.id === id);
  if (!m) return false;
  return m.roles.some((r) => roles.includes(r));
}

/** Highest-authority role held, used for the header chip. */
export function primaryRole(roles: Role[]): Role | null {
  for (const r of ALL_ROLES) if (roles.includes(r)) return r;
  return null;
}
