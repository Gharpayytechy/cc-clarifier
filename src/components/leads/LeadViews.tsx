import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StageBadge, IntentChip, ConfidenceBar } from "@/components/atoms";
import { cn } from "@/lib/utils";
import { format, differenceInCalendarDays } from "date-fns";
import { ChevronLeft, ChevronRight, Flame, Layers, Phone } from "lucide-react";
import type { Lead, LeadStage } from "@/lib/types";

export type LeadViewMode = "table" | "stack" | "focus" | "board" | "buckets";

const STAGE_ORDER: LeadStage[] = [
  "new", "contacted", "tour-scheduled", "tour-done", "negotiation", "booked", "dropped",
];

const STAGE_MAX_DAYS: Record<string, number> = {
  new: 1, contacted: 3, "tour-scheduled": 2, "tour-done": 2, negotiation: 5,
};

export function urgencyScore(lead: Lead) {
  const days = differenceInCalendarDays(new Date(lead.moveInDate), new Date());
  let score = lead.confidence;
  if (lead.intent === "hot") score += 40;
  if (lead.intent === "warm") score += 15;
  if (days <= 0) score += 60;
  else if (days <= 3) score += 40;
  else if (days <= 7) score += 25;
  if (lead.nextFollowUpAt && +new Date(lead.nextFollowUpAt) < Date.now()) score += 50;
  if (!lead.nextFollowUpAt && lead.stage !== "booked" && lead.stage !== "dropped") score += 30;
  if (lead.stage === "booked" || lead.stage === "dropped") score -= 500;
  return score;
}

export function queueReason(lead: Lead): { reason: string; cta: string; level: 1 | 2 | 3 } {
  const moveIn = differenceInCalendarDays(new Date(lead.moveInDate), new Date());
  const stale = differenceInCalendarDays(new Date(), new Date(lead.updatedAt));
  const max = STAGE_MAX_DAYS[lead.stage];
  if (!lead.nextFollowUpAt && lead.stage === "new")
    return { reason: "Never contacted — first call is overdue", cta: "Call now", level: 1 };
  if (lead.nextFollowUpAt && +new Date(lead.nextFollowUpAt) < Date.now())
    return { reason: "Follow-up overdue", cta: "Follow up", level: 1 };
  if (moveIn < 0) return { reason: `Move-in was ${Math.abs(moveIn)}d ago — close or drop`, cta: "Act now", level: 1 };
  if (moveIn === 0) return { reason: "Move-in today — close right now", cta: "Close now", level: 1 };
  if (moveIn === 1) return { reason: "Move-in tomorrow — last chance", cta: "Close now", level: 2 };
  if (max && stale > max) return { reason: `Stuck in ${lead.stage.replace("-", " ")} for ${stale}d`, cta: "Act now", level: 2 };
  if (!lead.nextFollowUpAt) return { reason: "No next step planned", cta: "Plan next step", level: 3 };
  return { reason: `Next step ${format(new Date(lead.nextFollowUpAt), "MMM d, p")}`, cta: "Open", level: 3 };
}

const BUCKETS = [
  { key: "missed", label: "🚨 Missed", test: (d: number) => d < 0 },
  { key: "today", label: "🔥 Today", test: (d: number) => d === 0 },
  { key: "tomorrow", label: "⚡ Tomorrow", test: (d: number) => d === 1 },
  { key: "week", label: "📅 This week", test: (d: number) => d > 1 && d <= 7 },
  { key: "fortnight", label: "📆 8–14 days", test: (d: number) => d > 7 && d <= 14 },
  { key: "month", label: "🗓 15–30 days", test: (d: number) => d > 14 && d <= 30 },
  { key: "future", label: "🔭 30+ days", test: (d: number) => d > 30 },
];

function LeadMiniCard({ lead, onOpen, reason }: { lead: Lead; onOpen: (id: string) => void; reason?: ReturnType<typeof queueReason> }) {
  return (
    <button
      onClick={() => onOpen(lead.id)}
      className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{lead.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {lead.preferredArea} · ₹{(lead.budget / 1000).toFixed(0)}k · move-in {format(new Date(lead.moveInDate), "MMM d")}
          </div>
        </div>
        <IntentChip intent={lead.intent} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StageBadge stage={lead.stage} />
        <ConfidenceBar value={lead.confidence} />
      </div>
      {reason && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={cn(
            "truncate text-[11px]",
            reason.level === 1 ? "text-destructive" : reason.level === 2 ? "text-warning" : "text-muted-foreground",
          )}>
            {reason.reason}
          </span>
          <Badge variant={reason.level === 1 ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
            {reason.cta}
          </Badge>
        </div>
      )}
    </button>
  );
}

export function LeadStackQueue({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  const ranked = useMemo(
    () => leads.map((l) => ({ lead: l, reason: queueReason(l) }))
      .sort((a, b) => a.reason.level - b.reason.level || urgencyScore(b.lead) - urgencyScore(a.lead)),
    [leads],
  );
  const groups = [1, 2, 3].map((level) => ({
    level,
    label: level === 1 ? "Urgent — act now" : level === 2 ? "Today" : "Planned",
    items: ranked.filter((r) => r.reason.level === level),
  }));

  return (
    <div className="space-y-4">
      {groups.map((g) => g.items.length > 0 && (
        <section key={g.level} className="space-y-2">
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.level === 1 && <Flame className="h-3.5 w-3.5 text-destructive" />}
            {g.label} · {g.items.length}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map(({ lead, reason }) => (
              <LeadMiniCard key={lead.id} lead={lead} onOpen={onOpen} reason={reason} />
            ))}
          </div>
        </section>
      ))}
      {ranked.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Queue clear.
        </div>
      )}
    </div>
  );
}

export function LeadFocusStack({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  const ranked = useMemo(
    () => leads.map((l) => ({ lead: l, reason: queueReason(l) }))
      .sort((a, b) => a.reason.level - b.reason.level || urgencyScore(b.lead) - urgencyScore(a.lead)),
    [leads],
  );
  const [i, setI] = useState(0);
  const current = ranked[Math.min(i, ranked.length - 1)];
  if (!current) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
        Nothing in the stack.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Card {Math.min(i + 1, ranked.length)} of {ranked.length}</span>
        <span>Work top-down — one lead at a time</span>
      </div>
      <div className="relative">
        <div className="absolute inset-x-3 -bottom-2 h-4 rounded-b-lg border border-border bg-muted/40" />
        <div className="absolute inset-x-1.5 -bottom-1 h-4 rounded-b-lg border border-border bg-muted/60" />
        <div className="relative rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-display text-xl font-semibold">{current.lead.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {current.lead.phone} · {current.lead.preferredArea} · ₹{(current.lead.budget / 1000).toFixed(0)}k
              </div>
            </div>
            <IntentChip intent={current.lead.intent} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={current.lead.stage} />
            <Badge variant={current.reason.level === 1 ? "destructive" : "secondary"} className="text-[10px]">
              {current.reason.reason}
            </Badge>
          </div>
          <ConfidenceBar value={current.lead.confidence} />
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={() => onOpen(current.lead.id)}>
              <Phone className="mr-1.5 h-4 w-4" /> {current.reason.cta}
            </Button>
            <Button variant="outline" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setI((v) => Math.min(ranked.length - 1, v + 1))} disabled={i >= ranked.length - 1} aria-label="Skip">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LeadStageBoard({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {STAGE_ORDER.map((stage) => {
        const items = leads.filter((l) => l.stage === stage).sort((a, b) => urgencyScore(b) - urgencyScore(a));
        return (
          <div key={stage} className="w-64 shrink-0 space-y-2">
            <div className="flex items-center justify-between rounded-md bg-muted/60 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider capitalize">{stage.replace("-", " ")}</span>
              <span className="text-[11px] font-bold tabular-nums">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((l) => <LeadMiniCard key={l.id} lead={l} onOpen={onOpen} />)}
              {items.length === 0 && (
                <div className="rounded-md border border-dashed border-border py-6 text-center text-[11px] text-muted-foreground">
                  Empty
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LeadMoveInBuckets({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {BUCKETS.map((b) => {
        const items = leads
          .filter((l) => b.test(differenceInCalendarDays(new Date(l.moveInDate), new Date())))
          .sort((a, b2) => urgencyScore(b2) - urgencyScore(a));
        if (items.length === 0) return null;
        return (
          <section key={b.key} className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {b.label} · {items.length}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((l) => <LeadMiniCard key={l.id} lead={l} onOpen={onOpen} reason={queueReason(l)} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
