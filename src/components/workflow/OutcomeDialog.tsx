import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LeadMotion } from "@/lib/workflow/engine";
import { useWorkflowActions } from "./use-actions";

type NextKind = "schedule-tour" | "callback" | "quote" | "waiting" | "not-feasible";

const NEXT_OPTIONS: { id: NextKind; label: string; hint: string }[] = [
  { id: "schedule-tour", label: "Schedule tour", hint: "Hands the customer to the Tour queue instantly" },
  { id: "callback", label: "Callback", hint: "Dated callback — returns to your queue when due" },
  { id: "quote", label: "Create quotation", hint: "Moves the lead into the Closing queue" },
  { id: "waiting", label: "Waiting for customer", hint: "Must have an expiry — never a graveyard" },
  { id: "not-feasible", label: "Not feasible / blocked", hint: "Records a supply dependency, not an operator failure" },
];

/**
 * Mandatory next action (§18). An action cannot be finished without defining
 * what happens next — and every "waiting" state carries an expiry (§19).
 */
export function OutcomeDialog({
  motion, open, onOpenChange, onDone,
}: {
  motion: LeadMotion | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const a = useWorkflowActions();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [next, setNext] = useState<NextKind | null>(null);
  const [when, setWhen] = useState("");
  const [hours, setHours] = useState(2);
  const [amount, setAmount] = useState(18500);
  const [reason, setReason] = useState("");

  if (!motion) return null;
  const ulid = motion.lead.ulid;

  const reset = () => { setConnected(null); setNext(null); setWhen(""); setHours(2); setReason(""); };

  const canSave = connected !== null && next !== null
    && (next !== "schedule-tour" || !!when)
    && (next !== "not-feasible" || reason.trim().length > 2);

  const save = () => {
    a.call(ulid, connected === true);
    if (next === "schedule-tour") a.scheduleTour(ulid, new Date(when).toISOString(), motion.lead.propertyName);
    if (next === "callback" || next === "waiting") a.scheduleFollowUp(ulid, hours);
    if (next === "quote") a.createQuote(ulid, amount);
    if (next === "not-feasible") a.markBlocked(ulid, reason);
    reset();
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{motion.lead.name} — record outcome</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">1 · What happened</Label>
            <div className="flex gap-2">
              {[{ v: true, l: "Connected" }, { v: false, l: "Not connected" }].map((o) => (
                <Button key={o.l} type="button" size="sm"
                  variant={connected === o.v ? "default" : "outline"}
                  onClick={() => setConnected(o.v)}>{o.l}</Button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">2 · What happens next (required)</Label>
            <div className="grid gap-1.5">
              {NEXT_OPTIONS.map((o) => (
                <button key={o.id} type="button" onClick={() => setNext(o.id)}
                  className={cn("text-left rounded-lg border p-2 text-sm transition-colors",
                    next === o.id ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                  <div className="font-medium">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground">{o.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {next === "schedule-tour" && (
            <section className="space-y-1.5">
              <Label className="text-xs">Tour date & time</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </section>
          )}

          {(next === "callback" || next === "waiting") && (
            <section className="space-y-1.5">
              <Label className="text-xs">{next === "waiting" ? "Waiting until" : "Callback in"}</Label>
              <div className="flex flex-wrap gap-2">
                {[2, 6, 24, 48].map((h) => (
                  <Button key={h} type="button" size="sm" variant={hours === h ? "default" : "outline"} onClick={() => setHours(h)}>
                    {h === 24 ? "Tomorrow" : h === 48 ? "2 days" : `${h}h`}
                  </Button>
                ))}
              </div>
            </section>
          )}

          {next === "quote" && (
            <section className="space-y-1.5">
              <Label className="text-xs">Quotation amount (₹)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </section>
          )}

          {next === "not-feasible" && (
            <section className="space-y-1.5">
              <Label className="text-xs">Supply dependency</Label>
              <Input placeholder="e.g. Whitefield single sharing — no live inventory" value={reason} onChange={(e) => setReason(e.target.value)} />
            </section>
          )}
        </div>

        <DialogFooter>
          <Button disabled={!canSave} onClick={save}>Save &amp; complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
