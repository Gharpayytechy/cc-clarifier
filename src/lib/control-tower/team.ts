// Control Tower Team — the alignment layer above zones.
//
// Design goals (from the exec team spec, verbatim intent):
//   1. A new "Control Tower Team" role exists so the CRM is never solo-dependent
//      on one operator; multiple people can hold this role and rotate.
//   2. Every CT member is guaranteed a MINIMUM worklist even on low-inbound
//      days: past 7d and past 30d leads that still deserve a nudge.
//   3. Single-owner rule is a HARD LOCK. Only one person can own/edit a lead.
//      A shadow view exists for training/handover — READ ONLY, never editable.
//   4. Flawless process = 4 feasibility gates (location · budget · date ·
//      inventory) MUST all be green before a tour is booked, and a quotation
//      MUST be sent within 15 minutes of tour completion.
//   5. Inventory focus board: today · this week · this month · why-choose.
//   6. BBD lineup: pick openers (best-lead handlers) and finishers (closers)
//      like a cricket batting order — no "random" allocation.
//   7. Chat-depth review scorecard: response speed, acknowledgment, real vs
//      lame problem, value-driven answer, next-step advancement.
//   8. Assigned work per teammate — no more "I was short of leads".
//
// Pure data + a persisted Zustand store. No I/O, no server calls. Wires to
// Cloud next turn per the user's earlier persistence choice.

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type CTShift = "morning" | "afternoon" | "evening" | "night";

export interface CTMember {
  id: string;
  name: string;
  initials: string;
  shift: CTShift;
  /** Minimum leads this CT member must work per day (old + new combined). */
  minLeadsPerDay: number;
  /** How many "old lead" revives they are expected to touch daily. */
  minOldLeadTouches: number;
  /** Present today? */
  present: boolean;
  /** Zones this member currently floats across. */
  zonesCovered: string[];
}

export const CT_TEAM_SEED: CTMember[] = [
  { id: "ct-1", name: "Aditi Rao",   initials: "AR", shift: "morning",   minLeadsPerDay: 25, minOldLeadTouches: 10, present: true,  zonesCovered: ["south", "east"] },
  { id: "ct-2", name: "Kabir Shah",  initials: "KS", shift: "morning",   minLeadsPerDay: 25, minOldLeadTouches: 10, present: true,  zonesCovered: ["north", "west"] },
  { id: "ct-3", name: "Meera Iyer",  initials: "MI", shift: "afternoon", minLeadsPerDay: 25, minOldLeadTouches: 10, present: true,  zonesCovered: ["central"] },
  { id: "ct-4", name: "Rohan Verma", initials: "RV", shift: "afternoon", minLeadsPerDay: 25, minOldLeadTouches: 10, present: true,  zonesCovered: ["south", "central"] },
  { id: "ct-5", name: "Priya Nair",  initials: "PN", shift: "evening",   minLeadsPerDay: 25, minOldLeadTouches: 10, present: true,  zonesCovered: ["east", "north"] },
  { id: "ct-6", name: "Yash Khanna", initials: "YK", shift: "evening",   minLeadsPerDay: 20, minOldLeadTouches: 8,  present: false, zonesCovered: ["west"] },
  { id: "ct-7", name: "Isha Bhatt",  initials: "IB", shift: "night",     minLeadsPerDay: 15, minOldLeadTouches: 5,  present: true,  zonesCovered: ["south", "east", "central"] },
];

// ─── Single-owner enforcement ────────────────────────────────

export type OwnershipMode = "hard-lock" | "shadow-allowed" | "cowork-legacy";

/** Result of trying to act on a lead you don't own. */
export type OwnershipAction =
  | { allowed: true }
  | { allowed: false; reason: string; requestReassign?: boolean };

export function canEditLead(
  actorId: string,
  ownerId: string,
  mode: OwnershipMode,
): OwnershipAction {
  if (actorId === ownerId) return { allowed: true };
  if (mode === "hard-lock") {
    return {
      allowed: false,
      reason: "Single-owner lock — only the assigned owner can act. Request reassignment.",
      requestReassign: true,
    };
  }
  if (mode === "shadow-allowed") {
    return {
      allowed: false,
      reason: "Shadow view — read only. Training/handover mode; edits are blocked.",
      requestReassign: true,
    };
  }
  // legacy cowork
  return { allowed: true };
}

// ─── Flawless-process 4-gate ─────────────────────────────────

export type GateKey = "location" | "budget" | "date" | "inventory";

export interface GateState {
  key: GateKey;
  label: string;
  question: string;
  status: "green" | "amber" | "red" | "unknown";
  evidence?: string;
  answeredBy?: string;
  answeredAt?: string;
}

export function newGates(): GateState[] {
  return [
    { key: "location",  label: "Location feasible",  question: "Is our inventory in the area they want?",           status: "unknown" },
    { key: "budget",    label: "Budget feasible",    question: "Does their budget match what we can offer?",         status: "unknown" },
    { key: "date",      label: "Date feasible",      question: "Can we deliver a bed by their move-in date?",        status: "unknown" },
    { key: "inventory", label: "Inventory feasible", question: "Is a specific bed/room actually available for them?", status: "unknown" },
  ];
}

export function gatesGreen(gs: GateState[]): boolean {
  return gs.every((g) => g.status === "green");
}

export function nextGateGap(gs: GateState[]): GateState | null {
  return gs.find((g) => g.status !== "green") ?? null;
}

// ─── Chat-depth review scorecard ─────────────────────────────

export interface ChatReview {
  id: string;
  leadId: string;
  reviewerId: string;
  reviewedAt: string;
  responseSpeed: 1 | 2 | 3 | 4 | 5;      // 5 = <1min
  acknowledgment: 1 | 2 | 3 | 4 | 5;     // did we acknowledge their pain
  realProblemFocus: 1 | 2 | 3 | 4 | 5;   // vs lame surface issues
  valueDrivenAnswer: 1 | 2 | 3 | 4 | 5;  // vs vague
  advancedNextStep: 1 | 2 | 3 | 4 | 5;   // did the chat move forward
  tourBookedButUnbookedReason?: string;
  stillLooking: "yes" | "no" | "never-was" | "unknown";
  whatActuallyHappened: string;
  overall: 1 | 2 | 3 | 4 | 5;
}

export function chatScore(r: ChatReview): number {
  const s = r.responseSpeed + r.acknowledgment + r.realProblemFocus + r.valueDrivenAnswer + r.advancedNextStep;
  return Math.round((s / 25) * 100);
}

// ─── Inventory focus (today · this week · this month) ────────

export type InventoryHorizon = "today" | "this-week" | "this-month" | "later";

export interface InventoryFocus {
  id: string;
  propertyName: string;
  area: string;
  bedType: string;
  price: number;
  horizon: InventoryHorizon;
  whyChoose: string;
  bedsAvailable: number;
  ownerNote?: string;
  photosCount: number;
  active: boolean;
}

export const INVENTORY_FOCUS_SEED: InventoryFocus[] = [
  { id: "if-1", propertyName: "Cove Koramangala", area: "Koramangala 5th Blk", bedType: "Single AC", price: 16500, horizon: "today", whyChoose: "Walk to Forum Mall · dedicated study · fibre wifi · veg mess", bedsAvailable: 2, ownerNote: "Owner confirmed 2 beds unlocked till Fri", photosCount: 24, active: true },
  { id: "if-2", propertyName: "Nest HSR",         area: "HSR 7th Sector",     bedType: "Double AC", price: 12500, horizon: "today", whyChoose: "New building · rooftop · 24×7 security · Jain food available", bedsAvailable: 4, photosCount: 18, active: true },
  { id: "if-3", propertyName: "Casa Indiranagar", area: "Indiranagar 100ft",  bedType: "Single AC", price: 18500, horizon: "this-week", whyChoose: "Walkable to metro · gym · 1 min from bus stop", bedsAvailable: 3, photosCount: 22, active: true },
  { id: "if-4", propertyName: "Urban Whitefield", area: "Whitefield Main",    bedType: "Triple",    price: 8500,  horizon: "this-week", whyChoose: "Cheapest in area · 5 min from IT parks · basic but clean", bedsAvailable: 6, photosCount: 12, active: true },
  { id: "if-5", propertyName: "Sky BTM",          area: "BTM 2nd Stage",      bedType: "Single Non-AC", price: 10500, horizon: "this-month", whyChoose: "Mid-budget · quiet lane · homely food", bedsAvailable: 5, photosCount: 15, active: true },
  { id: "if-6", propertyName: "Terra JP Nagar",   area: "JP Nagar 6th Phase", bedType: "Double AC", price: 13500, horizon: "this-month", whyChoose: "Balcony rooms · terrace · family-run · North-Indian mess", bedsAvailable: 4, photosCount: 20, active: true },
  { id: "if-7", propertyName: "Loft Hebbal",      area: "Hebbal RMV",         bedType: "Single AC", price: 14500, horizon: "later", whyChoose: "Airport corridor · deep discount for 12-mo lock-in", bedsAvailable: 2, photosCount: 10, active: false },
];

// ─── BBD lineup (Batting order: openers → finishers) ──────────

export type LineupSlot = "opener" | "middle" | "finisher" | "bench";

export interface LineupPick {
  memberId: string;
  memberName: string;
  role: string;
  slot: LineupSlot;
  targetBookings: number;
  reason: string;
}

export const BBD_TARGET_PER_DAY = 30; // 30 BBD/day across ~15 people

// ─── Assigned worklist ───────────────────────────────────────

export interface WorklistItem {
  id: string;
  ctMemberId: string;
  leadId: string;
  leadName: string;
  ageDays: number;
  bucket: "today" | "7d" | "30d";
  reason: string;
  status: "pending" | "in-progress" | "done" | "skipped";
  createdAt: string;
  completedAt?: string;
  outcomeNote?: string;
}

// ─── Volume awareness (spec point 1) ─────────────────────────

export interface VolumeSnapshot {
  leadsToday: number;
  leads7d: number;
  leads30d: number;
  targetToday: number; // e.g. 50/day
  perZone: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

interface CTStore {
  members: CTMember[];
  ownershipMode: OwnershipMode;
  gatesByLead: Record<string, GateState[]>;
  reviews: ChatReview[];
  inventory: InventoryFocus[];
  lineup: LineupPick[];
  worklist: WorklistItem[];
  volume: VolumeSnapshot;

  // ownership
  setOwnershipMode: (m: OwnershipMode) => void;

  // gates
  getGates: (leadId: string) => GateState[];
  setGate: (leadId: string, key: GateKey, patch: Partial<GateState>) => void;

  // reviews
  addReview: (r: Omit<ChatReview, "id" | "reviewedAt">) => ChatReview;

  // inventory
  toggleInventory: (id: string) => void;
  addInventory: (i: Omit<InventoryFocus, "id">) => void;
  removeInventory: (id: string) => void;

  // lineup
  setLineup: (picks: LineupPick[]) => void;
  updatePick: (memberId: string, patch: Partial<LineupPick>) => void;

  // worklist
  assignWorklist: (items: Omit<WorklistItem, "id" | "createdAt" | "status">[]) => void;
  markWorklist: (id: string, status: WorklistItem["status"], outcomeNote?: string) => void;

  // volume
  setVolume: (v: Partial<VolumeSnapshot>) => void;
}

const uid = () => `ct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const useControlTower = create<CTStore>()(
  persist(
    (set, get) => ({
      members: CT_TEAM_SEED,
      ownershipMode: "shadow-allowed",
      gatesByLead: {},
      reviews: [],
      inventory: INVENTORY_FOCUS_SEED,
      lineup: [],
      worklist: [],
      volume: {
        leadsToday: 42,
        leads7d: 287,
        leads30d: 1108,
        targetToday: 50,
        perZone: { south: 96, central: 58, east: 71, north: 40, west: 22 },
      },

      setOwnershipMode: (m) => set({ ownershipMode: m }),

      getGates: (leadId) => get().gatesByLead[leadId] ?? newGates(),
      setGate: (leadId, key, patch) =>
        set((s) => {
          const current = s.gatesByLead[leadId] ?? newGates();
          return {
            gatesByLead: {
              ...s.gatesByLead,
              [leadId]: current.map((g) => (g.key === key ? { ...g, ...patch, answeredAt: new Date().toISOString() } : g)),
            },
          };
        }),

      addReview: (r) => {
        const rec: ChatReview = { ...r, id: uid(), reviewedAt: new Date().toISOString() };
        set((s) => ({ reviews: [rec, ...s.reviews].slice(0, 500) }));
        return rec;
      },

      toggleInventory: (id) =>
        set((s) => ({
          inventory: s.inventory.map((i) => (i.id === id ? { ...i, active: !i.active } : i)),
        })),
      addInventory: (i) => set((s) => ({ inventory: [{ ...i, id: uid() }, ...s.inventory] })),
      removeInventory: (id) => set((s) => ({ inventory: s.inventory.filter((i) => i.id !== id) })),

      setLineup: (picks) => set({ lineup: picks }),
      updatePick: (memberId, patch) =>
        set((s) => ({
          lineup: s.lineup.map((p) => (p.memberId === memberId ? { ...p, ...patch } : p)),
        })),

      assignWorklist: (items) => {
        const now = new Date().toISOString();
        const rows: WorklistItem[] = items.map((i) => ({ ...i, id: uid(), createdAt: now, status: "pending" }));
        set((s) => ({ worklist: [...rows, ...s.worklist].slice(0, 2000) }));
      },
      markWorklist: (id, status, outcomeNote) =>
        set((s) => ({
          worklist: s.worklist.map((w) =>
            w.id === id
              ? { ...w, status, outcomeNote, completedAt: status === "done" ? new Date().toISOString() : w.completedAt }
              : w,
          ),
        })),

      setVolume: (v) => set((s) => ({ volume: { ...s.volume, ...v } })),
    }),
    { name: "control-tower-team-v1" },
  ),
);

// ─────────────────────────────────────────────────────────────
// Helpers used across UI
// ─────────────────────────────────────────────────────────────

export function inventoryByHorizon(all: InventoryFocus[]): Record<InventoryHorizon, InventoryFocus[]> {
  return {
    today: all.filter((i) => i.horizon === "today"),
    "this-week": all.filter((i) => i.horizon === "this-week"),
    "this-month": all.filter((i) => i.horizon === "this-month"),
    later: all.filter((i) => i.horizon === "later"),
  };
}

export function suggestLineup(
  members: { id: string; name: string; role?: string; performance?: number }[],
): LineupPick[] {
  const sorted = [...members].sort((a, b) => (b.performance ?? 50) - (a.performance ?? 50));
  return sorted.map((m, idx) => {
    let slot: LineupSlot;
    let target: number;
    let reason: string;
    if (idx < 3) {
      slot = "opener";
      target = 4;
      reason = "Best hit-rate — takes the top-priority hot leads at day open.";
    } else if (idx < 9) {
      slot = "middle";
      target = 2;
      reason = "Consistent middle order — steady 2 BBD from warm leads.";
    } else if (idx < 13) {
      slot = "finisher";
      target = 1;
      reason = "Closer role — negotiates and finishes at day-end.";
    } else {
      slot = "bench";
      target = 0;
      reason = "Bench / rotation cover.";
    }
    return {
      memberId: m.id,
      memberName: m.name,
      role: m.role ?? "TCM",
      slot,
      targetBookings: target,
      reason,
    };
  });
}