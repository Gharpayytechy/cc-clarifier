import { useCallback } from "react";
import { toast } from "sonner";
import { useIdentityStore } from "@/lib/lead-identity/store";
import { useWorkflow, type WorkRole } from "@/lib/workflow/store";
import type { ViolationCode } from "@/lib/workflow/engine";

/**
 * Direct actions available from Control Tower and every mission queue.
 * Each one closes the loop: record the outcome AND guarantee the next step.
 */
export function useWorkflowActions() {
  const store = useIdentityStore();
  const wf = useWorkflow();

  const me = store.currentUser;

  const call = useCallback((ulid: string, connected: boolean) => {
    wf.logAttempt(ulid, me.id, connected);
    store.recordContact(ulid, "call");
    if (connected) store.recordReply(ulid);
    toast.success(connected ? "Connected call logged" : "Attempt logged");
  }, [wf, store, me.id]);

  const assignToMe = useCallback((ulid: string) => {
    store.assignLead(ulid, me.id, me.name, "Control Tower intervention");
    toast.success(`Assigned to ${me.name}`);
  }, [store, me]);

  const reassign = useCallback((ulid: string, toId: string, toName: string, reason: string) => {
    store.assignLead(ulid, toId, toName, reason);
    wf.handoff({ ulid, fromRole: "system", fromUser: me.id, toRole: "flow-ops", toUser: toId, trigger: `Reassigned: ${reason}` });
    toast.success(`Reassigned to ${toName}`);
  }, [store, wf, me.id]);

  /** Mandatory next action (§18) — a callback window is always dated. */
  const scheduleFollowUp = useCallback((ulid: string, hours: number) => {
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    wf.setWaiting(ulid, until);
    store.logActivity(ulid, "note-added", `Next action scheduled in ${hours}h`);
    toast.success(`Follow-up due in ${hours}h`);
  }, [wf, store]);

  /** Automatic handoff to the tour queue (§16). */
  const scheduleTour = useCallback((ulid: string, whenIso: string, property?: string) => {
    store.bookTour(ulid, whenIso, property);
    wf.setWaiting(ulid, null);
    wf.handoff({ ulid, fromRole: "flow-ops", fromUser: me.id, toRole: "tour", toUser: null, trigger: "Tour scheduled" });
    toast.success("Tour scheduled — handed to Tour queue");
  }, [store, wf, me.id]);

  /** Tour completed → interest captured → closing queue (§17). */
  const completeTour = useCallback((ulid: string, interest: "HOT" | "WARM" | "COLD") => {
    store.markToured(ulid, interest);
    wf.handoff({ ulid, fromRole: "tour", fromUser: me.id, toRole: "closing", toUser: null, trigger: `Tour completed · interest ${interest}` });
    toast.success("Tour completed — handed to Closing queue");
  }, [store, wf, me.id]);

  const createQuote = useCallback((ulid: string, amount: number) => {
    wf.createQuote(ulid, amount);
    wf.setWaiting(ulid, new Date(Date.now() + 4 * 3_600_000).toISOString());
    store.logActivity(ulid, "note-added", `Quotation created ₹${amount.toLocaleString("en-IN")}`);
    toast.success("Quotation created — closing follow-up in 4h");
  }, [wf, store]);

  const markBlocked = useCallback((ulid: string, reason: string | null) => {
    wf.setBlocked(ulid, reason);
    toast.success(reason ? "Marked as supply dependency" : "Block cleared");
  }, [wf]);

  const escalate = useCallback((ulid: string, code: ViolationCode) => {
    wf.resolveViolation(ulid, code, me.id, "Escalated to manager");
    store.logActivity(ulid, "note-added", `Escalated: ${code}`);
    toast.success("Escalated");
  }, [wf, store, me.id]);

  const resolve = useCallback((ulid: string, code: ViolationCode, note: string) => {
    wf.resolveViolation(ulid, code, me.id, note);
    toast.success("Marked resolved");
  }, [wf, me.id]);

  const setTargets = useCallback((role: WorkRole, actions: number) => {
    wf.setTargets(role, { actions });
  }, [wf]);

  return { me, call, assignToMe, reassign, scheduleFollowUp, scheduleTour, completeTour, createQuote, markBlocked, escalate, resolve, setTargets };
}
