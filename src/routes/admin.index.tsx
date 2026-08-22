import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/founder/components/RoleGate";
import { Avatar } from "@/founder/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlarmClock, CalendarDays, ChevronRight, CheckCircle2, Coffee, Copy, Flag, MessageCircle, Minus, Plus,
  RotateCcw, Search, ThumbsUp, TrendingUp, UserX,
} from "lucide-react";
import { companyBlock, zoneRows } from "@/founder/lib/command-center/metrics";
import { copyToClipboard, waDeepLink } from "@/founder/lib/execution/wa-format";
import {
  bulkSetState, resetDay, setMark, STATE_CLASS, STATE_LABEL, subscribeAdminDesk, todayStamp,
  type MarkState,
} from "@/founder/lib/admin/admin-desk-store";
import {
  allPersonDays, buildCheckpointDigest, buildFullDigest, buildPersonDigest, buildZoneDigest,
  CHECKPOINTS, type CheckpointId, type PersonDay,
} from "@/founder/lib/admin/admin-digest";
import { PersonSheet, type PersonPane } from "@/founder/components/admin/PersonSheet";
import { PeopleDrill, type DrillEntry } from "@/founder/components/admin/PeopleDrill";
import { DataSheet } from "@/founder/components/admin/DataSheet";
import { companyLadders, monthStart, weekStart, type GoalLadder } from "@/founder/lib/admin/admin-goals";
import { useAdminNotes } from "@/founder/lib/admin/admin-notes";
import {
  buildDisciplineDigest, buildZoneAttendanceDigest, dateRange, dayAttendance, fmtDur, fmtMin,
  prettyDate, rollup, shiftDate, trend, zoneAttendance, type DayAttendance,
} from "@/founder/lib/admin/admin-day";

export const Route = createFileRoute("/admin/")({
  component: () => (
    <RoleGate allow={["superadmin", "leadership", "hr"]}>
      <AdminDesk />
    </RoleGate>
  ),
  head: () => ({
    meta: [
      { title: "Admin Desk · The whole company on one screen" },
      { name: "description", content: "Presence, late serial numbers, break overruns, checkpoint compliance, zone health, score mark-ups and one tap WhatsApp reports for any date." },
      { property: "og:title", content: "Admin Desk · The whole company on one screen" },
      { property: "og:description", content: "Late list, break overruns, zone health, mark-ups and WhatsApp ready reports for any date range." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Filter = "all" | "pending" | "flagged" | "missing" | "risk" | "late" | "overbreak" | "absent";
type Tab = "pulse" | "people" | "sheet" | "discipline" | "zones" | "report";
type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

const RHYTHM: { time: string; rule: string }[] = [
  { time: "10:35", rule: "decides the goal" },
  { time: "13:15", rule: "exposes reality" },
  { time: "17:00", rule: "forces recovery" },
  { time: "20:00", rule: "measures impact" },
];



function AdminDesk() {
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setHydrated(true);
    const off = subscribeAdminDesk(() => setTick((t) => t + 1));
    return () => { off(); };
  }, []);

  const today = todayStamp();
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState<Tab>("pulse");
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetPane, setSheetPane] = useState<PersonPane>("timeline");
  const [drill, setDrill] = useState<
    { title: string; subtitle?: string; entries: DrillEntry[]; pane?: PersonPane } | null
  >(null);
  const [draft, setDraft] = useState("");

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "today") { setFrom(today); setTo(today); }
    if (p === "yesterday") { const y = shiftDate(today, -1); setFrom(y); setTo(y); }
    if (p === "7d") { setFrom(shiftDate(today, -6)); setTo(today); }
    if (p === "30d") { setFrom(shiftDate(today, -29)); setTo(today); }
  }

  const dates = useMemo(() => dateRange(from, to), [from, to]);
  const date = dates[dates.length - 1];
  const multiDay = dates.length > 1;

  const rows = useMemo(() => (hydrated ? allPersonDays(date) : []), [hydrated, date, tick]);
  const att = useMemo(() => (hydrated ? dayAttendance(date) : []), [hydrated, date]);
  const attById = useMemo(() => new Map(att.map((a) => [a.emp.id, a])), [att]);
  const roll = useMemo(() => rollup(att), [att]);
  const zAtt = useMemo(() => zoneAttendance(att), [att]);
  const series = useMemo(() => (hydrated && multiDay ? trend(dates) : []), [hydrated, multiDay, dates]);
  const block = useMemo(() => companyBlock(), []);
  const zones = useMemo(() => zoneRows(), []);
  const zoneNames = useMemo(() => zAtt.map((z) => z.zone), [zAtt]);

  // Goal engine: today, week and month ladders for the whole roster.
  const ladders = useMemo(() => (hydrated ? companyLadders(date) : []), [hydrated, date, tick]);
  const laddersById = useMemo(() => new Map(ladders.map((l) => [l.emp.id, l.ladder])), [ladders]);
  const goalPulse = useMemo(() => {
    if (!ladders.length) return null;
    const t = ladders.reduce((s, l) => ({ g: s.g + l.ladder.today.goal, a: s.a + l.ladder.today.actual }), { g: 0, a: 0 });
    const w = ladders.reduce((s, l) => ({ e: s.e + l.ladder.week.expected, a: s.a + l.ladder.week.actual }), { e: 0, a: 0 });
    const m = ladders.reduce((s, l) => ({ e: s.e + l.ladder.month.expected, a: s.a + l.ladder.month.actual }), { e: 0, a: 0 });
    return {
      todayGoal: t.g, todayActual: t.a, todayPct: t.g ? Math.round((t.a / t.g) * 100) : 0,
      weekExpected: w.e, weekActual: w.a, weekPct: w.e ? Math.round((w.a / w.e) * 100) : 0,
      monthExpected: m.e, monthActual: m.a, monthPct: m.e ? Math.round((m.a / m.e) * 100) : 0,
    };
  }, [ladders]);

  // Written record: 1-on-1s, feedback, warnings, praise.
  const notes = useAdminNotes();
  const noteCounts = useMemo(() => {
    const m = new Map<string, number>();
    notes.forEach((n) => m.set(n.employeeId, (m.get(n.employeeId) ?? 0) + 1));
    return m;
  }, [notes]);

  const visible = rows.filter((r) => {
    const a = attById.get(r.emp.id);
    const zone = r.emp.zone && r.emp.zone !== "All" ? r.emp.zone : "HQ";
    if (zoneFilter !== "all" && zone !== zoneFilter) return false;
    if (query && !`${r.emp.name} ${r.emp.role} ${zone}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "pending") return r.mark.state === "pending";
    if (filter === "flagged") return r.mark.state === "flagged";
    if (filter === "missing") return r.submittedCount < 4 && !!a?.present;
    if (filter === "risk") return r.finalScore < 75;
    if (filter === "late") return !!a?.lateSerial;
    if (filter === "overbreak") return (a?.overBreakMin ?? 0) > 0;
    if (filter === "absent") return !a?.present;
    return true;
  });

  const compliance = rows.length
    ? Math.round((rows.reduce((s, r) => s + r.submittedCount, 0) / (rows.length * 4)) * 100)
    : 0;
  const pending = rows.filter((r) => r.mark.state === "pending").length;
  const lateList = att.filter((a) => a.lateSerial).sort((a, b) => (a.lateSerial ?? 0) - (b.lateSerial ?? 0));
  const overBreak = att.filter((a) => a.overBreakMin > 0).sort((a, b) => b.overBreakMin - a.overBreakMin);

  // EOD bubble: plain English, ready to paste in the group.
  const eodBubble = `EOD ${prettyDate(date)} — Done: ${rows.filter((r) => r.submittedCount === 4).length} people fully reported. Pending: ${pending} waiting on a decision, ${rows.filter((r) => r.submittedCount < 4).length} reports missing. Late: ${roll.late} (${fmtDur(roll.lateMinutes)} lost), break overrun ${fmtDur(roll.overBreakMinutes)}. Punctuality ${roll.punctuality}%.`;



  const digest = useMemo(() => {
    if (!rows.length) return "";
    const head = multiDay ? `*Range ${prettyDate(from)} to ${prettyDate(to)} (${dates.length} days)*\n\n` : "";
    return head + buildFullDigest(date, rows, block) + "\n\n" + buildDisciplineDigest(date, att);
  }, [rows, date, block, att, multiDay, from, to, dates.length]);

  useEffect(() => { setDraft(digest); }, [digest]);

  async function copy(text: string, what: string) {
    const ok = await copyToClipboard(text);
    if (ok) toast.success(`${what} copied`, { description: "Paste it straight into WhatsApp." });
    else toast.error("Copy blocked by the browser", { description: "Select the text and copy manually." });
  }
  function act(id: string, state: MarkState, name: string) {
    setMark(id, { state }, date);
    toast.success(`${name} marked ${STATE_LABEL[state].toLowerCase()}`);
  }
  function bump(row: PersonDay, delta: number) {
    const next = Math.max(-20, Math.min(20, row.mark.markup + delta));
    setMark(row.emp.id, { markup: next }, date);
  }

  const rowById = new Map(rows.map((r) => [r.emp.id, r]));
  function openPerson(id: string, pane: PersonPane = "timeline") {
    setDrill(null);
    setSheetPane(pane);
    setSheetId(id);
  }
  function jumpDate(d: string) {
    setPreset("custom");
    setFrom(d);
    setTo(d);
  }
  function openDrill(title: string, subtitle: string, entries: DrillEntry[], pane: PersonPane = "timeline") {
    setDrill({ title, subtitle, entries, pane });
  }
  function entryFor(id: string, reason: string, right?: string, t?: "good" | "warn" | "bad"): DrillEntry | null {
    const r = rowById.get(id);
    return r ? { row: r, reason, right, tone: t } : null;
  }
  const clean = (list: (DrillEntry | null)[]) => list.filter(Boolean) as DrillEntry[];

  const lateEntries = clean(
    lateList.map((a) =>
      entryFor(a.emp.id, `Late #${a.lateSerial} · login ${fmtMin(a.loginMin ?? 0)} · ${a.emp.zone ?? "HQ"}`, `+${fmtDur(a.lateBy)}`, a.lateBy > 30 ? "bad" : "warn"),
    ),
  );
  const overBreakEntries = clean(
    overBreak.map((a) =>
      entryFor(a.emp.id, `${a.breaks.map((b) => `${b.label} ${fmtMin(b.start)} to ${fmtMin(b.end)}`).join(" · ")}`, `over ${fmtDur(a.overBreakMin)}`, "bad"),
    ),
  );
  const absentEntries = clean(
    att.filter((a) => !a.present).map((a) =>
      entryFor(a.emp.id, a.onLeave ? "Approved leave, no late mark" : "No login recorded against the 10:35 start", a.onLeave ? "Leave" : "Absent", a.onLeave ? "warn" : "bad"),
    ),
  );
  const presentEntries = clean(
    att.filter((a) => a.present).sort((a, b) => (a.loginMin ?? 0) - (b.loginMin ?? 0)).map((a) =>
      entryFor(a.emp.id, `Login ${fmtMin(a.loginMin ?? 0)} · break ${fmtDur(a.breakMin)} · idle ${fmtDur(a.idleMin)}`, a.lateBy ? `+${fmtDur(a.lateBy)}` : "on time", a.lateBy ? "warn" : "good"),
    ),
  );
  const missingEntries = clean(
    rows.filter((r) => r.submittedCount < 4).map((r) =>
      entryFor(r.emp.id, `${CHECKPOINTS.filter((c) => !r.submitted[c.id as CheckpointId]).map((c) => c.time).join(", ")} not filed`, `${r.submittedCount}/4`, "warn"),
    ),
  );
  const selfieEntries = clean(
    att.filter((a) => a.present && a.selfies < 4).map((a) =>
      entryFor(a.emp.id, `${4 - a.selfies} selfie(s) missing across morning, break and EOD`, `${a.selfies}/4`, a.selfies < 3 ? "bad" : "warn"),
    ),
  );
  const pendingEntries = clean(
    rows.filter((r) => r.mark.state === "pending").map((r) =>
      entryFor(r.emp.id, `No admin decision yet · score ${r.finalScore} · reports ${r.submittedCount}/4`, "Pending", "warn"),
    ),
  );
  const riskEntries = clean(
    rows.filter((r) => r.finalScore < 75).map((r) =>
      entryFor(r.emp.id, `Promise ${r.promise}, actual ${r.actual} (${r.gapPct}%)`, `${r.finalScore}`, "bad"),
    ),
  );

  function goalEntries(which: "today" | "week" | "month"): DrillEntry[] {
    const list = ladders
      .map((l) => {
        const g = which === "today"
          ? { goal: l.ladder.today.goal, actual: l.ladder.today.actual, pct: l.ladder.today.pct }
          : which === "week"
            ? { goal: l.ladder.week.expected, actual: l.ladder.week.actual, pct: l.ladder.week.pct }
            : { goal: l.ladder.month.expected, actual: l.ladder.month.actual, pct: l.ladder.month.pct };
        return { l, g };
      })
      .sort((a, b) => a.g.pct - b.g.pct);
    return clean(
      list.map(({ l, g }) =>
        entryFor(
          l.emp.id,
          `${which === "today" ? "Promise" : "Expected"} ${g.goal} · delivered ${g.actual} · ${l.emp.zone ?? "HQ"}`,
          `${g.pct}%`,
          g.pct >= 90 ? "good" : g.pct >= 75 ? "warn" : "bad",
        ),
      ),
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "pulse", label: "Pulse" },
    { id: "people", label: "People desk" },
    { id: "sheet", label: "Sheet" },
    { id: "discipline", label: "Late & breaks" },
    { id: "zones", label: "Zones" },
    { id: "report", label: "WhatsApp report" },
  ];

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1500px] mx-auto pb-24">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary mb-1.5">
            One admin screen · nothing else to open
          </div>
          <h1 className="font-display text-2xl md:text-4xl font-semibold tracking-tight">Admin Desk</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {multiDay
              ? `${prettyDate(from)} to ${prettyDate(to)} · showing ${prettyDate(date)} in detail`
              : `${prettyDate(date)} · shift starts 10:35, break allowance 45 minutes`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copy(digest, "Full day report")}>
            <Copy className="w-4 h-4 mr-1.5" /> Copy everything
          </Button>
          <a href={waDeepLink(draft || digest)} target="_blank" rel="noreferrer">
            <Button size="sm"><MessageCircle className="w-4 h-4 mr-1.5" /> Send on WhatsApp</Button>
          </a>
        </div>
      </header>

      {/* Date filters */}
      <section className="sticky top-0 z-30 rounded-2xl border border-border bg-card/95 backdrop-blur px-3 py-2.5 mb-4 flex flex-wrap items-center gap-2">

        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        {([
          ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 days"], ["30d", "Last 30 days"],
        ] as [Preset, string][]).map(([p, label]) => (
          <button
            key={p}
            onClick={() => applyPreset(p)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${preset === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
          >
            {label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted-foreground">Custom</span>
          <Input type="date" value={from} max={to}
            onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
            className="h-8 w-[140px] text-xs" aria-label="From date" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={to} min={from}
            onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
            className="h-8 w-[140px] text-xs" aria-label="To date" />
        </div>
      </section>

      {/* Result strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-4">
        <Stat label="Present" value={`${roll.present}/${roll.roster}`} sub="tap for the login order"
          onClick={() => openDrill("Present today", `${prettyDate(date)} · sorted by login time, earliest first`, presentEntries)} />
        <Stat label="Punctuality" value={`${roll.punctuality}%`} tone={tone(roll.punctuality, 90, 75)} sub="tap to see who slipped"
          onClick={() => openDrill("Punctuality breakdown", `${roll.late} late out of ${roll.present} present · shift starts 10:35`, lateEntries)} />
        <Stat label="Late today" value={`${roll.late}`} tone={roll.late ? "warn" : "good"} sub={roll.late ? `${fmtDur(roll.lateMinutes)} lost` : "clean start"}
          onClick={() => openDrill("Late register", `Serial numbers in arrival order past 10:35 · ${fmtDur(roll.lateMinutes)} lost`, lateEntries)} />
        <Stat label="Break overrun" value={fmtDur(roll.overBreakMinutes)} tone={roll.overBreakMinutes > 60 ? "bad" : roll.overBreakMinutes ? "warn" : "good"} sub={`${roll.overBreakPeople} people`}
          onClick={() => openDrill("Break overrun", "Allowance is 45 minutes across the day", overBreakEntries)} />
        <Stat label="Reporting" value={`${compliance}%`} tone={tone(compliance, 85, 70)} sub="tap for missing reports"
          onClick={() => openDrill("Missing reports", "Checkpoints 10:35, 13:15, 17:00 and 20:00", missingEntries, "reports")} />
        <Stat label="Selfie check" value={`${roll.selfieCompliance}%`} tone={tone(roll.selfieCompliance, 90, 75)} sub="tap for misses"
          onClick={() => openDrill("Selfie misses", "Four selfie points: morning, before break, after break, EOD", selfieEntries)} />
        <Stat label="Absent / leave" value={`${roll.absent}/${roll.onLeave}`} tone={roll.absent ? "warn" : "good"} sub="tap for names"
          onClick={() => openDrill("Absent and on leave", prettyDate(date), absentEntries)} />
        <Stat label="Pending review" value={`${pending}`} tone={pending ? "warn" : "good"} sub="tap to clear them"
          onClick={() => openDrill("Waiting on your decision", "Acknowledge, approve or flag each one", pendingEntries, "action")} />
      </section>

      {/* Goal strip: today, week, month — every number opens the people behind it */}
      {goalPulse && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
          <Stat label="Today's goal" value={`${goalPulse.todayActual}/${goalPulse.todayGoal}`} tone={tone(goalPulse.todayPct, 90, 75)} sub={`${goalPulse.todayPct}% delivered · tap for everyone`}
            onClick={() => openDrill("Today's goal vs delivery", `${prettyDate(date)} · sorted lowest pace first`, goalEntries("today"), "goals")} />
          <Stat label="Week pace" value={`${goalPulse.weekPct}%`} tone={tone(goalPulse.weekPct, 95, 85)} sub={`${goalPulse.weekActual}/${goalPulse.weekExpected} expected by today`}
            onClick={() => openDrill("Week pace", `Week of ${prettyDate(weekStart(date))} · delivered vs expected by today`, goalEntries("week"), "goals")} />
          <Stat label="Month pace" value={`${goalPulse.monthPct}%`} tone={tone(goalPulse.monthPct, 95, 85)} sub={`${goalPulse.monthActual}/${goalPulse.monthExpected} expected by today`}
            onClick={() => openDrill("Month pace", `Month starting ${prettyDate(monthStart(date))} · delivered vs expected by today`, goalEntries("month"), "goals")} />
          <Stat label="Notes on record" value={`${notes.length}`} tone={notes.length ? "good" : undefined} sub="1-on-1s, feedback, warnings"
            onClick={() => openDrill("People with notes", "Tap a name to read the full written record",
              clean(ladders.filter((l) => (noteCounts.get(l.emp.id) ?? 0) > 0)
                .map((l) => entryFor(l.emp.id, `${noteCounts.get(l.emp.id)} note(s) on record · ${l.emp.role}`, "Open", "good"))), "notes")} />
        </section>
      )}

      {/* One-rule rhythm strip */}
      <section className="rounded-2xl border border-border bg-secondary/40 px-3 py-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-mono uppercase tracking-widest text-primary">The one rule</span>
        {RHYTHM.map((r) => (
          <span key={r.time} className="text-muted-foreground">
            <b className="font-mono text-foreground">{r.time}</b> {r.rule}
          </span>
        ))}
      </section>

      {/* Checkpoint rail — always on, every tab */}
      {hydrated && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
          {CHECKPOINTS.map((cp) => {
            const done = rows.filter((r) => r.submitted[cp.id as CheckpointId]).length;
            const missingRows = rows.filter((r) => !r.submitted[cp.id as CheckpointId]);
            const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
            const rule = RHYTHM.find((r) => r.time === cp.time)?.rule ?? "";
            return (
              <div key={cp.id} role="button" tabIndex={0}
                onClick={() => openDrill(`${cp.time} · ${cp.label}`, `${done} of ${rows.length} submitted · tap a name for the full timeline`,
                  clean(missingRows.map((r) => entryFor(r.emp.id, `Nothing filed at ${cp.time}`, "Missing", "warn"))), "reports")}
                onKeyDown={(e) => { if (e.key === "Enter") setTab("people"); }}
                className="rounded-2xl border border-border bg-card p-3 text-left cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{cp.time} · {rule}</div>
                    <div className="font-display text-base font-semibold truncate">{cp.label}</div>
                  </div>
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${badge(tone(pct, 85, 70))}`}>{pct}%</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {done} in · <span className="text-warning">{missingRows.length} missing</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <Button variant="ghost" size="sm" className="mt-2 h-8 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); copy(buildCheckpointDigest(date, rows, cp.id as CheckpointId), `${cp.time} update`); }}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy {cp.time}
                </Button>
              </div>
            );
          })}
        </section>
      )}

      {/* EOD bubble */}
      {hydrated && (
        <section className="rounded-2xl border border-border bg-card px-3 py-2.5 mb-4 flex flex-wrap items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm flex-1 min-w-[220px]">{eodBubble}</p>
          <Button variant="outline" size="sm" onClick={() => copy(eodBubble, "EOD summary")}>
            <Copy className="w-4 h-4 mr-1.5" /> Copy for WhatsApp
          </Button>
        </section>
      )}

      {/* Tabs */}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!hydrated && <div className="rounded-2xl border border-border bg-card px-4 py-10 text-sm text-muted-foreground">Loading the day…</div>}

      {hydrated && tab === "pulse" && (
        <div className="space-y-4">

          <div className="grid lg:grid-cols-3 gap-4">
            <Panel title="First five in" icon={<AlarmClock className="w-4 h-4" />} onSee={() => openDrill("Login order", `${prettyDate(date)} · earliest first`, presentEntries)}>
              {att.filter((a) => a.present).sort((a, b) => (a.loginMin ?? 0) - (b.loginMin ?? 0)).slice(0, 5).map((a, i) => (
                <Line key={a.emp.id} left={`${i + 1}. ${a.emp.name}`} right={fmtMin(a.loginMin ?? 0)} good={a.lateBy === 0} onClick={() => openPerson(a.emp.id)} />
              ))}
            </Panel>
            <Panel title="Late serial list" icon={<AlarmClock className="w-4 h-4 text-warning" />} onSee={() => openDrill("Late register", "Serial numbers in arrival order past 10:35", lateEntries)}>
              {lateList.length === 0 && <div className="text-sm text-muted-foreground">Nobody late. Full punctuality.</div>}
              {lateList.slice(0, 6).map((a) => (
                <Line key={a.emp.id} left={`#${a.lateSerial} ${a.emp.name} · ${fmtMin(a.loginMin ?? 0)}`} right={`+${fmtDur(a.lateBy)}`} good={false} onClick={() => openPerson(a.emp.id)} />
              ))}
            </Panel>
            <Panel title="Top 5 scores" icon={<TrendingUp className="w-4 h-4 text-success" />} onSee={() => openDrill("Below 75 today", "These need a recovery number", riskEntries)}>
              {rows.slice(0, 5).map((r, i) => (
                <Line key={r.emp.id} left={`${i + 1}. ${r.emp.name}`} right={`${r.finalScore}/100`} good={r.finalScore >= 80} onClick={() => openPerson(r.emp.id)} />
              ))}
            </Panel>
          </div>

          {multiDay && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-base font-semibold mb-3">Punctuality trend · {dates.length} days</h2>
              <div className="flex items-end gap-1 h-28">
                {series.map((p) => (
                  <button key={p.date} type="button" onClick={() => { setPreset("custom"); setFrom(p.date); setTo(p.date); }} className="flex-1 flex flex-col justify-end items-center gap-1 hover:opacity-70 transition-opacity" title={`${prettyDate(p.date)} · ${p.punctuality}% punctual · ${p.late} late`}>
                    <div className={`w-full rounded-t ${p.punctuality >= 90 ? "bg-success" : p.punctuality >= 75 ? "bg-warning" : "bg-destructive"}`} style={{ height: `${Math.max(p.punctuality, 4)}%` }} />
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1.5">
                <span>{prettyDate(dates[0])}</span><span>{prettyDate(dates[dates.length - 1])}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-4">
                <Stat label="Avg punctuality" value={`${avg(series.map((s) => s.punctuality))}%`} />
                <Stat label="Total late marks" value={`${series.reduce((s, p) => s + p.late, 0)}`} />
                <Stat label="Break overrun" value={fmtDur(series.reduce((s, p) => s + p.overBreakMinutes, 0))} />
                <Stat label="Avg present" value={`${avg(series.map((s) => s.present))}/${roll.roster}`} />
              </div>
            </section>
          )}
        </div>
      )}

      {hydrated && tab === "people" && (
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2 justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">People desk</h2>
              <p className="text-xs text-muted-foreground">Acknowledge, approve, mark up or flag. Every change lands in the WhatsApp report.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search person, role, zone" className="h-8 pl-8 w-56 text-sm" />
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={() => { bulkSetState(visible.map((r) => r.emp.id), "acknowledged", date); toast.success(`${visible.length} people acknowledged`); }}>
                <ThumbsUp className="w-3.5 h-3.5 mr-1.5" /> Acknowledge all
              </Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => { resetDay(date); toast.success("Marks cleared for this date"); }}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
              </Button>
            </div>
          </div>

          <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5 items-center">
            {(["all", "pending", "missing", "risk", "late", "overbreak", "absent", "flagged"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                {f === "all" ? "Everyone" : f === "missing" ? "Missing reports" : f === "risk" ? "Below 75" : f === "overbreak" ? "Break overrun" : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
            <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}
              className="h-7 rounded-full border border-border bg-background px-2 text-xs" aria-label="Filter by zone">
              <option value="all">All zones</option>
              {zoneNames.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <span className="ml-auto text-xs text-muted-foreground">{visible.length} shown</span>
          </div>

          <div className="divide-y divide-border">
            {visible.length === 0 && <div className="px-4 py-8 text-sm text-muted-foreground">Nobody matches this filter.</div>}
            {visible.map((row) => {
              const a = attById.get(row.emp.id);
              const open = openId === row.emp.id;
              return (
                <div key={row.emp.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => openPerson(row.emp.id)} aria-label={`Open ${row.emp.name}`}>
                      <Avatar id={row.emp.id} name={row.emp.name} size={36} />
                    </button>
                    <div className="min-w-[180px]">
                      <div className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                        <button type="button" onClick={() => openPerson(row.emp.id)} className="hover:text-primary hover:underline underline-offset-2">
                          {row.emp.name}
                        </button>
                        <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${STATE_CLASS[row.mark.state]}`}>{STATE_LABEL[row.mark.state]}</span>
                        {a?.lateSerial && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-warning/10 text-warning border-warning/30">Late #{a.lateSerial}</span>}
                        {!a?.present && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/30">{a?.onLeave ? "Leave" : "Absent"}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.emp.role} · {row.emp.zone ?? "HQ"}
                        {a?.present && ` · in ${fmtMin(a.loginMin ?? 0)} · break ${fmtDur(a.breakMin)}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {CHECKPOINTS.map((cp) => (
                        <button key={cp.id} type="button" title={`${cp.time} ${cp.label}`} onClick={() => openPerson(row.emp.id, "reports")}
                          className={`w-7 h-7 rounded-md grid place-items-center text-[10px] font-mono border transition-transform hover:scale-110 ${row.submitted[cp.id as CheckpointId] ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}`}>
                          {row.submitted[cp.id as CheckpointId] ? "✓" : "–"}
                        </button>
                      ))}
                    </div>

                    {(() => {
                      const lad = laddersById.get(row.emp.id);
                      if (!lad) return null;
                      const cls = (pct: number) =>
                        pct >= 95 ? "bg-success/10 text-success border-success/30" : pct >= 85 ? "bg-warning/10 text-warning border-warning/30" : "bg-destructive/10 text-destructive border-destructive/30";
                      return (
                        <div className="flex items-center gap-1">
                          <button type="button" title="Week pace vs goal" onClick={() => openPerson(row.emp.id, "goals")}
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded border hover:scale-105 transition-transform ${cls(lad.week.pct)}`}>
                            W {lad.week.pct}%
                          </button>
                          <button type="button" title="Month pace vs goal" onClick={() => openPerson(row.emp.id, "goals")}
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded border hover:scale-105 transition-transform ${cls(lad.month.pct)}`}>
                            M {lad.month.pct}%
                          </button>
                        </div>
                      );
                    })()}

                    <div className="text-xs text-muted-foreground min-w-[150px]">
                      Promise {row.promise} · Actual {row.actual} · <span className={row.gapPct >= 90 ? "text-success" : row.gapPct >= 75 ? "text-warning" : "text-destructive"}>{row.gapPct}%</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => bump(row, -5)} aria-label={`Mark down ${row.emp.name}`}>
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      <div className="text-center min-w-[54px]">
                        <div className="font-display text-lg leading-none font-semibold">{row.finalScore}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {row.mark.markup ? `${row.mark.markup > 0 ? "+" : ""}${row.mark.markup} admin` : "base"}
                        </div>
                      </div>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => bump(row, 5)} aria-label={`Mark up ${row.emp.name}`}>
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => act(row.emp.id, "acknowledged", row.emp.name)}>
                        <ThumbsUp className="w-3.5 h-3.5 mr-1" /> Ack
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => act(row.emp.id, "approved", row.emp.name)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => act(row.emp.id, "flagged", row.emp.name)}>
                        <Flag className="w-3.5 h-3.5 mr-1" /> Flag
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => copy(buildPersonDigest(date, row), row.emp.name)}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpenId(open ? null : row.emp.id)}>
                        {open ? "Close" : "Note"}
                      </Button>
                      <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => openPerson(row.emp.id)}>
                        Open <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                      </Button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-2.5 pl-12 space-y-2">
                      {a?.present && (
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Chip>In {fmtMin(a.loginMin ?? 0)}</Chip>
                          <Chip>Out {fmtMin(a.logoutMin ?? 0)}</Chip>
                          {a.breaks.map((b) => <Chip key={b.label}>{b.label} {fmtMin(b.start)} to {fmtMin(b.end)}</Chip>)}
                          <Chip>Idle {fmtDur(a.idleMin)}</Chip>
                          <Chip>Active {fmtDur(a.activeMin)}</Chip>
                          <Chip>Selfies {a.selfies}/4</Chip>
                        </div>
                      )}
                      <Textarea
                        value={row.mark.note}
                        onChange={(e) => setMark(row.emp.id, { note: e.target.value }, date)}
                        placeholder={`What should ${row.emp.name.split(" ")[0]} know? This line goes into the WhatsApp report.`}
                        className="text-sm min-h-[64px]"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {hydrated && tab === "sheet" && (
        <DataSheet
          date={date}
          rows={visible}
          attById={attById}
          laddersById={laddersById}
          noteCounts={noteCounts}
          onPerson={openPerson}
        />
      )}

      {hydrated && tab === "discipline" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(buildDisciplineDigest(date, att), "Discipline report")}>
              <Copy className="w-4 h-4 mr-1.5" /> Copy discipline report
            </Button>
            <a href={waDeepLink(buildDisciplineDigest(date, att))} target="_blank" rel="noreferrer">
              <Button size="sm" variant="secondary"><MessageCircle className="w-4 h-4 mr-1.5" /> Send discipline report</Button>
            </a>
          </div>

          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <AlarmClock className="w-4 h-4 text-warning" />
              <h2 className="font-display text-base font-semibold">Late register</h2>
              <span className="text-xs text-muted-foreground">Serial numbers in order of arrival past 10:35</span>
            </div>
            {lateList.length === 0 && <div className="px-4 py-6 text-sm text-muted-foreground">Nobody late on {prettyDate(date)}.</div>}
            <div className="divide-y divide-border">
              {lateList.map((a) => (
                <button key={a.emp.id} type="button" onClick={() => openPerson(a.emp.id)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-secondary transition-colors">
                  <span className="w-8 h-8 rounded-lg grid place-items-center font-mono text-xs bg-warning/10 text-warning border border-warning/30">{a.lateSerial}</span>
                  <Avatar id={a.emp.id} name={a.emp.name} size={30} />
                  <div className="min-w-[160px]">
                    <div className="text-sm font-medium">{a.emp.name}</div>
                    <div className="text-xs text-muted-foreground">{a.emp.role} · {a.emp.zone ?? "HQ"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">Login {fmtMin(a.loginMin ?? 0)}</div>
                  <div className={`text-xs font-mono ml-auto ${a.lateBy > 30 ? "text-destructive" : "text-warning"}`}>+{fmtDur(a.lateBy)}</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Coffee className="w-4 h-4 text-primary" />
              <h2 className="font-display text-base font-semibold">Break overrun</h2>
              <span className="text-xs text-muted-foreground">Allowance 45 minutes across the day</span>
            </div>
            {overBreak.length === 0 && <div className="px-4 py-6 text-sm text-muted-foreground">Every break stayed inside the allowance.</div>}
            <div className="divide-y divide-border">
              {overBreak.map((a) => (
                <button key={a.emp.id} type="button" onClick={() => openPerson(a.emp.id)} className="w-full text-left px-4 py-2.5 flex flex-wrap items-center gap-3 hover:bg-secondary transition-colors">
                  <Avatar id={a.emp.id} name={a.emp.name} size={30} />
                  <div className="min-w-[160px]">
                    <div className="text-sm font-medium">{a.emp.name}</div>
                    <div className="text-xs text-muted-foreground">{a.emp.zone ?? "HQ"} · {a.lateBreakReturns} late return(s)</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.breaks.map((b) => <Chip key={b.label}>{b.label} {fmtMin(b.start)} to {fmtMin(b.end)}</Chip>)}
                  </div>
                  <div className="ml-auto text-xs font-mono text-destructive">over by {fmtDur(a.overBreakMin)}</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <UserX className="w-4 h-4 text-destructive" />
              <h2 className="font-display text-base font-semibold">Absent and on leave</h2>
            </div>
            <div className="divide-y divide-border">
              {att.filter((a) => !a.present).map((a) => (
                <button key={a.emp.id} type="button" onClick={() => openPerson(a.emp.id)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-secondary transition-colors">
                  <Avatar id={a.emp.id} name={a.emp.name} size={30} />
                  <div className="text-sm">{a.emp.name} <span className="text-muted-foreground text-xs">· {a.emp.role}</span></div>
                  <span className={`ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded border ${a.onLeave ? "bg-primary/10 text-primary border-primary/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
                    {a.onLeave ? "Approved leave" : "No show"}
                  </span>
                </button>
              ))}
              {att.every((a) => a.present) && <div className="px-4 py-6 text-sm text-muted-foreground">Full roster present.</div>}
            </div>
          </section>
        </div>
      )}

      {hydrated && tab === "zones" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(buildZoneAttendanceDigest(date, zAtt), "Zone discipline")}>
              <Copy className="w-4 h-4 mr-1.5" /> Copy zone discipline
            </Button>
            <Button variant="outline" size="sm" onClick={() => copy(buildZoneDigest(date), "Zone health")}>
              <Copy className="w-4 h-4 mr-1.5" /> Copy zone health
            </Button>
          </div>

          <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {zAtt.map((z) => {
              const health = zones.find((x) => x.zone === z.zone);
              const zoneIds = new Set(z.list.map((x) => x.emp.id));
              return (
                <div key={z.zone} className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="font-display text-base font-semibold">{z.zone}</div>
                    <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${badge(tone(z.roll.punctuality, 90, 75))}`}>
                      {z.roll.punctuality}% punctual
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <KV k="Present" v={`${z.roll.present}/${z.roll.roster}`}
                      onClick={() => openDrill(`${z.zone} · present`, prettyDate(date), presentEntries.filter((e) => zoneIds.has(e.row.emp.id)))} />
                    <KV k="Late" v={`${z.roll.late}`}
                      onClick={() => openDrill(`${z.zone} · late`, "Arrival past 10:35", lateEntries.filter((e) => zoneIds.has(e.row.emp.id)))} />
                    <KV k="Break overrun" v={fmtDur(z.roll.overBreakMinutes)}
                      onClick={() => openDrill(`${z.zone} · break overrun`, "Allowance 45 minutes", overBreakEntries.filter((e) => zoneIds.has(e.row.emp.id)))} />
                    <KV k="Idle" v={fmtDur(z.roll.idleMinutes)}
                      onClick={() => openDrill(`${z.zone} · everyone`, "Tap a name for the full day", presentEntries.filter((e) => zoneIds.has(e.row.emp.id)))} />
                    <KV k="Selfie check" v={`${z.roll.selfieCompliance}%`}
                      onClick={() => openDrill(`${z.zone} · selfie misses`, "Morning, before break, after break, EOD", selfieEntries.filter((e) => zoneIds.has(e.row.emp.id)))} />
                    <KV k="Avg login" v={z.roll.avgLoginMin ? fmtMin(z.roll.avgLoginMin) : "n/a"}
                      onClick={() => openDrill(`${z.zone} · login order`, "Earliest first", presentEntries.filter((e) => zoneIds.has(e.row.emp.id)))} />
                  </div>
                  {health && (
                    <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                      {health.components.slice(0, 4).map((c) => (
                        <div key={c.label} className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-28">{c.label}</span>
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full ${c.pct >= 90 ? "bg-success" : c.pct >= 75 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${c.pct}%` }} />
                          </div>
                          <span className="font-mono text-[10px] w-8 text-right">{c.pct}%</span>
                        </div>
                      ))}
                      <div className="text-xs text-muted-foreground pt-1">
                        Bookings {health.block.closing.bookings}/{health.block.closing.bbdTarget} · Waiting on us {health.block.chats.waitingUs} · Unassigned {health.block.demand.unassigned}
                      </div>
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs"
                    onClick={() => { setZoneFilter(z.zone); setTab("people"); }}>
                    Open {z.zone} people
                  </Button>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {hydrated && tab === "report" && (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-primary">Ready to paste</div>
              <h2 className="font-display text-lg font-semibold">WhatsApp report · {prettyDate(date)}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(digest)}>Rebuild from live data</Button>
              <Button variant="outline" size="sm" onClick={() => setDraft(buildDisciplineDigest(date, att))}>Discipline only</Button>
              <Button variant="outline" size="sm" onClick={() => setDraft(buildZoneAttendanceDigest(date, zAtt))}>Zones only</Button>
              <Button variant="outline" size="sm" onClick={() => copy(draft, "Report")}><Copy className="w-4 h-4 mr-1.5" /> Copy</Button>
              <a href={waDeepLink(draft)} target="_blank" rel="noreferrer">
                <Button size="sm"><MessageCircle className="w-4 h-4 mr-1.5" /> Open WhatsApp</Button>
              </a>
            </div>
          </div>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-xs min-h-[380px] bg-background" />
          <p className="text-xs text-muted-foreground mt-2">Edit anything before sending. Mark-ups, notes, late serials and break overruns are already inside this text.</p>
        </section>
      )}

      <PeopleDrill
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        entries={drill?.entries ?? []}
        onPick={(r) => openPerson(r.emp.id, drill?.pane ?? "timeline")}
        onCopy={drill ? () => copy(
          [`*${drill.title}*`, drill.subtitle ?? "", "", ...drill.entries.map((e, i) => `${i + 1}. ${e.row.emp.name} — ${e.reason}${e.right ? ` (${e.right})` : ""}`)].join("\n"),
          drill.title,
        ) : undefined}
      />

      <PersonSheet
        key={sheetId ?? "none"}
        open={!!sheetId}
        onClose={() => setSheetId(null)}
        row={sheetId ? rows.find((r) => r.emp.id === sheetId) ?? null : null}
        att={sheetId ? attById.get(sheetId) : undefined}
        date={date}
        pane={sheetPane}
        onPane={setSheetPane}
        onJumpDate={jumpDate}
      />
    </div>
  );
}

function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : 0;
}
function tone(pct: number, good: number, warn: number): "good" | "warn" | "bad" {
  return pct >= good ? "good" : pct >= warn ? "warn" : "bad";
}
function badge(t: "good" | "warn" | "bad") {
  return t === "good"
    ? "bg-success/10 text-success border-success/30"
    : t === "warn"
      ? "bg-warning/10 text-warning border-warning/30"
      : "bg-destructive/10 text-destructive border-destructive/30";
}

function Stat({ label, value, tone: t, sub, onClick }: { label: string; value: string; tone?: "good" | "warn" | "bad"; sub?: string; onClick?: () => void }) {
  const cls = t === "good" ? "text-success" : t === "warn" ? "text-warning" : t === "bad" ? "text-destructive" : "";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`rounded-xl border border-border bg-card px-3 py-2.5 text-left w-full ${onClick ? "cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all" : ""}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-display text-xl font-semibold ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </Tag>
  );
}

function Panel({ title, icon, children, onSee }: { title: string; icon: React.ReactNode; children: React.ReactNode; onSee?: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className="font-display text-base font-semibold">{title}</h2>
        {onSee && (
          <button type="button" onClick={onSee} className="ml-auto text-xs text-primary hover:underline underline-offset-2">
            See all
          </button>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Line({ left, right, good, onClick }: { left: string; right: string; good: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`w-full flex items-center justify-between text-sm text-left ${onClick ? "hover:text-primary transition-colors" : ""}`}>
      <span className="truncate">{left}</span>
      <span className={`font-mono text-xs ${good ? "text-success" : "text-warning"}`}>{right}</span>
    </Tag>
  );
}

function KV({ k, v, onClick }: { k: string; v: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`w-full flex items-center justify-between gap-2 ${onClick ? "hover:text-primary transition-colors" : ""}`}>
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono underline-offset-2 decoration-dotted underline">{v}</span>
    </Tag>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded border border-border bg-secondary/50 font-mono text-[10px]">{children}</span>;
}
