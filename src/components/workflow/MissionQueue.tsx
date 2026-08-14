import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HealthPill, SeverityChip, MotionLine, ProgressRow, EmptyQueue } from "./bits";
import { OutcomeDialog } from "./OutcomeDialog";
import { useWorkflowActions } from "./use-actions";
import { useWorkflowBoard } from "@/lib/workflow/use-board";
import { buildWaves, recoveryQueue, fmtDur, type LeadMotion } from "@/lib/workflow/engine";
import { useWorkflow } from "@/lib/workflow/store";

/**
 * §6/§7/§8 — the operator screen. One mission at a time, waves for the day,
 * a live projected EOD, and a recovery queue when the day is slipping.
 */
export function MissionQueue() {
  const { board, myFlow, verdict, currentUser, mounted } = useWorkflowBoard();
  const targets = useWorkflow((s) => s.targets["flow-ops"]);
  const a = useWorkflowActions();
  const [active, setActive] = useState<LeadMotion | null>(null);
  const [waveIdx, setWaveIdx] = useState(0);

  const queue = useMemo(
    () => board.filter((m) => m.ownerId === currentUser.id || !m.ownerId),
    [board, currentUser.id],
  );

  const waves = useMemo(
    () => buildWaves(queue, targets.waveSize, myFlow?.requiredActions ?? queue.length),
    [queue, targets.waveSize, myFlow?.requiredActions],
  );

  const recovery = useMemo(
    () => recoveryQueue(board, currentUser.id, Math.max(0, (myFlow?.requiredActions ?? 0) - (myFlow?.completedActions ?? 0))),
    [board, currentUser.id, myFlow?.requiredActions, myFlow?.completedActions],
  );

  const wave = waves[Math.min(waveIdx, Math.max(0, waves.length - 1))];
  const current = wave?.items[0] ?? queue[0] ?? null;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My work</h1>
        <p className="text-sm text-muted-foreground">
          Not a list to browse — a mission to finish. Do this next, then record what happens next.
        </p>
      </header>

      {/* Mission header + projected EOD */}
      {myFlow && (
        <section className="grid gap-3 md:grid-cols-2">
          <Card className="p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Today's mission</span>
              <span className="text-xs text-muted-foreground">{fmtDur(myFlow.remainingMs)} left</span>
            </div>
            <ProgressRow label="Actions completed" value={myFlow.completedActions} target={myFlow.requiredActions} />
            <ProgressRow label="Unique leads touched" value={myFlow.uniqueLeads} target={myFlow.requiredActions} />
            <ProgressRow label="Connected conversations" value={myFlow.connections} target={myFlow.targetConnections} />
          </Card>
          <Card className={cn("p-4 space-y-2",
            verdict?.status === "at-risk" && "border-destructive/40 bg-destructive/5",
            verdict?.status === "upstream-impossible" && "border-sky-500/40 bg-sky-500/5")}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Projected end of day</div>
            <div className="text-3xl font-semibold tabular-nums">
              {mounted ? myFlow.projectedEod : 0}
              <span className="text-sm text-muted-foreground"> / {myFlow.requiredActions}</span>
            </div>
            <p className="text-sm">{verdict?.line}</p>
            {myFlow.queueGap > 0 && (
              <p className="text-xs text-sky-600">
                Queue shortage: {myFlow.queueGap} actions short of the target. This is an upstream supply issue, not your pace.
              </p>
            )}
          </Card>
        </section>
      )}

      {/* Waves */}
      {waves.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Waves</h2>
          <div className="flex flex-wrap gap-2">
            {waves.map((w, i) => (
              <button key={w.label} type="button" onClick={() => setWaveIdx(i)}
                className={cn("rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                  i === waveIdx ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                <div className="font-medium">{w.label}</div>
                <div className="text-muted-foreground">{w.items.length} leads</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Current mission card */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Do this next</h2>
        {!current && mounted && (
          <EmptyQueue title="Queue is clear">
            No lead in your zone needs action right now. Control Tower can see this — an empty queue is a supply signal, not idleness.
          </EmptyQueue>
        )}
        {current && (
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{current.lead.name}</span>
                  <HealthPill health={current.health} />
                  {current.worst && <SeverityChip severity={current.worst} />}
                </div>
                <div className="text-sm">{current.action?.label ?? "Contact the customer"}</div>
                <MotionLine m={current} />
                <div className="text-xs text-muted-foreground">Why now: {current.reason}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!current.ownerId && <Button size="sm" variant="outline" onClick={() => a.assignToMe(current.lead.ulid)}>Claim</Button>}
                <Button size="sm" onClick={() => setActive(current)}>Record outcome</Button>
              </div>
            </div>
          </Card>
        )}
      </section>

      {/* Rest of the wave */}
      {wave && wave.items.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Rest of {wave.label.toLowerCase()}</h2>
          <div className="space-y-1.5">
            {wave.items.slice(1).map((m) => (
              <div key={m.lead.ulid} className="rounded-lg border p-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{m.lead.name}</div>
                  <div className="text-[11px] text-muted-foreground">{m.action?.label ?? "Contact"} · {m.reason}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setActive(m)}>Record outcome</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recovery queue */}
      {recovery.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Recovery queue</h2>
          <p className="text-xs text-muted-foreground">Highest-yield work to close the gap before end of day.</p>
          <div className="grid gap-2 md:grid-cols-3">
            {recovery.map((b) => (
              <Card key={b.bucket} className="p-3 space-y-1.5">
                <div className="text-xs font-semibold">{b.bucket}</div>
                {b.items.slice(0, 4).map((m) => (
                  <button key={m.lead.ulid} type="button" onClick={() => setActive(m)}
                    className="block w-full text-left text-[11px] text-muted-foreground hover:text-foreground">
                    {m.lead.name} · {m.action?.label ?? "Contact"}
                  </button>
                ))}
              </Card>
            ))}
          </div>
        </section>
      )}

      <OutcomeDialog motion={active} open={!!active} onOpenChange={(v) => !v && setActive(null)} />
    </div>
  );
}
