import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { fmtDur } from "@/lib/workflow/engine";
import type { RoleGuarantee } from "@/lib/workflow/roles";
import { ShieldCheck, ShieldAlert, ShieldX, ArrowUpRight } from "lucide-react";

const STATE_STYLE = {
  sealed: "border-emerald-500/40 bg-emerald-500/5",
  strained: "border-amber-500/50 bg-amber-500/5",
  broken: "border-destructive/50 bg-destructive/5",
} as const;

const STATE_ICON = { sealed: ShieldCheck, strained: ShieldAlert, broken: ShieldX } as const;

/**
 * The guarantee, role by role. A role is only "kept" when every one of its own
 * five checks is at 100% — so nobody can pass by leaning on another team.
 */
export function RoleGuaranteeGrid({ roles, weakest, mounted }: { roles: RoleGuarantee[]; weakest: number; mounted: boolean }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Guarantee by role</h2>
          <p className="text-xs text-muted-foreground">
            The company score is the weakest role, not the average — every role must hold its own promise.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">All roles kept</div>
          <div className="text-2xl font-semibold tabular-nums">{mounted ? weakest : 0}%</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const Icon = STATE_ICON[r.state];
          return (
            <div key={r.role} className={cn("rounded-xl border-2 p-4 space-y-3", STATE_STYLE[r.state])}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="font-semibold text-sm">{r.meta.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{r.meta.promise}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-semibold tabular-nums">{mounted ? r.score : 0}%</div>
                  <div className="text-[10px] text-muted-foreground">{r.total} in queue</div>
                </div>
              </div>

              <div className="space-y-1">
                {r.parts.map((p) => (
                  <div key={p.label} className="flex items-center gap-2">
                    <span className="text-[11px] w-32 shrink-0 text-muted-foreground">{p.label}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", p.pct >= 95 ? "bg-emerald-500" : p.pct >= 80 ? "bg-amber-500" : "bg-destructive")}
                        style={{ width: `${mounted ? p.pct : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums w-10 text-right">{mounted ? Math.round(p.pct) : 0}%</span>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-muted-foreground">{r.headline}</div>

              {r.top.length > 0 && (
                <ul className="space-y-1">
                  {r.top.slice(0, 3).map((m) => (
                    <li key={m.lead.ulid} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium">{m.lead.name}</span>
                      <span className="truncate text-muted-foreground">{m.violations[0]?.label} · {fmtDur(m.ageMs)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-muted-foreground">
                  {r.people.length} person{r.people.length === 1 ? "" : "s"} · {r.p0} P0 · {r.breaches} promise breach{r.breaches === 1 ? "" : "es"}
                </span>
                <Link to="/tower/interventions" className="text-[11px] inline-flex items-center gap-1 text-primary">
                  Fix <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
