import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Clock, History, Target, TrendingUp, XCircle } from "lucide-react";
import { HowButton } from "@/components/common/HowButton";
import { WINDOW_BY_ID, TONE_STYLE } from "@/lib/commitments/windows";
import {
  useCommitments, boardStats, reliabilityByPerson, problemBreakdown, isDueToday, isExpired, hoursLeft,
  markKept, type CloseCommitment,
} from "@/lib/commitments/store";
import { NotClosedDialog } from "./NotClosedDialog";

type Bucket = "today" | "overdue" | "open" | "settled";

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function countdown(h: number) {
  if (h < 0) return `${Math.abs(Math.round(h))}h overdue`;
  if (h < 1) return `${Math.round(h * 60)}m left`;
  if (h < 48) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

/** The Closing Board — every promise the team made, and whether it survived contact with reality. */
export function ClosingBoard() {
  const all = useCommitments();
  const [bucket, setBucket] = useState<Bucket>("today");
  const now = Date.now();

  const stats = boardStats(all, now);
  const people = useMemo(() => reliabilityByPerson(all), [all]);
  const problems = useMemo(() => problemBreakdown(all), [all]);

  const list = useMemo(() => {
    const open = all.filter((c) => c.status === "open");
    const rows =
      bucket === "today" ? open.filter((c) => isDueToday(c, now))
      : bucket === "overdue" ? open.filter((c) => isExpired(c, now))
      : bucket === "open" ? open
      : all.filter((c) => c.status !== "open");
    return [...rows].sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  }, [all, bucket, now]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Stat label="Closing today" value={stats.today} icon={<Target className="h-3 w-3" />} tone="primary" />
        <Stat label="Overdue promises" value={stats.expired} icon={<AlertTriangle className="h-3 w-3" />} tone={stats.expired ? "danger" : "ok"} />
        <Stat label="Live promises" value={stats.open} icon={<Clock className="h-3 w-3" />} />
        <Stat label="Kept today" value={stats.keptToday} icon={<CheckCircle2 className="h-3 w-3" />} tone="ok" />
        <Stat label="Broken" value={stats.broken} icon={<XCircle className="h-3 w-3" />} tone={stats.broken ? "danger" : "ok"} />
        <Stat label="Promise accuracy" value={stats.accuracy === null ? "—" : `${stats.accuracy}%`} icon={<TrendingUp className="h-3 w-3" />} tone="primary" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["today", `Closing today (${stats.today})`],
            ["overdue", `Overdue (${stats.expired})`],
            ["open", `All live (${stats.open})`],
            ["settled", `Settled (${stats.kept + stats.broken})`],
          ] as [Bucket, string][]
        ).map(([v, label]) => (
          <Button key={v} size="sm" variant={bucket === v ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => setBucket(v)}>
            {label}
          </Button>
        ))}
        <HowButton
          withText
          className="ml-1"
          title="How to run the Closing Board"
          why="This board is the only honest forecast of money landing. It is built from promises a named person made on a named lead, not from stage guesses."
          howToExecute={[
            "Open 'Closing today' at the start of the shift and read every row out loud with the owner.",
            "For each row confirm the steps are still the right steps — if reality moved, move the deadline.",
            "Clear 'Overdue' before anything else: each one is either kept, broken, or re-promised with a written reason.",
            "At end of day mark every settled promise so accuracy stays truthful.",
          ]}
          whatNotToDo={[
            "Do not silently delete a promise — move it, keep it, or break it so the history stays intact.",
            "Do not let a promise move more than twice without a manager on the call.",
            "Do not count a promise as revenue before payment lands.",
          ]}
          problemsThatCanOccur={[
            "Closers promise short windows to look good, then move them — watch the move count.",
            "Empty board usually means nobody is promising, not that there is no pipeline.",
          ]}
          branches={[
            { condition: "A promise moved 3+ times", then: "Reassign or downgrade the lead — the closer has lost the customer." },
            { condition: "Accuracy under 60% for a person", then: "Restrict them to 48h+ windows until it recovers." },
            { condition: "Overdue with no note", then: "Treat as broken and log it in the daily review." },
          ]}
          doneWhen="Today's bucket is empty and every row was settled kept, broken, or re-promised with a reason."
        />
      </div>

      <div className="space-y-2">
        {list.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nothing in this bucket. Promises are made from the “Definitely Close” button on any lead.
          </Card>
        )}
        {list.map((c) => (
          <Row key={c.id} c={c} now={now} />
        ))}
      </div>

      {problems.length > 0 && (
        <Card className="p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <p className="text-xs font-semibold">Why promises broke</p>
            <HowButton
              title="The broken-promise reasons"
              why="This is the single most useful list on the floor: it tells you whether you are losing money to price, to inventory, to silence, or to your own follow-up. Fix the top reason and the accuracy number moves on its own."
              howToExecute={[
                "Read the top reason every morning and name one change that removes it this week.",
                "If 'I could not get to it in time' is top, the problem is capacity, not customers.",
                "If 'chose another property' is top, the problem is the pitch or the inventory.",
              ]}
              whatNotToDo={["Do not let people log the same vague reason forever without a fix."]}
              doneWhen="The top reason this week is different from the top reason last week."
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {problems.map((p) => (
              <Badge key={p.problem} variant="outline" className="text-[11px]">
                {p.problem} · <span className="ml-1 font-semibold tabular-nums">{p.count}</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-xs font-semibold">Promise accuracy by person</p>
          <HowButton
            title="Reading promise accuracy"
            why="Accuracy is kept ÷ settled. It tells you whose word can be put in front of the founder and whose cannot."
            howToExecute={[
              "Review weekly, never daily — one broken promise is noise.",
              "Read accuracy together with the move count: a high accuracy built on constantly moved dates is fake.",
              "Coach the lowest accuracy person on naming blockers, not on promising later.",
            ]}
            whatNotToDo={["Do not punish someone for promising short and missing once.", "Do not compare people with fewer than 5 settled promises."]}
            problemsThatCanOccur={["People stop promising at all to protect their number — watch for a falling promise count."]}
            branches={[{ condition: "Promised count drops week over week", then: "The person is hiding; ask for a promise on every hard-intent lead." }]}
            doneWhen="Every closer has at least one live promise and an accuracy above 70%."
          />
        </div>
        {people.length === 0 && <p className="text-[11px] text-muted-foreground">No promises recorded yet.</p>}
        <div className="space-y-1">
          {people.map((p) => (
            <div key={p.person} className="flex items-center gap-2 text-[11px]">
              <span className="w-32 truncate font-medium">{p.person}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", (p.accuracy ?? 0) >= 70 ? "bg-emerald-500" : "bg-destructive")}
                  style={{ width: `${p.accuracy ?? 0}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums">{p.accuracy === null ? "—" : `${p.accuracy}%`}</span>
              <span className="w-40 text-right text-muted-foreground">
                {p.promised} promised · {p.kept} kept · {p.broken} broken · {p.changes} moves
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({ c, now }: { c: CloseCommitment; now: number }) {
  const def = WINDOW_BY_ID[c.windowId];
  const left = hoursLeft(c, now);
  const overdue = isExpired(c, now);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <Card className={cn("p-3", overdue && "border-destructive/50 bg-destructive/5")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{c.leadName}</span>
            <Badge variant="outline" className={cn("text-[10px]", TONE_STYLE[def?.tone ?? "week"])}>
              {def?.short ?? c.windowId}
            </Badge>
            <span className={cn("text-[10px] font-medium", overdue ? "text-destructive" : "text-muted-foreground")}>
              {c.status === "open" ? countdown(left) : c.status}
            </span>
            {c.changeCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">moved {c.changeCount}×</Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            due {fmt(c.dueAt)} · {c.promisedBy}
          </p>
          {c.steps?.length > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">Steps: {c.steps.join(" · ")}</p>
          )}
          {c.problem && (
            <p className="mt-0.5 text-[11px] font-medium text-destructive">Did not close — {c.problem}</p>
          )}
          {c.note && <p className="mt-0.5 text-[11px] text-foreground/80">Plan: {c.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {c.status === "open" && (
            <>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-emerald-600" onClick={() => markKept(c.id, c.promisedBy)}>
                <CheckCircle2 className="h-3 w-3" /> It closed
              </Button>
              <NotClosedDialog commitmentId={c.id} leadName={c.leadName} actorName={c.promisedBy} />
            </>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => setShowHistory((v) => !v)}>
            <History className="h-3 w-3" /> History
          </Button>
        </div>
      </div>

      {showHistory && (
        <div className="mt-2 space-y-1 border-t border-border pt-2">
          {c.history.map((e, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{fmt(e.at)}</span> · {e.by} · {e.kind}
              {e.dueAt && ` → due ${fmt(e.dueAt)}`}
              {e.prevDueAt && ` (was ${fmt(e.prevDueAt)})`}
              {(e.reason || e.note) && ` · ${e.reason ?? e.note}`}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone?: "ok" | "danger" | "primary" }) {
  return (
    <Card className="p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
      <div
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums",
          tone === "ok" && "text-emerald-600",
          tone === "danger" && "text-destructive",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </div>
    </Card>
  );
}
