// Deterministic multi-cycle seed for demo/testing.
// Populates useLifecycle with 15 cycles for a demo lead (l-11 Aakash B.),
// plus a few cycles + a live co-work claim on other leads so QA can see
// the returning-lead history + parallel-owner claim UI without clicks.
// Idempotent — runs once, marked by a version key.
import { useLifecycle, type LeadCycle, type CycleCloseReason, type RevivalReason } from "./lifecycle";
import { useLiveActivity } from "@/lib/live-activity";

const SEED_VERSION = "gharpayy-lifecycle-seed-v3";

const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

interface CycleSpec {
  daysAgo: number;             // opened this many days ago
  durationDays: number;        // stayed open this many days
  closeReason: CycleCloseReason;
  revivalReason?: RevivalReason;
  tcm: string;
  notes: string;
  reused?: string[];
}

// 15 cycles across ~24 months — a realistic returning-lead journey.
const AAKASH_15: CycleSpec[] = [
  { daysAgo: 730, durationDays: 12, closeReason: "lost-price", tcm: "tcm-3",
    notes: "Jan '24 — first enquiry, priced out at ₹15.5k Koramangala." },
  { daysAgo: 640, durationDays: 8, closeReason: "ghosted", revivalReason: "budget-ready", tcm: "tcm-3",
    notes: "Apr '24 — came back, went silent after 2 tours.", reused: ["food","idCollected"] },
  { daysAgo: 560, durationDays: 15, closeReason: "lost-own-arrangement", revivalReason: "family-approved", tcm: "tcm-2",
    notes: "Jul '24 — parents pushed him to a friend's flat.", reused: ["food","budget","idCollected"] },
  { daysAgo: 500, durationDays: 6, closeReason: "deferred", revivalReason: "season-change", tcm: "tcm-2",
    notes: "Sep '24 — deferred move-in by a quarter.", reused: ["food","budget","preferredArea"] },
  { daysAgo: 440, durationDays: 9, closeReason: "lost-competitor", revivalReason: "price-drop-seen", tcm: "tcm-1",
    notes: "Nov '24 — booked a Stanza, cancelled in 3 days.", reused: ["budget","idCollected"] },
  { daysAgo: 380, durationDays: 4, closeReason: "cancelled-after-book", revivalReason: "returning-customer", tcm: "tcm-1",
    notes: "Jan '25 — booked us, then dad had health scare.", reused: ["budget","idCollected","food"] },
  { daysAgo: 320, durationDays: 7, closeReason: "health-emergency", revivalReason: "family-approved", tcm: "tcm-1",
    notes: "Mar '25 — put on hold for father's surgery." },
  { daysAgo: 260, durationDays: 11, closeReason: "lost-location", revivalReason: "new-city", tcm: "tcm-4",
    notes: "May '25 — job moved to Whitefield temporarily.", reused: ["budget","food","idCollected"] },
  { daysAgo: 210, durationDays: 5, closeReason: "job-loss", revivalReason: "lost-job-earlier-now-ok", tcm: "tcm-4",
    notes: "Jun '25 — laid off, paused search." },
  { daysAgo: 170, durationDays: 8, closeReason: "ghosted", revivalReason: "referral-nudge", tcm: "tcm-2",
    notes: "Jul '25 — friend referred him back, ghosted on tour." },
  { daysAgo: 130, durationDays: 6, closeReason: "lost-food", revivalReason: "old-option-gone", tcm: "tcm-2",
    notes: "Sep '25 — Jain-food block missing, chose Colive." },
  { daysAgo: 95,  durationDays: 4, closeReason: "deferred", revivalReason: "family-approved", tcm: "tcm-1",
    notes: "Oct '25 — mother wanted flat, not PG." },
  { daysAgo: 65,  durationDays: 7, closeReason: "lost-bought-flat", revivalReason: "returning-customer", tcm: "tcm-1",
    notes: "Nov '25 — nearly bought a flat, deal fell through.", reused: ["budget","food"] },
  { daysAgo: 35,  durationDays: 5, closeReason: "cancelled-after-book", revivalReason: "price-drop-seen", tcm: "tcm-1",
    notes: "Dec '25 — booked BTM, refunded within 48h." },
  // Cycle 15 — currently OPEN (no closedAt) — the one owner is working NOW.
  { daysAgo: 6,   durationDays: 0, closeReason: "other", revivalReason: "returning-customer", tcm: "tcm-1",
    notes: "Now — back for 6-month stay, wants Koramangala 8B, family called twice.",
    reused: ["food","budget","idCollected","preferredArea"] },
];

function buildCycles(specs: CycleSpec[], originalTcm: string): LeadCycle[] {
  const uid = (i: number) => `cyc_seed_${i}`;
  return specs.map((s, i) => {
    const openedMs = Date.now() - s.daysAgo * day;
    const isOpen = i === specs.length - 1;
    const closedMs = isOpen ? undefined : openedMs + s.durationDays * day;
    const prevSpec = specs[i - 1];
    const gapDays = prevSpec
      ? Math.max(0, Math.round(
          (openedMs - (Date.now() - (prevSpec.daysAgo - prevSpec.durationDays) * day)) / day,
        ))
      : undefined;
    return {
      id: uid(i),
      cycleNumber: i + 1,
      openedAt: iso(openedMs),
      closedAt: closedMs ? iso(closedMs) : undefined,
      closeReason: isOpen ? undefined : s.closeReason,
      revivalReason: i === 0 ? undefined : s.revivalReason,
      gapDays: i === 0 ? undefined : gapDays,
      originalTcmId: originalTcm,
      currentTcmId: s.tcm,
      notes: s.notes,
      reusedFromCycle: i === 0 ? undefined : i,
      reusedFields: s.reused,
    };
  });
}

// Short 3-cycle journey for another lead so the "returning" UI isn't only on one row.
const TANYA_3: CycleSpec[] = [
  { daysAgo: 200, durationDays: 10, closeReason: "lost-price", tcm: "tcm-2",
    notes: "First enquiry — priced out." },
  { daysAgo: 90,  durationDays: 6,  closeReason: "ghosted", revivalReason: "budget-ready", tcm: "tcm-2",
    notes: "Came back after salary hike, ghosted." },
  { daysAgo: 3,   durationDays: 0,  closeReason: "other", revivalReason: "returning-customer", tcm: "tcm-2",
    notes: "Back again, tour booked for tomorrow." },
];

const DEMO_CLOSE_REASONS: CycleCloseReason[] = [
  "lost-price", "ghosted", "lost-own-arrangement", "deferred", "lost-competitor",
  "cancelled-after-book", "health-emergency", "lost-location", "job-loss", "lost-food",
];
const DEMO_REVIVAL_REASONS: RevivalReason[] = [
  "budget-ready", "family-approved", "season-change", "price-drop-seen", "returning-customer",
  "new-city", "lost-job-earlier-now-ok", "referral-nudge", "old-option-gone",
];

function demoCycleSpecs(index: number): CycleSpec[] {
  const cycleCount = 2 + ((index - 1) % 14);
  return Array.from({ length: cycleCount }, (_, i) => {
    const isOpen = i === cycleCount - 1;
    return {
      daysAgo: (cycleCount - i) * 38 + (index % 9),
      durationDays: isOpen ? 0 : 3 + ((index + i) % 9),
      closeReason: DEMO_CLOSE_REASONS[(index + i) % DEMO_CLOSE_REASONS.length],
      revivalReason: i === 0 ? undefined : DEMO_REVIVAL_REASONS[(index + i) % DEMO_REVIVAL_REASONS.length],
      tcm: `tcm-${((index + i) % 4) + 1}`,
      notes: isOpen
        ? `Current return cycle ${cycleCount} — active again, verify location/date, claim owner, and set next action.`
        : `Past cycle ${i + 1} — realistic lost/deferred journey preserved for audit and reassignment context.`,
      reused: i === 0 ? undefined : ["budget", "preferredArea", "food", "idCollected"].slice(0, 1 + ((index + i) % 4)),
    };
  });
}

export function runLifecycleSeed() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(SEED_VERSION) === "done") return;
  } catch {
    return;
  }

  const lifecycle = useLifecycle.getState();
  const existing = lifecycle.cycles ?? {};

  const seeded: Record<string, LeadCycle[]> = {
    ...existing,
    "l-11": buildCycles(AAKASH_15, "tcm-3"),
    "l-12": buildCycles(TANYA_3, "tcm-2"),
  };

  for (let i = 1; i <= 100; i += 1) {
    seeded[`l-demo-${i}`] = buildCycles(demoCycleSpecs(i), `tcm-${((i - 1) % 4) + 1}`);
  }

  useLifecycle.setState({ cycles: seeded });

  // Live co-work claim: someone else is actively helping the current owner on l-11.
  const live = useLiveActivity.getState();
  const hasClaim = live.claims.some((c) => c.leadId === "l-11" && c.state === "active");
  if (!hasClaim) {
    live.claimCowork({
      leadId: "l-11",
      claimerId: "tcm-4",
      claimerName: "Neha Verma",
      primaryOwnerName: "Aarav Mehta",
      reason: "On live call with the guardian while Aarav confirms room availability.",
    });
  }
  // Add a warm parallel session on Tanya so 'multiple people working the same lead' is visible.
  const hasClaimTanya = live.claims.some((c) => c.leadId === "l-12" && c.state === "active");
  if (!hasClaimTanya) {
    live.claimCowork({
      leadId: "l-12",
      claimerId: "tcm-1",
      claimerName: "Aarav Mehta",
      primaryOwnerName: "Priya Shah",
      reason: "Priya is on WA — I'm dialing the parent in parallel.",
    });
  }

  for (let i = 1; i <= 12; i += 1) {
    const leadId = `l-demo-${i}`;
    const already = live.claims.some((c) => c.leadId === leadId && c.state === "active");
    if (!already) {
      live.claimCowork({
        leadId,
        claimerId: `tcm-${(i % 4) + 1}`,
        claimerName: ["Aarav Mehta", "Priya Shah", "Rohan Iyer", "Neha Verma"][i % 4],
        primaryOwnerName: ["Priya Shah", "Rohan Iyer", "Neha Verma", "Aarav Mehta"][i % 4],
        reason: "Demo co-work claim: parallel callback / guardian check while primary owner continues WhatsApp.",
      });
    }
  }

  try { window.localStorage.setItem(SEED_VERSION, "done"); } catch { /* ignore */ }
}