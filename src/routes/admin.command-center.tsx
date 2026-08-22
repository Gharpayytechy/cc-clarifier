import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGate } from "@/founder/components/RoleGate";
import { SendUpdateButton } from "@/founder/components/reporting/SendUpdateButton";
import { DownloadMenu } from "@/founder/components/reporting/DownloadMenu";
import {
  allZones, biggestRisk, companyBlock, healthClass, healthDot, PERIOD_LABEL,
  peopleInScope, scopeBlock, zoneRows, type Period, type Scope,
} from "@/founder/lib/command-center/metrics";
import { Avatar } from "@/founder/components/Avatar";
import { ChevronRight, Activity, LayoutGrid, Table2, Flame } from "lucide-react";

export const Route = createFileRoute("/admin/command-center")({
  component: () => (
    <RoleGate allow={["leadership", "hr"]}>
      <CommandCenter />
    </RoleGate>
  ),
  head: () => ({
    meta: [
      { title: "Zone Command Center · Gharpayy Admin" },
      { name: "description", content: "Company → Zone → Role → Person → Customer control in one screen: live people, demand, chat health, tours, closing and reporting compliance." },
      { property: "og:title", content: "Zone Command Center · Gharpayy Admin" },
      { property: "og:description", content: "Total company view, zone health grid, at-risk people and one-click founder updates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const PERIODS: Period[] = ["live", "last60", "today", "cp_1pm", "cp_4pm", "cp_5pm", "eod", "week", "month"];

function CommandCenter() {
  const [period, setPeriod] = useState<Period>("live");
  const [scope, setScope] = useState<Scope>({ kind: "company", zones: [] });
  const [view, setView] = useState<"cards" | "table" | "heatmap">("cards");
  const [control, setControl] = useState(false);

  const rows = useMemo(() => zoneRows(), []);
  const block = useMemo(() => (scope.kind === "company" ? companyBlock() : scopeBlock(scope)), [scope]);
  const risk = biggestRisk(block);
  const people = peopleInScope(scope);
  const attention = people.filter((e) => e.performance < 78 || e.flags.length > 0 || e.status === "Idle");

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1500px] mx-auto">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary mb-1.5">Gharpayy Today · Live · Last sync 2 min ago</div>
          <h1 className="font-display text-2xl md:text-4xl font-semibold tracking-tight">Zone Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {scope.kind === "company" ? "All Gharpayy" : scope.zones.join(", ")} · {PERIOD_LABEL[period]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadMenu label="Download" scope={scope} period={period} />
          <SendUpdateButton defaultScope={scope} defaultPeriod={period} />
        </div>
      </header>

      {/* Sticky scope + time bar */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-2.5 bg-background/95 backdrop-blur border-y border-border mb-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mr-1">Scope</span>
          <Chip active={scope.kind === "company"} onClick={() => setScope({ kind: "company", zones: [] })}>All Gharpayy</Chip>
          {allZones().map((z) => {
            const on = scope.kind === "zones" && scope.zones.includes(z);
            return (
              <Chip key={z} active={on} onClick={() => setScope((s) => {
                const zones = s.kind === "zones" ? (on ? s.zones.filter((x) => x !== z) : [...s.zones, z]) : [z];
                return zones.length ? { kind: "zones", zones } : { kind: "company", zones: [] };
              })}>{z}</Chip>
            );
          })}
          <span className="w-px h-4 bg-border mx-1" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mr-1">Time</span>
          {PERIODS.map((p) => <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</Chip>)}
          <span className="w-px h-4 bg-border mx-1" />
          <Chip active={control} onClick={() => setControl((c) => !c)}>🔥 Control mode</Chip>
        </div>
      </div>

      {/* Company result strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-5">
        <Stat label="BBD" value={`${block.closing.bookings}/${block.closing.bbdTarget}`} tone={block.closing.bookings >= block.closing.bbdTarget ? "good" : "warn"} />
        <Stat label="Present" value={`${block.people.present}/${block.people.expected}`} />
        <Stat label="Active now" value={block.people.active} />
        <Stat label="Unassigned" value={block.demand.unassigned} tone={block.demand.unassigned ? "bad" : "good"} />
        <Stat label="Chats waiting us" value={block.chats.waitingUs} tone={block.chats.waitingUs ? "bad" : "good"} />
        <Stat label="Tours done" value={`${block.tours.completed}/${block.tours.scheduled}`} />
      </section>

      {control ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 md:p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="h-4 w-4 text-destructive" />
            <h2 className="font-display text-lg font-semibold">Control mode · needs intervention right now</h2>
          </div>
          <ul className="space-y-2 text-sm">
            <Need n={block.people.idle} what="people idle" to="/tower/team" cta="Open roster" />
            <Need n={block.chats.waitingUs} what="chats waiting on Gharpayy" to="/inbox" cta="Open chats" />
            <Need n={block.tours.unconfirmed} what="tours not confirmed" to="/tower/dashboard" cta="Open tours" />
            <Need n={Math.max(block.people.present - block.reporting.cp5, 0)} what="5 PM reports missing" to="/tower/quality" cta="Open reporting" />
            <Need n={block.management.supportPending} what="support requests pending" to="/inbox" cta="Escalate" />
          </ul>
        </section>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Panel title="People">
          <Row k="Expected" v={block.people.expected} />
          <Row k="Present" v={block.people.present} />
          <Row k="Absent" v={block.people.absent} />
          <Row k="Active now" v={block.people.active} />
          <Row k="On break" v={block.people.onBreak} />
          <Row k="Idle / underloaded" v={block.people.idle} />
          <Row k="Blocked" v={block.people.blocked} />
          <Row k="At risk" v={block.people.atRisk} tone="bad" />
        </Panel>
        <Panel title="Demand & conversations">
          <Row k="New leads" v={block.demand.newLeads} />
          <Row k="Active leads" v={block.demand.activeLeads} />
          <Row k="Assigned" v={`${block.demand.assigned}/${block.demand.activeLeads}`} />
          <Row k="Unassigned" v={block.demand.unassigned} tone={block.demand.unassigned ? "bad" : "good"} />
          <Row k="Active chats" v={block.chats.active} />
          <Row k="Waiting on us" v={block.chats.waitingUs} tone={block.chats.waitingUs ? "bad" : "good"} />
          <Row k="SLA breached" v={block.chats.slaBreached} tone={block.chats.slaBreached ? "bad" : "good"} />
          <Row k="No next action" v={block.chats.noNextAction} />
        </Panel>
        <Panel title="Tours, closing & reporting">
          <Row k="Tours scheduled" v={block.tours.scheduled} />
          <Row k="Confirmed" v={block.tours.confirmed} />
          <Row k="Unconfirmed" v={block.tours.unconfirmed} tone={block.tours.unconfirmed ? "warn" : "good"} />
          <Row k="Completed" v={block.tours.completed} />
          <Row k="High intent" v={block.closing.highIntent} />
          <Row k="Payments pending" v={block.closing.paymentPending} />
          <Row k="Verified bookings" v={block.closing.bookings} />
          <Row k="Reporting compliance" v={`${block.reporting.compliance}%`} />
        </Panel>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 md:p-5 mb-6">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Today's biggest problem</div>
        <div className="font-display text-lg font-semibold">{risk.risk}</div>
        <div className="text-sm text-muted-foreground mt-1">Action taken: {risk.action}</div>
      </section>

      {/* Zone health */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg md:text-xl font-semibold">Zone health</h2>
          <div className="flex gap-1">
            <Toggle on={view === "cards"} onClick={() => setView("cards")} icon={LayoutGrid} label="Cards" />
            <Toggle on={view === "table"} onClick={() => setView("table")} icon={Table2} label="Table" />
            <Toggle on={view === "heatmap"} onClick={() => setView("heatmap")} icon={Activity} label="Heatmap" />
          </div>
        </div>

        {view === "cards" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((r) => (
              <div key={r.zone} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-display text-base font-semibold">{r.zone}</div>
                  <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${healthClass(r.health)}`}>{r.health}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-1 text-[12px] text-muted-foreground">
                  <span>Present</span><span className="text-foreground text-right">{r.block.people.present}/{r.block.people.expected}</span>
                  <span>Active</span><span className="text-foreground text-right">{r.block.people.active}</span>
                  <span>Unassigned</span><span className="text-foreground text-right">{r.block.demand.unassigned}</span>
                  <span>Waiting us</span><span className="text-foreground text-right">{r.block.chats.waitingUs}</span>
                  <span>Tours</span><span className="text-foreground text-right">{r.block.tours.completed}/{r.block.tours.scheduled}</span>
                  <span>BBD</span><span className="text-foreground text-right">{r.block.closing.bookings}/{r.block.closing.bbdTarget}</span>
                  <span>Reporting</span><span className="text-foreground text-right">{r.block.reporting.compliance}%</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => setScope({ kind: "zones", zones: [r.zone] })}
                    className="text-xs text-primary hover:underline inline-flex items-center">Open zone <ChevronRight className="h-3 w-3" /></button>
                  <SendUpdateButton label="Send Zone Update" variant="outline" defaultScope={{ kind: "zones", zones: [r.zone] }} defaultPeriod={period} defaultRecipient="Zone Manager" />
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "table" && (
          <div className="rounded-2xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <tr>{["Zone", "People", "Active", "Idle", "Leads", "Unassigned", "Waiting us", "Tours", "Completed", "BBD", "Reporting", "Health"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.zone} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{r.zone}</td>
                    <td className="px-3 py-2">{r.block.people.present}/{r.block.people.expected}</td>
                    <td className="px-3 py-2">{r.block.people.active}</td>
                    <td className="px-3 py-2">{r.block.people.idle}</td>
                    <td className="px-3 py-2">{r.block.demand.activeLeads}</td>
                    <td className="px-3 py-2">{r.block.demand.unassigned}</td>
                    <td className="px-3 py-2">{r.block.chats.waitingUs}</td>
                    <td className="px-3 py-2">{r.block.tours.scheduled}</td>
                    <td className="px-3 py-2">{r.block.tours.completed}</td>
                    <td className="px-3 py-2">{r.block.closing.bookings}/{r.block.closing.bbdTarget}</td>
                    <td className="px-3 py-2">{r.block.reporting.compliance}%</td>
                    <td className="px-3 py-2">{healthDot(r.health)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === "heatmap" && (
          <div className="rounded-2xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <tr><th className="text-left px-3 py-2">Zone</th>
                  {["Workforce", "Lead ownership", "Chat health", "Tour movement", "Closing", "Reporting", "SLA", "Reconciliation"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 whitespace-nowrap">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.zone}>
                    <td className="px-3 py-2 font-medium">{r.zone}</td>
                    {r.components.map((c) => (
                      <td key={c.label} className="px-3 py-2">
                        <button onClick={() => setScope({ kind: "zones", zones: [r.zone] })} className="hover:underline">
                          {c.pct >= 92 ? "🟢" : c.pct >= 84 ? "🟠" : "🔴"} <span className="text-xs text-muted-foreground">{c.pct}%</span>
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* People needing attention */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">People needing attention</h2>
            <p className="text-xs text-muted-foreground">{attention.length} in current scope · click through to the person</p>
          </div>
          <DownloadMenu label="Download current view" scope={scope} period={period} />
        </div>
        <div className="divide-y divide-border">
          {attention.slice(0, 12).map((e) => (
            <div key={e.id} className="px-4 md:px-5 py-2.5 flex items-center gap-3">
              <Avatar id={e.id} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{e.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{e.role} · {e.zone ?? "—"} · {e.flags[0] ?? e.status}</div>
              </div>
              <div className="font-mono text-sm">{e.performance}%</div>
              <SendUpdateButton label="Send Update to Manager" variant="outline" defaultRecipient="Manager"
                defaultScope={{ kind: "person", zones: [], personId: e.id }} defaultPeriod={period} />
            </div>
          ))}
          {attention.length === 0 && <div className="px-5 py-6 text-sm text-muted-foreground">Nobody flagged in this scope.</div>}
        </div>
      </section>

      <div className="mt-6 text-xs text-muted-foreground">
        Drill deeper: <Link to="/tower/team" className="text-primary hover:underline">People</Link> ·{" "}
        <Link to="/tower/quality" className="text-primary hover:underline">Reporting OS</Link> ·{" "}
        <Link to="/admin/report-center" className="text-primary hover:underline">Report Center</Link> ·{" "}
        <Link to="/admin" className="text-primary hover:underline">Founder mode</Link>
      </div>
    </div>
  );
}

function Need({ n, what, to, cta }: { n: number; what: string; to: string; cta: string }) {
  if (!n) return null;
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <span><span className="font-mono font-semibold">{n}</span> {what}</span>
      <Link to={to} className="text-xs text-primary hover:underline">{cta} →</Link>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : "";
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-display text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : "";
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-mono font-medium ${cls}`}>{v}</span>
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md border ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
      {children}
    </button>
  );
}
