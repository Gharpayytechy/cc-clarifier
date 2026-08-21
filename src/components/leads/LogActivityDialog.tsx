import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { Lead, LeadStage } from "@/lib/types";
import {
  ACTIVITY_CATEGORIES, type ActivityType, type NextStepOption, toneClasses,
} from "@/lib/lead-activity-catalog";

const STAGES: LeadStage[] = [
  "new", "contacted", "tour-scheduled", "tour-done", "negotiation", "booked", "dropped",
];

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function LogActivityDialog({
  lead, open, onOpenChange, onLogged, call,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLogged?: () => void;
  /** Which call in the C1–C5 ladder this activity closes out. */
  call?: number;
}) {
  const { logCall, sendMessage, addNote, setLeadStage, setLeadFollowUp } = useApp();

  const [categoryKey, setCategoryKey] = useState(ACTIVITY_CATEGORIES[0].key);
  const [type, setType] = useState<ActivityType | null>(null);
  const [nextStep, setNextStep] = useState<NextStepOption | null>(null);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<LeadStage>(lead.stage);
  const [dueAt, setDueAt] = useState("");

  const category = useMemo(
    () => ACTIVITY_CATEGORIES.find((c) => c.key === categoryKey) ?? ACTIVITY_CATEGORIES[0],
    [categoryKey],
  );

  useEffect(() => {
    if (!open) return;
    setCategoryKey(ACTIVITY_CATEGORIES[0].key);
    setType(null);
    setNextStep(null);
    setNote("");
    setStage(lead.stage);
    setDueAt("");
  }, [open, lead.id, lead.stage]);

  const pickType = (t: ActivityType) => {
    setType(t);
    setStage(t.stage ?? lead.stage);
    const first = t.nextSteps[0] ?? null;
    setNextStep(first);
    applyStepDate(first);
  };

  const applyStepDate = (step: NextStepOption | null) => {
    if (!step || step.inHours === 0) {
      setDueAt("");
      return;
    }
    setDueAt(toLocalInput(new Date(Date.now() + step.inHours * 3600_000)));
  };

  const pickStep = (step: NextStepOption) => {
    setNextStep(step);
    applyStepDate(step);
    if (step.stage) setStage(step.stage);
  };

  const save = () => {
    if (!type) {
      toast.error("Pick what happened first");
      return;
    }
    const tag = call ? `[C${call}] ` : "";
    const summary = `${tag}${type.emoji} ${type.label}${note.trim() ? ` — ${note.trim()}` : ""}`;

    if (type.channel === "call") logCall(lead.id);
    if (type.channel === "message") sendMessage(lead.id, summary);
    addNote(lead.id, summary);

    if (stage !== lead.stage) setLeadStage(lead.id, stage);

    if (dueAt) {
      setLeadFollowUp(
        lead.id,
        new Date(dueAt).toISOString(),
        nextStep?.priority ?? "medium",
        nextStep?.label ?? type.label,
      );
    }

    toast.success(`Logged: ${type.label}`, {
      description: dueAt
        ? `Next: ${nextStep?.label ?? "follow-up"} · ${format(new Date(dueAt), "MMM d, p")}`
        : "No follow-up scheduled",
    });
    onOpenChange(false);
    onLogged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            Log activity · {lead.name}
            {call ? <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">C{call}</span> : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {call ? `Closing out call C${call}. ` : ""}Pick what happened, then choose what happens next. Stage and the next follow-up are set for you.
          </DialogDescription>
        </DialogHeader>

        {/* 1 · category */}
        <Step n={1} title="Where did it happen?">
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => { setCategoryKey(c.key); setType(null); setNextStep(null); }}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  c.key === categoryKey
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/30",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Step>

        {/* 2 · outcome */}
        <Step n={2} title="What happened?">
          <div className="flex flex-wrap gap-1.5">
            {category.types.map((t) => (
              <button
                key={t.key}
                onClick={() => pickType(t)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  toneClasses(t.tone, type?.key === t.key),
                )}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </Step>

        {/* 3 · next step */}
        {type && (
          <>
            <Step n={3} title="What happens next?">
              <div className="space-y-1.5">
                {type.nextSteps.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => pickStep(s)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                      nextStep?.key === s.key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    {nextStep?.key === s.key
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">{s.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{s.effect}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Step>

            <Step n={4} title="Details">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={type.hint ?? "Exactly what was said, what was agreed, what blocked progress…"}
                className="resize-none text-sm"
              />
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Stage after</Label>
                  <Select value={stage} onValueChange={(v) => setStage(v as LeadStage)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s} value={s} className="text-sm capitalize">{s.replace("-", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Follow-up at</Label>
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </Step>
          </>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {type
              ? `${type.emoji} ${type.label} → ${stage.replace("-", " ")}${dueAt ? ` · follow-up ${format(new Date(dueAt), "MMM d, p")}` : " · no follow-up"}`
              : "Nothing selected yet"}
          </span>
          <Button onClick={save} disabled={!type}>Save activity</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{n}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}
