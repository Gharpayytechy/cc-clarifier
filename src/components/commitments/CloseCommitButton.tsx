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
import { CLOSE_WINDOWS, WINDOW_BY_ID, TONE_STYLE, CLOSE_STEPS, type CloseWindowId } from "@/lib/commitments/windows";
import { NotClosedDialog } from "./NotClosedDialog";
import {
  useCommitments, openCommitmentFor, commitmentsFor, promiseClose, markKept,
  hoursLeft, isExpired, dueFromWindow,
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
  const [timeOfDay, setTimeOfDay] = useState("");
  const [steps, setSteps] = useState<string[]>(live?.steps ?? []);
  const [note, setNote] = useState("");

  const def = WINDOW_BY_ID[windowId];
  const isChange = !!live;
  const previewDue = dueFromWindow(windowId, customDate, timeOfDay);
  const stepOptions = useMemo(
    () => Array.from(new Set([...(def?.howToExecute ?? []).slice(0, 3), ...CLOSE_STEPS])),
    [def],
  );
  const toggleStep = (v: string) =>
    setSteps((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const submit = () => {
    if (windowId === "custom" && !customDate) {
      toast.error("Pick the exact date you will close this");
      return;
    }
    promiseClose({ leadId, leadName, leadPhone, windowId, customDate, timeOfDay, steps, note, by: actorName });
    toast.success(isChange ? `Promise moved — ${def.short}` : `Committed: ${leadName} closes ${fmt(previewDue)}`, {
      description: steps.length ? `${steps.length} step${steps.length === 1 ? "" : "s"} on your plan` : "No steps picked — add them when you know the plan.",
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
              Four things only: the time, the deadline, the steps you will take, and a note if you want one.
              Everything is stored with your name so the daily review can ask what happened.
            </DialogDescription>
          </DialogHeader>

          {live && (
            <div className="rounded-lg border border-border bg-muted/40 p-2 text-[11px]">
              <p className="font-medium">Current promise: {WINDOW_BY_ID[live.windowId]?.short} · due {fmt(live.dueAt)}</p>
              <p className="text-muted-foreground">Promised by {live.promisedBy} · moved {live.changeCount}×</p>
            </div>
          )}

          {/* 1 — Time */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">1 · Time</p>
              <HowButton
                title="Time — the hour the money moves"
                why="A date without an hour is not a plan. Naming the hour is what turns a promise into something you can actually be reminded about and held to."
                howToExecute={[
                  "Pick the hour the customer said they are free, not the hour that suits you.",
                  "Leave it blank only if the deadline window itself is the plan (e.g. within 3 hours).",
                ]}
                whatNotToDo={["Do not pick a time you know you are on another visit."]}
                doneWhen="The promise carries an exact hour you have blocked out."
                withText
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {["10:00", "12:00", "15:00", "18:00", "20:00"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimeOfDay(timeOfDay === t ? "" : t)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] transition",
                    timeOfDay === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t}
                </button>
              ))}
              <Input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="h-7 w-28 text-[11px]"
              />
            </div>
          </div>

          {/* 2 — Deadline */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">2 · Deadline</p>
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
            <p className="rounded-md border border-primary/30 bg-primary/5 p-1.5 text-[11px]">
              This promise falls due <span className="font-semibold">{fmt(previewDue)}</span>
            </p>
          </div>

          {/* 3 — Steps */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                3 · Steps you will take {steps.length > 0 && `(${steps.length})`}
              </p>
              <HowButton
                title="Steps — the plan, not the hope"
                why="Promises break because nobody wrote down the two or three moves that get to money. Ticking the steps makes the promise reviewable: the manager can ask which step is stuck instead of asking how it feels."
                howToExecute={[
                  "Tick only the steps you will genuinely do before the deadline.",
                  "Two or three steps is a plan; eight steps is a wish list.",
                  "If none of the steps fit, write the real move in the note.",
                ]}
                whatNotToDo={["Do not tick every box to look thorough.", "Do not tick a step that depends on someone who has not agreed to it."]}
                problemsThatCanOccur={["Steps get ticked and never executed — the review compares steps against the activity log."]}
                doneWhen="Every ticked step is either done or explained by the deadline."
                withText
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {stepOptions.map((sOpt) => (
                <button
                  key={sOpt}
                  type="button"
                  onClick={() => toggleStep(sOpt)}
                  className={cn(
                    "max-w-full truncate rounded-full border px-2 py-0.5 text-left text-[10px] transition",
                    steps.includes(sOpt) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {steps.includes(sOpt) ? "✓ " : ""}{sOpt}
                </button>
              ))}
            </div>
          </div>

          {/* 4 — Note (optional) */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              4 · Note <span className="normal-case font-normal">— optional</span>
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything worth knowing. Leave blank if there is nothing to add."
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
                <NotClosedDialog
                  commitmentId={live.id}
                  leadName={leadName}
                  actorName={actorName}
                  onDone={() => setOpen(false)}
                  trigger={
                    <Button variant="outline" className="gap-1 text-destructive">
                      <XCircle className="h-3.5 w-3.5" /> Did not close
                    </Button>
                  }
                />
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
            {live.steps?.length ? (
              <ul className="space-y-0.5">
                {live.steps.map((st) => (
                  <li key={st} className="text-foreground/90">• {st}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No steps picked yet.</p>
            )}
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
          "Set the time, the deadline and the two or three steps that get to money.",
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
