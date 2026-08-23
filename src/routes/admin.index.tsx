/**
 * FOUNDER OS — the single command page.
 *
 * One time control drives every number. Every number is clickable and opens
 * the exact customers behind it. Nothing here is demo data: it is all derived
 * from the live CRM snapshot.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, ArrowRight, ClipboardCopy, Flame, Grid3x3, Users,
} from "lucide-react";
import { watchCrm } from "@/founder/lib/crm-link";
import {
  buildCompanyNow, explain, type StageStat, type WhyAnalysis, type FeedEvent,
} from "@/founder/lib/brain/company-now";
import { buildPeople, buildZones, buildCheckpoints, peopleWhatsApp, type PersonNow } from "@/founder/lib/brain/people-now";
import {
  COMPARE_OPTIONS, PERIOD_OPTIONS, compareRange, delta, periodRange, rangeLabel,
  type CompareKey, type PeriodKey,
} from "@/founder/lib/brain/timeengine";
import { DrillDrawer, type Drill } from "@/founder/components/brain/DrillDrawer";
import { PersonSheet } from "@/founder/components/brain/PersonSheet";
import type { Metric } from "@/founder/lib/brain/engine";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Founder OS · Run Gharpayy from one page" },
      { name: "description", content: "Live company funnel, people desk, zone truth, recovery war room and EOD — every number clickable down to the customer." },
      { property: "og:title", content: "Founder OS · Run Gharpayy from one page" },
      { property: "og:description", content: "One time control, 18-stage funnel, people truth and a recovery war room built on live CRM data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FounderOS,
});

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function copy(text: string, label: string) {
  void navigator.clipboard?.writeText(text);
  toast.success(`${label} copied`);
}

function DeltaChip({ cur, prev }: { cur: number; prev: number | null }) {
  const d = delta(cur, prev);
  if (prev == null) return null;
  const cls = d.dir === "up" ? "text-emerald-600" : d.dir === "down" ? "text-destructive" : "text-muted-foreground";
  return <span className={`text-[10px] font-medium ${cls}`}>{d.text}</span>;
}

function FounderOS() {
  const [hydrated, setHydrated] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => {
    setHydrated(true);
    return watchCrm(() => bump((n) => n + 1));
  }, []);

  const [period, setPeriod] = useState<PeriodKey>("today");
  const [cmpKey, setCmpKey] = useState<CompareKey>("yesterday");
  const [drill, setDrill] = useState<Drill | null>(null);
  const [why, setWhy] = useState<WhyAnalysis | null>(null);
  const [person, setPerson] = useState<PersonNow | null>(null);
  const [feedKind, setFeedKind] = useState<string>("all");

  const range = useMemo(() => periodRange(period), [period, hydrated]);
  const cmp = useMemo(() => compareRange(range, cmpKey), [range, cmpKey]);

  const company = useMemo(() => (hydrated ? buildCompanyNow(range, cmp) : null), [hydrated, range, cmp, bump]);
  const people = useMemo(() => (company ? buildPeople(company.snap, range, cmp) : []), [company, range, cmp]);
  const zones = useMemo(() => (company ? buildZones(people, company.snap) : []), [company, people]);
  const checkpoints = useMemo(() => (people.length ? buildCheckpoints(people) : []), [people]);

  if (!hydrated || !company) {
    return <div className="rounded-lg border p-10 text-sm text-muted-foreground">Reading the live CRM…</div>;
  }

  const g = (k: string) => company.funnel.find((f) => f.key === k);
  const headline: { key: string; label: string }[] = [
    { key: "new", label: "New leads" },
    { key: "connected", label: "Connected" },
    { key: "tour-sched", label: "Tours booked" },
    { key: "tour-done", label: "Tours done" },
    { key: "quote", label: "Quotations" },
    { key: "booking", label: "Bookings" },
    { key: "checkin", label: "Check-ins" },
  ];

  const openStage = (s: StageStat) => {
    setDrill({ title: s.label, subtitle: `${s.count} in ${range.label}${cmp ? ` · ${s.prev} in ${cmp.label}` : ""} · ${s.conversion}% from previous stage`, rows: s.rows });
  };
  const openMetric = (p: PersonNow, m: Metric) =>
    setDrill({ title: `${p.name} · ${m.label}`, subtitle: `${m.value}${m.suffix ?? ""} in ${range.label}`, rows: m.rows });

  const feed: FeedEvent[] = company.feed.filter((f) => feedKind === "all" || f.kind === feedKind);
  const feedKinds = ["all", ...Array.from(new Set(company.feed.map((f) => f.kind)))];

  return (
    <div className="space-y-4 pb-24">
      {/* ---------------- time control ---------------- */}
      <section className="sticky top-[64px] z-30 rounded-lg border bg-card/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIOD_OPTIONS.filter((p) => p.id !== "custom").map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`rounded-full border px-2.5 py-1 text-xs ${period === p.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{range.label}</span>
          <span>{rangeLabel(range)}</span>
          <span>vs</span>
          <select value={cmpKey} onChange={(e) => setCmpKey(e.target.value as CompareKey)}
            className="rounded border bg-background px-2 py-1 text-xs">
            {COMPARE_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <Link to="/admin/sheet" className="ml-auto inline-flex items-center gap-1 text-primary">
            <Grid3x3 className="h-3.5 w-3.5" /> Spreadsheet view
          </Link>
        </div>
      </section>

      {/* ---------------- result strip ---------------- */}
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        {headline.map((h) => {
          const s = g(h.key);
          if (!s) return null;
          return (
            <button key={h.key} onClick={() => openStage(s)}
              className="rounded-lg border bg-card p-3 text-left transition hover:border-primary">
              <div className="text-2xl font-bold">{s.count}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">{h.label}</div>
              <div className="mt-1 flex items-center gap-1">
                <DeltaChip cur={s.count} prev={s.prev} />
              </div>
              <div className="mt-1 text-[10px] text-primary">open {s.rows.length} →</div>
            </button>
          );
        })}
      </section>

      {/* ---------------- recovery hero ---------------- */}
      {company.recovery.length > 0 && (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Flame className="h-4 w-4 text-destructive" />
            <div className="font-semibold">Recovery War Room</div>
            <Badge variant="destructive" className="text-[10px]">
              {company.recoverableBookings} bookings recoverable · {money(company.recoverableRevenue)}
            </Badge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {company.recovery.map((r) => (
              <button key={r.id} onClick={() => setDrill({ title: r.title, subtitle: `${r.count} cases · ${r.bookings} recoverable bookings · deadline ${r.deadline}`, rows: r.rows })}
                className="rounded-md border bg-card p-3 text-left transition hover:border-primary">
                <div className="flex items-baseline justify-between">
                  <div className="text-xl font-bold">{r.count}</div>
                  <div className="text-[11px] text-muted-foreground">{r.deadline}</div>
                </div>
                <div className="text-xs">{r.title}</div>
                <div className="mt-1 text-[11px] text-emerald-600">+{r.bookings} bookings · {money(r.revenue)}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- funnel grid ---------------- */}
      <section className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">Company funnel — {range.label}</div>
          <span className="text-xs text-muted-foreground">click a stage to open the customers · “Why” explains the movement</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {company.funnel.map((s) => (
            <div key={s.key} className="rounded-md border p-3">
              <button onClick={() => openStage(s)} className="w-full text-left">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold">{s.count}</span>
                  <DeltaChip cur={s.count} prev={s.prev} />
                </div>
                <div className="text-xs font-medium">{s.label}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {s.conversion}% from previous · median {s.medianMins}m · EOD ~{s.projection}
                </div>
              </button>
              <Progress value={Math.min(100, s.conversion)} className="mt-2 h-1" />
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {s.notes.map((n) => (
                  <button key={n} onClick={() => openStage(s)}>
                    <Badge variant="outline" className="text-[10px]">{n}</Badge>
                  </button>
                ))}
                {s.overdue > 0 && <Badge variant="destructive" className="text-[10px]">{s.overdue} overdue</Badge>}
                <button className="ml-auto text-[11px] text-primary"
                  onClick={() => setWhy(explain(s.key, company.snap, range, cmp))}>
                  Why →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- checkpoints ---------------- */}
      {checkpoints.length > 0 && (
        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {checkpoints.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{c.at} · {c.label}</span>
                {c.upcoming && <Badge variant="outline" className="text-[10px]">Upcoming</Badge>}
              </div>
              <div className="mt-2 flex gap-1.5 text-xs">
                {([["done", c.done], ["late", c.late], ["missed", c.missed]] as const).map(([k, list]) => (
                  <button key={k}
                    onClick={() => setDrill({
                      title: `${c.label} · ${k}`,
                      subtitle: `${list.length} people`,
                      rows: list.map((p) => ({
                        id: p.id, kind: "person" as const, title: p.name, subtitle: p.verdict,
                        owner: p.name, zone: p.zone, nextAction: p.flags[0] ?? "Keep going",
                        problem: k === "done" ? undefined : `Checkpoint ${k}`,
                      })),
                    })}
                    className={`flex-1 rounded border px-2 py-1 ${k === "done" ? "border-emerald-500/40" : k === "late" ? "border-amber-500/40" : "border-destructive/40"}`}>
                    <div className="text-base font-bold">{list.length}</div>
                    <div className="text-[10px] capitalize text-muted-foreground">{k}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ---------------- people desk ---------------- */}
      <section className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <div className="text-sm font-semibold">People Desk</div>
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
            onClick={() => copy(peopleWhatsApp(people, range.label), "People desk")}>
            <ClipboardCopy className="mr-1 h-3 w-3" /> WhatsApp
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                {["Person", "Grade", "Score", "Calls", "Conn%", "Tours", "Done", "Quotes", "Bookings", "Untouched", "Overdue", "Verdict"].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b hover:bg-muted/50">
                  <td className="px-2 py-1.5">
                    <button className="font-medium text-primary" onClick={() => setPerson(p)}>{p.name}</button>
                    <div className="text-[10px] text-muted-foreground">{p.zone} · {p.lastSeen}</div>
                  </td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{p.grade}</Badge></td>
                  <td className="px-2 py-1.5 font-semibold">{p.score}</td>
                  {(["calls", "connectRate", "toursScheduled", "toursDone", "quotes", "bookings", "untouched", "overdue"] as const).map((k) => (
                    <td key={k} className="px-2 py-1.5">
                      <button className="hover:underline" onClick={() => setPerson(p)}>{p.v[k]}</button>
                    </td>
                  ))}
                  <td className="max-w-[260px] truncate px-2 py-1.5 text-muted-foreground">{p.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- zones ---------------- */}
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {zones.map((z) => (
          <button key={z.name} onClick={() => setDrill({ title: `${z.name} · untouched leads`, subtitle: `${z.people.join(", ")}`, rows: z.rows })}
            className="rounded-lg border bg-card p-3 text-left transition hover:border-primary">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">{z.name}</span>
              <Badge variant="outline" className="text-[10px]">score {z.score}</Badge>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {z.leads} leads · {z.calls} calls · {z.toursDone} tours done · {z.bookings} bookings
            </div>
            <div className="mt-1 text-[11px] text-destructive">{z.untouched} untouched</div>
          </button>
        ))}
      </section>

      {/* ---------------- live feed ---------------- */}
      <section className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <div className="text-sm font-semibold">Live feed</div>
          {feedKinds.map((k) => (
            <button key={k} onClick={() => setFeedKind(k)}
              className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${feedKind === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {k}
            </button>
          ))}
        </div>
        <div className="max-h-[380px] space-y-1 overflow-y-auto">
          {feed.length === 0 && <div className="text-xs text-muted-foreground">Nothing happened in this window.</div>}
          {feed.map((f) => (
            <button key={f.id} disabled={!f.row}
              onClick={() => f.row && setDrill({ title: f.text, subtitle: `${f.owner} · ${f.zone}`, rows: [f.row] })}
              className="flex w-full gap-2 border-b py-1 text-left text-xs last:border-0 disabled:opacity-70">
              <span className="w-12 shrink-0 text-muted-foreground">{f.time}</span>
              <span className="w-16 shrink-0 capitalize text-primary">{f.kind}</span>
              <span className="flex-1">{f.text}</span>
              <span className="shrink-0 text-muted-foreground">{f.owner}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------------- EOD bubble ---------------- */}
      <section className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <div className="text-sm font-semibold">EOD summary</div>
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => copy(company.eod.text, "EOD")}>
            <ClipboardCopy className="mr-1 h-3 w-3" /> Copy
          </Button>
        </div>
        <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-[11px] leading-relaxed">{company.eod.text}</pre>
      </section>

      {/* ---------------- why panel ---------------- */}
      {why && (
        <section className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t bg-card p-4 shadow-2xl">
          <div className="mx-auto max-w-[1200px]">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">{why.title}</div>
              <span className="text-xs text-muted-foreground">{why.headline}</span>
              <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setWhy(null)}>Close</Button>
            </div>
            <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">{why.conclusion}</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Zones</div>
                {why.zones.map((z) => (
                  <div key={z.name} className="flex justify-between border-b py-1 text-xs last:border-0">
                    <span>{z.name}</span>
                    <span className={z.delta < 0 ? "text-destructive" : "text-emerald-600"}>{z.current} ({z.delta >= 0 ? "+" : ""}{z.delta})</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Chain</div>
                <div className="max-h-[220px] overflow-y-auto">
                  {why.chain.map((c) => (
                    <div key={c.label} className="flex justify-between border-b py-1 text-xs last:border-0">
                      <span>{c.label}</span>
                      <span className={c.deltaPct < 0 ? "text-destructive" : "text-emerald-600"}>{c.current} ({c.deltaPct >= 0 ? "+" : ""}{c.deltaPct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">People</div>
                <div className="max-h-[220px] overflow-y-auto">
                  {why.people.map((p) => (
                    <button key={p.name} onClick={() => setDrill({ title: `${why.title} · ${p.name}`, subtitle: p.line, rows: p.rows })}
                      className="flex w-full items-center gap-2 border-b py-1 text-left text-xs last:border-0 hover:bg-muted">
                      <span className="font-medium">{p.name}</span>
                      <span className="truncate text-muted-foreground">{p.line}</span>
                      <ArrowRight className="ml-auto h-3 w-3 shrink-0 text-primary" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <DrillDrawer drill={drill} onClose={() => setDrill(null)} />
      <PersonSheet person={person} onClose={() => setPerson(null)} onMetric={openMetric} rangeLabel={range.label} />
    </div>
  );
}
