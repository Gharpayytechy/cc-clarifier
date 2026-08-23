/**
 * FOUNDER SHEET — the whole roster as one spreadsheet over PersonNow.v.
 * Same time engine as the command page; every cell opens the customers behind it.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGate } from "@/founder/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ClipboardCopy, Search } from "lucide-react";
import { watchCrm, crmSnapshot } from "@/founder/lib/crm-link";
import { buildPeople, peopleWhatsApp, type PersonNow } from "@/founder/lib/brain/people-now";
import {
  COMPARE_OPTIONS, PERIOD_OPTIONS, compareRange, periodRange, rangeLabel,
  type CompareKey, type PeriodKey,
} from "@/founder/lib/brain/timeengine";
import { DrillDrawer, type Drill } from "@/founder/components/brain/DrillDrawer";
import { PersonSheet } from "@/founder/components/brain/PersonSheet";
import type { Metric } from "@/founder/lib/brain/engine";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/sheet")({
  component: () => (
    <RoleGate allow={["superadmin", "leadership", "hr"]}>
      <FounderSheet />
    </RoleGate>
  ),
  head: () => ({
    meta: [
      { title: "Founder Sheet · Every person and every number in one grid" },
      { name: "description", content: "Spreadsheet grid of the whole team: pipeline, calls, tours, quotations, bookings and discipline for any time window. Every cell drills to the customers." },
      { property: "og:title", content: "Founder Sheet · Every person and every number in one grid" },
      { property: "og:description", content: "Pipeline, calls, tours, quotations, bookings and discipline for any time window — copyable to Excel or WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Col = { key: string; label: string; group: string; metric?: string; suffix?: string };

const COLS: Col[] = [
  { key: "score", label: "Score", group: "Verdict" },
  { key: "effort", label: "Effort", group: "Verdict" },
  { key: "outcome", label: "Outcome", group: "Verdict" },
  { key: "discipline", label: "Discipline", group: "Verdict" },
  { key: "newLeads", label: "New added", group: "Momentum", metric: "newLeads" },
  { key: "oldContacted", label: "Old contacted", group: "Momentum", metric: "oldContacted" },
  { key: "moved", label: "Moved", group: "Momentum", metric: "moved" },
  { key: "leads", label: "Leads", group: "Pipeline", metric: "leads" },
  { key: "active", label: "Active", group: "Pipeline", metric: "active" },
  { key: "touched", label: "Worked", group: "Pipeline", metric: "touched" },
  { key: "untouched", label: "Untouched", group: "Pipeline", metric: "untouched" },
  { key: "untouched48", label: "Rot 48h", group: "Pipeline", metric: "untouched48" },
  { key: "noNext", label: "No next", group: "Pipeline", metric: "noNext" },
  { key: "hotIdle", label: "Hot idle", group: "Pipeline", metric: "hotIdle" },
  { key: "calls", label: "Calls", group: "Conversation", metric: "calls" },
  { key: "connected", label: "Conn", group: "Conversation", metric: "connected" },
  { key: "connectRate", label: "Conn%", group: "Conversation", metric: "connectRate", suffix: "%" },
  { key: "messages", label: "WA", group: "Conversation", metric: "messages" },
  { key: "notes", label: "Notes", group: "Conversation", metric: "notes" },
  { key: "toursScheduled", label: "Tours", group: "Tours", metric: "toursScheduled" },
  { key: "toursDone", label: "Done", group: "Tours", metric: "toursDone" },
  { key: "tourShowRate", label: "Show%", group: "Tours", metric: "tourShowRate", suffix: "%" },
  { key: "noShow", label: "No-show", group: "Tours", metric: "noShow" },
  { key: "postMissing", label: "Post miss", group: "Tours", metric: "postMissing" },
  { key: "staleTours", label: "Stale", group: "Tours", metric: "staleTours" },
  { key: "quotes", label: "Quotes", group: "Closing", metric: "quotes" },
  { key: "bookings", label: "Bookings", group: "Closing", metric: "bookings" },
  { key: "checkins", label: "Check-ins", group: "Closing", metric: "checkins" },
  { key: "revenue", label: "Revenue", group: "Closing", metric: "revenue" },
  { key: "momentsStuck", label: "Stuck", group: "Moments" },
  { key: "overdue", label: "Overdue", group: "Discipline", metric: "overdue" },
  { key: "followUpsDone", label: "FU done", group: "Discipline", metric: "followUpsDone" },
  { key: "activity", label: "Actions", group: "Discipline", metric: "activity" },
];

const badCols = new Set(["untouched", "untouched48", "noNext", "hotIdle", "noShow", "postMissing", "staleTours", "overdue", "momentsStuck"]);


function FounderSheet() {
  const [hydrated, setHydrated] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => {
    setHydrated(true);
    return watchCrm(() => bump((n) => n + 1));
  }, []);

  const [period, setPeriod] = useState<PeriodKey>("today");
  const [cmpKey, setCmpKey] = useState<CompareKey>("yesterday");
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("all");
  const [sortKey, setSortKey] = useState("score");
  const [drill, setDrill] = useState<Drill | null>(null);
  const [person, setPerson] = useState<PersonNow | null>(null);

  const range = useMemo(() => periodRange(period), [period, hydrated]);
  const cmp = useMemo(() => compareRange(range, cmpKey), [range, cmpKey]);
  const people = useMemo(() => (hydrated ? buildPeople(crmSnapshot(), range, cmp) : []), [hydrated, range, cmp, bump]);

  const zoneNames = useMemo(() => Array.from(new Set(people.map((p) => p.zone))), [people]);

  const rows = people
    .filter((p) => (zone === "all" || p.zone === zone))
    .filter((p) => !query || `${p.name} ${p.role} ${p.zone}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.v[sortKey] ?? 0) - (a.v[sortKey] ?? 0));

  const total = rows.length ? buildTotal(rows, zone === "all" ? "TOTAL — whole team" : `${zone} — zone total`) : null;

  const openCell = (p: PersonNow, col: Col) => {
    if (!col.metric) { setPerson(p); return; }
    let found: Metric | undefined;
    p.metrics.forEach((g) => { const hit = g.items.find((i) => i.key === col.metric); if (hit) found = hit; });
    if (!found) { setPerson(p); return; }
    setDrill({ title: `${p.name} · ${found.label}`, subtitle: `${found.value}${found.suffix ?? ""} in ${range.label}`, rows: found.rows });
  };

  const copyTsv = () => {
    const head = ["Person", "Zone", "Grade", ...COLS.map((c) => c.label)].join("\t");
    const body = [...(total ? [total] : []), ...rows].map((p) => [p.name, p.zone, p.grade, ...COLS.map((c) => p.v[c.key] ?? 0)].join("\t"));
    void navigator.clipboard?.writeText([head, ...body].join("\n"));
    toast.success("Grid copied for Excel");
  };

  const groups = COLS.reduce<{ group: string; span: number }[]>((acc, c) => {
    const last = acc[acc.length - 1];
    if (last && last.group === c.group) last.span += 1; else acc.push({ group: c.group, span: 1 });
    return acc;
  }, []);


  return (
    <div className="space-y-3 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary">Founder sheet</div>
          <h1 className="text-2xl font-semibold tracking-tight">Everyone on one grid</h1>
          <p className="text-sm text-muted-foreground">{range.label} · {rangeLabel(range)} · tap any cell to open the customers behind it</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copyTsv}><ClipboardCopy className="mr-1.5 h-4 w-4" /> Copy grid</Button>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(peopleWhatsApp(people, range.label)); toast.success("WhatsApp summary copied"); }}>
            WhatsApp
          </Button>
          <Link to="/admin"><Button variant="outline" size="sm"><ArrowLeft className="mr-1.5 h-4 w-4" /> Command page</Button></Link>
        </div>
      </header>

      <section className="sticky top-[64px] z-30 rounded-lg border bg-card/95 p-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIOD_OPTIONS.filter((p) => p.id !== "custom").map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`rounded-full border px-2.5 py-1 text-xs ${period === p.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={cmpKey} onChange={(e) => setCmpKey(e.target.value as CompareKey)} className="rounded border bg-background px-2 py-1 text-xs">
            {COMPARE_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search person, role or zone" className="h-8 pl-8 text-xs" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", ...zoneNames].map((z) => (
              <button key={z} onClick={() => setZone(z)}
                className={`rounded-full border px-2.5 py-1 text-xs ${zone === z ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {z === "all" ? "All zones" : z}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!hydrated && <div className="rounded-lg border p-10 text-sm text-muted-foreground">Loading the grid…</div>}

      {hydrated && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[1500px] border-collapse text-xs">
            <thead>
              <tr className="bg-muted/60 text-left">
                <th className="sticky left-0 z-10 bg-muted/60 px-2 py-1.5" rowSpan={2}>Person</th>
                {groups.map((g) => (
                  <th key={g.group} colSpan={g.span} className="border-l px-2 py-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                    {g.group}
                  </th>
                ))}
              </tr>
              <tr className="bg-muted/40">
                {COLS.map((c) => (
                  <th key={c.key} className="cursor-pointer border-l px-2 py-1 text-right font-medium hover:text-primary"
                    onClick={() => setSortKey(c.key)}>
                    {c.label}{sortKey === c.key ? " ▾" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/40">
                  <td className="sticky left-0 z-10 bg-card px-2 py-1.5">
                    <button className="font-medium text-primary" onClick={() => setPerson(p)}>{p.name}</button>
                    <div className="text-[10px] text-muted-foreground">{p.grade} · {p.zone} · {p.lastSeen}</div>
                  </td>
                  {COLS.map((c) => {
                    const val = p.v[c.key] ?? 0;
                    const tone = badCols.has(c.key) && val > 0 ? "text-destructive" : val === 0 ? "text-muted-foreground" : "";
                    return (
                      <td key={c.key} className="border-l px-2 py-1.5 text-right">
                        <button className={`hover:underline ${tone}`} onClick={() => openCell(p, c)}>
                          {c.key === "revenue" ? `₹${Math.round(val / 1000)}k` : val}{c.suffix ?? ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={COLS.length + 1} className="px-3 py-8 text-center text-muted-foreground">No people match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <DrillDrawer drill={drill} onClose={() => setDrill(null)} />
      <PersonSheet
        person={person}
        onClose={() => setPerson(null)}
        rangeLabel={range.label}
        onMetric={(p, m) => setDrill({ title: `${p.name} · ${m.label}`, subtitle: `${m.value}${m.suffix ?? ""} in ${range.label}`, rows: m.rows })}
      />
    </div>
  );
}
