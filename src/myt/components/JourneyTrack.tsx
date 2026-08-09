import { JOURNEY, BLOCKERS, journeyDone, currentJourneyStep, journeyBlockers, journeyProgress } from '@/myt/lib/journey';
import type { Lead } from '@/myt/lib/types';
import { cn } from '@/lib/utils';

/**
 * Compact S1 → S8 journey rail. Shows exactly where the lead stands,
 * which micro-proofs are missing, and any NR / NU / NO blocker.
 */
export function JourneyTrack({ lead, className }: { lead: Lead; className?: string }) {
  const done = journeyDone(lead);
  const now = currentJourneyStep(lead);
  const blockers = journeyBlockers(lead);
  const prog = journeyProgress(lead);

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {JOURNEY.map((s) => {
          const isDone = done[s.id];
          const isNow = s.id === now.id && !isDone;
          return (
            <span
              key={s.id}
              title={`${s.code} · ${s.label} — ${s.why}`}
              className={cn(
                'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-colors',
                s.sub && 'text-[9px] px-1',
                isDone
                  ? 'border-role-tcm/40 bg-role-tcm/10 text-role-tcm'
                  : isNow
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-muted/40 text-muted-foreground',
              )}
            >
              {s.code}
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="font-semibold text-foreground">
          Now: {now.code} · {now.label}
        </span>
        <span className="text-muted-foreground">{prog.cleared}/{prog.total} gates</span>
        {blockers.map((b) => (
          <span
            key={b}
            title={BLOCKERS[b].why}
            className="rounded border border-destructive/40 bg-destructive/10 px-1 py-0.5 font-bold text-destructive"
          >
            {b} · {BLOCKERS[b].label}
          </span>
        ))}
      </div>
    </div>
  );
}
