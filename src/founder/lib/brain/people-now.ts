/**
 * PEOPLE NOW — per-person operating truth for the Founder OS.
 *
 * Every number here is derived from the live CRM snapshot inside the active
 * time window, and every number carries the rows behind it so the founder can
 * click any figure and see exactly which customers created it.
 */
import type { ActivityLog, Lead, TCM } from "@/lib/types";
import type { CrmSnapshot } from "@/founder/lib/crm-link";
import type { BrainRow, Metric } from "./engine";
import { inRange, type Range } from "./timeengine";

const H = 3_600_000;
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const minsAgo = (iso?: string | null) => (iso ? Math.round((Date.now() - +new Date(iso)) / 60000) : Infinity);
const agoText = (iso?: string | null) => {
  const m = minsAgo(iso);
  if (!isFinite(m)) return "never";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};
const pct = (n: number, d: number) => (d <= 0 ? 0 : Math.round((n / d) * 100));

export const connectedCall = (a: ActivityLog) =>
  !/no answer|not reachable|unreachable|busy|switched off|missed/i.test(a.text);

export const isQuote = (a: ActivityLog) => /quot|pricing|price sent|offer/i.test(a.text);
export const isCheckin = (a: ActivityLog) => /check[- ]?in|moved in|move-in/i.test(a.text);

function row(l: Lead, tcms: TCM[], problem?: string, next?: string): BrainRow {
  const overdue = l.nextFollowUpAt ? Math.round((Date.now() - +new Date(l.nextFollowUpAt)) / 60000) : 0;
  return {
    id: l.id,
    kind: "lead",
    title: l.name,
    subtitle: `${l.stage} · ${l.intent} · ${money(l.budget)} · ${l.preferredArea || "Unzoned"} · last touch ${agoText(l.updatedAt)}`,
    owner: tcms.find((t) => t.id === l.assignedTcmId)?.name ?? "Unassigned",
    zone: l.preferredArea || "Unzoned",
    problem,
    impact: `${l.confidence}% booking probability`,
    overdue: overdue > 0 ? `${overdue}m overdue` : undefined,
    nextAction: next ?? (l.nextFollowUpAt ? "Follow up now" : "Set next action"),
    leadId: l.id,
    phone: l.phone,
    severity: l.confidence + (l.intent === "hot" ? 40 : l.intent === "warm" ? 15 : 0) + Math.max(0, Math.min(overdue, 240)) / 4,
  };
}

const m = (
  key: string,
  label: string,
  value: number,
  rows: BrainRow[],
  tone: Metric["tone"] = "plain",
  suffix?: string,
): Metric => ({ key, label, value, rows, tone, suffix });

export interface PersonNow {
  id: string;
  name: string;
  initials: string;
  role: string;
  zone: string;
  /* headline scores */
  effort: number;
  outcome: number;
  discipline: number;
  score: number;
  grade: "A" | "B" | "C" | "D";
  verdict: string;
  flags: string[];
  lastSeen: string;
  /* raw values used for the sheet view */
  v: Record<string, number>;
  metrics: { group: string; items: Metric[] }[];
  timeline: { ts: number; time: string; text: string; kind: string; leadId?: string }[];
  checkpoints: { id: string; label: string; at: string; state: "done" | "late" | "missed" | "upcoming"; proof: string }[];
}

const CHECKPOINTS = [
  { id: "goal", label: "Goal Set", hour: 10, minute: 35 },
  { id: "reality", label: "Reality Check", hour: 13, minute: 15 },
  { id: "recovery", label: "Recovery Check", hour: 17, minute: 0 },
  { id: "impact", label: "Impact Check", hour: 20, minute: 0 },
];

export function checkpointTimes(now = Date.now()) {
  return CHECKPOINTS.map((c) => {
    const d = new Date(now);
    d.setHours(c.hour, c.minute, 0, 0);
    return { ...c, ts: +d, at: `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}` };
  });
}

function personCheckpoints(acts: ActivityLog[], now = Date.now()) {
  const times = checkpointTimes(now);
  return times.map((c, i) => {
    const windowStart = i === 0 ? c.ts - 4 * H : times[i - 1].ts;
    const before = acts.filter((a) => +new Date(a.ts) >= windowStart && +new Date(a.ts) <= c.ts);
    const after = acts.filter((a) => +new Date(a.ts) > c.ts && +new Date(a.ts) <= c.ts + 90 * 60_000);
    if (now < c.ts) {
      return { id: c.id, label: c.label, at: c.at, state: "upcoming" as const, proof: "Window still open" };
    }
    if (before.length) {
      return { id: c.id, label: c.label, at: c.at, state: "done" as const, proof: `${before.length} actions logged before ${c.at}` };
    }
    if (after.length) {
      return { id: c.id, label: c.label, at: c.at, state: "late" as const, proof: `First action ${new Date(after[after.length - 1].ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} — after the gate` };
    }
    return { id: c.id, label: c.label, at: c.at, state: "missed" as const, proof: `No work logged around ${c.at}` };
  });
}

export function buildPeople(snap: CrmSnapshot, range: Range, cmp: Range | null): PersonNow[] {
  const leadOf = new Map(snap.leads.map((l) => [l.id, l] as const));
  const quotedLeadIds = new Set(snap.activities.filter(isQuote).map((a) => a.leadId).filter(Boolean) as string[]);

  return snap.tcms.map((t) => {
    const acts = snap.activities.filter((a) => a.actor === t.id);
    const inWin = acts.filter((a) => inRange(a.ts, range));
    const prevWin = cmp ? acts.filter((a) => inRange(a.ts, cmp)) : [];

    const mine = snap.leads.filter((l) => l.assignedTcmId === t.id);
    const active = mine.filter((l) => !["booked", "dropped"].includes(l.stage));
    const touchedIds = new Set(inWin.map((a) => a.leadId).filter(Boolean) as string[]);
    const touched = mine.filter((l) => touchedIds.has(l.id));
    const untouched = active.filter((l) => !touchedIds.has(l.id));
    const untouched48 = active.filter((l) => minsAgo(l.updatedAt) > 48 * 60);
    const noNext = active.filter((l) => !l.nextFollowUpAt);
    const hotIdle = active.filter((l) => l.intent === "hot" && !touchedIds.has(l.id));

    const calls = inWin.filter((a) => a.kind === "call_logged");
    const conn = calls.filter(connectedCall);
    const msgs = inWin.filter((a) => a.kind === "message_sent");
    const notes = inWin.filter((a) => a.kind === "note_added");

    const myTours = snap.tours.filter((x) => x.tcmId === t.id);
    const sched = myTours.filter((x) => inRange(x.createdAt, range));
    const done = myTours.filter((x) => x.status === "completed" && inRange(x.updatedAt, range));
    const noShow = myTours.filter((x) => (x.status === "cancelled" || x.status === "no-show") && inRange(x.updatedAt, range));
    const postDone = done.filter((x) => x.postTour?.filledAt);
    const postMissing = myTours.filter((x) => x.status === "completed" && !x.postTour?.filledAt);
    const scheduledNoOutcome = myTours.filter((x) => x.status === "scheduled" && +new Date(x.scheduledAt) < Date.now());

    const quotes = inWin.filter(isQuote);
    const checkins = inWin.filter(isCheckin);
    const bookings = snap.bookings.filter((b) => b.tcmId === t.id && inRange(b.ts, range));
    const revenue = bookings.reduce((s, b) => s + b.amount, 0);

    const fus = snap.followUps.filter((f) => f.tcmId === t.id && !f.done);
    const overdue = fus.filter((f) => +new Date(f.dueAt) < Date.now());
    const fusDone = snap.followUps.filter((f) => f.tcmId === t.id && f.done);

    const toRows = (as: ActivityLog[], problem?: string, next?: string) =>
      Array.from(new Set(as.map((a) => a.leadId).filter(Boolean) as string[]))
        .map((id) => leadOf.get(id))
        .filter(Boolean)
        .map((l) => row(l as Lead, snap.tcms, problem, next));

    const leadRows = (ls: Lead[], problem?: string, next?: string) =>
      ls.map((l) => row(l, snap.tcms, problem, next)).sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));

    const tourRows = (ts: typeof myTours, problem: string, next: string) =>
      ts.map((x) => leadOf.get(x.leadId)).filter(Boolean).map((l) => row(l as Lead, snap.tcms, problem, next));

    /* ------------------------------ scores ----------------------------- */
    const effortRaw = calls.length * 3 + conn.length * 4 + msgs.length * 1.5 + notes.length;
    const effort = Math.min(100, Math.round(effortRaw * 2));
    const outcome = Math.min(
      100,
      Math.round(sched.length * 8 + done.length * 14 + quotes.length * 10 + bookings.length * 25 + checkins.length * 15),
    );
    const discipline = Math.max(
      0,
      100 -
        overdue.length * 8 -
        untouched.length * 3 -
        noNext.length * 4 -
        postMissing.length * 6 -
        scheduledNoOutcome.length * 5,
    );
    const score = Math.round(effort * 0.3 + outcome * 0.45 + discipline * 0.25);
    const grade: PersonNow["grade"] = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";

    const flags: string[] = [];
    if (calls.length === 0) flags.push("No calls in this window");
    if (postMissing.length) flags.push(`${postMissing.length} tours without post-tour update`);
    if (scheduledNoOutcome.length) flags.push(`${scheduledNoOutcome.length} tours past time, no outcome`);
    if (done.length && quotes.length === 0) flags.push("Tours done, zero quotations");
    if (overdue.length > 2) flags.push(`${overdue.length} overdue follow-ups`);
    if (hotIdle.length) flags.push(`${hotIdle.length} hot leads untouched`);
    if (untouched48.length > 4) flags.push(`${untouched48.length} leads rotting 48h+`);

    const prevCalls = prevWin.filter((a) => a.kind === "call_logged").length;
    const trend = calls.length - prevCalls;
    const verdict =
      grade === "A"
        ? `Top performer this window — ${bookings.length} bookings, ${done.length} tours done.`
        : grade === "B"
          ? `Working, but leaking: ${flags[0] ?? "tighten follow-through"}.`
          : grade === "C"
            ? `Falling behind — effort ${effort}, outcome ${outcome}. ${flags[0] ?? ""}`
            : `Not operating. ${flags[0] ?? "No meaningful activity in this window."}`;

    const timeline = inWin
      .slice()
      .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))
      .slice(0, 60)
      .map((a) => ({
        ts: +new Date(a.ts),
        time: new Date(a.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        text: a.text,
        kind: a.kind,
        leadId: a.leadId,
      }));

    const v = {
      leads: mine.length,
      active: active.length,
      touched: touched.length,
      untouched: untouched.length,
      untouched48: untouched48.length,
      noNext: noNext.length,
      hotIdle: hotIdle.length,
      calls: calls.length,
      connected: conn.length,
      connectRate: pct(conn.length, calls.length),
      messages: msgs.length,
      notes: notes.length,
      toursScheduled: sched.length,
      toursDone: done.length,
      tourShowRate: pct(done.length, sched.length),
      noShow: noShow.length,
      postTour: postDone.length,
      postMissing: postMissing.length,
      staleTours: scheduledNoOutcome.length,
      quotes: quotes.length,
      bookings: bookings.length,
      checkins: checkins.length,
      revenue,
      overdue: overdue.length,
      followUpsDone: fusDone.length,
      activity: inWin.length,
      trend,
      effort,
      outcome,
      discipline,
      score,
    };

    const metrics: PersonNow["metrics"] = [
      {
        group: "Pipeline",
        items: [
          m("leads", "Total leads", mine.length, leadRows(mine)),
          m("active", "Active leads", active.length, leadRows(active)),
          m("touched", "Worked in window", touched.length, leadRows(touched), touched.length ? "good" : "bad"),
          m("untouched", "Untouched in window", untouched.length, leadRows(untouched, "Not touched in this window", "Call today"), untouched.length ? "bad" : "good"),
          m("untouched48", "Rotting 48h+", untouched48.length, leadRows(untouched48, "No touch in 48h", "Revive or close out"), untouched48.length ? "bad" : "good"),
          m("noNext", "No next action", noNext.length, leadRows(noNext, "No next action set", "Set next action"), noNext.length ? "warn" : "good"),
          m("hotIdle", "Hot leads untouched", hotIdle.length, leadRows(hotIdle, "Hot and ignored", "Call immediately"), hotIdle.length ? "bad" : "good"),
        ],
      },
      {
        group: "Conversation",
        items: [
          m("calls", "Calls logged", calls.length, toRows(calls), calls.length ? "good" : "bad"),
          m("connected", "Connected calls", conn.length, toRows(conn), conn.length ? "good" : "warn"),
          m("connectRate", "Connect rate", pct(conn.length, calls.length), toRows(conn), "plain", "%"),
          m("messages", "WhatsApp sent", msgs.length, toRows(msgs)),
          m("notes", "Notes written", notes.length, toRows(notes)),
        ],
      },
      {
        group: "Tours",
        items: [
          m("toursScheduled", "Tours scheduled", sched.length, tourRows(sched, "Tour scheduled", "Confirm the tour")),
          m("toursDone", "Tours done", done.length, tourRows(done, "Tour completed", "Send quotation"), done.length ? "good" : "warn"),
          m("tourShowRate", "Show rate", pct(done.length, sched.length), tourRows(done, "Completed", "Push to quote"), "plain", "%"),
          m("noShow", "Cancelled / no-show", noShow.length, tourRows(noShow, "Tour lost", "Rebook the tour"), noShow.length ? "bad" : "good"),
          m("postMissing", "Post-tour missing", postMissing.length, tourRows(postMissing, "No post-tour update", "Fill outcome now"), postMissing.length ? "bad" : "good"),
          m("staleTours", "Tour time passed, no outcome", scheduledNoOutcome.length, tourRows(scheduledNoOutcome, "Scheduled and forgotten", "Mark outcome"), scheduledNoOutcome.length ? "bad" : "good"),
        ],
      },
      {
        group: "Closing",
        items: [
          m("quotes", "Quotations sent", quotes.length, toRows(quotes, undefined, "Chase decision"), quotes.length ? "good" : "warn"),
          m(
            "quoteGap",
            "Tours done without quote",
            done.filter((x) => !quotedLeadIds.has(x.leadId)).length,
            tourRows(done.filter((x) => !quotedLeadIds.has(x.leadId)), "No quotation after tour", "Send quotation now"),
            "bad",
          ),
          m("bookings", "Bookings", bookings.length, bookings.map((b) => leadOf.get(b.leadId)).filter(Boolean).map((l) => row(l as Lead, snap.tcms, undefined, "Move to check-in")), bookings.length ? "good" : "warn"),
          m("checkins", "Check-ins", checkins.length, toRows(checkins)),
          m("revenue", "Revenue booked", revenue, bookings.map((b) => leadOf.get(b.leadId)).filter(Boolean).map((l) => row(l as Lead, snap.tcms)), "good"),
        ],
      },
      {
        group: "Discipline",
        items: [
          m("overdue", "Overdue follow-ups", overdue.length, overdue.map((f) => leadOf.get(f.leadId)).filter(Boolean).map((l) => row(l as Lead, snap.tcms, "Follow-up overdue", "Do it now")), overdue.length ? "bad" : "good"),
          m("followUpsDone", "Follow-ups completed", fusDone.length, fusDone.map((f) => leadOf.get(f.leadId)).filter(Boolean).map((l) => row(l as Lead, snap.tcms)), "good"),
          m("activity", "Total actions", inWin.length, toRows(inWin), inWin.length ? "good" : "bad"),
        ],
      },
    ];

    return {
      id: t.id,
      name: t.name,
      initials: t.initials,
      role: "Tour Conversion Manager",
      zone: t.zone,
      effort,
      outcome,
      discipline,
      score,
      grade,
      verdict,
      flags,
      lastSeen: agoText(acts[0]?.ts ?? null),
      v,
      metrics,
      timeline,
      checkpoints: personCheckpoints(acts),
    };
  }).sort((a, b) => b.score - a.score);
}

/* ------------------------------- rollups -------------------------------- */

export interface ZoneNow {
  name: string;
  people: string[];
  leads: number;
  calls: number;
  toursDone: number;
  bookings: number;
  untouched: number;
  score: number;
  rows: BrainRow[];
}

export function buildZones(people: PersonNow[], snap: CrmSnapshot): ZoneNow[] {
  const map = new Map<string, PersonNow[]>();
  people.forEach((p) => map.set(p.zone, [...(map.get(p.zone) ?? []), p]));
  return Array.from(map.entries())
    .map(([name, ps]) => {
      const sum = (k: string) => ps.reduce((s, p) => s + (p.v[k] ?? 0), 0);
      const rows = ps.flatMap((p) => p.metrics[0].items.find((i) => i.key === "untouched")?.rows ?? []);
      return {
        name,
        people: ps.map((p) => p.name),
        leads: sum("leads"),
        calls: sum("calls"),
        toursDone: sum("toursDone"),
        bookings: sum("bookings"),
        untouched: sum("untouched"),
        score: Math.round(ps.reduce((s, p) => s + p.score, 0) / Math.max(ps.length, 1)),
        rows,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface CheckpointRollup {
  id: string;
  label: string;
  at: string;
  done: PersonNow[];
  late: PersonNow[];
  missed: PersonNow[];
  upcoming: boolean;
}

export function buildCheckpoints(people: PersonNow[]): CheckpointRollup[] {
  return checkpointTimes().map((c, i) => {
    const state = (p: PersonNow) => p.checkpoints[i]?.state;
    return {
      id: c.id,
      label: c.label,
      at: c.at,
      done: people.filter((p) => state(p) === "done"),
      late: people.filter((p) => state(p) === "late"),
      missed: people.filter((p) => state(p) === "missed"),
      upcoming: people.every((p) => state(p) === "upcoming"),
    };
  });
}

export function peopleWhatsApp(people: PersonNow[], rangeLabel: string) {
  const line = (p: PersonNow) =>
    `${p.name} (${p.grade}) — ${p.v.calls} calls, ${p.v.toursDone} tours done, ${p.v.quotes} quotes, ${p.v.bookings} bookings, ${p.v.untouched} untouched`;
  const top = people.slice(0, 3).map(line);
  const bottom = people.slice(-3).reverse().map(line);
  return [
    `GHARPAYY PEOPLE DESK — ${rangeLabel}`,
    "",
    "Top:",
    ...top,
    "",
    "Needs attention:",
    ...bottom,
    "",
    `Untouched leads across team: ${people.reduce((s, p) => s + p.v.untouched, 0)}`,
    `Post-tour updates missing: ${people.reduce((s, p) => s + p.v.postMissing, 0)}`,
  ].join("\n");
}
