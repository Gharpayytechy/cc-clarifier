import { useMemo } from "react";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useMountedNow } from "@/hooks/use-now";
import { useWorkflow, type WorkRole } from "./store";
import {
  computeBoard, computeKpis, personFlow, checkpointVerdict,
  type LeadMotion, type MotionContext, type PersonFlow,
} from "./engine";

/**
 * One hook that every Workflow Guarantee screen consumes: the live motion
 * board, org KPIs, and per-person flow rows. SSR-safe (empty until mounted).
 */
export function useWorkflowBoard() {
  const leads = useIdentityStore((s) => s.leads);
  const currentUser = useIdentityStore((s) => s.currentUser);
  const quotes = useWorkflow((s) => s.quotes);
  const blocked = useWorkflow((s) => s.blocked);
  const waiting = useWorkflow((s) => s.waiting);
  const resolved = useWorkflow((s) => s.resolved);
  const attempts = useWorkflow((s) => s.attempts);
  const targets = useWorkflow((s) => s.targets);
  const [now, mounted] = useMountedNow(60_000);

  const ctx: MotionContext = useMemo(
    () => ({ now: now || 0, quotes, blocked, waiting, resolved }),
    [now, quotes, blocked, waiting, resolved],
  );

  const board = useMemo<LeadMotion[]>(
    () => (mounted ? computeBoard(leads, ctx) : []),
    [leads, ctx, mounted],
  );

  const people = useMemo<PersonFlow[]>(() => {
    if (!mounted) return [];
    const byOwner = new Map<string, { name: string }>();
    board.forEach((m) => {
      if (m.ownerId) byOwner.set(m.ownerId, { name: m.ownerName });
    });
    if (!byOwner.has(currentUser.id)) byOwner.set(currentUser.id, { name: currentUser.name });
    return [...byOwner.entries()].map(([userId, meta]) => {
      const role: WorkRole = "flow-ops";
      return personFlow({
        userId, name: meta.name, role, board, attempts, now,
        targets: targets[role],
      });
    }).sort((a, b) => (a.risk === b.risk ? b.requiredActions - a.requiredActions : a.risk === "critical" ? -1 : 1));
  }, [board, attempts, now, targets, mounted, currentUser]);

  const shortages = people.filter((p) => p.queueGap > 0).length;
  const eodRisks = people.filter((p) => p.pace === "behind").length;
  const kpis = useMemo(() => computeKpis(board, shortages, eodRisks), [board, shortages, eodRisks]);

  const myFlow = useMemo(() => {
    if (!mounted) return null;
    return personFlow({
      userId: currentUser.id, name: currentUser.name, role: "flow-ops",
      board, attempts, now, targets: targets["flow-ops"],
    });
  }, [board, attempts, now, targets, mounted, currentUser]);

  return {
    now, mounted, board, people, kpis, shortages, eodRisks, myFlow, currentUser,
    verdict: myFlow ? checkpointVerdict(myFlow) : null,
  };
}
