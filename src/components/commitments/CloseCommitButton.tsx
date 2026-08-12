import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Target, CheckCircle2, XCircle, History, AlertTriangle, IndianRupee } from "lucide-react";
import { HowButton } from "@/components/common/HowButton";
import { CLOSE_WINDOWS, WINDOW_BY_ID, TONE_STYLE, CHANGE_REASONS, CLOSE_BLOCKERS, type CloseWindowId } from "@/lib/commitments/windows";
import {
  useCommitments, openCommitmentFor, commitmentsFor, promiseClose, markKept, markBroken,
  hoursLeft, isExpired,
} from "@/lib/commitments/store";

interface Props {
  leadId: string;
  leadName: string;
  leadPhone?: string;
  actorName?: string;
  size?: "xs" | "sm";
  className?: string;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function countdown(h: number) {
  if (h < 0) return `${Math.abs(Math.round(h))}h overdue`;
  if (h < 1) return `${Math.round(h * 60)}m left`;
  if (h < 48) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

/**
 * "Definitely Close" — the promise button that must exist on every lead,
 * everywhere a lead is rendered. It captures a deadline, a blocker and a
 * confidence, and stores every change forever.
 */
export function CloseCommitButton({ leadId, leadName, leadPhone = "", actorName = "You", size = "xs", className }: Props) {
  const all = useCommitments();
  const live = openCommitmentFor(all, leadId);
  const history = useMemo(() => commitmentsFor(all, leadId), [all, leadId]);

  const [open, setOpen] = useState(false);
  const [windowId, setWindowId] = useState<CloseWindowId>(live?.windowId ?? "48h");
  const [customDate, setCustomDate] = useState("");
  const [blocker, setBlocker] = useState(live?.blocker ?? CLOSE_BLOCKERS[0]);
  const [confidence, setConfidence] = useState(live?.confidence ?? 80);
  const [note, setNote] = useState("");

  const def = WINDOW_BY_ID[windowId];
  const isChange = !!live;

  const submit = () => {
    if (windowId === "custom" && !customDate) {
      toast.error("Pick the exact date you will close this");
      return;
    }
    if (isChange && !note.trim()) {
      toast.error("Moving a promise needs a reason", { description: "The history is reviewed — say why the date changed." });
      return;
    }
    promiseClose({ leadId, leadName, leadPhone, windowId, customDate, blocker, confidence, note, by: actorName });
    toast.success(isChange ? `Promise moved — ${def.short}` : `Committed: ${leadName} closes in ${def.short}`, {
      description: isChange ? "Both dates are kept in the history." : `Blocker: ${blocker} · confidence ${confidence}%`,
    });
    setNote("");
    setOpen(false);
  };

  const left = live ? hoursLeft(live) : 0;
  const overdue = live ? isExpired(live) : false;

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant={live ? "outline" : "default"}
            size="sm"
            className={cn(
              "h-7 gap-1 rounded-full px-2 text-[11px] font-semibold",
              size === "xs" && "h-6 px-2 text-[10px]",
              live && TONE_STYLE[WINDOW_BY_ID[live.windowId]?.tone ?? "week"],
              overdue && "ring-1 ring-destructive",
            )}
          >
            <Target className="h-3 w-3" />
            {live ? `Closing ${WINDOW_BY_ID[live.windowId]?.short} · ${countdown(left)}` : "Definitely Close"}
          </Button>
        </DialogTrigger>

        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              {isChange ? "Move the close promise" : "Definitely Close"} — {leadName}
            </DialogTitle>
            <DialogDescription className="text-[11px] leading-relaxed">
              Say when this lead pays. Every promise and every change is stored with your name, so the daily
              review can ask: you said this closes today, why has it not?
            </DialogDescription>
          </DialogHeader>

          {live && (
            <div className="rounded-lg border border-border bg-muted/40 p-2 text-[11px]">
              <p className="font-medium">Current promise: {WINDOW_BY_ID[live.windowId]?.short} · due {fmt(live.dueAt)}</p>
              <p className="text-muted-foreground">
                Promised by {live.promisedBy} · blocker: {live.blocker} · moved {live.changeCount}×
              </p>
            </div>
          )}

          {/* Deadline keys */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Deadline key</p>
            <div className="grid gap-1.5">
              {CLOSE_WINDOWS.map((w) => (
                <div key={w.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setWindowId(w.id)}
                    className={cn(
                      "flex-1 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition",
                      windowId === w.id ? cn("border-primary", TONE_STYLE[w.tone]) : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="font-semibold">{w.label}</span>
                  </button>
                  <HowButton
                    title={w.label}
                    why={w.why}
                    howToExecute={w.howToExecute}
                    whatNotToDo={w.whatNotToDo}
                    problemsThatCanOccur={w.problemsThatCanOccur}
                    branches={w.branches}
                    doneWhen={w.doneWhen}
                    withText
                  />
                </div>
              ))}
            </div>
            {windowId === "custom" && (
              <Input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-8 text-[11px]"
              />
            )}
          </div>

          {/* Blocker */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                What is the only thing standing between this lead and money?
              </p>
              <HowButton
                title="Naming the blocker"
                why="A promise with no named blocker is a guess. The blocker is what the Control Tower helps you remove — price, family, funds, inventory. Without it nobody can help you close."
                howToExecute={[
                  "Pick the blocker the customer actually said, not the one you assume.",
                  "If it is 'nothing but payment', you should be promising 3h or 24h — not a week.",
                  "Write the customer's own words in the note underneath.",
                ]}
                whatNotToDo={["Do not pick 'comparing other options' as a lazy default.", "Do not leave a stale blocker after the customer resolves it."]}
                problemsThatCanOccur={["Wrong blocker means the wrong help arrives and the lead stalls.", "Blockers that never change signal the customer is not engaged."]}
                branches={[
                  { condition: "Blocker is family approval", then: "Get the decision maker on a call yourself inside 24h." },
                  { condition: "Blocker is funds", then: "Promise to the credit date and take a token now if allowed." },
                  { condition: "Blocker is inventory", then: "Confirm the room hold before you promise any window." },
                ]}
                doneWhen="The blocker on the lead matches what the customer said in the last conversation."
                withText
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {CLOSE_BLOCKERS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBlocker(b)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] transition",
                    blocker === b ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Confidence */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              How sure are you? — {confidence}%
            </p>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-[10px] text-muted-foreground">
              Below 70% this lead is a hope, not a forecast — the board will weight it down.
            </p>
          </div>

          {/* Note / reason */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {isChange ? "Why is the date moving? (required)" : "The plan in one line"}
            </p>
            {isChange && (
              <div className="flex flex-wrap gap-1">
                {CHANGE_REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => setNote(r)} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">
                    {r}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={isChange ? "Family call slipped to Sunday — re-promising to Monday 11am." : "Second visit Saturday 11am, then token the same evening."}
              className="text-[11px]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={submit} className="gap-1">
              <Target className="h-3.5 w-3.5" />
              {isChange ? "Move promise" : "Commit to close"}
            </Button>
            {live && (
              <>
                <Button
                  variant="outline"
                  className="gap-1 text-emerald-600"
                  onClick={() => { markKept(live.id, actorName); toast.success("Marked closed — booking credited"); setOpen(false); }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> It closed
                </Button>
                <Button
                  variant="outline"
                  className="gap-1 text-destructive"
                  onClick={() => {
                    markBroken(live.id, actorName, note.trim() || "Promise not honoured");
                    toast.warning("Promise marked broken", { description: "It will show in the daily review." });
                    setOpen(false);
                  }}
                >
                  <XCircle className="h-3.5 w-3.5" /> Did not close
                </Button>
              </>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="space-y-1 border-t border-border pt-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <History className="h-3 w-3" /> Promise history — nothing is ever deleted
              </p>
              {history.flatMap((c) =>
                c.history.map((e, i) => (
                  <p key={`${c.id}-${i}`} className="text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">{fmt(e.at)}</span> · {e.by} · {e.kind}
                    {e.dueAt && ` → due ${fmt(e.dueAt)}`}
                    {e.prevDueAt && ` (was ${fmt(e.prevDueAt)})`}
                    {(e.reason || e.note) && ` · ${e.reason ?? e.note}`}
                  </p>
                )),
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {live && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Promise detail"
              className={cn(
                "rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted",
                overdue && "border-destructive text-destructive",
              )}
            >
              {overdue ? <AlertTriangle className="h-3 w-3" /> : <IndianRupee className="h-3 w-3" />}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-1 text-[11px]">
            <p className="font-semibold">{live.leadName} · {WINDOW_BY_ID[live.windowId]?.short}</p>
            <p className="text-muted-foreground">Due {fmt(live.dueAt)} · {countdown(left)}</p>
            <p>Blocker: <span className="font-medium">{live.blocker}</span> · {live.confidence}% sure</p>
            {live.note && <p className="rounded bg-muted/60 p-1.5">{live.note}</p>}
            <p className="text-muted-foreground">Promised by {live.promisedBy} · moved {live.changeCount}×</p>
          </PopoverContent>
        </Popover>
      )}

      <HowButton
        title="Definitely Close — why this button exists"
        why="A CRM that cannot tell you which leads close today is a list, not a system. This button forces one honest sentence per lead: when the money lands. The Control Tower then works today's promised list, and the daily review compares what was promised against what happened."
        howToExecute={[
          "Use it on every lead you have actually spoken to — pick the window that matches reality.",
          "Name the blocker and the plan in one line; a promise without a blocker gets no help.",
          "Every morning, review your promises due today before you make any new calls.",
          "When reality moves, move the promise with a reason — never let it silently expire.",
          "Mark 'It closed' with the booking, or 'Did not close' with the truth, the same day.",
        ]}
        whatNotToDo={[
          "Do not promise a short window to look good on the board — accuracy is scored, volume is not.",
          "Do not leave expired promises open; an expired promise is a broken one until you say otherwise.",
          "Do not change the date without a reason — the history is read in the review.",
        ]}
        problemsThatCanOccur={[
          "Everyone picks 7d and today's forecast stays empty — the board flags this per person.",
          "Promises are made and never settled, so accuracy cannot be measured.",
          "The same lead is promised by two people — the board shows both and the manager decides.",
        ]}
        branches={[
          { condition: "You have not spoken to the lead yet", then: "Do not promise. Call first, then commit." },
          { condition: "The lead is decided and only payment is left", then: "Pick 3h and drive it to money the same session." },
          { condition: "The deadline passes with no close", then: "Settle it honestly today: kept, broken, or moved with a reason." },
        ]}
        doneWhen="Every lead you own has either a live promise with a date, or an honest reason it cannot have one."
        withText
      />
    </div>
  );
}
